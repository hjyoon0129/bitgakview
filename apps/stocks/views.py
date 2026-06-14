from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
import ast
import json
import re

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.db import DatabaseError
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
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

from .models import (
    ChartDrawingState,
    ChartIndicatorState,
    ChartPiramidState,
    PremiumAccess,
    PremiumApplication,
    StockSymbol,
    UserStockStorage,
)


# -----------------------------------------------------------------------------
# 마스터 전용 메뉴 권한
# -----------------------------------------------------------------------------
def _is_quant_master_user(user):
    """
    구글 소셜 로그인 계정은 username이 hjyoon0129가 아닐 수 있어서
    username, email, socialaccount uid/extra_data.email까지 함께 검사합니다.
    """
    try:
        if not user or not user.is_authenticated:
            return False
    except Exception:
        return False

    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True

    candidates = []
    for attr in ("username", "email", "first_name", "last_name"):
        value = getattr(user, attr, "")
        if value:
            candidates.append(str(value))

    try:
        full_name = user.get_full_name()
        if full_name:
            candidates.append(str(full_name))
    except Exception:
        pass

    try:
        social_manager = getattr(user, "socialaccount_set", None)
        if social_manager is not None:
            for account in social_manager.all():
                for attr in ("uid", "provider"):
                    value = getattr(account, attr, "")
                    if value:
                        candidates.append(str(value))
                extra = getattr(account, "extra_data", None) or {}
                if isinstance(extra, dict):
                    for key in ("email", "login", "name", "given_name", "family_name"):
                        value = extra.get(key)
                        if value:
                            candidates.append(str(value))
    except Exception:
        pass

    normalized = [value.strip().lower() for value in candidates if value]
    return any("hjyoon0129" in value for value in normalized)




# -----------------------------------------------------------------------------
# 초기 가입자 100명 프리미엄 신청/승인 흐름
# -----------------------------------------------------------------------------
PREMIUM_FREE_LIMIT = 100


def _empty_premium_context():
    return {
        "application": None,
        "access": None,
        "status": "none",
        "status_label": "미신청",
        "admin_reply": "",
        "approved_until": None,
        "is_premium_active": False,
        "approved_count": 0,
        "pending_count": 0,
        "remaining_count": PREMIUM_FREE_LIMIT,
        "progress_percent": 0,
    }


def _get_premium_context(user=None):
    """홈/가격/신청 화면에서 공통으로 쓰는 프리미엄 신청 상태.

    새 모델을 추가한 직후 migration 전에도 페이지가 죽지 않도록 DB 오류는 안전하게 무시합니다.
    """
    context = _empty_premium_context()
    now = timezone.now()

    try:
        approved_count = PremiumApplication.objects.filter(
            status=PremiumApplication.STATUS_APPROVED,
            plan=PremiumApplication.PLAN_FREE_1Y,
        ).count()
        pending_count = PremiumApplication.objects.filter(
            status=PremiumApplication.STATUS_PENDING,
            plan=PremiumApplication.PLAN_FREE_1Y,
        ).count()
    except Exception:
        return context

    context["approved_count"] = approved_count
    context["pending_count"] = pending_count
    context["remaining_count"] = max(PREMIUM_FREE_LIMIT - approved_count, 0)
    context["progress_percent"] = max(0, min(100, round((approved_count / PREMIUM_FREE_LIMIT) * 100)))

    try:
        if user and user.is_authenticated:
            application = PremiumApplication.objects.filter(user=user).first()
            access = PremiumAccess.objects.filter(user=user).first()
            context["application"] = application
            context["access"] = access
            if application:
                context["status"] = application.status
                context["status_label"] = application.get_status_display()
                context["admin_reply"] = application.admin_reply or ""
                context["approved_until"] = application.approved_until
            if access:
                context["is_premium_active"] = access.is_valid(now)
                if access.ends_at:
                    context["approved_until"] = access.ends_at
                if not context["admin_reply"] and access.note:
                    context["admin_reply"] = access.note
    except Exception:
        pass

    return context


def _premium_template_context(request, **extra):
    premium = _get_premium_context(request.user)
    context = {
        "premium_context": premium,
        "premium_application": premium.get("application"),
        "premium_access": premium.get("access"),
        "premium_status": premium.get("status"),
        "premium_status_label": premium.get("status_label"),
        "premium_admin_reply": premium.get("admin_reply"),
        "premium_approved_until": premium.get("approved_until"),
        "premium_is_active": premium.get("is_premium_active"),
        "premium_approved_count": premium.get("approved_count"),
        "premium_pending_count": premium.get("pending_count"),
        "premium_remaining_count": premium.get("remaining_count"),
        "premium_progress_percent": premium.get("progress_percent"),
        "premium_free_limit": PREMIUM_FREE_LIMIT,
    }
    context.update(extra)
    return context


