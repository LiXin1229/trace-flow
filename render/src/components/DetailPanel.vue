<template>
  <aside class="panel" :style="{ width: width + 'px' }">
    <div class="resize-handle" @mousedown="startDrag" @dblclick="resetWidth" title="拖动调整宽度（双击重置）"></div>
    <template v-if="node">
      <div class="panel-body">
        <div class="source-pane" :class="{ collapsed: !showSource }">
          <div class="source-head" :class="{ collapsed: !showSource }">
            <template v-if="showSource">
              <span class="src-label">源码</span>
              <span v-if="source" class="mono src-range">
                L{{ source.start }}–L{{ source.end }} · {{ source.lineCount }} 行
              </span>
              <span v-else-if="srcLoading" class="src-state-text">加载中…</span>
              <span v-else class="src-state-text err">源码不可用</span>
            </template>
            <button
              class="pane-toggle"
              :title="showSource ? '隐藏源码面板' : '显示源码面板'"
              @click="showSource = !showSource"
            >
              <span v-if="showSource">×</span><span v-else>源码</span>
            </button>
          </div>
          <div v-show="showSource" class="source-scroll" @wheel="onWheel">
            <div v-if="srcError" class="src-error">{{ srcError }}</div>
            <div v-else-if="source" class="source mono" :style="{ fontSize: codeFontSize + 'px' }">
              <div
                v-for="(lineHtml, i) in highlightedLines"
                :key="i"
                class="src-line"
                :class="{ hot: isHotLine(source.start + i) }"
              >
                <span class="ln">{{ source.start + i }}</span><span class="marks">
                  <span v-for="m in markersFor(source.start + i)" :key="m" class="mark">{{ m }}</span>
                </span><span class="lc" v-html="lineHtml || ' '"></span>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-pane" :class="{ collapsed: !showDetail }">
          <div class="panel-head" :class="{ collapsed: !showDetail }">
            <div class="panel-title-row">
              <template v-if="showDetail">
                <h2 class="panel-title mono" :title="node.name">{{ node.name }}</h2>
                <span v-if="layer" class="chip layer" :class="layer">
                  {{ layer === 'frontend' ? '前端' : '后端' }}
                </span>
              </template>
              <button
                class="pane-toggle"
                :title="showDetail ? '隐藏详情面板' : '显示详情面板'"
                @click="showDetail = !showDetail"
              >
                <span v-if="showDetail">×</span><span v-else>详情</span>
              </button>
            </div>
            <div
              v-if="showDetail"
              class="panel-file mono"
              :class="{ copied }"
              :title="`点击复制：${fileRef}`"
              @click="copyFileRef"
            >
              {{ node.filepath }} <span class="line">{{ node.line }}</span>
              <span v-if="copied" class="copied-tip">已复制</span>
            </div>
          </div>

          <div v-show="showDetail" class="detail-body">
            <p class="summary">{{ node.oneLineSummary }}</p>

            <div v-if="callers.length" class="callers">
              <span class="label">调用方</span>
              <button
                v-for="c in callers"
                :key="c.id"
                class="caller-btn"
                @click="$emit('jump', c.id)"
              >
                {{ c.name }}
              </button>
            </div>

            <div class="section-title">
              代码片段意图
              <span class="count">{{ intents.length }}</span>
            </div>

            <ul class="intents">
              <li v-for="(s, i) in intents" :key="i" class="intent">
                <div class="intent-head">
                  <span class="idx">{{ i + 1 }}</span>
                  <span class="mono line-ref">{{ s.line }}</span>
                </div>
                <div class="intent-content">{{ s.content }}</div>
                <div class="intent-assoc">
                  <template v-if="assocName(s.associatedId)">
                    <button
                      class="assoc-btn mono"
                      @click="$emit('jump', String(s.associatedId))"
                      title="在树中定位"
                    >
                      → {{ assocName(s.associatedId) }}
                    </button>
                    <span
                      v-if="s.associatedType"
                      class="chip"
                      :class="'t-' + s.associatedType"
                    >
                      {{ typeLabel(s.associatedType) }}
                    </span>
                    <span v-if="s.associatedRequired" class="chip req">核心</span>
                    <span v-else class="chip minor">非核心</span>
                  </template>
                  <span v-else class="none">无关联函数</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty">
      <div class="empty-icon">⌘</div>
      <p>点击左侧树节点<br />查看函数详情与代码片段意图</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { layerOf, TYPE_LABELS } from '../graph'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import 'highlight.js/styles/atom-one-dark.css'

