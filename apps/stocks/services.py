from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import math

try:
    import pandas as pd
except Exception:  # pragma: no cover
    pd = None

try:
    from pykrx import stock
except Exception:  # pragma: no cover
    stock = None


DEFAULT_LIMIT = 50
MAX_LIMIT = 150
PRICE_METRIC_SCAN_LIMIT = 320


@dataclass
class ScreenerFilters:
    market: str = "ALL"
    per_min: Optional[float] = None
    per_max: Optional[float] = None
    pbr_min: Optional[float] = None
    pbr_max: Optional[float] = None
    roe_min: Optional[float] = None
    roe_max: Optional[float] = None
    eps_min: Optional[float] = None
    eps_max: Optional[float] = None
    bps_min: Optional[float] = None
    bps_max: Optional[float] = None
    div_min: Optional[float] = None
    div_max: Optional[float] = None
    dps_min: Optional[float] = None
    dps_max: Optional[float] = None
    market_cap_min_uk: Optional[float] = None
    market_cap_max_uk: Optional[float] = None
    trading_value_min_uk: Optional[float] = None
    trading_value_max_uk: Optional[float] = None
    drawdown_52w_min: Optional[float] = None
    drawdown_52w_max: Optional[float] = None
    mdd_1y_min: Optional[float] = None
    mdd_1y_max: Optional[float] = None
    sort: str = "per_asc"
    limit: int = DEFAULT_LIMIT


SUPPORTED_SORTS = {
    "per_asc",
    "pbr_asc",
    "roe_desc",
    "eps_desc",
    "div_desc",
    "dps_desc",
    "market_cap_desc",
    "trading_value_desc",
    "drawdown_desc",
    "mdd_asc",
}


_name_cache: Dict[str, str] = {}


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    text = str(value).replace(",", "").replace("%", "").strip()
    if text == "":
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _to_int(value: Any, default: int) -> int:
    number = _to_float(value)
    if number is None:
        return default
    return max(1, min(MAX_LIMIT, int(number)))


def parse_filters(payload: Dict[str, Any]) -> ScreenerFilters:
    payload = payload or {}
    market = str(payload.get("market") or "ALL").upper().strip()
    if market not in {"ALL", "KOSPI", "KOSDAQ"}:
        market = "ALL"

    sort = str(payload.get("sort") or "per_asc").strip()
    if sort not in SUPPORTED_SORTS:
        sort = "per_asc"

    return ScreenerFilters(
        market=market,
        per_min=_to_float(payload.get("per_min")),
        per_max=_to_float(payload.get("per_max")),
        pbr_min=_to_float(payload.get("pbr_min")),
        pbr_max=_to_float(payload.get("pbr_max")),
        roe_min=_to_float(payload.get("roe_min")),
        roe_max=_to_float(payload.get("roe_max")),
        eps_min=_to_float(payload.get("eps_min")),
        eps_max=_to_float(payload.get("eps_max")),
        bps_min=_to_float(payload.get("bps_min")),
        bps_max=_to_float(payload.get("bps_max")),
        div_min=_to_float(payload.get("div_min")),
        div_max=_to_float(payload.get("div_max")),
        dps_min=_to_float(payload.get("dps_min")),
        dps_max=_to_float(payload.get("dps_max")),
        market_cap_min_uk=_to_float(payload.get("market_cap_min_uk")),
        market_cap_max_uk=_to_float(payload.get("market_cap_max_uk")),
        trading_value_min_uk=_to_float(payload.get("trading_value_min_uk")),
        trading_value_max_uk=_to_float(payload.get("trading_value_max_uk")),
        drawdown_52w_min=_to_float(payload.get("drawdown_52w_min")),
        drawdown_52w_max=_to_float(payload.get("drawdown_52w_max")),
        mdd_1y_min=_to_float(payload.get("mdd_1y_min")),
        mdd_1y_max=_to_float(payload.get("mdd_1y_max")),
        sort=sort,
        limit=_to_int(payload.get("limit"), DEFAULT_LIMIT),
    )


