# 架构与路由

## 总览

本站不依赖任何平台即服务（PaaS）。全部内容由一台阿里云 ECS 承载，通过 Nginx
按子域名分流到不同的后端。域名 `wzzsl.fun` 的 DNS 托管在阿里云（万网）。

```
浏览器
  │ HTTPS
  ▼
阿里云 ECS
  ├── Nginx（443，泛域名证书 *.wzzsl.fun）
  │     ├── 静态站点        → 直接读磁盘文件
  │     ├── Node API        → 反代 127.0.0.1:3101
  │     └── Next.js 应用    → 反代 127.0.0.1:3102
  └── 数据库
        ├── MySQL（驿见快递）
        └── PostgreSQL（宠物预约）
```

## 请求链路

以访问 `https://yijian.wzzsl.fun/api/parcels` 为例：

1. DNS 将 `yijian.wzzsl.fun` 解析到 ECS 公网 IP（CNAME 记录，见 [dns.md](dns.md)）
2. Nginx 匹配 `server_name yijian.wzzsl.fun`，命中 `location /api/`
3. 请求被反代到 `127.0.0.1:3101`，即 systemd 托管的 `yijian-api` 服务
4. 适配层按 `config.path` 找到对应函数并执行，函数从 MySQL 读取数据
5. 响应沿原路返回

若是访问 `https://yijian.wzzsl.fun/`（非 `/api/` 前缀），则由 Nginx 直接返回
`/srv/wzzsl/yijian/` 下的静态前端文件。

## 子域路由表

| 子域 | 站点类型 | Nginx 行为 | 服务器路径 / 上游 |
|---|---|---|---|
| `wzzsl.fun` | 静态 | 直接读文件 | `/srv/wzzsl/portal/` |
| `todo.wzzsl.fun` | SPA | 读文件 + 回退 `index.html` | `/srv/wzzsl/todo/` |
| `box.wzzsl.fun` | 静态 | 直接读文件 | `/srv/wzzsl/box/` |
| `demo.wzzsl.fun` | 静态（多目录） | 读文件 + 开启目录索引 | `/srv/wzzsl/demo/` |
| `days.wzzsl.fun` | SPA + PWA | 读文件 + 回退；`sw.js` 不缓存 | `/srv/wzzsl/days/` |
| `yijian.wzzsl.fun` | SPA + Node API | `/api/` 反代；其余读文件 | `/srv/wzzsl/yijian/` + `127.0.0.1:3000` |
| `petcare.wzzsl.fun` | Next.js | 全量反代 | `127.0.0.1:3102` |

**为什么 SPA 需要回退**：`todo`、`days`、`yijian` 都是客户端路由的单页应用，
直接访问 `/some/route` 时磁盘上没有对应文件。`try_files $uri $uri/ /index.html`
把未命中的路径交给 `index.html`，由前端路由接管。`box` 和 `demo` 是传统多页面
静态站，路径与文件一一对应，因此用 `=404` 更严格，也能暴露真实缺失。

**未匹配的子域**：Nginx 配置了 `default_server` 兜底，命中时 301 回门户。
但需注意一个实际边界 —— **证书采用多 SAN 方式，不含通配符**，因此访问未在证书中的
子域时会在 TLS 握手阶段就失败（实测 `curl` 返回 exit 60 / HTTP 000），
`default_server` 规则根本不会被触发。已知的七个域名不受影响；
若需覆盖任意子域，应改用通配符证书（见 [dns.md](dns.md) 方案 B）。

## 站点类型与构建产物

| 站点 | 框架 | 构建命令 | 产物 | 部署形态 |
|---|---|---|---|---|
| portal | 原生 HTML/CSS | 无 | 源码即产物 | 静态 |
| todo | Vite + React | `npm run build` | `dist/` | 静态 |
| box | 原生 JS | `npm run build:web` | `dist/` | 静态 |
| demo | 原生 HTML/CSS/JS | 无 | 源码即产物 | 静态 |
| days | Vite + React (PWA) | `npm run build` | `dist/` | 静态 |
| yijian | Vite + React | `npm run build` | `dist/` | 静态 + Node API |
| petcare | Next.js | `next build` | `.next/` | 常驻 Node 进程 |

## 数据层

### MySQL —— 驿见快递

源项目 `yijian-express` 的 `_shared/storage.mts` 内置了三种存储后端：

```ts
type StorageProvider = 'mysql' | 'supabase' | 'local'
```

由环境变量决定实际使用哪一种。本项目**不使用 Supabase**，因此只需设置
`MYSQL_URL` 即可走 MySQL 路径，源码无需改动。

建表脚本位于 `sites/yijian-express/mysql/schema.sql`，需先在目标库中选中数据库再执行。

**服务器上的实际形态**：驿见**已在运行**（早于本次整合），数据库为 **MariaDB 10.6.25**，
监听 **53306**（非默认 3306），库名 `yijian`。服务单元 `yijian.service` 运行
`/opt/yijian/server-dist/index.mjs`，监听 3000 端口，由 root crontab 中的
`yijian-backup.sh` 每日备份到 `/var/backups/yijian`。

本次整合**不改动该服务**，仅调整 Nginx 路由 —— 把它从根域迁到 `yijian.wzzsl.fun`。
本仓库的 `deploy/yijian-adapter` 是同一批函数的另一套实现（脱离 Netlify 的兼容运行时），
当前**未启用**，保留作为备选。

### PostgreSQL —— 宠物预约

`sites/pet-care/lib/db.ts` 使用通用 `pg` 连接池，读取 `DATABASE_URL`：

```ts
const databaseUrl = process.env.DATABASE_URL?.trim()
```

它本就不依赖 Supabase SDK —— Supabase 只是它此前连接的一个托管 Postgres 实例。
换成自建 PostgreSQL 只需修改 `DATABASE_URL`。

## 关于 Supabase 依赖的移除

`storage.mts` 顶部有一行 ESM 静态导入：

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
```

静态导入会在模块加载阶段求值，因此即使运行时不选 Supabase，也必须安装该包。
为在不修改上游源码的前提下彻底移除这一依赖，`deploy/yijian-adapter/build.mjs`
通过 esbuild 插件把 `@supabase/supabase-js` 解析到 `supabase-stub.mjs`：

- `type SupabaseClient` 是类型导入，编译期即被擦除
- 真正被调用的只有 `createClient`，占位实现一旦被调用就抛出明确错误，
  提示改用 `MYSQL_URL`

这样既移除了依赖，又保留了源码与上游同步的能力（可用 `git subtree pull` 拉取更新）。

## 与迁移前的对应关系

| 原方案 | 现方案 |
|---|---|
| Netlify 静态托管 | Nginx 直接读磁盘 |
| Netlify Functions | `deploy/yijian-adapter` 提供的 Node 兼容运行时 |
| Netlify 自动部署（push 触发） | 本地 `build-all.sh` + `upload.sh`（rsync） |
| Supabase（Postgres + SDK） | 自建 MySQL（驿见） / 自建 PostgreSQL（宠物预约） |
| 各仓库自带 `netlify.toml` | 已失效，配置集中于 `deploy/nginx/` |
