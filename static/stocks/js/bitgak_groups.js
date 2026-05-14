(function () {
  if (window.__BITGAK_GROUPS_LOADED__) return;
  window.__BITGAK_GROUPS_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  if (!app) return;

  const currentStock = {
    code: app.dataset.code,
    name: app.dataset.name,
    market: app.dataset.market || "KRX",
  };

  const STORAGE_KEY = "bitgak_symbol_groups_v2";
  const SELECTED_KEY = "bitgak_selected_group_v2";

  const groupSelect = document.getElementById("groupSelect");
  const selectedGroupName = document.getElementById("selectedGroupName");
  const selectedGroupCount = document.getElementById("selectedGroupCount");
  const selectedSymbolList = document.getElementById("selectedSymbolList");

  const groupManageList = document.getElementById("groupManageList");
  const groupModal = document.getElementById("groupModal");
  const createGroupBtn = document.getElementById("createGroupBtn");
  const addCurrentStockBtn = document.getElementById("addCurrentStockBtn");
  const groupNameInput = document.getElementById("groupNameInput");
  const saveGroupBtn = document.getElementById("saveGroupBtn");

  if (!groupSelect || !selectedGroupName || !selectedGroupCount || !selectedSymbolList) return;

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

  function loadGroups() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return saved;
    } catch (e) {}

    return [
      {
        id: makeId(),
        name: "내 관심종목",
        items: [],
      },
    ];
  }

  let groups = loadGroups();

  function saveGroups() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }

  function ensureGroup() {
    if (groups.length) return;

    groups.push({
      id: makeId(),
      name: "내 관심종목",
      items: [],
    });

    localStorage.setItem(SELECTED_KEY, groups[0].id);
    saveGroups();
  }

  function getSelectedGroupId() {
    ensureGroup();

    const savedId = localStorage.getItem(SELECTED_KEY);
    const exists = groups.some(function (group) {
      return group.id === savedId;
    });

    if (exists) return savedId;

    localStorage.setItem(SELECTED_KEY, groups[0].id);
    return groups[0].id;
  }

  let selectedGroupId = getSelectedGroupId();

  function setSelectedGroupId(id) {
    selectedGroupId = id;
    localStorage.setItem(SELECTED_KEY, id);
  }

  function getSelectedGroup() {
    ensureGroup();

    let group = groups.find(function (item) {
      return item.id === selectedGroupId;
    });

    if (!group) {
      group = groups[0];
      setSelectedGroupId(group.id);
    }

    return group;
  }

  function renderGroupSelect() {
    ensureGroup();

    groupSelect.innerHTML = "";

    groups.forEach(function (group) {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = `${group.name} (${group.items.length})`;

      if (group.id === selectedGroupId) {
        option.selected = true;
      }

      groupSelect.appendChild(option);
    });
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

      row.innerHTML = `
        <a href="/stocks/${escapeHtml(item.code)}/">
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

  function renderAll() {
    renderGroupSelect();
    renderSelectedGroup();
    renderManageList();
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

  groupSelect.addEventListener("change", function () {
    setSelectedGroupId(groupSelect.value);
    renderSelectedGroup();
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
    setSelectedGroupId(newGroup.id);

    if (groupNameInput) groupNameInput.value = "";

    saveGroups();
    renderAll();
  });

  groupNameInput && groupNameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && saveGroupBtn) {
      saveGroupBtn.click();
    }
  });

  addCurrentStockBtn && addCurrentStockBtn.addEventListener("click", function () {
    const group = getSelectedGroup();

    const exists = group.items.some(function (item) {
      return item.code === currentStock.code;
    });

    if (!exists) {
      group.items.push(currentStock);
    }

    saveGroups();
    renderAll();
  });

  selectedSymbolList.addEventListener("click", function (event) {
    const removeBtn = event.target.closest("[data-remove-stock]");
    if (!removeBtn) return;

    const group = getSelectedGroup();
    const code = removeBtn.dataset.removeStock;

    group.items = group.items.filter(function (item) {
      return item.code !== code;
    });

    saveGroups();
    renderAll();
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
    renderGroupSelect();
    renderSelectedGroup();
  });

  groupManageList && groupManageList.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-delete-group]");
    if (!btn) return;

    const deleteId = btn.dataset.deleteGroup;

    groups = groups.filter(function (group) {
      return group.id !== deleteId;
    });

    if (!groups.length) {
      groups.push({
        id: makeId(),
        name: "내 관심종목",
        items: [],
      });
    }

    if (selectedGroupId === deleteId) {
      setSelectedGroupId(groups[0].id);
    }

    saveGroups();
    renderAll();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeGroupModal();
    }
  });

  document.addEventListener("click", function (event) {
    if (
      groupModal &&
      groupModal.classList.contains("open") &&
      !event.target.closest(".group-panel") &&
      !event.target.closest("#createGroupBtn")
    ) {
      closeGroupModal();
    }
  });

  renderAll();
})();