def _check_dependencies() -> None:
    if pd is None:
        raise RuntimeError("pandas가 설치되어 있지 않습니다. pip install pandas 후 다시 실행하세요.")
    if stock is None:
        raise RuntimeError("pykrx가 설치되어 있지 않습니다. pip install pykrx 후 다시 실행하세요.")


def _market_list(market: str) -> List[str]:
    return ["KOSPI", "KOSDAQ"] if market == "ALL" else [market]


def _latest_available_date(max_back_days: int = 18) -> str:
    _check_dependencies()
    today = datetime.now().date()
    for offset in range(max_back_days):
        ymd = (today - timedelta(days=offset)).strftime("%Y%m%d")
        for market in ["KOSPI", "KOSDAQ"]:
            try:
                df = stock.get_market_fundamental_by_ticker(ymd, market=market)
                if df is not None and not df.empty:
                    return ymd
            except Exception:
                continue
    raise RuntimeError("최근 영업일의 KRX 투자지표 데이터를 찾지 못했습니다.")


def _ticker_name(code: str) -> str:
    code = str(code).zfill(6)
    if code in _name_cache:
        return _name_cache[code]
    try:
        name = stock.get_market_ticker_name(code) if stock else code
    except Exception:
        name = code
    _name_cache[code] = name or code
    return _name_cache[code]


def _reset_code_index(frame) -> Any:
    frame = frame.copy()
    frame.index = frame.index.astype(str).str.zfill(6)
    frame["code"] = frame.index
    return frame.reset_index(drop=True)


def _get_fundamental_market(ymd: str, market: str) -> Any:
    fund = stock.get_market_fundamental_by_ticker(ymd, market=market)
    if fund is None or fund.empty:
        return pd.DataFrame()
    fund = _reset_code_index(fund)
    fund["market"] = market
    return fund


def _get_cap_market(ymd: str, market: str) -> Any:
    cap = stock.get_market_cap_by_ticker(ymd, market=market)
    if cap is None or cap.empty:
        return pd.DataFrame(columns=["code", "close", "market_cap", "volume", "trading_value", "listed_shares"])

    cap = _reset_code_index(cap)
    cap = cap.rename(columns={
        "종가": "close",
        "시가총액": "market_cap",
        "거래량": "volume",
        "거래대금": "trading_value",
        "상장주식수": "listed_shares",
    })

    for col in ["close", "market_cap", "volume", "trading_value", "listed_shares"]:
        if col not in cap.columns:
            cap[col] = float("nan")

    return cap[["code", "close", "market_cap", "volume", "trading_value", "listed_shares"]]


def _fundamental_frame(filters: ScreenerFilters) -> Tuple[Any, str]:
    _check_dependencies()
    ymd = _latest_available_date()
    frames = []

    for market in _market_list(filters.market):
        try:
            fund = _get_fundamental_market(ymd, market)
            if fund.empty:
                continue
            cap = _get_cap_market(ymd, market)
            df = fund.merge(cap, on="code", how="left")
            df["market"] = market
            frames.append(df)
        except Exception:
            continue

    if not frames:
        raise RuntimeError("KRX 투자지표 데이터를 불러오지 못했습니다.")

    df = pd.concat(frames, ignore_index=True)
    df["code"] = df["code"].astype(str).str.zfill(6)
    df["name"] = df["code"].map(_ticker_name)

    for col in ["BPS", "PER", "PBR", "EPS", "DIV", "DPS", "close", "market_cap", "volume", "trading_value", "listed_shares"]:
        if col not in df.columns:
            df[col] = float("nan")
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # PyKRX에서 PER/PBR 0은 대체로 의미 있는 0이 아니라 N/A에 가깝다.
    df.loc[df["PER"] <= 0, "PER"] = float("nan")
    df.loc[df["PBR"] <= 0, "PBR"] = float("nan")
    df.loc[df["BPS"] <= 0, "BPS"] = float("nan")

    df["roe_est"] = (df["EPS"] / df["BPS"]) * 100
    df.loc[~df["roe_est"].apply(lambda x: math.isfinite(float(x)) if x is not None else False), "roe_est"] = float("nan")

    df["psr"] = float("nan")
    df["base_date"] = ymd
    return df, ymd


