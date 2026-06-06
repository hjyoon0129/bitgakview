from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
import ast
import json
import re

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods

class _LazyPandas:
    """
    pandas는 매우 무거운 모듈이라 Django check/migrate/server start 시점에
    바로 import하면 서버가 멈춘 것처럼 느려질 수 있습니다.
    실제 차트/시장지표 API가 호출될 때만 import되도록 지연 로딩합니다.
    """
    _module = None

    def _load(self):
        if self._module is None:
            import pandas as _pandas
            self._module = _pandas
        return self._module

    def __getattr__(self, name):
        return getattr(self._load(), name)


class _LazyKrxStock:
    """
    pykrx도 import 시점에 부하가 있을 수 있으므로 실제 KRX 데이터 조회 때만 로딩합니다.
    """
    _module = None
    _error = None

    def _load(self):
        if self._module is not None:
            return self._module
        if self._error is not None:
            raise self._error

        try:
            from pykrx import stock as _krx_stock
        except Exception as exc:
            self._error = exc
            raise

        self._module = _krx_stock
        return self._module

    def __getattr__(self, name):
        return getattr(self._load(), name)


class _LazyYFinance:
    """
    yfinance는 protobuf/google 계열 모듈을 같이 로딩할 수 있어 check를 느리게 만들 수 있습니다.
    시간봉 API가 호출될 때만 로딩합니다.
    """
    _module = None
    _error = None

    def _load(self):
        if self._module is not None:
            return self._module
        if self._error is not None:
            raise self._error

        try:
            import yfinance as _yf
        except Exception as exc:
            self._error = exc
            raise

        self._module = _yf
        return self._module

    def __getattr__(self, name):
        return getattr(self._load(), name)


pd = _LazyPandas()
krx_stock = _LazyKrxStock()
yf = _LazyYFinance()

from .models import ChartDrawingState, ChartIndicatorState, ChartPiramidState, StockSymbol, UserStockStorage


DERIVATIVE_KEYWORDS = [
    "ETF", "ETN", "ETNH", "레버리지", "인버스", "선물", "합성",
    "TR", "채권", "국채", "CD금리", "커버드콜",
]


# -----------------------------------------------------------------------------
# 글로벌 대표지수 / 선물 심볼
# -----------------------------------------------------------------------------
# 사용자는 /stocks/KOSPI/, /stocks/NASDAQ100/처럼 친숙한 내부 코드로 접속하고,
# 실제 시세는 Yahoo Finance 심볼(^KS11, ^NDX, NQ=F 등)로 가져옵니다.
# StockSymbol DB에 저장하지 않아도 검색/차트가 동작하도록 fallback payload에 포함합니다.

GLOBAL_INDEX_SYMBOLS = {
    "KOSPI": {
        "code": "KOSPI",
        "name": "코스피 지수",
        "market": "INDEX-KR",
        "asset_type": "index",
        "provider": "pykrx-index",
        "krx_index_code": "1001",
        "naver_symbol": "KOSPI",
        "yahoo_symbol": "^KS11",
        "yahoo_symbols": ["^KS11"],
        "stooq_symbol": "^ks11",
        "price_unit": "pt",
        "aliases": ["코스피", "kospi", "ks11", "^ks11", "종합주가지수", "코스피인덱스", "kospi index"],
        "search_rank": 5000,
    },
    "KOSDAQ": {
        "code": "KOSDAQ",
        "name": "코스닥 지수",
        "market": "INDEX-KR",
        "asset_type": "index",
        "provider": "pykrx-index",
        "krx_index_code": "2001",
        "naver_symbol": "KOSDAQ",
        "yahoo_symbol": "^KQ11",
        "yahoo_symbols": ["^KQ11"],
        "stooq_symbol": "^kq11",
        "price_unit": "pt",
        "aliases": ["코스닥", "kosdaq", "kq11", "^kq11", "코스닥인덱스", "kosdaq index"],
        "search_rank": 4990,
    },
    "NASDAQ": {
        "code": "NASDAQ",
        "name": "나스닥 종합",
        "market": "INDEX-US",
        "asset_type": "index",
        "yahoo_symbol": "^IXIC",
        "yahoo_symbols": ["^IXIC", "^COMPX"],
        "stooq_symbol": "^ixic",
        "aliases": ["나스닥", "나스닥종합", "nasdaq", "ixic", "^ixic", "nasdaq composite"],
        "search_rank": 4980,
    },
    "NASDAQ100": {
        "code": "NASDAQ100",
        "name": "나스닥 100",
        "market": "INDEX-US",
        "asset_type": "index",
        "yahoo_symbol": "^NDX",
        "yahoo_symbols": ["^NDX"],
        "stooq_symbol": "^ndx",
        "aliases": ["나스닥100", "나스닥 100", "nasdaq100", "nasdaq 100", "ndx", "^ndx"],
        "search_rank": 4970,
    },
    "NQF": {
        "code": "NQF",
        "name": "나스닥 100 E-mini 선물",
        "market": "FUTURE-US",
        "asset_type": "future",
        "yahoo_symbol": "NQ=F",
        "yahoo_symbols": ["NQ=F", "MNQ=F"],
        "stooq_symbol": "nq.f",
        "aliases": ["나스닥선물", "나스닥 100 선물", "나스닥100선물", "e-mini", "emini", "nq", "nq=f", "nqf", "nasdaq futures"],
        "search_rank": 4960,
        "is_derivative": True,
    },
    "SP500": {
        "code": "SP500",
        "name": "S&P 500",
        "market": "INDEX-US",
        "asset_type": "index",
        "yahoo_symbol": "^GSPC",
        "yahoo_symbols": ["^GSPC", "^SPX"],
        "stooq_symbol": "^spx",
        "aliases": ["s&p500", "s&p 500", "sp500", "spx", "gspc", "^gspc", "에스앤피", "에센피"],
        "search_rank": 4950,
    },
    "SOX": {
        "code": "SOX",
        "name": "필라델피아 반도체 지수",
        "market": "INDEX-US",
        "asset_type": "index",
        "yahoo_symbol": "^SOX",
        "yahoo_symbols": ["^SOX"],
        "stooq_symbol": "^sox",
        "aliases": ["필라델피아반도체", "필라델피아 반도체", "sox", "^sox", "phlx semiconductor", "반도체지수"],
        "search_rank": 4940,
    },
}


def _global_fallback_payloads():
    result = []
    for item in GLOBAL_INDEX_SYMBOLS.values():
        result.append({
            "code": item["code"],
            "name": item["name"],
            "market": item["market"],
            "aliases": item.get("aliases", []),
            "search_rank": item.get("search_rank", 0),
            "is_derivative": bool(item.get("is_derivative") or item.get("asset_type") == "future"),
            "asset_type": item.get("asset_type", "index"),
            "yahoo_symbol": item.get("yahoo_symbol", ""),
            "price_unit": item.get("price_unit", "pt"),
        })
    return result


def _build_global_alias_map():
    aliases = {}
    for code, item in GLOBAL_INDEX_SYMBOLS.items():
        keys = [code, item.get("yahoo_symbol", ""), item.get("name", "")] + item.get("aliases", [])
        for key in keys:
            raw = str(key or "").strip().upper()
            compact = re.sub(r"[\s_:\-./]+", "", raw)
            compact = compact.replace("&", "")
            if raw:
                aliases[raw] = code
            if compact:
                aliases[compact] = code
    aliases.update({
        "SNP500": "SP500",
        "SANDP500": "SP500",
        "SPX": "SP500",
        "US500": "SP500",
        "NAS100": "NASDAQ100",
        "US100": "NASDAQ100",
        "NQ": "NQF",
        "NQ=F": "NQF",
    })
    return aliases


GLOBAL_INDEX_ALIAS_MAP = _build_global_alias_map()


FALLBACK_STOCKS = _global_fallback_payloads() + [
    {"code": "005930", "name": "삼성전자", "market": "KOSPI", "aliases": ["삼성", "삼전", "samsung", "samsung electronics"], "search_rank": 1000},
    {"code": "005935", "name": "삼성전자우", "market": "KOSPI", "aliases": ["삼전우", "삼성우"], "search_rank": 930},
    {"code": "207940", "name": "삼성바이오로직스", "market": "KOSPI", "aliases": ["삼바", "삼성바이오"], "search_rank": 880},
    {"code": "006400", "name": "삼성SDI", "market": "KOSPI", "aliases": ["삼성에스디아이", "sdi"], "search_rank": 850},
    {"code": "009150", "name": "삼성전기", "market": "KOSPI", "aliases": ["삼전기"], "search_rank": 830},
    {"code": "028260", "name": "삼성물산", "market": "KOSPI", "aliases": ["물산"], "search_rank": 810},
    {"code": "010140", "name": "삼성중공업", "market": "KOSPI", "aliases": ["삼성중공"], "search_rank": 790},
    {"code": "016360", "name": "삼성증권", "market": "KOSPI", "aliases": ["삼성증권"], "search_rank": 760},
    {"code": "000810", "name": "삼성화재", "market": "KOSPI", "aliases": ["삼성화재해상보험"], "search_rank": 750},
    {"code": "032830", "name": "삼성생명", "market": "KOSPI", "aliases": ["삼성생명보험"], "search_rank": 740},
    {"code": "000660", "name": "SK하이닉스", "market": "KOSPI", "aliases": ["하이닉스", "하닉", "hynix"], "search_rank": 980},
    {"code": "035420", "name": "NAVER", "market": "KOSPI", "aliases": ["네이버", "naver"], "search_rank": 940},
    {"code": "035720", "name": "카카오", "market": "KOSPI", "aliases": ["kakao"], "search_rank": 900},
    {"code": "005380", "name": "현대차", "market": "KOSPI", "aliases": ["현대자동차", "hyundai"], "search_rank": 920},
    {"code": "000270", "name": "기아", "market": "KOSPI", "aliases": ["kia"], "search_rank": 900},
    {"code": "373220", "name": "LG에너지솔루션", "market": "KOSPI", "aliases": ["LG엔솔", "엘지에너지솔루션", "엔솔"], "search_rank": 890},
    {"code": "051910", "name": "LG화학", "market": "KOSPI", "aliases": ["엘지화학"], "search_rank": 850},
    {"code": "066570", "name": "LG전자", "market": "KOSPI", "aliases": ["엘지전자"], "search_rank": 840},
    {"code": "003550", "name": "LG", "market": "KOSPI", "aliases": ["엘지"], "search_rank": 800},
    {"code": "068270", "name": "셀트리온", "market": "KOSPI", "aliases": ["celltrion"], "search_rank": 820},
    {"code": "105560", "name": "KB금융", "market": "KOSPI", "aliases": ["국민은행", "kb"], "search_rank": 790},
    {"code": "055550", "name": "신한지주", "market": "KOSPI", "aliases": ["신한"], "search_rank": 770},
    {"code": "316140", "name": "우리금융지주", "market": "KOSPI", "aliases": ["우리금융"], "search_rank": 760},
    {"code": "005490", "name": "POSCO홀딩스", "market": "KOSPI", "aliases": ["포스코", "posco"], "search_rank": 760},
    {"code": "028300", "name": "HLB", "market": "KOSDAQ", "aliases": ["에이치엘비"], "search_rank": 720},
    {"code": "247540", "name": "에코프로비엠", "market": "KOSDAQ", "aliases": ["에코비엠"], "search_rank": 720},
    {"code": "086520", "name": "에코프로", "market": "KOSDAQ", "aliases": ["ecopro"], "search_rank": 700},
    {"code": "196170", "name": "알테오젠", "market": "KOSDAQ", "aliases": ["alteogen"], "search_rank": 700},
    {"code": "277810", "name": "레인보우로보틱스", "market": "KOSDAQ", "aliases": ["레인보우", "로보틱스"], "search_rank": 660},
]


