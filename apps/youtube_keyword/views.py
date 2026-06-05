import hashlib
import io
import zipfile
from datetime import datetime
from math import log10
from urllib.parse import quote
from xml.sax.saxutils import escape as xml_escape

from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import redirect, render
from django.utils import timezone

from .models import YoutubeKeywordDailyUsage, YoutubeKeywordPremiumGrant, YoutubeKeywordSearch


SEARCH_TYPE_LABELS = {
    "shorts": "쇼츠용 키워드",
    "longform": "일반 유튜브 키워드",
}

CATEGORY_LABELS = {
    "all": "전체",
    "stock": "주식",
    "economy": "경제",
    "life": "생활",
    "living": "리빙",
    "parenting": "육아",
    "travel": "여행",
    "it": "IT",
    "game": "게임",
    "sidejob": "부업",
    "car": "자동차",
    "etc": "기타",
}

SEARCH_TYPE_CHOICES = [
    {"value": "shorts", "label": "쇼츠용 키워드", "hint": "짧은 영상·후킹 제목 중심"},
    {"value": "longform", "label": "일반 유튜브 키워드", "hint": "롱폼·검색형 제목 중심"},
]

CATEGORY_CHOICES = [
    {"value": "all", "label": "전체", "hint": "모든 카테고리"},
    {"value": "stock", "label": "주식", "hint": "종목·차트·투자 콘텐츠"},
    {"value": "economy", "label": "경제", "hint": "금리·환율·부동산"},
    {"value": "life", "label": "생활", "hint": "생활 정보·꿀팁"},
    {"value": "living", "label": "리빙", "hint": "살림·인테리어·추천템"},
    {"value": "parenting", "label": "육아", "hint": "아이·육아템·교육"},
    {"value": "travel", "label": "여행", "hint": "여행지·맛집·코스"},
    {"value": "it", "label": "IT", "hint": "AI·앱·자동화"},
    {"value": "game", "label": "게임", "hint": "공략·시세·세팅"},
    {"value": "sidejob", "label": "부업", "hint": "수익화·블로그·스마트스토어"},
    {"value": "car", "label": "자동차", "hint": "시승·중고차·유지비"},
    {"value": "etc", "label": "기타", "hint": "일반 주제"},
]

FREE_DAILY_SEARCH_LIMIT = 3
YOUTUBE_KEYWORD_PREMIUM_PRICE_URL = "/stocks/pricing/"

SPECIAL_KEYWORD_CASES = {
    "sk하이닉스": "SK하이닉스",
    "sk 하이닉스": "SK하이닉스",
    "삼전": "삼성전자",
    "삼성 전자": "삼성전자",
    "naver": "NAVER",
    "네이버": "NAVER",
    "lg화학": "LG화학",
    "lg 화학": "LG화학",
    "lg전자": "LG전자",
    "lg 전자": "LG전자",
}

TRENDING_KEYWORDS = {
    "stock": [
        "SK하이닉스 주가", "삼성전자 주가", "두산에너빌리티 주가", "한화오션 주가",
        "현대차 주가", "NAVER 주가", "카카오 주가", "셀트리온 주가",
        "코스피 전망", "반도체 관련주", "AI 반도체 관련주", "전력설비 관련주",
        "조선주 전망", "방산주 전망", "로봇 관련주", "주식 급등주",
        "주식 차트 보는법", "분할매수 전략", "손절 기준", "장기투자 종목",
        "배당주 추천", "저평가 주식", "오늘의 주식", "주식 초보 공부",
    ],
    "economy": [
        "금리 전망", "환율 전망", "부동산 전망", "물가 상승", "경기침체 신호",
        "예금 금리", "파킹통장 금리", "CMA 비교", "대출 금리", "경제 뉴스 정리",
    ],
    "life": [
        "에어컨 전기세", "냉풍기 단점", "창문형 에어컨 소음", "여름 수면 온도",
        "전기세 절약", "생활비 절약", "가성비 추천템", "집안 습도 낮추는법",
    ],
    "living": [
        "주방 정리템", "청소 꿀팁", "수납 정리", "인테리어 소품", "가성비 가전",
        "여름 침구 추천", "욕실 청소", "냉장고 정리",
    ],
    "parenting": [
        "아기방 에어컨 온도", "2살 아기 수면", "아이와 가볼만한곳", "육아템 추천",
        "초등학생 공부습관", "아이 간식", "아기 장난감", "유모차 여행지",
    ],
    "travel": [
        "강릉 여행코스", "아이와 강릉", "서울 근교 당일치기", "가족여행 추천",
        "제주도 여행코스", "여행 준비물", "국내여행 추천", "맛집 추천",
    ],
    "it": [
        "AI 영상 만들기", "ChatGPT 활용법", "파이썬 자동화", "장고 웹사이트 만들기",
        "무료 AI 도구", "업무 자동화", "AI 블로그", "유튜브 자동화",
    ],
    "game": [
        "디아2 아이템 시세", "디아2 공략", "게임 초보 공략", "아이템 세팅",
        "모바일 게임 추천", "RPG 게임 공략", "게임 패치 정리", "돈버는 게임",
    ],
    "sidejob": [
        "스마트스토어 위탁판매", "블로그 수익화", "유튜브 쇼츠 수익", "월 30만원 부업",
        "AI 부업", "디지털 제품 판매", "제휴마케팅", "무자본 부업",
    ],
    "car": [
        "대형 SUV 추천", "중고차 살때 주의점", "자동차 유지비", "전기차 장단점",
        "하이브리드 SUV", "자동차 보험료", "패밀리카 추천", "차량 옵션 추천",
    ],
    "etc": [
        "요즘 뜨는 키워드", "초보자 가이드", "가성비 추천", "실패 이유",
        "모르면 손해", "장단점 비교", "현실 후기", "꿀팁 정리",
    ],
}

