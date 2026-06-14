(function () {
  function getCookie(name) {
    const value = `; ${document.cookie || ""}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop().split(";").shift());
    }
    return "";
  }

  function ensureModal() {
    let modal = document.getElementById("premiumApplicationNoticeModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "premiumApplicationNoticeModal";
    modal.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "background:rgba(0,0,0,.65)",
      "padding:20px"
    ].join(";");

    modal.innerHTML = `
      <div style="width:min(520px,100%);background:#071426;border:1px solid rgba(60,180,255,.35);border-radius:22px;color:#fff;padding:26px;box-shadow:0 20px 70px rgba(0,0,0,.45);">
        <div style="font-size:13px;color:#67e8f9;font-weight:800;margin-bottom:8px;">BITGAK PREMIUM</div>
        <h2 id="premiumApplicationNoticeTitle" style="font-size:28px;margin:0 0 14px;">프리미엄 신청 안내</h2>
        <p id="premiumApplicationNoticeBody" style="white-space:pre-line;line-height:1.7;color:#dbeafe;margin:0 0 22px;"></p>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" id="premiumApplicationNoticeClose" style="border:1px solid rgba(148,163,184,.35);background:#0f172a;color:#fff;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;">확인</button>
          <a id="premiumApplicationNoticeAction" href="/stocks/pricing/" style="display:none;text-decoration:none;background:linear-gradient(135deg,#d9f93f,#22d3ee);color:#06111f;border-radius:12px;padding:12px 16px;font-weight:900;">프리미엄 선택하기</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken")
      },
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "요청 처리에 실패했습니다.");
    }
    return data;
  }

  async function getJson(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {"X-Requested-With": "XMLHttpRequest"}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "요청 처리에 실패했습니다.");
    }
    return data;
  }

  async function applyPremium(button) {
    const source = button.getAttribute("data-premium-source") || button.getAttribute("data-source") || "site";
    const plan = button.getAttribute("data-premium-plan") || "free_365";
    const message = button.getAttribute("data-premium-message") || "";

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "신청 중...";

    try {
      const data = await postJson("/access/premium/apply/", {plan, source, message});
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        window.location.href = "/access/premium/status/";
      }
    } catch (err) {
      alert(err.message || "신청 처리에 실패했습니다.");
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function checkNotice() {
    try {
      const data = await getJson("/access/premium/status/api/");
      if (!data.show_modal || !data.application) return;

      const app = data.application;
      const modal = ensureModal();
      const title = document.getElementById("premiumApplicationNoticeTitle");
      const body = document.getElementById("premiumApplicationNoticeBody");
      const action = document.getElementById("premiumApplicationNoticeAction");
      const close = document.getElementById("premiumApplicationNoticeClose");

      title.textContent = app.status === "approved" ? "프리미엄 신청이 승인되었습니다" : "프리미엄 신청 결과 안내";
      body.textContent = app.admin_reply || app.status_label || "신청 상태가 변경되었습니다.";

      if (app.status === "approved") {
        action.style.display = "inline-flex";
        action.href = "/stocks/pricing/";
      } else {
        action.style.display = "none";
      }

      modal.style.display = "flex";

      close.onclick = async function () {
        modal.style.display = "none";
        try {
          await postJson("/access/premium/ack/", {id: app.id});
        } catch (err) {}
      };
    } catch (err) {
      // 비로그인 페이지나 URL 미연결 상태에서는 조용히 무시
    }
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-premium-apply], .js-premium-apply, #premiumApplyButton");
    if (!button) return;
    event.preventDefault();
    applyPremium(button);
  });

  document.addEventListener("DOMContentLoaded", function () {
    checkNotice();
  });
})();