FALLBACK_BY_CODE = {item["code"]: item for item in FALLBACK_STOCKS}


def _clean_code(code):
    code = str(code or "").strip()
    digits = "".join(ch for ch in code if ch.isdigit())

    if not digits:
        return ""

    if len(digits) <= 6:
        return digits.zfill(6)

    return digits[-6:]


def _normalize_asset_code(code):
    """KRX 6자리 종목코드와 글로벌 지수 내부코드를 함께 정규화합니다."""
    raw = str(code or "").strip()

    if not raw:
        return ""

    upper = raw.upper()
    compact = re.sub(r"[\s_:\-./]+", "", upper).replace("&", "")

    if upper in GLOBAL_INDEX_ALIAS_MAP:
        return GLOBAL_INDEX_ALIAS_MAP[upper]
    if compact in GLOBAL_INDEX_ALIAS_MAP:
        return GLOBAL_INDEX_ALIAS_MAP[compact]

    return _clean_code(raw)


def _is_global_asset_code(code):
    return _normalize_asset_code(code) in GLOBAL_INDEX_SYMBOLS


def _empty_ohlcv():
    return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])


def _is_derivative_name(name):
    text = str(name or "").upper().replace(" ", "")
    return any(keyword.upper().replace(" ", "") in text for keyword in DERIVATIVE_KEYWORDS)


def _fallback_stock(code):
    asset_code = _normalize_asset_code(code)

    if asset_code in GLOBAL_INDEX_SYMBOLS:
        item = GLOBAL_INDEX_SYMBOLS[asset_code]
        return SimpleNamespace(
            code=item["code"],
            name=item["name"],
            market=item["market"],
            asset_type=item.get("asset_type", "index"),
            yahoo_symbol=item.get("yahoo_symbol", ""),
        )

    code = _clean_code(asset_code or code)
    item = FALLBACK_BY_CODE.get(code)

    if item:
        return SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])

    return SimpleNamespace(code=code, name=code or "알 수 없는 종목", market="KRX")


def _get_stock(code):
    asset_code = _normalize_asset_code(code)

    if asset_code in GLOBAL_INDEX_SYMBOLS:
        return _fallback_stock(asset_code)

    code = _clean_code(asset_code or code)
    obj = StockSymbol.objects.filter(code=code).first()

    if obj:
        return obj

    return _fallback_stock(code)


def _safe_reverse_stock_detail(code):
    asset_code = _normalize_asset_code(code)
    code = asset_code or _clean_code(code)

    try:
        return reverse("stocks:detail", args=[code])
    except Exception:
        return f"/stocks/{code}/"


def _stock_to_payload(stock_obj):
    code = _normalize_asset_code(getattr(stock_obj, "code", ""))

    if code in GLOBAL_INDEX_SYMBOLS:
        item = GLOBAL_INDEX_SYMBOLS[code]
        return {
            "code": item["code"],
            "name": item["name"],
            "market": item["market"],
            "aliases": item.get("aliases", []),
            "href": _safe_reverse_stock_detail(item["code"]),
            "search_rank": item.get("search_rank", 0),
            "is_derivative": bool(item.get("is_derivative") or item.get("asset_type") == "future"),
            "asset_type": item.get("asset_type", "index"),
            "yahoo_symbol": item.get("yahoo_symbol", ""),
            "price_unit": item.get("price_unit", "pt"),
        }

    code = _clean_code(code)
    name = str(getattr(stock_obj, "name", "") or code).strip()
    market = str(getattr(stock_obj, "market", "") or "KRX").strip()
    fallback = FALLBACK_BY_CODE.get(code, {})

    return {
        "code": code,
        "name": name,
        "market": market,
        "aliases": fallback.get("aliases", []),
        "href": _safe_reverse_stock_detail(code),
        "search_rank": fallback.get("search_rank", 0),
        "is_derivative": _is_derivative_name(name),
        "asset_type": fallback.get("asset_type", "stock"),
    }


def _fallback_payloads():
    result = []

    for item in FALLBACK_STOCKS:
        result.append(
            {
                "code": item["code"],
                "name": item["name"],
                "market": item["market"],
                "aliases": item.get("aliases", []),
                "href": _safe_reverse_stock_detail(item["code"]),
                "search_rank": item.get("search_rank", 0),
                "is_derivative": _is_derivative_name(item["name"]),
            }
        )

    return result


def _get_all_stocks_payload():
    """
    전체 종목 payload 생성은 DB 전체를 순회하므로 홈 화면에서 매번 호출하면 느려진다.
    필요할 때만 사용하고, 기본 홈 렌더링에서는 인기/기본 종목만 내려준다.
    """
    payload = _global_fallback_payloads()
    qs = StockSymbol.objects.all().order_by("market", "name", "code")

    for stock_obj in qs.iterator(chunk_size=1000):
        item = _stock_to_payload(stock_obj)

        if item["code"] and item["name"]:
            payload.append(item)

    existing_codes = {item["code"] for item in payload}

    for item in _fallback_payloads():
        if item["code"] not in existing_codes:
            payload.append(item)

    return payload


def _get_total_stock_count_cached():
    cache_key = "stocks:total_symbol_count:v2"
    cached = cache.get(cache_key)

    if cached is not None:
        return cached

    try:
        value = StockSymbol.objects.count()
    except Exception:
        value = 0

    if not value:
        value = len(_fallback_payloads())

    cache.set(cache_key, value, 60 * 30)
    return value


def _get_popular_payloads(limit=30):
    items = sorted(
        _fallback_payloads(),
        key=lambda item: int(item.get("search_rank") or 0),
        reverse=True,
    )
    return items[:limit]


def _normalize_search_text(value):
    return str(value or "").strip().lower().replace(" ", "")


def _query_fallback_payloads(q):
    q = _normalize_search_text(q)
    q_digits = "".join(ch for ch in q if ch.isdigit())

    if not q:
        return _get_popular_payloads(10)

    matched = []

    for item in _fallback_payloads():
        target = (
            item["name"].lower().replace(" ", "")
            + " "
            + item["code"]
            + " "
            + " ".join(item.get("aliases", [])).lower().replace(" ", "")
        )

        if q in target or (q_digits and q_digits in item["code"]):
            matched.append(item)

    matched.sort(key=lambda item: int(item.get("search_rank") or 0), reverse=True)
    return matched


def _search_stocks_payload(q, limit=30):
    """
    홈 초기 렌더링을 가볍게 만들기 위한 서버 검색 함수.
    전체 종목 JSON을 템플릿에 한 번에 주입하지 않고, 사용자가 검색할 때만 DB를 조회한다.
    """
    q = str(q or "").strip()
    limit = max(1, min(int(limit or 30), 100))

    if not q:
        return _get_popular_payloads(limit)

    q_digits = "".join(ch for ch in q if ch.isdigit())
    filters = Q(name__icontains=q)

    if q_digits:
        filters |= Q(code__icontains=q_digits)
    else:
        filters |= Q(code__icontains=q)

    payload = []
    seen_codes = set()

    try:
        qs = StockSymbol.objects.filter(filters).order_by("market", "name", "code")[:limit]
        for stock_obj in qs:
            item = _stock_to_payload(stock_obj)
            if item["code"] and item["code"] not in seen_codes:
                payload.append(item)
                seen_codes.add(item["code"])
    except Exception:
        pass

    for item in _query_fallback_payloads(q):
        if item["code"] not in seen_codes:
            payload.append(item)
            seen_codes.add(item["code"])
        if len(payload) >= limit:
            break

    def score(item):
        text = _normalize_search_text(item.get("name"))
        code = str(item.get("code") or "")
        query = _normalize_search_text(q)
        rank = int(item.get("search_rank") or 0)

        if code == q_digits or text == query:
            return 100000 + rank
        if code.startswith(q_digits) and q_digits:
            return 80000 + rank
        if text.startswith(query):
            return 70000 + rank
        if query in text:
            return 50000 + rank
        return rank

    payload.sort(key=score, reverse=True)
    return payload[:limit]


def stock_search(request):
    q = (request.GET.get("q") or "").strip()
    lite = request.GET.get("lite") == "1"
    total_stock_count = _get_total_stock_count_cached()

    if q:
        stocks = [
            SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])
            for item in _search_stocks_payload(q, limit=100)
        ]
        initial_payload = [_stock_to_payload(item) for item in stocks[:30]]
    else:
        # 홈 화면은 빠르게 뜨도록 인기 종목만 우선 렌더링한다.
        # 전체 종목 검색은 /stocks/api/search/에서 입력 시점에 가져온다.
        initial_payload = _get_popular_payloads(30)
        stocks = [
            SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])
            for item in initial_payload[:12]
        ]

    return render(
        request,
        "stocks/stock_search.html",
        {
            "q": q,
            "stocks": stocks,
            "total_stock_count": total_stock_count,
            "all_stocks_payload": initial_payload,
            "stock_search_api_url": "/stocks/api/search/",
            "market_temperature_lazy": True,
            "lite": lite,
        },
    )


@require_GET
def api_stock_search(request):
    q = (request.GET.get("q") or request.GET.get("term") or "").strip()
    limit = request.GET.get("limit") or 30

    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 30

    payload = _search_stocks_payload(q, limit=limit)

    return JsonResponse(
        {
            "ok": True,
            "q": q,
            "count": len(payload),
            "results": payload,
        },
        json_dumps_params={"ensure_ascii": False},
    )


def stock_detail(request, code):
    stock = _get_stock(code)

    return render(
        request,
        "stocks/stock_detail.html",
        {
            "stock": stock,
        },
    )



def _normalize_interval(value):
    """
    프론트에서 선택한 interval을 그대로 살린다.
    기존 코드처럼 1m/5m/1h를 1d로 바꾸면 분봉/시간봉 버튼을 눌러도
    서버가 계속 일봉만 내려주게 된다.
    """
    value = str(value or "1d").strip()
    lower = value.lower()

    mapping = {
        "1": "1m",
        "2": "2m",
        "3": "3m",
        "5": "5m",
        "10": "10m",
        "15": "15m",
        "30": "30m",
        "45": "45m",
        "60": "60m",

        "1m": "1m",
        "2m": "2m",
        "3m": "3m",
        "5m": "5m",
        "10m": "10m",
        "15m": "15m",
        "30m": "30m",
        "45m": "45m",
        "60m": "60m",

        "1h": "1h",
        "2h": "2h",
        "3h": "3h",
        "4h": "4h",
        "1시간": "1h",
        "2시간": "2h",
        "3시간": "3h",
        "4시간": "4h",

        "1d": "1d",
        "d": "1d",
        "day": "1d",
        "일": "1d",

        "1w": "1w",
        "w": "1w",
        "week": "1w",
        "주": "1w",

        "1mo": "1mo",
        "1mth": "1mo",
        "mo": "1mo",
        "month": "1mo",
        "월": "1mo",

        "3mo": "3mo",
        "6mo": "6mo",
        "12mo": "12mo",
        "3mth": "3mo",
        "6mth": "6mo",
        "12mth": "12mo",
        "3개월": "3mo",
        "6개월": "6mo",
        "12개월": "12mo",
        "3달": "3mo",
        "6달": "6mo",
        "12달": "12mo",

        "1y": "1y",
        "y": "1y",
        "year": "1y",
    }

    return mapping.get(lower, mapping.get(value, "1d"))



def _normalize_range(value):
    value = str(value or "all").lower().strip()

    mapping = {
        "1": "1d",
        "5": "5d",
        "30": "30d",
        "60": "60d",
        "90": "90d",
        "120": "120d",
        "180": "6m",
        "365": "1y",
        "1d": "1d",
        "5d": "5d",
        "30d": "30d",
        "60d": "60d",
        "90d": "90d",
        "120d": "120d",
        "1m": "1m",
        "3m": "3m",
        "6m": "6m",
        "1y": "1y",
        "3y": "3y",
        "5y": "5y",
        "10y": "10y",
        "all": "all",
    }

    if value in mapping:
        return mapping[value]

    if value.isdigit():
        n = int(value)

        if n <= 1:
            return "1d"
        if n <= 5:
            return "5d"
        if n <= 30:
            return "30d"
        if n <= 60:
            return "60d"
        if n <= 90:
            return "90d"
        if n <= 130:
            return "6m"
        if n <= 260:
            return "1y"
        if n <= 800:
            return "3y"
        return "all"

    return "all"