CATEGORY_SUFFIXES = {
    "stock": [
        "주가", "전망", "급등 이유", "하락 이유", "차트 분석", "실적 분석",
        "분할매수", "손절 기준", "초보 투자", "모르면 손해", "정리", "가격",
        "장단점", "비교", "관련주", "사면 안되는 이유", "실패 이유", "하는법",
    ],
    "economy": ["전망", "이유", "정리", "영향", "투자 전략", "뉴스", "초보", "비교", "주의사항"],
    "life": ["추천", "후기", "비교", "장단점", "단점", "꿀팁", "주의사항", "절약법", "현실 후기"],
    "living": ["추천템", "후기", "비교", "가성비", "단점", "청소", "정리", "필수템", "주의사항"],
    "parenting": ["추천", "후기", "주의사항", "현실", "꿀팁", "장단점", "아이", "아기", "교육"],
    "travel": ["여행코스", "맛집", "카페", "숙소", "아이와", "당일치기", "후기", "비용", "일정"],
    "it": ["사용법", "추천", "비교", "자동화", "초보자", "후기", "장단점", "무료", "업데이트"],
    "game": ["공략", "세팅", "아이템", "시세", "초보", "꿀팁", "랭킹", "패치", "노가다"],
    "sidejob": ["부업", "수익화", "현실", "초보", "실패 이유", "성공 방법", "자동화", "월수익", "시작"],
    "car": ["가격", "장단점", "유지비", "비교", "추천", "후기", "옵션", "중고차", "연비"],
    "etc": ["추천", "후기", "비교", "장단점", "방법", "주의사항", "초보자", "꿀팁", "정리"],
}

COMMON_SUFFIXES = [
    "추천", "후기", "비교", "장단점", "단점", "주의사항", "초보자",
    "꿀팁", "하는법", "정리", "가이드", "현실 후기", "모르면 손해",
]


def _normalize_keyword(keyword):
    keyword = (keyword or "").strip()
    lowered = " ".join(keyword.lower().split())
    return SPECIAL_KEYWORD_CASES.get(lowered, keyword)


def _stable_score(text, min_value=40, max_value=95):
    raw = hashlib.md5(text.encode("utf-8")).hexdigest()
    number = int(raw[:8], 16)
    return min_value + (number % (max_value - min_value + 1))


def _format_count(value):
    value = int(value or 0)
    if value >= 100000000:
        return f"{value / 100000000:.1f}억".replace(".0", "")
    if value >= 10000:
        return f"{value / 10000:.1f}만".replace(".0", "")
    return f"{value:,}"


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")



def _truthy(value):
    if callable(value):
        try:
            value = value()
        except TypeError:
            return False
    return bool(value)


