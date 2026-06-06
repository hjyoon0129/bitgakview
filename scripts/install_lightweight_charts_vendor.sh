#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$PROJECT_ROOT/static/stocks/vendor"
TARGET_FILE="$TARGET_DIR/lightweight-charts.standalone.production.js"
URL="https://unpkg.com/lightweight-charts@5.0.8/dist/lightweight-charts.standalone.production.js"

mkdir -p "$TARGET_DIR"

echo "Downloading TradingView Lightweight Charts 5.0.8..."
curl -L --fail --retry 3 --connect-timeout 10 "$URL" -o "$TARGET_FILE"

SIZE=$(wc -c < "$TARGET_FILE" | tr -d ' ')
if [ "$SIZE" -lt 100000 ]; then
  echo "Downloaded file looks too small: ${SIZE} bytes" >&2
  exit 1
fi

echo "Installed: $TARGET_FILE (${SIZE} bytes)"
echo "Next:"
echo "  python manage.py collectstatic --noinput"
echo "  sudo systemctl restart bitgakview"
echo "  sudo systemctl restart nginx"
