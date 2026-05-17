#!/usr/bin/env bash
# Deploy Volt-Pos (frontend + backend) to production.
#
# Usage:
#   ./deploy.sh                    # all (default): build front + rsync front + rsync back + restart pm2
#   ./deploy.sh frontend           # only frontend (build + rsync + restart pm2)
#   ./deploy.sh backend            # only backend (rsync + pip install + restart pm2)
#   ./deploy.sh backend --migrate  # backend + alembic upgrade head
#   ./deploy.sh all --migrate      # everything + migrations
#   ./deploy.sh --skip-smoke       # пропустить пост-деплой smoke-тест (риск)
#
# Env overrides:
#   DEPLOY_SSH_HOST=root@138.199.162.46    # remote (user@host or ssh-config alias)
#   DEPLOY_REMOTE_FRONTEND=/opt/voltpos/frontend
#   DEPLOY_REMOTE_BACKEND=/opt/voltpos/backend
#   DEPLOY_PM2_APP=voltpos-api
#   DEPLOY_API_URL=https://voltpos.online/api  # для smoke-теста
#   DEPLOY_NO_RESTART=1            # skip pm2 restart
#
# В .env на сервере должны быть:
#   SMOKE_ORG_CODE=...   # код магазина для smoke-логина (например тестовый Ларёк)
#   SMOKE_PIN=...        # PIN того магазина
#   TELEGRAM_BOT_TOKEN=...  # для алертов (опционально — без него просто warning)
#   TELEGRAM_CHAT_ID=...
#
# Notes:
#   - Backend .env is NOT rsynced (excluded). Edit it on the server directly.
#   - Migrations are NOT run by default — pass --migrate explicitly.
#   - Перед деплоем сохраняем код (без venv/__pycache__) в backend.prev / frontend.prev,
#     при провале smoke автоматически восстанавливаем и рестартим PM2.
#   - Миграции при провале НЕ откатываются (alembic downgrade рискует данными).
#     Если smoke упал ПОСЛЕ alembic upgrade — алерт в Telegram, разбираться руками.
#   - Requires SSH key access for the remote host (no password prompt).

set -euo pipefail

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${DEPLOY_SSH_HOST:-root@138.199.162.46}"
REMOTE_FRONTEND="${DEPLOY_REMOTE_FRONTEND:-/opt/voltpos/frontend}"
REMOTE_BACKEND="${DEPLOY_REMOTE_BACKEND:-/opt/voltpos/backend}"
PM2_APP="${DEPLOY_PM2_APP:-voltpos-api}"
API_URL="${DEPLOY_API_URL:-https://voltpos.online/api}"

TARGET="all"
DO_MIGRATE=0
SKIP_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    frontend|front|fe) TARGET="frontend" ;;
    backend|back|be)   TARGET="backend" ;;
    all)               TARGET="all" ;;
    --migrate|-m)      DO_MIGRATE=1 ;;
    --skip-smoke)      SKIP_SMOKE=1 ;;
    --help|-h)
      sed -n '2,28p' "${BASH_SOURCE[0]}" >&2
      exit 0 ;;
    *)
      echo "Unknown arg: $arg (use --help)" >&2
      exit 2 ;;
  esac
done

# ============== HELPERS ==============

# Отправляет сообщение в Telegram если настроены TELEGRAM_BOT_TOKEN/CHAT_ID в .env на сервере.
# Молчит если ключей нет (чтобы локальные деплои не падали).
notify_telegram() {
  local text="$1"
  local creds
  creds="$(ssh "${REMOTE_HOST}" "grep -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' ${REMOTE_BACKEND}/.env 2>/dev/null || true")"
  local token chat_id
  token="$(echo "$creds" | awk -F= '/^TELEGRAM_BOT_TOKEN=/ {sub(/^TELEGRAM_BOT_TOKEN=/,""); print; exit}')"
  chat_id="$(echo "$creds" | awk -F= '/^TELEGRAM_CHAT_ID=/ {sub(/^TELEGRAM_CHAT_ID=/,""); print; exit}')"
  if [[ -z "${token}" || -z "${chat_id}" ]]; then
    echo >&2 "DEPLOY: TELEGRAM_* не настроены в .env — алерт пропущен"
    return
  fi
  curl -s -o /dev/null \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "parse_mode=HTML" \
    "https://api.telegram.org/bot${token}/sendMessage" || true
}

