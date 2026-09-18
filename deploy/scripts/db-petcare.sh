#!/usr/bin/env bash
# ============================================================
#  宠物洗护数据库查询助手（PostgreSQL）
# ------------------------------------------------------------
#  用法：
#    bash deploy/scripts/db-petcare.sh                     # 进入交互式 psql
#    bash deploy/scripts/db-petcare.sh "SELECT * FROM appointments;"
#    bash deploy/scripts/db-petcare.sh --tables            # 列出所有表
#    bash deploy/scripts/db-petcare.sh --recent            # 最近的预约记录
#    bash deploy/scripts/db-petcare.sh --count             # 各状态记录数
#    bash deploy/scripts/db-petcare.sh --tunnel            # 开 SSH 隧道给图形化工具
#
#  连接信息取自 deploy/.env.deploy（服务器）与 deploy/.env.secrets（密码），
#  两者均已被 .gitignore 排除。
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_ENV="$REPO_ROOT/deploy/.env.deploy"
SECRETS_ENV="$REPO_ROOT/deploy/.env.secrets"

die() { printf '\033[31m[db]\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[36m[db]\033[0m %s\n' "$*" >&2; }

[[ -f "$DEPLOY_ENV"  ]] || die "缺少 $DEPLOY_ENV"
[[ -f "$SECRETS_ENV" ]] || die "缺少 $SECRETS_ENV"

# shellcheck disable=SC1090
set -a; source "$DEPLOY_ENV"; set +a
# shellcheck disable=SC1090
set -a; source "$SECRETS_ENV"; set +a

: "${SERVER_HOST:?未配置 SERVER_HOST}"
: "${SERVER_USER:?未配置 SERVER_USER}"
: "${PETCARE_DB_PASSWORD:?未配置 PETCARE_DB_PASSWORD}"

SERVER_PORT="${SERVER_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
DB_NAME="${PETCARE_DB_NAME:-petcare}"
DB_USER="${PETCARE_DB_USER:-petcare}"
DB_PORT="${PETCARE_DB_PORT:-5432}"
TUNNEL_PORT="${PETCARE_TUNNEL_PORT:-15432}"

SSH_OPTS=(-p "$SERVER_PORT" -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "${SSH_KEY/#\~/$HOME}")

# 在服务器上执行 psql；SQL 经 stdin 传入，避免引号转义问题
run_sql() {
  ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" \
    "cd /tmp && PGPASSWORD='$PETCARE_DB_PASSWORD' psql -h 127.0.0.1 -p $DB_PORT -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 $1"
}

open_tunnel() {
  log "建立 SSH 隧道：本地 127.0.0.1:$TUNNEL_PORT → 服务器 127.0.0.1:$DB_PORT"
  log "保持此窗口开启，然后在图形化工具中连接："
  log "  主机 127.0.0.1   端口 $TUNNEL_PORT   库 $DB_NAME   用户 $DB_USER"
  log "  密码见 deploy/.env.secrets 中的 PETCARE_DB_PASSWORD"
  log "（按 Ctrl+C 断开）"
  exec ssh "${SSH_OPTS[@]}" -N -L "$TUNNEL_PORT:127.0.0.1:$DB_PORT" "$SERVER_USER@$SERVER_HOST"
}

case "${1:-}" in
  --tunnel)
    open_tunnel
    ;;
  --tables)
    run_sql "-c '\\dt'"
    ;;
  --recent)
    run_sql "-c \"SELECT id, customer_name, phone, pet_name, pet_type, service, appointment_time, status, created_at FROM appointments ORDER BY created_at DESC LIMIT 20;\""
    ;;
  --count)
    run_sql "-c \"SELECT status, count(*) AS 数量 FROM appointments GROUP BY status ORDER BY status;\""
    run_sql "-tAc \"SELECT '合计: ' || count(*) FROM appointments;\""
    ;;
  "")
    log "进入交互式 psql（\\q 退出，\\dt 看表，\\d appointments 看结构）"
    exec ssh "${SSH_OPTS[@]}" -t "$SERVER_USER@$SERVER_HOST" \
      "cd /tmp && PGPASSWORD='$PETCARE_DB_PASSWORD' psql -h 127.0.0.1 -p $DB_PORT -U $DB_USER -d $DB_NAME"
    ;;
  *)
    run_sql "-c \"$1\""
    ;;
esac
