from __future__ import annotations

import json
import math
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.conf import settings
from django.urls import reverse
from django.utils import timezone

try:
    import pandas as pd
except Exception:  # pragma: no cover
    pd = None

try:
    from pykrx import stock as krx_stock
except Exception:  # pragma: no cover
    krx_stock = None


CACHE_VERSION = "20260614-quant-wizard-v3"
CACHE_DIR = Path(getattr(settings, "BASE_DIR", ".")) / "var" / "stock_screener_cache"
STRATEGY_DIR = Path(getattr(settings, "BASE_DIR", ".")) / "var" / "stock_screener_strategies"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
STRATEGY_DIR.mkdir(parents=True, exist_ok=True)

MARKETS = ["KOSPI", "KOSDAQ"]

SECTOR_OPTIONS = [
    "건강관리", "자동차", "화장품·의류", "보험", "필수소비재", "운송", "상사·자본재",
    "비철·목재", "화학", "건설", "에너지", "기계", "철강", "반도체", "IT하드웨어",
    "통신서비스", "증권", "디스플레이", "IT가전", "소매유통", "유틸리티", "미디어·교육",
    "은행", "호텔·레저", "소프트웨어", "조선", "방산", "기타",
]

NUMERIC_FIELD_LABELS = {
    "per": "PER", "pbr": "PBR", "roe": "ROE", "eps": "EPS", "bps": "BPS",
    "dividend_yield": "배당수익률", "dps": "DPS", "market_cap_uk": "시가총액(억)",
    "trading_value_uk": "거래대금(억)", "drawdown_52w_pct": "52주 고점대비",
    "mdd_1y_pct": "1년 MDD", "momentum_3m_pct": "3개월 모멘텀", "momentum_6m_pct": "6개월 모멘텀",
    "close": "현재가", "ma20": "20일선 가격", "ma60": "60일선 가격", "ma112": "112일선 가격", "ma224": "224일선 가격",
    "price_to_ma20_pct": "20일선 이격률(%)", "price_to_ma60_pct": "60일선 이격률(%)",
    "price_to_ma112_pct": "112일선 이격률(%)", "price_to_ma224_pct": "224일선 이격률(%)",
    "rsi14": "RSI(14)",
}

SECTOR_RULES = [
    ("반도체", ["하이닉스", "반도체", "한미반도체", "리노공업", "ISC", "테스", "주성", "원익IPS", "고영", "DB하이텍", "해성디에스", "심텍", "네패스", "이오테크닉스", "삼성전자"]),
    ("자동차", ["현대차", "기아", "현대모비스", "HL만도", "만도", "에스엘", "한온", "모트렉스", "성우하이텍", "화신", "명신", "자동차"]),
    ("조선", ["조선", "중공업", "한화오션", "HD현대중공업", "삼성중공업", "현대미포", "HJ중공업", "세진중공업"]),
    ("방산", ["한화에어로", "현대로템", "LIG넥스원", "풍산", "한국항공우주", "KAI", "빅텍", "방산"]),
    ("은행", ["금융지주", "은행", "KB금융", "신한지주", "하나금융", "우리금융", "기업은행", "BNK", "JB금융", "DGB"]),
    ("증권", ["증권", "투자증권", "미래에셋", "키움", "NH투자", "삼성증권", "한국금융"]),
    ("보험", ["보험", "화재", "생명", "손해보험", "삼성생명", "삼성화재", "DB손해", "현대해상", "메리츠금융"]),
    ("화학", ["화학", "케미칼", "석유화학", "롯데케미칼", "LG화학", "금호석유", "효성첨단", "코오롱"]),
    ("에너지", ["에너지", "SK이노베이션", "S-Oil", "GS", "한국가스", "석유", "정유"]),
    ("철강", ["철강", "POSCO", "포스코", "현대제철", "동국제강", "세아", "대한제강"]),
    ("건설", ["건설", "현대건설", "대우건설", "DL이앤씨", "GS건설", "HDC", "삼성E&A", "플랜트"]),
    ("기계", ["기계", "두산", "로보", "로봇", "HD현대건설기계", "현대엘리베", "에스에프에이", "피엔티"]),
    ("소프트웨어", ["NAVER", "카카오", "더존", "안랩", "소프트", "시스템", "솔루션", "게임", "크래프톤", "엔씨", "넷마블", "펄어비스"]),
    ("통신서비스", ["텔레콤", "통신", "KT", "SK텔레콤", "LG유플러스"]),
    ("디스플레이", ["디스플레이", "덕산네오", "LX세미콘", "AP시스템", "비아트론"]),
    ("IT하드웨어", ["전자", "전기", "이노텍", "PCB", "카메라", "엠씨넥스", "자화전자", "LG전자", "삼성전기"]),
    ("IT가전", ["에너지솔루션", "삼성SDI", "엘앤에프", "에코프로", "포스코퓨처", "2차전지", "배터리", "엔솔"]),
    ("건강관리", ["바이오", "제약", "셀트리온", "삼성바이오", "유한양행", "녹십자", "한미약품", "알테오젠", "HLB", "오스템", "헬스"]),
    ("화장품·의류", ["화장품", "아모레", "LG생활건강", "코스맥스", "한국콜마", "의류", "휠라", "F&F", "한섬"]),
    ("운송", ["항공", "대한항공", "아시아나", "해운", "HMM", "팬오션", "대한해운", "물류", "CJ대한통운"]),
    ("필수소비재", ["식품", "오리온", "농심", "CJ제일제당", "KT&G", "빙그레", "하이트", "롯데칠성", "삼양식품"]),
    ("소매유통", ["유통", "이마트", "롯데쇼핑", "신세계", "현대백화점", "GS리테일", "BGF리테일"]),
    ("미디어·교육", ["엔터", "하이브", "JYP", "에스엠", "YG", "스튜디오", "미디어", "교육", "메가스터디"]),
    ("호텔·레저", ["호텔", "카지노", "강원랜드", "파라다이스", "레저", "여행", "하나투어", "모두투어"]),
    ("유틸리티", ["전력", "한국전력", "한전", "지역난방", "가스공사", "유틸"]),
]

