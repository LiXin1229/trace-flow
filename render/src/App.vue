<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">TF</span>
        <div class="brand-text">
          <strong>TraceFlow</strong>
          <span>代码调用链可视化</span>
        </div>
      </div>

      <div class="search">
        <span class="icon">⌕</span>
        <input v-model="query" placeholder="搜索函数名 / 摘要 / 文件路径" />
        <span v-if="query" class="hit">{{ matchCount }} 个匹配</span>
      </div>

      <div class="legend">
        <span class="lg"><i class="sw call"></i>call 调用</span>
        <span class="lg"><i class="sw return"></i>return 返回值</span>
        <span class="lg"><i class="sw indirect"></i>indirect 间接</span>
        <!-- <span class="lg"><i class="sw req"></i>核心链路</span> -->
      </div>

      <div v-if="graph" class="stats">
        {{ graph.nodeCount }} 个函数 · {{ graph.edgeCount }} 条调用关系
      </div>

      <div class="file-picker">
        <select
          class="file-select"
          v-model="currentFile"
          @change="onPickFile"
          title="选择 data 目录中的 JSON 文件"
        >
          <option value="" disabled>选择数据文件…</option>
          <option v-for="f in dataFiles" :key="f.name" :value="f.name">{{ f.name }}</option>
        </select>
      </div>

      <button
        class="btn-load toggle"
        :class="{ active: hideNonRequired }"
        :title="hideNonRequired ? '当前仅显示关键代码，点击显示全部节点' : '当前显示全部节点，点击仅显示关键代码'"
        @click="hideNonRequired = !hideNonRequired"
      >
        {{ hideNonRequired ? '仅显示关键代码' : '显示全部代码' }}
      </button>

      <button
        class="btn-load"
        :title="panelButtonTitle"
        @click="cyclePanelState"
      >
        {{ panelButtonLabel }}
      </button>

      <label class="btn-load">
        加载 JSON
        <input type="file" accept="application/json,.json" hidden @change="onFile" />
      </label>
    </header>

    <main class="main" :class="{ 'main-bottom': panelPosition === 'bottom' }">
      <section class="tree-area">
        <TraceTree
          v-if="graph"
          ref="treeRef"
          :graph="graph"
          :selected-id="selectedId"
          :query="query"
          :hide-non-required="hideNonRequired"
          @select="onSelect"
        />
        <div v-else class="placeholder">
          <template v-if="error">
            <p>数据加载失败：{{ error }}</p>
            <p>请通过下拉框选择数据文件，或右上角「加载 JSON」按钮选择本地文件</p>
          </template>
          <p v-else>加载中…</p>
        </div>
      </section>

      <DetailPanel
        v-show="!panelHidden"
        :node="selectedNode"
        :graph="graph"
        :hide-non-required="hideNonRequired"
        :json-file="currentFile"
        :position="panelPosition"
        @jump="onJump"
      />
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import TraceTree from './components/TraceTree.vue'
import DetailPanel from './components/DetailPanel.vue'
import { buildGraph } from './graph'

const list = ref(null)
const error = ref('')
const selectedId = ref(null)
const query = ref('')
const treeRef = ref(null)
const hideNonRequired = ref(false)
const panelPosition = ref('right')
const panelHidden = ref(false)

function cyclePanelState() {
  if (panelHidden.value) {
    panelHidden.value = false
    panelPosition.value = 'right'
  } else if (panelPosition.value === 'right') {
    panelPosition.value = 'bottom'
  } else {
    panelHidden.value = true
  }
}

const panelButtonLabel = computed(() => {
  if (panelHidden.value) return '隐藏面板'
  return panelPosition.value === 'right' ? '右侧面板' : '底部面板'
})

const panelButtonTitle = computed(() => {
  if (panelHidden.value) return '当前面板已隐藏，点击恢复到右侧显示'
  return panelPosition.value === 'right'
    ? '当前面板在右侧，点击移动到底部'
    : '当前面板在底部，点击隐藏'
})

// 数据文件列表（来自 /api/datalist，运行时获取：分析完成后写入 data/ 的新文件无需重启即可见）
const dataFiles = ref([])

const currentFile = ref('')

/** 归一化数据格式：兼容纯数组与 { projectRoot, nodes } 对象两种顶层结构 */
function normalizeData(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.nodes)) return data.nodes
  throw new Error('JSON 顶层必须是数组，或为包含 nodes 数组的对象')
}

async function refreshFileList() {
  try {
    const res = await fetch('/api/datalist')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    dataFiles.value = data.files || []
  } catch {
    // 列表接口不可用时，仍可通过「加载 JSON」按钮选择本地文件
  }
}

async function loadFile(name, { updateUrl = true } = {}) {
  if (!name) return
  error.value = ''
  list.value = null
  try {
    const res = await fetch(`/data/${encodeURIComponent(name)}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    list.value = normalizeData(data)
    currentFile.value = name
    // 同步 URL 的 ?data= 参数，便于分享/刷新后恢复当前数据
    if (updateUrl) {
      const url = new URL(window.location.href)
      url.searchParams.set('data', name)
      window.history.replaceState(null, '', url)
    }
  } catch (e) {
    currentFile.value = ''
    error.value = e.message || String(e)
  }
}

function onPickFile() {
  loadFile(currentFile.value)
}

// 启动：先取文件列表，再按 URL ?data= 参数自动加载指定数据（供渲染脚本一键打开），否则加载默认文件
const urlData = new URL(window.location.href).searchParams.get('data')
refreshFileList().then(() => {
  if (urlData) {
    loadFile(urlData)
    return
  }
  const def =
    dataFiles.value.find((f) => f.name === 'traceflow.json')?.name || dataFiles.value[0]?.name
  if (def) loadFile(def, { updateUrl: false })
})

const graph = computed(() => (Array.isArray(list.value) ? buildGraph(list.value) : null))

const selectedNode = computed(() =>
  selectedId.value ? graph.value?.nodesById.get(selectedId.value) || null : null
)

const matchCount = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q || !Array.isArray(list.value)) return 0
  return list.value.filter(
    (n) =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.oneLineSummary || '').toLowerCase().includes(q) ||
      (n.filepath || '').toLowerCase().includes(q)
  ).length
})

watch(graph, () => {
  selectedId.value = null
})

function onSelect(id) {
  selectedId.value = String(id)
}

function onJump(id) {
  const target = String(id)
  selectedId.value = target
  panelHidden.value = false
  treeRef.value?.reveal(target)
}

function onFile(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  f.text()
    .then((t) => {
      const data = JSON.parse(t)
      list.value = normalizeData(data)
      selectedId.value = null
      error.value = ''
      currentFile.value = ''
    })
    .catch((err) => alert('解析失败：' + (err.message || err)))
  e.target.value = ''
}
</script>
