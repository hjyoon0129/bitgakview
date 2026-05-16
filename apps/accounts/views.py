from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods


User = get_user_model()


def _safe_next_url(request):
    next_url = request.POST.get("next") or request.GET.get("next") or ""

    if next_url and url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return next_url

    return getattr(settings, "LOGIN_REDIRECT_URL", "/stocks/")


def _social_ready():
    """
    Django admin > Social applications에 provider가 등록되어 있으면 True.
    등록 전이면 로그인 버튼은 '준비중'으로 표시한다.
    """
    ready = {
        "google": False,
        "naver": False,
        "kakao": False,
    }

    try:
        from allauth.socialaccount.models import SocialApp

        for provider in ready.keys():
            ready[provider] = SocialApp.objects.filter(provider=provider).exists()
    except Exception:
        pass

    return ready


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.user.is_authenticated:
        return redirect(_safe_next_url(request))

    if request.method == "POST":
        login_id = (request.POST.get("login_id") or "").strip()
        password = request.POST.get("password") or ""

        if not login_id or not password:
            messages.error(request, "아이디/이메일과 비밀번호를 입력해주세요.")
            return render(request, "accounts/login.html", {
                "social_ready": _social_ready(),
                "next_url": request.POST.get("next") or request.GET.get("next") or "",
            })

        username = login_id

        if "@" in login_id:
            user_obj = User.objects.filter(email__iexact=login_id).first()
            if user_obj:
                username = user_obj.get_username()

        user = authenticate(request, username=username, password=password)

        if user is None:
            messages.error(request, "아이디/이메일 또는 비밀번호가 올바르지 않습니다.")
            return render(request, "accounts/login.html", {
                "social_ready": _social_ready(),
                "next_url": request.POST.get("next") or request.GET.get("next") or "",
            })

        if not user.is_active:
            messages.error(request, "비활성화된 계정입니다. 관리자에게 문의해주세요.")
            return render(request, "accounts/login.html", {
                "social_ready": _social_ready(),
                "next_url": request.POST.get("next") or request.GET.get("next") or "",
            })

        auth_login(request, user)
        messages.success(request, "로그인되었습니다.")
        return redirect(_safe_next_url(request))

    return render(request, "accounts/login.html", {
        "social_ready": _social_ready(),
        "next_url": request.GET.get("next", ""),
    })


@require_http_methods(["GET", "POST"])
def signup_view(request):
    if request.user.is_authenticated:
        return redirect(_safe_next_url(request))

    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        email = (request.POST.get("email") or "").strip().lower()
        password1 = request.POST.get("password1") or ""
        password2 = request.POST.get("password2") or ""
        agree_terms = request.POST.get("agree_terms")

        has_error = False

        if not username:
            messages.error(request, "아이디를 입력해주세요.")
            has_error = True

        if username and len(username) < 4:
            messages.error(request, "아이디는 4자 이상이어야 합니다.")
            has_error = True

        if username and not username.replace("_", "").replace("-", "").isalnum():
            messages.error(request, "아이디는 영문, 숫자, _, - 만 사용할 수 있습니다.")
            has_error = True

        if username and User.objects.filter(username__iexact=username).exists():
            messages.error(request, "이미 사용 중인 아이디입니다.")
            has_error = True

        if not email:
            messages.error(request, "이메일을 입력해주세요.")
            has_error = True

        if email and User.objects.filter(email__iexact=email).exists():
            messages.error(request, "이미 가입된 이메일입니다.")
            has_error = True

        if len(password1) < 8:
            messages.error(request, "비밀번호는 8자 이상이어야 합니다.")
            has_error = True

        if password1 != password2:
            messages.error(request, "비밀번호가 서로 일치하지 않습니다.")
            has_error = True

        if not agree_terms:
            messages.error(request, "이용약관과 개인정보 처리방침에 동의해주세요.")
            has_error = True

        if has_error:
            return render(request, "accounts/signup.html", {
                "social_ready": _social_ready(),
                "next_url": request.POST.get("next") or request.GET.get("next") or "",
            })

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password1,
        )

        auth_login(request, user)
        messages.success(request, "회원가입이 완료되었습니다.")
        return redirect(_safe_next_url(request))

    return render(request, "accounts/signup.html", {
        "social_ready": _social_ready(),
        "next_url": request.GET.get("next", ""),
    })


def logout_view(request):
    auth_logout(request)
    messages.success(request, "로그아웃되었습니다.")
    return redirect("stocks:search")

# ============================================================
# BitgakView URL compatibility views
# urls.py에서 views.stock_search / features_view / pricing_view를 찾기 때문에
# 함수가 없을 경우를 대비해서 명시적으로 다시 정의한다.
# ============================================================

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse


def stock_search(request):
    """
    /stocks/
    홈 검색 화면
    """
    return render(request, "stocks/stock_search.html")


def features_view(request):
    """
    /stocks/features/
    소개 페이지
    """
    return render(request, "stocks/features.html")


def pricing_view(request):
    """
    /stocks/pricing/
    가격소개 페이지
    """
    return render(request, "stocks/pricing.html")
