from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SCRIPT_LINE = '<script src="{% static \'stocks/js/premium_application_notice.js\' %}?v=20260614-premium-application-v1"></script>'
TARGETS = ["templates/stocks/stock_search.html", "templates/stocks/stock_detail.html", "templates/stocks/pricing.html", "templates/stocks/features.html"]
for rel in TARGETS:
    path = ROOT / rel
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    if "premium_application_notice.js" in text:
        continue
    if "{% block extra_js %}" in text:
        text = text.replace("{% block extra_js %}", "{% block extra_js %}\n" + SCRIPT_LINE, 1)
    elif "{% endblock %}" in text:
        text = text.rsplit("{% endblock %}", 1)[0] + "\n{% block extra_js %}\n" + SCRIPT_LINE + "\n{% endblock %}\n"
    else:
        text += "\n" + SCRIPT_LINE + "\n"
    path.write_text(text, encoding="utf-8")
    print("patched", rel)
print("premium flow template patch completed")
