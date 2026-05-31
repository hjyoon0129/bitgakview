import json

from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .forms import InsightPostForm
from .models import InsightPost
from .permissions import is_insight_master


VALID_MEDIA_TYPES = {"image", "chart"}
VALID_INTERVALS = {"1h", "2h", "3h", "4h", "1d", "1w", "1mo"}
MAX_SNAPSHOT_LENGTH = 1200000


def published_posts():
    now = timezone.now()
    return InsightPost.objects.filter(
        is_published=True,
        published_at__lte=now,
    ).order_by("display_order", "-published_at", "-created_at")


def insight_list(request):
    q = (request.GET.get("q") or "").strip()
    posts = published_posts()

    if q:
        posts = posts.filter(
            Q(title__icontains=q)
            | Q(content__icontains=q)
            | Q(summary__icontains=q)
            | Q(related_name__icontains=q)
            | Q(related_symbol__icontains=q)
            | Q(tags__icontains=q)
            | Q(chart_name__icontains=q)
            | Q(chart_code__icontains=q)
        )

    posts = list(posts)

    return render(request, "insights/insight_list.html", {
        "q": q,
        "posts": posts,
        "can_manage_insights": is_insight_master(request.user),
    })


def insight_detail(request, slug):
    post = get_object_or_404(published_posts(), slug=slug)

    return render(request, "insights/insight_detail.html", {
        "post": post,
        "can_manage_insights": is_insight_master(request.user),
    })


def _clean_media_type(value):
    value = (value or "image").strip().lower()
    return value if value in VALID_MEDIA_TYPES else "image"


def _clean_interval(value):
    value = (value or "1d").strip()
    return value if value in VALID_INTERVALS else "1d"


def _clean_code(value):
    return "".join(ch for ch in str(value or "") if ch.isalnum()).strip()[:20]


def _trim(value, limit):
    return str(value or "").strip()[:limit]


def _safe_snapshot_text(value):
    if isinstance(value, (dict, list)):
        try:
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            value = ""
    value = str(value or "").strip()
    if len(value) > MAX_SNAPSHOT_LENGTH:
        value = value[:MAX_SNAPSHOT_LENGTH]
    return value


def _safe_snapshot_obj(value):
    text = _safe_snapshot_text(value)
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _chart_draft_key(request, post=None):
    if request.user.is_authenticated:
        user_part = f"u{request.user.pk}"
    else:
        if not request.session.session_key:
            request.session.save()
        user_part = f"s{request.session.session_key}"
    if post:
        return f"insight_chart_draft:{user_part}:post:{post.pk}"
    return f"insight_chart_draft:{user_part}:create"


def _get_chart_draft(request, post=None):
    key = _chart_draft_key(request, post)
    draft = request.session.get(key) or {}
    return draft if isinstance(draft, dict) else {}


def _set_chart_draft(request, payload, post=None):
    key = _chart_draft_key(request, post)
    snapshot = _safe_snapshot_obj(payload.get("chart_snapshot") or payload.get("snapshot"))

    chart_code = _clean_code(payload.get("chart_code") or payload.get("code") or snapshot.get("code"))
    chart_name = _trim(payload.get("chart_name") or payload.get("name") or snapshot.get("name") or chart_code, 80)
    chart_interval = _clean_interval(payload.get("chart_interval") or payload.get("interval") or snapshot.get("interval"))

    if chart_code:
        snapshot["code"] = chart_code
    if chart_name:
        snapshot["name"] = chart_name
    snapshot["interval"] = chart_interval

    draft = {
        "media_type": _clean_media_type(payload.get("media_type") or "chart"),
        "chart_code": chart_code,
        "chart_name": chart_name,
        "chart_interval": chart_interval,
        "chart_api_url": _trim(payload.get("chart_api_url") or payload.get("apiUrl") or snapshot.get("apiUrl"), 240),
        "chart_snapshot": _safe_snapshot_text(snapshot),
        "updated_at": timezone.now().isoformat(),
    }
    request.session[key] = draft
    request.session.modified = True
    return draft


def _clear_chart_draft(request, post=None):
    key = _chart_draft_key(request, post)
    if key in request.session:
        del request.session[key]
        request.session.modified = True


def _apply_chart_fields(request, instance):
    media_type = _clean_media_type(request.POST.get("media_type"))
    chart_code = _clean_code(request.POST.get("chart_code"))
    chart_name = _trim(request.POST.get("chart_name"), 80)
    chart_interval = _clean_interval(request.POST.get("chart_interval"))
    chart_api_url = _trim(request.POST.get("chart_api_url"), 240)
    chart_snapshot = _safe_snapshot_text(request.POST.get("chart_snapshot"))

    instance.media_type = media_type
    instance.chart_code = chart_code
    instance.chart_name = chart_name
    instance.chart_interval = chart_interval
    instance.chart_api_url = chart_api_url
    instance.chart_snapshot = chart_snapshot

    if media_type == "chart":
        if chart_code:
            instance.related_symbol = chart_code
        if chart_name:
            instance.related_name = chart_name


def _save_form(request, form, post=None):
    instance = form.save(commit=False)
    instance.is_published = True
    instance.is_featured = True
    _apply_chart_fields(request, instance)

    if not instance.published_at:
        instance.published_at = timezone.now()

    delete_requested = request.POST.get("delete_cover_image") == "1"
    new_image_uploaded = bool(request.FILES.get("cover_image"))

    if delete_requested and not new_image_uploaded:
        if post and post.cover_image:
            post.cover_image.delete(save=False)
        instance.cover_image = None

    instance.save()
    form.save_m2m()
    _clear_chart_draft(request, instance)
    if post and post.pk != instance.pk:
        _clear_chart_draft(request, post)
    _clear_chart_draft(request, None)
    return instance