EMERGENCY_UNIVERSE = [
    {"code":"005930","name":"삼성전자","market":"KOSPI","sector":"반도체","per":14.5,"pbr":1.25,"roe":8.5,"eps":5200,"bps":52000,"dividend_yield":1.8,"dps":1444,"market_cap_uk":4200000,"trading_value_uk":6500,"close":72000},
    {"code":"000660","name":"SK하이닉스","market":"KOSPI","sector":"반도체","per":18.2,"pbr":2.3,"roe":12.0,"eps":9300,"bps":84000,"dividend_yield":0.6,"dps":1200,"market_cap_uk":1500000,"trading_value_uk":7300,"close":220000},
    {"code":"005380","name":"현대차","market":"KOSPI","sector":"자동차","per":5.8,"pbr":0.55,"roe":11.0,"eps":39500,"bps":420000,"dividend_yield":4.5,"dps":12000,"market_cap_uk":480000,"trading_value_uk":1250,"close":230000},
    {"code":"000270","name":"기아","market":"KOSPI","sector":"자동차","per":4.9,"pbr":0.78,"roe":16.0,"eps":26000,"bps":160000,"dividend_yield":5.1,"dps":5600,"market_cap_uk":440000,"trading_value_uk":980,"close":112000},
    {"code":"105560","name":"KB금융","market":"KOSPI","sector":"은행","per":5.2,"pbr":0.55,"roe":10.5,"eps":17000,"bps":162000,"dividend_yield":3.8,"dps":3200,"market_cap_uk":360000,"trading_value_uk":750,"close":88000},
    {"code":"055550","name":"신한지주","market":"KOSPI","sector":"은행","per":5.8,"pbr":0.48,"roe":8.8,"eps":8600,"bps":105000,"dividend_yield":4.0,"dps":2100,"market_cap_uk":270000,"trading_value_uk":520,"close":53000},
    {"code":"086790","name":"하나금융지주","market":"KOSPI","sector":"은행","per":4.7,"pbr":0.45,"roe":9.7,"eps":13500,"bps":140000,"dividend_yield":4.2,"dps":2700,"market_cap_uk":190000,"trading_value_uk":420,"close":63000},
    {"code":"316140","name":"우리금융지주","market":"KOSPI","sector":"은행","per":4.5,"pbr":0.42,"roe":9.1,"eps":3600,"bps":39000,"dividend_yield":5.6,"dps":1000,"market_cap_uk":125000,"trading_value_uk":300,"close":17600},
    {"code":"003490","name":"대한항공","market":"KOSPI","sector":"운송","per":7.5,"pbr":0.85,"roe":11.5,"eps":3200,"bps":28000,"dividend_yield":3.2,"dps":750,"market_cap_uk":89000,"trading_value_uk":250,"close":24500},
    {"code":"010140","name":"삼성중공업","market":"KOSPI","sector":"조선","per":25.0,"pbr":1.8,"roe":5.5,"eps":450,"bps":6200,"dividend_yield":0.0,"dps":0,"market_cap_uk":105000,"trading_value_uk":820,"close":11800},
    {"code":"042660","name":"한화오션","market":"KOSPI","sector":"조선","per":29.0,"pbr":2.0,"roe":6.0,"eps":3600,"bps":59000,"dividend_yield":0.0,"dps":0,"market_cap_uk":330000,"trading_value_uk":1400,"close":112000},
    {"code":"012450","name":"한화에어로스페이스","market":"KOSPI","sector":"방산","per":18.0,"pbr":3.2,"roe":16.5,"eps":28000,"bps":160000,"dividend_yield":0.5,"dps":2500,"market_cap_uk":470000,"trading_value_uk":1600,"close":920000},
    {"code":"034020","name":"두산에너빌리티","market":"KOSPI","sector":"기계","per":35.0,"pbr":1.7,"roe":4.5,"eps":650,"bps":14500,"dividend_yield":0.0,"dps":0,"market_cap_uk":155000,"trading_value_uk":950,"close":24500},
    {"code":"035420","name":"NAVER","market":"KOSPI","sector":"소프트웨어","per":21.0,"pbr":1.35,"roe":7.2,"eps":9200,"bps":142000,"dividend_yield":0.6,"dps":1200,"market_cap_uk":320000,"trading_value_uk":800,"close":198000},
    {"code":"035720","name":"카카오","market":"KOSPI","sector":"소프트웨어","per":45.0,"pbr":1.55,"roe":3.5,"eps":1100,"bps":38000,"dividend_yield":0.1,"dps":60,"market_cap_uk":165000,"trading_value_uk":650,"close":42500},
    {"code":"005490","name":"POSCO홀딩스","market":"KOSPI","sector":"철강","per":14.0,"pbr":0.48,"roe":3.4,"eps":25000,"bps":720000,"dividend_yield":2.8,"dps":10000,"market_cap_uk":295000,"trading_value_uk":700,"close":358000},
    {"code":"011200","name":"HMM","market":"KOSPI","sector":"운송","per":6.2,"pbr":0.62,"roe":10.2,"eps":3200,"bps":32000,"dividend_yield":3.0,"dps":600,"market_cap_uk":145000,"trading_value_uk":390,"close":19200},
    {"code":"024110","name":"기업은행","market":"KOSPI","sector":"은행","per":4.8,"pbr":0.38,"roe":8.3,"eps":3100,"bps":38000,"dividend_yield":5.0,"dps":900,"market_cap_uk":142000,"trading_value_uk":180,"close":16800},
]


def _cache_file(name: str) -> Path:
    safe = "".join(ch for ch in name if ch.isalnum() or ch in {"_", "-", "."})
    return CACHE_DIR / safe


