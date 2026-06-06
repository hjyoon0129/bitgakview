#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
cd "$PROJECT_ROOT"

echo "[1/5] Install Redis server"
sudo apt-get update -y
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server

echo "[2/5] Install Python Redis packages"
if [ -d "venv" ]; then
  source venv/bin/activate
elif [ -d ".venv" ]; then
  source .venv/bin/activate
fi
pip install -r requirements_redis.txt

echo "[3/5] Add Redis cache import to config/settings.py"
SETTINGS_FILE="config/settings.py"
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "ERROR: $SETTINGS_FILE not found. settings.py 위치를 확인하세요."
  exit 1
fi
if ! grep -q "redis_cache_settings" "$SETTINGS_FILE"; then
  cat >> "$SETTINGS_FILE" <<'EOF'

# BitgakView Redis shared cache
try:
    from .redis_cache_settings import *  # noqa: F401,F403
except Exception:
    pass
EOF
fi

echo "[4/5] Check Django cache backend"
python manage.py shell -c "from django.core.cache import cache; cache.set('bitgakview:redis:test','ok',60); print('CACHE_TEST=', cache.get('bitgakview:redis:test'))"

echo "[5/5] Done. Now run collectstatic/restart."
