"""
Django settings for BitgakView project.

- .env 기반 설정
- Neon PostgreSQL / DATABASE_URL 필수
- SQLite fallback 없음
- django-allauth 기반 Google / Naver / Kakao 소셜 로그인 준비
- custom accounts는 INSTALLED_APPS에 등록하지 않고 URL/View 전용으로 사용
- templates 폴더는 BASE_DIR / "templates" 사용
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv


# =========================
# Base paths
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


# =========================
# Helpers
# =========================
def env_bool(name, default=False):
    value = os.getenv(name)

    if value is None:
        return default

    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")


def env_list(name, default=""):
    return [
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    ]


# =========================
# Core
# =========================
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set in .env")

DEBUG = env_bool("DEBUG", True)

ALLOWED_HOSTS = env_list(
    "ALLOWED_HOSTS",
    "127.0.0.1,localhost,bitgakview.com,www.bitgakview.com,bitgakview.co.kr,www.bitgakview.co.kr",
)


# =========================
# Application definition
# =========================
INSTALLED_APPS = [
    # Django 기본 앱
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    "django.contrib.sitemaps",

    # django-allauth
    "allauth",
    "allauth.account",
    "allauth.socialaccount",

    # Social providers
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.naver",
    "allauth.socialaccount.providers.kakao",

    # BitgakView apps
    "apps.stocks.apps.StocksConfig",
    "apps.support",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",

    "django.contrib.auth.middleware.AuthenticationMiddleware",

    # django-allauth 필수 middleware
    "allauth.account.middleware.AccountMiddleware",

    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [
            BASE_DIR / "templates",
        ],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",

                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",

                "apps.stocks.context_processors.stock_search_payload",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# =========================
# Database - Neon PostgreSQL only
# =========================
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL is not set in .env. "
        "BitgakView는 Neon PostgreSQL DATABASE_URL 없이는 실행하지 않습니다."
    )

DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        ssl_require=True,
    )
}


# =========================
# Password validation
# =========================
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# =========================
# Internationalization
# =========================
LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "Asia/Seoul"

USE_I18N = True
USE_TZ = True


# =========================
# Static files / Media
# =========================
STATIC_URL = "/static/"

STATIC_ROOT = BASE_DIR / "staticfiles"

STATICFILES_DIRS = (
    [BASE_DIR / "static"]
    if (BASE_DIR / "static").exists()
    else []
)

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


# =========================
# Default primary key
# =========================
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# =========================
# Sites framework
# =========================
SITE_ID = int(os.getenv("SITE_ID", "1"))


# =========================
# Login / Logout
# =========================
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/stocks/"
LOGOUT_REDIRECT_URL = "/stocks/"
ACCOUNT_LOGOUT_REDIRECT_URL = "/stocks/"


# =========================
# Authentication backends
# =========================
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]


# =========================
# django-allauth
# =========================
ACCOUNT_EMAIL_SUBJECT_PREFIX = ""

# 최신 allauth 방식
ACCOUNT_LOGIN_METHODS = {"username", "email"}
ACCOUNT_SIGNUP_FIELDS = [
    "email*",
    "username*",
    "password1*",
    "password2*",
]

ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_EMAIL_UNKNOWN_ACCOUNTS = False

ACCOUNT_SESSION_REMEMBER = None

# 소셜 로그인은 POST 버튼 방식 기본
SOCIALACCOUNT_LOGIN_ON_GET = env_bool("SOCIALACCOUNT_LOGIN_ON_GET", False)
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_RAISE_EXCEPTIONS = DEBUG

# Google / Naver 이메일 기준 기존 계정 자동 연결
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True

SOCIALACCOUNT_STORE_TOKENS = False

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": [
            "profile",
            "email",
        ],
        "AUTH_PARAMS": {
            "prompt": "select_account",
            "access_type": "online",
        },
        "EMAIL_AUTHENTICATION": True,
        "VERIFIED_EMAIL": True,
    },
    "naver": {
        "SCOPE": [
            "profile",
            "email",
        ],
    },
    "kakao": {
        "SCOPE": [
            "profile_nickname",
            "profile_image",
        ],
    },
}


# =========================
# Session / Cookie
# =========================
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"


# =========================
# CSRF / Security
# =========================
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://127.0.0.1:8000,http://localhost:8000,https://bitgakview.com,https://www.bitgakview.com,https://bitgakview.co.kr,https://www.bitgakview.co.kr",
)

if DEBUG:
    SECURE_PROXY_SSL_HEADER = None
else:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = env_bool(
    "SECURE_SSL_REDIRECT",
    False if DEBUG else True,
)

SESSION_COOKIE_SECURE = env_bool(
    "SESSION_COOKIE_SECURE",
    False if DEBUG else True,
)

CSRF_COOKIE_SECURE = env_bool(
    "CSRF_COOKIE_SECURE",
    False if DEBUG else True,
)

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

SECURE_HSTS_SECONDS = int(
    os.getenv(
        "SECURE_HSTS_SECONDS",
        "0" if DEBUG else "31536000",
    )
)

SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    False if DEBUG else True,
)

SECURE_HSTS_PRELOAD = env_bool(
    "SECURE_HSTS_PRELOAD",
    False if DEBUG else True,
)


# =========================
# Admin URL
# =========================
ADMIN_URL = os.getenv("ADMIN_URL", "admin/")


# =========================
# Email
# =========================
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)

EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)

EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")

DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL",
    "BitgakView <noreply@bitgakview.com>",
)

SERVER_EMAIL = os.getenv(
    "SERVER_EMAIL",
    DEFAULT_FROM_EMAIL,
)


# =========================
# Cache
# =========================
USE_REDIS = env_bool("USE_REDIS", False)

if USE_REDIS:
    REDIS_CACHE_URL = os.getenv("REDIS_CACHE_URL", "redis://127.0.0.1:6379/1")

    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_CACHE_URL,
            "TIMEOUT": 300,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }


# =========================
# Logging
# =========================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
}
BITGAK_SERVICE_NAME = "BitgakView"
BITGAK_SERVICE_DOMAIN = "bitgakview.com"
BITGAK_SUPPORT_EMAIL = "bitgakview@gmail.com"
BITGAK_POLICY_EFFECTIVE_DATE = "2026년 5월 17일"