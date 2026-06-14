(function () {
  "use strict";

  const form = document.getElementById("screenerForm");
  const resultsEl = document.getElementById("screenerResults");
  const statusEl = document.getElementById("screenerStatus");
  const resetBtn = document.getElementById("screenerResetBtn");
  const toastEl = document.getElementById("screenerToast");

  if (!form) return;

  const groupsApiUrl = form.dataset.groupsApiUrl || "/stocks/api/user-groups/";

  function getAccess() {
    return window.BITGAK_ACCESS || { is_authenticated: false, is_premium: false };
  }

  function openLoginGate(message) {
    if (window.BitgakAccessLock && typeof window.BitgakAccessLock.open === "function") {
      window.BitgakAccessLock.open("login", {
        title: "로그인 후 사용할 수 있습니다",
        message: message || "조건별 종목 찾기는 로그인 후 사용할 수 있습니다."
      });
      return;
    }

    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = "/accounts/login/?next=" + next;
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2600);
  }

  function getCookie(name) {
    const value = "; " + (document.cookie || "");
    const parts = value.split("; " + name + "=");
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift() || "");
    return "";
  }

  function makeGroupId() {
    return "group_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

  async function loadGroups() {
    const res = await fetch(groupsApiUrl, {
      method: "GET",
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" },
      cache: "no-store"
    });

    if (!res.ok) throw new Error("관심그룹을 불러오지 못했습니다.");
    const data = await res.json();

    const groups = Array.isArray(data.groups)
      ? data.groups
      : (data.data && Array.isArray(data.data.groups) ? data.data.groups : []);

    return {
      groups: groups.length ? groups : [{ id: makeGroupId(), name: "내 관심종목", items: [] }],
      selectedGroupId: data.selectedGroupId || data.selected_group_id || (data.data && (data.data.selectedGroupId || data.data.selected_group_id)) || ""
    };
  }

  async function saveGroups(payload) {
    const res = await fetch(groupsApiUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("관심그룹 저장에 실패했습니다.");
    return res.json().catch(function () { return {}; });
  }

  async function addToWatchlist(button) {
    if (!getAccess().is_authenticated) {
      openLoginGate("관심그룹 저장은 로그인 후 사용할 수 있습니다.");
      return;
    }

    const stock = {
      code: String(button.dataset.code || "").trim(),
      name: String(button.dataset.name || "").trim(),
      market: String(button.dataset.market || "KRX").trim() || "KRX"
    };

    if (!stock.code) return;

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "저장중";

    try {
      const payload = await loadGroups();
      let groups = Array.isArray(payload.groups) ? payload.groups : [];
      if (!groups.length) groups = [{ id: makeGroupId(), name: "내 관심종목", items: [] }];

      let selectedGroupId = payload.selectedGroupId;
      let group = groups.find(function (item) { return String(item.id) === String(selectedGroupId); });
      if (!group) {
        group = groups[0];
        selectedGroupId = group.id;
      }

      group.items = Array.isArray(group.items) ? group.items : [];

      const exists = group.items.some(function (item) {
        return String(item.code || item.stock_code || "") === stock.code;
      });

      if (!exists) {
        group.items.push(stock);
      }

      await saveGroups({ groups: groups, selectedGroupId: selectedGroupId });

      try {
        localStorage.setItem("bitgak_symbol_groups_v2", JSON.stringify(groups));
        localStorage.setItem("bitgak_selected_group_v2", selectedGroupId);
      } catch (e) {}

      button.textContent = exists ? "이미저장" : "저장완료";
      showToast(exists ? "이미 관심그룹에 있는 종목입니다." : stock.name + "을(를) 관심그룹에 저장했습니다.");
    } catch (error) {
      console.error(error);
      button.textContent = oldText;
      showToast(error.message || "관심그룹 저장 중 오류가 발생했습니다.");
    } finally {
      window.setTimeout(function () {
        button.disabled = false;
        if (button.textContent !== "관심저장") button.textContent = "관심저장";
      }, 1800);
    }
  }

  function setField(name, value) {
    const el = form.querySelector('[name="' + name + '"]');
    if (el && !el.disabled) el.value = value == null ? "" : String(value);
  }

  function clearNumericFields() {
    form.querySelectorAll("input[name]").forEach(function (input) {
      if (input.name !== "search" && input.name !== "limit" && !input.disabled) input.value = "";
    });
  }

  function applyPreset(name) {
    clearNumericFields();
    setField("market", "ALL");
    setField("limit", "50");

    if (name === "value") {
      setField("sort", "per_asc");
      setField("per_min", "0");
      setField("per_max", "10");
      setField("pbr_min", "0");
      setField("pbr_max", "1");
      setField("eps_min", "0");
    } else if (name === "dividend") {
      setField("sort", "div_desc");
      setField("pbr_min", "0");
      setField("pbr_max", "1");
      setField("eps_min", "0");
      setField("div_min", "3");
    } else if (name === "quality") {
      setField("sort", "roe_desc");
      setField("eps_min", "0");
      setField("roe_min", "8");
      setField("pbr_min", "0");
    } else if (name === "drawdown") {
      setField("sort", "drawdown_desc");
      setField("eps_min", "0");
      setField("drawdown_52w_min", "-60");
      setField("drawdown_52w_max", "-15");
      setField("trading_value_min_uk", "20");
    }
  }

  // 중요: 검색 버튼은 AJAX로 막지 않는다.
  // form 기본 GET 제출로 서버에서 바로 결과를 렌더링하므로, JS 충돌이 나도 검색이 동작한다.

  resetBtn && resetBtn.addEventListener("click", function () {
    form.reset();
    setField("market", "ALL");
    setField("sort", "per_asc");
    setField("limit", "50");
    if (statusEl) statusEl.textContent = "조건을 입력한 뒤 검색해보세요.";
    if (resultsEl) resultsEl.innerHTML = '<tr><td colspan="14"><div class="qs-empty">아직 검색 결과가 없습니다.</div></td></tr>';
    try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
  });

  form.addEventListener("click", function (event) {
    const preset = event.target.closest("[data-preset]");
    if (!preset) return;
    event.preventDefault();
    applyPreset(preset.dataset.preset || "");
  });

  resultsEl && resultsEl.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-watchlist-add]");
    if (!btn) return;
    event.preventDefault();
    addToWatchlist(btn);
  });
})();
