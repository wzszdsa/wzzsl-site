# 汪汪喵喵宠物洗护店

Next.js App Router + TypeScript 单页项目。

## 启动

~~~powershell
Copy-Item .env.local.example .env.local
npm run dev
~~~

打开 http://127.0.0.1:3000。当前受限环境如果拒绝绑定 3000，可使用 npm run dev -- --hostname 127.0.0.1 --port 4173。

## AI 绘图配置

在 .env.local 中配置：

~~~env
OPENAI_API_KEY=your_api_key_here
AI_IMAGE_ADMIN_TOKEN=your_local_admin_token
~~~

开发环境未配置 AI_IMAGE_ADMIN_TOKEN 时可以直接使用；配置后页面会显示令牌输入框。生产环境必须配置该令牌，接口还带有单进程内存限流：同一来源 10 分钟最多 5 次生成请求。

生成图会写入 public/assets/generated-reception.png、public/assets/generated-wash.png 或 public/assets/generated-care.png。该持久化方式适用于单机、可写磁盘的 self-hosted 部署；无服务器或多实例部署应改用对象存储。

## 检查

~~~powershell
npm test
npm run lint
npm run typecheck
npm run build
~~~

根目录的 index.html 和 server.mjs 是迁移前的静态版本，Next.js 不会使用它们；唯一入口是 Next.js 的 dev / build / start 脚本。
