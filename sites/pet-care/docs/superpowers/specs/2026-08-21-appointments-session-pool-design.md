# 预约表单持久化与 Supabase Session Pool 设计

## 状态

已获得用户对总体设计的确认；本文档提交后等待用户审阅，审阅通过后再编写实施计划。

## 背景与目标

当前 Next.js App Router 项目已经有预约表单，字段为家长姓名、联系电话、宠物名字、宠物类型、想要服务、期望到店时间和补充说明，但提交按钮尚未连接后端，也没有预约数据持久化能力。

本次改动的目标是：

1. 使用 Supabase MCP 在目标项目中创建 `public.appointments` 预约表。
2. 使用 Supabase Session Pooler 的 PostgreSQL 连接串，由 Next.js 服务端通过 Node.js `pg` 的 `Pool` 写入数据。
3. 让浏览器只调用 Next.js 后端接口，不接触数据库连接串、Supabase 管理凭据或服务端环境变量。
4. 为输入校验、数据库写入和表单提交增加可重复执行的测试。

## 非目标

- 本次不增加用户登录、会员账户或 `user_id` 外键。
- 本次不实现店员后台、预约查询、改期、取消或短信/微信通知。
- 本次不使用 Supabase JS 客户端作为写入层；写入必须走 PostgreSQL Session Pool。
- 本次不重做现有页面视觉设计，只补齐表单提交状态和必要的可访问性反馈。

## 已确认的实现假设

- “Session Pool”解释为 Supabase Session Pooler 的连接模式，使用 Supabase 提供的 Session Pool 连接串，通常为 `5432` 端口；不使用 Transaction Pooler 的 `6543` 端口。
- 连接串存放在服务端环境变量 `DATABASE_URL` 中，绝不使用 `NEXT_PUBLIC_` 前缀。
- 门店地址在上海，`datetime-local` 输入值按 `Asia/Shanghai`（UTC+08:00）解释后写入 `timestamptz`。这样后端不会因部署环境默认时区不同而改变用户选择的到店时间。
- 当前表单的宠物类型和服务选项继续使用现有中文值；服务端做白名单校验，数据库字段保留为文本以便未来扩展。

## 方案选择

### 采用：Next.js Route Handler + `pg.Pool` + Supabase MCP DDL

数据流为：

```text
BookingSection
  -> POST /api/appointments
  -> 服务端 JSON/业务校验
  -> 参数化 INSERT
  -> pg.Pool（Supabase Session Pool）
  -> public.appointments
```

采用这个方案是因为它直接满足“后端用 PostgreSQL Session Pool 写入”的要求，同时把数据库凭据限制在 Node.js runtime 内。参数化 SQL 将避免把用户输入拼接进 SQL 字符串。

### 不采用：Supabase JS 客户端

Supabase JS 可以完成插入，但它不是本次要求的 PostgreSQL Session Pool 写入方式，且容易让后端实现退化为 Data API 客户端调用。

### 后备方案：SQL migration 文件

如果当前 Codex 会话仍无法加载已经配置的 `supabase` MCP，将保留同一份幂等 SQL 作为人工执行后备方案；在没有用户另行授权前，不会用其他方式替代“通过 Supabase MCP 执行建表”。

## 数据库设计

表名为 `public.appointments`：

| 字段 | 类型 | 约束/用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键，默认 `gen_random_uuid()` |
| `customer_name` | `text` | 必填，家长姓名 |
| `phone` | `text` | 必填，联系电话 |
| `pet_name` | `text` | 必填，宠物名字 |
| `pet_type` | `text` | 必填，当前为狗狗/猫咪/其他 |
| `service` | `text` | 必填，当前为基础洗护/美容修剪/耳道护理/深度护理 |
| `appointment_time` | `timestamptz` | 必填，按 UTC+08:00 解释并标准化存储 |
| `note` | `text` | 可空，补充说明，限制最大长度 |
| `status` | `text` | 必填，默认 `pending`，限制为 `pending`/`confirmed`/`cancelled`/`completed` |
| `created_at` | `timestamptz` | 必填，默认 `now()` |

DDL 应满足幂等执行：使用 `create table if not exists`，并为到店时间、状态和创建时间建立查询所需索引。表启用 Row Level Security 且不创建匿名写入策略，避免未来通过 Supabase Data API 暴露预约数据；服务端直连使用拥有该表写入权限的数据库角色。

