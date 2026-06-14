import re

from django import forms
from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError


User = get_user_model()


class BitgakLoginForm(forms.Form):
    login_id = forms.CharField(
        label="아이디 또는 이메일",
        max_length=150,
    )
    password = forms.CharField(
        label="비밀번호",
        widget=forms.PasswordInput,
    )

    def __init__(self, request=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.request = request
        self.user_cache = None

    def clean(self):
        cleaned = super().clean()
        login_id = (cleaned.get("login_id") or "").strip()
        password = cleaned.get("password") or ""

        if not login_id or not password:
            return cleaned

        username = login_id

        if "@" in login_id:
            user = User.objects.filter(email__iexact=login_id).first()
            if user:
                username = user.get_username()

        self.user_cache = authenticate(
            self.request,
            username=username,
            password=password,
        )

        if self.user_cache is None:
            raise ValidationError("아이디/이메일 또는 비밀번호가 올바르지 않습니다.")

        if not self.user_cache.is_active:
            raise ValidationError("비활성화된 계정입니다. 관리자에게 문의해주세요.")

        return cleaned

    def get_user(self):
        return self.user_cache


class BitgakSignupForm(forms.Form):
    username = forms.CharField(label="아이디", min_length=4, max_length=24)
    email = forms.EmailField(label="이메일")
    password1 = forms.CharField(label="비밀번호", min_length=8, widget=forms.PasswordInput)
    password2 = forms.CharField(label="비밀번호 확인", min_length=8, widget=forms.PasswordInput)
    agree_terms = forms.BooleanField(label="이용약관과 개인정보 처리방침에 동의합니다.", required=True)

    def clean_username(self):
        username = (self.cleaned_data.get("username") or "").strip()

        if not re.fullmatch(r"[A-Za-z0-9_-]+", username):
            raise forms.ValidationError("아이디는 영문, 숫자, _, - 만 사용할 수 있습니다.")

        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError("이미 사용 중인 아이디입니다.")

        return username

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()

        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("이미 가입된 이메일입니다.")

        return email

    def clean(self):
        cleaned = super().clean()
        password1 = cleaned.get("password1")
        password2 = cleaned.get("password2")

        if password1 and password2 and password1 != password2:
            self.add_error("password2", "비밀번호가 서로 일치하지 않습니다.")

        return cleaned

    def save(self):
        return User.objects.create_user(
            username=self.cleaned_data["username"],
            email=self.cleaned_data["email"],
            password=self.cleaned_data["password1"],
        )


# -----------------------------------------------------------------------------
# Legacy compatibility
# -----------------------------------------------------------------------------
# 과거 잘못 덮어쓴 stocks.views가 InsightPostForm을 import하던 상태가 있었습니다.
# 정상 stocks.views에서는 사용하지 않지만, 다른 오래된 import가 남아 있어도 서버가 죽지 않게
# 안전한 호환 클래스를 제공합니다.
try:
    from apps.insights.models import InsightPost as _InsightPostModel
except Exception:
    try:
        from .models import InsightPost as _InsightPostModel
    except Exception:
        _InsightPostModel = None


if _InsightPostModel is not None:
    class InsightPostForm(forms.ModelForm):
        class Meta:
            model = _InsightPostModel
            fields = "__all__"
else:
    class InsightPostForm(forms.Form):
        title = forms.CharField(label="제목", max_length=140, required=False)
        content = forms.CharField(label="본문", widget=forms.Textarea, required=False)
