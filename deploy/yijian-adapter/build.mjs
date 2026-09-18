#!/usr/bin/env node
/**
 * 驿见快递查询 —— 函数打包脚本
 * ---------------------------------------------------------------
 * 把 sites/yijian-express/netlify/functions/ 下的 .mts 函数打包为
 * 可直接被 Node 载入的 .mjs，产物输出到 .build/yijian-api/。
 *
 * 关键处理：
 *  1. 通过插件把 '@supabase/supabase-js' 解析到 supabase-stub.mjs，
 *     彻底移除 Supabase 依赖（不修改上游源码）；
 *  2. mysql2 一并打包进产物 —— 它虽有可选的 native 绑定，但会回退到
 *     纯 JS 解析器，因此可以安全地打进 bundle。这样产物自包含，
 *     服务器上无需额外安装 node_modules；
 *  3. 忽略 _shared 目录本身（它是被 import 的模块，不是路由函数）。
 *
 * 前置：需先安装 esbuild（见 deploy/scripts/build-all.sh）。
 */

import { build } from 'esbuild'
import path from 'node:path'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const SRC_DIR = path.join(REPO_ROOT, 'sites', 'yijian-express', 'netlify', 'functions')
const OUT_DIR = path.join(REPO_ROOT, '.build', 'yijian-api')
const OUT_FUNCS = path.join(OUT_DIR, 'functions')

/** 把 Supabase 解析到占位模块 */
const supabaseStubPlugin = {
  name: 'supabase-stub',
  setup(b) {
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
      path: path.join(HERE, 'supabase-stub.mjs'),
    }))
  },
}

async function main() {
  let entries
  try {
    entries = await readdir(SRC_DIR)
  } catch (err) {
    console.error(`[build] 找不到函数目录：${SRC_DIR}`)
    console.error(`[build] ${err.message}`)
    process.exit(1)
  }

  // 只取目录顶层的 .mts 文件；_shared/ 是被引用的模块，不作为入口
  const entryPoints = entries
    .filter((name) => name.endsWith('.mts'))
    .map((name) => path.join(SRC_DIR, name))

  if (entryPoints.length === 0) {
    console.error('[build] 未找到任何 .mts 函数入口')
    process.exit(1)
  }

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_FUNCS, { recursive: true })

  await build({
    entryPoints,
    outdir: OUT_FUNCS,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: false,
    logLevel: 'info',
    // 产物扩展名统一为 .mjs，便于适配层按后缀扫描
    outExtension: { '.js': '.mjs' },
    plugins: [supabaseStubPlugin],
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  })

  // 适配层运行时一并复制过去
  await copyFile(path.join(HERE, 'server.mjs'), path.join(OUT_DIR, 'server.mjs'))

  console.log(`[build] 已打包 ${entryPoints.length} 个函数 → ${OUT_FUNCS}`)
  console.log('[build] 适配层：.build/yijian-api/server.mjs')
}

await main()
