from django import forms
from .models import SupportInquiry


class SupportInquiryForm(forms.ModelForm):
    agree_privacy = forms.BooleanField(label="개인정보 수집 및 이용에 동의합니다.", required=True)

    class Meta:
        model = SupportInquiry
        fields = ["name", "email", "category", "subject", "message", "page_url"]
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "이름 또는 닉네임"}),
            "email": forms.EmailInput(attrs={"placeholder": "답변 받을 이메일"}),
            "subject": forms.TextInput(attrs={"placeholder": "문의 제목"}),
            "message": forms.Textarea(attrs={"placeholder": "문의 내용을 자세히 적어주세요.", "rows": 7}),
            "page_url": forms.URLInput(attrs={"placeholder": "문제가 발생한 페이지 주소가 있다면 입력"}),
        }