def _is_youtube_keyword_premium(user):
    if not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True

    today = timezone.localdate()

    if YoutubeKeywordPremiumGrant.objects.filter(
        user=user,
        is_active=True,
    ).filter(
        models_q_starts_at(today),
        models_q_expires_at(today),
    ).exists():
        return True

    # 빗각 Access/계정 프로필에서 쓰는 프리미엄 플래그가 있으면 그대로 인정한다.
    targets = [user]
    for attr in ("profile", "access_profile", "membership", "subscription"):
        try:
            obj = getattr(user, attr, None)
        except Exception:
            obj = None
        if obj is not None:
            targets.append(obj)

    premium_attrs = (
        "is_premium", "premium", "has_premium", "is_pro", "is_paid",
        "premium_active", "is_subscription_active", "subscription_active",
    )
    for obj in targets:
        for attr in premium_attrs:
            try:
                if _truthy(getattr(obj, attr, False)):
                    return True
            except Exception:
                continue

    try:
        if user.groups.filter(name__iregex=r"premium|프리미엄|pro|paid").exists():
            return True
    except Exception:
        pass

    return False


def models_q_starts_at(today):
    from django.db.models import Q
    return Q(starts_at__isnull=True) | Q(starts_at__lte=today)


def models_q_expires_at(today):
    from django.db.models import Q
    return Q(expires_at__isnull=True) | Q(expires_at__gte=today)


def _get_today_usage(user):
    if not getattr(user, "is_authenticated", False):
        return None
    usage, _created = YoutubeKeywordDailyUsage.objects.get_or_create(
        user=user,
        date=timezone.localdate(),
        defaults={"search_count": 0},
    )
    return usage


def _youtube_keyword_access_context(user):
    is_authenticated = bool(getattr(user, "is_authenticated", False))
    is_premium = _is_youtube_keyword_premium(user) if is_authenticated else False
    used = 0

    if is_authenticated:
        usage = _get_today_usage(user)
        used = usage.search_count if usage else 0

    remaining = max(0, FREE_DAILY_SEARCH_LIMIT - used)
    return {
        "is_authenticated": is_authenticated,
        "is_premium": is_premium,
        "daily_limit": FREE_DAILY_SEARCH_LIMIT,
        "used_today": used,
        "remaining_today": remaining,
        "can_search": is_premium or remaining > 0,
        "pricing_url": YOUTUBE_KEYWORD_PREMIUM_PRICE_URL,
    }


def _increment_youtube_keyword_usage(user):
    if not getattr(user, "is_authenticated", False):
        return None
    usage = _get_today_usage(user)
    if usage:
        usage.search_count = (usage.search_count or 0) + 1
        usage.save(update_fields=["search_count", "updated_at"])
    return usage


def _login_redirect(request):
    next_url = request.get_full_path() or "/tools/youtube-keyword/"
    return redirect(f"/accounts/login/?next={quote(next_url)}")


def _dedupe(seq):
    seen = set()
    result = []
    for item in seq:
        item = " ".join(str(item).split()).strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _candidate_keywords(keyword, category):
    keyword = _normalize_keyword(keyword)
    if keyword:
        suffixes = CATEGORY_SUFFIXES.get(category, []) + COMMON_SUFFIXES
        candidates = [keyword]
        for suffix in suffixes:
            if keyword.endswith(suffix):
                candidates.append(keyword)
            else:
                candidates.append(f"{keyword} {suffix}")
        return _dedupe(candidates)

    if category == "all":
        candidates = []
        for key in ["stock", "life", "sidejob", "it", "parenting", "travel"]:
            candidates.extend(TRENDING_KEYWORDS.get(key, []))
        return _dedupe(candidates)

    return _dedupe(TRENDING_KEYWORDS.get(category, TRENDING_KEYWORDS["etc"]))