def _range_start_date(range_key):
    today = datetime.today().date()

    if range_key == "1d":
        return today - timedelta(days=7)
    if range_key == "5d":
        return today - timedelta(days=14)
    if range_key == "30d":
        return today - timedelta(days=45)
    if range_key == "60d":
        return today - timedelta(days=80)
    if range_key == "90d":
        return today - timedelta(days=120)
    if range_key == "120d":
        return today - timedelta(days=160)
    if range_key == "1m":
        return today - timedelta(days=120)
    if range_key == "3m":
        return today - timedelta(days=220)
    if range_key == "6m":
        return today - timedelta(days=360)
    if range_key == "1y":
        return today - timedelta(days=620)
    if range_key == "3y":
        return today - timedelta(days=1300)
    if range_key == "5y":
        return today - timedelta(days=2100)
    if range_key == "10y":
        return today - timedelta(days=4000)

    return datetime(2000, 1, 1).date()



def _visible_start_date(range_key, last_date):
    if range_key == "all":
        return None
    if range_key == "1d":
        return last_date - pd.DateOffset(days=1)
    if range_key == "5d":
        return last_date - pd.DateOffset(days=5)
    if range_key == "30d":
        return last_date - pd.DateOffset(days=30)
    if range_key == "60d":
        return last_date - pd.DateOffset(days=60)
    if range_key == "90d":
        return last_date - pd.DateOffset(days=90)
    if range_key == "120d":
        return last_date - pd.DateOffset(days=120)
    if range_key == "1m":
        return last_date - pd.DateOffset(months=1)
    if range_key == "3m":
        return last_date - pd.DateOffset(months=3)
    if range_key == "6m":
        return last_date - pd.DateOffset(months=6)
    if range_key == "1y":
        return last_date - pd.DateOffset(years=1)
    if range_key == "3y":
        return last_date - pd.DateOffset(years=3)
    if range_key == "5y":
        return last_date - pd.DateOffset(years=5)
    if range_key == "10y":
        return last_date - pd.DateOffset(years=10)
    return None


def _to_float(value):
    if value in [None, "", "null", "None"]:
        return None

    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _naver_sise_json(symbol, fromdate, todate):
    symbol = str(symbol or "").strip().upper()

    if not symbol:
        return _empty_ohlcv()

    params = urlencode(
        {
            "symbol": symbol,
            "requestType": "1",
            "startTime": fromdate,
            "endTime": todate,
            "timeframe": "day",
        }
    )
    url = f"https://api.finance.naver.com/siseJson.naver?{params}"

    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.naver.com/",
        },
    )

    try:
        with urlopen(request, timeout=6) as response:
            raw = response.read().decode("euc-kr", errors="ignore").strip()
    except Exception:
        return _empty_ohlcv()

    if not raw:
        return _empty_ohlcv()

    raw = raw.strip().rstrip(";")

    try:
        data = ast.literal_eval(raw)
    except Exception:
        return _empty_ohlcv()

    if not isinstance(data, list) or len(data) <= 1:
        return _empty_ohlcv()

    rows = []

    for row in data[1:]:
        if not isinstance(row, (list, tuple)) or len(row) < 6:
            continue

        date_value = pd.to_datetime(str(row[0]), format="%Y%m%d", errors="coerce")
        open_value = _to_float(row[1])
        high_value = _to_float(row[2])
        low_value = _to_float(row[3])
        close_value = _to_float(row[4])
        volume_value = _to_float(row[5]) or 0

        if pd.isna(date_value) or close_value is None or close_value <= 0:
            continue

        rows.append(
            {
                "date": date_value,
                "open": open_value or close_value,
                "high": high_value or close_value,
                "low": low_value or close_value,
                "close": close_value,
                "volume": volume_value,
            }
        )

    if not rows:
        return _empty_ohlcv()

    result = pd.DataFrame(rows)
    result = result.sort_values("date").drop_duplicates(subset=["date"]).reset_index(drop=True)

    return result


def _is_intraday_interval(interval):
    interval = _normalize_interval(interval)
    return interval.endswith("m") or interval.endswith("h") or interval == "60m"


def _interval_minutes(interval):
    interval = _normalize_interval(interval)

    if interval.endswith("m"):
        try:
            return int(interval[:-1])
        except ValueError:
            return 1

    if interval.endswith("h"):
        try:
            return int(interval[:-1]) * 60
        except ValueError:
            return 60

    if interval == "60m":
        return 60

    return 0


def _intraday_count_for_range(range_key, interval):
    """
    Naver fchart는 원본 1분봉 count 기준으로 내려온다.
    기존처럼 시간봉에서 count를 줄이면 2시간/4시간 차트가 몇 봉만 나오므로,
    선택한 시간봉과 무관하게 충분한 원본 minute 데이터를 받아 서버에서 재집계한다.
    """
    range_key = _normalize_range(range_key)

    if range_key == "1d":
        return 900
    if range_key == "5d":
        return 3200
    if range_key in ["30d", "1m"]:
        return 9000
    if range_key == "60d":
        return 16000
    if range_key in ["90d", "3m"]:
        return 24000
    if range_key in ["120d", "6m"]:
        return 30000

    return 30000

def _naver_fchart_ohlcv(symbol, timeframe="day", count=2000):
    """
    Naver fchart endpoint.
    minute가 지원되지 않는 종목/상황이면 빈 DataFrame을 반환하고 일봉 fallback으로 넘어간다.
    """
    symbol = str(symbol or "").strip().upper()

    if not symbol:
        return _empty_ohlcv()

    params = urlencode(
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "count": int(count),
            "requestType": "0",
        }
    )

    url = f"https://fchart.stock.naver.com/sise.nhn?{params}"

    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.naver.com/",
        },
    )

    try:
        with urlopen(request, timeout=7) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return _empty_ohlcv()

    rows = []

    # 예: <item data="20240516153000|78000|78500|77500|78200|1234567" />
    for data_text in re.findall(r'data="([^"]+)"', raw):
        parts = data_text.split("|")

        if len(parts) < 6:
            continue

        date_raw = parts[0].strip()

        if len(date_raw) >= 12:
            date_value = pd.to_datetime(date_raw[:14], format="%Y%m%d%H%M%S", errors="coerce")
        else:
            date_value = pd.to_datetime(date_raw[:8], format="%Y%m%d", errors="coerce")

        open_value = _to_float(parts[1])
        high_value = _to_float(parts[2])
        low_value = _to_float(parts[3])
        close_value = _to_float(parts[4])
        volume_value = _to_float(parts[5]) or 0

        if pd.isna(date_value) or close_value is None or close_value <= 0:
            continue

        rows.append(
            {
                "date": date_value,
                "open": open_value or close_value,
                "high": high_value or close_value,
                "low": low_value or close_value,
                "close": close_value,
                "volume": volume_value,
            }
        )

    if not rows:
        return _empty_ohlcv()

    result = pd.DataFrame(rows)
    result = result.sort_values("date").drop_duplicates(subset=["date"]).reset_index(drop=True)

    return result



def _yahoo_symbol_candidates(code):
    """
    Yahoo Finance 한국 종목 심볼 후보를 만든다.
    KOSPI는 .KS, KOSDAQ/KONEX는 .KQ를 우선 사용하고,
    실패 시 반대 suffix도 한 번 더 시도한다.
    """
    code = _clean_code(code)

    if not code:
        return []

    stock_obj = _get_stock(code)
    market = str(getattr(stock_obj, "market", "") or "").upper()

    if "KOSDAQ" in market or "KONEX" in market:
        candidates = [f"{code}.KQ", f"{code}.KS"]
    else:
        candidates = [f"{code}.KS", f"{code}.KQ"]

    result = []
    for item in candidates:
        if item not in result:
            result.append(item)

    return result


def _yahoo_period_for_range(range_key):
    raw = str(range_key or "").strip().lower()

    # v10: 국내 코스피/코스닥 종목 시간봉도 해외지수처럼 길게 가져온다.
    # yfinance/Yahoo의 1h 데이터는 보통 10년치가 아니라 최대 약 730일권이 한계다.
    # 프론트가 120d를 보내더라도 백엔드에서 effective_range=730d로 바꿔 호출한다.
    if raw in {"730d", "720d", "2y", "24mo"}:
        return "730d"

    range_key = _normalize_range(range_key)

    if range_key in ["1d", "5d"]:
        return "10d"
    if range_key in ["30d", "1m"]:
        return "45d"
    if range_key == "60d":
        return "80d"
    if range_key in ["90d", "3m"]:
        return "100d"
    if range_key in ["120d", "6m"]:
        return "180d"
    if range_key == "1y":
        return "365d"

    return "730d"


def _extract_yfinance_column(df, target_name):
    if df is None or df.empty:
        return None

    target_name = str(target_name).lower()

    for col in df.columns:
        if isinstance(col, tuple):
            if any(str(part).lower() == target_name for part in col):
                return df[col]
        else:
            if str(col).lower() == target_name:
                return df[col]

    return None


def _standardize_yfinance_intraday_df(df):
    if df is None or df.empty:
        return _empty_ohlcv()

    try:
        open_series = _extract_yfinance_column(df, "Open")
        high_series = _extract_yfinance_column(df, "High")
        low_series = _extract_yfinance_column(df, "Low")
        close_series = _extract_yfinance_column(df, "Close")
        volume_series = _extract_yfinance_column(df, "Volume")

        if open_series is None or high_series is None or low_series is None or close_series is None:
            return _empty_ohlcv()

        dates = pd.to_datetime(df.index, errors="coerce")

        try:
            if getattr(dates, "tz", None) is not None:
                dates = dates.tz_convert("Asia/Seoul").tz_localize(None)
        except Exception:
            try:
                dates = dates.tz_localize(None)
            except Exception:
                pass

        result = pd.DataFrame(
            {
                "date": dates,
                "open": pd.to_numeric(open_series, errors="coerce"),
                "high": pd.to_numeric(high_series, errors="coerce"),
                "low": pd.to_numeric(low_series, errors="coerce"),
                "close": pd.to_numeric(close_series, errors="coerce"),
                "volume": pd.to_numeric(volume_series if volume_series is not None else 0, errors="coerce").fillna(0),
            }
        )

        result = result.dropna(subset=["date", "open", "high", "low", "close"])
        result = result[result["close"] > 0]
        result = result.sort_values("date").drop_duplicates(subset=["date"]).reset_index(drop=True)

        return result
    except Exception:
        return _empty_ohlcv()


def _fetch_yahoo_intraday(code, range_key, interval):
    """
    국내 개별종목 1시간~4시간봉 전용 데이터 소스.

    v10:
    - 기존에는 프론트가 보내는 range=120d/60d에 묶여 시간봉이 짧게 잘렸다.
    - 이제 국내 KOSPI/KOSDAQ 종목도 해외지수와 동일하게 1h 원본을 최대 730일권까지 요청한다.
    - 2h/3h/4h는 1h 원본을 받은 뒤 _aggregate_intraday_interval()에서 서버 재집계한다.
    - Yahoo/yfinance 환경에 따라 730d가 실패할 수 있어 2y → 1y → 180d 순서로 fallback한다.
    """
    code = _clean_code(code)

    if not code or yf is None:
        return _empty_ohlcv()

    preferred_period = _yahoo_period_for_range(range_key)
    period_candidates = [preferred_period]

    if preferred_period in {"730d", "2y"}:
        period_candidates += ["2y", "1y", "180d"]
    else:
        period_candidates += ["730d", "2y", "1y", "180d"]

    # 중복 제거
    period_candidates = list(dict.fromkeys([p for p in period_candidates if p]))

    best_result = _empty_ohlcv()

    for symbol in _yahoo_symbol_candidates(code):
        for period in period_candidates:
            try:
                df = yf.download(
                    symbol,
                    period=period,
                    interval="1h",
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                    prepost=False,
                )
            except Exception:
                continue

            result = _standardize_yfinance_intraday_df(df)

            if result.empty:
                continue

            if len(result) > len(best_result):
                best_result = result

            # 730d/2y 요청에서 충분히 길게 오면 바로 사용
            if period in {"730d", "2y"} and len(result) >= 700:
                return result

        if not best_result.empty:
            return best_result

    return best_result

