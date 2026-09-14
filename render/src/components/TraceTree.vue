<template>
  <div class="tt-root">
    <div
      ref="canvasEl"
      class="tt-canvas"
      @pointerdown="onPointerDown"
      @click.capture="onClickCapture"
    >
      <div class="tt-world" :style="worldStyle">
        <svg class="tt-edges" :width="layout.width" :height="layout.height">
          <defs>
            <marker
              v-for="(color, type) in TYPE_COLORS"
              :key="type"
              :id="'arrow-' + type"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" :fill="color" />
            </marker>
          </defs>
          <template v-for="(e, i) in edgeViews" :key="i">
            <path v-if="e.required" class="edge-glow" :d="e.d" :stroke="e.color" />
            <path
              class="edge"
              :class="{ sel: isEdgeSelected(e) }"
              :d="e.d"
              :stroke="e.color"
              :stroke-dasharray="e.dash || undefined"
              :stroke-linecap="e.type === 'indirect' ? 'round' : 'butt'"
              :marker-end="e.type ? `url(#arrow-${e.type})` : undefined"
            >
              <title>{{ e.label }}</title>
            </path>
          </template>
        </svg>

        <div
          v-for="n in layout.nodes"
          :key="n.key"
          class="node-card"
          :class="nodeClass(n)"
          :style="{ left: n.x + 'px', top: n.y + 'px' }"
          @click.stop="$emit('select', n.id)"
        >
          <div class="node-head">
            <span class="node-id mono" title="id: {{ n.id }}">#{{ n.id }}</span>
            <span class="node-name" :title="n.node.name">{{ n.node.name }}</span>
            <span v-if="layerOf(n.node)" class="chip layer" :class="layerOf(n.node)">
              {{ layerOf(n.node) === 'frontend' ? '前端' : '后端' }}
            </span>
          </div>
          <div class="node-summary" :title="n.node.oneLineSummary">
            {{ n.node.oneLineSummary }}
          </div>
          <div class="node-file">
            <span class="mono">{{ shortFile(n.node.filepath) }}</span>
            <span class="mono node-line">{{ n.node.line }}</span>
          </div>
          <button
            v-if="n.childCount"
            class="node-toggle"
            :title="n.expanded ? '收起' : '展开 ' + n.childCount + ' 个下游'"
            @click.stop="toggle(n)"
          >
            {{ n.expanded ? '−' : n.childCount }}
          </button>
        </div>
      </div>
    </div>

    <div class="tt-bar">
      <button @click="zoomAt(1.25)" title="放大">＋</button>
      <button @click="zoomAt(0.8)" title="缩小">－</button>
      <button @click="fitView" title="适配画布">适配</button>
      <span class="sep"></span>
      <button @click="expandAll">全部展开</button>
      <button @click="collapseAll">收起</button>
    </div>
    <div class="tt-hint">拖拽平移 · 滚轮缩放 · 点击节点查看详情</div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  buildLayout,
  layerOf,
  NODE_W,
  NODE_H,
  TYPE_COLORS,
  TYPE_LABELS
} from '../graph'

