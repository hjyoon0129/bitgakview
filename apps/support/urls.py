from django.urls import path
from . import views

app_name = "support"

urlpatterns = [
    path("", views.home, name="home"),
    path("terms/", views.terms, name="terms"),
    path("privacy/", views.privacy, name="privacy"),
    path("risk/", views.risk, name="risk"),
    path("data-policy/", views.data_policy, name="data_policy"),
    path("paid-policy/", views.paid_policy, name="paid_policy"),
    path("company/", views.company, name="company"),
    path("contact/", views.contact, name="contact"),
]