# Сохранить копию текущего кода перед rsync — для возможного отката.
backup_current() {
  echo >&2 "DEPLOY: бэкап текущей версии в .prev (на сервере)"
  ssh "${REMOTE_HOST}" "set -e
    if [ -d ${REMOTE_BACKEND}/app ]; then
      rm -rf ${REMOTE_BACKEND}/app.prev
      cp -a ${REMOTE_BACKEND}/app ${REMOTE_BACKEND}/app.prev
    fi
    if [ -d ${REMOTE_BACKEND}/alembic ]; then
      rm -rf ${REMOTE_BACKEND}/alembic.prev
      cp -a ${REMOTE_BACKEND}/alembic ${REMOTE_BACKEND}/alembic.prev
    fi
    # frontend — копируем dist (там содержимое /opt/voltpos/frontend/)
    if [ -d ${REMOTE_FRONTEND} ] && [ \"\$(ls -A ${REMOTE_FRONTEND} 2>/dev/null)\" ]; then
      rm -rf ${REMOTE_FRONTEND}.prev
      mkdir -p ${REMOTE_FRONTEND}.prev
      cp -a ${REMOTE_FRONTEND}/. ${REMOTE_FRONTEND}.prev/
    fi
  " || echo >&2 "DEPLOY: бэкап не удался (может быть первый деплой) — продолжаем"
}

# Откатить код из .prev (миграции НЕ откатываем).
rollback_code() {
  echo >&2 "DEPLOY: ⛔ ОТКАТ кода из .prev"
  ssh "${REMOTE_HOST}" "set -e
    if [ -d ${REMOTE_BACKEND}/app.prev ]; then
      rm -rf ${REMOTE_BACKEND}/app
      mv ${REMOTE_BACKEND}/app.prev ${REMOTE_BACKEND}/app
      echo 'backend/app откачен'
    fi
    if [ -d ${REMOTE_BACKEND}/alembic.prev ]; then
      rm -rf ${REMOTE_BACKEND}/alembic
      mv ${REMOTE_BACKEND}/alembic.prev ${REMOTE_BACKEND}/alembic
      echo 'backend/alembic откачен'
    fi
    if [ -d ${REMOTE_FRONTEND}.prev ]; then
      rm -rf ${REMOTE_FRONTEND}
      mv ${REMOTE_FRONTEND}.prev ${REMOTE_FRONTEND}
      echo 'frontend откачен'
    fi
    pm2 restart ${PM2_APP} --update-env >/dev/null 2>&1 || true
  "
}

restart_pm2() {
  if [[ "${DEPLOY_NO_RESTART:-0}" == "1" ]]; then
    echo >&2 "DEPLOY: skip pm2 restart (DEPLOY_NO_RESTART=1)"
    return
  fi
  echo >&2 "DEPLOY: restarting ${PM2_APP} on ${REMOTE_HOST}"
  ssh "${REMOTE_HOST}" "pm2 restart ${PM2_APP} --update-env"
}

# Smoke-тест: 4 проверки. Возвращает 0 если всё ок, иначе 1 и описание в stderr.
# Использует SMOKE_ORG_CODE / SMOKE_PIN из .env на сервере.
smoke_test() {
  echo >&2 "DEPLOY: smoke-тест…"
  # Дать процессу подняться
  sleep 3

  # 1. /health
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" || echo "000")
  if [[ "$code" != "200" ]]; then
    echo "❌ SMOKE FAIL: GET /health → HTTP $code"
    return 1
  fi
  echo >&2 "  ✓ /health 200"

  # Берём логин из .env на сервере
  local creds org_code pin
  creds="$(ssh "${REMOTE_HOST}" "grep -E '^(SMOKE_ORG_CODE|SMOKE_PIN)=' ${REMOTE_BACKEND}/.env 2>/dev/null || true")"
  org_code="$(echo "$creds" | awk -F= '/^SMOKE_ORG_CODE=/ {sub(/^SMOKE_ORG_CODE=/,""); print; exit}')"
  pin="$(echo "$creds" | awk -F= '/^SMOKE_PIN=/ {sub(/^SMOKE_PIN=/,""); print; exit}')"
  if [[ -z "$org_code" || -z "$pin" ]]; then
    echo "⚠️ SMOKE: SMOKE_ORG_CODE/SMOKE_PIN не настроены в .env — auth-проверки пропущены (только /health)"
    return 0
  fi

  # 2. login → токен
  local login_resp token
  login_resp=$(curl -s --max-time 10 -X POST "${API_URL}/auth/org-login" \
    -H "Content-Type: application/json" \
    -d "{\"org_code\":\"${org_code}\",\"pin_code\":\"${pin}\"}" || true)
  token=$(echo "$login_resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null || true)
  if [[ -z "$token" ]]; then
    echo "❌ SMOKE FAIL: login ${org_code} вернул ошибку: $(echo "$login_resp" | head -c 200)"
    return 1
  fi
  echo >&2 "  ✓ login ${org_code}"

  # 3. /products → 200 + count > 0
  local body
  code=$(curl -s -o /tmp/voltpos_smoke_products.json -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${token}" "${API_URL}/products" || echo "000")
  if [[ "$code" != "200" ]]; then
    echo "❌ SMOKE FAIL: GET /products → HTTP $code"
    return 1
  fi
  body=$(cat /tmp/voltpos_smoke_products.json 2>/dev/null || echo "[]")
  local pcount
  pcount=$(echo "$body" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  if [[ "$pcount" -lt 1 ]]; then
    echo "❌ SMOKE FAIL: /products вернул пустой список (count=$pcount)"
    return 1
  fi
  echo >&2 "  ✓ /products 200, count=$pcount"

  # 4. /stock → 200 + count > 0
  code=$(curl -s -o /tmp/voltpos_smoke_stock.json -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${token}" "${API_URL}/stock" || echo "000")
  if [[ "$code" != "200" ]]; then
    echo "❌ SMOKE FAIL: GET /stock → HTTP $code"
    return 1
  fi
  body=$(cat /tmp/voltpos_smoke_stock.json 2>/dev/null || echo "[]")
  local scount
  scount=$(echo "$body" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  if [[ "$scount" -lt 1 ]]; then
    echo "❌ SMOKE FAIL: /stock вернул пустой список (count=$scount)"
    return 1
  fi
  echo >&2 "  ✓ /stock 200, count=$scount"

  # 5. /shifts/current → не 500 (200 / 401 / 404 OK; нам важно что не упало)
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${token}" "${API_URL}/shifts/current" || echo "000")
  if [[ "$code" == "500" || "$code" == "000" ]]; then
    echo "❌ SMOKE FAIL: GET /shifts/current → HTTP $code"
    return 1
  fi
  echo >&2 "  ✓ /shifts/current $code"

  return 0
}

# ============== DEPLOY FUNCTIONS ==============

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
    --exclude 'app.prev' \
    --exclude 'alembic.prev' \
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

# ============== MAIN ==============

# Бэкапим текущую версию ДО любых правок.
backup_current

case "$TARGET" in
  frontend) deploy_frontend; restart_pm2 ;;
  backend)  deploy_backend; restart_pm2 ;;
  all)      deploy_frontend; deploy_backend; restart_pm2 ;;
esac

# Smoke-тест с авто-откатом при провале.
if [[ "$SKIP_SMOKE" -eq 1 ]]; then
  echo >&2 "DEPLOY: smoke пропущен (--skip-smoke)"
  echo >&2 "DEPLOY: done."
  exit 0
fi

SMOKE_OUTPUT=""
if SMOKE_OUTPUT="$(smoke_test 2>&1)"; then
  echo >&2 "✅ Деплой успешен, все проверки пройдены"
  # Опционально шлём успех в Telegram только при миграции (новой схемы) —
  # иначе будем спамить себе на каждое мелкое изменение.
  if [[ "$DO_MIGRATE" -eq 1 ]]; then
    notify_telegram "✅ <b>Volt-Pos деплой</b> (с миграцией) — все проверки прошли. Target: <code>${TARGET}</code>"
  fi
  # Удаляем бэкап с сервера — он больше не нужен, занимает место.
  ssh "${REMOTE_HOST}" "rm -rf ${REMOTE_BACKEND}/app.prev ${REMOTE_BACKEND}/alembic.prev ${REMOTE_FRONTEND}.prev" 2>/dev/null || true
  exit 0
fi

# Падение
echo >&2 ""
echo >&2 "${SMOKE_OUTPUT}"
echo >&2 ""

if [[ "$DO_MIGRATE" -eq 1 ]]; then
  echo >&2 "DEPLOY: ⚠️ были применены миграции — авто-откат кода БЕЗ отката миграций."
  echo >&2 "DEPLOY: если схема несовместима — старый код тоже может не работать, разбирайся руками."
fi

rollback_code
sleep 3
# Проверим что после отката /health поднялся
HEALTH_AFTER=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" || echo "000")
if [[ "$HEALTH_AFTER" == "200" ]]; then
  AFTER_MSG="После отката /health=200 ✓"
else
  AFTER_MSG="После отката /health=${HEALTH_AFTER} ⚠️ возможно сервер тоже упал"
fi

notify_telegram "❌ <b>Volt-Pos деплой ПРОВАЛЕН</b>
Target: <code>${TARGET}</code>${DO_MIGRATE:+ + migration}
Smoke провалил:
<pre>${SMOKE_OUTPUT}</pre>
${AFTER_MSG}"

echo >&2 "DEPLOY: откат выполнен. Алерт в Telegram отправлен (если настроен)."
exit 1
