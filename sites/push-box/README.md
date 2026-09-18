# 仓库搬运工 - 推箱子

一个无依赖的静态网页推箱子小游戏，采用暖色仓库风格，适合桌面和移动端游玩。

## 功能

- 6 个可解关卡
- 方向键、WASD、移动端按钮控制
- 重置关卡与撤销一步
- 移动次数、推动次数统计
- 生成的仓库搬运工人物与木箱 PNG 素材
- 原生 HTML、CSS、JavaScript，无框架运行时依赖

## 本地运行

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

打开 http://127.0.0.1:4173/。

## 测试

```powershell
npm test
node --check .\app.js
```

## 操作

- 方向键或 WASD：移动
- R：重置当前关卡
- Z：撤销一步

## 项目结构

- `index.html`：页面结构
- `styles.css`：暖色仓库视觉样式
- `game.js`：关卡解析与推箱子核心规则
- `app.js`：界面渲染和交互
- `assets/`：人物与木箱图片素材
- `tests/`：核心逻辑与素材引用测试

## PC 与 Android 打包

### Windows x64

```powershell
npm run desktop:make
```

产物位于 `release/desktop/make/`：

- `squirrel.windows/x64/warm-warehouse-sokoban-Setup.exe`：Windows 安装包
- `zip/win32/x64/warm-warehouse-sokoban-win32-x64-1.0.0.zip`：便携版

### Android

本地需要 JDK 21、Android SDK 和 Gradle；同步工程：

```powershell
npm run android:sync
```

生成本地 debug APK：

```powershell
npm run android:build
```

GitHub Actions 会在每次推送到 `main` 后构建 Android debug APK，并将 APK 作为工作流 artifact 保存。正式签名和应用商店发布不包含在当前版本中。