def _metric_for_keyword(candidate, category, search_type, is_popular_mode=False):
    demand = _stable_score(candidate + category + "demand", 50, 98)
    competition = _stable_score(candidate + category + "competition", 24, 88)
    freshness = _stable_score(candidate + category + "freshness", 42, 98)

    if search_type == "shorts":
        suitability = _stable_score(candidate + "shorts", 62, 99)
    else:
        suitability = _stable_score(candidate + "longform", 50, 94)

    category_boost = {
        "stock": 1.25,
        "economy": 1.10,
        "life": 1.05,
        "sidejob": 1.08,
        "it": 1.07,
    }.get(category, 1.0)

    mode_boost = 1.18 if search_type == "shorts" else 1.0
    popular_boost = 1.22 if is_popular_mode else 1.0

    raw_power = (demand * 0.44 + freshness * 0.20 + suitability * 0.18 + (100 - competition) * 0.18)
    noise = _stable_score(candidate + "views-noise", 70, 145) / 100
    estimated_views = int((raw_power ** 2) * 10.5 * category_boost * mode_boost * popular_boost * noise)
    top_avg_views = int(estimated_views * (1.15 + competition / 85))
    recent_videos = int(max(1, round((freshness / 11) + (competition / 18) + (_stable_score(candidate + "recent", 0, 8)))))

    view_velocity_score = int((estimated_views / max(recent_videos, 1)) / 220)
    view_velocity_score = max(20, min(99, view_velocity_score + _stable_score(candidate + "velocity", 15, 45)))

    if view_velocity_score >= 75:
        velocity_label = "빠름"
        velocity_rank = 3
    elif view_velocity_score >= 52:
        velocity_label = "보통"
        velocity_rank = 2
    else:
        velocity_label = "느림"
        velocity_rank = 1

    # 신사임당/노아AI식 핵심 관점: 구독자 수 대비 조회수가 높은 주제는
    # 기존 구독자 기반이 아니라 추천 알고리즘을 탄 소재일 가능성이 높다.
    subscriber_ratio_seed = _stable_score(candidate + category + "subscriber-ratio", 65, 520) / 100
    algorithm_noise = _stable_score(candidate + "algorithm-noise", 85, 135) / 100
    subscriber_view_ratio = max(0.35, subscriber_ratio_seed * algorithm_noise)
    estimated_subscribers = max(80, int(estimated_views / subscriber_view_ratio))
    subscriber_view_ratio = round(estimated_views / max(estimated_subscribers, 1), 2)

    if subscriber_view_ratio >= 3.0:
        algorithm_signal_label = "강함"
        algorithm_signal_rank = 3
    elif subscriber_view_ratio >= 1.2:
        algorithm_signal_label = "보통"
        algorithm_signal_rank = 2
    else:
        algorithm_signal_label = "약함"
        algorithm_signal_rank = 1

    algorithm_boost_score = int(
        min(99, max(20,
            subscriber_view_ratio * 14
            + view_velocity_score * 0.34
            + demand * 0.22
            + (100 - competition) * 0.18
            + freshness * 0.08
        ))
    )

    # 기본 추천점수는 “조회속도 빠름 + 수요 높음 + 경쟁강도 낮음 + 구독자 대비 조회 반응”이 위에 오도록 설계한다.
    estimated_view_score = max(20, min(99, int(log10(max(estimated_views, 10)) * 18)))
    velocity_penalty = {3: 0, 2: -5, 1: -16}.get(velocity_rank, -10)
    opportunity = int(
        view_velocity_score * 0.25
        + demand * 0.25
        + (100 - competition) * 0.22
        + algorithm_boost_score * 0.16
        + estimated_view_score * 0.08
        + freshness * 0.04
        + velocity_penalty
    )
    opportunity = max(1, min(99, opportunity))

    return {
        "demand": demand,
        "competition": competition,
        "freshness": freshness,
        "suitability": suitability,
        "estimated_views": estimated_views,
        "estimated_views_display": _format_count(estimated_views),
        "top_avg_views": top_avg_views,
        "top_avg_views_display": _format_count(top_avg_views),
        "recent_videos": recent_videos,
        "view_velocity_score": view_velocity_score,
        "view_velocity_label": velocity_label,
        "view_velocity_rank": velocity_rank,
        "estimated_subscribers": estimated_subscribers,
        "estimated_subscribers_display": _format_count(estimated_subscribers),
        "subscriber_view_ratio": subscriber_view_ratio,
        "subscriber_view_ratio_display": f"{subscriber_view_ratio:.1f}배",
        "algorithm_boost_score": algorithm_boost_score,
        "algorithm_signal_label": algorithm_signal_label,
        "algorithm_signal_rank": algorithm_signal_rank,
        "opportunity": opportunity,
    }

