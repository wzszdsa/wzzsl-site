#!/usr/bin/env bash
# ============================================================
#  本地构建脚本 —— 汇总全部站点产物到 .build/
# ------------------------------------------------------------
#  用法：
#    bash deploy/scripts/build-all.sh              # 构建全部
#    bash deploy/scripts/build-all.sh todo box     # 只构建指定站点
#    bash deploy/scripts/build-all.sh --list       # 列出可构建目标
#
#  产物布局（与 Nginx 的 /srv/wzzsl/<name>/ 一一对应）：
#    .build/portal/      门户
#    .build/todo/        待办清单
#    .build/box/         推箱子
#    .build/demo/        前端练习合集
#    .build/days/        纪念日
#    .build/yijian/      驿见前端
#    .build/yijian-api/  驿见 API（Node 服务）
#    .build/petcare/     宠物预约（Next.js 独立部署）
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITES="$REPO_ROOT/sites"
OUT="$REPO_ROOT/.build"

ALL_TARGETS=(portal todo box demo days yijian yijian-api petcare)

log()  { printf '\033[36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[build]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[build]\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1"; }

# ---------- 参数解析 ----------
if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${ALL_TARGETS[@]}"
  exit 0
fi

if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=("${ALL_TARGETS[@]}")
fi

for t in "${TARGETS[@]}"; do
  found=0
  for a in "${ALL_TARGETS[@]}"; do [[ "$t" == "$a" ]] && found=1; done
  [[ $found -eq 1 ]] || die "未知构建目标：$t（可用目标见 --list）"
done

need node
need npm

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || warn "当前 Node 主版本为 $NODE_MAJOR，建议使用 20 或更高"

mkdir -p "$OUT"

# 在子项目内安装依赖并构建；npm ci 需要 lock 文件，缺失时回退到 install
# 设 SKIP_INSTALL=1 可在 node_modules 已存在时跳过安装，加快重复构建
install_and_build() {
  local dir="$1"; shift
  if [[ "${SKIP_INSTALL:-0}" == "1" && -d "$dir/node_modules" ]]; then
    log "跳过依赖安装（SKIP_INSTALL=1 且 node_modules 已存在）"
  else
    log "安装依赖：${dir#$REPO_ROOT/}"
    if [[ -f "$dir/package-lock.json" ]]; then
      (cd "$dir" && npm ci --no-audit --no-fund)
    else
      (cd "$dir" && npm install --no-audit --no-fund)
    fi
  fi
  if [[ $# -gt 0 ]]; then
    log "执行构建：${dir#$REPO_ROOT/} → $*"
    (cd "$dir" && "$@")
  fi
}

copy_tree() {
  local src="$1" dst="$2"
  rm -rf "$dst"
  mkdir -p "$dst"
  cp -R "$src/." "$dst/"
}

# ---------- 各站点构建 ----------
build_portal() {
  log "门户：直接复制源码"
  copy_tree "$REPO_ROOT/portal" "$OUT/portal"
}

build_todo() {
  install_and_build "$SITES/todo_list" npm run build
  copy_tree "$SITES/todo_list/dist" "$OUT/todo"
}

build_box() {
  # push-box 的 build:web 只是把静态文件复制到 dist/（仅用 node 内置模块），
  # 不需要任何依赖。而它的 devDependencies 含 Electron 与 Capacitor，
  # 安装会下载上百 MB 二进制 —— 对网页构建毫无用处，因此跳过安装。
  log "推箱子：build:web 仅复制文件，跳过依赖安装"
  (cd "$SITES/push-box" && node scripts/build-static.mjs)
  copy_tree "$SITES/push-box/dist" "$OUT/box"
}

build_demo() {
  log "前端练习合集：源码即产物，排除 IDE / VCS / 源码目录"
  rm -rf "$OUT/demo"; mkdir -p "$OUT/demo"
  # ts/ 是 TypeScript 源码练习（app.ts + 1.9MB node_modules），没有任何页面引用它，
  # 也不是可浏览的网页，因此不纳入部署。img/ 则被 lsxm3 引用，必须保留。
  (cd "$SITES/html-css-js" && tar \
      --exclude='.git' --exclude='.idea' --exclude='.vscode' \
      --exclude='./ts' \
      -cf - .) | (cd "$OUT/demo" && tar -xf -)
}

build_days() {
  install_and_build "$SITES/date-reminder" npm run build
  copy_tree "$SITES/date-reminder/dist" "$OUT/days"
  # 该仓库根目录的 APK 属 Android 产物，与网页部署无关，不纳入
  rm -f "$OUT/days/date-reminder.apk"
}

build_yijian() {
  install_and_build "$SITES/yijian-express" npm run build
  copy_tree "$SITES/yijian-express/dist" "$OUT/yijian"
}

build_yijian_api() {
  log "驿见 API：打包 serverless 函数（Supabase 依赖已替换为占位模块）"
  local adapter="$REPO_ROOT/deploy/yijian-adapter"

  # 函数依赖（mysql2、resend 等）必须先安装：esbuild 会从源项目目录
  # 向上解析这些包，缺失时会直接报 Could not resolve。
  if [[ ! -d "$SITES/yijian-express/node_modules" ]]; then
    log "安装驿见项目依赖（供函数打包解析）"
    (cd "$SITES/yijian-express" && npm ci --no-audit --no-fund)
  fi

  if [[ ! -d "$adapter/node_modules/esbuild" ]]; then
    log "安装适配层构建依赖：esbuild"
    (cd "$adapter" && npm install --no-audit --no-fund esbuild --save-dev)
  fi
  (cd "$adapter" && node build.mjs)

  # 产物自包含（mysql2 已打进 bundle），无需再向服务器分发 node_modules
  log "驿见 API 产物：$OUT/yijian-api（自包含，无外部依赖）"
}

build_petcare() {
  # 注意：重复构建时，Next.js 会先清空已有的 .next 目录。若在带「安全删除」
  # 拦截机制的环境中运行（例如某些受管控的 IDE 终端），大量 unlinkSync 调用
  # 可能被判定为批量删除而被拦截，导致 next build 报错中止。
  # 现象：Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] ...
  # 处理：手动删除 .next 后重试，或在普通终端中执行本脚本。
  install_and_build "$SITES/pet-care" npm run build
  log "宠物预约：组装部署产物（Next.js 需常驻进程）"
  local pc_out="$OUT/petcare"
  rm -rf "$pc_out"; mkdir -p "$pc_out"

  # 必须用 -L 解引用：Next.js 会在 .next/node_modules/ 下创建指向源项目
  # node_modules 的**绝对路径**符号链接（形如 pg-<hash> -> /d/.../node_modules/pg）。
  # Windows 的 cp -R 无法复现该链接，且绝对路径在服务器上无效，
  # 因此解引用为实体文件，使 .next 自包含。
  cp -RL "$SITES/pet-care/.next" "$pc_out/.next"
  cp -RL "$SITES/pet-care/public" "$pc_out/public" 2>/dev/null || true
  cp -f  "$SITES/pet-care/package.json"      "$pc_out/package.json"
  cp -f  "$SITES/pet-care/package-lock.json" "$pc_out/package-lock.json" 2>/dev/null || true
  cp -f  "$SITES/pet-care/next.config.ts"    "$pc_out/next.config.ts" 2>/dev/null || true

  # 在产物目录内安装生产依赖 —— 不触碰源项目的开发环境
  # （此前写法会在源项目里跑 npm ci --omit=dev，会清掉 vitest/eslint 等开发依赖）
  log "安装生产依赖到产物目录"
  (cd "$pc_out" && npm ci --omit=dev --no-audit --no-fund)
}

# ---------- 执行 ----------
for t in "${TARGETS[@]}"; do
  case "$t" in
    portal)     build_portal ;;
    todo)       build_todo ;;
    box)        build_box ;;
    demo)       build_demo ;;
    days)       build_days ;;
    yijian)     build_yijian ;;
    yijian-api) build_yijian_api ;;
    petcare)    build_petcare ;;
  esac
done

echo
log "构建完成，产物位于：$OUT"
du -sh "$OUT"/* 2>/dev/null | sed 's/^/       /' || true
