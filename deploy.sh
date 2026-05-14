#!/usr/bin/env bash
# Deploy Volt-Pos (frontend + backend) to production.
#
# Usage:
#   ./deploy.sh                    # all (default): build front + rsync front + rsync back + restart pm2
#   ./deploy.sh frontend           # only frontend (build + rsync + restart pm2)
#   ./deploy.sh backend            # only backend (rsync + pip install + restart pm2)
#   ./deploy.sh backend --migrate  # backend + alembic upgrade head
#   ./deploy.sh all --migrate      # everything + migrations
#
# Env overrides:
#   DEPLOY_SSH_HOST=root@138.199.162.46    # remote (user@host or ssh-config alias)
#   DEPLOY_REMOTE_FRONTEND=/opt/voltpos/frontend
#   DEPLOY_REMOTE_BACKEND=/opt/voltpos/backend
#   DEPLOY_PM2_APP=voltpos-api
#   DEPLOY_NO_RESTART=1            # skip pm2 restart
#
# Notes:
#   - Backend .env is NOT rsynced (excluded). Edit it on the server directly.
#   - Migrations are NOT run by default — pass --migrate explicitly.
#   - Requires SSH key access for the remote host (no password prompt).

set -euo pipefail

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${DEPLOY_SSH_HOST:-root@138.199.162.46}"
REMOTE_FRONTEND="${DEPLOY_REMOTE_FRONTEND:-/opt/voltpos/frontend}"
REMOTE_BACKEND="${DEPLOY_REMOTE_BACKEND:-/opt/voltpos/backend}"
PM2_APP="${DEPLOY_PM2_APP:-voltpos-api}"

TARGET="all"
DO_MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    frontend|front|fe) TARGET="frontend" ;;
    backend|back|be)   TARGET="backend" ;;
    all)               TARGET="all" ;;
    --migrate|-m)      DO_MIGRATE=1 ;;
    --help|-h)
      sed -n '2,22p' "${BASH_SOURCE[0]}" >&2
      exit 0 ;;
    *)
      echo "Unknown arg: $arg (use --help)" >&2
      exit 2 ;;
  esac
done

restart_pm2() {
  if [[ "${DEPLOY_NO_RESTART:-0}" == "1" ]]; then
    echo >&2 "DEPLOY: skip pm2 restart (DEPLOY_NO_RESTART=1)"
    return
  fi
  echo >&2 "DEPLOY: restarting ${PM2_APP} on ${REMOTE_HOST}"
  ssh "${REMOTE_HOST}" "pm2 restart ${PM2_APP} --update-env"
}

deploy_frontend() {
  echo >&2 "DEPLOY frontend: build → rsync → ${REMOTE_HOST}:${REMOTE_FRONTEND}"
  cd "${LOCAL_DIR}/frontend"
  npm run build
  rsync -avz --delete \
    "${LOCAL_DIR}/frontend/dist/" \
    "${REMOTE_HOST}:${REMOTE_FRONTEND}/"
}

deploy_backend() {
  echo >&2 "DEPLOY backend: rsync → ${REMOTE_HOST}:${REMOTE_BACKEND}"
  rsync -avz --delete \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'venv' \
    --exclude '.venv' \
    --exclude '.env' \
    --exclude '.pytest_cache' \
    --exclude '.mypy_cache' \
    "${LOCAL_DIR}/backend/" \
    "${REMOTE_HOST}:${REMOTE_BACKEND}/"

  echo >&2 "DEPLOY: pip install on server (venv: ${REMOTE_BACKEND}/venv)"
  ssh "${REMOTE_HOST}" "cd ${REMOTE_BACKEND} && (test -d venv || python3 -m venv venv) && venv/bin/pip install -q -r requirements.txt"

  if [[ "$DO_MIGRATE" -eq 1 ]]; then
    echo >&2 "DEPLOY: alembic upgrade head"
    ssh "${REMOTE_HOST}" "cd ${REMOTE_BACKEND} && venv/bin/alembic upgrade head"
  else
    echo >&2 "Note: migrations skipped (no --migrate). Pass --migrate if there are new alembic revisions."
  fi
}

case "$TARGET" in
  frontend) deploy_frontend; restart_pm2 ;;
  backend)  deploy_backend; restart_pm2 ;;
  all)      deploy_frontend; deploy_backend; restart_pm2 ;;
esac

echo >&2 "DEPLOY: done."
