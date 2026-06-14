from django.core.cache import cache

from apps.stocks.models import StockSymbol
from apps.stocks.views import _get_krx_etf_payloads, _global_fallback_payloads, _stock_to_payload


def stock_search_payload(request):
    """
    모든 화면에서 header 검색이 stock_search.html처럼 즉시 검색되도록 검색 payload를 공급합니다.

    - 국내 주식: StockSymbol DB
    - 국내 ETF: pykrx의 오늘 기준 ETF 목록을 cache로 반영
    - 해외 주요 주식/ETF: views.py의 GLOBAL_YAHOO_SYMBOLS fallback
    """
    cache_key = "bitgak_all_stocks_payload_v9_etf_global_yahoo"
    payload = cache.get(cache_key)

    if payload is None:
        payload = []
        seen_codes = set()

        for item in _global_fallback_payloads():
            code = item.get("code")
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)
            payload.append({
                "code": code,
                "name": item.get("name") or code,
                "market": item.get("market") or "US",
                "href": f"/stocks/{code}/",
                "aliases": item.get("aliases", []),
                "search_rank": item.get("search_rank", 0),
                "asset_type": item.get("asset_type", "stock"),
                "is_derivative": bool(item.get("is_derivative")),
                "price_unit": item.get("price_unit", "USD"),
                "yahoo_symbol": item.get("yahoo_symbol", ""),
            })

        qs = (
            StockSymbol.objects
            .all()
            .only("code", "name", "market")
            .order_by("market", "name")
        )

        for stock in qs:
            item = _stock_to_payload(stock)
            code = item.get("code")
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)
            payload.append(item)

        for item in _get_krx_etf_payloads():
            code = item.get("code")
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)
            payload.append(item)

        cache.set(cache_key, payload, 60 * 30)

    return {
        "all_stocks_payload": payload,
        "total_stock_count": len(payload),
    }
