import json
import math
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone


YAHOO_SYMBOLS = {
    "kospi": {"name": "KOSPI", "symbol": "^KS11"},
    "kosdaq": {"name": "KOSDAQ", "symbol": "^KQ11"},
    "nasdaq100": {"name": "NASDAQ 100", "symbol": "^NDX"},
    "sp500": {"name": "S&P 500", "symbol": "^GSPC"},
    "emini_nasdaq": {"name": "E-mini NASDAQ 100", "symbol": "NQ=F"},
}

INDEX_KEYS = ["kospi", "kosdaq", "nasdaq100", "sp500"]
YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
YAHOO_TIMEOUT_SECONDS = 4
FRESH_CACHE_KEY = "bitgakview:global_market_temperature:v13:fresh"
STALE_CACHE_KEY = "bitgakview:global_market_temperature:v13:stale"
REFRESH_LOCK_KEY = "bitgakview:global_market_temperature:v13:refresh_lock"
FRESH_TTL_SECONDS = 60 * 10
STALE_TTL_SECONDS = 60 * 60


def _fetch_yahoo_chart(symbol, range_value="10y", interval="1d"):
    encoded = quote(symbol, safe="")
    last_error = None

    for host in YAHOO_HOSTS:
        url = (
            f"https://{host}/v8/finance/chart/{encoded}"
            f"?range={range_value}&interval={interval}&includePrePost=false&events=history"
        )
        req = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "Accept": "application/json,text/plain,*/*",
            },
        )
        try:
            with urlopen(req, timeout=YAHOO_TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            result = (payload.get("chart", {}).get("result") or [None])[0]
            if result:
                return result
            last_error = ValueError(f"No Yahoo chart result for {symbol}")
        except Exception as exc:
            last_error = exc

    raise last_error or ValueError(f"No Yahoo chart result for {symbol}")


def _safe_float(value, default=None):
    try:
        if value is None:
            return default
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return default
        return number
    except Exception:
        return default


def _format_price(value):
    value = _safe_float(value)
    if value is None:
        return "-"
    return f"{value:,.2f}"


def _format_percent(value, signed=False):
    value = _safe_float(value)
    if value is None:
        return "-"
    sign = "+" if signed and value > 0 else ""
    return f"{sign}{value:.2f}%"


def _last_two_valid(values):
    found = []
    for value in reversed(values or []):
        number = _safe_float(value)
        if number is not None:
            found.append(number)
        if len(found) >= 2:
            break
    if len(found) == 1:
        return found[0], None
    if len(found) >= 2:
        return found[0], found[1]
    return None, None


def _extract_quote_arrays(result):
    indicators = result.get("indicators") or {}
    quote_data = (indicators.get("quote") or [{}])[0]
    closes = [_safe_float(v) for v in quote_data.get("close", [])]
    highs = [_safe_float(v) for v in quote_data.get("high", [])]
    closes = [v for v in closes if v is not None]
    highs = [v for v in highs if v is not None]
    return closes, highs


def _extract_current(result):
    meta = result.get("meta") or {}
    closes, highs = _extract_quote_arrays(result)
    last_close, previous_close_from_series = _last_two_valid(closes)

    price = _safe_float(meta.get("regularMarketPrice"))
    if price is None:
        price = last_close

    previous_close = (
        _safe_float(meta.get("regularMarketPreviousClose"))
        or _safe_float(meta.get("previousClose"))
        or _safe_float(meta.get("previous_close"))
        or previous_close_from_series
        or _safe_float(meta.get("chartPreviousClose"))
    )

    if price is not None and previous_close:
        change = price - previous_close
        change_percent = (change / previous_close) * 100
    else:
        change = None
        change_percent = None

    peak_candidates = highs or closes
    if price is not None:
        peak_candidates = peak_candidates + [price]
    peak = max(peak_candidates) if peak_candidates else None
    drawdown_percent = ((price / peak) - 1) * 100 if price and peak else None

    return {
        "price": price,
        "previous_close": previous_close,
        "change": change,
        "change_percent": change_percent,
        "peak": peak,
        "drawdown_percent": drawdown_percent,
        "market_time": meta.get("regularMarketTime"),
        "currency": meta.get("currency", ""),
    }


def _change_label(change, change_percent):
    change = _safe_float(change)
    change_percent = _safe_float(change_percent)
    if change is None or change_percent is None:
        return "전일대비 -"
    sign = "+" if change > 0 else ""
    percent_sign = "+" if change_percent > 0 else ""
    return f"전일대비 {sign}{change:,.2f} ({percent_sign}{change_percent:.2f}%)"


def _make_market_item(key, symbol_info, range_value="10y", interval="1d"):
    result = _fetch_yahoo_chart(symbol_info["symbol"], range_value=range_value, interval=interval)
    current = _extract_current(result)

    return {
        "key": key,
        "name": symbol_info["name"],
        "symbol": symbol_info["symbol"],
        "price": current["price"],
        "price_label": _format_price(current["price"]),
        "previous_close": current["previous_close"],
        "change": current["change"],
        "change_percent": current["change_percent"],
        "change_label": _change_label(current["change"], current["change_percent"]),
        "peak": current["peak"],
        "peak_label": _format_price(current["peak"]),
        "drawdown_percent": current["drawdown_percent"],
        "drawdown_label": _format_percent(current["drawdown_percent"]),
    }


def _make_index_item(key, symbol_info):
    return _make_market_item(key, symbol_info, range_value="10y", interval="1d")


def _make_future_item():
    return _make_market_item("emini_nasdaq", YAHOO_SYMBOLS["emini_nasdaq"], range_value="10y", interval="1d")


def _zone_state(avg_drop, threshold):
    if avg_drop >= threshold:
        return {"label": "도달", "state": "active"}
    if avg_drop >= threshold - 5:
        return {"label": "근접", "state": "near"}
    return {"label": "대기", "state": ""}


def _timing_from_drawdowns(indices):
    drops = []
    for item in indices:
        value = _safe_float(item.get("drawdown_percent"))
        if value is not None:
            drops.append(abs(min(0, value)))

    if not drops:
        return {
            "score": None,
            "label": "시세 대기",
            "average_drop": None,
            "max_drop": None,
            "max_item": None,
            "active_zone_label": "확인중",
            "active_zone_sub": "외부 시세 제공처 응답을 기다리고 있습니다.",
        }

    average_drop = sum(drops) / len(drops)
    max_drop = max(drops)
    max_index = drops.index(max_drop)
    max_item = indices[max_index]

    score = int(max(0, min(100, 12 + ((average_drop - 8) / 42) * 88)))
    if average_drop >= 30:
        score = max(score, 68)
    if average_drop >= 40:
        score = max(score, 82)
    if average_drop >= 50:
        score = max(score, 94)

    if average_drop >= 50:
        label = "강한 저점권"
        zone_label = "-50% 강한 저점권"
        zone_sub = "평균 하락률이 깊어져 공격적 분할 기준에 근접했습니다."
    elif average_drop >= 40:
        label = "2차 분할 구간"
        zone_label = "-40% 2차 분할"
        zone_sub = "공포가 커지는 구간입니다. 현금 비중에 맞춰 분할을 검토합니다."
    elif average_drop >= 30:
        label = "1차 관심 구간"
        zone_label = "-30% 1차 관심"
        zone_sub = "고점 대비 하락폭이 커졌습니다. 1차 관심 목록을 점검합니다."
    elif average_drop >= 20:
        label = "조정 구간"
        zone_label = "조정 확인"
        zone_sub = "아직 깊은 저점권은 아니지만 과열은 일부 해소됐습니다."
    elif average_drop >= 10:
        label = "관망"
        zone_label = "대기"
        zone_sub = "하락률이 크지 않습니다. 무리한 추격 매수는 피합니다."
    else:
        label = "고점권 경계"
        zone_label = "경계"
        zone_sub = "최고점과 가까운 구간입니다. 현금 비중과 리스크를 우선 확인합니다."

    return {
        "score": score,
        "label": label,
        "average_drop": average_drop,
        "max_drop": max_drop,
        "max_item": max_item,
        "active_zone_label": zone_label,
        "active_zone_sub": zone_sub,
    }


def _error_market_item(key):
    return {
        "key": key,
        "name": YAHOO_SYMBOLS[key]["name"],
        "symbol": YAHOO_SYMBOLS[key]["symbol"],
        "price_label": "-",
        "change_label": "시세 로딩 실패",
        "change_percent": None,
        "drawdown_label": "-",
        "drawdown_percent": None,
    }


def _safe_build_index(key):
    try:
        return key, _make_index_item(key, YAHOO_SYMBOLS[key]), None
    except Exception as exc:
        return key, _error_market_item(key), str(exc)


def _safe_build_future():
    try:
        return "emini_nasdaq", _make_future_item(), None
    except Exception as exc:
        return "emini_nasdaq", _error_market_item("emini_nasdaq"), str(exc)


def _build_payload():
    errors = {}
    index_map = {}
    future = None

    jobs = [("index", key) for key in INDEX_KEYS] + [("future", "emini_nasdaq")]
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {}
        for job_type, key in jobs:
            if job_type == "future":
                future_obj = executor.submit(_safe_build_future)
            else:
                future_obj = executor.submit(_safe_build_index, key)
            future_map[future_obj] = (job_type, key)

        for future_obj in as_completed(future_map):
            _, key = future_map[future_obj]
            result_key, item, error = future_obj.result()
            if error:
                errors[result_key] = error
            if result_key == "emini_nasdaq":
                future = item
            else:
                index_map[result_key] = item

    indices = [index_map.get(key) or _error_market_item(key) for key in INDEX_KEYS]
    future = future or _error_market_item("emini_nasdaq")

    timing = _timing_from_drawdowns(indices)
    avg_drop = timing["average_drop"]
    max_drop = timing["max_drop"]
    max_item = timing["max_item"] or {}

    updated_at = timezone.localtime().strftime("%m.%d %p %I:%M").replace("AM", "오전").replace("PM", "오후")

    return {
        "ok": True,
        "source": "Yahoo Finance chart API",
        "cache_state": "fresh",
        "updated_at": updated_at,
        "indices": indices,
        "future": future,
        "market_timing_score": timing["score"],
        "timing_label": timing["label"],
        "average_drawdown_percent": -(avg_drop or 0) if avg_drop is not None else None,
        "average_drawdown_label": f"-{avg_drop:.2f}%" if avg_drop is not None else "-",
        "max_drawdown_percent": -(max_drop or 0) if max_drop is not None else None,
        "max_drawdown_label": f"-{max_drop:.2f}%" if max_drop is not None else "-",
        "max_drawdown_name": max_item.get("name") or "데이터 대기중",
        "active_zone_label": timing["active_zone_label"],
        "active_zone_sub": timing["active_zone_sub"],
        "zones": {
            "zone30": _zone_state(avg_drop or 0, 30),
            "zone40": _zone_state(avg_drop or 0, 40),
            "zone50": _zone_state(avg_drop or 0, 50),
        },
        "errors": errors,
    }


def _save_payload(payload):
    cache.set(FRESH_CACHE_KEY, payload, FRESH_TTL_SECONDS)
    cache.set(STALE_CACHE_KEY, payload, STALE_TTL_SECONDS)


def _refresh_cache_background():
    try:
        payload = _build_payload()
        _save_payload(payload)
    except Exception:
        pass
    finally:
        cache.delete(REFRESH_LOCK_KEY)


def _maybe_start_background_refresh():
    if not cache.add(REFRESH_LOCK_KEY, True, 45):
        return
    thread = threading.Thread(target=_refresh_cache_background, daemon=True)
    thread.start()


def global_market_temperature_api(request):
    force_refresh = request.GET.get("refresh") in {"1", "true", "yes"}

    if not force_refresh:
        cached = cache.get(FRESH_CACHE_KEY)
        if cached:
            return JsonResponse(cached)

        stale = cache.get(STALE_CACHE_KEY)
        if stale:
            payload = dict(stale)
            payload["cache_state"] = "stale"
            _maybe_start_background_refresh()
            return JsonResponse(payload)

    try:
        payload = _build_payload()
        _save_payload(payload)
        return JsonResponse(payload)
    except Exception as exc:
        stale = cache.get(STALE_CACHE_KEY)
        if stale:
            payload = dict(stale)
            payload["cache_state"] = "stale-error"
            payload.setdefault("errors", {})["refresh"] = str(exc)
            return JsonResponse(payload)
        return JsonResponse({"ok": False, "message": str(exc)}, status=503)


market_temperature_api = global_market_temperature_api
