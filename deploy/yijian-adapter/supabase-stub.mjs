/**
 * Supabase 占位模块（构建期替换用）
 * ---------------------------------------------------------------
 * sites/yijian-express/netlify/functions/_shared/storage.mts 中以
 * 静态方式导入了 @supabase/supabase-js：
 *
 *     import { createClient, type SupabaseClient } from '@supabase/supabase-js'
 *
 * 由于是 ESM 静态导入，即使运行时不选 Supabase 后端，该依赖也会在
 * 模块加载阶段被求值，导致必须安装这个包。
 *
 * 本项目不使用 Supabase，因此 build.mjs 通过 esbuild 插件把
 * '@supabase/supabase-js' 解析到本文件：类型导入在编译期被擦除，
 * 真正被调用的只有 createClient —— 而它一旦被调用就抛出明确错误，
 * 提示改用 MySQL。
 *
 * 这样做的收益：不修改上游项目源码，同时彻底移除对 Supabase 的依赖。
 */

const MESSAGE =
  '本项目已移除 Supabase 依赖。请在环境变量中设置 MYSQL_URL（或 DATABASE_URL）以启用 MySQL 存储后端。'

export function createClient() {
  throw new Error(MESSAGE)
}

export function createServerClient() {
  throw new Error(MESSAGE)
}

export default { createClient, createServerClient }
