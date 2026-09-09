# 驿见 · 快递聚合查询 MVP

一个面向网页和 Android 的快递聚合查询应用：手机号登录、短信验证码、授权数据来源、包裹状态、到站取件码和“我已取件”后的取件码清理规则均已做成可交互流程。

## 当前完成

- 响应式 Web 工作台：桌面端侧边栏，移动端折叠菜单。
- 邮箱登录和注册：邮箱验证码登录/注册、密码登录/注册。
- 后端认证：注册、密码哈希、验证码校验、会话 Cookie、登录态恢复、退出登录；认证状态在启动时恢复，错误和加载状态有明确反馈。
- 邮件适配器：开发环境 `console` 演示模式；生产环境使用 Resend 邮件服务。
- 验证码安全控制：5 分钟过期、60 秒重发间隔、单小时发送上限、错误次数上限。
- 持久化：部署环境使用 Supabase 关系表；本地 `netlify dev` 使用 `.netlify-local-data`，不会提交到版本库。
- 首发平台展示：顺丰速运、京东物流、中通快递、圆通速递、韵达快递。
- 包裹状态：待取件、运输中、已完成；支持搜索、筛选和轨迹抽屉。
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

打开 `http://localhost:8888/`。点击“获取验证码”后，接口会返回演示码并在页面提示；这不会向真实手机号发送短信。

Android 如果要访问已部署的网页和后端，推荐让 Capacitor 加载同源的 Netlify 站点：

```powershell
$env:CAPACITOR_SERVER_URL = "https://yijian-express.netlify.app"
npm run build
npx cap sync android
```

未设置时，Android 包使用本地资源；设置后 Android 会加载线上站点，网页、Functions、会话 Cookie 和短信接口保持同源。

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

## Supabase 数据库配置

认证接口使用关系型表保存账号、验证码挑战和会话：

- `public.yijian_users`：邮箱、密码哈希、验证时间和创建时间；邮箱由数据库唯一约束保证不重复。
- `public.yijian_otp_challenges`：每个邮箱和用途只保留一个当前验证码，服务端只保存哈希，验证码使用后不可重放。
- `public.yijian_sessions`：只保存不可逆的会话令牌摘要，账号删除时会级联清理会话。

迁移文件为 `supabase/migrations/20260908150026_yijian_auth_relational_storage.sql`。它会从上一版 `public.yijian_kv` 回填已有账号和未过期会话；旧表暂不删除，便于回滚和核对。三张新表均启用 RLS，并撤销 `anon` / `authenticated` 访问，只由 Netlify Functions 使用服务端 Supabase secret 读写。

部署环境配置：

```text
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET=服务端 secret，只放在 Netlify Functions 环境变量中
# 或使用 SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY
```

本地迁移准备：

```powershell
npx supabase login
npx supabase link --project-ref 你的项目 ref
npx supabase db push
```

执行远程迁移前，请确认 Supabase 项目和数据库备份；不要把 secret 写入前端或提交到仓库。迁移后再在 Netlify 的 Functions 环境变量中配置同一组 `SUPABASE_URL` 和 secret，并重新部署。

## 后端接口

- `POST /api/auth/send-code`：发送验证码；请求体 `{ email, purpose: "login" | "register" }`，返回 `retryAfter` 供前端倒计时。
- `POST /api/auth/register`：验证码注册；请求体 `{ email, code, password? }`。
- `POST /api/auth/login`：验证码或密码登录；请求体 `{ email, mode, code?, password? }`。
- `GET /api/auth/me`：读取当前登录态；未登录返回 `401`，认证接口统一返回 JSON 且禁止缓存。
- `POST /api/auth/logout`：销毁当前会话。

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

## 当前仍待接入

账号和短信后端已经接入，物流部分仍是交互演示数据。真实上线还需要继续接入：

1. 官方或授权的快递聚合 API；
2. 各平台的授权、物流字段和取件码能力适配；
3. 后台定时同步、推送通知和数据删除任务；
4. 生产环境数据库/Blob 权限、日志审计、隐私政策和短信资质配置。

无法从授权接口获得取件码的平台，只显示物流状态，不生成或猜测取件码。