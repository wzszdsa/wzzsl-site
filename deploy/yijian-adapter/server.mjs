#!/usr/bin/env node
/**
 * 驿见快递查询 —— Netlify Functions 适配层（运行时）
 * ---------------------------------------------------------------
 * 背景：sites/yijian-express/netlify/functions/ 下的 9 个函数原本
 *      运行在 Netlify 上，采用 Netlify Functions v2 约定：
 *        export default async function handler(request: Request): Promise<Response>
 *        export const config = { path: '/api/parcels', method: 'GET' }
 *      本项目已脱离 Netlify，因此由本文件提供等价的最小运行时。
 *
 * 工作方式：
 *  1. 从 FUNCTIONS_DIR 载入由 build.mjs 打包好的 .mjs 函数；
 *  2. 按 config.path + config.method 建立路由表；
 *  3. 用 Node 内置 http 服务接收请求，转换为标准 Web Request/Response
 *     交给函数处理，再把结果写回 Node 响应。
 *
 * 同时提供 config.mts 所依赖的全局 Netlify.env.get 垫片，
 * 使函数内读取环境变量的代码无需改动。
 */

import http from 'node:http'
import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FUNCTIONS_DIR = process.env.FUNCTIONS_DIR || path.join(HERE, 'functions')
const PORT = Number(process.env.PORT || 3101)
const HOST = process.env.HOST || '127.0.0.1'

// ---------- 全局垫片：供 _shared/config.mts 的 env() 读取 ----------
globalThis.Netlify = {
  env: {
    get: (key) => process.env[key],
  },
}

// ---------- 路由表：path -> Map(method -> handler) ----------
const routes = new Map()

async function loadFunctions() {
  let files
  try {
    files = await readdir(FUNCTIONS_DIR)
  } catch (err) {
    console.error(`[adapter] 无法读取函数目录 ${FUNCTIONS_DIR}：${err.message}`)
    console.error('[adapter] 请先执行 deploy/scripts/build-all.sh 生成函数产物')
    process.exit(1)
  }

  for (const file of files.filter((f) => f.endsWith('.mjs')).sort()) {
    let mod
    try {
      mod = await import(pathToFileURL(path.join(FUNCTIONS_DIR, file)).href)
    } catch (err) {
      console.error(`[adapter] 载入 ${file} 失败：${err.message}`)
      process.exit(1)
    }

    const handler = mod.default
    const routePath = mod.config?.path
    if (typeof handler !== 'function' || !routePath) {
      console.warn(`[adapter] 跳过 ${file}（缺少 default 导出或 config.path）`)
      continue
    }

    const method = (mod.config.method || 'GET').toUpperCase()
    if (!routes.has(routePath)) routes.set(routePath, new Map())
    routes.get(routePath).set(method, handler)
    console.log(`[adapter] 注册 ${method.padEnd(6)} ${routePath}  ← ${file}`)
  }

  if (routes.size === 0) {
    console.error('[adapter] 未注册任何路由，服务不会启动')
    process.exit(1)
  }
}

// ---------- Node 请求 → Web Request ----------
async function toWebRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else if (value !== undefined) headers.set(key, value)
  }

  const method = req.method ?? 'GET'
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    if (chunks.length) body = Buffer.concat(chunks)
  }

  return new Request(url, { method, headers, body })
}

// ---------- Web Response → Node 响应 ----------
async function writeWebResponse(res, webRes) {
  res.statusCode = webRes.status
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') return
    res.setHeader(key, value)
  })

  if (!webRes.body) return res.end()

  const buffer = Buffer.from(await webRes.arrayBuffer())
  res.setHeader('Content-Length', buffer.length)
  res.end(buffer)
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders })
  res.end(JSON.stringify(payload))
}

// ---------- HTTP 服务 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const method = (req.method ?? 'GET').toUpperCase()

  // 健康检查
  if (url.pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, routes: routes.size })
  }

  const table = routes.get(url.pathname)
  if (!table) {
    return sendJson(res, 404, { message: '接口不存在', path: url.pathname })
  }

  const handler = table.get(method)
  if (!handler) {
    return sendJson(
      res,
      405,
      { message: `该接口不支持 ${method}`, allowed: [...table.keys()] },
      { Allow: [...table.keys()].join(', ') },
    )
  }

  try {
    await writeWebResponse(res, await handler(await toWebRequest(req)))
  } catch (err) {
    console.error(`[adapter] ${method} ${url.pathname} 处理失败：`, err)
    if (!res.headersSent) sendJson(res, 500, { message: '服务器内部错误' })
    else res.end()
  }
})

// ---------- 启动 ----------
await loadFunctions()

server.listen(PORT, HOST, () => {
  console.log(`[adapter] 驿见 API 已就绪：http://${HOST}:${PORT}（共 ${routes.size} 条路由）`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[adapter] 收到 ${signal}，正在关闭……`)
    server.close(() => process.exit(0))
  })
}