def _stock_title_groups(keyword, search_type):
    if search_type == "shorts":
        return [
            {
                "name": "후킹형",
                "items": [
                    f"{keyword}, 지금 봐야 하는 이유",
                    f"{keyword} 여기서 흐름이 갈릴 수 있습니다",
                    f"{keyword} 모르면 손해인 핵심 구간",
                ],
            },
            {
                "name": "검색형",
                "items": [
                    f"{keyword} 30초 차트 분석",
                    f"{keyword} 전망 핵심 정리",
                    f"{keyword} 급등 이유 빠르게 정리",
                ],
            },
            {
                "name": "분석형",
                "items": [
                    f"{keyword} 차트에서 확인할 포인트 3가지",
                    f"{keyword} 수요와 경쟁 기준으로 보는 관전 포인트",
                    f"{keyword} 상승·하락 시나리오 핵심 정리",
                ],
            },
        ]

    return [
        {
            "name": "후킹형",
            "items": [
                f"{keyword}, 지금 봐야 하는 이유",
                f"{keyword} 흐름이 바뀔 수 있는 구간",
                f"{keyword} 투자자가 놓치기 쉬운 핵심 포인트",
            ],
        },
        {
            "name": "검색형",
            "items": [
                f"{keyword} 전망과 차트 흐름 완벽 정리",
                f"{keyword} 주가 흐름과 핵심 체크포인트",
                f"{keyword} 실적·수급·차트 기준으로 보기",
            ],
        },
        {
            "name": "분석형",
            "items": [
                f"{keyword} 상승 시나리오와 하락 시나리오",
                f"{keyword} 투자자가 확인해야 할 3가지",
                f"{keyword} 차트 보는 법부터 핵심 구간까지",
            ],
        },
    ]


def _default_title_groups(keyword, search_type):
    if search_type == "shorts":
        return [
            {
                "name": "후킹형",
                "items": [
                    f"{keyword}, 이거 모르면 손해입니다",
                    f"{keyword} 대부분 여기서 실수합니다",
                    f"{keyword} 딱 30초만 보세요",
                ],
            },
            {
                "name": "검색형",
                "items": [
                    f"{keyword} 핵심 3가지",
                    f"{keyword} 장단점 빠르게 정리",
                    f"{keyword} 초보자 가이드",
                ],
            },
            {
                "name": "분석형",
                "items": [
                    f"{keyword} 선택 전에 확인할 것",
                    f"{keyword} 현실 후기와 주의사항",
                    f"{keyword} 쉽게 이해하는 방법",
                ],
            },
        ]

    return [
        {
            "name": "후킹형",
            "items": [
                f"{keyword}, 지금 알아야 할 핵심",
                f"{keyword} 모르면 손해 보는 체크포인트",
                f"{keyword} 사람들이 자주 놓치는 부분",
            ],
        },
        {
            "name": "검색형",
            "items": [
                f"{keyword} 완벽 정리｜초보자도 이해하는 핵심 가이드",
                f"{keyword} 장단점과 현실적인 선택 기준",
                f"{keyword} 처음 시작하는 사람을 위한 전체 흐름",
            ],
        },
        {
            "name": "분석형",
            "items": [
                f"{keyword} 비교 분석｜무엇을 선택해야 할까?",
                f"{keyword} 실제 후기와 추천 기준",
                f"{keyword} 실패하지 않는 방법",
            ],
        },
    ]


def _title_groups(keyword, category, search_type):
    if category == "stock":
        return _stock_title_groups(keyword, search_type)
    return _default_title_groups(keyword, search_type)


def _tag_groups(keyword, category, search_type):
    keyword_no_space = keyword.replace(" ", "")
    category_label = CATEGORY_LABELS.get(category, "")

    core = _dedupe([
        keyword_no_space,
        keyword,
        f"{keyword_no_space}추천",
        f"{keyword_no_space}정리",
    ])

    if category == "stock":
        expansion = _dedupe([
            f"{keyword_no_space}전망",
            f"{keyword_no_space}주가",
            f"{keyword_no_space}차트",
            "주식",
            "국내주식",
            "주식차트",
            "차트분석",
            "빗각분석",
        ])
    else:
        expansion = _dedupe([
            category_label,
            "유튜브키워드",
            "키워드분석",
            "콘텐츠아이디어",
            "영상아이디어",
            "쇼츠" if search_type == "shorts" else "유튜브영상",
        ])

    return [
        {"name": "핵심 태그", "items": core[:6]},
        {"name": "확장 태그", "items": expansion[:10]},
    ]


def _flatten_title_groups(groups):
    items = []
    for group in groups:
        items.extend(group.get("items", []))
    return items


def _flatten_tag_groups(groups):
    items = []
    for group in groups:
        items.extend(group.get("items", []))
    return _dedupe(items)