数据库层只固定结构性约束和 `status` 状态集合；宠物类型、服务项目等业务白名单由服务端维护，避免每次增加前台选项都必须修改数据库约束。

## 服务端模块边界

### `lib/db.ts`

- 仅在服务端加载 `DATABASE_URL`。
- 创建并复用一个 `pg.Pool`，避免 Next.js 开发热重载或长驻进程重复建立连接池。
- 缺少连接串时抛出可识别的配置错误，不把连接串返回给客户端。

### `lib/appointment-contract.ts`

- 定义预约请求的 TypeScript 类型。
- 校验 JSON 对象、必填文本、文本长度、电话格式、宠物类型、服务项目和未来到店时间。
- 将 `YYYY-MM-DDTHH:mm` 的表单值按 `+08:00` 转换为可写入 PostgreSQL 的 ISO 时间。
- 该模块保持纯函数，便于单元测试。

### `app/api/appointments/route.ts`

- 使用 `runtime = 'nodejs'`，确保可使用 `pg`。
- 只接受 `POST`。
- 读取并校验请求体，使用占位符参数执行 `INSERT ... RETURNING`。
- 成功返回 `201` 和预约编号、状态、创建时间。
- JSON 无效或业务校验失败返回 `400`。
- 缺少数据库配置返回 `503`。
- 数据库异常只记录服务端日志，客户端返回不泄露内部细节的 `500`。

### `components/booking-section.tsx`

- 将现有表单字段补充明确的 `name`、`required` 和合适的输入约束。
- 将提交按钮改为真正的表单提交，并调用 `/api/appointments`。
- 增加提交中、成功和失败状态，保留现有中文文案和视觉风格。
- 成功后调用表单重置，恢复到初始预约时间并清空已提交字段，同时保留明确的成功提示；请求失败时保留用户输入，方便修正后重试。

## 环境配置

在 `.env.example` 与 `.env.local.example` 中增加：

```env
DATABASE_URL=postgresql://<session-pool-user>:<password>@<session-pool-host>:5432/postgres?sslmode=require
```

真实的 `DATABASE_URL` 只配置在本地未提交环境或部署平台，不写入仓库，不打印到日志，也不传给浏览器。

## 错误处理与安全边界

- 所有数据库写入都使用参数化查询。
- 服务端重新校验所有字段，不能信任浏览器的 `required`、`min` 或 `select` 选项。
- 到店时间由服务端按固定门店时区解析，并拒绝过去时间。
- 客户端只收到稳定的业务错误文案；数据库错误详情只保留在服务端日志。
- 不在本次范围内实现复杂反垃圾策略；公开预约接口后续可增加 IP/手机号限流和验证码。

## 测试与验证

实施阶段按 TDD 顺序执行：

1. 先为请求校验和时间转换写失败测试，确认失败原因是功能不存在。
2. 为 `POST /api/appointments` 写验证失败、缺少配置和成功写入路径的测试；数据库边界通过可注入的 query/store 适配器隔离，避免普通单元测试依赖真实 Supabase。
3. 更新预约表单契约测试，验证字段名称、必填属性、提交控件和成功/失败状态所需标记。
4. 运行 focused Vitest，再运行完整 `npm test`、`npm run lint`、`npm run typecheck` 和 `npm run build`。
5. 通过 Supabase MCP 执行幂等 DDL，查询确认表、索引、RLS 和约束存在；如果需要验证 SQL 写入，使用事务内测试并回滚，避免留下测试预约记录。
6. 配置真实 `DATABASE_URL` 后进行一次本地端到端提交验证，确认预约记录字段与时间值正确落库；验证输出不得打印连接串或其他秘密。

## 变更文件预览

预计修改或新增：

- `components/booking-section.tsx`
- `app/api/appointments/route.ts`
- `lib/db.ts`
- `lib/appointment-contract.ts`
- `tests/booking-section.test.tsx`
- 新增预约契约/API 测试文件
- `.env.example`
- `.env.local.example`
- `supabase/migrations/20260821000000_create_appointments.sql`，作为幂等审计记录和 MCP 执行内容

预计不修改：现有 AI 图片 API、轮播组件、页面视觉样式和根目录迁移前静态文件。