@login_required
@require_http_methods(["GET", "POST"])
def premium_apply_view(request):
    """로그인 사용자가 초기 100명 프리미엄 1년 무료 혜택을 신청하는 화면/처리."""
    if request.method == "POST":
        try:
            application, created = PremiumApplication.objects.get_or_create(
                user=request.user,
                defaults={
                    "plan": PremiumApplication.PLAN_FREE_1Y,
                    "status": PremiumApplication.STATUS_PENDING,
                    "source": request.POST.get("source") or request.GET.get("source") or "premium_apply",
                    "user_agent": request.META.get("HTTP_USER_AGENT", "")[:3000],
                    "user_message": (request.POST.get("message") or "").strip(),
                },
            )
        except DatabaseError:
            return render(request, "stocks/premium_status.html", _premium_template_context(
                request,
                db_not_ready=True,
                page_message="프리미엄 신청 테이블이 아직 준비되지 않았습니다. 관리자에게 migration 적용을 요청해주세요.",
            ), status=503)

        if application.status == PremiumApplication.STATUS_APPROVED:
            return redirect("stocks:premium_choice")

        if not created:
            # 반려/취소 후 다시 신청하면 승인 대기로 되돌립니다.
            if application.status in {PremiumApplication.STATUS_REJECTED, PremiumApplication.STATUS_CANCELLED}:
                application.status = PremiumApplication.STATUS_PENDING
                application.source = request.POST.get("source") or application.source or "premium_reapply"
                application.user_agent = request.META.get("HTTP_USER_AGENT", "")[:3000]
                if request.POST.get("message"):
                    application.user_message = request.POST.get("message", "").strip()
                application.admin_reply = ""
                application.processed_at = None
                application.processed_by = None
                application.approved_until = None
                application.save()

        return redirect(f"{reverse('stocks:premium_status')}?submitted=1")

    return render(request, "stocks/premium_status.html", _premium_template_context(request))


@login_required
def premium_status_view(request):
    return render(request, "stocks/premium_status.html", _premium_template_context(request))


@login_required
def premium_choice_view(request):
    premium = _get_premium_context(request.user)
    if not premium.get("is_premium_active") and premium.get("status") != PremiumApplication.STATUS_APPROVED:
        return render(request, "stocks/premium_status.html", _premium_template_context(
            request,
            page_message="관리자 승인 후 프리미엄 선택 화면을 사용할 수 있습니다.",
        ))
    return render(request, "stocks/premium_choice.html", _premium_template_context(request))


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


