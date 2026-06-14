from __future__ import annotations

import json
from typing import Dict

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import ScreenerUsage
from .services import (
    NUMERIC_FIELD_LABELS,
    SECTOR_OPTIONS,
    delete_strategy,
    list_strategies,
    parse_filters,
    run_backtest,
    run_screener,
    run_single_stock_backtest,
    save_strategy,
    symbol_search,
)

FREE_DAILY_LIMIT = 3

FORM_KEYS = [
    "market", "sort", "q", "keyword", "limit", "strict", "refresh", "use_fundamental", "use_scale", "use_technical", "sectors", "sector", "custom_filters",
    "per_min", "per_max", "pbr_min", "pbr_max", "roe_min", "roe_max", "eps_min", "eps_max",
    "bps_min", "bps_max", "div_min", "div_max", "dps_min", "dps_max", "market_cap_min_uk",
    "market_cap_max_uk", "trading_value_min_uk", "trading_value_max_uk", "drawdown_52w_min",
    "drawdown_52w_max", "mdd_1y_min", "mdd_1y_max", "momentum_3m_min", "momentum_6m_min",
    "ma_period", "price_position", "candle_position", "ma_cross", "rsi_min", "rsi_max",
]


def user_is_premium(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = getattr(user, "profile", None)
    candidates = [user, profile, getattr(user, "access", None), getattr(user, "subscription", None)]
    for obj in candidates:
        if not obj:
            continue
        for attr in ["is_premium", "has_premium", "premium"]:
            value = getattr(obj, attr, None)
            if callable(value):
                try:
                    value = value()
                except Exception:
                    value = False
            if bool(value):
                return True
    return False


def _login_required_for_screener(request) -> bool:
    return not bool(getattr(settings, "DEBUG", False)) and not request.user.is_authenticated


def _should_charge_usage(request) -> bool:
    return not bool(getattr(settings, "DEBUG", False))


def access_payload(user):
    premium = user_is_premium(user)
    return {
        "is_authenticated": bool(user and user.is_authenticated) or bool(getattr(settings, "DEBUG", False)),
        "is_premium": premium,
        "plan": "premium" if premium else ("free" if user and user.is_authenticated else "guest"),
        "features": {"stock_screener": True, "stock_screener_daily_limit": None if premium else FREE_DAILY_LIMIT},
    }


def remaining_usage(user):
    if getattr(settings, "DEBUG", False):
        return FREE_DAILY_LIMIT
    if not user or not user.is_authenticated:
        return 0
    if user_is_premium(user):
        return None
    today = timezone.localdate()
    item = ScreenerUsage.objects.filter(user=user, date=today).first()
    used = item.count if item else 0
    return max(0, FREE_DAILY_LIMIT - used)


def _form_values_from_query(query) -> Dict[str, str]:
    values = {key: str(query.get(key, "") or "") for key in FORM_KEYS}
    values["market"] = values.get("market") or "ALL"
    values["sort"] = values.get("sort") or "score_desc"
    values["limit"] = values.get("limit") or "50"
    values["strict"] = values.get("strict") or "1"
    values["ma_period"] = values.get("ma_period") or "112"
    return values


def _read_payload(request) -> Dict:
    try:
        if request.content_type and "application/json" in request.content_type:
            return json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return {}
    data = request.POST.dict() if request.method == "POST" else request.GET.dict()
    try:
        source = request.POST if request.method == "POST" else request.GET
        if hasattr(source, "getlist"):
            sectors = source.getlist("sectors") or source.getlist("sector")
            if sectors:
                data["sectors"] = sectors
    except Exception:
        pass
    return data


def _charge_free_usage(user):
    if user_is_premium(user):
        return None
    today = timezone.localdate()
    with transaction.atomic():
        usage, _ = ScreenerUsage.objects.select_for_update().get_or_create(user=user, date=today, defaults={"count": 0})
        if usage.count >= FREE_DAILY_LIMIT:
            return JsonResponse({
                "ok": False,
                "code": "daily_limit",
                "message": f"무료 회원은 하루 {FREE_DAILY_LIMIT}회까지 검색할 수 있습니다. 프리미엄은 제한 없이 사용할 수 있습니다.",
                "remaining": 0,
            }, status=403)
        usage.count += 1
        usage.save(update_fields=["count", "updated_at"])
    return None


def _charge_free_usage_for_page(user) -> str:
    if user_is_premium(user):
        return ""
    today = timezone.localdate()
    with transaction.atomic():
        usage, _ = ScreenerUsage.objects.select_for_update().get_or_create(user=user, date=today, defaults={"count": 0})
        if usage.count >= FREE_DAILY_LIMIT:
            return f"무료 회원은 하루 {FREE_DAILY_LIMIT}회까지 검색할 수 있습니다. 프리미엄은 제한 없이 사용할 수 있습니다."
        usage.count += 1
        usage.save(update_fields=["count", "updated_at"])
    return ""


def screener_page(request):
    form_values = _form_values_from_query(request.GET)
    searched = request.GET.get("search") == "1"
    initial_data = None
    initial_error = ""
    if searched:
        if _login_required_for_screener(request):
            initial_error = "조건별 종목 찾기는 로그인 후 사용할 수 있습니다."
        else:
            try:
                if _should_charge_usage(request) and request.user.is_authenticated:
                    limit_error = _charge_free_usage_for_page(request.user)
                    if limit_error:
                        raise RuntimeError(limit_error)
                filters = parse_filters(_read_payload(request))
                initial_data = run_screener(filters)
                initial_data["remaining"] = remaining_usage(request.user)
                initial_data["is_premium"] = user_is_premium(request.user)
            except Exception as exc:
                initial_error = str(exc) or "조건검색 중 오류가 발생했습니다."
    if initial_error:
        initial_data = {"ok": False, "message": initial_error, "results": []}
    return render(request, "stock_screener/screener.html", {
        "access_payload": access_payload(request.user),
        "free_daily_limit": FREE_DAILY_LIMIT,
        "remaining": remaining_usage(request.user) if request.user.is_authenticated or getattr(settings, "DEBUG", False) else 0,
        "form_values": form_values,
        "searched": searched,
        "initial_data": initial_data,
        "sector_options": SECTOR_OPTIONS,
        "numeric_field_labels": NUMERIC_FIELD_LABELS,
        "saved_strategies": list_strategies(request.user),
    })


@require_http_methods(["GET", "POST"])
def screener_api(request):
    if _login_required_for_screener(request):
        return JsonResponse({"ok": False, "code": "login_required", "message": "조건별 종목 찾기는 로그인 후 사용할 수 있습니다."}, status=401)
    if request.method == "POST" and _should_charge_usage(request) and request.user.is_authenticated:
        limit_response = _charge_free_usage(request.user)
        if limit_response is not None:
            return limit_response
    try:
        payload = _read_payload(request)
        filters = parse_filters(payload)
        data = run_screener(filters)
        data["remaining"] = remaining_usage(request.user)
        data["is_premium"] = user_is_premium(request.user)
        return JsonResponse(data, json_dumps_params={"ensure_ascii": False})
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc) or "조건검색 중 오류가 발생했습니다.", "remaining": remaining_usage(request.user)}, status=500, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["GET"])
def symbol_search_api(request):
    q = request.GET.get("q") or request.GET.get("term") or ""
    limit = request.GET.get("limit") or 30
    refresh = str(request.GET.get("refresh") or "0") in {"1", "true", "yes"}
    try:
        data = symbol_search(q, int(limit), refresh=refresh)
        return JsonResponse(data, json_dumps_params={"ensure_ascii": False})
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc), "results": []}, status=500, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["POST"])
def strategy_save_api(request):
    try:
        payload = _read_payload(request)
        item = save_strategy(request.user, payload)
        return JsonResponse({"ok": True, "strategy": item, "strategies": list_strategies(request.user)}, json_dumps_params={"ensure_ascii": False})
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc)}, status=500, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["GET"])
def strategy_list_api(request):
    return JsonResponse({"ok": True, "strategies": list_strategies(request.user)}, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["POST"])
def strategy_delete_api(request):
    payload = _read_payload(request)
    deleted = delete_strategy(request.user, payload.get("id") or payload.get("strategy_id") or "")
    return JsonResponse({"ok": True, "deleted": deleted, "strategies": list_strategies(request.user)}, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["POST"])
def backtest_api(request):
    try:
        data = run_backtest(_read_payload(request))
        return JsonResponse(data, json_dumps_params={"ensure_ascii": False})
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc) or "백테스트 중 오류가 발생했습니다."}, status=500, json_dumps_params={"ensure_ascii": False})


@require_http_methods(["POST"])
def single_stock_backtest_api(request):
    try:
        data = run_single_stock_backtest(_read_payload(request))
        return JsonResponse(data, json_dumps_params={"ensure_ascii": False})
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc) or "개별 종목 백테스트 중 오류가 발생했습니다."}, status=500, json_dumps_params={"ensure_ascii": False})