def _range_filter(df, col: str, min_value: Optional[float], max_value: Optional[float]):
    if min_value is not None:
        df = df[df[col].notna() & (df[col] >= min_value)]
    if max_value is not None:
        df = df[df[col].notna() & (df[col] <= max_value)]
    return df


def _has_price_metric_condition(filters: ScreenerFilters) -> bool:
    return any(v is not None for v in [
        filters.drawdown_52w_min,
        filters.drawdown_52w_max,
        filters.mdd_1y_min,
        filters.mdd_1y_max,
    ]) or filters.sort in {"drawdown_desc", "mdd_asc"}


def _price_metrics_for_ticker(code: str, end_ymd: str, days: int = 380) -> Tuple[Optional[float], Optional[float]]:
    try:
        end_d = datetime.strptime(end_ymd, "%Y%m%d").date()
        start_d = end_d - timedelta(days=days)
        hist = stock.get_market_ohlcv_by_date(start_d.strftime("%Y%m%d"), end_ymd, code)
        if hist is None or hist.empty or "종가" not in hist.columns:
            return None, None

        closes = pd.to_numeric(hist["종가"], errors="coerce").dropna()
        closes = closes[closes > 0]
        if closes.empty:
            return None, None

        high_52w = closes.max()
        last = closes.iloc[-1]
        drawdown_52w = (last / high_52w - 1.0) * 100.0

        running_max = closes.cummax()
        mdd_1y = ((closes / running_max) - 1.0).min() * 100.0
        return round(float(drawdown_52w), 2), round(float(mdd_1y), 2)
    except Exception:
        return None, None


def _apply_price_metrics(df, ymd: str, limit: int):
    if df.empty:
        df = df.copy()
        df["drawdown_52w"] = float("nan")
        df["mdd_1y"] = float("nan")
        return df

    codes = df["code"].head(max(limit, 1)).tolist()
    metrics = {code: _price_metrics_for_ticker(code, ymd) for code in codes}

    df = df.copy()
    df["drawdown_52w"] = df["code"].map(lambda c: metrics.get(c, (None, None))[0])
    df["mdd_1y"] = df["code"].map(lambda c: metrics.get(c, (None, None))[1])
    return df


def _apply_fundamental_filters(df, filters: ScreenerFilters):
    df = _range_filter(df, "PER", filters.per_min, filters.per_max)
    df = _range_filter(df, "PBR", filters.pbr_min, filters.pbr_max)
    df = _range_filter(df, "roe_est", filters.roe_min, filters.roe_max)
    df = _range_filter(df, "EPS", filters.eps_min, filters.eps_max)
    df = _range_filter(df, "BPS", filters.bps_min, filters.bps_max)
    df = _range_filter(df, "DIV", filters.div_min, filters.div_max)
    df = _range_filter(df, "DPS", filters.dps_min, filters.dps_max)

    if filters.market_cap_min_uk is not None:
        df = df[df["market_cap"].notna() & (df["market_cap"] >= filters.market_cap_min_uk * 100_000_000)]
    if filters.market_cap_max_uk is not None:
        df = df[df["market_cap"].notna() & (df["market_cap"] <= filters.market_cap_max_uk * 100_000_000)]
    if filters.trading_value_min_uk is not None:
        df = df[df["trading_value"].notna() & (df["trading_value"] >= filters.trading_value_min_uk * 100_000_000)]
    if filters.trading_value_max_uk is not None:
        df = df[df["trading_value"].notna() & (df["trading_value"] <= filters.trading_value_max_uk * 100_000_000)]

    return df


def _apply_price_filters(df, filters: ScreenerFilters):
    if "drawdown_52w" in df.columns:
        df = _range_filter(df, "drawdown_52w", filters.drawdown_52w_min, filters.drawdown_52w_max)
    if "mdd_1y" in df.columns:
        df = _range_filter(df, "mdd_1y", filters.mdd_1y_min, filters.mdd_1y_max)
    return df