def _fetch_naver_intraday(code, range_key, interval):
    code = _clean_code(code)

    if not code:
        return _empty_ohlcv()

    count = _intraday_count_for_range(range_key, interval)

    # 1차: fchart minute
    df = _naver_fchart_ohlcv(code, timeframe="minute", count=count)

    if not df.empty:
        return df

    # 2차: 일부 환경에서 min으로 응답하는 경우 대비
    df = _naver_fchart_ohlcv(code, timeframe="min", count=count)

    if not df.empty:
        return df

    return _empty_ohlcv()


def _aggregate_intraday_interval(df, interval):
    if df.empty:
        return df

    minutes = _interval_minutes(interval)

    if minutes <= 1:
        return df.sort_values("date").reset_index(drop=True)

    df = df.copy().sort_values("date")
    df = df.set_index("date")

    if minutes < 60:
        rule = f"{minutes}min"
    else:
        rule = f"{minutes}min"

    grouped = df.resample(rule, origin="start_day", offset="9h", label="left", closed="left").agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }
    )

    grouped = grouped.dropna(subset=["open", "high", "low", "close"])
    grouped = grouped.reset_index().sort_values("date").reset_index(drop=True)

    return grouped


def _daily_interval_from_display_interval(interval):
    interval = _normalize_interval(interval)

    if interval == "1w":
        return "1w"
    if interval in ["1mo", "3mo", "6mo", "12mo"]:
        return interval
    if interval == "1y":
        return "1y"

    return "1d"


def _standardize_krx_df(df):
    if df is None or df.empty:
        return _empty_ohlcv()

    try:
        df = df.reset_index()
        date_col = "날짜" if "날짜" in df.columns else df.columns[0]
        required = ["시가", "고가", "저가", "종가"]

        if any(col not in df.columns for col in required):
            return _empty_ohlcv()

        if "거래량" in df.columns:
            volume_series = df["거래량"]
        else:
            volume_series = pd.Series([0] * len(df))

        result = pd.DataFrame(
            {
                "date": pd.to_datetime(df[date_col], errors="coerce"),
                "open": pd.to_numeric(df["시가"], errors="coerce"),
                "high": pd.to_numeric(df["고가"], errors="coerce"),
                "low": pd.to_numeric(df["저가"], errors="coerce"),
                "close": pd.to_numeric(df["종가"], errors="coerce"),
                "volume": pd.to_numeric(volume_series, errors="coerce").fillna(0),
            }
        )

        result = result.dropna(subset=["date", "open", "high", "low", "close"])
        result = result[result["close"] > 0]
        result = result.sort_values("date").drop_duplicates(subset=["date"]).reset_index(drop=True)

        return result
    except Exception:
        return _empty_ohlcv()


def _fetch_pykrx_daily(code, range_key):
    code = _clean_code(code)

    if not code:
        return _empty_ohlcv()

    start_date = _range_start_date(range_key)
    today = datetime.today().date()
    fromdate = start_date.strftime("%Y%m%d")

    # 1차: pykrx
    for back in range(0, 40):
        end_date = today - timedelta(days=back)
        todate = end_date.strftime("%Y%m%d")

        try:
            df = krx_stock.get_market_ohlcv_by_date(fromdate, todate, code)
            result = _standardize_krx_df(df)

            if not result.empty:
                return result
        except Exception:
            continue

    # 2차: Naver Finance 일봉 fallback
    naver_df = _naver_sise_json(code, fromdate, today.strftime("%Y%m%d"))

    if not naver_df.empty:
        return naver_df

    return _empty_ohlcv()



def _aggregate_interval(df, interval):
    if df.empty:
        return df

    interval = _normalize_interval(interval)
    df = df.copy().sort_values("date")

    if interval == "1d":
        return df.reset_index(drop=True)

    df = df.set_index("date")

    if interval == "1w":
        rule = "W-FRI"
    elif interval == "1mo":
        rule = "ME"
    elif interval == "3mo":
        rule = "3ME"
    elif interval == "6mo":
        rule = "6ME"
    elif interval == "12mo":
        rule = "12ME"
    elif interval == "1y":
        rule = "YE"
    else:
        return df.reset_index()

    try:
        grouped = df.resample(rule).agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )
    except ValueError:
        fallback_map = {
            "1mo": "M",
            "3mo": "3M",
            "6mo": "6M",
            "12mo": "12M",
            "1y": "Y",
        }
        fallback_rule = fallback_map.get(interval, "W-FRI")

        grouped = df.resample(fallback_rule).agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )

    grouped = grouped.dropna(subset=["open", "high", "low", "close"])
    grouped = grouped.reset_index().sort_values("date").reset_index(drop=True)

    return grouped


def _apply_visible_range(df, range_key):
    if df.empty or range_key == "all":
        return df

    last_date = df["date"].max()
    start_date = _visible_start_date(range_key, last_date)

    if start_date is None:
        return df

    return df[df["date"] >= start_date].reset_index(drop=True)


def _calc_ma(rows, period):
    result = []

    if not rows or len(rows) < period:
        return result

    for i in range(len(rows)):
        if i < period - 1:
            continue

        window = rows[i - period + 1:i + 1]
        avg = sum(item["close"] for item in window) / period

        result.append({"time": rows[i]["time"], "value": round(avg, 2)})

    return result



def _yahoo_chart_period_for_range(range_key, intraday=False):
    range_key = _normalize_range(range_key)

    if intraday:
        if range_key in ["1d", "5d"]:
            return "5d"
        if range_key in ["30d", "1m"]:
            return "1mo"
        if range_key in ["60d"]:
            return "2mo"
        if range_key in ["90d", "3m"]:
            return "3mo"
        if range_key in ["120d", "6m"]:
            return "6mo"
        return "730d"

    mapping = {
        "1d": "5d",
        "5d": "5d",
        "30d": "1mo",
        "60d": "2mo",
        "90d": "3mo",
        "120d": "6mo",
        "1m": "1mo",
        "3m": "3mo",
        "6m": "6mo",
        "1y": "1y",
        "3y": "3y",
        "5y": "5y",
        "10y": "10y",
        "all": "max",
    }
    return mapping.get(range_key, "max")


def _yahoo_chart_url(symbol, range_key="all", interval="1d", host="query1.finance.yahoo.com"):
    """Yahoo Chart API URL을 만든다. range 방식은 Yahoo 공식 차트와 가장 가깝다."""
    interval = _normalize_interval(interval)
    intraday = _is_intraday_interval(interval)
    yahoo_interval = "1h" if intraday else "1d"
    yahoo_range = _yahoo_chart_period_for_range(range_key, intraday=intraday)
    encoded = quote(str(symbol or "").strip(), safe="")
    return (
        f"https://{host}/v8/finance/chart/{encoded}"
        f"?range={yahoo_range}&interval={yahoo_interval}"
        f"&includePrePost=false&events=history&includeAdjustedClose=true"
    )


def _yahoo_chart_result(symbol, range_key="all", interval="1d"):
    """query1 실패 시 query2도 시도한다."""
    symbol = str(symbol or "").strip()
    if not symbol:
        return None

    for host in ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]:
        url = _yahoo_chart_url(symbol, range_key=range_key, interval=interval, host=host)
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json,text/plain,*/*",
                "Referer": "https://finance.yahoo.com/",
            },
        )
        try:
            with urlopen(request, timeout=5) as response:
                raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            result = (payload.get("chart", {}).get("result") or [None])[0]
            if result:
                return result
        except Exception:
            continue
    return None


def _standardize_yahoo_chart_result(result, interval="1d"):
    if not result:
        return _empty_ohlcv()

    interval = _normalize_interval(interval)
    intraday = _is_intraday_interval(interval)
    meta = result.get("meta") or {}
    # 미국 지수는 거래소 기준일로 표시해야 네이버/증권사 차트와 날짜가 맞는다.
    exchange_tz = meta.get("exchangeTimezoneName") or "America/New_York"

    timestamps = result.get("timestamp") or []
    quote_data = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    adjclose_data = ((result.get("indicators") or {}).get("adjclose") or [{}])[0]

    opens = quote_data.get("open") or []
    highs = quote_data.get("high") or []
    lows = quote_data.get("low") or []
    closes = quote_data.get("close") or []
    adj_closes = adjclose_data.get("adjclose") or []
    volumes = quote_data.get("volume") or []

    rows = []
    for i, ts in enumerate(timestamps):
        open_value = _to_float(opens[i] if i < len(opens) else None)
        high_value = _to_float(highs[i] if i < len(highs) else None)
        low_value = _to_float(lows[i] if i < len(lows) else None)
        close_value = _to_float(closes[i] if i < len(closes) else None)
        adj_close_value = _to_float(adj_closes[i] if i < len(adj_closes) else None)
        volume_value = _to_float(volumes[i] if i < len(volumes) else 0) or 0

        # 일부 지수에서 close가 비어 들어오면 adjclose를 fallback으로 사용한다.
        if close_value is None:
            close_value = adj_close_value

        if close_value is None or close_value <= 0:
            continue

        if open_value is None:
            open_value = close_value
        if high_value is None:
            high_value = max(open_value, close_value)
        if low_value is None:
            low_value = min(open_value, close_value)

        high_value = max(high_value, open_value, close_value)
        low_value = min(low_value, open_value, close_value)

        date_value = pd.to_datetime(ts, unit="s", utc=True, errors="coerce")
        if pd.isna(date_value):
            continue

        try:
            date_value = date_value.tz_convert(exchange_tz).tz_localize(None)
        except Exception:
            try:
                date_value = date_value.tz_convert("America/New_York").tz_localize(None)
            except Exception:
                try:
                    date_value = date_value.tz_localize(None)
                except Exception:
                    pass

        # 일봉은 시간값을 잘라 거래일(date) 단위로 고정한다.
        # 그래야 미국장이 열린 중간에도 국내 차트 엔진에서 날짜가 하루 밀리지 않는다.
        if not intraday:
            date_value = pd.to_datetime(date_value.date())

        rows.append({
            "date": date_value,
            "open": open_value,
            "high": high_value,
            "low": low_value,
            "close": close_value,
            "volume": volume_value,
        })

    if not rows:
        return _empty_ohlcv()

    result_df = pd.DataFrame(rows)
    result_df = result_df.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
    return result_df


def _stooq_symbol_candidates(symbol, item=None):
    item = item or {}
    candidates = []
    if item.get("stooq_symbol"):
        candidates.append(item["stooq_symbol"])

    raw = str(symbol or "").strip().lower()
    stooq_map = {
        "^ixic": ["^ixic", "^compq"],
        "^ndx": ["^ndx", "^ndq"],
        "^gspc": ["^spx", "^gspc"],
        "^spx": ["^spx"],
        "^sox": ["^sox"],
        "nq=f": ["nq.f", "mnq.f"],
    }
    candidates.extend(stooq_map.get(raw, [raw]))

    result = []
    for candidate in candidates:
        candidate = str(candidate or "").strip().lower()
        if candidate and candidate not in result:
            result.append(candidate)
    return result


def _fetch_stooq_daily_ohlcv(symbol, item=None):
    """Yahoo가 비정상 응답일 때 해외지수 일봉 fallback. 시간봉/선물은 Yahoo 우선."""
    for stooq_symbol in _stooq_symbol_candidates(symbol, item=item):
        url = f"https://stooq.com/q/d/l/?s={quote(stooq_symbol, safe='')}&i=d"
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/csv,*/*",
            },
        )
        try:
            with urlopen(request, timeout=8) as response:
                raw = response.read().decode("utf-8", errors="ignore")
        except Exception:
            continue

        rows = []
        for line in raw.splitlines()[1:]:
            parts = [part.strip() for part in line.split(",")]
            if len(parts) < 5:
                continue
            date_value = pd.to_datetime(parts[0], errors="coerce")
            open_value = _to_float(parts[1])
            high_value = _to_float(parts[2])
            low_value = _to_float(parts[3])
            close_value = _to_float(parts[4])
            volume_value = _to_float(parts[5]) if len(parts) >= 6 else 0
            if pd.isna(date_value) or close_value is None or close_value <= 0:
                continue
            rows.append({
                "date": date_value,
                "open": open_value if open_value is not None else close_value,
                "high": high_value if high_value is not None else close_value,
                "low": low_value if low_value is not None else close_value,
                "close": close_value,
                "volume": volume_value or 0,
            })

        if rows:
            df = pd.DataFrame(rows)
            df = df.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
            return df
    return _empty_ohlcv()


