from django.urls import path

from . import views

app_name = "youtube_keyword"

urlpatterns = [
    path("", views.youtube_keyword_index, name="index"),
    path("download/excel/", views.youtube_keyword_excel_download, name="download_excel"),
]