for (const [name, lang] of Object.entries({
  javascript,
  typescript,
  python,
  xml,
  css,
  json,
  sql,
  bash
})) {
  hljs.registerLanguage(name, lang)
}

/** 按扩展名映射 highlight.js 语言 */
const HIGHLIGHT_EXTS = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  vue: 'xml',
  css: 'css',
  json: 'json',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash'
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 把 highlight.js 输出的整段 HTML 按行拆开（跨行 span 在行尾闭合、行首重开），
 * 保证每行是独立合法的 HTML，可与行号逐行渲染。
 */
function splitHighlightedLines(html) {
  const lines = []
  const stack = []
  let current = ''
  let i = 0
  while (i < html.length) {
    const ch = html[i]
    if (ch === '<') {
      const end = html.indexOf('>', i)
      const tag = html.slice(i, end + 1)
      if (tag.startsWith('</')) stack.pop()
      else if (!tag.endsWith('/>')) stack.push(tag)
      current += tag
      i = end + 1
    } else if (ch === '\n') {
      current += stack.map(() => '</span>').join('')
      lines.push(current)
      current = stack.join('')
      i++
    } else {
      current += ch
      i++
    }
  }
  if (current) lines.push(current + stack.map(() => '</span>').join(''))
  return lines
}

const props = defineProps({
  node: { type: Object, default: null },
  graph: { type: Object, default: null },
  hideNonRequired: { type: Boolean, default: false },
  jsonFile: { type: String, default: '' }
})

defineEmits(['jump'])

const DEFAULT_WIDTH = 760
const MIN_WIDTH = 480
const MAX_WIDTH_RATIO = 0.7

const width = ref(DEFAULT_WIDTH)
const dragging = ref(false)
const showSource = ref(true)
const showDetail = ref(true)

// ---------- 代码字体缩放（鼠标悬浮源码区域时 Ctrl/Cmd + 滚轮） ----------
const CODE_FONT_DEFAULT = 13
const CODE_FONT_MIN = 8
const CODE_FONT_MAX = 24
const CODE_FONT_STEP = 1
const codeFontSize = ref(CODE_FONT_DEFAULT)

function onWheel(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -CODE_FONT_STEP : e.deltaY < 0 ? CODE_FONT_STEP : 0
  codeFontSize.value = Math.min(
    CODE_FONT_MAX,
    Math.max(CODE_FONT_MIN, codeFontSize.value + delta)
  )
}

function clampWidth(w) {
  const max = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * MAX_WIDTH_RATIO))
  return Math.min(Math.max(w, MIN_WIDTH), max)
}

