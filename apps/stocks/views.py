from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import ast
import re

import pandas as pd
from django.core.cache import cache
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_GET
from pykrx import stock as krx_stock

try:
    import yfinance as yf
except Exception:
    yf = None

from .models import StockSymbol


DERIVATIVE_KEYWORDS = [
    "ETF", "ETN", "ETNH", "레버리지", "인버스", "선물", "합성",
    "TR", "채권", "국채", "CD금리", "커버드콜",
]


FALLBACK_STOCKS = [
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


def _empty_ohlcv():
    return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])


def _is_derivative_name(name):
    text = str(name or "").upper().replace(" ", "")
    return any(keyword.upper().replace(" ", "") in text for keyword in DERIVATIVE_KEYWORDS)


def _fallback_stock(code):
    code = _clean_code(code)
    item = FALLBACK_BY_CODE.get(code)

    if item:
        return SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])

    return SimpleNamespace(code=code, name=code or "알 수 없는 종목", market="KRX")


def _get_stock(code):
    code = _clean_code(code)
    obj = StockSymbol.objects.filter(code=code).first()

    if obj:
        return obj

    return _fallback_stock(code)


def _safe_reverse_stock_detail(code):
    code = _clean_code(code)

    try:
        return reverse("stocks:detail", args=[code])
    except Exception:
        return f"/stocks/{code}/"


def _stock_to_payload(stock_obj):
    code = _clean_code(getattr(stock_obj, "code", ""))
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
    payload = []
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


def _query_fallback_payloads(q):
    q = str(q or "").strip().lower().replace(" ", "")
    q_digits = "".join(ch for ch in q if ch.isdigit())

    if not q:
        return _fallback_payloads()[:10]

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

    return matched


def stock_search(request):
    q = (request.GET.get("q") or "").strip()
    all_stocks_payload = _get_all_stocks_payload()
    total_stock_count = StockSymbol.objects.count() or len(all_stocks_payload)

    qs = StockSymbol.objects.all().order_by("market", "name", "code")

    if q:
        q_digits = "".join(ch for ch in q if ch.isdigit())
        filters = Q(name__icontains=q)

        if q_digits:
            filters |= Q(code__icontains=q_digits)
        else:
            filters |= Q(code__icontains=q)

        qs = qs.filter(filters)

    stocks = list(qs[:100])

    if not stocks:
        fallback_items = _query_fallback_payloads(q)
        stocks = [
            SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])
            for item in fallback_items[:100]
        ]

    return render(
        request,
        "stocks/stock_search.html",
        {
            "q": q,
            "stocks": stocks,
            "total_stock_count": total_stock_count,
            "all_stocks_payload": all_stocks_payload,
        },
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

    # Yahoo 1h 데이터는 너무 길게 요청하면 실패/누락될 수 있어 우선 180d로 제한
    return "180d"


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
    1시간~4시간봉 전용 데이터 소스.
    Yahoo/yfinance에서 1h 원본을 받고, _aggregate_intraday_interval()에서
    2h/3h/4h로 서버 재집계한다.
    """
    code = _clean_code(code)

    if not code or yf is None:
        return _empty_ohlcv()

    period = _yahoo_period_for_range(range_key)

    for symbol in _yahoo_symbol_candidates(code):
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

        if not result.empty:
            return result

    return _empty_ohlcv()

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



def _make_payload(code, range_key, interval):
    code = _clean_code(code)
    interval = _normalize_interval(interval)
    range_key = _normalize_range(range_key)
    stock = _get_stock(code)

    intraday_requested = _is_intraday_interval(interval)
    intraday_source_used = False
    source = "pykrx/naver"

    if intraday_requested:
        base_df = _fetch_yahoo_intraday(code, range_key, interval)

        if not base_df.empty:
            chart_df = _aggregate_intraday_interval(base_df, interval)
            chart_df = _apply_visible_range(chart_df, range_key)
            intraday_source_used = True
            source = "yfinance-hourly"
        else:
            chart_df = _empty_ohlcv()
            source = "yfinance-hourly-empty"
    else:
        daily_df = _fetch_pykrx_daily(code, range_key)
        daily_interval = _daily_interval_from_display_interval(interval)
        chart_df = _aggregate_interval(daily_df, daily_interval)
        chart_df = _apply_visible_range(chart_df, range_key)

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
        "interval": interval,
        "requested_interval": interval,
        "intraday": intraday_source_used,
        "intraday_requested": intraday_requested,
        "server_aggregated": intraday_source_used,
        "provider": "yfinance" if intraday_source_used else source,
        "current": {"price": int(last["close"]), "change": change, "change_rate": change_rate},
        "results": results,
        "rows": results,
        "ohlc": ohlc,
        "volume": volume,
        "ma20": _calc_ma(results, 20),
        "ma60": _calc_ma(results, 60),
        "ma120": _calc_ma(results, 120),
    }


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

    payload = _make_payload(code, range_key, interval)

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
    cache_key = "stocks:market_temperature:v9"

    if request.GET.get("refresh") != "1":
        cached = cache.get(cache_key)
        if cached:
            return JsonResponse(cached, json_dumps_params={"ensure_ascii": False})

    try:
        kospi_df = _fetch_index_ohlcv("1001", "KOSPI", days=430)
        kosdaq_df = _fetch_index_ohlcv("2001", "KOSDAQ", days=430)

        kospi = _index_metrics(kospi_df)
        kosdaq = _index_metrics(kosdaq_df)

        if not kospi and not kosdaq:
            payload = _default_market_temperature_payload("KOSPI/KOSDAQ 데이터를 모두 불러오지 못했습니다.")
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
        return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})
