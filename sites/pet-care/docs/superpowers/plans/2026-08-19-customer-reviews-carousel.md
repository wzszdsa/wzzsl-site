# 客户评价动画轮播图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将首页“真实口碑”静态评价卡片升级为可自动播放、可手动控制、响应式且支持减少动画偏好的评价轮播图。

**Architecture:** 保留 `ReviewsSection` 负责页面结构，将交互抽到独立的 `ReviewsCarousel` 客户端组件。组件使用 React 状态与定时器实现循环切换，通过按钮、圆点和键盘操作提供控制；全局 CSS 补充评价轮播所需的布局和过渡样式。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Vitest。

**Spec:** 本次对话中用户确认的客户评价动画轮播方案。

## Global Constraints

- 不引入第三方轮播库。
- 桌面端展示当前卡片并露出相邻卡片，移动端单卡展示。
- 自动轮播间隔约 4.5 秒；悬停暂停；支持上一条、下一条和圆点切换。
- 尊重 `prefers-reduced-motion: reduce`。
- 回答始终使用中文；实现必须通过现有测试、类型检查、Lint 与构建验证。

---

### Task 1: 建立轮播行为的失败测试

**Files:**
- Create: `tests/reviews-carousel.test.tsx`

**Interfaces:**
- Consumes: 待实现的 `ReviewsCarousel` 组件。
- Produces: 对初始渲染、可访问控件、自动播放间隔约定和循环索引逻辑的约束。

- [x] **Step 1: 写失败测试**
  - 使用 `renderToStaticMarkup` 验证评价文案、控制按钮、圆点和无障碍标签存在。
  - 使用纯函数测试循环索引逻辑；项目当前未配置 DOM 测试环境，因此不额外引入测试库。
- [x] **Step 2: 运行测试确认失败**
  - Run: `npm test -- tests/reviews-carousel.test.tsx`
  - Expected: 首次因 `ReviewsCarousel` 模块不存在而失败，随后进入实现。

### Task 2: 实现客户端评价轮播组件

**Files:**
- Create: `components/reviews-carousel.tsx`
- Modify: `components/store-sections.tsx`

**Interfaces:**
- `ReviewsCarousel` 无必需 props，内部维护现有三条评价数据。
- 暴露可访问的 `button` 控件：上一条、下一条以及每个评价对应的圆点。

- [x] **Step 1: 写最小实现**
  - 添加 `'use client'`，使用 `activeIndex` 管理当前评价。
  - 使用 `setInterval` 每 4500ms 循环到下一条；按钮和圆点操作会重启计时。
  - 通过 `prefers-reduced-motion` 在用户偏好减少动画时关闭自动播放。
  - 为轮播容器设置 `aria-roledescription="carousel"`，为当前卡片设置 `aria-current`/`aria-hidden` 等语义。
  - 在 `ReviewsSection` 中替换原有 `.grid-3` 静态渲染，保留标题和说明文案。
- [x] **Step 2: 运行目标测试确认通过**
  - Run: `npm test -- tests/reviews-carousel.test.tsx`
  - Result: PASS，2 个测试通过。

### Task 3: 添加响应式布局和动画样式

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- 轮播组件使用 `.reviews-carousel`、`.reviews-viewport`、`.review-slide`、`.reviews-controls` 等稳定 class。

- [x] **Step 1: 添加桌面和移动端样式**
  - 桌面端让卡片横向错位展示，当前卡片突出并露出相邻卡片；移动端隐藏非当前卡片并保持单卡阅读宽度。
  - 增加 opacity/transform/box-shadow 过渡与焦点样式。
  - 使用 `@media (prefers-reduced-motion: reduce)` 关闭过渡；组件逻辑同时关闭自动播放。
- [x] **Step 2: 运行回归测试**
  - Run: `npm test`
  - Result: PASS，4 个测试文件、10 个测试通过。

### Task 4: 完整验证

**Files:**
- No additional files.

- [x] **Step 1: 执行类型检查**
  - Run: `npm run typecheck`
  - Result: exit code 0。
- [x] **Step 2: 执行 Lint**
  - Run: `npm run lint`
  - Result: exit code 0，无错误。
- [x] **Step 3: 执行生产构建**
  - Run: `npm run build`
  - Result: exit code 0，Next.js 16.3.1 生产构建成功。
- [x] **Step 4: 检查变更范围**
  - Run: `git diff --check; git status --short`
  - Result: 无 diff check 错误；仅保留轮播实现、样式、测试和计划文件。
