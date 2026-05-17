(function () {
  "use strict";

  function readAccess() {
    var el = document.getElementById("bitgak-access-data");

    var guest = {
      is_authenticated: false,
      is_premium: false,
      plan: "guest",
      indicator_limit: 0,
      watchlist_limit: 0,
      group_limit: 0,
      drawing_limit: 0,
      features: {}
    };

    if (!el) {
      return guest;
    }

    try {
      var data = JSON.parse(el.textContent || "{}");
      return Object.assign({}, guest, data || {});
    } catch (e) {
      return guest;
    }
  }

  var ACCESS = readAccess();
  window.BITGAK_ACCESS = ACCESS;

  function getLoginUrl() {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    return "/accounts/login/?next=" + next;
  }

  function isLoggedIn() {
    return !!ACCESS.is_authenticated;
  }

  function isPremium() {
    return !!ACCESS.is_premium;
  }

  function getNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function textNumber(text) {
    var n = parseInt(String(text || "").replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function getActiveIndicatorCount() {
    var badge = document.getElementById("activeIndicatorCount");
    if (badge) {
      var fromBadge = textNumber(badge.textContent);
      if (fromBadge > 0) {
        return fromBadge;
      }
    }

    var mobileBadge = document.getElementById("mobileActiveIndicatorBadge");
    if (mobileBadge) {
      var fromMobile = textNumber(mobileBadge.textContent);
      if (fromMobile > 0) {
        return fromMobile;
      }
    }

    var list = document.getElementById("rightIndicatorList");
    if (!list) {
      return 0;
    }

    var selectors = [
      ".indicator-list-item",
      ".active-indicator-item",
      "[data-indicator-id]",
      ".indicator-item"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var count = list.querySelectorAll(selectors[i]).length;
      if (count > 0) {
        return count;
      }
    }

    return 0;
  }

  function getGroupCount() {
    var select = document.getElementById("groupSelect");
    if (select && select.options) {
      return select.options.length || 0;
    }

    var list = document.getElementById("groupManageList");
    if (!list) {
      return 0;
    }

    return list.querySelectorAll("button, .group-manage-item, [data-group-id]").length || 0;
  }

  function getWatchlistCount() {
    var badge = document.getElementById("selectedGroupCount");
    if (badge) {
      return textNumber(badge.textContent);
    }

    var list = document.getElementById("selectedSymbolList");
    if (!list) {
      return 0;
    }

    return list.querySelectorAll(".selected-symbol-item, [data-stock-code], [data-code]").length || 0;
  }

  function closeAccessModal() {
    var modal = document.getElementById("bitgakAccessModal");
    if (!modal) {
      return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("bitgak-access-open");
  }

  function ensureModal() {
    var modal = document.getElementById("bitgakAccessModal");
    if (modal) {
      return modal;
    }

    var style = document.createElement("style");
    style.id = "bitgak-access-guard-style";
    style.textContent = `
      .bitgak-access-open {
        overflow: hidden;
      }

      .bitgak-access-modal {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background:
          radial-gradient(circle at 20% 15%, rgba(59, 130, 246, .18), transparent 28%),
          radial-gradient(circle at 78% 76%, rgba(20, 184, 166, .16), transparent 30%),
          rgba(2, 6, 23, .58);
        backdrop-filter: blur(14px) saturate(120%);
      }

      .bitgak-access-modal.is-open {
        display: flex;
      }

      .bitgak-access-panel {
        width: min(462px, calc(100vw - 28px));
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 30px;
        background:
          linear-gradient(180deg, rgba(16, 27, 47, .98) 0%, rgba(6, 13, 26, .98) 100%);
        box-shadow:
          0 28px 80px rgba(0, 0, 0, .52),
          inset 0 1px 0 rgba(255, 255, 255, .06);
        color: #eaf2ff;
        overflow: hidden;
        transform: translateY(10px) scale(.98);
        opacity: 0;
        animation: bitgakAccessIn .18s ease-out forwards;
        font-family: Pretendard, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      @keyframes bitgakAccessIn {
        to {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
      }

      .bitgak-access-top {
        position: relative;
        padding: 18px 18px 0;
        background:
          radial-gradient(circle at 20% 20%, rgba(255, 255, 255, .24), transparent 18%),
          linear-gradient(135deg, #2f7df6 0%, #1cc7b7 100%);
      }

      .bitgak-access-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        position: relative;
        z-index: 2;
      }

      .bitgak-access-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 31px;
        padding: 7px 11px;
        border-radius: 999px;
        background: rgba(15, 23, 42, .36);
        border: 1px solid rgba(255, 255, 255, .22);
        color: #fff;
        font-size: 12px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: -.02em;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12);
      }

      .bitgak-access-close {
        display: inline-grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 14px;
        background: rgba(15, 23, 42, .30);
        color: #fff;
        cursor: pointer;
        font-size: 19px;
        font-weight: 900;
        transition: transform .15s ease, background .15s ease;
      }

      .bitgak-access-close:hover {
        transform: translateY(-1px);
        background: rgba(15, 23, 42, .46);
      }

      .bitgak-access-visual {
        position: relative;
        height: 126px;
        margin-top: 16px;
        overflow: hidden;
        border-radius: 24px 24px 0 0;
        background:
          linear-gradient(180deg, rgba(8, 18, 35, .72), rgba(8, 18, 35, .92)),
          repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 1px, transparent 1px 42px),
          repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 28px);
        border: 1px solid rgba(255, 255, 255, .12);
        border-bottom: 0;
      }

      .bitgak-access-line {
        position: absolute;
        left: 26px;
        right: 26px;
        bottom: 35px;
        height: 42px;
        background:
          linear-gradient(135deg, transparent 0 16%, #67e8f9 17% 20%, transparent 21% 34%, #22c55e 35% 38%, transparent 39% 49%, #60a5fa 50% 53%, transparent 54% 68%, #f59e0b 69% 72%, transparent 73% 100%);
        filter: drop-shadow(0 0 12px rgba(103, 232, 249, .40));
        opacity: .95;
      }

      .bitgak-access-candle {
        position: absolute;
        bottom: 28px;
        width: 8px;
        border-radius: 999px;
        background: #2dd4bf;
        box-shadow: 0 0 18px rgba(45, 212, 191, .38);
      }

      .bitgak-access-candle:nth-child(2) { left: 42px; height: 26px; }
      .bitgak-access-candle:nth-child(3) { left: 86px; height: 42px; background:#fb7185; }
      .bitgak-access-candle:nth-child(4) { left: 130px; height: 34px; }
      .bitgak-access-candle:nth-child(5) { left: 188px; height: 56px; background:#60a5fa; }
      .bitgak-access-candle:nth-child(6) { left: 244px; height: 46px; background:#fb7185; }
      .bitgak-access-candle:nth-child(7) { left: 302px; height: 64px; }
      .bitgak-access-candle:nth-child(8) { left: 360px; height: 52px; background:#60a5fa; }

      .bitgak-access-body {
        padding: 24px 24px 22px;
      }

      .bitgak-access-title-row {
        display: flex;
        align-items: flex-start;
        gap: 13px;
        margin-bottom: 10px;
      }

      .bitgak-access-icon {
        flex: 0 0 auto;
        display: inline-grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 17px;
        background: rgba(47, 125, 246, .13);
        border: 1px solid rgba(96, 165, 250, .18);
        color: #67e8f9;
        font-size: 20px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
      }

      .bitgak-access-body h2 {
        margin: 0;
        color: #fff;
        font-size: 22px;
        line-height: 1.27;
        letter-spacing: -.045em;
      }

      .bitgak-access-body p {
        margin: 0;
        color: #aebdd4;
        font-size: 14px;
        line-height: 1.65;
        letter-spacing: -.018em;
      }

      .bitgak-access-points {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 16px;
      }

      .bitgak-access-point {
        padding: 10px 11px;
        border-radius: 16px;
        background: rgba(15, 23, 42, .58);
        border: 1px solid rgba(148, 163, 184, .15);
        color: #d8e7ff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: -.025em;
      }

      .bitgak-coupon-box {
        display: none;
        margin-top: 17px;
        padding: 12px;
        border-radius: 18px;
        background: rgba(15, 23, 42, .52);
        border: 1px solid rgba(148, 163, 184, .16);
      }

      .bitgak-coupon-box.is-visible {
        display: block;
      }

      .bitgak-coupon-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        color: #c7d7f2;
        font-size: 12px;
        font-weight: 900;
      }

      .bitgak-coupon-row {
        display: flex;
        gap: 8px;
      }

      .bitgak-coupon-row input {
        flex: 1;
        min-width: 0;
        height: 44px;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 15px;
        background: rgba(2, 6, 23, .58);
        color: #eaf2ff;
        padding: 0 13px;
        outline: none;
        font-weight: 800;
      }

      .bitgak-coupon-row input::placeholder {
        color: #64748b;
      }

      .bitgak-coupon-row input:focus {
        border-color: rgba(45, 212, 191, .56);
        box-shadow: 0 0 0 3px rgba(45, 212, 191, .13);
      }

      .bitgak-coupon-submit {
        flex: 0 0 auto;
        height: 44px;
        border: 0;
        border-radius: 15px;
        padding: 0 16px;
        background: linear-gradient(135deg, #2f7df6, #18c6b3);
        color: #fff;
        cursor: pointer;
        font-weight: 950;
        box-shadow: 0 12px 24px rgba(24, 198, 179, .20);
      }

      .bitgak-coupon-message {
        min-height: 19px;
        margin-top: 8px !important;
        color: #67e8f9 !important;
        font-size: 12px !important;
        font-weight: 800;
      }

      .bitgak-access-actions {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }

      .bitgak-access-primary,
      .bitgak-access-later {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 48px;
        border-radius: 17px;
        padding: 13px 16px;
        text-decoration: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 950;
        letter-spacing: -.025em;
        transition: transform .15s ease, border-color .15s ease, background .15s ease;
      }

      .bitgak-access-primary {
        border: 0;
        background: linear-gradient(135deg, #2f7df6 0%, #18c6b3 100%);
        color: #fff;
        box-shadow: 0 16px 32px rgba(47, 125, 246, .20);
      }

      .bitgak-access-later {
        border: 1px solid rgba(148, 163, 184, .20);
        background: rgba(15, 23, 42, .42);
        color: #d8e7ff;
      }

      .bitgak-access-primary:hover,
      .bitgak-access-later:hover {
        transform: translateY(-1px);
      }

      .bitgak-access-later:hover {
        border-color: rgba(148, 163, 184, .34);
        background: rgba(15, 23, 42, .60);
      }

      @media (max-width: 520px) {
        .bitgak-access-modal {
          padding: 14px;
        }

        .bitgak-access-panel {
          border-radius: 24px;
        }

        .bitgak-access-visual {
          height: 92px;
        }

        .bitgak-access-body {
          padding: 20px 18px 18px;
        }

        .bitgak-access-points {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);

    modal = document.createElement("div");
    modal.id = "bitgakAccessModal";
    modal.className = "bitgak-access-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="bitgak-access-panel" role="dialog" aria-modal="true" aria-labelledby="bitgakAccessTitle">
        <div class="bitgak-access-top">
          <div class="bitgak-access-topbar">
            <span id="bitgakAccessBadge" class="bitgak-access-badge">무료 회원</span>
            <button id="bitgakAccessClose" class="bitgak-access-close" type="button" aria-label="닫기">×</button>
          </div>
          <div class="bitgak-access-visual" aria-hidden="true">
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-candle"></span>
            <span class="bitgak-access-line"></span>
          </div>
        </div>

        <div class="bitgak-access-body">
          <div class="bitgak-access-title-row">
            <span id="bitgakAccessIcon" class="bitgak-access-icon">🔒</span>
            <div>
              <h2 id="bitgakAccessTitle">로그인 후 사용할 수 있습니다</h2>
              <p id="bitgakAccessText">비로그인 상태에서는 종목 검색, 차트 보기, 드로잉 체험만 가능합니다.</p>
            </div>
          </div>

          <div id="bitgakAccessPoints" class="bitgak-access-points"></div>

          <div id="bitgakCouponBox" class="bitgak-coupon-box">
            <div class="bitgak-coupon-label">
              <span>쿠폰으로 프리미엄 활성화</span>
              <span id="bitgakCouponHint">기간제 이용권</span>
            </div>
            <div class="bitgak-coupon-row">
              <input id="bitgakCouponInput" type="text" placeholder="쿠폰 코드 입력" autocomplete="off">
              <button id="bitgakCouponSubmit" class="bitgak-coupon-submit" type="button">등록</button>
            </div>
            <p id="bitgakCouponMessage" class="bitgak-coupon-message"></p>
          </div>

          <div class="bitgak-access-actions">
            <a id="bitgakAccessPrimary" class="bitgak-access-primary" href="/accounts/login/">무료 로그인</a>
            <button id="bitgakAccessLater" class="bitgak-access-later" type="button">나중에 할래요</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeAccessModal();
      }
    });

    var closeBtn = document.getElementById("bitgakAccessClose");
    var laterBtn = document.getElementById("bitgakAccessLater");
    var couponBtn = document.getElementById("bitgakCouponSubmit");
    var couponInput = document.getElementById("bitgakCouponInput");

    if (closeBtn) {
      closeBtn.addEventListener("click", closeAccessModal);
    }

    if (laterBtn) {
      laterBtn.addEventListener("click", closeAccessModal);
    }

    if (couponBtn) {
      couponBtn.addEventListener("click", redeemCoupon);
    }

    if (couponInput) {
      couponInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          redeemCoupon();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAccessModal();
      }
    });

    return modal;
  }

  function setPoints(items) {
    var box = document.getElementById("bitgakAccessPoints");
    if (!box) {
      return;
    }

    box.innerHTML = "";

    (items || []).forEach(function (item) {
      var div = document.createElement("div");
      div.className = "bitgak-access-point";
      div.textContent = item;
      box.appendChild(div);
    });
  }

  function openAccessModal(kind, options) {
    ensureModal();

    options = options || {};

    var title = document.getElementById("bitgakAccessTitle");
    var text = document.getElementById("bitgakAccessText");
    var badge = document.getElementById("bitgakAccessBadge");
    var icon = document.getElementById("bitgakAccessIcon");
    var primary = document.getElementById("bitgakAccessPrimary");
    var couponBox = document.getElementById("bitgakCouponBox");
    var couponMessage = document.getElementById("bitgakCouponMessage");
    var modal = document.getElementById("bitgakAccessModal");

    if (couponMessage) {
      couponMessage.textContent = "";
    }

    if (couponBox) {
      couponBox.classList.remove("is-visible");
    }

    if (!isLoggedIn() || kind === "login") {
      badge.textContent = "무료 회원";
      icon.textContent = "🔐";
      title.textContent = "로그인 후 사용할 수 있습니다";
      text.textContent = "비로그인 상태에서는 종목 검색, 차트 보기, 드로잉 체험만 가능합니다. 지표 적용과 관심종목 저장은 로그인 후 사용할 수 있습니다.";
      primary.textContent = "무료 로그인";
      primary.href = getLoginUrl();
      setPoints(["차트 검색 가능", "드로잉 체험 가능", "지표·관심종목은 로그인 필요", "평단가·포트폴리오는 프리미엄"]);
    } else if (kind === "premium") {
      badge.textContent = "프리미엄";
      icon.textContent = "✨";
      title.textContent = options.title || "프리미엄 기능입니다";
      text.textContent = options.message || "평단가 계산기와 포트폴리오는 프리미엄 회원 또는 쿠폰 이용자만 사용할 수 있습니다.";
      primary.textContent = "가격소개 보기";
      primary.href = "/stocks/pricing/";
      if (couponBox) {
        couponBox.classList.add("is-visible");
      }
      setPoints(["평단가 저장", "포트폴리오 반영", "매수·매도 기록", "프리미엄 쿠폰 사용 가능"]);
    } else {
      badge.textContent = "무료 제한";
      icon.textContent = "⚡";
      title.textContent = options.title || "무료 회원 제한입니다";
      text.textContent = options.message || "무료 회원은 지표 2개, 관심종목 10개, 종목 그룹 1개까지만 사용할 수 있습니다. 프리미엄은 제한 없이 사용할 수 있습니다.";
      primary.textContent = "가격소개 보기";
      primary.href = "/stocks/pricing/";
      if (couponBox) {
        couponBox.classList.add("is-visible");
      }
      setPoints(["지표 2개까지 무료", "관심종목 10개까지 무료", "종목 그룹 1개 무료", "프리미엄은 제한 해제"]);
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("bitgak-access-open");
  }

  function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");

    if (parts.length === 2) {
      return decodeURIComponent(parts.pop().split(";").shift() || "");
    }

    return "";
  }

  function redeemCoupon() {
    var input = document.getElementById("bitgakCouponInput");
    var message = document.getElementById("bitgakCouponMessage");
    var button = document.getElementById("bitgakCouponSubmit");
    var code = input ? input.value.trim() : "";

    if (!message) {
      return;
    }

    if (!code) {
      message.textContent = "쿠폰 코드를 입력해주세요.";
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "확인중";
    }

    message.textContent = "쿠폰을 확인하고 있습니다.";

    fetch("/access/api/redeem-coupon/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken")
      },
      body: JSON.stringify({ code: code })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        message.textContent = result.data.message || "처리되었습니다.";

        if (result.data.ok) {
          setTimeout(function () {
            window.location.reload();
          }, 850);
        }
      })
      .catch(function () {
        message.textContent = "쿠폰 등록 중 오류가 발생했습니다.";
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.textContent = "등록";
        }
      });
  }

  function blockEvent(event, kind, options) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    openAccessModal(kind, options || {});
    return false;
  }

  function isPremiumFeatureTarget(target) {
    return Boolean(
      target.closest("#openAvgDrawerBtn") ||
      target.closest("#openPortfolioDrawerBtn") ||
      target.closest("#avgSavePortfolioBtn") ||
      target.closest("#openMyStockBtn") ||
      target.closest("#portfolioSaveCapitalBtn") ||
      target.closest("#portfolioIncreaseCapitalBtn") ||
      target.closest("#portfolioResetTradesBtn") ||
      target.closest("#myStockSaveBtn") ||
      target.closest("#myStockDeleteBtn")
    );
  }

  function isLoginFeatureTarget(target) {
    return Boolean(
      target.closest("#openIndicatorBtn") ||
      target.closest("#openIndicatorBtnSide") ||
      target.closest("#indicatorQuickSearchBtn") ||
      target.closest("#addCurrentStockBtn") ||
      target.closest("#createGroupBtn") ||
      target.closest("#saveGroupBtn") ||
      target.closest("#mobileAddIndicatorBtn")
    );
  }

  function isIndicatorAddTarget(target) {
    return Boolean(
      target.closest("[data-add-indicator]") ||
      target.closest(".indicator-add-btn") ||
      target.closest(".indicator-catalog button") ||
      target.closest("#applyIndicatorSettings")
    );
  }

  function isWatchlistAddTarget(target) {
    return Boolean(
      target.closest("#addCurrentStockBtn")
    );
  }

  function isGroupCreateTarget(target) {
    return Boolean(
      target.closest("#saveGroupBtn")
    );
  }

  document.addEventListener("click", function (event) {
    var target = event.target;

    if (!target) {
      return;
    }

    if (isPremiumFeatureTarget(target)) {
      if (!isLoggedIn()) {
        return blockEvent(event, "login");
      }

      if (!isPremium()) {
        return blockEvent(event, "premium", {
          title: "프리미엄 전용 기능입니다",
          message: "평단가 계산기와 포트폴리오는 프리미엄 회원 또는 쿠폰 이용자만 사용할 수 있습니다."
        });
      }
    }

    if (isLoginFeatureTarget(target)) {
      if (!isLoggedIn()) {
        return blockEvent(event, "login");
      }
    }

    if (isLoggedIn() && !isPremium()) {
      if (isIndicatorAddTarget(target)) {
        var indicatorLimit = getNumber(ACCESS.indicator_limit, 2);
        var currentIndicators = getActiveIndicatorCount();

        if (currentIndicators >= indicatorLimit) {
          return blockEvent(event, "limit", {
            title: "지표는 " + indicatorLimit + "개까지 무료입니다",
            message: "무료 회원은 지표를 " + indicatorLimit + "개까지만 사용할 수 있습니다. 프리미엄은 지표 제한 없이 사용할 수 있습니다."
          });
        }
      }

      if (isWatchlistAddTarget(target)) {
        var watchlistLimit = getNumber(ACCESS.watchlist_limit, 10);
        var currentWatchlist = getWatchlistCount();

        if (currentWatchlist >= watchlistLimit) {
          return blockEvent(event, "limit", {
            title: "관심종목은 " + watchlistLimit + "개까지 무료입니다",
            message: "무료 회원은 관심종목을 " + watchlistLimit + "개까지만 저장할 수 있습니다. 더 많은 종목을 관리하려면 프리미엄을 이용해주세요."
          });
        }
      }

      if (isGroupCreateTarget(target)) {
        var groupLimit = getNumber(ACCESS.group_limit, 1);
        var currentGroups = getGroupCount();

        if (currentGroups >= groupLimit) {
          return blockEvent(event, "limit", {
            title: "종목 그룹은 " + groupLimit + "개까지 무료입니다",
            message: "무료 회원은 종목 그룹을 " + groupLimit + "개까지만 만들 수 있습니다. 프리미엄은 여러 그룹을 제한 없이 관리할 수 있습니다."
          });
        }
      }
    }
  }, true);

  window.BitgakAccessLock = {
    access: ACCESS,
    open: openAccessModal,
    close: closeAccessModal,
    refreshAccess: function (nextAccess) {
      ACCESS = Object.assign({}, ACCESS, nextAccess || {});
      window.BITGAK_ACCESS = ACCESS;
    }
  };
})();
