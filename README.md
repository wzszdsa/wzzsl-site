# 驿见 · 快递聚合查询 MVP

一个面向网页和 Android 的快递聚合查询应用：邮箱登录、邮箱验证码、密码登录、运单号查件、地图轨迹展示、包裹状态、到站取件码和“我已取件”后的取件码清理规则均已做成可交互流程。

## 当前完成

- 响应式 Web 工作台：桌面端侧边栏，移动端折叠菜单。
- 邮箱登录和注册：邮箱验证码用于验证身份，注册时必须设置 6-128 位登录密码；早期仅验证码账号可在“账号设置”中补充密码。
- 后端认证：注册、密码哈希、验证码校验、会话 Cookie、登录态恢复、退出登录；认证状态在启动时恢复，错误和加载状态有明确反馈。
- 邮件适配器：开发环境 `console` 演示模式；生产环境使用 Resend 邮件服务。
- 验证码安全控制：5 分钟过期、60 秒重发间隔、单小时发送上限、错误次数上限。
- 持久化：部署环境使用 Supabase 关系表；本地 `netlify dev` 使用 `.netlify-local-data`，不会提交到版本库。
- 承运商识别：顺丰、京东、中通、圆通、韵达、申通、极兔、德邦、EMS 等；服务端通过快递100自动识别运单号对应的平台。
- 包裹状态：待取件、运输中、已完成；支持搜索、筛选、文字轨迹和地图轨迹面板。
- 取件码：默认脱敏，支持显示、复制；点击“我已取件”后立即删除。
- Capacitor Android 工程：应用 ID 为 `com.yijian.parcels`。

## 本地运行网页演示

```powershell
cd D:\codex\purchase
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。此命令只启动 Vite，后端接口不可用时页面会回退到演示验证码模式。

## 本地运行前后端

推荐使用 Netlify Dev：

```powershell
cd D:\codex\purchase
$env:SMS_PROVIDER = "console"
$env:AUTH_EXPOSE_DEMO_CODE = "true"
npm run dev:netlify
```

打开 `http://localhost:8888/`。点击“获取验证码”后，接口会返回演示码并在页面提示；这不会向真实邮箱发送邮件。

Android 如果要访问已部署的网页和后端，推荐让 Capacitor 加载同源的 Netlify 站点：

```powershell
$env:CAPACITOR_SERVER_URL = "https://yijian-express.netlify.app"
npm run build
npx cap sync android
```

未设置时，Android 包使用本地资源；设置后 Android 会加载线上站点，网页、Functions、会话 Cookie 和邮箱验证码接口保持同源。

## 真实邮件服务：Resend

1. 创建 Resend Token。
2. 准备一个已验证的发件人地址或域名。
3. 在 Netlify 环境变量中配置：

```text
EMAIL_PROVIDER=resend
RESEND_TOKEN=...
EMAIL_FROM=驿见 <no-reply@你的已验证域名>
EMAIL_SUBJECT=驿见邮箱验证码
AUTH_EXPOSE_DEMO_CODE=false
```

真实 API Key 只配置在 Netlify 环境变量中，前端不会读取。

## Supabase 数据库配置（生产默认）

认证接口使用 Supabase Postgres 保存账号、验证码挑战和会话：

- `yijian_users`：邮箱、密码哈希、验证时间和创建时间；邮箱由唯一索引保证不重复。
- `yijian_otp_challenges`：每个邮箱和用途只保留一个当前验证码，服务端只保存哈希，验证码使用后不可重放。
- `yijian_sessions`：只保存不可逆的会话令牌摘要，账号删除时会级联清理会话。

数据库迁移文件位于 `supabase/migrations/`。密码补设置迁移为 `20260911133000_yijian_password_setup.sql`：为老账号增加 `password_set_at`，已有密码不变，`password_hash is null` 的已登录账号可补设置密码。生产环境在 Netlify Functions 中配置：

```text
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET_KEY=服务端 secret，只放在 Netlify Functions 环境变量中
```

