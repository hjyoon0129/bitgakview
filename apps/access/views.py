import json

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .models import Coupon, CouponRedemption
from .services import get_access_payload, get_or_create_access


def _request_data(request):
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            return {}
    return request.POST


@require_GET
def api_access_me(request):
    return JsonResponse(
        {"ok": True, "access": get_access_payload(request.user)},
        json_dumps_params={"ensure_ascii": False},
    )


@login_required
@require_POST
@transaction.atomic
def api_redeem_coupon(request):
    data = _request_data(request)
    code = str(data.get("code") or "").strip().upper()

    if not code:
        return JsonResponse({"ok": False, "message": "쿠폰 코드를 입력해주세요."}, status=400, json_dumps_params={"ensure_ascii": False})

    coupon = Coupon.objects.select_for_update().filter(code__iexact=code).first()

    if not coupon:
        return JsonResponse({"ok": False, "message": "존재하지 않는 쿠폰입니다."}, status=404, json_dumps_params={"ensure_ascii": False})

    if not coupon.can_use():
        return JsonResponse({"ok": False, "message": "사용할 수 없는 쿠폰입니다."}, status=400, json_dumps_params={"ensure_ascii": False})

    if CouponRedemption.objects.filter(coupon=coupon, user=request.user).exists():
        return JsonResponse({"ok": False, "message": "이미 사용한 쿠폰입니다."}, status=400, json_dumps_params={"ensure_ascii": False})

    access = get_or_create_access(request.user)
    access.activate_premium(coupon.days)

    coupon.used_count += 1
    coupon.save(update_fields=["used_count"])

    CouponRedemption.objects.create(coupon=coupon, user=request.user)

    return JsonResponse(
        {
            "ok": True,
            "message": f"{coupon.days}일 프리미엄이 적용되었습니다.",
            "access": get_access_payload(request.user),
        },
        json_dumps_params={"ensure_ascii": False},
    )