def build_keyword_rows(keyword, category, search_type):
    normalized = _normalize_keyword(keyword)
    is_popular_mode = not normalized
    candidates = _candidate_keywords(normalized, category)
    rows = []

    for candidate in candidates:
        metric = _metric_for_keyword(candidate, category, search_type, is_popular_mode=is_popular_mode)
        title_groups = _title_groups(candidate, category, search_type)
        tag_groups = _tag_groups(candidate, category, search_type)
        rows.append({
            "keyword": candidate,
            **metric,
            "title_groups": title_groups,
            "tag_groups": tag_groups,
            "titles": _flatten_title_groups(title_groups),
            "tags": _flatten_tag_groups(tag_groups),
        })

    # 최초 정렬은 검색어 유무와 관계없이 “조회속도 빠름 + 수요 높음 + 경쟁 낮음”을 우선한다.
    rows.sort(
        key=lambda item: (
            item["opportunity"],
            item["algorithm_boost_score"],
            item["subscriber_view_ratio"],
            item["view_velocity_score"],
            item["demand"],
            -item["competition"],
            item["estimated_views"],
        ),
        reverse=True,
    )

    return rows[:30]


SORTABLE_KEYS = {
    "estimated_views",
    "top_avg_views",
    "recent_videos",
    "view_velocity_score",
    "subscriber_view_ratio",
    "algorithm_boost_score",
    "demand",
    "competition",
    "opportunity",
}


def _sort_rows(rows, sort_key="opportunity", sort_dir="desc"):
    sort_key = sort_key if sort_key in SORTABLE_KEYS else "opportunity"
    sort_dir = "asc" if sort_dir == "asc" else "desc"

    def safe_number(row, key):
        try:
            return float(row.get(key, 0) or 0)
        except (TypeError, ValueError):
            return 0

    def base_key(row):
        value = safe_number(row, sort_key)
        if sort_dir == "desc":
            value = -value
        return (
            value,
            -safe_number(row, "opportunity"),
            -safe_number(row, "algorithm_boost_score"),
            -safe_number(row, "subscriber_view_ratio"),
            -safe_number(row, "view_velocity_score"),
            -safe_number(row, "demand"),
            safe_number(row, "competition"),
            str(row.get("keyword", "")),
        )

    return sorted(rows, key=base_key)


def _column_letter(index):
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _xlsx_cell(row_index, col_index, value, style_id=None):
    ref = f"{_column_letter(col_index)}{row_index}"
    style_attr = f' s="{style_id}"' if style_id is not None else ""

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'

    text = xml_escape(str(value if value is not None else ""))
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t>{text}</t></is></c>'


def _safe_sheet_name(name):
    cleaned = str(name or "Sheet").strip()
    for ch in '[]:*?/\\':
        cleaned = cleaned.replace(ch, " ")
    cleaned = " ".join(cleaned.split())[:31]
    return cleaned or "Sheet"


def _build_sheet_xml(headers, rows, widths=None):
    row_xml = []
    header_cells = "".join(_xlsx_cell(1, idx + 1, header, style_id=1) for idx, header in enumerate(headers))
    row_xml.append(f'<row r="1">{header_cells}</row>')

    for row_idx, row in enumerate(rows, start=2):
        cells = "".join(_xlsx_cell(row_idx, col_idx + 1, value) for col_idx, value in enumerate(row))
        row_xml.append(f'<row r="{row_idx}">{cells}</row>')

    last_col = _column_letter(len(headers))
    last_row = max(len(rows) + 1, 1)
    if widths is None:
        widths = [24] * len(headers)
    widths = list(widths) + [18] * max(0, len(headers) - len(widths))
    cols_xml = "".join(
        f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>'
        for idx, width in enumerate(widths[:len(headers)], start=1)
    )

    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <cols>{cols_xml}</cols>
  <sheetData>{''.join(row_xml)}</sheetData>
  <autoFilter ref="A1:{last_col}{last_row}"/>