`SUPABASE_SECRET_KEY` 不能写入前端、不能使用 `VITE_` 前缀，也不能提交到 Git。当前仓库已保留 RLS 和服务端权限限制：浏览器不直接访问认证表，认证接口通过服务端 Supabase 客户端读写。

### 可选 MySQL 回退

如果明确需要 MySQL，可改为 `STORAGE_PROVIDER=mysql`，并配置 `MYSQL_URL`、`MYSQL_SSL` 和 `MYSQL_CONNECTION_LIMIT`。建表脚本仍保留在 `mysql/schema.sql`，但生产默认不再依赖 MySQL。
## 运单号查快递（快递100）

登录用户手动输入运单号后，服务端先调用快递100单号识别接口识别承运商，再调用实时查询接口，并将物流状态和轨迹保存到 Supabase。前端会优先展示上游返回的坐标轨迹；若上游仅返回文字位置，则明确提示并保留完整文字轨迹，不伪造地图点位；开通坐标解析后可通过 `KUAIDI100_RESULTV2=5` 让服务端保存返回的 `areaCenter` 坐标。快递100不作为手机号反查运单号的通用第三方服务使用。

在 Netlify 环境变量中配置：

```text
KUAIDI100_KEY=...
KUAIDI100_CUSTOMER=...
KUAIDI100_TRACK_QUERY_URL=https://poll.kuaidi100.com/poll/query.do
KUAIDI100_RECOGNIZE_URL=https://www.kuaidi100.com/autonumber/autoComNum
# 可选：开通行政区域/地图坐标解析后再配置
KUAIDI100_RESULTV2=5
```

- `POST /api/parcels/query-tracking`：登录后提交一个运单号，查询并同步物流轨迹。
- `GET /api/parcels`：获取当前登录用户已同步的包裹和轨迹。
- 取件码不是由普通物流轨迹推测的，只有上游授权数据明确返回时才会保存和展示。
- 地图坐标字段为可选值：`latitude` / `longitude` 只在承运商接口明确返回时写入 `yijian_parcel_events`。

包裹表定义位于 `supabase/migrations/20260910111618_yijian_parcel_storage.sql`，地图坐标扩展位于 `supabase/migrations/20260911120000_yijian_parcel_event_coordinates.sql`。部署前请在 Supabase SQL Editor 依次执行两份迁移，或使用已链接的 Supabase CLI 推送迁移。

## 后端接口

- `POST /api/auth/send-code`：发送验证码；请求体 `{ email, purpose: "login" | "register" }`，返回 `retryAfter` 供前端倒计时。
- `POST /api/auth/register`：邮箱验证码注册并设置密码；请求体 `{ email, code, password }`。
- `POST /api/auth/login`：验证码或密码登录；请求体 `{ email, mode, code?, password? }`。
- `GET /api/auth/me`：读取当前登录态；未登录返回 `401`，认证接口统一返回 JSON 且禁止缓存。
- `POST /api/auth/logout`：销毁当前会话。
- `POST /api/auth/set-password`：已登录且尚未设置密码的账号设置 6-128 位登录密码；已有密码的账号不会被覆盖。

## 构建 Android Debug APK

```powershell
cd D:\codex\purchase
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

APK 输出：

`D:\codex\purchase\yijian-debug.apk`

## 当前仍待完善

本地代码已经接入快递100单号识别、实时查询、Supabase持久化和坐标字段兼容；上线前仍需完成：

1. 在目标 Supabase 项目执行两份包裹迁移，并查询确认 `yijian_parcels`、`yijian_parcel_events` 可访问；
2. 配置生产环境快递100、Resend、Supabase 密钥，并完成一次真实运单查询；
3. 若要显示真实地图底图，需要接入承运商明确返回经纬度的地图轨迹接口或经过授权的地理编码服务；当前无坐标时只显示文字轨迹；
4. 后台定时同步、推送通知、数据删除任务、日志审计和隐私政策。

无法从授权接口获得取件码的平台，只显示物流状态，不生成或猜测取件码。
