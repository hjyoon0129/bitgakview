(function () {
  "use strict";

  var APPLY_API = "/access/api/premium-application/apply/";
  var STATUS_API = "/access/api/premium-application/status/";
  var ACK_API = "/access/api/premium-application/ack/";
  var STATUS_URL = "/stocks/premium/status/";
  var PRICING_URL = "/stocks/pricing/";

  function getCookie(name) {
    var value = "; " + (document.cookie || "");
    var parts = value.split("; " + name + "=");
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift() || "");
    return "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readJsonScript(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent || "{}"); } catch (e) { return null; }
  }

  function readPageAuthFlag() {
    var pageData = readJsonScript("bitgak-premium-page-data");
    if (pageData && typeof pageData.is_authenticated !== "undefined") {
      return !!pageData.is_authenticated;
    }

    if (window.BITGAK_ACCESS && typeof window.BITGAK_ACCESS.is_authenticated !== "undefined") {
      return !!window.BITGAK_ACCESS.is_authenticated;
    }

    var accessData = readJsonScript("bitgak-access-data");
    if (accessData && typeof accessData.is_authenticated !== "undefined") {
      return !!accessData.is_authenticated;
    }

    var card = document.querySelector("[data-premium-card-root]");
    if (card && card.getAttribute("data-user-authenticated") === "1") return true;

    // stock_search.html의 네브바는 로그인 상태일 때 '로그아웃' 버튼을 렌더링한다.
    // base/context 데이터가 없는 페이지에서도 이 값을 로그인 판정의 최후 보루로 쓴다.
    var logout = document.querySelector('a[href*="/accounts/logout"], form[action*="/accounts/logout"]');
    if (logout) return true;

    return false;
  }

  function isAuthenticated() {
    return readPageAuthFlag();
  }

  function loginUrl() {
    return "/accounts/login/?next=" + encodeURIComponent(window.location.pathname + window.location.search);
  }

  function ensureStyle() {
    if (document.getElementById("bitgak-premium-notice-style")) return;
    var style = document.createElement("style");
    style.id = "bitgak-premium-notice-style";
    style.textContent = [
      ".bitgak-premium-notice-open{overflow:hidden}",
      ".bitgak-premium-notice-modal{position:fixed;inset:0;z-index:1000000;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(2,6,23,.62);backdrop-filter:blur(14px)}",
      ".bitgak-premium-notice-modal.is-open{display:flex}",
      ".bitgak-premium-notice-panel{width:min(520px,calc(100vw - 28px));border:1px solid rgba(103,232,249,.28);border-radius:30px;background:linear-gradient(180deg,rgba(14,27,48,.98),rgba(6,13,26,.98));box-shadow:0 28px 80px rgba(0,0,0,.55);color:#eaf2ff;overflow:hidden;font-family:Pretendard,Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
      ".bitgak-premium-notice-head{padding:22px 24px;background:linear-gradient(135deg,#2f7df6,#20d3bc)}",
      ".bitgak-premium-notice-badge{display:inline-flex;padding:7px 11px;border-radius:999px;background:rgba(15,23,42,.35);font-size:12px;font-weight:900;color:#fff}",
      ".bitgak-premium-notice-head h2{margin:14px 0 0;color:#fff;font-size:26px;line-height:1.2;letter-spacing:-.045em}",
      ".bitgak-premium-notice-body{padding:24px}",
      ".bitgak-premium-notice-body p{margin:0;color:#cfe1ff;font-size:15px;line-height:1.7;white-space:pre-line}",
      ".bitgak-premium-notice-reply{margin-top:14px;padding:14px 15px;border:1px solid rgba(103,232,249,.20);border-radius:18px;background:rgba(15,23,42,.56);color:#f8fbff;font-weight:800;line-height:1.65;white-space:pre-line}",
      ".bitgak-premium-notice-actions{display:grid;gap:10px;margin-top:20px}",
      ".bitgak-premium-notice-primary,.bitgak-premium-notice-later{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border-radius:16px;padding:13px 16px;text-decoration:none;cursor:pointer;font-size:14px;font-weight:950}",
      ".bitgak-premium-notice-primary{border:0;background:linear-gradient(135deg,#bef264,#22d3ee);color:#06101b}",
      ".bitgak-premium-notice-later{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.48);color:#d8e7ff}",
      ".member-status-reply[hidden]{display:none!important}"
    ].join("");
    document.head.appendChild(style);
  }

  function getStateFromPayload(data) {
    if (data && data.access && data.access.is_premium) return "approved";
    if (data && data.application && data.application.status) return String(data.application.status);
    return "none";
  }

  function messageForState(state, data) {
    if (state === "approved") return "관리자가 프리미엄 1년 무료 혜택을 승인했습니다. 선택 화면에서 무료 이용권을 확인하세요.";
    if (state === "pending") return "프리미엄 1년 무료 신청이 접수되었습니다. 관리자 승인 후 이 화면에 답장이 표시됩니다.";
    if (state === "rejected") return "신청이 반려되었습니다. 필요하면 다시 신청할 수 있습니다.";
    if (!isAuthenticated()) return "로그인 후 프리미엄 1년 무료 혜택을 신청할 수 있습니다.";
    return "아래 버튼을 누르면 관리자 승인 목록에 올라갑니다. 승인 후 1년 무료 혜택이 적용됩니다.";
  }

  function ctaHtml(state, source, className) {
    className = className || "member-cta-btn";

    if (!isAuthenticated()) {
      return '<a class="' + className + ' js-login-required" href="' + loginUrl() + '">로그인하고 신청하기</a>';
    }

    if (state === "approved") {
      return '<a class="' + className + '" href="' + PRICING_URL + '">프리미엄 선택하기</a>';
    }

    if (state === "pending") {
      return '<a class="' + className + '" href="' + STATUS_URL + '">신청 검토중 확인</a>';
    }

    return '<button class="' + className + '" type="button" data-premium-apply data-premium-source="' + escapeHtml(source || "home_member_card") + '">프리미엄 1년 무료 신청</button>';
  }

  function renderHomeCard(data) {
    var state = getStateFromPayload(data || {});
    var card = document.querySelector("[data-premium-state-card]");
    var msg = document.querySelector("[data-premium-message]");
    var count = document.querySelector("[data-premium-count-label]");
    var bar = document.querySelector("[data-premium-progress-bar]");
    var reply = document.querySelector("[data-premium-admin-reply]");
    var ctaZone = document.querySelector("[data-premium-cta-zone]");

    if (card) {
      card.classList.remove("none", "pending", "approved", "rejected");
      card.classList.add(state || "none");
    }

    var approvedCount = Number((data && (data.approved_count || data.premium_approved_count)) || 0);
    var limit = Number((data && (data.free_limit || data.premium_free_limit)) || 100);
    var percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((approvedCount / limit) * 100))) : 0;

    if (count) count.textContent = "승인 " + approvedCount + "/" + limit + "명";
    if (bar) bar.style.width = percent + "%";
    if (msg) msg.textContent = messageForState(state, data);

    if (reply) {
      var text = data && data.application && data.application.admin_reply ? data.application.admin_reply : "";
      if (text && state !== "pending") {
        reply.hidden = false;
        reply.textContent = "관리자 답장: " + text;
      } else {
        reply.hidden = true;
        reply.textContent = "";
      }
    }

    if (ctaZone) {
      ctaZone.innerHTML = ctaHtml(state, "home_member_card", "member-cta-btn");
    }

    var promo = document.querySelector("[data-premium-promo-cta-zone]");
    if (promo) {
      promo.innerHTML = ctaHtml(state, "home_promo_strip", "home-promo-cta");
    }

    bindApplyButtons();
  }

  function openNotice(data) {
    ensureStyle();
    var app = data.application || {};
    var approved = app.status === "approved";
    var modal = document.createElement("div");
    modal.className = "bitgak-premium-notice-modal is-open";
    modal.setAttribute("aria-hidden", "false");

    var title = approved ? "프리미엄 1년 무료 혜택이 승인되었습니다" : "프리미엄 신청 안내";
    var badge = approved ? "승인 완료" : (app.status_label || "신청 상태");
    var reply = app.admin_reply || "관리자 답장이 등록되었습니다.";
    var body = approved
      ? "이제 차트 저장, 관심종목, 평단가 계산, 포트폴리오, 분할매수 기능을 프리미엄 기준으로 사용할 수 있습니다."
      : "프리미엄 신청 처리 결과가 도착했습니다.";

    modal.innerHTML = '' +
      '<div class="bitgak-premium-notice-panel" role="dialog" aria-modal="true">' +
        '<div class="bitgak-premium-notice-head">' +
          '<span class="bitgak-premium-notice-badge">' + escapeHtml(badge) + '</span>' +
          '<h2>' + escapeHtml(title) + '</h2>' +
        '</div>' +
        '<div class="bitgak-premium-notice-body">' +
          '<p>' + escapeHtml(body) + '</p>' +
          '<div class="bitgak-premium-notice-reply">' + escapeHtml(reply) + '</div>' +
          '<div class="bitgak-premium-notice-actions">' +
            '<a class="bitgak-premium-notice-primary" href="' + PRICING_URL + '">프리미엄 선택권 확인하기</a>' +
            '<button class="bitgak-premium-notice-later" type="button">확인했습니다</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    document.documentElement.classList.add("bitgak-premium-notice-open");

    function closeAndAck() {
      fetch(ACK_API, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken")
        },
        body: JSON.stringify({ id: app.id })
      }).catch(function () {}).finally(function () {
        modal.classList.remove("is-open");
        document.documentElement.classList.remove("bitgak-premium-notice-open");
        setTimeout(function () {
          if (modal.parentNode) modal.parentNode.removeChild(modal);
          if (approved) window.location.reload();
        }, 120);
      });
    }

    var later = modal.querySelector(".bitgak-premium-notice-later");
    if (later) later.addEventListener("click", closeAndAck);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeAndAck();
    });
  }

  function checkStatus() {
    if (!isAuthenticated()) {
      renderHomeCard({ ok: true, has_application: false, application: null, access: { is_premium: false } });
      return Promise.resolve(null);
    }

    return fetch(STATUS_API, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("status api failed " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error("bad status payload");

        if (data.access) {
          window.BITGAK_ACCESS = Object.assign({}, window.BITGAK_ACCESS || {}, data.access, { is_authenticated: true });
        }

        renderHomeCard(data);
        if (data.show_modal) openNotice(data);
        return data;
      })
      .catch(function () {
        // 로그인 상태인데 API만 실패하면 버튼을 로그인으로 되돌리지 않는다.
        // 신청이 가능하도록 안전한 기본 상태를 유지한다.
        renderHomeCard({ ok: true, has_application: false, application: null, access: { is_premium: false }, approved_count: 0, free_limit: 100 });
        return null;
      });
  }

  function applyPremium(source, message) {
    if (!isAuthenticated()) {
      window.location.href = loginUrl();
      return;
    }

    fetch(APPLY_API, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": getCookie("csrftoken")
      },
      body: JSON.stringify({
        plan: "free_365",
        source: source || "site",
        message: message || ""
      })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok || !result.data || result.data.ok === false) {
          alert((result.data && result.data.message) || "신청 중 오류가 발생했습니다.");
          return;
        }
        alert(result.data.message || "신청이 접수되었습니다.");
        checkStatus();
      })
      .catch(function () {
        alert("신청 중 오류가 발생했습니다.");
      });
  }

  function shouldBindText(el) {
    var text = (el.textContent || "").replace(/\s+/g, "");
    return text && (
      text.indexOf("1년무료") >= 0 ||
      text.indexOf("무료혜택신청") >= 0 ||
      text.indexOf("선착순100명신청") >= 0 ||
      text.indexOf("초기사용자혜택") >= 0 ||
      text.indexOf("프리미엄1년무료신청") >= 0
    );
  }

  function bindApplyButtons() {
    document.querySelectorAll("[data-premium-apply], .js-premium-apply").forEach(function (el) {
      if (el.dataset && el.dataset.premiumNoticeBound) return;
      if (el.dataset) el.dataset.premiumNoticeBound = "1";
      el.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyPremium(el.getAttribute("data-premium-source") || el.getAttribute("data-source") || "premium_button", el.getAttribute("data-premium-message") || "");
      });
    });

    // 명시적 data 속성이 없는 예전 버튼은 텍스트 기준으로만 연결한다. 모든 a/button을 무차별 차단하지 않는다.
    document.querySelectorAll("a, button").forEach(function (el) {
      if (el.dataset && el.dataset.premiumNoticeBound) return;
      if (!shouldBindText(el)) return;
      if (el.closest("[data-premium-cta-zone]") || el.closest("[data-premium-promo-cta-zone]")) return;
      if (el.dataset) el.dataset.premiumNoticeBound = "1";
      el.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyPremium(el.getAttribute("data-premium-source") || el.getAttribute("data-source") || "premium_text_button", el.getAttribute("data-premium-message") || "");
      });
    });
  }

  window.BitgakPremiumApplication = {
    apply: applyPremium,
    checkStatus: checkStatus,
    renderHomeCard: renderHomeCard,
    isAuthenticated: isAuthenticated
  };

  document.addEventListener("DOMContentLoaded", function () {
    bindApplyButtons();
    checkStatus();
  });
})();