</worksheet>'''


def _build_xlsx_bytes(sheets):
    output = io.BytesIO()
    sheets = sheets or []
    if not sheets:
        sheets = [{"name": "유튜브키워드", "headers": ["내용"], "rows": [], "widths": [30]}]

    workbook_sheet_xml = []
    workbook_rel_xml = []
    content_type_overrides = []
    worksheet_files = []
    used_names = set()

    for idx, sheet in enumerate(sheets, start=1):
        base_name = _safe_sheet_name(sheet.get("name") or f"Sheet{idx}")
        name = base_name
        suffix = 2
        while name in used_names:
            trimmed = base_name[: max(1, 31 - len(str(suffix)) - 1)]
            name = f"{trimmed}_{suffix}"
            suffix += 1
        used_names.add(name)

        workbook_sheet_xml.append(f'<sheet name="{xml_escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>')
        workbook_rel_xml.append(
            f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
        )
        content_type_overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
        worksheet_files.append((f"xl/worksheets/sheet{idx}.xml", _build_sheet_xml(
            sheet.get("headers", []),
            sheet.get("rows", []),
            sheet.get("widths", []),
        )))

    style_rel_id = len(sheets) + 1
    workbook_rels = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {''.join(workbook_rel_xml)}
  <Relationship Id="rId{style_rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

    workbook_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{''.join(workbook_sheet_xml)}</sheets>
</workbook>'''

    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

    content_types = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  {''.join(content_type_overrides)}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''

    styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF000000"/><name val="맑은 고딕"/></font>
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="맑은 고딕"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
</styleSheet>'''

    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        for filename, xml in worksheet_files:
            zf.writestr(filename, xml)
        zf.writestr("xl/styles.xml", styles_xml)

    return output.getvalue()


def youtube_keyword_excel_download(request):
    if not getattr(request.user, "is_authenticated", False):
        return _login_redirect(request)

    access = _youtube_keyword_access_context(request.user)
    if not access["is_premium"] and access["used_today"] > access["daily_limit"]:
        return HttpResponseForbidden("오늘 무료 검색 가능 횟수를 모두 사용했습니다. 프리미엄 이용 후 엑셀 다운로드가 가능합니다.")

    keyword = _normalize_keyword(request.GET.get("keyword", ""))
    search_type = request.GET.get("search_type", "shorts")
    category = request.GET.get("category", "stock")
    sort_key = request.GET.get("sort_key", "opportunity")
    sort_dir = request.GET.get("sort_dir", "desc")

    if search_type not in SEARCH_TYPE_LABELS:
        search_type = "shorts"

    if category not in CATEGORY_LABELS:
        category = "stock"

    rows = build_keyword_rows(keyword, category, search_type)
    rows = _sort_rows(rows, sort_key, sort_dir)

    keyword_headers = [
        "키워드",
        "예상조회",
        "상위평균조회",
        "최근영상수",
        "조회속도",
        "조회속도점수",
        "예상구독자",
        "구독대비조회수",
        "알고리즘신호",
        "알고리즘점수",
        "수요도",
        "경쟁강도",
        "기회점수",
    ]
    keyword_rows = []
    for row in rows:
        keyword_rows.append([
            row.get("keyword", ""),
            int(row.get("estimated_views", 0) or 0),
            int(row.get("top_avg_views", 0) or 0),
            int(row.get("recent_videos", 0) or 0),
            row.get("view_velocity_label", ""),
            int(row.get("view_velocity_score", 0) or 0),
            int(row.get("estimated_subscribers", 0) or 0),
            row.get("subscriber_view_ratio_display", ""),
            row.get("algorithm_signal_label", ""),
            int(row.get("algorithm_boost_score", 0) or 0),
            int(row.get("demand", 0) or 0),
            int(row.get("competition", 0) or 0),
            int(row.get("opportunity", 0) or 0),
        ])

    title_headers = ["키워드", "제목 아이디어", "예상조회", "조회속도", "구독대비조회수", "알고리즘신호", "수요도", "경쟁강도", "기회점수"]
    title_sheets = {"후킹형": [], "검색형": [], "분석형": []}
    for row in rows:
        group_map = {group.get("name"): group.get("items", []) for group in row.get("title_groups", [])}
        for group_name in title_sheets.keys():
            for title in group_map.get(group_name, []):
                title_sheets[group_name].append([
                    row.get("keyword", ""),
                    title,
                    int(row.get("estimated_views", 0) or 0),
                    row.get("view_velocity_label", ""),
                    row.get("subscriber_view_ratio_display", ""),
                    row.get("algorithm_signal_label", ""),
                    int(row.get("demand", 0) or 0),
                    int(row.get("competition", 0) or 0),
                    int(row.get("opportunity", 0) or 0),
                ])

    tag_headers = ["키워드", "태그구분", "태그", "예상조회", "조회속도", "구독대비조회수", "알고리즘신호", "수요도", "경쟁강도", "기회점수"]
    tag_rows = []
    for row in rows:
        for group in row.get("tag_groups", []):
            group_name = group.get("name", "태그")
            for tag in group.get("items", []):
                tag_rows.append([
                    row.get("keyword", ""),
                    group_name,
                    tag,
                    int(row.get("estimated_views", 0) or 0),
                    row.get("view_velocity_label", ""),
                    row.get("subscriber_view_ratio_display", ""),
                    row.get("algorithm_signal_label", ""),
                    int(row.get("demand", 0) or 0),
                    int(row.get("competition", 0) or 0),
                    int(row.get("opportunity", 0) or 0),
                ])

    sheets = [
        {"name": "키워드", "headers": keyword_headers, "rows": keyword_rows, "widths": [30, 13, 15, 12, 12, 14, 14, 14, 14, 14, 10, 12, 12]},
        {"name": "후킹형", "headers": title_headers, "rows": title_sheets["후킹형"], "widths": [30, 58, 13, 12, 14, 14, 10, 12, 12]},
        {"name": "검색형", "headers": title_headers, "rows": title_sheets["검색형"], "widths": [30, 58, 13, 12, 14, 14, 10, 12, 12]},
        {"name": "분석형", "headers": title_headers, "rows": title_sheets["분석형"], "widths": [30, 58, 13, 12, 14, 14, 10, 12, 12]},
        {"name": "태그", "headers": tag_headers, "rows": tag_rows, "widths": [30, 14, 28, 13, 12, 14, 14, 10, 12, 12]},
    ]

    xlsx_bytes = _build_xlsx_bytes(sheets)

    base_name = keyword if keyword else f"{CATEGORY_LABELS[category]}_인기키워드"
    safe_name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in base_name)[:40] or "youtube_keyword"
    date_stamp = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"youtube_keyword_{safe_name}_{date_stamp}.xlsx"

    response = HttpResponse(
        xlsx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    encoded_filename = quote(filename)
    response["Content-Disposition"] = f"attachment; filename=\"youtube_keyword.xlsx\"; filename*=UTF-8''{encoded_filename}"
    return response


def youtube_keyword_index(request):
    keyword = _normalize_keyword(request.GET.get("keyword", ""))
    search_type = request.GET.get("search_type", "shorts")
    category = request.GET.get("category", "stock")
    has_search_request = bool(request.GET)

    if search_type not in SEARCH_TYPE_LABELS:
        search_type = "shorts"

    if category not in CATEGORY_LABELS:
        category = "stock"

    access = _youtube_keyword_access_context(request.user)
    result = None
    access_message = ""
    access_block_kind = ""

    if not access["is_authenticated"]:
        access_block_kind = "login"
        access_message = "유튜브 키워드 분석기는 로그인 후 사용할 수 있습니다. 무료 회원은 하루 3회 검색할 수 있습니다."
    elif not access["can_search"] and has_search_request:
        access_block_kind = "premium"
        access_message = "오늘 무료 검색 3회를 모두 사용했습니다. 프리미엄으로 전환하면 유튜브 키워드 검색을 제한 없이 사용할 수 있습니다."
    else:
        rows = build_keyword_rows(keyword, category, search_type)
        first_row = rows[0] if rows else None
        is_popular_mode = not keyword

        result = {
            "keyword": keyword,
            "summary_keyword": keyword if keyword else f"{CATEGORY_LABELS[category]} 인기 키워드",
            "search_type": search_type,
            "search_type_label": SEARCH_TYPE_LABELS[search_type],
            "category": category,
            "category_label": CATEGORY_LABELS[category],
            "rows": rows,
            "first_row": first_row,
            "is_popular_mode": is_popular_mode,
            "notice": (
                "검색어가 없어 선택한 카테고리의 인기 후보를 수요 대비 경쟁이 낮은 순으로 정렬했습니다."
                if is_popular_mode else
                "조회속도가 빠르고 수요가 높으며 경쟁강도가 낮고, 구독자 대비 조회 반응이 좋은 키워드가 위에 오도록 정렬했습니다."
            ),
        }

        if has_search_request:
            if not access["is_premium"]:
                _increment_youtube_keyword_usage(request.user)
                access = _youtube_keyword_access_context(request.user)

            YoutubeKeywordSearch.objects.create(
                user=request.user if request.user.is_authenticated else None,
                keyword=keyword if keyword else f"[{CATEGORY_LABELS[category]}] 인기 키워드",
                search_type=search_type,
                category=category,
                result_json=result,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:1000],
            )

    context = {
        "keyword": keyword,
        "search_type": search_type,
        "category": category,
        "search_type_label": SEARCH_TYPE_LABELS[search_type],
        "category_label": CATEGORY_LABELS[category],
        "search_type_choices": SEARCH_TYPE_CHOICES,
        "category_choices": CATEGORY_CHOICES,
        "result": result,
        "ytk_access": access,
        "access_message": access_message,
        "access_block_kind": access_block_kind,
    }
    return render(request, "youtube_keyword/youtube_keyword.html", context)
