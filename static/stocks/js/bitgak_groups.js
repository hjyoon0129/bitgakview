(function () {
  if (window.__BITGAK_GROUPS_LOADED__) return;
  window.__BITGAK_GROUPS_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  if (!app) return;

  const currentStock = {
    code: app.dataset.code || "",
    name: app.dataset.name || "현재 종목",
    market: app.dataset.market || "KRX",
  };

  const STORAGE_KEY = "bitgak_symbol_groups_v2";
  const SELECTED_KEY = "bitgak_selected_group_v2";
  const GROUPS_API_URL = app.dataset.groupsApiUrl || "/stocks/api/user-groups/";

  const groupSelect = document.getElementById("groupSelect");
  let groupCustomSelect = null;
  const selectedGroupName = document.getElementById("selectedGroupName");
  const selectedGroupCount = document.getElementById("selectedGroupCount");
  const selectedSymbolList = document.getElementById("selectedSymbolList");

  const groupManageList = document.getElementById("groupManageList");
  const groupModal = document.getElementById("groupModal");
  const createGroupBtn = document.getElementById("createGroupBtn");
  const addCurrentStockBtn = document.getElementById("addCurrentStockBtn");
  const groupNameInput = document.getElementById("groupNameInput");
  const saveGroupBtn = document.getElementById("saveGroupBtn");

  const openMobileWatchBtn = document.getElementById("openMobileWatchlistBtn");
  const mobileWatchModal = document.getElementById("mobileWatchlistModal");
  const mobileWatchGroupSelect = document.getElementById("mobileWatchGroupSelect");
  const mobileWatchGroupCustom = document.getElementById("mobileWatchGroupCustom");
  const mobileWatchGroupBtn = document.getElementById("mobileWatchGroupBtn");
  const mobileWatchGroupBtnText = document.getElementById("mobileWatchGroupBtnText");
  const mobileWatchGroupMenu = document.getElementById("mobileWatchGroupMenu");
  const mobileWatchCurrentGroupName = document.getElementById("mobileWatchCurrentGroupName");
  const mobileWatchlistCount = document.getElementById("mobileWatchlistCount");
  const mobileWatchlistBadge = document.getElementById("mobileWatchlistBadge");
  const mobileWatchlistList = document.getElementById("mobileWatchlistList");
  const mobileWatchAddCurrentBtn = document.getElementById("mobileWatchAddCurrentBtn");
  const mobileWatchManageBtn = document.getElementById("mobileWatchManageBtn");

  if (!groupSelect || !selectedGroupName || !selectedGroupCount || !selectedSymbolList) return;

  let groups = loadGroups();
  let selectedGroupId = getInitialSelectedGroupId();
  let serverSyncLoading = false;
  let serverSaveTimer = null;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function makeId() {
    return "group_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

  function stockHref(code) {
    return "/stocks/" + encodeURIComponent(code || "") + "/";
  }

  function trashIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function getCookie(name) {
    const value = `; ${document.cookie || ""}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift());
    return "";
  }

  function isAuthenticated() {
    return !!(window.BITGAK_ACCESS && window.BITGAK_ACCESS.is_authenticated);
  }

  function requireLoginForWatchlist() {
    if (isAuthenticated()) return true;

    if (window.BitgakAccessLock && typeof window.BitgakAccessLock.open === "function") {
      window.BitgakAccessLock.open("login", {
        title: "로그인 후 사용할 수 있습니다",
        message: "관심종목 저장은 로그인 후 사용할 수 있습니다. 로그인하면 PC와 모바일에서 같은 관심종목을 불러옵니다.",
      });
    } else {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/accounts/login/?next=" + next;
    }

    return false;
  }

  function normalizeStockItem(item) {
    item = item || {};
    const code = String(item.code || item.stock_code || "").trim();
    if (!code) return null;
    return {
      code,
      name: String(item.name || item.stock_name || code).trim(),
      market: String(item.market || "KRX").trim() || "KRX",
    };
  }

  function normalizeGroup(group, index) {
    group = group || {};
    const items = Array.isArray(group.items) ? group.items.map(normalizeStockItem).filter(Boolean) : [];
    return {
      id: String(group.id || group.pk || makeId() + "_" + index),
      name: String(group.name || "내 관심종목").trim() || "내 관심종목",
      items,
    };
  }

  function defaultGroups() {
    return [{ id: makeId(), name: "내 관심종목", items: [] }];
  }

  function loadGroups() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) return saved.map(normalizeGroup);
    } catch (e) {}
    return defaultGroups();
  }

  function saveLocalSnapshot() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); } catch (e) {}
    try { localStorage.setItem(SELECTED_KEY, selectedGroupId || (groups[0] && groups[0].id) || ""); } catch (e) {}
  }

  function getInitialSelectedGroupId() {
    const savedId = localStorage.getItem(SELECTED_KEY);
    if (savedId && groups.some(function (group) { return group.id === savedId; })) {
      return savedId;
    }
    return groups[0] ? groups[0].id : "";
  }

  function ensureGroup() {
    if (Array.isArray(groups) && groups.length) return;
    groups = defaultGroups();
    selectedGroupId = groups[0].id;
    saveLocalSnapshot();
  }

  function getSelectedGroup() {
    ensureGroup();

    let group = groups.find(function (item) {
      return item.id === selectedGroupId;
    });

    if (!group) {
      group = groups[0];
      selectedGroupId = group.id;
      saveLocalSnapshot();
    }

    return group;
  }

  function hasAnySavedStock(list) {
    return (list || []).some(function (group) {
      return group && Array.isArray(group.items) && group.items.length > 0;
    });
  }

  function normalizeServerPayload(payload) {
    payload = payload || {};
    const rawGroups = Array.isArray(payload.groups)
      ? payload.groups
      : (payload.data && Array.isArray(payload.data.groups) ? payload.data.groups : []);

    const fixedGroups = rawGroups.map(normalizeGroup).filter(Boolean);
    const selected = payload.selectedGroupId || payload.selected_group_id || (payload.data && (payload.data.selectedGroupId || payload.data.selected_group_id)) || "";

    return {
      groups: fixedGroups.length ? fixedGroups : defaultGroups(),
      selectedGroupId: selected,
    };
  }

  async function fetchServerGroups() {
    if (!isAuthenticated() || serverSyncLoading) return false;

    const localBeforeFetch = groups.map(function (group) {
      return {
        id: group.id,
        name: group.name,
        items: (group.items || []).slice(),
      };
    });

    serverSyncLoading = true;

    try {
      const res = await fetch(GROUPS_API_URL, {
        method: "GET",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("groups api failed");

      const data = await res.json();
      const normalized = normalizeServerPayload(data);
      const serverLooksEmpty = !hasAnySavedStock(normalized.groups);
      const localHasData = hasAnySavedStock(localBeforeFetch);

      if (serverLooksEmpty && localHasData) {
        groups = localBeforeFetch;
        if (!groups.some(function (g) { return g.id === selectedGroupId; })) selectedGroupId = groups[0].id;
        saveGroups();
        renderAll();
        return true;
      }

      groups = normalized.groups;

      if (normalized.selectedGroupId && groups.some(function (g) { return g.id === normalized.selectedGroupId; })) {
        selectedGroupId = normalized.selectedGroupId;
      } else if (!groups.some(function (g) { return g.id === selectedGroupId; })) {
        selectedGroupId = groups[0].id;
      }

      saveLocalSnapshot();
      renderAll();
      document.dispatchEvent(new CustomEvent("bitgak:groups-synced", {
        detail: { groups: groups, selectedGroupId: selectedGroupId },
      }));
      return true;
    } catch (e) {
      console.warn("Bitgak groups server sync fallback to localStorage:", e);
      return false;
    } finally {
      serverSyncLoading = false;
    }
  }

  function saveGroups() {
    ensureGroup();
    saveLocalSnapshot();

    if (!isAuthenticated()) return;

    clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(async function () {
      try {
        const res = await fetch(GROUPS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          credentials: "same-origin",
          body: JSON.stringify({
            groups: groups,
            selectedGroupId: selectedGroupId,
          }),
        });

        if (!res.ok) throw new Error("groups save failed");
      } catch (e) {
        console.warn("Bitgak groups server save failed. Local backup kept:", e);
      }
    }, 220);
  }

  function setSelectedGroupId(id) {
    if (!id) return;
    selectedGroupId = id;
    saveGroups();
  }

  function addCurrentStockToSelectedGroup(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!requireLoginForWatchlist()) return;

    const group = getSelectedGroup();

    const exists = group.items.some(function (item) {
      return item.code === currentStock.code;
    });

    if (!exists && currentStock.code) {
      group.items.push({
        code: currentStock.code,
        name: currentStock.name,
        market: currentStock.market || "KRX",
      });
    }

    saveGroups();
    renderAll();
  }

  function removeStockFromSelectedGroup(code) {
    const group = getSelectedGroup();
    group.items = (group.items || []).filter(function (item) {
      return item.code !== code;
    });

    saveGroups();
    renderAll();
  }

  function ensureGroupCustomSelect() {
    if (!groupSelect || groupCustomSelect) return;

    groupSelect.classList.add("bv-select-native-hidden");

    groupCustomSelect = document.createElement("div");
    groupCustomSelect.id = "groupSelectCustom";
    groupCustomSelect.className = "bv-select group-custom-select";
    groupSelect.insertAdjacentElement("afterend", groupCustomSelect);

    groupCustomSelect.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-bv-select-btn]");
      if (btn) {
        event.preventDefault();
        event.stopPropagation();
        const wasOpen = groupCustomSelect.classList.contains("open");
        closeGroupCustomSelect();
        if (!wasOpen) groupCustomSelect.classList.add("open");
        return;
      }

      const option = event.target.closest("[data-group-select-option]");
      if (!option) return;

      event.preventDefault();
      event.stopPropagation();

      setSelectedGroupId(option.dataset.groupId);
      renderAll();
      closeGroupCustomSelect();
    });
  }

  function closeGroupCustomSelect() {
    if (groupCustomSelect) groupCustomSelect.classList.remove("open");
  }

  function renderGroupCustomSelect() {
    ensureGroupCustomSelect();
    if (!groupCustomSelect) return;

    const selected = getSelectedGroup();

    groupCustomSelect.innerHTML = `
      <button type="button" class="bv-select-btn" data-bv-select-btn aria-haspopup="listbox" aria-expanded="false">
        <span class="bv-select-label">${escapeHtml(selected.name)} (${selected.items.length})</span>
      </button>
      <div class="bv-select-menu" role="listbox">
        ${groups.map(function (group) {
          return `
            <button type="button" class="bv-select-option ${group.id === selectedGroupId ? "active" : ""}" data-group-select-option data-group-id="${escapeHtml(group.id)}">
              <span>${escapeHtml(group.name)} (${group.items.length})</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderGroupSelect() {
    ensureGroup();

    groupSelect.innerHTML = "";

    groups.forEach(function (group) {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = `${group.name} (${group.items.length})`;
      option.selected = group.id === selectedGroupId;
      groupSelect.appendChild(option);
    });

    renderGroupCustomSelect();
  }

  function renderSelectedGroup() {
    const group = getSelectedGroup();

    selectedGroupName.textContent = group.name;
    selectedGroupCount.textContent = group.items.length;
    selectedSymbolList.innerHTML = "";

    if (!group.items.length) {
      selectedSymbolList.innerHTML = `
        <div class="symbol-empty small">
          아직 종목이 없습니다. 현재 종목을 추가하려면 [종목추가]를 누르세요.
        </div>
      `;
      return;
    }

    group.items.forEach(function (item) {
      const row = document.createElement("div");
      row.className = "symbol-row";
      row.dataset.stockCode = item.code;

      row.innerHTML = `
        <a href="${stockHref(item.code)}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.code)}</span>
        </a>

        <button
          type="button"
          class="symbol-trash-btn"
          data-remove-stock="${escapeHtml(item.code)}"
          title="종목 삭제"
          aria-label="종목 삭제"
        >
          ${trashIcon()}
        </button>
      `;

      selectedSymbolList.appendChild(row);
    });
  }

  function renderManageList() {
    if (!groupManageList) return;

    groupManageList.innerHTML = "";

    if (!groups.length) {
      groupManageList.innerHTML = '<div class="symbol-empty">생성된 그룹이 없습니다.</div>';
      return;
    }

    groups.forEach(function (group) {
      const row = document.createElement("div");
      row.className = "group-manage-row";

      row.innerHTML = `
        <input type="text" value="${escapeHtml(group.name)}" data-rename-group="${escapeHtml(group.id)}">
        <button type="button" data-delete-group="${escapeHtml(group.id)}">삭제</button>
      `;

      groupManageList.appendChild(row);
    });
  }

  function closeMobileWatchGroupMenu() {
    if (mobileWatchGroupCustom) mobileWatchGroupCustom.classList.remove("open");
    if (mobileWatchGroupBtn) mobileWatchGroupBtn.setAttribute("aria-expanded", "false");
  }

  function toggleMobileWatchGroupMenu() {
    if (!mobileWatchGroupCustom || !mobileWatchGroupBtn) return;
    const willOpen = !mobileWatchGroupCustom.classList.contains("open");
    mobileWatchGroupCustom.classList.toggle("open", willOpen);
    mobileWatchGroupBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function renderMobileWatchlistGroupMenu(group) {
    if (mobileWatchGroupBtnText) {
      mobileWatchGroupBtnText.innerHTML = `
        <span class="mobile-watchlist-selected-name">${escapeHtml(group.name)}</span>
      `;
    }

    if (!mobileWatchGroupMenu) return;

    mobileWatchGroupMenu.innerHTML = groups.map(function (item) {
      const active = item.id === selectedGroupId;
      return `
        <button
          type="button"
          class="mobile-watchlist-select-option ${active ? "active" : ""}"
          data-mobile-watch-group="${escapeHtml(item.id)}"
          role="option"
          aria-selected="${active ? "true" : "false"}"
        >
          <span>${escapeHtml(item.name)}</span>
          <b>${Number(item.items.length || 0)}</b>
        </button>
      `;
    }).join("");
  }

  function renderMobileWatchlist() {
    const group = getSelectedGroup();

    if (mobileWatchGroupSelect) {
      mobileWatchGroupSelect.innerHTML = "";
      groups.forEach(function (item) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name} (${item.items.length})`;
        option.selected = item.id === selectedGroupId;
        mobileWatchGroupSelect.appendChild(option);
      });
    }

    renderMobileWatchlistGroupMenu(group);

    if (!mobileWatchlistList) {
      if (mobileWatchlistBadge) mobileWatchlistBadge.textContent = String(group.items.length || 0);
      return;
    }

    if (mobileWatchCurrentGroupName) mobileWatchCurrentGroupName.textContent = group.name;
    if (mobileWatchlistCount) mobileWatchlistCount.textContent = String(group.items.length || 0);
    if (mobileWatchlistBadge) mobileWatchlistBadge.textContent = String(group.items.length || 0);

    mobileWatchlistList.innerHTML = "";

    if (!group.items.length) {
      mobileWatchlistList.innerHTML = `
        <div class="symbol-empty mobile-watchlist-empty">
          아직 저장된 종목이 없습니다. [현재종목 추가]를 누르면 이 종목을 관심지표에 저장합니다.
        </div>
      `;
      return;
    }

    group.items.forEach(function (item) {
      const row = document.createElement("div");
      row.className = "mobile-watchlist-row";

      row.innerHTML = `
        <a class="mobile-watchlist-link" href="${stockHref(item.code)}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.code)} · ${escapeHtml(item.market || "KRX")}</span>
        </a>
        <button
          type="button"
          class="mobile-watchlist-trash"
          data-mobile-remove-stock="${escapeHtml(item.code)}"
          title="종목 삭제"
          aria-label="종목 삭제"
        >
          ${trashIcon()}
        </button>
      `;

      mobileWatchlistList.appendChild(row);
    });
  }

  function renderAll() {
    renderGroupSelect();
    renderSelectedGroup();
    renderManageList();
    renderMobileWatchlist();
  }

  function openGroupModal() {
    if (!groupModal) return;

    groupModal.classList.add("open");
    groupModal.setAttribute("aria-hidden", "false");
    renderManageList();

    setTimeout(function () {
      if (groupNameInput) groupNameInput.focus();
    }, 30);
  }

  function closeGroupModal() {
    if (!groupModal) return;

    groupModal.classList.remove("open");
    groupModal.setAttribute("aria-hidden", "true");
  }

  function openMobileWatchlistModal() {
    if (!mobileWatchModal) return;
    renderMobileWatchlist();
    mobileWatchModal.classList.add("open", "is-open");
    mobileWatchModal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("mobile-watchlist-open");
  }

  function closeMobileWatchlistModal() {
    if (!mobileWatchModal) return;
    mobileWatchModal.classList.remove("open", "is-open");
    mobileWatchModal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("mobile-watchlist-open");
  }

  groupSelect.addEventListener("change", function () {
    setSelectedGroupId(groupSelect.value);
    renderAll();
  });

  createGroupBtn && createGroupBtn.addEventListener("click", openGroupModal);

  document.querySelectorAll("[data-close-group]").forEach(function (btn) {
    btn.addEventListener("click", closeGroupModal);
  });

  saveGroupBtn && saveGroupBtn.addEventListener("click", function () {
    const name = groupNameInput ? groupNameInput.value.trim() : "";
    if (!name) return;

    const newGroup = {
      id: makeId(),
      name,
      items: [],
    };

    groups.push(newGroup);
    selectedGroupId = newGroup.id;

    if (groupNameInput) groupNameInput.value = "";

    saveGroups();
    renderAll();
  });

  groupNameInput && groupNameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && saveGroupBtn) {
      saveGroupBtn.click();
    }
  });

  addCurrentStockBtn && addCurrentStockBtn.addEventListener("click", addCurrentStockToSelectedGroup);
  mobileWatchAddCurrentBtn && mobileWatchAddCurrentBtn.addEventListener("click", addCurrentStockToSelectedGroup);

  mobileWatchManageBtn && mobileWatchManageBtn.addEventListener("click", function () {
    closeMobileWatchlistModal();
    openGroupModal();
  });

  openMobileWatchBtn && openMobileWatchBtn.addEventListener("click", function (event) {
    event.preventDefault();
    openMobileWatchlistModal();
  });

  document.querySelectorAll("[data-close-mobile-watchlist]").forEach(function (btn) {
    btn.addEventListener("click", closeMobileWatchlistModal);
  });

  mobileWatchGroupBtn && mobileWatchGroupBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    toggleMobileWatchGroupMenu();
  });

  mobileWatchGroupMenu && mobileWatchGroupMenu.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-mobile-watch-group]");
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    setSelectedGroupId(btn.dataset.mobileWatchGroup);
    closeMobileWatchGroupMenu();
    renderAll();
  });

  mobileWatchGroupSelect && mobileWatchGroupSelect.addEventListener("change", function () {
    setSelectedGroupId(mobileWatchGroupSelect.value);
    closeMobileWatchGroupMenu();
    renderAll();
  });

  selectedSymbolList.addEventListener("click", function (event) {
    const removeBtn = event.target.closest("[data-remove-stock]");
    if (!removeBtn) return;
    removeStockFromSelectedGroup(removeBtn.dataset.removeStock);
  });

  mobileWatchlistList && mobileWatchlistList.addEventListener("click", function (event) {
    const removeBtn = event.target.closest("[data-mobile-remove-stock]");
    if (!removeBtn) return;

    event.preventDefault();
    event.stopPropagation();

    removeStockFromSelectedGroup(removeBtn.dataset.mobileRemoveStock);
  });

  groupManageList && groupManageList.addEventListener("input", function (event) {
    const input = event.target.closest("[data-rename-group]");
    if (!input) return;

    const group = groups.find(function (item) {
      return item.id === input.dataset.renameGroup;
    });

    if (!group) return;

    group.name = input.value.trim() || "이름 없음";
    saveGroups();
    renderAll();
  });

  groupManageList && groupManageList.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-delete-group]");
    if (!btn) return;

    const deleteId = btn.dataset.deleteGroup;

    groups = groups.filter(function (group) {
      return group.id !== deleteId;
    });

    if (!groups.length) {
      groups = defaultGroups();
    }

    if (selectedGroupId === deleteId || !groups.some(function (group) { return group.id === selectedGroupId; })) {
      selectedGroupId = groups[0].id;
    }

    saveGroups();
    renderAll();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeGroupModal();
      closeMobileWatchGroupMenu();
      closeMobileWatchlistModal();
    }
  });

  document.addEventListener("click", function (event) {
    if (groupCustomSelect && !event.target.closest("#groupSelectCustom")) {
      closeGroupCustomSelect();
    }

    if (mobileWatchGroupCustom && !event.target.closest("#mobileWatchGroupCustom")) {
      closeMobileWatchGroupMenu();
    }

    if (
      groupModal &&
      groupModal.classList.contains("open") &&
      !event.target.closest(".group-panel") &&
      !event.target.closest("#createGroupBtn") &&
      !event.target.closest("#mobileWatchManageBtn")
    ) {
      closeGroupModal();
    }

    if (
      mobileWatchModal &&
      mobileWatchModal.classList.contains("open") &&
      event.target === mobileWatchModal
    ) {
      closeMobileWatchlistModal();
    }
  });

  renderAll();
  fetchServerGroups();
})();
