import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSourceById } from './scripts/get-source.mjs'

const DEMO_ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(DEMO_ROOT, 'data')

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 仅允许 data 目录下的 .json 文件名，防止路径遍历 */
function safeDataFilePath(name) {
  return /^[\w.-]+\.json$/.test(name || '') ? path.join(DATA_DIR, name) : null
}

/**
 * 注册 TraceFlow 服务端接口（dev 与 preview 两种模式共用）：
 * - GET /api/source?id=<nodeId>[&file=<data目录下的json文件名>]  读取被分析项目源码片段
 * - GET /api/datalist                                           列出 data 目录下的数据文件（按修改时间倒序）
 * - GET /data/<name>.json                                       运行时读取数据文件
 *   （静态构建产物不包含 data 目录，由服务端动态提供，便于分析完成后写入新数据即时生效）
 */
function registerTraceflowApi(server) {
  server.middlewares.use('/api/source', (req, res) => {
    const url = new URL(req.url, 'http://localhost')
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
    getSourceById(id, options)
      .then((data) => sendJson(res, 200, data))
      .catch((e) => sendJson(res, 404, { error: e.message }))
  })

  server.middlewares.use('/api/datalist', async (req, res) => {
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
  })

  server.middlewares.use('/data', async (req, res) => {
    const name = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname.replace(/^\/+/, '')
    )
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
  })
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'traceflow-api',
      configureServer: registerTraceflowApi,
      configurePreviewServer: registerTraceflowApi
    }
  ],
  server: {
    port: 5173,
    open: false
  },
  preview: {
    port: 4173
  }
})