def _fetch_yahoo_chart_ohlcv(symbol, range_key="all", interval="1d", item=None):
    """
    해외지수/선물 차트용 강화 fetcher.
    - Yahoo query1/query2 모두 시도
    - 내부 심볼 후보를 순차 시도
    - 일봉은 거래소 기준 날짜로 고정
    - Yahoo 실패 시 Stooq 일봉 fallback
    """
    item = item or {}
    symbols = item.get("yahoo_symbols") or [symbol]
    symbols = [str(x or "").strip() for x in symbols if str(x or "").strip()]

    if not symbols:
        return _empty_ohlcv()

    interval = _normalize_interval(interval)
    intraday = _is_intraday_interval(interval)
    best_df = _empty_ohlcv()

    for candidate in symbols:
        result = _yahoo_chart_result(candidate, range_key=range_key, interval=interval)
        df = _standardize_yahoo_chart_result(result, interval=interval)
        if not df.empty and len(df) >= max(5, len(best_df)):
            best_df = df
            # 일봉은 첫 정상 후보를 사용한다. 보통 ^IXIC/^NDX/^GSPC가 정답이다.
            if not intraday and len(df) >= 30:
                return df
            if intraday and len(df) >= 20:
                return df

    if not intraday:
        for candidate in symbols:
            stooq_df = _fetch_stooq_daily_ohlcv(candidate, item=item)
            if not stooq_df.empty and len(stooq_df) > len(best_df):
                best_df = stooq_df
                break

    return best_df

def _format_chart_number(value, decimals=2):
    number = _to_float(value)
    if number is None:
        return 0
    if abs(number) >= 1000:
        return round(number, 2)
    return round(number, decimals)


def _global_default_visible_bars(asset_code, interval, range_key):
    """
    v9 최종형: 해외지수/선물은 데이터는 최대한 길게 내려주고,
    첫 화면은 보기 좋은 수준으로만 잡는다.

    - 일봉: 데이터 10년, 첫 화면 약 3년
    - 주봉/월봉: 장기 흐름 확인용
    - 1~4시간봉: Yahoo Chart API가 허용하는 최대권(730d)을 받아오고,
      첫 화면도 최대한 길게 보여준다. rows가 visible_bars보다 적으면 전체를 fitContent한다.

    참고: Yahoo Finance는 1h intraday를 10년치로 제공하지 않고 보통 최대 730일 수준이다.
    그래서 시간봉은 '10년 데이터'가 아니라 '가능한 최대 730일 데이터 + 넓은 첫 화면' 전략으로 간다.
    """
    asset_code = _normalize_asset_code(asset_code)
    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)

    if asset_code in {"KOSPI", "KOSDAQ"} and not _is_intraday_interval(interval):
        return 0

    if interval == "1d":
        return 756      # 약 3년치 일봉
    if interval == "1w":
        return 520      # 약 10년치 주봉
    if interval in {"1mo", "3mo", "6mo", "12mo", "1y"}:
        return 240      # 월봉/장기봉

    if _is_intraday_interval(interval):
        # 1h 원본을 730d까지 가져온 뒤 2h/3h/4h는 서버에서 재집계한다.
        # visible_bars를 넉넉하게 잡아 rows가 이보다 적으면 전체 730d가 한 번에 보인다.
        if interval in {"1h", "60m"}:
            return 3600
        if interval == "2h":
            return 2400
        if interval == "3h":
            return 1800
        if interval == "4h":
            return 1400
        return 2400

    return 756


def _global_effective_range_for_fetch(asset_code, interval, range_key):
    """
    해외지수/선물은 v9부터 '프론트가 보내는 120d/60d range'에 묶이지 않는다.

    기존 문제:
    - bitgak_chart_core.js의 1h~4h 버튼은 range=120d를 보냈다.
    - 백엔드가 그 값을 그대로 존중해서 해외 시간봉이 몇 달치만 잘려 보였다.

    수정:
    - KOSPI/KOSDAQ은 기존 국내지수 로직 유지.
    - 해외 일봉/주봉/월봉은 10년치 fetch.
    - 해외 1~4시간봉은 Yahoo가 허용하는 최대권인 730d fetch.
    - 첫 화면 표시 범위는 default_visible_bars가 담당한다.
    """
    asset_code = _normalize_asset_code(asset_code)
    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)

    if asset_code in {"KOSPI", "KOSDAQ"}:
        if _is_intraday_interval(interval):
            return "730d"
        return range_key

    if _is_intraday_interval(interval):
        return "730d"

    if range_key != "all":
        # 해외지수 검색 화면에서 사용자가 명시적으로 기간을 보낸 경우도
        # 일봉/주봉/월봉은 차트 이동으로 과거 확인이 가능하도록 기본값보다 짧게 자르지 않는다.
        # 단, 1d/5d/30d 같은 명시 요청을 살리고 싶으면 아래 return을 range_key로 바꾸면 된다.
        pass

    if interval == "1d":
        return "10y"
    if interval == "1w":
        return "10y"
    if interval in {"1mo", "3mo", "6mo", "12mo", "1y"}:
        return "10y"

    return "10y"

def _fetch_krx_index_daily_by_asset(asset_code, range_key):
    item = GLOBAL_INDEX_SYMBOLS.get(_normalize_asset_code(asset_code) or "")

    if not item or not item.get("krx_index_code"):
        return _empty_ohlcv()

    range_key = _normalize_range(range_key)
    start_date = _range_start_date(range_key)
    today = datetime.today().date()
    fromdate = start_date.strftime("%Y%m%d")
    index_code = item["krx_index_code"]
    naver_symbol = item.get("naver_symbol") or item.get("code")

    for back in range(0, 40):
        end_date = today - timedelta(days=back)
        todate = end_date.strftime("%Y%m%d")

        try:
            df = krx_stock.get_index_ohlcv_by_date(fromdate, todate, index_code)
            result = _standardize_krx_df(df)
            if not result.empty:
                return result
        except Exception:
            continue

    naver_df = _naver_sise_json(naver_symbol, fromdate, today.strftime("%Y%m%d"))
    if not naver_df.empty:
        return naver_df

    return _empty_ohlcv()


def _make_global_symbol_payload(code, range_key, interval):
    asset_code = _normalize_asset_code(code)
    item = GLOBAL_INDEX_SYMBOLS.get(asset_code)

    if not item:
        return None

    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)
    intraday_requested = _is_intraday_interval(interval)
    intraday_source_used = False
    effective_range_key = _global_effective_range_for_fetch(asset_code, interval, range_key)
    default_visible_bars = _global_default_visible_bars(asset_code, interval, range_key)

    # KOSPI/KOSDAQ 일봉·주봉·월봉은 Yahoo가 아니라 pykrx 지수 API를 우선 사용합니다.
    # 이게 네이버/증권사에서 보는 코스피·코스닥 모양과 가장 잘 맞습니다.
    if item.get("krx_index_code") and not intraday_requested:
        base_df = _fetch_krx_index_daily_by_asset(asset_code, effective_range_key)
        daily_interval = _daily_interval_from_display_interval(interval)
        chart_df = _aggregate_interval(base_df, daily_interval)
        source = f"pykrx-index:{item['krx_index_code']}"
        provider = "pykrx-index"
    else:
        base_df = _fetch_yahoo_chart_ohlcv(item["yahoo_symbol"], effective_range_key, interval, item=item)
        if intraday_requested:
            chart_df = _aggregate_intraday_interval(base_df, interval)
            intraday_source_used = not chart_df.empty
        else:
            daily_interval = _daily_interval_from_display_interval(interval)
            chart_df = _aggregate_interval(base_df, daily_interval)
        source = f"Yahoo Finance chart API:{item['yahoo_symbol']}"
        provider = "yahoo-finance"

    chart_df = _apply_visible_range(chart_df, effective_range_key)

    if chart_df.empty:
        return {
            "ok": False,
            "message": f"{item['name']} 데이터를 불러오지 못했습니다. pykrx/Yahoo Finance 응답을 확인하세요.",
            "code": item["code"],
            "name": item["name"],
            "market": item["market"],
            "asset_type": item.get("asset_type", "index"),
            "price_unit": item.get("price_unit", "pt"),
            "price_precision": 2,
            "default_visible_bars": default_visible_bars,
            "initial_visible_bars": default_visible_bars,
            "range": range_key,
            "effective_range": effective_range_key,
            "interval": interval,
            "requested_interval": interval,
            "intraday": False,
            "intraday_requested": intraday_requested,
            "server_aggregated": False,
            "provider": provider,
            "source": source,
            "results": [],
            "rows": [],
            "ohlc": [],
            "volume": [],
            "ma20": [],
            "ma60": [],
            "ma120": [],
        }

    results = []
    ohlc = []
    volume = []

    for _, row in chart_df.iterrows():
        date_value = pd.to_datetime(row["date"])
        time_value = date_value.strftime("%Y-%m-%d %H:%M") if intraday_requested else date_value.strftime("%Y-%m-%d")

        open_price = _format_chart_number(row["open"], decimals=2)
        high_price = _format_chart_number(row["high"], decimals=2)
        low_price = _format_chart_number(row["low"], decimals=2)
        close_price = _format_chart_number(row["close"], decimals=2)
        vol = int(float(row["volume"] or 0))

        result_item = {
            "time": time_value,
            "display_time": time_value,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": vol,
        }

        results.append(result_item)
        ohlc.append({"time": time_value, "open": open_price, "high": high_price, "low": low_price, "close": close_price})
        volume.append({
            "time": time_value,
            "value": vol,
            "color": "rgba(38, 166, 154, 0.42)" if close_price >= open_price else "rgba(239, 83, 80, 0.42)",
        })

    last = results[-1]
    prev = results[-2] if len(results) >= 2 else last
    change = round(float(last["close"]) - float(prev["close"]), 2)
    change_rate = round((change / float(prev["close"])) * 100, 2) if float(prev["close"]) else 0

    return {
        "ok": True,
        "source": source,
        "message": "",
        "code": item["code"],
        "name": item["name"],
        "market": item["market"],
        "asset_type": item.get("asset_type", "index"),
        "yahoo_symbol": item.get("yahoo_symbol", ""),
        "price_unit": item.get("price_unit", "pt"),
        "price_precision": 2,
        "default_visible_bars": default_visible_bars,
        "initial_visible_bars": default_visible_bars,
        "range": range_key,
        "effective_range": effective_range_key,
        "interval": interval,
        "requested_interval": interval,
        "intraday": intraday_source_used,
        "intraday_requested": intraday_requested,
        "server_aggregated": intraday_source_used,
        "provider": provider,
        "current": {"price": last["close"], "change": change, "change_rate": change_rate},
        "results": results,
        "rows": results,
        "ohlc": ohlc,
        "volume": volume,
        "ma20": _calc_ma(results, 20),
        "ma60": _calc_ma(results, 60),
        "ma120": _calc_ma(results, 120),
    }



