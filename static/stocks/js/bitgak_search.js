(function () {
  if (window.__BITGAK_SEARCH_LOADED__) return;
  window.__BITGAK_SEARCH_LOADED__ = true;

  const input = document.getElementById("stockSearchInput");
  const button = document.getElementById("stockSearchBtn");
  const panel = document.getElementById("stockSearchPanel");

  if (!input || !panel) return;

  const API_URL = "/stocks/api/search/";
  const MIN_QUERY_LEN = 1;
  const DEBOUNCE_MS = 180;

  let timer = null;
  let activeIndex = -1;
  let currentItems = [];
  let lastQuery = "";
  let requestSeq = 0;
  const memoryCache = new Map();

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "").trim();
  }

  function closePanel() {
    panel.classList.remove("show");
    panel.innerHTML = "";
    activeIndex = -1;
  }

  function openPanel() {
    panel.classList.add("show");
  }

  function itemTemplate(item, index) {
    const href = item.href || ("/stocks/" + encodeURIComponent(item.code || "") + "/");
    const derivativeBadge = item.is_derivative ? '<span class="stock-search-market derivative">ETF/ETN</span>' : "";
    return `
      <a class="stock-search-item" href="${escapeHtml(href)}" data-search-index="${index}">
        <div>
          <div class="stock-search-name">${escapeHtml(item.name || item.code)}</div>
          <div class="stock-search-code">${escapeHtml(item.code || "")}</div>
        </div>
        <div>
          <span class="stock-search-market">${escapeHtml(item.market || "KRX")}</span>
          ${derivativeBadge}
        </div>
      </a>`;
  }

  function render(items, query) {
    currentItems = Array.isArray(items) ? items : [];
    activeIndex = -1;

    if (!currentItems.length) {
      panel.innerHTML = `<div class="stock-search-empty">${escapeHtml(query)} 검색 결과가 없습니다.</div>`;
      openPanel();
      return;
    }

    panel.innerHTML = currentItems.map(itemTemplate).join("");
    openPanel();
  }

  function setActive(index) {
    const rows = Array.from(panel.querySelectorAll(".stock-search-item"));
    rows.forEach(function (row) { row.classList.remove("active"); });

    if (!rows.length) return;

    activeIndex = Math.max(0, Math.min(index, rows.length - 1));
    rows[activeIndex].classList.add("active");
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function goFirstOrSearch() {
    const active = panel.querySelector(".stock-search-item.active") || panel.querySelector(".stock-search-item");
    if (active) {
      window.location.href = active.getAttribute("href");
      return;
    }

    const q = normalize(input.value);
    if (q) window.location.href = "/stocks/?q=" + encodeURIComponent(q);
  }

  async function fetchResults(query) {
    const q = normalize(query);

    if (q.length < MIN_QUERY_LEN) {
      render([], q);
      return;
    }

    if (memoryCache.has(q)) {
      render(memoryCache.get(q), q);
      return;
    }

    const seq = ++requestSeq;

    try {
      const url = API_URL + "?q=" + encodeURIComponent(q) + "&limit=40";
      const res = await fetch(url, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("search api failed");

      const data = await res.json();
      if (seq !== requestSeq) return;

      const items = data && Array.isArray(data.results) ? data.results : [];
      memoryCache.set(q, items);
      render(items, q);
    } catch (error) {
      if (seq !== requestSeq) return;
      panel.innerHTML = '<div class="stock-search-empty">검색 데이터를 불러오지 못했습니다.</div>';
      openPanel();
    }
  }

  function scheduleSearch() {
    const q = normalize(input.value);
    lastQuery = q;
    window.clearTimeout(timer);

    if (!q) {
      closePanel();
      return;
    }

    timer = window.setTimeout(function () {
      fetchResults(q);
    }, DEBOUNCE_MS);
  }

  input.addEventListener("input", scheduleSearch);

  input.addEventListener("focus", function () {
    const q = normalize(input.value);
    if (q && q === lastQuery && currentItems.length) render(currentItems, q);
    else if (q) scheduleSearch();
  });

  input.addEventListener("keydown", function (event) {
    const rows = panel.querySelectorAll(".stock-search-item");

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!rows.length) return;
      setActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      setActive(activeIndex <= 0 ? rows.length - 1 : activeIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      goFirstOrSearch();
      return;
    }

    if (event.key === "Escape") {
      closePanel();
    }
  });

  button && button.addEventListener("click", function (event) {
    event.preventDefault();
    const q = normalize(input.value);
    if (!q) {
      input.focus();
      return;
    }

    if (currentItems.length) goFirstOrSearch();
    else fetchResults(q).then(goFirstOrSearch);
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest(".bv-search-live")) return;
    closePanel();
  });
})();
