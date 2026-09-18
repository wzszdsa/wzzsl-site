#!/usr/bin/env bash
# ============================================================
#  上传脚本 —— 将 .build/ 产物同步到阿里云 ECS
# ------------------------------------------------------------
#  用法：
#    bash deploy/scripts/upload.sh                 # 上传全部
#    bash deploy/scripts/upload.sh todo box        # 只上传指定站点
#    bash deploy/scripts/upload.sh --dry-run       # 只预览，不改动服务器
#
#  配置：复制 deploy/.env.deploy.example 为 deploy/.env.deploy 并填写。
#        该文件已在 .gitignore 中排除，不会被提交。
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO_ROOT/.build"
DEPLOY_ENV="$REPO_ROOT/deploy/.env.deploy"

log()  { printf '\033[36m[upload]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[upload]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[upload]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$DEPLOY_ENV" ]] || die "缺少配置文件：$DEPLOY_ENV（可从 .env.deploy.example 复制）"
# shellcheck disable=SC1090
set -a; source "$DEPLOY_ENV"; set +a

: "${SERVER_HOST:?请在 deploy/.env.deploy 中设置 SERVER_HOST}"
: "${SERVER_USER:?请在 deploy/.env.deploy 中设置 SERVER_USER}"
SERVER_PORT="${SERVER_PORT:-22}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/wzzsl}"
SSH_KEY="${SSH_KEY:-}"

DRY_RUN=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

# 静态站点顺序在前，两个 Node 服务在后（避免服务重启期间无内容可服务）
ALL_TARGETS=(portal todo box demo days yijian petcare yijian-api)

if [[ ${#ARGS[@]} -gt 0 ]]; then
  TARGETS=("${ARGS[@]}")
else
  TARGETS=("${ALL_TARGETS[@]}")
fi

need() { command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1"; }
need ssh
need tar

# rsync 在 Windows Git Bash 中默认不存在，此时降级为 tar over ssh。
# 两者语义一致：目标目录先清空再写入，等价于 rsync 的 --delete。
if command -v rsync >/dev/null 2>&1; then
  USE_RSYNC=1
else
  USE_RSYNC=0
  warn "未找到 rsync，改用 tar over ssh（功能等价）"
fi

SSH_OPTS=(-p "$SERVER_PORT" -o StrictHostKeyChecking=accept-new)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")
RSYNC_RSH="ssh ${SSH_OPTS[*]}"

RSYNC_FLAGS=(-az --delete --human-readable)
[[ $DRY_RUN -eq 1 ]] && RSYNC_FLAGS+=(--dry-run --itemize-changes)

# 安全护栏：确保待清空的远程目录确实是 REMOTE_ROOT 下的站点子目录，
# 避免变量为空或路径异常时误删服务器上的其他内容。
assert_safe_dest() {
  local name="$1" dest="$2"
  [[ -n "$name" && "$name" != "/" && "$name" != "." && "$name" != ".." ]] \
    || die "非法的站点名：'$name'"
  [[ "$dest" == "$REMOTE_ROOT"/* ]] \
    || die "拒绝操作：目标 '$dest' 不在 $REMOTE_ROOT 之下"
}

push_dir() {
  local name="$1"
  local src="$OUT/$name"
  [[ -d "$src" ]] || die "产物不存在：$src（请先执行 build-all.sh $name）"

  local remote_path="$REMOTE_ROOT/$name"
  assert_safe_dest "$name" "$remote_path"

  if [[ $USE_RSYNC -eq 1 ]]; then
    local dest="$SERVER_USER@$SERVER_HOST:$remote_path/"
    log "同步 $name → $dest"
    # shellcheck disable=SC2086
    rsync "${RSYNC_FLAGS[@]}" -e "$RSYNC_RSH" "$src/" "$dest"
  else
    log "同步 $name → $SERVER_USER@$SERVER_HOST:$remote_path（tar over ssh）"
    if [[ $DRY_RUN -eq 1 ]]; then
      local size count
      size=$(du -sh "$src" | cut -f1)
      count=$(find "$src" -type f | wc -l)
      log "  [dry-run] 将上传 $count 个文件，共 $size"
      return 0
    fi
    # 先确保目标存在，再清空其内容（-mindepth 1 保留目录自身），最后解包
    tar -czf - -C "$src" . | ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" \
      "set -e
       mkdir -p '$remote_path'
       find '$remote_path' -mindepth 1 -delete
       tar -xzf - -C '$remote_path'"
  fi
}

restart_service() {
  local unit="$1"
  log "重启服务：$unit"
  # shellcheck disable=SC2086
  ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "sudo systemctl restart $unit && systemctl is-active $unit"
}

for t in "${TARGETS[@]}"; do
  case "$t" in
    yijian-api)
      push_dir yijian-api
      # 服务文件变化时需先 daemon-reload；此处只在缺失时安装
      if [[ $DRY_RUN -eq 0 ]]; then
        # shellcheck disable=SC2086
        ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" \
          "test -f /etc/systemd/system/yijian-api.service || { sudo cp $REMOTE_ROOT/yijian-api/yijian-api.service /etc/systemd/system/ 2>/dev/null || true; sudo systemctl daemon-reload; }"
      fi
      restart_service yijian-api
      ;;
    petcare)
      push_dir petcare
      restart_service petcare
      ;;
    portal|todo|box|demo|days|yijian)
      push_dir "$t"
      ;;
    *)
      die "未知上传目标：$t"
      ;;
  esac
done

echo
if [[ $DRY_RUN -eq 1 ]]; then
  log "预览模式结束，未对服务器做任何改动"
else
  log "上传完成。若 Nginx 配置有变动，请在服务器执行：sudo nginx -t && sudo systemctl reload nginx"
fi
