from django import forms

from .models import InsightPost


class InsightPostForm(forms.ModelForm):
    class Meta:
        model = InsightPost
        fields = [
            "title",
            "content",
            "cover_image",
            "youtube_url",
        ]

        labels = {
            "title": "제목",
            "content": "본문",
            "cover_image": "대표 이미지",
            "youtube_url": "유튜브 URL",
        }

        widgets = {
            "title": forms.TextInput(attrs={
                "class": "insight-input",
                "placeholder": "예: 삼성전자, 지금 빗각으로 보면 중요한 자리",
                "autocomplete": "off",
            }),
            "content": forms.Textarea(attrs={
                "class": "insight-textarea",
                "rows": 14,
                "placeholder": "차트에서 본 흐름, 지지선/저항선, 내가 생각하는 시나리오를 자유롭게 적어주세요.",
            }),
            "cover_image": forms.FileInput(attrs={
                "class": "insight-file-native",
                "accept": "image/*",
                "data-cover-input": "1",
            }),
            "youtube_url": forms.URLInput(attrs={
                "class": "insight-input",
                "placeholder": "선택사항: https://www.youtube.com/watch?v=... 또는 Shorts URL",
                "autocomplete": "off",
            }),
        }

    def clean_youtube_url(self):
        value = self.cleaned_data.get("youtube_url") or ""
        return value.strip()