function startDrag(e) {
  e.preventDefault()
  dragging.value = true
  const startX = e.clientX
  const startWidth = width.value
  document.body.classList.add('panel-resizing')

  const onMove = (ev) => {
    width.value = clampWidth(startWidth + (startX - ev.clientX))
  }
  const onUp = () => {
    dragging.value = false
    document.body.classList.remove('panel-resizing')
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function resetWidth() {
  width.value = DEFAULT_WIDTH
}

onBeforeUnmount(() => {
  document.body.classList.remove('panel-resizing')
  clearTimeout(copyTimer)
})

const layer = computed(() => layerOf(props.node))

const intents = computed(() => {
  if (!props.node || !Array.isArray(props.node.snippetIntents)) return []
  const all = props.node.snippetIntents
  if (!props.hideNonRequired) return all
  // 与树图联动：隐藏非核心节点时，仅保留 associatedRequired 为 true 的核心意图
  return all.filter((s) => s.associatedRequired)
})

const callers = computed(() => {
  if (!props.node || !props.graph) return []
  const ids = props.graph.callersMap.get(String(props.node.id)) || []
  const seen = new Set()
  const out = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const n = props.graph.nodesById.get(id)
    if (n) out.push({ id, name: n.name })
  }
  return out
})

function assocName(id) {
  if (id == null || !props.graph) return null
  const n = props.graph.nodesById.get(String(id))
  return n ? n.name : null
}

function typeLabel(t) {
  return TYPE_LABELS[t] || t
}

/** 可复制的文件引用，如 "homework-grading-backend/app/services/homework_service.py #195" */
const fileRef = computed(() => {
  if (!props.node) return ''
  const r = parseRange(props.node.line)
  const line = r ? r.start : String(props.node.line || '').replace(/^#?L?/, '')
  const path = props.node.filepath || ''
  return line ? `${path} #${line}`.trim() : path
})

const copied = ref(false)
let copyTimer = null

async function copyFileRef() {
  const text = fileRef.value
  if (!text) return
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch (e) {
    console.error('复制文件引用失败', e)
  }
}

// ---------- 源码获取（经 Vite dev-server 的 /api/source 调用 getSourceById） ----------
const source = ref(null)
const srcLoading = ref(false)
const srcError = ref('')
const sourceCache = new Map()

watch(
  () => [props.jsonFile, props.node ? String(props.node.id) : null],
  async ([file, id], [prevFile, prevId]) => {
    if (file === prevFile && id === prevId) return
    source.value = null
    srcError.value = ''
    if (id == null) return
    const cacheKey = (file || '__local__') + '::' + id
    if (sourceCache.has(cacheKey)) {
      source.value = sourceCache.get(cacheKey)
      return
    }
    srcLoading.value = true
    try {
      const params = new URLSearchParams({ id })
      if (file) params.set('file', file)
      const res = await fetch(`/api/source?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      sourceCache.set(cacheKey, data)
      source.value = data
    } catch (e) {
      srcError.value = e.message || String(e)
    } finally {
      srcLoading.value = false
    }
  },
  { immediate: true }
)

const highlightLang = computed(() => {
  const p = (props.node && props.node.filepath) || ''
  const ext = p.includes('.') ? p.split('.').pop().toLowerCase() : ''
  return HIGHLIGHT_EXTS[ext] || null
})

/** 源码按行做语法高亮（按扩展名选语言，未识别扩展名退化为纯文本） */
const highlightedLines = computed(() => {
  if (!source.value) return []
  const lang = highlightLang.value
  let html
  try {
    html = lang
      ? hljs.highlight(source.value.code, { language: lang }).value
      : escapeHtml(source.value.code)
  } catch {
    html = escapeHtml(source.value.code)
  }
  return splitHighlightedLines(html)
})

/** 解析 "#L239-L295" / "#L102" 格式行号 */
function parseRange(line) {
  const m = /^#?L(\d+)(?:\s*-\s*#?L?(\d+))?$/.exec(String(line || '').trim())
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

/** 片段起始行 -> 片段序号列表（仅在片段第一行展示序号，与「代码片段意图」的 idx+1 一致） */
const lineMarkers = computed(() => {
  const map = new Map()
  intents.value.forEach((s, idx) => {
    const r = parseRange(s.line)
    if (!r) return
    if (!map.has(r.start)) map.set(r.start, [])
    map.get(r.start).push(idx + 1)
  })
  return map
})

/** snippetIntents 覆盖到的全部行集合，用于源码高亮 */
const hotLines = computed(() => {
  const set = new Set()
  for (const s of intents.value) {
    const r = parseRange(s.line)
    if (!r) continue
    for (let i = r.start; i <= r.end; i++) set.add(i)
  }
  return set
})

function markersFor(n) {
  return lineMarkers.value.get(n) || []
}

function isHotLine(n) {
  return hotLines.value.has(n)
}
</script>

<style scoped>
.panel {
  position: relative;
  width: 380px;
  min-width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.resize-handle {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 10;
}

.resize-handle:hover,
.resize-handle:active {
  background: rgba(88, 166, 255, 0.25);
}

.panel-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ---------- 左侧源码列 ---------- */
.source-pane {
  flex: 1 1 55%;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-soft);
  overflow: hidden;
  transition: flex 0.2s ease, min-width 0.2s ease;
}

.source-pane.collapsed {
  flex: 0 0 auto;
  min-width: 0;
}

.source-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

.source-head.collapsed {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border-soft);
}

.source-head .pane-toggle {
  margin-left: auto;
  flex-shrink: 0;
}

.source-head.collapsed .pane-toggle {
  margin-left: 0;
}

.pane-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: 0.15s;
}

.pane-toggle:hover {
  color: var(--text);
  border-color: var(--accent);
  background: rgba(88, 166, 255, 0.08);
}

.src-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.src-range {
  font-size: 11px;
  color: var(--accent);
  white-space: nowrap;
}

.src-state-text {
  font-size: 11px;
  color: var(--text-faint);
}

.src-state-text.err {
  color: #f85149;
}

.source-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.src-error {
  margin: 14px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #f85149;
  background: rgba(248, 81, 73, 0.08);
  border: 1px solid rgba(248, 81, 73, 0.35);
  border-radius: 8px;
  word-break: break-all;
}

.source {
  padding: 6px 0 20px;
  font-size: 11.5px;
  line-height: 1.65;
}

.src-line {
  display: flex;
  align-items: flex-start;
}

.src-line .ln {
  width: 48px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
  color: var(--text-faint);
  user-select: none;
  font-size: 10.5px;
  line-height: inherit;
}

/* 片段序号标记列：序号与右侧「代码片段意图」列表的 idx+1 一致 */
.src-line .marks {
  width: 34px;
  flex-shrink: 0;
  display: inline-flex;
  gap: 2px;
  align-items: center;
  line-height: inherit;
}

.src-line .mark {
  min-width: 14px;
  height: 15px;
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(88, 166, 255, 0.18);
  border: 1px solid rgba(88, 166, 255, 0.45);
  color: var(--accent);
  font-size: 9.5px;
  line-height: 13px;
  text-align: center;
}

.src-line .lc {
  flex: 1;
  white-space: pre;
  color: var(--text);
  min-width: 0;
}

.src-line.hot .lc {
  background: rgba(37, 67, 102, 0.1);
  box-shadow: inset 2px 0 0 var(--accent);
  padding-left: 8px;
}

.src-line.hot .ln {
  color: var(--accent);
}

/* ---------- 右侧详情列 ---------- */
.detail-pane {
  flex: 1 1 45%;
  min-width: 280px;
  overflow-y: auto;
  padding: 20px;
  transition: flex 0.2s ease, min-width 0.2s ease, padding 0.2s ease;
}

.detail-pane.collapsed {
  flex: 0 0 auto;
  min-width: 0;
  padding: 0;
}

.panel-head {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}

.panel-head.collapsed {
  padding: 12px 8px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title-row .pane-toggle {
  margin-left: auto;
  flex-shrink: 0;
}

.panel-head.collapsed .pane-toggle {
  margin-left: 0;
}

.panel-title {
  font-size: 17px;
  font-weight: 600;
  word-break: break-all;
  line-height: 1.4;
}

.panel-file {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-dim);
  word-break: break-all;
  line-height: 1.5;
  cursor: pointer;
  border-radius: 6px;
  padding: 3px 6px;
  margin-left: -6px;
  transition: 0.15s;
}

.panel-file:hover {
  background: rgba(88, 166, 255, 0.08);
  color: var(--text);
}

.panel-file:hover .line {
  text-decoration: underline;
}

.panel-file .copied-tip {
  margin-left: 8px;
  padding: 1px 7px;
  font-size: 10.5px;
  color: #3fb950;
  background: rgba(63, 185, 80, 0.12);
  border: 1px solid rgba(63, 185, 80, 0.4);
  border-radius: 999px;
  white-space: nowrap;
}

.panel-file .line {
  color: var(--accent);
  margin-left: 6px;
  white-space: nowrap;
}

.summary {
  margin: 14px 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text);
  background: rgba(88, 166, 255, 0.06);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
}

.callers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
}

.callers .label {
  font-size: 12px;
  color: var(--text-faint);
}

.caller-btn {
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: var(--accent);
  background: rgba(88, 166, 255, 0.08);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
  transition: 0.15s;
}

.caller-btn:hover {
  background: rgba(88, 166, 255, 0.18);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.section-title .count {
  background: #21262d;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--text);
}

.intents {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intent {
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 12px;
}

.intent-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.intent-head .idx {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #21262d;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.intent-head .line-ref {
  font-size: 11px;
  color: var(--text-faint);
}

.intent-content {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
  margin-bottom: 10px;
}

.intent-assoc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.assoc-btn {
  font-size: 11.5px;
  color: var(--accent);
  background: none;
  border: 1px dashed rgba(88, 166, 255, 0.4);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  transition: 0.15s;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assoc-btn:hover {
  background: rgba(88, 166, 255, 0.1);
  border-style: solid;
}

.intent-assoc .none {
  font-size: 11px;
  color: var(--text-faint);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-faint);
  font-size: 13px;
  text-align: center;
  line-height: 1.8;
}

.empty-icon {
  font-size: 28px;
  opacity: 0.4;
}
</style>

<style>
body.panel-resizing {
  cursor: col-resize;
  user-select: none;
}
</style>
