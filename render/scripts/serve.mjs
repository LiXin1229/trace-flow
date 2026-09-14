#!/usr/bin/env node
// ------------------------------------------------------------------
// TraceFlow 渲染控制脚本（零依赖：仅需 Node.js 18+，无需 npm install）
// 一条命令完成「启动静态服务 → 打开浏览器」。
//
// 用法：
//   node scripts/serve.mjs [--data <data目录下的json文件名>] [--port 4173] [--rebuild] [--no-open]
//
// 参数：
//   --data <name>   打开时自动加载的数据文件（须位于 data/ 目录），浏览器地址为 /?data=<name>
//   --port <n>      服务端口，默认 4173
//   --rebuild       强制重新构建静态产物（渲染器代码更新后使用，需要开发环境）
//   --no-open       不自动打开浏览器，仅启动服务
//
// 说明：
//   - 本脚本以纯 Node 内置模块实现静态服务与 API，不依赖 node_modules，
//     直接运行仓库中已构建好的 dist/ 产物，适合作为 skill 的渲染入口
//   - dist/ 缺失或指定 --rebuild 时，才会尝试 npm install + npm run build（需开发环境）
//   - 开发调试渲染器代码请使用 npm run dev（vite 开发服务器）
// ------------------------------------------------------------------

import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSourceById } from './get-source.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(ROOT, 'dist')
const DATA_DIR = path.join(ROOT, 'data')
const IS_WIN = process.platform === 'win32'

// ---- 参数解析 ----
const argv = process.argv.slice(2)
function argValue(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}
const dataName = argValue('--data')
const port = Number(argValue('--port')) || 4173
const rebuild = argv.includes('--rebuild')
const noOpen = argv.includes('--no-open')

const log = (msg) => console.log(`[traceflow] ${msg}`)
const fail = (msg) => {
  console.error(`[traceflow] 错误：${msg}`)
  process.exit(1)
}

/** 同步执行命令，失败则终止 */
function run(cmd, cmdArgs, label) {
  log(`${label}：${cmd} ${cmdArgs.join(' ')}`)
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: IS_WIN })
  if (r.status !== 0) fail(`${label}失败（退出码 ${r.status}）`)
}

// ---- 构建产物检查（正常情况下 dist 已随仓库提供，无需此步骤） ----
if (rebuild || !existsSync(path.join(DIST_DIR, 'index.html'))) {
  if (rebuild) {
    log('--rebuild：重新构建静态产物')
  } else {
    log('dist/ 静态产物缺失，尝试构建（需要开发环境）')
  }
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    run('npm', ['install'], '安装构建依赖')
  }
  run('npm', ['run', 'build'], '构建静态产物')
}

// ---- HTTP 服务（纯 Node 实现，与 vite.config.js 中的中间件行为一致） ----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 仅允许 data 目录下的 .json 文件名，防止路径遍历 */
function safeDataFilePath(name) {
  return /^[\w.-]+\.json$/.test(name || '') ? path.join(DATA_DIR, name) : null
}

async function handleApiSource(res, url) {
  const id = url.searchParams.get('id')
  const file = url.searchParams.get('file')
  if (!id) {
    sendJson(res, 400, { error: '缺少 id 参数' })
    return
  }
  const options = {}
  if (file) {
    const dataFile = safeDataFilePath(file)
    if (!dataFile) {
      sendJson(res, 400, { error: '非法的文件名' })
      return
    }
    options.jsonPath = dataFile
  }
  try {
    sendJson(res, 200, await getSourceById(id, options))
  } catch (e) {
    sendJson(res, 404, { error: e.message })
  }
}

async function handleApiDatalist(res) {
  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const st = await stat(path.join(DATA_DIR, entry.name))
      files.push({ name: entry.name, mtime: st.mtimeMs })
    }
    files.sort((a, b) => b.mtime - a.mtime)
    sendJson(res, 200, { files })
  } catch (e) {
    sendJson(res, 500, { error: e.message })
  }
}

async function handleDataFile(res, name) {
  const dataFile = safeDataFilePath(name)
  if (!dataFile) {
    sendJson(res, 400, { error: '非法的文件名' })
    return
  }
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(await readFile(dataFile, 'utf8'))
  } catch (e) {
    sendJson(res, 404, { error: `读取 ${name} 失败：${e.code || e.message}` })
  }
}

/** 服务 dist/ 下的静态文件；非文件路径回退到 index.html（SPA） */
async function serveStatic(res, pathname) {
  let filePath = path.normalize(path.join(DIST_DIR, pathname))
  // 防止路径遍历
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }
  let st = await stat(filePath).catch(() => null)
  if (st && st.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    st = await stat(filePath).catch(() => null)
  }
  if (!st || !st.isFile()) {
    // SPA 回退：未知路径返回 index.html
    filePath = path.join(DIST_DIR, 'index.html')
    if (!existsSync(filePath)) {
      sendJson(res, 404, { error: '静态产物缺失：dist/index.html 不存在' })
      return
    }
  }
  const ext = path.extname(filePath).toLowerCase()
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  // 带内容哈希的资源可长缓存，其余不缓存以便更新后立即生效
  if (pathname.startsWith('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    res.setHeader('Cache-Control', 'no-cache')
  }
  res.end(await readFile(filePath))
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const pathname = decodeURIComponent(url.pathname)
      if (pathname === '/api/source') {
        await handleApiSource(res, url)
      } else if (pathname === '/api/datalist') {
        await handleApiDatalist(res)
      } else if (pathname.startsWith('/data/')) {
        await handleDataFile(res, pathname.slice('/data/'.length))
      } else {
        await serveStatic(res, pathname)
      }
    } catch (e) {
      sendJson(res, 500, { error: e.message || String(e) })
    }
  })
}

// ---- 端口检测 ----

/** 检查端口是否被任意程序占用 */
function isPortTaken(portNum) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(true))
    s.once('listening', () => s.close(() => resolve(false)))
    s.listen(portNum)
  })
}

/** 检查目标端口是否是运行中的 TraceFlow 服务（校验 /api/datalist 接口） */
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

function openBrowser(url) {
  const command = IS_WIN
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`
  log(`打开浏览器：${url}`)
  spawn(command, { shell: true, stdio: 'ignore', detached: true }).unref()
}

async function main() {
  // ---- 0. 校验数据文件 ----
  if (dataName) {
    if (!/^[\w.-]+\.json$/.test(dataName)) fail(`非法的数据文件名：${dataName}`)
    if (!existsSync(path.join(DATA_DIR, dataName))) {
      fail(`数据文件不存在：${path.join('data', dataName)}，请先写入分析结果`)
    }
  }

  const baseUrl = `http://localhost:${port}/`
  const targetUrl = dataName ? `${baseUrl}?data=${encodeURIComponent(dataName)}` : baseUrl

  // ---- 1. 复用已有服务，否则启动 ----
  if (await isTraceflowAlive(port)) {
    log(`复用运行中的服务：${baseUrl}`)
  } else {
    if (await isPortTaken(port)) {
      fail(`端口 ${port} 被其他程序占用，请释放端口或用 --port 指定其他端口`)
    }

    const server = createServer()
    server.on('error', (e) => fail(`服务启动失败：${e.message}`))
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, () => resolve())
    })
    log(`静态服务已启动：${baseUrl}（按 Ctrl+C 停止）`)
  }

  // ---- 2. 打开浏览器 ----
  if (!noOpen) {
    openBrowser(targetUrl)
  } else {
    log(`服务地址：${targetUrl}`)
  }
}

main().catch((e) => fail(e.stack || e.message || String(e)))
