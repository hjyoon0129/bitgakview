from django.core.cache import cache

from apps.stocks.models import StockSymbol


GLOBAL_INDEX_PAYLOAD = [
    {
        "code": "KOSPI",
        "name": "코스피 지수",
        "market": "INDEX-KR",
        "href": "/stocks/KOSPI/",
        "aliases": ["코스피", "kospi", "ks11", "종합주가지수", "코스피인덱스", "kospi index"],
        "search_rank": 5000,
        "asset_type": "index",
        "price_unit": "pt",
    },
    {
        "code": "KOSDAQ",
        "name": "코스닥 지수",
        "market": "INDEX-KR",
        "href": "/stocks/KOSDAQ/",
        "aliases": ["코스닥", "kosdaq", "kq11", "코스닥인덱스", "kosdaq index"],
        "search_rank": 4990,
        "asset_type": "index",
        "price_unit": "pt",
    },
    {
        "code": "NASDAQ",
        "name": "나스닥 종합",
        "market": "INDEX-US",
        "href": "/stocks/NASDAQ/",
        "aliases": ["나스닥", "나스닥종합", "nasdaq", "ixic", "^ixic", "nasdaq composite"],
        "search_rank": 4980,
        "asset_type": "index",
        "price_unit": "pt",
    },
    {
        "code": "NASDAQ100",
        "name": "나스닥 100",
        "market": "INDEX-US",
        "href": "/stocks/NASDAQ100/",
        "aliases": ["나스닥100", "나스닥 100", "nasdaq100", "nasdaq 100", "ndx", "^ndx", "nas100", "us100"],
        "search_rank": 4970,
        "asset_type": "index",
        "price_unit": "pt",
    },
    {
        "code": "NQF",
        "name": "나스닥 100 E-mini 선물",
        "market": "FUTURE-US",
        "href": "/stocks/NQF/",
        "aliases": ["나스닥선물", "나스닥 100 선물", "나스닥100선물", "e-mini", "emini", "nq", "nq=f", "nqf", "nasdaq futures"],
        "search_rank": 4960,
        "asset_type": "future",
        "is_derivative": True,
        "price_unit": "pt",
    },
    {
        "code": "SP500",
        "name": "S&P 500",
        "market": "INDEX-US",
        "href": "/stocks/SP500/",
        "aliases": ["s&p500", "s&p 500", "sp500", "spx", "gspc", "^gspc", "에스앤피", "에센피", "us500"],
        "search_rank": 4950,
        "asset_type": "index",
        "price_unit": "pt",
    },
    {
        "code": "SOX",
        "name": "필라델피아 반도체 지수",
        "market": "INDEX-US",
        "href": "/stocks/SOX/",
        "aliases": ["필라델피아반도체", "필라델피아 반도체", "sox", "^sox", "phlx semiconductor", "반도체지수"],
        "search_rank": 4940,
        "asset_type": "index",
        "price_unit": "pt",
    },
]


def stock_search_payload(request):
    """
    모든 화면에서 header 검색이 stock_search.html처럼 즉시 검색되도록 전체 종목 JSON을 공급합니다.
    settings.py의 TEMPLATES[0]["OPTIONS"]["context_processors"]에
    "apps.stocks.context_processors.stock_search_payload" 를 추가하세요.
    """
    cache_key = "bitgak_all_stocks_payload_v6_global_indices_pykrx"
    payload = cache.get(cache_key)

    if payload is None:
        payload = list(GLOBAL_INDEX_PAYLOAD)
        seen_codes = {item["code"] for item in payload}

        qs = (
            StockSymbol.objects
            .all()
            .only("code", "name", "market")
            .order_by("market", "name")
        )

        for stock in qs:
            code = str(stock.code or "").zfill(6)
            name = str(stock.name or "").strip()

            if not code or not name or code in seen_codes:
                continue

            seen_codes.add(code)
            payload.append({
                "code": code,
                "name": name,
                "market": stock.market or "KRX",
                "href": f"/stocks/{code}/",
                "aliases": [],
                "search_rank": 0,
                "asset_type": "stock",
                "price_unit": "원",
            })

        cache.set(cache_key, payload, 60 * 30)

    return {
        "all_stocks_payload": payload,
        "total_stock_count": len(payload),
    }