def _domestic_default_visible_bars(interval):
    """국내 KOSPI/KOSDAQ 개별종목 시간봉 첫 화면 표시 봉 수."""
    interval = _normalize_interval(interval)

    if interval in {"1h", "60m"}:
        return 3600
    if interval == "2h":
        return 2400
    if interval == "3h":
        return 1800
    if interval == "4h":
        return 1400
    return 0


def _domestic_effective_range_for_fetch(interval, range_key):
    """
    국내 개별종목은 프론트의 120d range에 묶이지 않고 시간봉을 최대한 길게 받는다.
    일/주/월봉은 기존 range 정책을 유지한다.
    """
    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)

    if _is_intraday_interval(interval):
        return "730d"

    return range_key

def _make_payload(code, range_key, interval):
    code = _normalize_asset_code(code)
    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)

    if code in GLOBAL_INDEX_SYMBOLS:
        return _make_global_symbol_payload(code, range_key, interval)

    code = _clean_code(code)
    stock = _get_stock(code)

    intraday_requested = _is_intraday_interval(interval)
    intraday_source_used = False
    source = "pykrx/naver"
    effective_range_key = _domestic_effective_range_for_fetch(interval, range_key)
    default_visible_bars = _domestic_default_visible_bars(interval) if intraday_requested else 0

    if intraday_requested:
        base_df = _fetch_yahoo_intraday(code, effective_range_key, interval)

        if not base_df.empty:
            chart_df = _aggregate_intraday_interval(base_df, interval)
            # effective_range_key=730d는 _apply_visible_range에서 자르지 않는다.
            # 그래서 데이터는 길게 유지되고, 첫 화면은 default_visible_bars로만 조정된다.
            chart_df = _apply_visible_range(chart_df, effective_range_key)
            intraday_source_used = True
            source = "yfinance-hourly-730d"
        else:
            chart_df = _empty_ohlcv()
            source = "yfinance-hourly-empty"
    else:
        daily_df = _fetch_pykrx_daily(code, effective_range_key)
        daily_interval = _daily_interval_from_display_interval(interval)
        chart_df = _aggregate_interval(daily_df, daily_interval)
        chart_df = _apply_visible_range(chart_df, effective_range_key)

    if chart_df.empty:
        return {
            "ok": False,
            "message": "표시할 차트 데이터가 없습니다. 시간봉은 Yahoo/yfinance 데이터가 제한되었거나 yfinance가 설치되지 않았을 수 있습니다.",
            "code": code,
            "name": stock.name,
            "market": getattr(stock, "market", "KRX"),
            "range": range_key,
            "interval": interval,
            "requested_interval": interval,
            "intraday": False,
            "intraday_requested": intraday_requested,
            "server_aggregated": False,
            "provider": source,
            "price_unit": "원",
            "price_precision": 0,
            "default_visible_bars": default_visible_bars,
            "initial_visible_bars": default_visible_bars,
            "effective_range": effective_range_key,
            "results": [],
            "rows": [],
            "ohlc": [],
            "volume": [],
            "ma20": [],
            "ma60": [],
            "ma120": [],
        }

    results = []
    ohlc = []
    volume = []

    for _, row in chart_df.iterrows():
        date_value = pd.to_datetime(row["date"])

        if intraday_source_used:
            time_value = date_value.strftime("%Y-%m-%d %H:%M")
        else:
            time_value = date_value.strftime("%Y-%m-%d")

        open_price = int(float(row["open"]))
        high_price = int(float(row["high"]))
        low_price = int(float(row["low"]))
        close_price = int(float(row["close"]))
        vol = int(float(row["volume"] or 0))

        item = {
            "time": time_value,
            "display_time": time_value,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": vol,
        }

        results.append(item)
        ohlc.append({"time": time_value, "open": open_price, "high": high_price, "low": low_price, "close": close_price})
        volume.append(
            {
                "time": time_value,
                "value": vol,
                "color": "rgba(38, 166, 154, 0.42)" if close_price >= open_price else "rgba(239, 83, 80, 0.42)",
            }
        )

    last = results[-1]
    prev = results[-2] if len(results) >= 2 else last
    change = int(last["close"] - prev["close"])
    change_rate = round((change / prev["close"]) * 100, 2) if prev["close"] else 0

    message = ""
    if intraday_requested and not intraday_source_used:
        message = "시간봉 원본 데이터를 가져오지 못했습니다. yfinance 설치 여부와 Yahoo Finance 응답을 확인하세요."

    return {
        "ok": True,
        "source": source,
        "message": message,
        "code": code,
        "name": stock.name,
        "market": getattr(stock, "market", "KRX"),
        "range": range_key,
        "effective_range": effective_range_key,
        "default_visible_bars": default_visible_bars,
        "initial_visible_bars": default_visible_bars,
        "interval": interval,
        "requested_interval": interval,
        "intraday": intraday_source_used,
        "intraday_requested": intraday_requested,
        "server_aggregated": intraday_source_used,
        "provider": "yfinance" if intraday_source_used else source,
        "price_unit": "원",
        "price_precision": 0,
        "current": {"price": int(last["close"]), "change": change, "change_rate": change_rate},
        "results": results,
        "rows": results,
        "ohlc": ohlc,
        "volume": volume,
        "ma20": _calc_ma(results, 20),
        "ma60": _calc_ma(results, 60),
        "ma120": _calc_ma(results, 120),
    }


def _chart_payload_cache_timeout(code, interval):
    """차트 API 응답 캐시 시간.

    외부 시세 API(pykrx, yfinance, Yahoo chart)를 매 클릭마다 호출하면
    차트 로딩이 크게 느려집니다. 같은 종목/지표/시간봉 요청은 짧게 캐시해서
    사용자가 뒤로가기·새로고침·시간봉 전환 후 재진입할 때 즉시 응답하도록 합니다.
    """
    interval = _normalize_interval(interval)
    asset_code = _normalize_asset_code(code)
    intraday = _is_intraday_interval(interval)

    if asset_code in GLOBAL_INDEX_SYMBOLS:
        # 대표지수는 외부 Yahoo/pykrx 호출이 체감 병목입니다.
        # 사용자가 차트를 열 때마다 새로 받지 않도록 일반 종목보다 길게 캐시합니다.
        if intraday:
            return 60 * 20     # 지수 시간봉: 20분 캐시
        return 60 * 60 * 4     # 지수 일/주/월봉: 4시간 캐시

    if intraday:
        return 60 * 10         # 국내 개별종목 시간봉: 10분 캐시
    return 60 * 30             # 국내 개별종목 일/주/월봉: 30분 캐시


@require_GET
def api_ohlcv(request, code):
    display_interval = request.GET.get("display_interval")
    interval = _normalize_interval(display_interval or request.GET.get("interval", "1d"))
    range_value = request.GET.get("range")
    pages_value = request.GET.get("pages")

    if range_value:
        range_key = _normalize_range(range_value)
    elif pages_value:
        range_key = "all"
    else:
        range_key = "all"

    asset_code = _normalize_asset_code(code)
    cache_key = f"stocks:chart-payload:v12:{asset_code}:{range_key}:{interval}"

    if request.GET.get("refresh") != "1":
        cached = cache.get(cache_key)
        if cached is not None:
            payload = dict(cached)
            payload["cache_hit"] = True
            return JsonResponse(payload, status=200, json_dumps_params={"ensure_ascii": False})

    payload = _make_payload(code, range_key, interval)
    payload["cache_hit"] = False

    if payload.get("ok"):
        cache.set(cache_key, payload, _chart_payload_cache_timeout(code, interval))

    return JsonResponse(payload, status=200, json_dumps_params={"ensure_ascii": False})


@require_GET
def api_chart(request):
    """
    bitgak_chart_core.js의 apiUrl이 /stocks/api/chart/로 잡혀 있어도 동작하게 하는 호환 엔드포인트.
    code는 ?code=005930 또는 ?symbol=005930로 받는다.
    """
    code = request.GET.get("code") or request.GET.get("symbol") or request.GET.get("ticker") or "005930"
    return api_ohlcv(request, code)


def _clamp(value, min_value=0, max_value=100):
    try:
        value = float(value)
    except (TypeError, ValueError):
        value = min_value

    return max(min_value, min(max_value, value))


def _format_number(value, decimals=2):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return ""

    return f"{value:,.{decimals}f}"


def _format_signed_percent(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return ""

    return f"{value:+.2f}%"


def _fetch_index_ohlcv(index_code, naver_symbol, days=430):
    today = datetime.today().date()
    fromdate = (today - timedelta(days=days)).strftime("%Y%m%d")

    # 1차: pykrx 지수 API. get_market_ticker_list/name 계열은 절대 쓰지 않는다.
    for back in range(0, 40):
        end_date = today - timedelta(days=back)
        todate = end_date.strftime("%Y%m%d")

        try:
            df = krx_stock.get_index_ohlcv_by_date(fromdate, todate, index_code)
            result = _standardize_krx_df(df)

            if not result.empty:
                return result
        except Exception:
            continue

    # 2차: Naver Finance 지수 일봉 fallback
    naver_df = _naver_sise_json(naver_symbol, fromdate, today.strftime("%Y%m%d"))

    if not naver_df.empty:
        return naver_df

    return _empty_ohlcv()


def _index_metrics(df):
    if df is None or df.empty:
        return None

    close = pd.to_numeric(df["close"], errors="coerce").dropna()

    if close.empty:
        return None

    last = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) >= 2 else last
    change = last - prev
    change_rate = (change / prev) * 100 if prev else 0

    window_52 = close.tail(252) if len(close) >= 30 else close
    high_52 = float(window_52.max())
    low_52 = float(window_52.min())
    position_52 = ((last - low_52) / (high_52 - low_52) * 100) if high_52 != low_52 else 50

    ma20 = float(close.tail(20).mean()) if len(close) >= 20 else last
    ma60 = float(close.tail(60).mean()) if len(close) >= 60 else ma20
    distance_20 = ((last - ma20) / ma20 * 100) if ma20 else 0
    distance_60 = ((last - ma60) / ma60 * 100) if ma60 else 0

    before_20 = float(close.iloc[-21]) if len(close) >= 21 else float(close.iloc[0])
    momentum_20 = ((last - before_20) / before_20 * 100) if before_20 else 0

    returns = close.pct_change().dropna()
    volatility_20 = float(returns.tail(20).std() * (252 ** 0.5) * 100) if len(returns) >= 5 else 0

    return {
        "last": last,
        "prev": prev,
        "change": change,
        "change_rate": change_rate,
        "position_52": _clamp(position_52),
        "high_52": high_52,
        "low_52": low_52,
        "ma20": ma20,
        "ma60": ma60,
        "distance_20": distance_20,
        "distance_60": distance_60,
        "momentum_20": momentum_20,
        "volatility_20": max(0, volatility_20),
        "date": df["date"].iloc[-1].strftime("%Y-%m-%d") if "date" in df.columns else "",
    }


def _timing_label(score):
    score = _clamp(score)

    if score >= 78:
        return "분할매수 유리"
    if score >= 62:
        return "관심 구간"
    if score >= 46:
        return "중립"
    if score >= 30:
        return "보수적 관망"
    return "위험 관리"


