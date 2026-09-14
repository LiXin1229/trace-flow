// ------------------------------------------------------------------
// 根据节点 id 读取数据 JSON 中对应的 filepath 与 line 字段，
// 拼接为被分析项目的绝对路径，读取源码文件并截取指定行。
//
// 数据 JSON 兼容两种顶层格式：
//   1. 纯数组：[ { id, name, filepath, line, ... }, ... ]
//   2. 对象（可携带元信息）：{ "projectRoot": "<被分析项目根目录>", "nodes": [ ... ] }
//
// CLI 用法：
//   node scripts/get-source.mjs <id> [projectRoot]
//   示例：node scripts/get-source.mjs 13
//
// 模块用法：
//   import { getSourceById } from './scripts/get-source.mjs'
//   const r = await getSourceById('13', { jsonPath: 'data/traceflow.json' }) // -> { id, name, filepath, absolutePath, start, end, lineCount, code }
//
// projectRoot 优先级：显式参数 > 数据 JSON 中的 projectRoot 元信息
// ------------------------------------------------------------------

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEMO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_JSON = path.join(DEMO_ROOT, 'data', 'traceflow.json')

/**
 * 解析 "#L239-L295" / "#L102" 格式的行号字段。
 * @returns {{ start: number, end: number } | null} 1-based 闭区间；无法解析返回 null
 */
export function parseLineRange(line) {
  const m = /^#?L(\d+)(?:\s*-\s*#?L?(\d+))?$/.exec(String(line || '').trim())
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

/**
 * 归一化数据 JSON：兼容纯数组与 { projectRoot, nodes } 对象两种顶层格式。
 * @param {unknown} raw 解析后的 JSON
 * @returns {{ nodes: any[], projectRoot?: string }}
 */
export function normalizeTraceData(raw) {
  if (Array.isArray(raw)) return { nodes: raw }
  if (raw && typeof raw === 'object' && Array.isArray(raw.nodes)) {
    const projectRoot =
      typeof raw.projectRoot === 'string' && raw.projectRoot.trim() ? raw.projectRoot : undefined
    return { nodes: raw.nodes, projectRoot }
  }
  throw new Error('JSON 顶层必须是数组，或为包含 nodes 数组的对象')
}

/**
 * 读取数据 JSON 中特定 id 的节点，定位其源码文件并截取 line 指定的行。
 * @param {string | number} id 节点 id
 * @param {{ jsonPath?: string, projectRoot?: string }} [options]
 * @returns {Promise<{id: string, name: string, filepath: string, absolutePath: string,
 *                    start: number, end: number, lineCount: number, code: string}>}
 */
export async function getSourceById(id, options = {}) {
  const jsonPath = options.jsonPath || DEFAULT_JSON

  let normalized
  try {
    normalized = normalizeTraceData(JSON.parse(await readFile(jsonPath, 'utf8')))
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`读取 ${jsonPath} 失败：${e.message}`)
    }
    // normalizeTraceData 抛出的格式错误
    throw new Error(`${jsonPath}：${e.message}`)
  }
  const list = normalized.nodes

  // projectRoot 优先级：显式参数 > 数据 JSON 中的 projectRoot 元信息
  const projectRoot = options.projectRoot || normalized.projectRoot
  if (!projectRoot) {
    throw new Error('数据 JSON 未携带 projectRoot 元信息，无法定位被分析项目根目录')
  }

  const node = list.find((n) => String(n?.id) === String(id))
  if (!node) throw new Error(`id=${id} 不存在于 ${jsonPath}`)

  const range = parseLineRange(node.line)
  if (!range) throw new Error(`节点 id=${id} 的 line 字段格式无法解析：${node.line}`)

  // filepath 为被分析项目内的相对路径，拼接为绝对路径定位源码文件
  const absolutePath = path.resolve(projectRoot, node.filepath)

  let content
  try {
    content = await readFile(absolutePath, 'utf8')
  } catch (e) {
    throw new Error(`源码文件读取失败：${absolutePath}（${e.code || e.message}）`)
  }

  const allLines = content.split(/\r?\n/)
  if (range.start > allLines.length) {
    throw new Error(`行号超出范围：${node.line}，文件共 ${allLines.length} 行`)
  }
  const sliced = allLines.slice(range.start - 1, range.end)

  return {
    id: node.id,
    name: node.name,
    filepath: node.filepath,
    absolutePath,
    start: range.start,
    end: range.start + sliced.length - 1,
    lineCount: sliced.length,
    code: sliced.join('\n')
  }
}

// ---- CLI 入口 ----
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const [id, rootArg] = process.argv.slice(2)
  if (id == null) {
    console.error('用法: node scripts/get-source.mjs <id> [projectRoot]')
    process.exit(1)
  }
  try {
    const result = await getSourceById(id, rootArg ? { projectRoot: rootArg } : {})
    console.log(JSON.stringify(result, null, 2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
