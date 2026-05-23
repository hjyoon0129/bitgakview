from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .forms import InsightPostForm
from .models import InsightPost
from .permissions import is_insight_master


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


def _save_form(request, form, post=None):
    instance = form.save(commit=False)
    instance.is_published = True
    instance.is_featured = True

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
    return instance


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

    return render(request, "insights/insight_form.html", {
        "form": form,
        "post": None,
        "mode": "create",
        "can_manage_insights": True,
    })


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

    return render(request, "insights/insight_form.html", {
        "form": form,
        "post": post,
        "mode": "update",
        "can_manage_insights": True,
    })


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
