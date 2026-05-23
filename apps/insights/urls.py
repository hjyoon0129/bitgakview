from django.urls import path

from . import views

app_name = "insights"

urlpatterns = [
    path("", views.insight_list, name="list"),
    path("write/", views.insight_create, name="create"),
    path("<str:slug>/edit/", views.insight_update, name="update"),
    path("<str:slug>/delete/", views.insight_delete, name="delete"),
    path("<str:slug>/", views.insight_detail, name="detail"),
]