def _form_context(form, post, mode, request=None):
    post = post or None

    if request and request.method == "POST":
        initial_media_type = _clean_media_type(request.POST.get("media_type"))
        initial_chart_code = _clean_code(request.POST.get("chart_code"))
        initial_chart_name = _trim(request.POST.get("chart_name"), 80)
        initial_chart_interval = _clean_interval(request.POST.get("chart_interval"))
        initial_chart_api_url = _trim(request.POST.get("chart_api_url"), 240)
        initial_chart_snapshot = _safe_snapshot_text(request.POST.get("chart_snapshot"))
    else:
        draft = _get_chart_draft(request, post) if request else {}
        if draft:
            initial_media_type = draft.get("media_type", "chart")
            initial_chart_code = draft.get("chart_code", "")
            initial_chart_name = draft.get("chart_name", "")
            initial_chart_interval = draft.get("chart_interval", "1d")
            initial_chart_api_url = draft.get("chart_api_url", "")
            initial_chart_snapshot = draft.get("chart_snapshot", "")
        else:
            initial_media_type = getattr(post, "media_type", "image") if post else "image"
            initial_chart_code = getattr(post, "chart_code", "") if post else ""
            initial_chart_name = getattr(post, "chart_name", "") if post else ""
            initial_chart_interval = getattr(post, "chart_interval", "1d") if post else "1d"
            initial_chart_api_url = getattr(post, "chart_api_url", "") if post else ""
            initial_chart_snapshot = getattr(post, "chart_snapshot", "") if post else ""

    return {
        "form": form,
        "post": post,
        "mode": mode,
        "can_manage_insights": True,
        "initial_media_type": initial_media_type or "image",
        "initial_chart_code": initial_chart_code,
        "initial_chart_name": initial_chart_name,
        "initial_chart_interval": initial_chart_interval or "1d",
        "initial_chart_api_url": initial_chart_api_url,
        "initial_chart_snapshot": initial_chart_snapshot,
    }


def insight_create(request):
    if not is_insight_master(request.user):
        raise PermissionDenied("빗각관점 글쓰기 권한이 없습니다.")

    if request.method == "POST":
        form = InsightPostForm(request.POST, request.FILES)
        if form.is_valid():
            post = _save_form(request, form)
            return redirect(post.get_absolute_url())
    else:
        form = InsightPostForm()

    return render(request, "insights/insight_form.html", _form_context(form, None, "create", request))


def insight_update(request, slug):
    if not is_insight_master(request.user):
        raise PermissionDenied("빗각관점 수정 권한이 없습니다.")

    post = get_object_or_404(InsightPost, slug=slug)

    if request.method == "POST":
        form = InsightPostForm(request.POST, request.FILES, instance=post)
        if form.is_valid():
            post = _save_form(request, form, post=post)
            return redirect(post.get_absolute_url())
    else:
        form = InsightPostForm(instance=post)

    return render(request, "insights/insight_form.html", _form_context(form, post, "update", request))


def insight_delete(request, slug):
    if not is_insight_master(request.user):
        raise PermissionDenied("빗각관점 삭제 권한이 없습니다.")

    post = get_object_or_404(InsightPost, slug=slug)

    if request.method == "POST":
        if post.cover_image:
            post.cover_image.delete(save=False)
        post.delete()
        return redirect("insights:list")

    return render(request, "insights/insight_confirm_delete.html", {
        "post": post,
        "can_manage_insights": True,
    })


@require_http_methods(["GET"])
def stock_search_api(request):
    if not is_insight_master(request.user):
        raise PermissionDenied("검색 권한이 없습니다.")

    q = (request.GET.get("q") or "").strip()
    limit_raw = request.GET.get("limit") or "40"
    try:
        limit = max(1, min(80, int(limit_raw)))
    except Exception:
        limit = 40

    if not q:
        return JsonResponse({"ok": True, "results": []})

    code_q = _clean_code(q)
    results = []
    seen = set()

    try:
        from apps.stocks.models import StockSymbol

        qs = StockSymbol.objects.all()
        if code_q and code_q.isdigit():
            qs = qs.filter(code__istartswith=code_q)
        else:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=code_q))

        qs = qs.only("code", "name", "market").order_by("code")[:limit]
        for item in qs:
            if item.code in seen:
                continue
            seen.add(item.code)
            results.append({
                "code": item.code,
                "name": item.name,
                "market": item.market or "KRX",
            })
    except Exception:
        results = []

    return JsonResponse({"ok": True, "results": results})


@require_http_methods(["GET", "POST"])
def chart_draft_api(request, slug=None):
    if not is_insight_master(request.user):
        raise PermissionDenied("차트 저장 권한이 없습니다.")

    post = None
    if slug:
        post = get_object_or_404(InsightPost, slug=slug)

    if request.method == "GET":
        draft = _get_chart_draft(request, post)
        if not draft and post and post.media_type == InsightPost.MediaType.CHART:
            draft = {
                "media_type": post.media_type,
                "chart_code": post.chart_code,
                "chart_name": post.chart_name,
                "chart_interval": post.chart_interval or "1d",
                "chart_api_url": post.chart_api_url,
                "chart_snapshot": post.chart_snapshot,
                "updated_at": post.updated_at.isoformat() if post.updated_at else "",
            }
        return JsonResponse({"ok": True, "has_draft": bool(draft), "draft": draft or {}})

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    draft = _set_chart_draft(request, payload, post)
    return JsonResponse({"ok": True, "has_draft": True, "draft": draft})