const props = defineProps({
  graph: { type: Object, default: null },
  selectedId: { type: String, default: null },
  query: { type: String, default: '' },
  hideNonRequired: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const canvasEl = ref(null)
const overrides = reactive({}) // 实例路径 -> 手动覆盖的展开状态
const mode = ref('default') // default: 深度<3 展开 | all | roots
const view = reactive({ x: 0, y: 0, k: 1 })
let movedFar = false
let drag = null

function isExpanded(key, depth) {
  if (key in overrides) return overrides[key]
  if (mode.value === 'all') return true
  if (mode.value === 'roots') return depth === 0
  return depth < 3
}

const layout = computed(() =>
  props.graph
    ? buildLayout(props.graph, isExpanded, props.hideNonRequired)
    : { nodes: [], edges: [], width: 0, height: 0 }
)

const edgeViews = computed(() =>
  layout.value.edges.map((e) => ({
    ...e,
    color: TYPE_COLORS[e.type] || '#8b949e',
    dash: e.type === 'return' ? '8 5' : e.type === 'indirect' ? '2 6' : null,
    label:
      `${TYPE_LABELS[e.type] || '关联'} · ${e.required ? '核心链路' : '非核心'} · ${e.count} 处调用`
  }))
)

const worldStyle = computed(() => ({
  width: layout.value.width + 'px',
  height: layout.value.height + 'px',
  transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
  transformOrigin: '0 0'
}))

/* ---------- 搜索高亮 ---------- */
const q = computed(() => (props.query || '').trim().toLowerCase())

function nodeMatches(n) {
  if (!q.value) return true
  const node = n.node
  return (
    (node.name || '').toLowerCase().includes(q.value) ||
    (node.oneLineSummary || '').toLowerCase().includes(q.value) ||
    (node.filepath || '').toLowerCase().includes(q.value)
  )
}

function nodeClass(n) {
  return {
    selected: n.id === props.selectedId,
    dim: !!q.value && !nodeMatches(n),
    match: !!q.value && nodeMatches(n)
  }
}

function isEdgeSelected(e) {
  return !!props.selectedId && (e.fromId === props.selectedId || e.toId === props.selectedId)
}

/* ---------- 折叠控制 ---------- */
function toggle(n) {
  overrides[n.key] = !n.expanded
}

function clearOverrides() {
  for (const k of Object.keys(overrides)) delete overrides[k]
}

function expandAll() {
  mode.value = 'all'
  clearOverrides()
}

function collapseAll() {
  mode.value = 'roots'
  clearOverrides()
}

/* ---------- 缩放 / 平移 ---------- */
function clampK(k) {
  return Math.min(2.5, Math.max(0.08, k))
}

function onWheel(e) {
  e.preventDefault()
  const el = canvasEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const k2 = clampK(view.k * Math.exp(-e.deltaY * 0.0015))
  view.x = mx - (mx - view.x) * (k2 / view.k)
  view.y = my - (my - view.y) * (k2 / view.k)
  view.k = k2
}

function zoomAt(factor) {
  const el = canvasEl.value
  if (!el) return
  const mx = el.clientWidth / 2
  const my = el.clientHeight / 2
  const k2 = clampK(view.k * factor)
  view.x = mx - (mx - view.x) * (k2 / view.k)
  view.y = my - (my - view.y) * (k2 / view.k)
  view.k = k2
}

function fitView() {
  const el = canvasEl.value
  if (!el) return
  const { width, height } = layout.value
  if (!width || !height) return
  const k = clampK(Math.min(el.clientWidth / width, el.clientHeight / height, 1))
  view.k = k
  view.x = (el.clientWidth - width * k) / 2
  view.y = (el.clientHeight - height * k) / 2
}

function onPointerDown(e) {
  if (e.button !== 0) return
  drag = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.sx
  const dy = e.clientY - drag.sy
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
  if (drag.moved) {
    view.x = drag.ox + dx
    view.y = drag.oy + dy
    movedFar = true
  }
}

function onPointerUp() {
  if (!drag) return
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onClickCapture(e) {
  if (movedFar) {
    e.stopPropagation()
    e.preventDefault()
    movedFar = false
  }
}

/* ---------- 定位到指定函数 ---------- */
function reveal(id) {
  if (!props.graph) return
  const target = String(id)
  const { childrenMap, roots } = props.graph

  const visited = new Set(roots.map(String))
  const queue = roots.map((r) => ({ id: String(r), path: [String(r)] }))
  let found = null
  while (queue.length) {
    const cur = queue.shift()
    if (cur.id === target) {
      found = cur.path
      break
    }
    for (const e of childrenMap.get(cur.id) || []) {
      const t = String(e.to)
      if (visited.has(t)) continue
      visited.add(t)
      queue.push({ id: t, path: [...cur.path, t] })
    }
  }
  if (!found) return

  let key = ''
  for (const seg of found) {
    key = key ? key + '/' + seg : seg
    overrides[key] = true
  }

  nextTick(() => {
    const n = layout.value.nodes.find((x) => x.id === target)
    const el = canvasEl.value
    if (n && el) {
      view.k = Math.max(view.k, 0.7)
      view.x = el.clientWidth / 2 - (n.x + NODE_W / 2) * view.k
      view.y = el.clientHeight / 2 - (n.y + NODE_H / 2) * view.k
    }
  })
}

/* ---------- 工具 ---------- */
function shortFile(fp) {
  if (!fp) return ''
  const parts = String(fp).split('/')
  return parts.slice(-2).join('/')
}

watch(
  () => props.graph,
  async (g) => {
    if (g) {
      await nextTick()
      fitView()
    }
  }
)

onMounted(() => {
  canvasEl.value.addEventListener('wheel', onWheel, { passive: false })
})

onBeforeUnmount(() => {
  canvasEl.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})

defineExpose({ reveal, fitView })
</script>

<style scoped>
.tt-root {
  position: relative;
  width: 100%;
  height: 100%;
}

.tt-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(88, 166, 255, 0.04), transparent 60%),
    var(--bg);
  touch-action: none;
  user-select: none;
}

.tt-canvas:active {
  cursor: grabbing;
}

.tt-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.tt-edges {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
}

.edge {
  fill: none;
  stroke-width: 1.8;
  pointer-events: visibleStroke;
  transition: stroke-width 0.15s;
}

.edge:hover {
  stroke-width: 3.5;
}

.edge.sel {
  stroke-width: 3.2;
  filter: drop-shadow(0 0 3px rgba(230, 237, 243, 0.35));
}

.edge-glow {
  fill: none;
  stroke-width: 10;
  opacity: 0.14;
  pointer-events: none;
}

/* ---------- 节点卡片（宽高需与 graph.js 常量一致：300 x 92） ---------- */
.node-card {
  position: absolute;
  width: 300px;
  height: 92px;
  padding: 10px 14px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: linear-gradient(180deg, #1a2029, #141922);
  box-shadow: 0 2px 8px rgba(1, 4, 9, 0.5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
}

.node-card:hover {
  border-color: #484f58;
}

.node-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.18), 0 4px 14px rgba(1, 4, 9, 0.6);
}

.node-card.match {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(227, 179, 65, 0.15);
}

.node-card.dim {
  opacity: 0.3;
  filter: saturate(0.4);
}

.node-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.node-id {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-faint);
  background: #21262d;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 6px;
}

.node-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.node-card .chip {
  flex-shrink: 0;
  padding: 2px 7px;
}

.node-summary {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.node-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-faint);
  overflow: hidden;
}

.node-file .mono:first-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-line {
  flex-shrink: 0;
}

.node-toggle {
  position: absolute;
  right: -13px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #21262d;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.15s;
  z-index: 2;
}

.node-toggle:hover {
  background: #2d333b;
  color: var(--text);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

/* ---------- 工具条 ---------- */
.tt-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(22, 27, 34, 0.9);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border);
  border-radius: 10px;
  z-index: 10;
}

.tt-bar button {
  border: none;
  background: none;
  color: var(--text-dim);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: 0.15s;
}

.tt-bar button:hover {
  background: #2d333b;
  color: var(--text);
}

.tt-bar .sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}

.tt-hint {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-size: 11px;
  color: var(--text-faint);
  background: rgba(22, 27, 34, 0.85);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 5px 10px;
  z-index: 10;
  pointer-events: none;
}
</style>