def _fear_label(score):
    score = _clamp(score)

    if score >= 80:
        return "Extreme Greed"
    if score >= 62:
        return "Greed"
    if score >= 43:
        return "Neutral"
    if score >= 25:
        return "Fear"
    return "Extreme Fear"


def _overheat_label(score):
    score = _clamp(score)

    if score >= 82:
        return "강한 과열"
    if score >= 68:
        return "과열 주의"
    if score >= 48:
        return "중립"
    if score >= 30:
        return "안정"
    return "저온"


def _default_market_temperature_payload(message="시장 데이터를 불러오지 못했습니다."):
    return {
        "ok": False,
        "source": "BASIC",
        "message": message,
        "market_timing_score": 52,
        "fear_greed_score": 55,
        "overheat_score": 64,
        "timing_label": "중립",
        "fear_label": "Neutral",
        "overheat_label": "약간 과열",
        "vix_value": "",
        "kospi_position": "",
        "kospi_change": "",
        "kospi_price": "",
        "kosdaq_change": "",
        "kosdaq_price": "",
        "distance_20": "",
        "decision": "관망",
        "decision_sub": message,
        "base_date": "",
    }


@require_GET
def api_market_temperature(request):
    cache_key = "stocks:market_temperature:v10"

    if request.GET.get("refresh") != "1":
        cached = cache.get(cache_key)
        if cached is not None:
            return JsonResponse(cached, json_dumps_params={"ensure_ascii": False})

    try:
        kospi_df = _fetch_index_ohlcv("1001", "KOSPI", days=320)
        kosdaq_df = _fetch_index_ohlcv("2001", "KOSDAQ", days=320)

        kospi = _index_metrics(kospi_df)
        kosdaq = _index_metrics(kosdaq_df)

        if not kospi and not kosdaq:
            payload = _default_market_temperature_payload("KOSPI/KOSDAQ 데이터를 모두 불러오지 못했습니다.")
            cache.set(cache_key, payload, 60 * 2)
            return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})

        if not kospi:
            kospi = kosdaq
        if not kosdaq:
            kosdaq = kospi

        momentum_score = _clamp(50 + kospi["momentum_20"] * 2.0 + kosdaq["momentum_20"] * 1.0)
        volatility_score = _clamp(100 - kospi["volatility_20"] * 2.4)
        position_score = _clamp(kospi["position_52"])

        fear_score = _clamp(momentum_score * 0.48 + volatility_score * 0.32 + position_score * 0.20)

        overheat_score = _clamp(
            18
            + kospi["position_52"] * 0.46
            + max(kospi["distance_20"], 0) * 3.0
            + max(kospi["momentum_20"], 0) * 1.7
            + max(kosdaq["distance_20"], 0) * 1.0
        )

        position_attractive = 100 - kospi["position_52"]
        stable_fear_score = 100 - abs(fear_score - 45) * 1.35
        timing_score = _clamp(
            position_attractive * 0.42
            + (100 - overheat_score) * 0.36
            + stable_fear_score * 0.22
            - max(kospi["volatility_20"] - 28, 0) * 0.8
        )

        decision = _timing_label(timing_score)

        if overheat_score >= 75:
            decision_sub = "추격매수보다 현금 비중과 분할 진입 우선"
        elif timing_score >= 62:
            decision_sub = "하락 분할매수 후보를 정리하기 좋은 구간"
        elif timing_score <= 35:
            decision_sub = "손절선과 비중 관리가 더 중요한 구간"
        else:
            decision_sub = "무리한 신규매수보다 관찰 우선"

        base_date = kospi.get("date") or kosdaq.get("date") or ""

        payload = {
            "ok": True,
            "source": "pykrx/naver",
            "market_timing_score": round(timing_score, 1),
            "fear_greed_score": round(fear_score, 1),
            "overheat_score": round(overheat_score, 1),
            "timing_label": decision,
            "fear_label": _fear_label(fear_score),
            "overheat_label": _overheat_label(overheat_score),
            "vix_value": f"{kospi['volatility_20']:.1f}%",
            "kospi_position": f"{kospi['position_52']:.0f}%",
            "kospi_change": _format_signed_percent(kospi["change_rate"]),
            "kospi_price": _format_number(kospi["last"], 2),
            "kosdaq_change": _format_signed_percent(kosdaq["change_rate"]),
            "kosdaq_price": _format_number(kosdaq["last"], 2),
            "distance_20": _format_signed_percent(kospi["distance_20"]),
            "decision": decision,
            "decision_sub": decision_sub,
            "base_date": base_date,
            "indicators": {"kospi": kospi, "kosdaq": kosdaq},
        }

        cache.set(cache_key, payload, 60 * 10)
        return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})

    except Exception as exc:
        payload = _default_market_temperature_payload(str(exc))
        cache.set(cache_key, payload, 60 * 2)
        return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})



# -----------------------------------------------------------------------------
# 로그인 사용자별 서버 저장 API
# -----------------------------------------------------------------------------
# 기존 프론트 JS는 관심종목/포트폴리오를 localStorage에 저장했기 때문에
# 브라우저·기기·IP가 바뀌면 데이터가 사라지는 것처럼 보였습니다.
# 아래 API는 로그인 계정 기준으로 DB에 저장하고 불러오기 위한 엔드포인트입니다.


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return {}


def _default_user_groups():
    return [{"id": "default", "name": "내 관심종목", "items": []}]


def _default_user_portfolio():
    return {"capital": 10000000, "trades": [], "updatedAt": None}


def _normalize_user_groups(groups):
    if not isinstance(groups, list):
        return _default_user_groups()

    normalized = []

    for index, group in enumerate(groups):
        if not isinstance(group, dict):
            continue

        group_id = str(group.get("id") or f"group_{index + 1}")[:120]
        group_name = str(group.get("name") or "내 관심종목")[:80]
        raw_items = group.get("items") if isinstance(group.get("items"), list) else []
        items = []
        seen_codes = set()

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            code = _normalize_asset_code(item.get("code") or item.get("stock_code"))
            if not code or code in seen_codes:
                continue

            seen_codes.add(code)
            items.append(
                {
                    "code": code,
                    "name": str(item.get("name") or item.get("stock_name") or code)[:100],
                    "market": str(item.get("market") or "KRX")[:20],
                }
            )

        normalized.append({"id": group_id, "name": group_name, "items": items})

    return normalized or _default_user_groups()


def _normalize_user_portfolio(portfolio):
    if not isinstance(portfolio, dict):
        portfolio = {}

    try:
        capital = int(float(str(portfolio.get("capital") or 10000000).replace(",", "")))
    except (TypeError, ValueError):
        capital = 10000000

    trades = portfolio.get("trades") if isinstance(portfolio.get("trades"), list) else []
    normalized_trades = []

    for trade in trades:
        if not isinstance(trade, dict):
            continue

        fixed = dict(trade)
        fixed["code"] = _normalize_asset_code(fixed.get("code"))
        fixed["name"] = str(fixed.get("name") or fixed.get("code") or "")[:100]
        fixed["market"] = str(fixed.get("market") or "KRX")[:20]

        for number_key in ["price", "qty", "amount", "lastPrice", "lineWidth", "order"]:
            if number_key in fixed:
                try:
                    fixed[number_key] = float(str(fixed[number_key]).replace(",", ""))
                except (TypeError, ValueError):
                    fixed[number_key] = 0

        if fixed.get("code"):
            normalized_trades.append(fixed)

    return {
        "capital": capital if capital > 0 else 10000000,
        "trades": normalized_trades,
        "updatedAt": portfolio.get("updatedAt") or portfolio.get("updated_at"),
    }