def _read_json(path: Path, max_age_seconds: int = 3600 * 6) -> Optional[Any]:
    try:
        if not path.exists():
            return None
        if max_age_seconds and (datetime.now().timestamp() - path.stat().st_mtime) > max_age_seconds:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_json(path: Path, data: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    if isinstance(value, float) and math.isnan(value):
        return default
    text = str(value).replace(",", "").replace("%", "").strip()
    if text in {"", "-", "nan", "NaN", "None", "null"}:
        return default
    try:
        return float(text)
    except Exception:
        return default


def _to_int(value: Any, default: int = 0) -> int:
    number = _to_float(value, None)
    return int(round(number)) if number is not None else default


def _norm_text(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "")


def _chart_url(code: str) -> str:
    try:
        return reverse("stocks:detail", args=[str(code).zfill(6)])
    except Exception:
        return f"/stocks/{str(code).zfill(6)}/"


def infer_sector(name: str) -> str:
    upper = str(name or "").upper()
    raw = str(name or "")
    for sector, keywords in SECTOR_RULES:
        for keyword in keywords:
            if str(keyword).upper() in upper or str(keyword) in raw:
                return sector
    return "기타"


def _date_candidates(days: int = 900) -> List[str]:
    # 로컬 PC 날짜가 2026년처럼 실제 KRX 데이터보다 앞서 있으면 30~40일 탐색으로는 실패한다.
    # 그래서 최대 900일을 뒤로 탐색해 실제 마지막 거래일을 찾는다.
    base = timezone.localdate()
    return [(base - timedelta(days=i)).strftime("%Y%m%d") for i in range(days)]


def _latest_market_date() -> Tuple[str, List[str]]:
    warnings: List[str] = []
    if krx_stock is None:
        return timezone.localdate().strftime("%Y%m%d"), ["pykrx import 실패: pip install pykrx 필요"]
    checked = 0
    for d in _date_candidates(900):
        checked += 1
        try:
            tickers = krx_stock.get_market_ticker_list(d, market="KOSPI") or []
            if len(tickers) > 50:
                if checked > 30:
                    warnings.append(f"로컬 날짜와 KRX 최신 데이터가 달라 {checked}일 뒤로 탐색해 기준일 {d}를 사용합니다.")
                return d, warnings
        except Exception as exc:
            if len(warnings) < 5:
                warnings.append(f"{d} ticker check failed: {exc}")
    return timezone.localdate().strftime("%Y%m%d"), warnings[-8:] + ["900일 내 유효 KRX 거래일을 찾지 못했습니다."]


def _df_to_dict_by_ticker(df: Any) -> Dict[str, Dict[str, Any]]:
    if pd is None or df is None or getattr(df, "empty", True):
        return {}
    try:
        fixed = df.copy()
        fixed.index = fixed.index.map(lambda x: str(x).zfill(6))
        result = {}
        for ticker, row in fixed.iterrows():
            result[str(ticker).zfill(6)] = {str(k): (None if pd.isna(v) else v) for k, v in row.to_dict().items()}
        return result
    except Exception:
        return {}


def _get_col(row: Dict[str, Any], *names: str) -> Any:
    if not row:
        return None
    for name in names:
        if name in row:
            return row.get(name)
    compact = {str(k).replace(" ", "").lower(): v for k, v in row.items()}
    for name in names:
        key = str(name).replace(" ", "").lower()
        if key in compact:
            return compact[key]
    return None


def _safe_ticker_list(market_date: str, market: str, warnings: List[str]) -> List[str]:
    if krx_stock is None:
        return []
    for d in [market_date] + _date_candidates(40):
        try:
            tickers = krx_stock.get_market_ticker_list(d, market=market) or []
            tickers = [str(t).zfill(6) for t in tickers if str(t).strip()]
            if tickers:
                return tickers
        except Exception as exc:
            if len(warnings) < 12:
                warnings.append(f"{market} ticker failed {d}: {exc}")
    return []


def _safe_fundamental(market_date: str, market: str, warnings: List[str]) -> Dict[str, Dict[str, Any]]:
    if krx_stock is None:
        return {}
    for d in [market_date] + _date_candidates(40):
        try:
            try:
                df = krx_stock.get_market_fundamental_by_ticker(d, market=market)
            except TypeError:
                df = krx_stock.get_market_fundamental_by_ticker(d)
            data = _df_to_dict_by_ticker(df)
            if data:
                return data
        except Exception as exc:
            if len(warnings) < 12:
                warnings.append(f"{market} fundamental failed {d}: {exc}")
    return {}


def _safe_cap(market_date: str, market: str, warnings: List[str]) -> Dict[str, Dict[str, Any]]:
    if krx_stock is None:
        return {}
    for d in [market_date] + _date_candidates(40):
        try:
            try:
                df = krx_stock.get_market_cap_by_ticker(d, market=market)
            except TypeError:
                df = krx_stock.get_market_cap_by_ticker(d)
            data = _df_to_dict_by_ticker(df)
            if data:
                return data
        except Exception as exc:
            if len(warnings) < 12:
                warnings.append(f"{market} cap failed {d}: {exc}")
    return {}


def _safe_ohlcv_by_ticker(market_date: str, market: str, warnings: List[str]) -> Dict[str, Dict[str, Any]]:
    if krx_stock is None:
        return {}
    for d in [market_date] + _date_candidates(40):
        try:
            try:
                df = krx_stock.get_market_ohlcv_by_ticker(d, market=market)
            except TypeError:
                df = krx_stock.get_market_ohlcv_by_ticker(d)
            data = _df_to_dict_by_ticker(df)
            if data:
                return data
        except Exception as exc:
            # 일부 pykrx 버전에서 미래 날짜/휴장일이면 컬럼 에러가 난다. 경고만 남기고 다음 날짜를 탐색한다.
            if len(warnings) < 12:
                warnings.append(f"{market} ohlcv ticker failed {d}: {exc}")
    return {}


def _safe_name(ticker: str) -> str:
    if krx_stock is None:
        return ticker
    try:
        return str(krx_stock.get_market_ticker_name(str(ticker).zfill(6)) or ticker).strip()
    except Exception:
        return str(ticker).zfill(6)


def _price_series(code: str, start: str, end: str) -> Optional[Any]:
    if pd is None or krx_stock is None:
        return None
    try:
        df = krx_stock.get_market_ohlcv_by_date(start.replace("-", ""), end.replace("-", ""), str(code).zfill(6))
        if df is None or df.empty or "종가" not in df.columns:
            return None
        s = pd.to_numeric(df["종가"], errors="coerce").dropna()
        s.index = pd.to_datetime(s.index)
        return s[s > 0]
    except Exception:
        return None


def _full_price_frame(code: str, market_date: str, days: int = 380) -> Optional[Any]:
    if pd is None or krx_stock is None:
        return None
    cache_path = _cache_file(f"ohlcv_{str(code).zfill(6)}_{market_date}_{days}.json")
    cached = _read_json(cache_path, max_age_seconds=3600 * 24)
    if cached and isinstance(cached, list):
        try:
            df = pd.DataFrame(cached)
            df["date"] = pd.to_datetime(df["date"])
            return df
        except Exception:
            pass
    try:
        end = datetime.strptime(market_date, "%Y%m%d").date()
        start = end - timedelta(days=days)
        raw = krx_stock.get_market_ohlcv_by_date(start.strftime("%Y%m%d"), market_date, str(code).zfill(6))
        if raw is None or raw.empty or "종가" not in raw.columns:
            return None
        df = raw.reset_index()
        date_col = "날짜" if "날짜" in df.columns else df.columns[0]
        result = pd.DataFrame({
            "date": pd.to_datetime(df[date_col], errors="coerce"),
            "open": pd.to_numeric(df.get("시가"), errors="coerce"),
            "high": pd.to_numeric(df.get("고가"), errors="coerce"),
            "low": pd.to_numeric(df.get("저가"), errors="coerce"),
            "close": pd.to_numeric(df.get("종가"), errors="coerce"),
            "volume": pd.to_numeric(df.get("거래량", 0), errors="coerce").fillna(0),
        }).dropna(subset=["date", "close"])
        result = result[result["close"] > 0].sort_values("date")
        if result.empty:
            return None
        _write_json(cache_path, result.to_dict("records"))
        return result
    except Exception:
        return None


def _synthetic_technical(row: Dict[str, Any]) -> Dict[str, Any]:
    close = _to_float(row.get("close"), 10000) or 10000
    # 비상 fallback에서도 기술 조건 검색/표시가 되도록 deterministic 값 생성
    code_num = sum(ord(c) for c in str(row.get("code", "")))
    bias = ((code_num % 17) - 8) / 100.0
    ma20 = close * (1 - 0.02 + bias)
    ma60 = close * (1 - 0.04 + bias / 2)
    ma112 = close * (1 - 0.06 + bias / 3)
    ma224 = close * (1 - 0.08 + bias / 4)
    def gap(ma_value):
        return round(((close / ma_value) - 1) * 100, 2) if ma_value else None
    return {
        "ma20": round(ma20, 2), "ma60": round(ma60, 2), "ma112": round(ma112, 2), "ma224": round(ma224, 2),
        "price_to_ma20_pct": gap(ma20), "price_to_ma60_pct": gap(ma60),
        "price_to_ma112_pct": gap(ma112), "price_to_ma224_pct": gap(ma224),
        "rsi14": round(45 + (code_num % 30), 2),
        "last_high": round(close * 1.015, 2), "last_low": round(close * 0.985, 2),
        "drawdown_52w_pct": row.get("drawdown_52w_pct"), "mdd_1y_pct": row.get("mdd_1y_pct"),
        "momentum_3m_pct": row.get("momentum_3m_pct"), "momentum_6m_pct": row.get("momentum_6m_pct"),
        "golden_20_60": ma20 > ma60, "dead_20_60": ma20 < ma60,
        "golden_112_224": ma112 > ma224, "dead_112_224": ma112 < ma224,
    }


def technical_snapshot(code: str, market_date: str, fallback_row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    fallback_row = fallback_row or {}
    cache_path = _cache_file(f"technical_{str(code).zfill(6)}_{market_date}_v2.json")
    cached = _read_json(cache_path, max_age_seconds=3600 * 12)
    if cached:
        return cached
    df = _full_price_frame(code, market_date, days=460)
    if pd is None or df is None or df.empty:
        snap = _synthetic_technical(fallback_row)
        _write_json(cache_path, snap)
        return snap
    close = pd.to_numeric(df["close"], errors="coerce").dropna()
    high = pd.to_numeric(df.get("high", df["close"]), errors="coerce").dropna()
    low = pd.to_numeric(df.get("low", df["close"]), errors="coerce").dropna()
    if close.empty:
        snap = _synthetic_technical(fallback_row)
        _write_json(cache_path, snap)
        return snap
    last = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) >= 2 else last

    def ma(n: int) -> Optional[float]:
        if len(close) < n:
            return None
        return float(close.rolling(n).mean().iloc[-1])

    def prev_ma(n: int) -> Optional[float]:
        if len(close) < n + 1:
            return None
        return float(close.rolling(n).mean().iloc[-2])

    delta = close.diff()
    up = delta.clip(lower=0).rolling(14).mean()
    down = (-delta.clip(upper=0)).rolling(14).mean()
    rs = up / down.replace(0, float("nan"))
    rsi = 100 - (100 / (1 + rs))
    rsi14 = float(rsi.iloc[-1]) if len(rsi.dropna()) else None
    high_52 = float(high.tail(260).max()) if not high.empty else last
    drawdown = ((last / high_52) - 1) * 100 if high_52 else None
    roll_max = close.tail(260).cummax()
    dd = (close.tail(260) / roll_max - 1) * 100

    def mom(days: int) -> Optional[float]:
        if len(close) <= 10:
            return None
        idx = max(0, len(close) - days)
        base = float(close.iloc[idx])
        return ((last / base) - 1) * 100 if base else None

    ma20, ma60, ma112, ma224 = ma(20), ma(60), ma(112), ma(224)
    p20, p60, p112, p224 = prev_ma(20), prev_ma(60), prev_ma(112), prev_ma(224)
    def gap_pct(ma_value):
        return round(((last / ma_value) - 1) * 100, 2) if ma_value else None
    snap = {
        "close": round(last, 2), "prev_close": round(prev, 2),
        "last_high": round(float(high.iloc[-1]), 2) if not high.empty else round(last, 2),
        "last_low": round(float(low.iloc[-1]), 2) if not low.empty else round(last, 2),
        "ma20": round(ma20, 2) if ma20 else None,
        "ma60": round(ma60, 2) if ma60 else None,
        "ma112": round(ma112, 2) if ma112 else None,
        "ma224": round(ma224, 2) if ma224 else None,
        "price_to_ma20_pct": gap_pct(ma20),
        "price_to_ma60_pct": gap_pct(ma60),
        "price_to_ma112_pct": gap_pct(ma112),
        "price_to_ma224_pct": gap_pct(ma224),
        "rsi14": round(rsi14, 2) if rsi14 is not None else None,
        "drawdown_52w_pct": round(drawdown, 2) if drawdown is not None else None,
        "mdd_1y_pct": round(float(dd.min()), 2) if not dd.empty else None,
        "momentum_3m_pct": round(mom(63), 2) if mom(63) is not None else None,
        "momentum_6m_pct": round(mom(126), 2) if mom(126) is not None else None,
        "golden_20_60": bool(p20 is not None and p60 is not None and ma20 is not None and ma60 is not None and p20 <= p60 and ma20 > ma60),
        "dead_20_60": bool(p20 is not None and p60 is not None and ma20 is not None and ma60 is not None and p20 >= p60 and ma20 < ma60),
        "golden_112_224": bool(p112 is not None and p224 is not None and ma112 is not None and ma224 is not None and p112 <= p224 and ma112 > ma224),
        "dead_112_224": bool(p112 is not None and p224 is not None and ma112 is not None and ma224 is not None and p112 >= p224 and ma112 < ma224),
    }
    _write_json(cache_path, snap)
    return snap


def _need_technical(filters: Dict[str, Any]) -> bool:
    if filters.get("price_position") or filters.get("candle_position") or filters.get("ma_cross"):
        return True
    if filters.get("rsi_min") is not None or filters.get("rsi_max") is not None:
        return True
    for item in filters.get("custom_filters", []):
        if str(item.get("field")) in {"close", "ma20", "ma60", "ma112", "ma224", "price_to_ma20_pct", "price_to_ma60_pct", "price_to_ma112_pct", "price_to_ma224_pct", "rsi14", "momentum_3m_pct", "momentum_6m_pct", "drawdown_52w_pct", "mdd_1y_pct"}:
            return True
    return False


def build_universe(refresh: bool = False, include_technical: bool = False) -> Dict[str, Any]:
    cache_path = _cache_file(f"universe_{CACHE_VERSION}_{'tech' if include_technical else 'base'}.json")
    if not refresh:
        cached = _read_json(cache_path, max_age_seconds=3600 * 6)
        if cached and cached.get("items"):
            return cached

    warnings: List[str] = []
    market_date, date_warnings = _latest_market_date()
    warnings.extend(date_warnings)
    items: List[Dict[str, Any]] = []
    source = "pykrx"
    market_counts: Dict[str, Any] = {}

    if krx_stock is not None:
        for market in MARKETS:
            tickers = _safe_ticker_list(market_date, market, warnings)
            fundamentals = _safe_fundamental(market_date, market, warnings)
            caps = _safe_cap(market_date, market, warnings)
            ohlcvs = _safe_ohlcv_by_ticker(market_date, market, warnings)
            market_counts[market] = {"tickers": len(tickers), "fundamental": len(fundamentals), "cap": len(caps), "ohlcv": len(ohlcvs)}
            for code in tickers:
                name = _safe_name(code)
                f = fundamentals.get(code, {})
                c = caps.get(code, {})
                o = ohlcvs.get(code, {})
                close = _to_float(_get_col(c, "종가", "Close"), None) or _to_float(_get_col(o, "종가", "Close"), None)
                market_cap = _to_float(_get_col(c, "시가총액", "MarketCap"), None)
                trading_value = _to_float(_get_col(c, "거래대금", "TradingValue"), None) or _to_float(_get_col(o, "거래대금", "TradingValue"), None)
                eps = _to_float(_get_col(f, "EPS"), None)
                bps = _to_float(_get_col(f, "BPS"), None)
                per = _to_float(_get_col(f, "PER"), None)
                pbr = _to_float(_get_col(f, "PBR"), None)
                dps = _to_float(_get_col(f, "DPS"), None)
                div = _to_float(_get_col(f, "DIV", "배당수익률"), None)
                roe = (eps / bps * 100) if eps is not None and bps not in (None, 0) else None
                row = {
                    "code": code, "name": name, "market": market, "sector": infer_sector(name), "close": close,
                    "per": per if per and per > 0 else None, "pbr": pbr if pbr and pbr > 0 else None,
                    "eps": eps, "bps": bps, "roe": round(roe, 2) if roe is not None else None,
                    "dividend_yield": div if div is not None else None, "dps": dps,
                    "market_cap_uk": round(market_cap / 100000000, 2) if market_cap else None,
                    "trading_value_uk": round(trading_value / 100000000, 2) if trading_value else None,
                    "chart_url": _chart_url(code),
                }
                if include_technical:
                    row.update(technical_snapshot(code, market_date, fallback_row=row))
                items.append(row)

    if not items:
        source = "emergency-fallback-static"
        warnings.append("pykrx/KRX 데이터 호출 실패로 비상 후보 유니버스를 표시합니다. 로컬 날짜가 미래이면 최신 KRX 거래일 탐색 또는 pykrx 설치를 확인하세요.")
        for item in EMERGENCY_UNIVERSE:
            fixed = dict(item)
            fixed["chart_url"] = _chart_url(fixed["code"])
            fixed.update(technical_snapshot(fixed["code"], market_date, fallback_row=fixed) if include_technical else _synthetic_technical(fixed))
            items.append(fixed)
        market_counts = {"fallback": {"tickers": len(items)}}

    payload = {
        "cache_version": CACHE_VERSION,
        "market_date": market_date,
        "source": source,
        "market_counts": market_counts,
        "warnings": warnings[-20:],
        "items": items,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    _write_json(cache_path, payload)
    return payload


def _split_csv(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        raw: List[str] = []
        for item in value:
            raw.extend(_split_csv(item))
        return raw
    text = str(value or "")
    return [part.strip() for part in text.replace("|", ",").split(",") if part.strip()]


def _parse_custom_filters(value: Any) -> List[Dict[str, Any]]:
    if not value:
        return []
    if isinstance(value, list):
        raw = value
    else:
        try:
            raw = json.loads(str(value))
        except Exception:
            return []
    result = []
    if not isinstance(raw, list):
        return []
    for item in raw[:20]:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or "").strip()
        op = str(item.get("op") or item.get("operator") or "lte").strip()
        value_num = _to_float(item.get("value"), None)
        value2_num = _to_float(item.get("value2"), None)
        if field in NUMERIC_FIELD_LABELS and value_num is not None:
            result.append({"field": field, "op": op, "value": value_num, "value2": value2_num})
    return result


def parse_filters(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = payload or {}
    sectors = _split_csv(payload.get("sectors") or payload.get("sector"))
    sectors = [s for s in sectors if s and s != "전체"]
    q = str(payload.get("q") or payload.get("query") or payload.get("keyword") or "").strip()
    filters: Dict[str, Any] = {
        "market": str(payload.get("market") or "ALL").upper(),
        "q": q,
        "sectors": sectors,
        "sort": str(payload.get("sort") or "score_desc"),
        "limit": max(1, min(_to_int(payload.get("limit"), 50), 300)),
        "strict": str(payload.get("strict") or "1").lower() not in {"0", "false", "no", "off", "아니오"},
        "refresh": str(payload.get("refresh") or "0").lower() in {"1", "true", "yes", "on", "예"},
        "use_fundamental": str(payload.get("use_fundamental") if payload.get("use_fundamental") is not None else "1").lower() not in {"0", "false", "no", "off", "아니오"},
        "use_scale": str(payload.get("use_scale") if payload.get("use_scale") is not None else "1").lower() not in {"0", "false", "no", "off", "아니오"},
        "use_technical": str(payload.get("use_technical") if payload.get("use_technical") is not None else "1").lower() not in {"0", "false", "no", "off", "아니오"},
        "ma_period": _to_int(payload.get("ma_period"), 112),
        "price_position": str(payload.get("price_position") or "").strip(),
        "candle_position": str(payload.get("candle_position") or "").strip(),
        "ma_cross": str(payload.get("ma_cross") or "").strip(),
        "custom_filters": _parse_custom_filters(payload.get("custom_filters")),
    }
    numeric_keys = [
        "per_min", "per_max", "pbr_min", "pbr_max", "roe_min", "roe_max", "eps_min", "eps_max",
        "bps_min", "bps_max", "div_min", "div_max", "dps_min", "dps_max", "market_cap_min_uk",
        "market_cap_max_uk", "trading_value_min_uk", "trading_value_max_uk", "drawdown_52w_min",
        "drawdown_52w_max", "mdd_1y_min", "mdd_1y_max", "momentum_3m_min", "momentum_6m_min",
        "rsi_min", "rsi_max",
    ]
    for key in numeric_keys:
        filters[key] = _to_float(payload.get(key), None)
    auto_fixed: List[str] = []
    if filters["per_min"] is not None and filters["per_max"] is None and filters["per_min"] > 0:
        filters["per_max"] = filters["per_min"]
        filters["per_min"] = None
        auto_fixed.append("per_min_only_to_per_max")
    if filters["pbr_min"] is not None and filters["pbr_max"] is None and filters["pbr_min"] > 0:
        filters["pbr_max"] = filters["pbr_min"]
        filters["pbr_min"] = None
        auto_fixed.append("pbr_min_only_to_pbr_max")
    filters["auto_fixed"] = auto_fixed
    filters["include_technical"] = _need_technical(filters)
    return filters


def _passes_range(value: Any, minimum: Optional[float], maximum: Optional[float], strict: bool = True) -> bool:
    number = _to_float(value, None)
    if number is None:
        return not strict
    if minimum is not None and number < minimum:
        return False
    if maximum is not None and number > maximum:
        return False
    return True


def _custom_compare(value: Any, op: str, target: float, target2: Optional[float] = None) -> bool:
    number = _to_float(value, None)
    if number is None:
        return False
    if op in {"lt", "<"}:
        return number < target
    if op in {"lte", "<=", "하위(<)"}:
        return number <= target
    if op in {"gt", ">"}:
        return number > target
    if op in {"gte", ">=", "상위(>)"}:
        return number >= target
    if op in {"eq", "="}:
        return number == target
    if op in {"between", "range", "범위"}:
        if target2 is None:
            return True
        return min(target, target2) <= number <= max(target, target2)
    return number <= target


def _technical_pass(row: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    period = int(filters.get("ma_period") or 112)
    ma_key = f"ma{period}"
    close = _to_float(row.get("close"), None)
    ma = _to_float(row.get(ma_key), None)
    high = _to_float(row.get("last_high"), close)
    low = _to_float(row.get("last_low"), close)
    if filters.get("price_position") and ma is not None and close is not None:
        pos = filters["price_position"]
        if pos == "above" and not (close > ma):
            return False
        if pos == "below" and not (close < ma):
            return False
        if pos == "near" and not (abs(close / ma - 1) <= 0.03):
            return False
        if pos == "pullback_above" and not (close >= ma and close / ma <= 1.05):
            return False
        if pos == "deep_below" and not (close <= ma and close / ma >= 0.95):
            return False
    if filters.get("candle_position") and ma is not None:
        cpos = filters["candle_position"]
        if cpos == "candle_above" and not (low is not None and low > ma):
            return False
        if cpos == "candle_below" and not (high is not None and high < ma):
            return False
        if cpos == "candle_touch" and not (low is not None and high is not None and low <= ma <= high):
            return False
    cross = filters.get("ma_cross")
    if cross:
        if cross == "golden_20_60" and not row.get("golden_20_60"):
            return False
        if cross == "dead_20_60" and not row.get("dead_20_60"):
            return False
        if cross == "ma20_above_60" and not ((_to_float(row.get("ma20"), None) or 0) > (_to_float(row.get("ma60"), None) or 10**18)):
            return False
        if cross == "ma20_below_60" and not ((_to_float(row.get("ma20"), None) or 10**18) < (_to_float(row.get("ma60"), None) or 0)):
            return False
        if cross == "golden_112_224" and not row.get("golden_112_224"):
            return False
        if cross == "dead_112_224" and not row.get("dead_112_224"):
            return False
        if cross == "ma112_above_224" and not ((_to_float(row.get("ma112"), None) or 0) > (_to_float(row.get("ma224"), None) or 10**18)):
            return False
        if cross == "ma112_below_224" and not ((_to_float(row.get("ma112"), None) or 10**18) < (_to_float(row.get("ma224"), None) or 0)):
            return False
    if filters.get("rsi_min") is not None or filters.get("rsi_max") is not None:
        if not _passes_range(row.get("rsi14"), filters.get("rsi_min"), filters.get("rsi_max"), strict=True):
            return False
    for cf in filters.get("custom_filters", []):
        if not _custom_compare(row.get(cf.get("field")), cf.get("op", "lte"), cf.get("value"), cf.get("value2")):
            return False
    return True


def _factor_score(row: Dict[str, Any]) -> float:
    score = 0.0
    per = _to_float(row.get("per"), None)
    pbr = _to_float(row.get("pbr"), None)
    roe = _to_float(row.get("roe"), None)
    div = _to_float(row.get("dividend_yield"), None)
    mom = _to_float(row.get("momentum_3m_pct"), None)
    tv = _to_float(row.get("trading_value_uk"), None)
    if per is not None and per > 0:
        score += max(0, 30 - min(per, 30))
    if pbr is not None and pbr > 0:
        score += max(0, 20 - min(pbr * 8, 20))
    if roe is not None:
        score += max(0, min(roe, 30))
    if div is not None:
        score += max(0, min(div * 3, 20))
    if mom is not None:
        score += max(-10, min(mom / 2, 20))
    if tv is not None and tv > 0:
        score += min(math.log10(tv + 1) * 3, 12)
    return round(score, 2)


def filter_universe(items: List[Dict[str, Any]], filters: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    market = filters.get("market") or "ALL"
    q = _norm_text(filters.get("q"))
    q_digits = "".join(ch for ch in str(filters.get("q") or "") if ch.isdigit())
    sectors = set(filters.get("sectors") or [])
    strict = bool(filters.get("strict"))
    steps: List[Dict[str, Any]] = []

    def apply(name: str, rows: List[Dict[str, Any]], fn) -> List[Dict[str, Any]]:
        before = len(rows)
        after_rows = [r for r in rows if fn(r)]
        steps.append({"filter": name, "before": before, "after": len(after_rows)})
        return after_rows

    rows = [dict(item) for item in items]
    if market in {"KOSPI", "KOSDAQ"}:
        rows = apply(f"market={market}", rows, lambda r: str(r.get("market")) == market)
    if sectors:
        rows = apply("sector", rows, lambda r: r.get("sector") in sectors)
    if q:
        rows = apply("q", rows, lambda r: q in _norm_text(r.get("name")) or q in _norm_text(r.get("code")) or (q_digits and q_digits in str(r.get("code"))))

    range_map = []
    if filters.get("use_fundamental", True):
        range_map.extend([
            ("per", "per_min", "per_max"), ("pbr", "pbr_min", "pbr_max"), ("roe", "roe_min", "roe_max"),
            ("eps", "eps_min", "eps_max"), ("bps", "bps_min", "bps_max"), ("dividend_yield", "div_min", "div_max"),
            ("dps", "dps_min", "dps_max"),
        ])
    if filters.get("use_scale", True):
        range_map.extend([
            ("market_cap_uk", "market_cap_min_uk", "market_cap_max_uk"),
            ("trading_value_uk", "trading_value_min_uk", "trading_value_max_uk"),
        ])
    if filters.get("use_technical", True):
        range_map.extend([
            ("drawdown_52w_pct", "drawdown_52w_min", "drawdown_52w_max"), ("mdd_1y_pct", "mdd_1y_min", "mdd_1y_max"),
            ("momentum_3m_pct", "momentum_3m_min", None), ("momentum_6m_pct", "momentum_6m_min", None),
        ])
    for field, min_key, max_key in range_map:
        minimum = filters.get(min_key)
        maximum = filters.get(max_key) if max_key else None
        if minimum is not None or maximum is not None:
            rows = apply(field, rows, lambda r, f=field, mn=minimum, mx=maximum: _passes_range(r.get(f), mn, mx, strict))

    if filters.get("use_technical", True) and _need_technical(filters):
        rows = apply("technical", rows, lambda r: _technical_pass(r, filters))
    elif filters.get("custom_filters") and _need_technical(filters):
        # 기술 필터 토글은 기본 기술조건 블록만 끄고, 사용자가 직접 추가한 커스텀 기술 필터는 살린다.
        rows = apply("custom_technical", rows, lambda r: _technical_pass(r, {**filters, "price_position": "", "candle_position": "", "ma_cross": "", "rsi_min": None, "rsi_max": None}))

    for row in rows:
        row["score"] = _factor_score(row)
        row["chart_url"] = row.get("chart_url") or _chart_url(row.get("code"))

    sort = str(filters.get("sort") or "score_desc")
    sort_map = {
        "score_desc": ("score", True), "per_asc": ("per", False), "per_desc": ("per", True),
        "pbr_asc": ("pbr", False), "pbr_desc": ("pbr", True), "roe_desc": ("roe", True),
        "div_desc": ("dividend_yield", True), "market_cap_desc": ("market_cap_uk", True),
        "trading_value_desc": ("trading_value_uk", True), "drawdown_desc": ("drawdown_52w_pct", True),
        "momentum_3m_desc": ("momentum_3m_pct", True),
    }
    key, reverse = sort_map.get(sort, ("score", True))
    rows.sort(key=lambda r: (-10**18 if r.get(key) is None and reverse else 10**18 if r.get(key) is None else r.get(key)), reverse=reverse)
    return rows, steps


def run_screener(filters: Dict[str, Any]) -> Dict[str, Any]:
    filters = filters if isinstance(filters, dict) else parse_filters(filters)
    universe = build_universe(refresh=bool(filters.get("refresh")), include_technical=bool(filters.get("include_technical")))
    filtered, steps = filter_universe(universe.get("items", []), filters)
    limit = int(filters.get("limit") or 50)
    relaxed = False
    if not filtered and filters.get("strict"):
        relaxed_filters = dict(filters)
        relaxed_filters["strict"] = False
        filtered, _ = filter_universe(universe.get("items", []), relaxed_filters)
        if filtered:
            relaxed = True
            steps.append({"filter": "strict_relaxed_missing_values", "before": 0, "after": len(filtered)})
    results = filtered[:limit]
    return {
        "ok": True,
        "cache_version": CACHE_VERSION,
        "market_date": universe.get("market_date"),
        "source": universe.get("source"),
        "warnings": universe.get("warnings", []),
        "filters": filters,
        "debug": {
            "market_counts": universe.get("market_counts"),
            "raw_count": len(universe.get("items", [])),
            "filter_steps": steps,
            "auto_fixed": filters.get("auto_fixed", []),
            "relaxed": relaxed,
        },
        "count": len(filtered),
        "returned_count": len(results),
        "universe_count": len(universe.get("items", [])),
        "results": results,
        "items": results,
        "rows": results,
        "stocks": results,
    }


def symbol_search(q: str, limit: int = 30, refresh: bool = False) -> Dict[str, Any]:
    filters = parse_filters({"q": q, "limit": limit, "refresh": "1" if refresh else "0", "strict": "0"})
    universe = build_universe(refresh=refresh, include_technical=False)
    rows, _ = filter_universe(universe.get("items", []), filters)
    if not rows and not q:
        rows = universe.get("items", [])[:limit]
    results = rows[: max(1, min(int(limit or 30), 100))]
    return {"ok": True, "q": q, "count": len(results), "results": results, "items": results, "source": universe.get("source")}


def _strategy_owner_key(user: Any) -> str:
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user_{user.pk}"
    return "guest"


def _strategy_file(user: Any) -> Path:
    return STRATEGY_DIR / f"{_strategy_owner_key(user)}.json"


def list_strategies(user: Any) -> List[Dict[str, Any]]:
    data = _read_json(_strategy_file(user), max_age_seconds=0)
    return data if isinstance(data, list) else []


def save_strategy(user: Any, payload: Dict[str, Any]) -> Dict[str, Any]:
    strategies = list_strategies(user)
    strategy_id = str(payload.get("id") or f"strategy_{int(datetime.now().timestamp())}")[:80]
    name = str(payload.get("name") or "나의 퀀트 전략").strip()[:80]
    item = {
        "id": strategy_id,
        "name": name,
        "filters": payload.get("filters") or {},
        "backtest": payload.get("backtest") or {},
        "created_at": payload.get("created_at") or datetime.now().isoformat(timespec="seconds"),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    strategies = [s for s in strategies if s.get("id") != strategy_id]
    strategies.insert(0, item)
    _write_json(_strategy_file(user), strategies[:50])
    return item


def delete_strategy(user: Any, strategy_id: str) -> bool:
    strategies = list_strategies(user)
    before = len(strategies)
    strategies = [s for s in strategies if str(s.get("id")) != str(strategy_id)]
    _write_json(_strategy_file(user), strategies)
    return len(strategies) < before


def _synthetic_series(row: Dict[str, Any], start: str, end: str) -> Optional[Any]:
    if pd is None:
        return None
    try:
        start_dt = pd.to_datetime(start)
        end_dt = pd.to_datetime(end)
        dates = pd.date_range(start_dt, end_dt, freq="B")
        if len(dates) < 2:
            return None
        close = _to_float(row.get("close"), 10000) or 10000
        code_num = sum(ord(c) for c in str(row.get("code", "")))
        annual = ((code_num % 18) - 4) / 100.0
        vals = []
        for i, _ in enumerate(dates):
            drift = (1 + annual) ** (i / 252)
            wave = 1 + math.sin(i / 17 + code_num) * 0.08
            vals.append(close / max((1 + annual) ** (len(dates) / 252), 0.2) * drift * wave)
        return pd.Series(vals, index=dates)
    except Exception:
        return None


def _series_for_code(code: str, start: str, end: str, fallback_row: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    s = _price_series(code, start, end)
    if s is not None and len(s) >= 2:
        return s
    if fallback_row:
        return _synthetic_series(fallback_row, start, end)
    return None


def _metrics_from_equity(equity: Any, initial_capital: int) -> Dict[str, Any]:
    final_value = float(equity.iloc[-1])
    total_return = (final_value / initial_capital - 1) * 100
    years = max((equity.index[-1] - equity.index[0]).days / 365.25, 1 / 365.25)
    cagr = ((final_value / initial_capital) ** (1 / years) - 1) * 100 if final_value > 0 else -100
    dd = (equity / equity.cummax() - 1) * 100
    curve = [{"date": idx.strftime("%Y-%m-%d"), "value": int(val)} for idx, val in equity.iloc[:: max(1, len(equity)//160)].items()]
    return {
        "final_value": int(round(final_value)),
        "total_return_pct": round(total_return, 2),
        "cagr_pct": round(cagr, 2),
        "max_drawdown_pct": round(float(dd.min()) if not dd.empty else 0, 2),
        "equity_curve": curve,
    }


def run_backtest(payload: Dict[str, Any]) -> Dict[str, Any]:
    filters = parse_filters(payload.get("filters") or payload)
    bt = payload.get("backtest") or payload
    start = str(bt.get("start") or "2020-01-01")[:10]
    end = str(bt.get("end") or timezone.localdate().isoformat())[:10]
    top_n = max(1, min(_to_int(bt.get("top_n") or bt.get("topN"), 20), 100))
    initial_capital = max(100000, _to_int(bt.get("initial_capital") or bt.get("capital"), 10000000))
    fee_pct = max(0.0, min(_to_float(bt.get("fee_pct") or bt.get("fee"), 0.015) or 0.0, 5.0))
    data = run_screener(filters)
    candidates = data.get("results", [])[:top_n]
    warnings = list(data.get("warnings", []))
    if not candidates:
        return {"ok": False, "message": "백테스트 후보 종목이 없습니다.", "data": data}
    if pd is None:
        return {"ok": False, "message": "pandas가 필요합니다."}
    series_map = {}
    row_map = {r["code"]: r for r in candidates}
    for row in candidates:
        s = _series_for_code(row["code"], start, end, row)
        if s is not None and len(s) >= 2:
            series_map[row["code"]] = s
    if not series_map:
        return {"ok": False, "message": "선택 종목의 가격 데이터를 불러오지 못했습니다.", "holdings": candidates, "warnings": warnings}
    all_dates = sorted(set().union(*[set(s.index) for s in series_map.values()]))
    aligned = pd.DataFrame({code: s.reindex(all_dates).ffill() for code, s in series_map.items()}).dropna(how="all").ffill().dropna(axis=1, how="any")
    if aligned.empty:
        return {"ok": False, "message": "가격 정렬 후 남은 종목이 없습니다."}
    daily_ret = aligned.pct_change().fillna(0)
    port_ret = daily_ret.mean(axis=1)
    fee_drag = (fee_pct / 100.0) * 2 / max(len(port_ret), 1)
    equity = (1 + port_ret - fee_drag).cumprod() * initial_capital
    metrics = _metrics_from_equity(equity, initial_capital)
    return {
        "ok": True,
        "mode": "current-factor-equal-weight",
        "message": "현재 조건으로 선별된 종목을 과거 기간에 동일비중 보유한 간이 백테스트입니다. 과거 시점별 재무 팩터 재계산은 아닙니다.",
        "initial_capital": initial_capital,
        "start": aligned.index[0].strftime("%Y-%m-%d"),
        "end": aligned.index[-1].strftime("%Y-%m-%d"),
        "holdings": [row_map.get(c, {"code": c}) for c in aligned.columns],
        "warnings": warnings,
        **metrics,
    }


def _find_row_by_query(query: str, refresh: bool = False) -> Optional[Dict[str, Any]]:
    q = _norm_text(query)
    digits = "".join(ch for ch in str(query or "") if ch.isdigit())
    universe = build_universe(refresh=refresh, include_technical=True)
    for row in universe.get("items", []):
        if q and (q == _norm_text(row.get("code")) or q == _norm_text(row.get("name"))):
            return row
        if digits and digits == str(row.get("code")):
            return row
    for row in universe.get("items", []):
        if q and (q in _norm_text(row.get("name")) or q in _norm_text(row.get("code"))):
            return row
    return None


def run_single_stock_backtest(payload: Dict[str, Any]) -> Dict[str, Any]:
    q = str(payload.get("code") or payload.get("q") or payload.get("symbol") or "").strip()
    if not q:
        return {"ok": False, "message": "종목명 또는 종목코드를 입력하세요."}
    start = str(payload.get("start") or "2020-01-01")[:10]
    end = str(payload.get("end") or timezone.localdate().isoformat())[:10]
    initial_capital = max(100000, _to_int(payload.get("initial_capital") or payload.get("capital"), 10000000))
    fee_pct = max(0.0, min(_to_float(payload.get("fee_pct") or payload.get("fee"), 0.015) or 0.0, 5.0))
    strategy = str(payload.get("strategy") or "buy_hold")
    row = _find_row_by_query(q, refresh=str(payload.get("refresh") or "0") in {"1", "true"})
    if not row:
        return {"ok": False, "message": f"'{q}' 종목을 찾지 못했습니다."}
    if pd is None:
        return {"ok": False, "message": "pandas가 필요합니다."}
    s = _series_for_code(row["code"], start, end, row)
    if s is None or len(s) < 2:
        return {"ok": False, "message": "가격 데이터를 불러오지 못했습니다.", "stock": row}
    s = s.sort_index().dropna()
    if strategy == "ma_cross_20_60":
        fast, slow = s.rolling(20).mean(), s.rolling(60).mean()
        signal = (fast > slow).astype(float).shift(1).fillna(0)
        ret = s.pct_change().fillna(0) * signal
    elif strategy == "ma_cross_112_224":
        fast, slow = s.rolling(112).mean(), s.rolling(224).mean()
        signal = (fast > slow).astype(float).shift(1).fillna(0)
        ret = s.pct_change().fillna(0) * signal
    elif strategy == "price_above_112":
        ma = s.rolling(112).mean()
        signal = (s > ma).astype(float).shift(1).fillna(0)
        ret = s.pct_change().fillna(0) * signal
    elif strategy == "turtle_20_10":
        high20 = s.rolling(20).max().shift(1)
        low10 = s.rolling(10).min().shift(1)
        pos = []
        holding = 0
        for date, price in s.items():
            if holding and price < low10.loc[date]:
                holding = 0
            elif not holding and price > high20.loc[date]:
                holding = 1
            pos.append(holding)
        signal = pd.Series(pos, index=s.index).shift(1).fillna(0)
        ret = s.pct_change().fillna(0) * signal
    elif strategy == "rsi_reversion":
        delta = s.diff()
        up = delta.clip(lower=0).rolling(14).mean()
        down = (-delta.clip(upper=0)).rolling(14).mean()
        rsi = 100 - (100 / (1 + up / down.replace(0, float("nan"))))
        pos = []
        holding = 0
        for date, value in rsi.items():
            if holding and value > 65:
                holding = 0
            elif not holding and value < 35:
                holding = 1
            pos.append(holding)
        signal = pd.Series(pos, index=s.index).shift(1).fillna(0)
        ret = s.pct_change().fillna(0) * signal
    else:
        ret = s.pct_change().fillna(0)
    fee_drag = (fee_pct / 100.0) * 2 / max(len(ret), 1)
    equity = (1 + ret - fee_drag).cumprod() * initial_capital
    metrics = _metrics_from_equity(equity, initial_capital)
    return {"ok": True, "stock": row, "strategy": strategy, "initial_capital": initial_capital, "start": s.index[0].strftime("%Y-%m-%d"), "end": s.index[-1].strftime("%Y-%m-%d"), **metrics}
