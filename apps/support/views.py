from django.conf import settings
from django.contrib import messages
from django.shortcuts import redirect, render
from .forms import SupportInquiryForm


def support_context():
    return {
        "support_email": getattr(settings, "BITGAK_SUPPORT_EMAIL", "support@bitgakview.com"),
        "service_name": getattr(settings, "BITGAK_SERVICE_NAME", "BitgakView"),
        "service_domain": getattr(settings, "BITGAK_SERVICE_DOMAIN", "bitgakview.com"),
        "policy_effective_date": getattr(settings, "BITGAK_POLICY_EFFECTIVE_DATE", "2026년 5월 17일"),
    }


def home(request):
    return render(request, "support/home.html", support_context())


def terms(request):
    return render(request, "support/terms.html", support_context())


def privacy(request):
    return render(request, "support/privacy.html", support_context())


def risk(request):
    return render(request, "support/risk.html", support_context())


def data_policy(request):
    return render(request, "support/data_policy.html", support_context())


def paid_policy(request):
    return render(request, "support/paid_policy.html", support_context())


def company(request):
    return render(request, "support/company.html", support_context())


def contact(request):
    initial = {}
    if request.user.is_authenticated:
        initial["name"] = request.user.get_username()
        if getattr(request.user, "email", ""):
            initial["email"] = request.user.email

    if request.method == "POST":
        form = SupportInquiryForm(request.POST)
        if form.is_valid():
            inquiry = form.save(commit=False)
            if request.user.is_authenticated:
                inquiry.user = request.user
            inquiry.save()
            messages.success(request, "문의가 접수되었습니다. 확인 후 순차적으로 답변드리겠습니다.")
            return redirect("support:contact")
    else:
        form = SupportInquiryForm(initial=initial)

    context = support_context()
    context["form"] = form
    return render(request, "support/contact.html", context)
