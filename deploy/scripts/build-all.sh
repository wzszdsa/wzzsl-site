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
install_and_build() {
  local dir="$1"; shift
  log "安装依赖：${dir#$REPO_ROOT/}"
  if [[ -f "$dir/package-lock.json" ]]; then
    (cd "$dir" && npm ci --no-audit --no-fund)
  else
    (cd "$dir" && npm install --no-audit --no-fund)
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
  install_and_build "$SITES/push-box" npm run build:web
  copy_tree "$SITES/push-box/dist" "$OUT/box"
}

build_demo() {
  log "前端练习合集：源码即产物，排除 IDE 与 VCS 目录"
  rm -rf "$OUT/demo"; mkdir -p "$OUT/demo"
  (cd "$SITES/html-css-js" && tar \
      --exclude='.git' --exclude='.idea' --exclude='.vscode' \
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
  install_and_build "$SITES/pet-care" npm run build
  log "宠物预约：保留 .next 与运行期依赖（Next.js 需常驻进程）"
  local pc_out="$OUT/petcare"
  rm -rf "$pc_out"; mkdir -p "$pc_out"
  cp -R "$SITES/pet-care/.next"      "$pc_out/.next"
  cp -R "$SITES/pet-care/public"     "$pc_out/public" 2>/dev/null || true
  cp    "$SITES/pet-care/package.json" "$pc_out/package.json"
  cp    "$SITES/pet-care/next.config.ts" "$pc_out/next.config.ts" 2>/dev/null || true
  (cd "$SITES/pet-care" && npm ci --omit=dev --no-audit --no-fund)
  copy_tree "$SITES/pet-care/node_modules" "$pc_out/node_modules"
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