def _sort_frame(df, sort: str):
    sort_map = {
        "per_asc": ("PER", True),
        "pbr_asc": ("PBR", True),
        "roe_desc": ("roe_est", False),
        "eps_desc": ("EPS", False),
        "div_desc": ("DIV", False),
        "dps_desc": ("DPS", False),
        "market_cap_desc": ("market_cap", False),
        "trading_value_desc": ("trading_value", False),
        "drawdown_desc": ("drawdown_52w", True),
        "mdd_asc": ("mdd_1y", False),
    }
    col, ascending = sort_map.get(sort, ("PER", True))
    if col not in df.columns:
        return df
    return df.sort_values(by=col, ascending=ascending, na_position="last")


def _fmt_num(value: Any, digits: int = 2) -> Optional[float]:
    try:
        number = float(value)
    except Exception:
        return None
    if not math.isfinite(number):
        return None
    if abs(number) >= 1000:
        return round(number, 0)
    return round(number, digits)


def _fmt_money_uk(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except Exception:
        return None
    if not math.isfinite(number):
        return None
    return round(number / 100_000_000, 1)


def _row_to_dict(row) -> Dict[str, Any]:
    code = str(row.get("code", "")).zfill(6)
    market = str(row.get("market", "") or "KRX")
    return {
        "code": code,
        "name": str(row.get("name", code) or code),
        "market": market,
        "chart_url": f"/stocks/{code}/",
        "per": _fmt_num(row.get("PER")),
        "pbr": _fmt_num(row.get("PBR")),
        "roe_est": _fmt_num(row.get("roe_est")),
        "eps": _fmt_num(row.get("EPS"), 0),
        "bps": _fmt_num(row.get("BPS"), 0),
        "div": _fmt_num(row.get("DIV")),
        "dps": _fmt_num(row.get("DPS"), 0),
        "psr": _fmt_num(row.get("psr")),
        "market_cap_uk": _fmt_money_uk(row.get("market_cap")),
        "trading_value_uk": _fmt_money_uk(row.get("trading_value")),
        "drawdown_52w": _fmt_num(row.get("drawdown_52w")),
        "mdd_1y": _fmt_num(row.get("mdd_1y")),
    }


def run_screener(filters: ScreenerFilters) -> Dict[str, Any]:
    df, ymd = _fundamental_frame(filters)
    df = _apply_fundamental_filters(df, filters)

    # 가격지표 조건/정렬을 쓰는 경우에는 필터 통과 후보 일부에 대해 먼저 계산한다.
    if _has_price_metric_condition(filters):
        prelim_sort = filters.sort if filters.sort not in {"drawdown_desc", "mdd_asc"} else "trading_value_desc"
        df = _sort_frame(df, prelim_sort).head(PRICE_METRIC_SCAN_LIMIT)
        df = _apply_price_metrics(df, ymd, PRICE_METRIC_SCAN_LIMIT)
        df = _apply_price_filters(df, filters)
        df = _sort_frame(df, filters.sort)
    else:
        df = _sort_frame(df, filters.sort)
        # 결과 테이블에 52주 하락률/MDD를 보여주기 위해 최종 후보에만 가볍게 계산한다.
        df = _apply_price_metrics(df, ymd, filters.limit)

    total = int(len(df))
    df = df.head(filters.limit)
    rows = [_row_to_dict(row) for _, row in df.iterrows()]

    return {
        "base_date": ymd,
        "total": total,
        "results": rows,
        "notes": [
            "본 결과는 사용자가 입력한 조건에 따른 데이터 필터링 결과이며, 특정 종목의 매수·매도 추천이 아닙니다.",
            "ROE는 EPS/BPS 기반의 추정치입니다. PSR, 부채비율, 성장률은 OpenDART 재무제표 연동 후 확장하세요.",
        ],
    }
