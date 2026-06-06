#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://bitgakview.com}"

curl -s "$BASE_URL/stocks/api/global-market-temperature/" > /dev/null || true
for code in KOSPI KOSDAQ NASDAQ NASDAQ100 NQF SOX SP500; do
  curl -s "$BASE_URL/stocks/api/chart/?code=$code&symbol=$code&interval=1d&range=all" > /dev/null || true
  curl -s "$BASE_URL/stocks/api/chart/?code=$code&symbol=$code&interval=4h&range=all" > /dev/null || true
  sleep 0.2
done

echo "BitgakView market/index cache warmed."
