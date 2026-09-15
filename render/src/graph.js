// ------------------------------------------------------------------
// 图数据构建 + 可折叠树形布局
// 数据源：扁平化 JSON 数组，通过 snippetIntents[].associatedId 建立父子关系
// ------------------------------------------------------------------

export const NODE_W = 300 // 需与 style.css 中 .node-card 保持一致
export const NODE_H = 105
export const GAP_X = 80
export const GAP_Y = 18
const PAD = 40

export const TYPE_COLORS = {
  call: '#58a6ff', // 蓝：直接调用
  return: '#3fb950', // 绿：调用并使用返回值
  indirect: '#d29922' // 橙：间接关联
}

export const TYPE_LABELS = {
  call: '调用',
  return: '调用并使用返回值',
  indirect: '间接关联'
}

const TYPE_ORDER = { call: 0, return: 1, indirect: 2 }

/** 根据文件路径判断前后端层级 */
export function layerOf(node) {
  const p = (node && node.filepath) || ''
  if (/frontend/i.test(p)) return 'frontend'
  if (/backend/i.test(p)) return 'backend'
  return null
}

/**
 * 把扁平数组构建为图结构：
 * - nodesById: id -> 原始节点
 * - childrenMap: id -> 聚合后的出边列表（同一父子对的多种类型/多次调用合并）
 * - callersMap: id -> 入边来源列表
 * - roots: 未被任何节点引用的根节点 id 列表
 */
export function buildGraph(list) {
  const nodesById = new Map()
  for (const n of list) {
    if (n && n.id != null) nodesById.set(String(n.id), n)
  }

  const edgeMap = new Map()
  const referenced = new Set()

  for (const n of nodesById.values()) {
    const intents = Array.isArray(n.snippetIntents) ? n.snippetIntents : []
    for (const s of intents) {
      if (!s || s.associatedId == null) continue
      const to = String(s.associatedId)
      if (!nodesById.has(to)) continue
      referenced.add(to)

      const key = String(n.id) + '\u0000' + to
      let e = edgeMap.get(key)
      if (!e) {
        e = { from: String(n.id), to, types: new Set(), required: false, count: 0 }
        edgeMap.set(key, e)
      }
      if (s.associatedType) e.types.add(s.associatedType)
      if (s.associatedRequired) e.required = true
      e.count++
    }
  }

  const childrenMap = new Map()
  const callersMap = new Map()
  for (const e of edgeMap.values()) {
    if (!childrenMap.has(e.from)) childrenMap.set(e.from, [])
    childrenMap.get(e.from).push(e)
    if (!callersMap.has(e.to)) callersMap.set(e.to, [])
    callersMap.get(e.to).push(e.from)
  }

  const num = (v) => Number(String(v)) || 0
  for (const arr of childrenMap.values()) {
    arr.sort((a, b) => num(a.to) - num(b.to))
  }

  const roots = [...nodesById.keys()]
    .filter((id) => !referenced.has(id))
    .sort((a, b) => num(a) - num(b))

  return {
    nodesById,
    childrenMap,
    callersMap,
    roots,
    nodeCount: nodesById.size,
    edgeCount: edgeMap.size
  }
}

/**
 * 计算可折叠树布局（水平方向，从左到右）。
 * isExpanded(key, depth) 决定某个节点实例是否展开。
 * hideNonRequired 为 true 时，过滤掉 associatedRequired 为 false 的非核心边，
 * 从而隐藏仅通过非核心链路关联的下游节点。
 * 同一函数被多处引用时会生成多个实例（key 为根到该实例的路径），
 * 祖先链上的 id 不再重复展开，避免环导致死循环。
 */
export function buildLayout(graph, isExpanded, hideNonRequired = false) {
  const nodes = []
  const edges = []
  const STEP = NODE_H + GAP_Y
  let cursorY = PAD

  function measure(id, path, depth) {
    const ancestors = path ? path.split('/') : []
    const all = (graph.childrenMap.get(String(id)) || []).filter(
      (e) => !ancestors.includes(e.to) && (!hideNonRequired || e.required)
    )
    const key = path ? path + '/' + id : String(id)
    const expanded = all.length > 0 && !!isExpanded(key, depth)
    const children = expanded
      ? all.map((e) => ({ edge: e, ...measure(e.to, key, depth + 1) }))
      : []
    const rows = children.length
      ? children.reduce((s, c) => s + c.rows, 0)
      : 1
    return { id: String(id), key, depth, expanded, all, children, rows }
  }

  function place(t, x) {
    const blockTop = cursorY
    if (t.expanded && t.children.length) {
      for (const c of t.children) c.inst = place(c, x + NODE_W + GAP_X)
    } else {
      cursorY += STEP
    }

    const centerY = blockTop + (cursorY - blockTop) / 2
    const inst = {
      id: t.id,
      key: t.key,
      depth: t.depth,
      x,
      y: centerY - NODE_H / 2,
      node: graph.nodesById.get(t.id),
      childCount: t.all.length,
      expanded: t.expanded
    }
    nodes.push(inst)

    // 父 -> 子：同一对父子间若存在多种关联类型，绘制多条平行边
    for (const c of t.children) {
      const types = [...c.edge.types].sort(
        (a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9)
      )
      const list = types.length ? types : [null]
      list.forEach((type, i) => {
        const off = (i - (list.length - 1) / 2) * 8
        const x1 = inst.x + NODE_W
        const y1 = inst.y + NODE_H / 2 + off
        const x2 = c.inst.x
        const y2 = c.inst.y + NODE_H / 2 + off
        const mid = Math.max(40, (x2 - x1) / 2)
        edges.push({
          d: `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`,
          type,
          required: !!c.edge.required,
          count: c.edge.count,
          fromId: inst.id,
          toId: c.inst.id
        })
      })
    }
    return inst
  }

  let maxX = 0
  for (const r of graph.roots) {
    const t = measure(r, '', 0)
    const inst = place(t, PAD)
    maxX = Math.max(maxX, inst.x)
    cursorY += 16
  }

  return {
    nodes,
    edges,
    width: maxX + NODE_W + PAD,
    height: Math.max(0, cursorY + PAD)
  }
}
