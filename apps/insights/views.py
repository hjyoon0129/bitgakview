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


def _json_clone(value, fallback=None):
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    except Exception:
        return fallback if fallback is not None else value


def _snapshot_drawings(snapshot):
    if not isinstance(snapshot, dict):
        return []
    drawings = snapshot.get("drawings")
    return drawings if isinstance(drawings, list) else []


def _snapshot_code(snapshot):
    if not isinstance(snapshot, dict):
        return ""
    return _clean_code(snapshot.get("code") or snapshot.get("chart_code") or snapshot.get("stockCode"))


def _snapshot_has_clear_drawings_flag(payload, snapshot):
    if not isinstance(payload, dict):
        payload = {}
    if not isinstance(snapshot, dict):
        snapshot = {}

    truthy = {"1", "true", "yes", "y", "on"}
    for key in ("clear_drawings", "clearDrawings", "drawings_cleared", "drawingsCleared", "allow_empty_drawings", "allowEmptyDrawings"):
        value = payload.get(key)
        if value is True:
            return True
        if isinstance(value, str) and value.strip().lower() in truthy:
            return True

        value = snapshot.get(key)
        if value is True:
            return True
        if isinstance(value, str) and value.strip().lower() in truthy:
            return True

    return False


def _existing_chart_snapshot(request, post=None):
    # 1순위: 현재 사용자/세션의 인사이트 임시 저장값
    draft = _get_chart_draft(request, post) if request else {}
    snapshot = _safe_snapshot_obj(draft.get("chart_snapshot") if isinstance(draft, dict) else "")
    if _snapshot_drawings(snapshot):
        return snapshot

    # 2순위: 수정 화면에서 기존 발행글에 저장된 값
    if post and getattr(post, "chart_snapshot", ""):
        snapshot = _safe_snapshot_obj(post.chart_snapshot)
        if _snapshot_drawings(snapshot):
            return snapshot

    # 3순위: 글쓰기 create draft
    if post is not None:
        draft = _get_chart_draft(request, None) if request else {}
        snapshot = _safe_snapshot_obj(draft.get("chart_snapshot") if isinstance(draft, dict) else "")
        if _snapshot_drawings(snapshot):
            return snapshot

    return {}


def _merge_snapshot_with_existing_drawings(snapshot, existing_snapshot, payload=None):
    """
    인사이트 chart_snapshot 자동저장 방어 로직.

    일봉/주봉/월봉 전환 중 iframe 차트가 다시 그려지는 찰나에 drawings: [] 상태가
    서버로 들어올 수 있다. 이 값이 세션 draft에 저장되면 정상 드로잉이 사라진다.
    서버에서는 같은 종목의 기존 snapshot에 drawings가 있고, 새 snapshot만 비어 있으면
    기존 drawings를 유지한다.

    실제로 드로잉 전체 삭제를 허용해야 할 때는 프론트에서
    clear_drawings=true 또는 allow_empty_drawings=true를 함께 보내면 된다.
    """
    if not isinstance(snapshot, dict):
        snapshot = {}

    if not isinstance(existing_snapshot, dict) or not existing_snapshot:
        return snapshot

    if _snapshot_has_clear_drawings_flag(payload or {}, snapshot):
        return snapshot

    existing_drawings = _snapshot_drawings(existing_snapshot)
    incoming_drawings = _snapshot_drawings(snapshot)
    if incoming_drawings or not existing_drawings:
        return snapshot

    incoming_code = _snapshot_code(snapshot)
    existing_code = _snapshot_code(existing_snapshot)
    if incoming_code and existing_code and incoming_code != existing_code:
        return snapshot

    snapshot["drawings"] = _json_clone(existing_drawings, [])
    for key in ("drawingToolSettings", "drawingSettings", "activeDrawingToolSettings"):
        if key not in snapshot and key in existing_snapshot:
            snapshot[key] = _json_clone(existing_snapshot.get(key))

    # 디버깅용 플래그. 차트 렌더링에는 영향 없다.
    snapshot["_serverPreservedDrawings"] = True
    snapshot["_serverPreservedAt"] = timezone.now().isoformat()
    return snapshot


