# wzzsl-site

个人网站主仓库（monorepo）。所有对外站点集中在本仓库统一管理、统一构建、统一部署。

- **主域名**：`wzzsl.fun`
- **托管**：阿里云 ECS（境外地域，免 ICP 备案）
- **入口**：Nginx 反向代理，按子域名分流
- **部署**：本地构建 → 上传至服务器（不依赖任何平台即服务）

## 站点一览

| 子域 | 项目 | 目录 | 技术栈 | 构建产物 |
|---|---|---|---|---|
| `wzzsl.fun` | 门户页 | `portal/` | 静态 HTML/CSS | 源码即产物 |
| `todo.wzzsl.fun` | 待办清单 | `sites/todo_list/` | Vite + React | `dist/` |
| `box.wzzsl.fun` | 推箱子游戏 | `sites/push-box/` | 原生 JS | `dist/` |
| `demo.wzzsl.fun` | 前端练习合集 | `sites/html-css-js/` | 原生 HTML/CSS/JS | 源码即产物 |
| `days.wzzsl.fun` | 纪念日 PWA | `sites/date-reminder/` | Vite + React | `dist/` |
| `yijian.wzzsl.fun` | 驿见快递查询 | `sites/yijian-express/` | Vite + React + Node API | `dist/` + Node 服务 |
| `petcare.wzzsl.fun` | 宠物预约 | `sites/pet-care/` | Next.js + PostgreSQL | `.next/` + Node 服务 |

## 目录结构

```
wzzsl-site/
├── portal/                 门户页（主域内容）
├── sites/                  各子项目（由 git subtree 导入，保留各自提交历史）
│   ├── todo_list/
│   ├── push-box/
│   ├── html-css-js/
│   ├── date-reminder/
│   ├── yijian-express/
│   └── pet-care/
├── deploy/                 部署资产
│   ├── nginx/              Nginx 站点配置
│   ├── systemd/            Node 服务单元文件
│   └── scripts/            本地构建与上传脚本
└── docs/                   架构、DNS 与部署文档
```

## 快速开始

```bash
# 本地构建全部站点（产物汇总到 .build/）
bash deploy/scripts/build-all.sh

# 上传到服务器（需先配置环境变量，见 docs/deployment.md）
bash deploy/scripts/upload.sh
```

## 文档

- [架构与路由](docs/architecture.md) —— 请求如何经 Nginx 分流到各子项目
- [DNS 记录](docs/dns.md) —— 阿里云 DNS 需要配置的记录清单
- [部署手册](docs/deployment.md) —— 服务器初始化与发布流程

## 关于子项目

`sites/` 下的项目由 `git subtree` 导入，**保留各自的完整提交历史**，同时仍可独立开发：

```bash
# 拉取某个子项目上游的更新
git subtree pull --prefix=sites/todo_list https://github.com/wzszdsa/todo_list.git main

# 把本仓库内对该子项目的修改推回其独立仓库
git subtree push --prefix=sites/todo_list https://github.com/wzszdsa/todo_list.git main
```
