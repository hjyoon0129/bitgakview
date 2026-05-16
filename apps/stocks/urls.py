from django.urls import path

from . import views

app_name = "stocks"


# /stocks/api/chart/<code>/ 형태도 받을 수 있게 하는 호환 래퍼
def api_chart_by_code(request, code):
    return views.api_ohlcv(request, code)


urlpatterns = [
    # 차트 데이터 API
    # stock_detail.html의 data-api-url="{% url 'stocks:api_ohlcv' stock.code %}" 와 연결
    path("api/ohlcv/<str:code>/", views.api_ohlcv, name="api_ohlcv"),

    # 기존 JS fallback: /stocks/api/chart/?code=005930
    path("api/chart/", views.api_chart, name="api_chart"),

    # 혹시 예전 코드에서 /stocks/api/chart/005930/ 형태를 쓰는 경우 대비
    path("api/chart/<str:code>/", api_chart_by_code, name="api_chart"),

    # 시장지표 API
    # stock_search.html JS가 /stocks/api/market-temperature/ 로 fetch 함
    path("api/market-temperature/", views.api_market_temperature, name="market_temperature_api"),

    # 종목 검색 메인
    path("", views.stock_search, name="search"),

    # 종목 상세 차트
    # API 라우트보다 아래에 두는 게 안전함
    path("<str:code>/", views.stock_detail, name="detail"),
]
