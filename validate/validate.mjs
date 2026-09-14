#!/usr/bin/env node
// ------------------------------------------------------------------
// TraceFlow JSON 校验脚本（零依赖：仅需 Node.js 18+，无需 npm install）
// 校验调用链数据文件是否符合 SKILL.md 定义的结构与约束。
// 校验不通过时以非零状态码退出，并输出具体原因，供上层中断流程。
//
// 用法：
//   node validate/validate.mjs <path/to/data.json>
//
// 退出码：
//   0  校验通过
//   1  校验不通过（参数错误 / JSON 解析失败 / 约束违反）
// ------------------------------------------------------------------

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const log = (msg) => console.log(`[traceflow-validate] ${msg}`)
const fail = (msg) => {
  console.error(`[traceflow-validate] 错误：${msg}`)
  process.exit(1)
}

const ASSOCIATED_TYPES = ['call', 'return', 'indirect', null]

// ---- 工具函数 ----

export const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== ''

// 绝对路径判断（跨平台）：Windows 盘符 / UNC / POSIX 根路径
export function isAbsolutePath(p) {
  if (typeof p !== 'string') return false
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true
  if (/^[\\/]{2}/.test(p)) return true
  if (/^\//.test(p)) return true
  return false
}

// 行号格式：#L<n> 或 #L<n>-L<n>
const LINE_RE = /^#L\d+(-L\d+)?$/
export const isValidLine = (v) => typeof v === 'string' && LINE_RE.test(v)

/** 校验 projectRoot 是否为实际存在的目录 */
function isDirectoryExists(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

// ---- 校验逻辑 ----

export function validateData(data) {
  const errors = []

  // 顶层结构
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('顶层必须是 JSON 对象（非数组、非 null）')
    return errors
  }

  // projectRoot
  if (!isNonEmptyString(data.projectRoot)) {
    errors.push('顶层字段 "projectRoot" 必须是非空字符串（被分析项目的绝对路径）')
  } else if (!isAbsolutePath(data.projectRoot)) {
    errors.push(`projectRoot 必须是绝对路径，实际：${JSON.stringify(data.projectRoot)}`)
  } else if (!isDirectoryExists(data.projectRoot)) {
    errors.push(`projectRoot 目录不存在：${data.projectRoot}`)
  }

  // nodes
  if (!Array.isArray(data.nodes)) {
    errors.push('顶层字段 "nodes" 必须是数组')
    return errors
  }

  const ids = []

  data.nodes.forEach((node, idx) => {
    const where = `nodes[${idx}]`
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${where} 必须是对象`)
      return
    }

    for (const key of ['id', 'name', 'filepath', 'line', 'oneLineSummary', 'snippetIntents']) {
      if (!(key in node)) errors.push(`${where} 缺少必需字段 "${key}"`)
    }

    // id
    if (!isNonEmptyString(node.id)) {
      errors.push(`${where}.id 必须是非空字符串，实际：${JSON.stringify(node.id)}`)
    } else {
      ids.push(node.id)
    }

    // name
    if (!isNonEmptyString(node.name)) {
      errors.push(`${where}.name 必须是非空字符串`)
    }

    // filepath：非空 + 相对路径（不校验文件是否存在）
    if (!isNonEmptyString(node.filepath)) {
      errors.push(`${where}.filepath 必须是非空字符串`)
    } else if (isAbsolutePath(node.filepath)) {
      errors.push(`${where}.filepath 必须是相对 projectRoot 的路径，实际是绝对路径：${node.filepath}`)
    }

    // line
    if (!isValidLine(node.line)) {
      errors.push(`${where}.line 格式非法，期望 #L<n> 或 #L<n>-L<n>，实际：${JSON.stringify(node.line)}`)
    }

    // oneLineSummary
    if (!isNonEmptyString(node.oneLineSummary)) {
      errors.push(`${where}.oneLineSummary 必须是非空字符串`)
    }

    // snippetIntents
    if (!Array.isArray(node.snippetIntents)) {
      errors.push(`${where}.snippetIntents 必须是数组`)
    } else {
      node.snippetIntents.forEach((si, siIdx) => {
        const w = `${where}.snippetIntents[${siIdx}]`
        if (si === null || typeof si !== 'object' || Array.isArray(si)) {
          errors.push(`${w} 必须是对象`)
          return
        }

        for (const key of ['content', 'line', 'associatedId', 'associatedType', 'associatedRequired']) {
          if (!(key in si)) errors.push(`${w} 缺少必需字段 "${key}"`)
        }

        if (!isNonEmptyString(si.content)) {
          errors.push(`${w}.content 必须是非空字符串`)
        }
        if (!isValidLine(si.line)) {
          errors.push(`${w}.line 格式非法，期望 #L<n> 或 #L<n>-L<n>，实际：${JSON.stringify(si.line)}`)
        }

        if (typeof si.associatedRequired !== 'boolean') {
          errors.push(`${w}.associatedRequired 必须是 boolean，实际：${JSON.stringify(si.associatedRequired)}`)
        }

        if (!ASSOCIATED_TYPES.includes(si.associatedType)) {
          errors.push(`${w}.associatedType 必须是 call | return | indirect | null，实际：${JSON.stringify(si.associatedType)}`)
        }

        // associatedId 与 associatedType / associatedRequired 的联动约束
        if (si.associatedId === null) {
          if (si.associatedType !== null) {
            errors.push(`${w}：associatedId 为 null 时 associatedType 必须为 null，实际：${JSON.stringify(si.associatedType)}`)
          }
          if (si.associatedRequired !== false) {
            errors.push(`${w}：associatedId 为 null 时 associatedRequired 必须为 false，实际：${JSON.stringify(si.associatedRequired)}`)
          }
        } else if (!isNonEmptyString(si.associatedId)) {
          errors.push(`${w}.associatedId 必须为字符串或 null，实际：${JSON.stringify(si.associatedId)}`)
        } else if (si.associatedType === null) {
          errors.push(`${w}：associatedId 非 null 时 associatedType 不能为 null`)
        }
      })
    }
  })

  // ---- 全局校验：id 唯一 + 从 '1' 连续递增 ----
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) {
    const seen = new Set()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`id 重复："${id}"`)
      seen.add(id)
    }
  }

  const total = data.nodes.length
  for (let i = 1; i <= total; i++) {
    if (!idSet.has(String(i))) errors.push(`id 必须从 '1' 连续递增，缺少 id "${i}"`)
  }

  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      errors.push(`id 必须是纯数字字符串，实际："${id}"`)
    } else {
      const num = Number(id)
      if (num < 1 || num > total) errors.push(`id "${id}" 超出范围（应为 1~${total}）`)
    }
  }

  // ---- 全局校验：associatedId 引用存在性 ----
  data.nodes.forEach((node, idx) => {
    if (node === null || typeof node !== 'object' || !Array.isArray(node.snippetIntents)) return
    node.snippetIntents.forEach((si, siIdx) => {
      if (si === null || typeof si !== 'object') return
      if (typeof si.associatedId === 'string' && !idSet.has(si.associatedId)) {
        errors.push(`nodes[${idx}].snippetIntents[${siIdx}].associatedId 引用了不存在的 id "${si.associatedId}"`)
      }
    })
  })

  return errors
}

// ---- 入口 ----

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('用法：node validate/validate.mjs <path/to/data.json>')
    process.exit(0)
  }

  // 仅接受以 .json 结尾的参数作为数据文件路径，
  // 忽略 node / 脚本路径等非目标参数，避免命令被重复拼接时误判。
  const candidates = argv.filter((a) => !a.startsWith('-') && /\.json$/i.test(a))
  const filePath = candidates[candidates.length - 1]
  if (!filePath) {
    fail('缺少数据文件路径（须为 .json 文件）')
    return
  }

  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (e) {
    fail(`无法读取文件 ${filePath}：${e.message}`)
    return
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    fail(`不是合法的 JSON：${e.message}`)
    return
  }

  const errors = validateData(data)
  if (errors.length > 0) {
    console.error(`[traceflow-validate] 校验不通过，共 ${errors.length} 处问题：`)
    for (const err of errors) console.error(`  - ${err}`)
    process.exit(1)
  }

  log(`校验通过：${filePath}`)
  process.exit(0)
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectRun) main()
