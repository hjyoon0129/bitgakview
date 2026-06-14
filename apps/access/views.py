import json

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .models import Coupon, CouponRedemption, PremiumApplication, UserAccess


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return {}


def _access_payload(access):
    return {
        "plan": access.plan,
        "is_premium": access.is_premium,
        "premium_until": access.premium_until.isoformat() if access.premium_until else None,
        "indicator_limit": access.indicator_limit,
        "watchlist_limit": access.watchlist_limit,
        "group_limit": access.group_limit,
        "drawing_limit": access.drawing_limit,
    }


@require_POST
@login_required
@transaction.atomic
def redeem_coupon(request):
    data = _json_body(request)
    code = str(data.get("code") or "").strip().upper()

    if not code:
        return JsonResponse(
            {"ok": False, "message": "쿠폰 코드를 입력해주세요."},
            status=400,
            json_dumps_params={"ensure_ascii": False},
        )

    coupon = Coupon.objects.select_for_update().filter(code__iexact=code).first()
    if not coupon or not coupon.is_usable():
        return JsonResponse(
            {"ok": False, "message": "사용할 수 없는 쿠폰입니다."},
            status=400,
            json_dumps_params={"ensure_ascii": False},
        )

    if CouponRedemption.objects.filter(coupon=coupon, user=request.user).exists():
        return JsonResponse(
            {"ok": False, "message": "이미 사용한 쿠폰입니다."},
            status=400,
            json_dumps_params={"ensure_ascii": False},
        )

    CouponRedemption.objects.create(coupon=coupon, user=request.user)
    coupon.used_count += 1
    coupon.save(update_fields=["used_count"])

    access, _ = UserAccess.objects.get_or_create(user=request.user)
    access.activate_premium(coupon.days)

    return JsonResponse(
        {
            "ok": True,
            "message": f"프리미엄 {coupon.days}일 이용권이 적용되었습니다.",
            "access": _access_payload(access),
        },
        json_dumps_params={"ensure_ascii": False},
    )


@require_POST
@login_required
@transaction.atomic
def premium_application_apply(request):
    data = _json_body(request)

    plan = str(data.get("plan") or PremiumApplication.PLAN_FREE_365).strip()
    if plan not in dict(PremiumApplication.PLAN_CHOICES):
        plan = PremiumApplication.PLAN_FREE_365

    source = str(data.get("source") or data.get("location") or "site").strip()[:120]
    message = str(data.get("message") or data.get("user_message") or "").strip()
    user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:2000]

    application = (
        PremiumApplication.objects.select_for_update()
        .filter(
            user=request.user,
            status__in=[
                PremiumApplication.STATUS_PENDING,
                PremiumApplication.STATUS_APPROVED,
            ],
        )
        .order_by("-created_at")
        .first()
    )

    created = False
    if not application:
        application = PremiumApplication.objects.create(
            user=request.user,
            plan=plan,
            source=source,
            user_message=message,
            user_agent=user_agent,
        )
        created = True
    else:
        changed = []
        if message and message != application.user_message:
            application.user_message = message
            changed.append("user_message")
        if source and source != application.source:
            application.source = source
            changed.append("source")
        if changed:
            changed.append("updated_at")
            application.save(update_fields=changed)

    if application.status == PremiumApplication.STATUS_APPROVED:
        access, _ = UserAccess.objects.get_or_create(user=request.user)
        if not access.is_premium:
            application.activate_user_access(days=365)
            access, _ = UserAccess.objects.get_or_create(user=request.user)

        return JsonResponse(
            {
                "ok": True,
                "created": created,
                "status": application.status,
                "message": "이미 프리미엄 1년 무료 혜택이 승인되었습니다.",
                "redirect_url": "/stocks/pricing/",
                "access": _access_payload(access),
            },
            json_dumps_params={"ensure_ascii": False},
        )

    access, _ = UserAccess.objects.get_or_create(user=request.user)
    return JsonResponse(
        {
            "ok": True,
            "created": created,
            "status": application.status,
            "message": "프리미엄 1년 무료 신청이 접수되었습니다. 관리자가 승인하면 로그인 시 안내 모달이 표시됩니다.",
            "application": {
                "id": application.id,
                "status": application.status,
                "status_label": application.get_status_display(),
                "plan": application.plan,
                "plan_label": application.get_plan_display(),
            },
            "access": _access_payload(access),
        },
        json_dumps_params={"ensure_ascii": False},
    )


@require_GET
@login_required
def premium_application_status(request):
    application = PremiumApplication.objects.filter(user=request.user).order_by("-created_at").first()
    access, _ = UserAccess.objects.get_or_create(user=request.user)

    if application and application.status == PremiumApplication.STATUS_APPROVED and not access.is_premium:
        application.activate_user_access(days=365)
        access, _ = UserAccess.objects.get_or_create(user=request.user)

    payload = {
        "ok": True,
        "has_application": bool(application),
        "access": _access_payload(access),
        "application": None,
        "show_modal": False,
    }

    if application:
        reply = application.admin_reply or application.default_reply()
        payload["application"] = {
            "id": application.id,
            "plan": application.plan,
            "plan_label": application.get_plan_display(),
            "status": application.status,
            "status_label": application.get_status_display(),
            "source": application.source,
            "user_message": application.user_message,
            "admin_reply": reply,
            "created_at": application.created_at.isoformat() if application.created_at else None,
            "approved_at": application.approved_at.isoformat() if application.approved_at else None,
            "notice_seen": bool(application.notice_seen_at),
        }
        payload["show_modal"] = (
            application.status
            in {PremiumApplication.STATUS_APPROVED, PremiumApplication.STATUS_REJECTED}
            and application.notice_seen_at is None
        )

    return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})


@require_POST
@login_required
def premium_application_ack(request):
    application_id = _json_body(request).get("id")
    qs = PremiumApplication.objects.filter(user=request.user)
    if application_id:
        qs = qs.filter(id=application_id)

    application = qs.order_by("-created_at").first()
    if not application:
        return JsonResponse(
            {"ok": False, "message": "확인할 신청 내역이 없습니다."},
            status=404,
            json_dumps_params={"ensure_ascii": False},
        )

    application.notice_seen_at = timezone.now()
    application.save(update_fields=["notice_seen_at", "updated_at"])

    return JsonResponse({"ok": True}, json_dumps_params={"ensure_ascii": False})
