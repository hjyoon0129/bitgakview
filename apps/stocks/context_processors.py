from django.core.cache import cache

from apps.stocks.models import StockSymbol


def stock_search_payload(request):
    """
    모든 화면에서 header 검색이 stock_search.html처럼 즉시 검색되도록 전체 종목 JSON을 공급합니다.
    settings.py의 TEMPLATES[0]["OPTIONS"]["context_processors"]에
    "apps.stocks.context_processors.stock_search_payload" 를 추가하세요.
    """
    cache_key = "bitgak_all_stocks_payload_v4"
    payload = cache.get(cache_key)

    if payload is None:
        payload = []

        qs = (
            StockSymbol.objects
            .all()
            .only("code", "name", "market")
            .order_by("market", "name")
        )

        for stock in qs:
            code = str(stock.code or "").zfill(6)
            name = str(stock.name or "").strip()

            if not code or not name:
                continue

            payload.append({
                "code": code,
                "name": name,
                "market": stock.market or "KRX",
                "href": f"/stocks/{code}/",
                "aliases": [],
                "search_rank": 0,
            })

        cache.set(cache_key, payload, 60 * 30)

    return {
        "all_stocks_payload": payload,
        "total_stock_count": len(payload),
    }
