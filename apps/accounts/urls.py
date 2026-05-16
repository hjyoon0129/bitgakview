from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy

from . import views


app_name = "bitgak_accounts"


urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup_view, name="signup"),
    path("logout/", views.logout_view, name="logout"),

    path(
        "password/reset/",
        auth_views.PasswordResetView.as_view(
            template_name="accounts/password_reset.html",
            email_template_name="accounts/password_reset_email.html",
            subject_template_name="accounts/password_reset_subject.txt",
            success_url=reverse_lazy("bitgak_accounts:password_reset_done"),
        ),
        name="password_reset",
    ),
    path(
        "password/reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="accounts/password_reset_done.html",
        ),
        name="password_reset_done",
    ),
    path(
        "password/reset/key/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="accounts/password_reset_from_key.html",
            success_url=reverse_lazy("bitgak_accounts:password_reset_from_key_done"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "password/reset/key/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="accounts/password_reset_from_key_done.html",
        ),
        name="password_reset_from_key_done",
    ),
]
