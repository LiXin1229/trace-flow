#!/usr/bin/env node
// ------------------------------------------------------------------
// TraceFlow 渲染服务停止脚本（零依赖：仅需 Node.js 18+，无需 npm install）
// 关闭由 scripts/serve.mjs 启动的静态服务。
//
// 用法：
//   node scripts/stop.mjs [--port 4173]
//
// 参数：
//   --port <n>   要停止的服务端口，默认 4173
//
// 说明：
//   - 仅当端口上运行的是 TraceFlow 服务（通过 /api/datalist 校验）时才停止，
//     避免误杀其他程序占用的进程
// ------------------------------------------------------------------

import { spawnSync } from 'node:child_process'

const IS_WIN = process.platform === 'win32'

const argv = process.argv.slice(2)
function argValue(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}
const port = Number(argValue('--port')) || 4173

const log = (msg) => console.log(`[traceflow] ${msg}`)
const fail = (msg) => {
  console.error(`[traceflow] 错误：${msg}`)
  process.exit(1)
}

/** 校验目标端口是否为运行中的 TraceFlow 服务（校验 /api/datalist 接口） */
async function isTraceflowAlive(portNum) {
  try {
    const res = await fetch(`http://localhost:${portNum}/api/datalist`)
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data.files)
  } catch {
    return false
  }
}

/** 查找监听指定端口的进程 PID */
function findPidsByPort(portNum) {
  if (IS_WIN) {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' })
    if (r.error || r.status !== 0) fail(`netstat 执行失败：${r.error?.message || r.stderr}`)
    const pids = new Set()
    for (const line of r.stdout.split(/\r?\n/)) {
      // 列：Proto  Local Address  Foreign Address  State  PID
      const cols = line.trim().split(/\s+/)
      if (cols.length < 5) continue
      const localPort = cols[1].slice(cols[1].lastIndexOf(':') + 1)
      if (localPort !== String(portNum)) continue
      const pid = cols[4]
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
    return [...pids]
  }
  const r = spawnSync('lsof', ['-ti', `tcp:${portNum}`], { encoding: 'utf8' })
  if (!r.error && r.stdout.trim()) return r.stdout.trim().split(/\s+/).filter(Boolean)
  const f = spawnSync('fuser', [`${portNum}/tcp`], { encoding: 'utf8' })
  if (!f.error && f.stdout.trim()) return f.stdout.trim().split(/\s+/).filter(Boolean)
  return []
}

/** 结束指定 PID */
function killPid(pid) {
  const cmd = IS_WIN ? 'taskkill' : 'kill'
  const args = IS_WIN ? ['/PID', pid, '/F'] : ['-9', pid]
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  if (r.status !== 0) fail(`结束进程 ${pid} 失败：${r.stderr || r.error?.message}`)
}

async function main() {
  if (!(await isTraceflowAlive(port))) {
    if (findPidsByPort(port).length > 0) {
      fail(`端口 ${port} 被其他程序占用，且未检测到 TraceFlow 服务，已取消停止操作`)
    }
    log(`端口 ${port} 上没有运行中的 TraceFlow 服务`)
    return
  }

  const pids = findPidsByPort(port)
  if (pids.length === 0) {
    fail(`未找到监听端口 ${port} 的进程（服务可能已停止）`)
  }

  for (const pid of pids) {
    log(`正在停止监听端口 ${port} 的进程（PID ${pid}）`)
    killPid(pid)
  }
  log(`服务已停止：http://localhost:${port}/`)
}

main().catch((e) => fail(e.stack || e.message || String(e)))