@login_required
@require_http_methods(["GET", "POST"])
def user_groups_api(request):
    storage, _ = UserStockStorage.objects.get_or_create(user=request.user)

    if request.method == "GET":
        groups = _normalize_user_groups(storage.groups)
        selected_group_id = storage.selected_group_id or (groups[0].get("id") if groups else "")

        return JsonResponse(
            {
                "ok": True,
                "groups": groups,
                "selectedGroupId": selected_group_id,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    groups = _normalize_user_groups(data.get("groups"))
    selected_group_id = str(data.get("selectedGroupId") or data.get("selected_group_id") or "")[:120]

    if selected_group_id and not any(group.get("id") == selected_group_id for group in groups):
        selected_group_id = groups[0].get("id", "")
    elif not selected_group_id:
        selected_group_id = groups[0].get("id", "")

    storage.groups = groups
    storage.selected_group_id = selected_group_id
    storage.save(update_fields=["groups", "selected_group_id", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "groups": storage.groups,
            "selectedGroupId": storage.selected_group_id,
        },
        json_dumps_params={"ensure_ascii": False},
    )


@login_required
@require_http_methods(["GET", "POST"])
def portfolio_api(request):
    storage, _ = UserStockStorage.objects.get_or_create(user=request.user)

    if request.method == "GET":
        portfolio = _normalize_user_portfolio(storage.portfolio)
        return JsonResponse(
            {
                "ok": True,
                "portfolio": portfolio,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    portfolio = _normalize_user_portfolio(data.get("portfolio", data))

    storage.portfolio = portfolio
    storage.save(update_fields=["portfolio", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "portfolio": storage.portfolio,
        },
        json_dumps_params={"ensure_ascii": False},
    )


# -----------------------------------------------------------------------------
# 로그인 사용자별 차트 드로잉 서버 저장 API
# -----------------------------------------------------------------------------
# 프론트에서 localStorage에만 저장하던 차트 드로잉과 도구 기본 속성을
# 로그인 계정 기준으로 DB에 저장합니다. 비로그인 사용자는 기존처럼
# 브라우저 임시 저장을 사용할 수 있도록 GET은 빈 payload를 반환하고,
# POST만 401 JSON을 반환합니다.


def _default_drawing_tool_defaults():
    return {}


def _normalize_drawing_tool_defaults(settings):
    if not isinstance(settings, dict):
        return _default_drawing_tool_defaults()

    allowed_tools = {"trend", "extend", "hline", "vline", "circle", "fibo"}
    normalized = {}

    for tool, raw in settings.items():
        tool_key = str(tool or "").strip().lower()[:32]

        if tool_key not in allowed_tools or not isinstance(raw, dict):
            continue

        item = {}

        for key, value in raw.items():
            key = str(key or "")[:40]

            if key in {"color", "fillColor", "dash"}:
                item[key] = str(value or "")[:80]
            elif key in {"width", "opacity", "fillOpacity", "borderOpacity"}:
                try:
                    item[key] = float(value)
                except (TypeError, ValueError):
                    continue
            elif key in {"extendLeft", "extendRight", "fill"}:
                item[key] = bool(value)
            elif key in {"levels", "fiboLevels"}:
                if isinstance(value, list):
                    item[key] = value[:20]

        if item:
            normalized[tool_key] = item

    return normalized


def _normalize_chart_drawings(drawings):
    if not isinstance(drawings, list):
        return []

    normalized = []
    allowed_types = {"trend", "extend", "hline", "vline", "circle", "fibo"}

    for index, drawing in enumerate(drawings[:600]):
        if not isinstance(drawing, dict):
            continue

        item = dict(drawing)
        item["id"] = str(item.get("id") or f"drawing_{index + 1}")[:120]
        item["type"] = str(item.get("type") or "trend").strip().lower()[:32]

        if item["type"] not in allowed_types:
            continue

        if "color" in item:
            item["color"] = str(item.get("color") or "")[:80]
        if "fillColor" in item:
            item["fillColor"] = str(item.get("fillColor") or "")[:80]

        for bool_key in ["extendLeft", "extendRight", "fill"]:
            if bool_key in item:
                item[bool_key] = bool(item[bool_key])

        for number_key in ["width", "opacity", "fillOpacity", "borderOpacity"]:
            if number_key in item:
                try:
                    item[number_key] = float(item[number_key])
                except (TypeError, ValueError):
                    item.pop(number_key, None)

        if isinstance(item.get("fiboLevels"), list):
            item["fiboLevels"] = item["fiboLevels"][:20]
        if isinstance(item.get("levels"), list):
            item["levels"] = item["levels"][:20]

        normalized.append(item)

    return normalized


@require_http_methods(["GET", "POST"])
def chart_drawings_api(request, code):
    stock_code = _normalize_asset_code(code)

    if not request.user.is_authenticated:
        if request.method == "GET":
            return JsonResponse(
                {
                    "ok": True,
                    "authenticated": False,
                    "stockCode": stock_code,
                    "drawings": [],
                    "message": "로그인하지 않아 서버 드로잉 저장을 사용하지 않습니다.",
                },
                json_dumps_params={"ensure_ascii": False},
            )

        return JsonResponse(
            {
                "ok": False,
                "authenticated": False,
                "message": "로그인 후 서버 드로잉 저장을 사용할 수 있습니다.",
            },
            status=401,
            json_dumps_params={"ensure_ascii": False},
        )

    state_obj, _ = ChartDrawingState.objects.get_or_create(
        user=request.user,
        stock_code=stock_code,
        defaults={"drawings": []},
    )

    if request.method == "GET":
        drawings = _normalize_chart_drawings(state_obj.drawings)
        return JsonResponse(
            {
                "ok": True,
                "authenticated": True,
                "stockCode": stock_code,
                "drawings": drawings,
                "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    drawings = _normalize_chart_drawings(data.get("drawings", data))
    state_obj.drawings = drawings
    state_obj.save(update_fields=["drawings", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "authenticated": True,
            "stockCode": stock_code,
            "drawings": state_obj.drawings,
            "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
        },
        json_dumps_params={"ensure_ascii": False},
    )


@require_http_methods(["GET", "POST"])
def drawing_tool_settings_api(request):
    if not request.user.is_authenticated:
        if request.method == "GET":
            return JsonResponse(
                {
                    "ok": True,
                    "authenticated": False,
                    "settings": {},
                    "drawingToolDefaults": {},
                    "message": "로그인하지 않아 서버 도구 기본속성 저장을 사용하지 않습니다.",
                },
                json_dumps_params={"ensure_ascii": False},
            )

        return JsonResponse(
            {
                "ok": False,
                "authenticated": False,
                "message": "로그인 후 서버 도구 기본속성 저장을 사용할 수 있습니다.",
            },
            status=401,
            json_dumps_params={"ensure_ascii": False},
        )

    storage, _ = UserStockStorage.objects.get_or_create(user=request.user)

    if request.method == "GET":
        settings = _normalize_drawing_tool_defaults(getattr(storage, "drawing_tool_defaults", {}) or {})
        return JsonResponse(
            {
                "ok": True,
                "authenticated": True,
                "settings": settings,
                "drawingToolDefaults": settings,
                "updatedAt": storage.updated_at.isoformat() if storage.updated_at else None,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    settings = _normalize_drawing_tool_defaults(
        data.get("settings") or data.get("drawingToolDefaults") or data
    )
    storage.drawing_tool_defaults = settings
    storage.save(update_fields=["drawing_tool_defaults", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "authenticated": True,
            "settings": storage.drawing_tool_defaults,
            "drawingToolDefaults": storage.drawing_tool_defaults,
            "updatedAt": storage.updated_at.isoformat() if storage.updated_at else None,
        },
        json_dumps_params={"ensure_ascii": False},
    )


def features_view(request):
    return render(request, "stocks/features.html", {
        "active_nav": "features",
    })


def pricing_view(request):
    return render(request, "stocks/pricing.html", {
        "active_nav": "pricing",
    })

# -----------------------------------------------------------------------------
# 로그인 사용자별 차트 지표 서버 저장 API
# -----------------------------------------------------------------------------
# 기존 지표는 브라우저 localStorage 중심으로 저장되어 서버/브라우저/인사이트 iframe마다
# 하이드·수정·삭제 상태가 어긋날 수 있었습니다. 아래 API는 로그인 사용자 + 종목코드
# 기준으로 지표 상태를 DB에 저장하고 다시 불러오기 위한 엔드포인트입니다.


def _normalize_chart_indicators(indicators):
    if not isinstance(indicators, list):
        return []

    allowed_types = {"ma_pack", "volume", "rsi", "macd", "stoch", "boll", "ichimoku"}
    normalized = []

    for index, raw in enumerate(indicators[:80]):
        if not isinstance(raw, dict):
            continue

        item = dict(raw)
        item["id"] = str(item.get("id") or f"indicator_{index + 1}")[:120]
        item["type"] = str(item.get("type") or "ma_pack").strip().lower()[:40]

        if item["type"] not in allowed_types:
            continue

        item["visible"] = item.get("visible") is not False

        for key in [
            "source", "color", "upperColor", "middleColor", "lowerColor", "maColor",
            "dColor", "backgroundColor", "signalColor", "histUpColor", "histDownColor",
            "levelColor", "conversionColor", "baseColor", "spanAColor", "spanBColor",
            "laggingColor", "cloudUpColor", "cloudDownColor",
        ]:
            if key in item:
                item[key] = str(item.get(key) or "")[:120]

        for key in [
            "period", "width", "fast", "slow", "signal", "maPeriod", "upper", "middle", "lower",
            "rsiPeriod", "conversion", "base", "spanB", "displacement", "kSmoothing", "dSmoothing",
        ]:
            if key in item:
                try:
                    number_value = float(item[key])
                    item[key] = int(number_value) if number_value.is_integer() else number_value
                except (TypeError, ValueError):
                    item.pop(key, None)

        for key in [
            "showRsi", "showRsiMa", "showUpper", "showMiddle", "showLower", "showK", "showD",
            "showBackground", "showHistogram", "showMacd", "showSignal", "showLevels",
            "showConversion", "showBase", "showSpanA", "showSpanB", "showLagging", "showCloudFill",
        ]:
            if key in item:
                item[key] = bool(item[key])

        if item["type"] == "ma_pack":
            lines = item.get("lines") if isinstance(item.get("lines"), list) else []
            fixed_lines = []

            for line_index, line in enumerate(lines[:20]):
                if not isinstance(line, dict):
                    continue

                fixed = {
                    "id": str(line.get("id") or f"ma_line_{line_index + 1}")[:120],
                    "visible": line.get("visible") is not False,
                    "source": str(line.get("source") or "close")[:30],
                    "method": str(line.get("method") or "ema")[:20],
                    "color": str(line.get("color") or "#3b82f6")[:80],
                }

                for num_key, fallback in {"period": 20, "width": 2}.items():
                    try:
                        number_value = float(line.get(num_key, fallback))
                        fixed[num_key] = int(number_value) if number_value.is_integer() else number_value
                    except (TypeError, ValueError):
                        fixed[num_key] = fallback

                fixed_lines.append(fixed)

            item["lines"] = fixed_lines

        # LightweightCharts Series 객체 등 프론트 내부용 값은 DB에 저장하지 않습니다.
        item.pop("series", None)
        normalized.append(item)

    return normalized


@require_http_methods(["GET", "POST"])
def chart_indicators_api(request, code):
    stock_code = _normalize_asset_code(code)

    if not request.user.is_authenticated:
        if request.method == "GET":
            return JsonResponse(
                {
                    "ok": True,
                    "authenticated": False,
                    "stockCode": stock_code,
                    "indicators": [],
                    "message": "로그인하지 않아 서버 지표 저장을 사용하지 않습니다.",
                },
                json_dumps_params={"ensure_ascii": False},
            )

        return JsonResponse(
            {
                "ok": False,
                "authenticated": False,
                "message": "로그인 후 서버 지표 저장을 사용할 수 있습니다.",
            },
            status=401,
            json_dumps_params={"ensure_ascii": False},
        )

    state_obj, _ = ChartIndicatorState.objects.get_or_create(
        user=request.user,
        stock_code=stock_code,
        defaults={"indicators": []},
    )

    if request.method == "GET":
        indicators = _normalize_chart_indicators(state_obj.indicators)
        return JsonResponse(
            {
                "ok": True,
                "authenticated": True,
                "stockCode": stock_code,
                "indicators": indicators,
                "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    indicators = _normalize_chart_indicators(data.get("indicators", data))
    state_obj.indicators = indicators
    state_obj.save(update_fields=["indicators", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "authenticated": True,
            "stockCode": stock_code,
            "indicators": state_obj.indicators,
            "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
        },
        json_dumps_params={"ensure_ascii": False},
    )

# -----------------------------------------------------------------------------
# 로그인 사용자별 분할매수 전략 서버 저장 API
# -----------------------------------------------------------------------------
# piramid.js는 이 API를 통해 로그인 사용자 + 종목코드 기준으로
# 분할매수 전략값을 DB에 저장하고 다시 불러옵니다.
# 저장 항목: 전략, a 금액, 시작가격, 하락 간격.


def _default_piramid_plan():
    return {
        "strategy": "exit",
        "unit": 500000,
        "startPrice": 0,
        "dropRate": 15,
    }


def _positive_number(value, default=0):
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default

    return number if number > 0 else default


def _bounded_number(value, default, min_value, max_value):
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        number = default

    return max(min_value, min(max_value, number))


def _normalize_piramid_plan(raw):
    if not isinstance(raw, dict):
        raw = {}

    payload = raw.get("piramid") if isinstance(raw.get("piramid"), dict) else raw
    allowed_strategies = {"exit", "balanced", "classic"}

    strategy = str(payload.get("strategy") or "exit").strip().lower()
    if strategy not in allowed_strategies:
        strategy = "exit"

    unit = int(round(_positive_number(payload.get("unit"), 500000)))
    start_price = int(round(_positive_number(payload.get("startPrice", payload.get("start_price")), 0)))
    drop_rate = _bounded_number(payload.get("dropRate", payload.get("drop_rate", 15)), 15, 1, 80)

    return {
        "strategy": strategy,
        "unit": unit if unit > 0 else 500000,
        "startPrice": start_price if start_price > 0 else 0,
        "dropRate": int(drop_rate) if float(drop_rate).is_integer() else drop_rate,
    }


@require_http_methods(["GET", "POST"])
def chart_piramid_api(request, code):
    stock_code = _normalize_asset_code(code)

    if not request.user.is_authenticated:
        if request.method == "GET":
            return JsonResponse(
                {
                    "ok": True,
                    "authenticated": False,
                    "stockCode": stock_code,
                    "piramid": _default_piramid_plan(),
                    "message": "로그인하지 않아 서버 분할매수 저장을 사용하지 않습니다.",
                },
                json_dumps_params={"ensure_ascii": False},
            )

        return JsonResponse(
            {
                "ok": False,
                "authenticated": False,
                "message": "로그인 후 서버 분할매수 저장을 사용할 수 있습니다.",
            },
            status=401,
            json_dumps_params={"ensure_ascii": False},
        )

    state_obj, _ = ChartPiramidState.objects.get_or_create(
        user=request.user,
        stock_code=stock_code,
        defaults={"piramid": _default_piramid_plan()},
    )

    if request.method == "GET":
        piramid = _normalize_piramid_plan(state_obj.piramid)
        return JsonResponse(
            {
                "ok": True,
                "authenticated": True,
                "stockCode": stock_code,
                "piramid": piramid,
                "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
            },
            json_dumps_params={"ensure_ascii": False},
        )

    data = _json_body(request)
    piramid = _normalize_piramid_plan(data.get("piramid", data))
    state_obj.piramid = piramid
    state_obj.save(update_fields=["piramid", "updated_at"])

    return JsonResponse(
        {
            "ok": True,
            "authenticated": True,
            "stockCode": stock_code,
            "piramid": state_obj.piramid,
            "updatedAt": state_obj.updated_at.isoformat() if state_obj.updated_at else None,
        },
        json_dumps_params={"ensure_ascii": False},
    )