def _set_chart_draft(request, payload, post=None):
    key = _chart_draft_key(request, post)
    snapshot = _safe_snapshot_obj(payload.get("chart_snapshot") or payload.get("snapshot"))
    existing_snapshot = _existing_chart_snapshot(request, post)

    chart_code = _clean_code(
        payload.get("chart_code")
        or payload.get("code")
        or snapshot.get("code")
        or existing_snapshot.get("code")
        or existing_snapshot.get("chart_code")
    )
    chart_name = _trim(
        payload.get("chart_name")
        or payload.get("name")
        or snapshot.get("name")
        or existing_snapshot.get("name")
        or existing_snapshot.get("chart_name")
        or chart_code,
        80,
    )
    chart_interval = _clean_interval(
        payload.get("chart_interval")
        or payload.get("interval")
        or snapshot.get("interval")
        or existing_snapshot.get("interval")
        or existing_snapshot.get("chart_interval")
    )

    if chart_code:
        snapshot["code"] = chart_code
    if chart_name:
        snapshot["name"] = chart_name
    snapshot["interval"] = chart_interval

    snapshot = _merge_snapshot_with_existing_drawings(snapshot, existing_snapshot, payload)

    draft = {
        "media_type": _clean_media_type(payload.get("media_type") or "chart"),
        "chart_code": chart_code,
        "chart_name": chart_name,
        "chart_interval": chart_interval,
        "chart_api_url": _trim(
            payload.get("chart_api_url")
            or payload.get("apiUrl")
            or snapshot.get("apiUrl")
            or existing_snapshot.get("apiUrl")
            or existing_snapshot.get("chart_api_url"),
            240,
        ),
        "chart_snapshot": _safe_snapshot_text(snapshot),
        "updated_at": timezone.now().isoformat(),
    }
    request.session[key] = draft
    request.session.modified = True
    return draft



def _normalized_chart_draft(request, post=None):
    """
    세션 draft가 비어 있는 drawings로 남아 있더라도, 수정 화면에서는
    이미 발행된 글의 정상 chart_snapshot 드로잉을 우선 보존한다.
    이전 iframe 자동저장 타이밍 때문에 drawings: [] draft가 생기면
    수정 첫 진입에서 드로잉이 안 보이는 문제가 생길 수 있다.
    """
    draft = _get_chart_draft(request, post) if request else {}
    if not isinstance(draft, dict):
        draft = {}

    if not draft:
        return {}

    if not post or not getattr(post, "chart_snapshot", ""):
        return draft

    existing_snapshot = _safe_snapshot_obj(post.chart_snapshot)
    if not _snapshot_drawings(existing_snapshot):
        return draft

    snapshot = _safe_snapshot_obj(draft.get("chart_snapshot"))
    merged_snapshot = _merge_snapshot_with_existing_drawings(snapshot, existing_snapshot, draft)

    normalized = dict(draft)
    chart_code = _clean_code(
        normalized.get("chart_code")
        or merged_snapshot.get("code")
        or existing_snapshot.get("code")
        or getattr(post, "chart_code", "")
    )
    chart_name = _trim(
        normalized.get("chart_name")
        or merged_snapshot.get("name")
        or existing_snapshot.get("name")
        or getattr(post, "chart_name", "")
        or chart_code,
        80,
    )
    chart_interval = _clean_interval(
        normalized.get("chart_interval")
        or merged_snapshot.get("interval")
        or existing_snapshot.get("interval")
        or getattr(post, "chart_interval", "1d")
    )

    if chart_code:
        merged_snapshot["code"] = chart_code
    if chart_name:
        merged_snapshot["name"] = chart_name
    merged_snapshot["interval"] = chart_interval

    normalized["media_type"] = _clean_media_type(normalized.get("media_type") or "chart")
    normalized["chart_code"] = chart_code
    normalized["chart_name"] = chart_name
    normalized["chart_interval"] = chart_interval
    normalized["chart_api_url"] = _trim(
        normalized.get("chart_api_url")
        or merged_snapshot.get("apiUrl")
        or getattr(post, "chart_api_url", ""),
        240,
    )
    normalized["chart_snapshot"] = _safe_snapshot_text(merged_snapshot)

    if normalized != draft:
        key = _chart_draft_key(request, post)
        request.session[key] = normalized
        request.session.modified = True

    return normalized

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

    snapshot = _safe_snapshot_obj(request.POST.get("chart_snapshot"))
    if chart_code:
        snapshot["code"] = chart_code
    if chart_name:
        snapshot["name"] = chart_name
    if chart_interval:
        snapshot["interval"] = chart_interval

    existing_post = instance if getattr(instance, "pk", None) else None
    existing_snapshot = _existing_chart_snapshot(request, existing_post)
    snapshot = _merge_snapshot_with_existing_drawings(snapshot, existing_snapshot, request.POST)
    chart_snapshot = _safe_snapshot_text(snapshot)

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
        draft = _normalized_chart_draft(request, post) if request else {}
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
        draft = _normalized_chart_draft(request, post) if post else _get_chart_draft(request, post)
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
