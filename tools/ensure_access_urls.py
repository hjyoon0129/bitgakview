"""
config/urls.py에 /access/ include가 빠져 있으면 자동으로 추가합니다.
Windows CMD에서:
    python tools/ensure_access_urls.py
"""
from pathlib import Path

CANDIDATES = [
    Path("config/urls.py"),
    Path("bitgakview/config/urls.py"),
]


def find_urls_file():
    for path in CANDIDATES:
        if path.exists():
            return path
    for path in Path(".").rglob("urls.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "urlpatterns" in text and "django.urls" in text and "admin.site.urls" in text:
            return path
    raise SystemExit("config/urls.py 파일을 찾지 못했습니다. 프로젝트 루트에서 실행해주세요.")


def ensure_include_import(text):
    if "from django.urls import" not in text:
        return text
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("from django.urls import"):
            if "include" not in line:
                if "path" in line:
                    line = line.rstrip()
                    if line.endswith(")") and "(" in line:
                        # multi-line import는 그대로 두고 별도 import를 추가
                        lines.insert(i + 1, "from django.urls import include")
                    else:
                        line = line + ", include"
                        lines[i] = line
                else:
                    lines[i] = line + ", include"
            return "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    return text


def ensure_access_path(text):
    if 'include("apps.access.urls")' in text or "include('apps.access.urls')" in text:
        return text
    marker = "urlpatterns = ["
    if marker not in text:
        raise SystemExit("urlpatterns = [ 위치를 찾지 못했습니다.")
    return text.replace(marker, marker + '\n    path("access/", include("apps.access.urls")),', 1)


def main():
    path = find_urls_file()
    original = path.read_text(encoding="utf-8")
    updated = ensure_include_import(original)
    updated = ensure_access_path(updated)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"patched: {path}")
    else:
        print(f"already ok: {path}")


if __name__ == "__main__":
    main()