# -----------------------------------------------------------------------------
# 해외 대표 주식 / ETF 심볼
# -----------------------------------------------------------------------------
# StockSymbol DB에는 국내 종목만 들어있는 경우가 많아서, 엔비디아·테슬라·QQQ·SCHD 같은
# 해외 주요 주식/ETF는 내부 코드 그대로 /stocks/NVDA/ 형태로 열고 Yahoo Finance에서
# 차트 데이터를 가져옵니다. 검색어는 한글 별칭까지 함께 매칭합니다.
GLOBAL_YAHOO_SYMBOLS = {
    "NVDA": {"code": "NVDA", "name": "NVIDIA", "display_name": "엔비디아", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "NVDA", "aliases": ["엔비디아", "nvidia", "nvda", "젠슨황", "gpu", "ai 반도체"], "search_rank": 4890, "price_unit": "USD"},
    "AAPL": {"code": "AAPL", "name": "Apple", "display_name": "애플", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "AAPL", "aliases": ["애플", "apple", "aapl", "아이폰"], "search_rank": 4880, "price_unit": "USD"},
    "MSFT": {"code": "MSFT", "name": "Microsoft", "display_name": "마이크로소프트", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "MSFT", "aliases": ["마이크로소프트", "마소", "microsoft", "msft"], "search_rank": 4870, "price_unit": "USD"},
    "AMZN": {"code": "AMZN", "name": "Amazon", "display_name": "아마존", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "AMZN", "aliases": ["아마존", "amazon", "amzn"], "search_rank": 4860, "price_unit": "USD"},
    "GOOGL": {"code": "GOOGL", "name": "Alphabet Class A", "display_name": "알파벳 A", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "GOOGL", "aliases": ["구글", "알파벳", "google", "alphabet", "googl", "goog"], "search_rank": 4850, "price_unit": "USD"},
    "GOOG": {"code": "GOOG", "name": "Alphabet Class C", "display_name": "알파벳 C", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "GOOG", "aliases": ["구글c", "알파벳c", "google c", "goog"], "search_rank": 4845, "price_unit": "USD"},
    "META": {"code": "META", "name": "Meta Platforms", "display_name": "메타", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "META", "aliases": ["메타", "페이스북", "facebook", "meta"], "search_rank": 4840, "price_unit": "USD"},
    "TSLA": {"code": "TSLA", "name": "Tesla", "display_name": "테슬라", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "TSLA", "aliases": ["테슬라", "tesla", "tsla", "일론머스크"], "search_rank": 4830, "price_unit": "USD"},
    "AMD": {"code": "AMD", "name": "Advanced Micro Devices", "display_name": "AMD", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "AMD", "aliases": ["amd", "에이엠디", "어드밴스드마이크로디바이시스"], "search_rank": 4820, "price_unit": "USD"},
    "AVGO": {"code": "AVGO", "name": "Broadcom", "display_name": "브로드컴", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "AVGO", "aliases": ["브로드컴", "broadcom", "avgo"], "search_rank": 4810, "price_unit": "USD"},
    "TSM": {"code": "TSM", "name": "Taiwan Semiconductor", "display_name": "TSMC", "market": "NYSE", "asset_type": "us-stock", "yahoo_symbol": "TSM", "aliases": ["tsmc", "티에스엠씨", "대만반도체", "tsm"], "search_rank": 4805, "price_unit": "USD"},
    "ASML": {"code": "ASML", "name": "ASML Holding", "display_name": "ASML", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "ASML", "aliases": ["asml", "에이에스엠엘", "노광장비"], "search_rank": 4800, "price_unit": "USD"},
    "MU": {"code": "MU", "name": "Micron Technology", "display_name": "마이크론", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "MU", "aliases": ["마이크론", "micron", "mu"], "search_rank": 4790, "price_unit": "USD"},
    "INTC": {"code": "INTC", "name": "Intel", "display_name": "인텔", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "INTC", "aliases": ["인텔", "intel", "intc"], "search_rank": 4780, "price_unit": "USD"},
    "NFLX": {"code": "NFLX", "name": "Netflix", "display_name": "넷플릭스", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "NFLX", "aliases": ["넷플릭스", "netflix", "nflx"], "search_rank": 4770, "price_unit": "USD"},
    "PLTR": {"code": "PLTR", "name": "Palantir", "display_name": "팔란티어", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "PLTR", "aliases": ["팔란티어", "palantir", "pltr"], "search_rank": 4760, "price_unit": "USD"},
    "COIN": {"code": "COIN", "name": "Coinbase", "display_name": "코인베이스", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "COIN", "aliases": ["코인베이스", "coinbase", "coin"], "search_rank": 4750, "price_unit": "USD"},
    "MSTR": {"code": "MSTR", "name": "MicroStrategy", "display_name": "마이크로스트래티지", "market": "NASDAQ", "asset_type": "us-stock", "yahoo_symbol": "MSTR", "aliases": ["마이크로스트래티지", "마이크로스트레티지", "microstrategy", "mstr"], "search_rank": 4740, "price_unit": "USD"},
    "BRK-B": {"code": "BRK-B", "name": "Berkshire Hathaway Class B", "display_name": "버크셔 해서웨이 B", "market": "NYSE", "asset_type": "us-stock", "yahoo_symbol": "BRK-B", "aliases": ["버크셔", "버크셔해서웨이", "berkshire", "brk.b", "brkb", "brk-b"], "search_rank": 4730, "price_unit": "USD"},

    "SPY": {"code": "SPY", "name": "SPDR S&P 500 ETF", "display_name": "SPY S&P500 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "SPY", "aliases": ["spy", "s&p500 etf", "s&p 500 etf", "미국 s&p500 etf", "스파이"], "search_rank": 4690, "price_unit": "USD", "is_derivative": True},
    "VOO": {"code": "VOO", "name": "Vanguard S&P 500 ETF", "display_name": "VOO S&P500 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "VOO", "aliases": ["voo", "뱅가드 s&p500", "s&p500 etf"], "search_rank": 4680, "price_unit": "USD", "is_derivative": True},
    "IVV": {"code": "IVV", "name": "iShares Core S&P 500 ETF", "display_name": "IVV S&P500 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "IVV", "aliases": ["ivv", "아이셰어즈 s&p500", "s&p500 etf"], "search_rank": 4675, "price_unit": "USD", "is_derivative": True},
    "QQQ": {"code": "QQQ", "name": "Invesco QQQ Trust", "display_name": "QQQ 나스닥100 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "QQQ", "aliases": ["qqq", "나스닥100 etf", "나스닥 etf", "인베스코 qqq"], "search_rank": 4670, "price_unit": "USD", "is_derivative": True},
    "TQQQ": {"code": "TQQQ", "name": "ProShares UltraPro QQQ", "display_name": "TQQQ 나스닥100 3배", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "TQQQ", "aliases": ["tqqq", "나스닥 3배", "나스닥100 3배", "qqq 3배"], "search_rank": 4660, "price_unit": "USD", "is_derivative": True},
    "SQQQ": {"code": "SQQQ", "name": "ProShares UltraPro Short QQQ", "display_name": "SQQQ 나스닥100 인버스 3배", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "SQQQ", "aliases": ["sqqq", "나스닥 인버스 3배", "나스닥 숏", "qqq 인버스"], "search_rank": 4655, "price_unit": "USD", "is_derivative": True},
    "SOXL": {"code": "SOXL", "name": "Direxion Daily Semiconductor Bull 3X", "display_name": "SOXL 반도체 3배", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "SOXL", "aliases": ["soxl", "반도체 3배", "필라델피아 반도체 3배", "반도체 레버리지"], "search_rank": 4650, "price_unit": "USD", "is_derivative": True},
    "SOXS": {"code": "SOXS", "name": "Direxion Daily Semiconductor Bear 3X", "display_name": "SOXS 반도체 인버스 3배", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "SOXS", "aliases": ["soxs", "반도체 인버스", "반도체 숏", "필라델피아 반도체 인버스"], "search_rank": 4645, "price_unit": "USD", "is_derivative": True},
    "SMH": {"code": "SMH", "name": "VanEck Semiconductor ETF", "display_name": "SMH 반도체 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "SMH", "aliases": ["smh", "반도체 etf", "vaneck semiconductor"], "search_rank": 4640, "price_unit": "USD", "is_derivative": True},
    "SOXX": {"code": "SOXX", "name": "iShares Semiconductor ETF", "display_name": "SOXX 반도체 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "SOXX", "aliases": ["soxx", "반도체 etf", "ishares semiconductor"], "search_rank": 4635, "price_unit": "USD", "is_derivative": True},
    "SCHD": {"code": "SCHD", "name": "Schwab US Dividend Equity ETF", "display_name": "SCHD 미국 배당 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "SCHD", "aliases": ["schd", "슈드", "미국배당", "미국 배당 etf", "배당성장"], "search_rank": 4630, "price_unit": "USD", "is_derivative": True},
    "JEPI": {"code": "JEPI", "name": "JPMorgan Equity Premium Income ETF", "display_name": "JEPI 월배당 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "JEPI", "aliases": ["jepi", "제피", "월배당", "커버드콜", "인컴 etf"], "search_rank": 4625, "price_unit": "USD", "is_derivative": True},
    "JEPQ": {"code": "JEPQ", "name": "JPMorgan Nasdaq Equity Premium Income ETF", "display_name": "JEPQ 나스닥 월배당 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "JEPQ", "aliases": ["jepq", "제프큐", "나스닥 월배당", "나스닥 커버드콜"], "search_rank": 4620, "price_unit": "USD", "is_derivative": True},
    "VTI": {"code": "VTI", "name": "Vanguard Total Stock Market ETF", "display_name": "VTI 미국 전체시장 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "VTI", "aliases": ["vti", "미국 전체시장", "total stock market"], "search_rank": 4615, "price_unit": "USD", "is_derivative": True},
    "VT": {"code": "VT", "name": "Vanguard Total World Stock ETF", "display_name": "VT 전세계 주식 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "VT", "aliases": ["vt", "전세계 etf", "글로벌 주식 etf"], "search_rank": 4610, "price_unit": "USD", "is_derivative": True},
    "DIA": {"code": "DIA", "name": "SPDR Dow Jones Industrial Average ETF", "display_name": "DIA 다우 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "DIA", "aliases": ["dia", "다우 etf", "dow etf"], "search_rank": 4605, "price_unit": "USD", "is_derivative": True},
    "IWM": {"code": "IWM", "name": "iShares Russell 2000 ETF", "display_name": "IWM 러셀2000 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "IWM", "aliases": ["iwm", "러셀2000", "russell 2000 etf", "소형주 etf"], "search_rank": 4600, "price_unit": "USD", "is_derivative": True},
    "VGT": {"code": "VGT", "name": "Vanguard Information Technology ETF", "display_name": "VGT 미국 기술주 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "VGT", "aliases": ["vgt", "기술주 etf", "미국 기술주"], "search_rank": 4595, "price_unit": "USD", "is_derivative": True},
    "XLK": {"code": "XLK", "name": "Technology Select Sector SPDR Fund", "display_name": "XLK 기술 섹터 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "XLK", "aliases": ["xlk", "테크 etf", "기술 섹터"], "search_rank": 4590, "price_unit": "USD", "is_derivative": True},
    "XLF": {"code": "XLF", "name": "Financial Select Sector SPDR Fund", "display_name": "XLF 금융 섹터 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "XLF", "aliases": ["xlf", "금융 etf", "은행 etf"], "search_rank": 4585, "price_unit": "USD", "is_derivative": True},
    "XLE": {"code": "XLE", "name": "Energy Select Sector SPDR Fund", "display_name": "XLE 에너지 섹터 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "XLE", "aliases": ["xle", "에너지 etf", "원유 etf"], "search_rank": 4580, "price_unit": "USD", "is_derivative": True},
    "TLT": {"code": "TLT", "name": "iShares 20+ Year Treasury Bond ETF", "display_name": "TLT 미국 장기채 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "TLT", "aliases": ["tlt", "미국 장기채", "장기국채", "채권 etf"], "search_rank": 4575, "price_unit": "USD", "is_derivative": True},
    "GLD": {"code": "GLD", "name": "SPDR Gold Shares", "display_name": "GLD 금 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "GLD", "aliases": ["gld", "금 etf", "gold etf"], "search_rank": 4570, "price_unit": "USD", "is_derivative": True},
    "SLV": {"code": "SLV", "name": "iShares Silver Trust", "display_name": "SLV 은 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "SLV", "aliases": ["slv", "은 etf", "silver etf"], "search_rank": 4565, "price_unit": "USD", "is_derivative": True},
    "IBIT": {"code": "IBIT", "name": "iShares Bitcoin Trust ETF", "display_name": "IBIT 비트코인 ETF", "market": "NASDAQ", "asset_type": "us-etf", "yahoo_symbol": "IBIT", "aliases": ["ibit", "비트코인 etf", "bitcoin etf"], "search_rank": 4560, "price_unit": "USD", "is_derivative": True},
    "ARKK": {"code": "ARKK", "name": "ARK Innovation ETF", "display_name": "ARKK 혁신 ETF", "market": "NYSEARCA", "asset_type": "us-etf", "yahoo_symbol": "ARKK", "aliases": ["arkk", "아크", "캐시우드", "혁신 etf"], "search_rank": 4555, "price_unit": "USD", "is_derivative": True},
}


def _all_global_symbol_items():
    merged = {}
    merged.update(GLOBAL_INDEX_SYMBOLS)
    merged.update(GLOBAL_YAHOO_SYMBOLS)
    return merged


def _global_symbol_item(code):
    code = _normalize_asset_code(code)
    if code in GLOBAL_INDEX_SYMBOLS:
        return GLOBAL_INDEX_SYMBOLS[code]
    if code in GLOBAL_YAHOO_SYMBOLS:
        return GLOBAL_YAHOO_SYMBOLS[code]
    if _looks_like_yahoo_asset_code(code):
        return {
            "code": code,
            "name": code,
            "display_name": code,
            "market": "US",
            "asset_type": "us-stock",
            "yahoo_symbol": code,
            "yahoo_symbols": [code],
            "aliases": [code.lower()],
            "search_rank": 0,
            "price_unit": "USD",
        }
    return None


def _global_symbol_display_name(item):
    return item.get("display_name") or item.get("name") or item.get("code") or ""


def _looks_like_yahoo_asset_code(code):
    value = str(code or "").strip().upper()
    if not value or value in GLOBAL_INDEX_SYMBOLS:
        return False
    if re.fullmatch(r"[A-Z][A-Z0-9]{0,9}(-[A-Z0-9]{1,4})?", value):
        return True
    return False



def _global_fallback_payloads():
    result = []
    for item in _all_global_symbol_items().values():
        result.append({
            "code": item["code"],
            "name": _global_symbol_display_name(item),
            "market": item.get("market", "US"),
            "aliases": item.get("aliases", []),
            "search_rank": item.get("search_rank", 0),
            "is_derivative": bool(item.get("is_derivative") or item.get("asset_type") in {"future", "us-etf"}),
            "asset_type": item.get("asset_type", "index"),
            "yahoo_symbol": item.get("yahoo_symbol", ""),
            "price_unit": item.get("price_unit", "pt"),
        })
    return result


def _build_global_alias_map():
    aliases = {}
    for code, item in _all_global_symbol_items().items():
        keys = [code, item.get("yahoo_symbol", ""), item.get("name", ""), item.get("display_name", "")] + item.get("aliases", [])
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
        "BRKB": "BRK-B",
        "BRK.B": "BRK-B",
        "BRK-B": "BRK-B",
        "GOOGLE": "GOOGL",
        "ALPHABET": "GOOGL",
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
    """KRX 6자리 종목코드, 국내 지수, 해외 Yahoo 심볼을 함께 정규화합니다."""
    raw = str(code or "").strip()

    if not raw:
        return ""

    upper = raw.upper()
    compact = re.sub(r"[\s_:\-./]+", "", upper).replace("&", "")

    if upper in GLOBAL_INDEX_ALIAS_MAP:
        return GLOBAL_INDEX_ALIAS_MAP[upper]
    if compact in GLOBAL_INDEX_ALIAS_MAP:
        return GLOBAL_INDEX_ALIAS_MAP[compact]

    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return _clean_code(raw)

    normalized = upper.replace(".", "-")
    if re.fullmatch(r"[A-Z][A-Z0-9]{0,9}(-[A-Z0-9]{1,4})?", normalized):
        return normalized

    return ""


def _is_global_asset_code(code):
    asset_code = _normalize_asset_code(code)
    return bool(asset_code and _global_symbol_item(asset_code))


def _empty_ohlcv():
    return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])


def _is_derivative_name(name):
    text = str(name or "").upper().replace(" ", "")
    return any(keyword.upper().replace(" ", "") in text for keyword in DERIVATIVE_KEYWORDS)



def _krx_etf_aliases(name):
    text = str(name or "").strip()
    aliases = []
    compact = text.replace(" ", "")
    if compact and compact != text:
        aliases.append(compact)

    brand_map = {
        "KODEX": ["코덱스", "삼성자산운용"],
        "TIGER": ["타이거", "미래에셋"],
        "ACE": ["에이스", "한국투자신탁운용", "한투"],
        "SOL": ["쏠", "신한자산운용"],
        "KBSTAR": ["케이비스타", "KB자산운용"],
        "RISE": ["라이즈", "KB자산운용"],
        "ARIRANG": ["아리랑", "한화자산운용"],
        "HANARO": ["하나로", "NH아문디"],
        "TIMEFOLIO": ["타임폴리오"],
        "KOSEF": ["코세프", "키움"],
        "PLUS": ["플러스", "한화"],
        "WON": ["원", "우리자산운용"],
    }
    upper = text.upper()
    for brand, values in brand_map.items():
        if upper.startswith(brand):
            aliases.extend(values)
            aliases.append(brand.lower())
            break

    for token in ["ETF", "ETN", "미국", "나스닥", "S&P500", "반도체", "2차전지", "방산", "조선", "은행", "금융", "배당", "월배당", "커버드콜", "채권", "국채", "인버스", "레버리지"]:
        if token.upper() in upper:
            aliases.append(token)

    # 중복 제거
    result = []
    for alias in aliases:
        alias = str(alias or "").strip()
        if alias and alias not in result:
            result.append(alias)
    return result


def _get_krx_etf_payloads():
    """오늘 기준 KRX ETF 전체 목록을 pykrx에서 실시간으로 가져와 검색 fallback으로 사용합니다."""
    today_key = datetime.today().strftime("%Y%m%d")
    cache_key = f"stocks:krx-etf-payloads:v3:{today_key}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    payload = []
    try:
        try:
            tickers = krx_stock.get_etf_ticker_list(today_key)
        except TypeError:
            tickers = krx_stock.get_etf_ticker_list()
        except Exception:
            tickers = krx_stock.get_etf_ticker_list()

        for ticker in tickers or []:
            code = _clean_code(ticker)
            if not code:
                continue
            try:
                name = krx_stock.get_etf_ticker_name(code)
            except Exception:
                name = code
            name = str(name or code).strip()
            payload.append({
                "code": code,
                "name": name,
                "market": "ETF-KR",
                "href": _safe_reverse_stock_detail(code),
                "aliases": _krx_etf_aliases(name),
                "search_rank": 620,
                "is_derivative": True,
                "asset_type": "etf",
                "price_unit": "원",
            })
    except Exception:
        payload = []

    cache.set(cache_key, payload, 60 * 60 * 6)
    return payload


def _get_krx_etf_payload_by_code(code):
    code = _clean_code(code)
    if not code:
        return None
    for item in _get_krx_etf_payloads():
        if item.get("code") == code:
            return item
    return None


def _query_krx_etf_payloads(q, limit=40):
    q = _normalize_search_text(q)
    q_digits = "".join(ch for ch in q if ch.isdigit())
    if not q and not q_digits:
        return []

    matched = []
    for item in _get_krx_etf_payloads():
        target = _normalize_search_text(
            " ".join([
                item.get("name", ""),
                item.get("code", ""),
                item.get("market", ""),
                item.get("asset_type", ""),
                "국내ETF ETF exchange traded fund",
                " ".join(item.get("aliases", [])),
            ])
        )
        if q in target or (q_digits and q_digits in str(item.get("code", ""))):
            matched.append(item)

    matched.sort(key=lambda item: int(item.get("search_rank") or 0), reverse=True)
    return matched[: max(1, min(int(limit or 40), 120))]


def _fallback_stock(code):
    asset_code = _normalize_asset_code(code)

    item = _global_symbol_item(asset_code)
    if item:
        return SimpleNamespace(
            code=item["code"],
            name=_global_symbol_display_name(item),
            market=item.get("market", "US"),
            asset_type=item.get("asset_type", "us-stock"),
            yahoo_symbol=item.get("yahoo_symbol", item.get("code", "")),
            price_unit=item.get("price_unit", "USD"),
        )

    code = _clean_code(asset_code or code)
    etf_item = _get_krx_etf_payload_by_code(code)
    if etf_item:
        return SimpleNamespace(code=etf_item["code"], name=etf_item["name"], market=etf_item["market"], asset_type="etf")

    item = FALLBACK_BY_CODE.get(code)

    if item:
        return SimpleNamespace(code=item["code"], name=item["name"], market=item["market"])

    return SimpleNamespace(code=code, name=code or "알 수 없는 종목", market="KRX")


def _get_stock(code):
    asset_code = _normalize_asset_code(code)

    if asset_code and _global_symbol_item(asset_code):
        return _fallback_stock(asset_code)

    code = _clean_code(asset_code or code)
    obj = StockSymbol.objects.only("code", "name", "market").filter(code=code).first()

    if obj:
        return obj

    etf_item = _get_krx_etf_payload_by_code(code)
    if etf_item:
        return SimpleNamespace(code=etf_item["code"], name=etf_item["name"], market=etf_item["market"], asset_type="etf")

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

    global_item = _global_symbol_item(code)
    if global_item:
        return {
            "code": global_item["code"],
            "name": _global_symbol_display_name(global_item),
            "market": global_item.get("market", "US"),
            "aliases": global_item.get("aliases", []),
            "href": _safe_reverse_stock_detail(global_item["code"]),
            "search_rank": global_item.get("search_rank", 0),
            "is_derivative": bool(global_item.get("is_derivative") or global_item.get("asset_type") in {"future", "us-etf"}),
            "asset_type": global_item.get("asset_type", "us-stock"),
            "yahoo_symbol": global_item.get("yahoo_symbol", ""),
            "price_unit": global_item.get("price_unit", "USD"),
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
                "is_derivative": bool(item.get("is_derivative") or _is_derivative_name(item["name"])),
                "asset_type": item.get("asset_type", "stock"),
                "yahoo_symbol": item.get("yahoo_symbol", ""),
                "price_unit": item.get("price_unit", "원"),
            }
        )

    return result


def _get_all_stocks_payload():
    """
    전체 종목 payload 생성은 DB 전체를 순회하므로 홈 화면에서 매번 호출하면 느려진다.
    필요할 때만 사용하고, 기본 홈 렌더링에서는 인기/기본 종목만 내려준다.
    """
    payload = _global_fallback_payloads()
    qs = StockSymbol.objects.only("code", "name", "market").all().order_by("market", "name", "code")

    for stock_obj in qs.iterator(chunk_size=1000):
        item = _stock_to_payload(stock_obj)

        if item["code"] and item["name"]:
            payload.append(item)

    existing_codes = {item["code"] for item in payload}

    for item in _get_krx_etf_payloads():
        if item["code"] not in existing_codes:
            payload.append(item)
            existing_codes.add(item["code"])

    for item in _fallback_payloads():
        if item["code"] not in existing_codes:
            payload.append(item)
            existing_codes.add(item["code"])

    return payload


def _get_total_stock_count_cached():
    cache_key = "stocks:total_symbol_count:v2"
    cached = cache.get(cache_key)

    if cached is not None:
        return cached

    try:
        value = StockSymbol.objects.count() + len(_get_krx_etf_payloads()) + len(_global_fallback_payloads())
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
            + str(item.get("market", "")).lower().replace(" ", "")
            + " "
            + str(item.get("asset_type", "")).lower().replace(" ", "")
            + " "
            + " ".join(item.get("aliases", [])).lower().replace(" ", "")
        )

        if q in target or (q_digits and q_digits in item["code"]):
            matched.append(item)

    for item in _query_krx_etf_payloads(q, limit=80):
        if item.get("code") not in {x.get("code") for x in matched}:
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
        qs = StockSymbol.objects.only("code", "name", "market").filter(filters).order_by("market", "name", "code")[:limit]
        for stock_obj in qs:
            item = _stock_to_payload(stock_obj)
            if item["code"] and item["code"] not in seen_codes:
                payload.append(item)
                seen_codes.add(item["code"])
    except Exception:
        pass

    for item in _query_krx_etf_payloads(q, limit=limit):
        if item["code"] not in seen_codes:
            payload.append(item)
            seen_codes.add(item["code"])
        if len(payload) >= limit:
            break

    for item in _query_fallback_payloads(q):
        if item["code"] not in seen_codes:
            payload.append(item)
            seen_codes.add(item["code"])
        if len(payload) >= limit:
            break

    def score(item):
        text = _normalize_search_text(item.get("name"))
        code = str(item.get("code") or "")
        alias_text = _normalize_search_text(" ".join(item.get("aliases") or []))
        market_text = _normalize_search_text(item.get("market"))
        query = _normalize_search_text(q)
        rank = int(item.get("search_rank") or 0)

        if code.upper() == str(q or "").strip().upper() or code == q_digits or text == query:
            return 100000 + rank
        if q_digits and code.startswith(q_digits):
            return 80000 + rank
        if text.startswith(query) or alias_text.startswith(query):
            return 70000 + rank
        if query and (query in text or query in alias_text or query in market_text):
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
        _premium_template_context(
            request,
            q=q,
            stocks=stocks,
            total_stock_count=total_stock_count,
            all_stocks_payload=initial_payload,
            stock_search_api_url="/stocks/api/search/",
            market_temperature_lazy=True,
            lite=lite,
            is_quant_master=_is_quant_master_user(request.user),
        ),
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
    item = _global_symbol_item(asset_code)

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
        base_df = _fetch_yahoo_chart_ohlcv(item.get("yahoo_symbol") or item.get("code"), effective_range_key, interval, item=item)
        if intraday_requested:
            chart_df = _aggregate_intraday_interval(base_df, interval)
            intraday_source_used = not chart_df.empty
        else:
            daily_interval = _daily_interval_from_display_interval(interval)
            chart_df = _aggregate_interval(base_df, daily_interval)
        source = f"Yahoo Finance chart API:{item.get('yahoo_symbol') or item.get('code')}"
        provider = "yahoo-finance"

    chart_df = _apply_visible_range(chart_df, effective_range_key)

    if chart_df.empty:
        return {
            "ok": False,
            "message": f"{_global_symbol_display_name(item)} 데이터를 불러오지 못했습니다. pykrx/Yahoo Finance 응답을 확인하세요.",
            "code": item["code"],
            "name": _global_symbol_display_name(item),
            "market": item.get("market", "US"),
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
        "name": _global_symbol_display_name(item),
        "market": item.get("market", "US"),
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

    if code and _global_symbol_item(code):
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

    if asset_code and _global_symbol_item(asset_code):
        # 대표지수/해외주식/해외ETF는 외부 Yahoo 호출이 체감 병목입니다.
        if intraday:
            return 60 * 20
        return 60 * 60 * 4

    if intraday:
        return 60 * 10         # 국내 개별종목 시간봉: 10분 캐시
    return 60 * 30             # 국내 개별종목 일/주/월봉: 30분 캐시



def _request_chart_params(request, default_code=""):
    """프론트 차트 요청 파라미터를 한 곳에서 정리합니다."""
    code = (
        request.GET.get("code")
        or request.GET.get("symbol")
        or request.GET.get("stock_code")
        or default_code
        or ""
    )
    code = _normalize_asset_code(code)

    range_key = (
        request.GET.get("range")
        or request.GET.get("period")
        or request.GET.get("duration")
        or "all"
    )
    interval = (
        request.GET.get("interval")
        or request.GET.get("timeframe")
        or request.GET.get("tf")
        or "1d"
    )

    refresh = str(request.GET.get("refresh") or request.GET.get("_refresh") or "").strip().lower() in {
        "1", "true", "yes", "y", "on"
    }

    return code, _normalize_range(range_key), _normalize_interval(interval), refresh


def _chart_json_response(code, range_key, interval, refresh=False):
    """_make_payload() 결과를 짧게 캐시해 JsonResponse로 반환합니다."""
    code = _normalize_asset_code(code)

    if not code:
        return JsonResponse(
            {
                "ok": False,
                "message": "종목 코드가 없습니다.",
                "code": "",
                "range": _normalize_range(range_key),
                "interval": _normalize_interval(interval),
                "results": [],
                "rows": [],
                "ohlc": [],
                "volume": [],
            },
            status=400,
            json_dumps_params={"ensure_ascii": False},
        )

    range_key = _normalize_range(range_key)
    interval = _normalize_interval(interval)
    cache_key = f"stocks:chart-payload:v12:{code}:{range_key}:{interval}"

    if not refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            return JsonResponse(cached, json_dumps_params={"ensure_ascii": False})

    payload = _make_payload(code, range_key, interval)

    if not isinstance(payload, dict):
        payload = {
            "ok": False,
            "message": "차트 데이터를 만들지 못했습니다.",
            "code": code,
            "range": range_key,
            "interval": interval,
            "results": [],
            "rows": [],
            "ohlc": [],
            "volume": [],
        }

    payload.setdefault("code", code)
    payload.setdefault("range", range_key)
    payload.setdefault("interval", interval)
    payload.setdefault("requested_interval", interval)
    payload.setdefault("results", payload.get("rows", []))
    payload.setdefault("rows", payload.get("results", []))
    payload.setdefault("ohlc", [])
    payload.setdefault("volume", [])

    timeout = _chart_payload_cache_timeout(code, interval)
    if payload.get("ok") and timeout > 0:
        cache.set(cache_key, payload, timeout)

    return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})


@require_GET
def api_ohlcv(request, code):
    """종목 상세 화면의 기본 OHLCV 데이터 API."""
    stock_code, range_key, interval, refresh = _request_chart_params(request, default_code=code)
    return _chart_json_response(stock_code, range_key, interval, refresh=refresh)


@require_GET
def api_chart(request):
    """검색/인사이트/외부 컴포넌트에서 code 쿼리로 호출하는 차트 데이터 API."""
    code, range_key, interval, refresh = _request_chart_params(request)
    return _chart_json_response(code, range_key, interval, refresh=refresh)


@require_GET
def api_market_temperature(request):
    """이전 프론트가 호출하던 시장지표 경로를 global_market_temperature_api로 연결합니다."""
    try:
        from .global_market_api import global_market_temperature_api
        return global_market_temperature_api(request)
    except Exception as exc:
        return JsonResponse(
            {
                "ok": False,
                "message": f"시장지표 데이터를 불러오지 못했습니다: {exc}",
                "results": [],
                "data": [],
            },
            status=200,
            json_dumps_params={"ensure_ascii": False},
        )


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
    return render(request, "stocks/pricing.html", _premium_template_context(
        request,
        active_nav="pricing",
    ))

# -----------------------------------------------------------------------------
# 로그인 사용자별 차트 지표 서버 저장 API
# -----------------------------------------------------------------------------
# 기존 지표는 브라우저 localStorage 중심으로 저장되어 서버/브라우저/인사이트 iframe마다
# 하이드·수정·삭제 상태가 어긋날 수 있었습니다. 아래 API는 로그인 사용자 + 종목코드
# 기준으로 지표 상태를 DB에 저장하고 다시 불러오기 위한 엔드포인트입니다.


def _normalize_chart_indicators(indicators):
    if not isinstance(indicators, list):
        return []

    allowed_types = {"ma_pack", "volume", "rsi", "macd", "stoch", "boll", "ichimoku", "fvg", "ma_cross"}
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
            "aggregation", "direction", "metric", "startDate", "endDate", "positiveColor", "negativeColor",
            "highColor", "lowColor", "buyColor", "sellColor", "neutralColor", "signalMode", "timeframe", "strategyMode", "statusFilter", "gapType", "maType", "bullColor", "bearColor", "filledColor", "bullBorderColor", "bearBorderColor",
        ]:
            if key in item:
                item[key] = str(item.get(key) or "")[:120]

        for key in [
            "period", "width", "fast", "slow", "signal", "maPeriod", "upper", "middle", "lower",
            "rsiPeriod", "conversion", "base", "spanB", "displacement", "kSmoothing", "dSmoothing",
            "rightBars", "maxSignals", "maFast", "maSlow", "turtleEntry", "turtleExit", "maxExtensionPct", "minGapPct", "maxBoxes", "fastPeriod", "slowPeriod",
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
            "showStructure", "showSignals", "showLastState", "repeatSignals", "useMAFilter", "useStructureFilter", "useTurtleExit", "showBoxes", "showRetestSignals", "showLabels", "showBullish", "showBearish", "showLines",
        ]:
            if key in item:
                raw_bool = item[key]
                if isinstance(raw_bool, str):
                    item[key] = raw_bool.strip().lower() not in {"false", "0", "no", "off", ""}
                else:
                    item[key] = bool(raw_bool)


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

