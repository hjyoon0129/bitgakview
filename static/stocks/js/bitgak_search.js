(function () {
  if (window.__BITGAK_SEARCH_LOADED__) return;
  window.__BITGAK_SEARCH_LOADED__ = true;

  const input = document.getElementById("stockSearchInput");
  const button = document.getElementById("stockSearchBtn");
  const panel = document.getElementById("stockSearchPanel");
  const app = document.querySelector(".bv-app");

  if (!input || !panel) return;

  const MIN_QUERY_LEN = 1;
  const DEBOUNCE_MS = 85;
  const FETCH_TIMEOUT_MS = 4200;
  const MAX_RESULTS = 45;

  const FALLBACK_STOCKS = [
    { code: "KOSPI", name: "코스피 지수", market: "INDEX-KR", aliases: ["코스피", "kospi", "ks11", "종합주가지수", "코스피인덱스", "kospi index"], search_rank: 5000, asset_type: "index", price_unit: "pt" },
    { code: "KOSDAQ", name: "코스닥 지수", market: "INDEX-KR", aliases: ["코스닥", "kosdaq", "kq11", "코스닥인덱스", "kosdaq index"], search_rank: 4990, asset_type: "index", price_unit: "pt" },
    { code: "NASDAQ", name: "나스닥 종합", market: "INDEX-US", aliases: ["나스닥", "나스닥종합", "nasdaq", "ixic", "^ixic", "nasdaq composite"], search_rank: 4980, asset_type: "index", price_unit: "pt" },
    { code: "NASDAQ100", name: "나스닥 100", market: "INDEX-US", aliases: ["나스닥100", "나스닥 100", "nasdaq100", "nasdaq 100", "ndx", "^ndx", "nas100", "us100"], search_rank: 4970, asset_type: "index", price_unit: "pt" },
    { code: "NQF", name: "나스닥 100 E-mini 선물", market: "FUTURE-US", aliases: ["나스닥선물", "나스닥 100 선물", "나스닥100선물", "e-mini", "emini", "nq", "nq=f", "nqf", "nasdaq futures"], search_rank: 4960, asset_type: "future", is_derivative: true, price_unit: "pt" },
    { code: "SP500", name: "S&P 500", market: "INDEX-US", aliases: ["s&p500", "s&p 500", "sp500", "spx", "gspc", "^gspc", "에스앤피", "에센피", "us500"], search_rank: 4950, asset_type: "index", price_unit: "pt" },
    { code: "SOX", name: "필라델피아 반도체 지수", market: "INDEX-US", aliases: ["필라델피아반도체", "필라델피아 반도체", "sox", "^sox", "phlx semiconductor", "반도체지수"], search_rank: 4940, asset_type: "index", price_unit: "pt" },
    { code: "005930", name: "삼성전자", market: "KOSPI", aliases: ["삼성", "삼전", "samsung", "samsung electronics"], search_rank: 1000 },
    { code: "005935", name: "삼성전자우", market: "KOSPI", aliases: ["삼전우", "삼성우", "삼성전자우선주"], search_rank: 930 },
    { code: "000660", name: "SK하이닉스", market: "KOSPI", aliases: ["하이닉스", "하닉", "skhynix", "hynix", "sk 하이닉스"], search_rank: 980 },
    { code: "035420", name: "NAVER", market: "KOSPI", aliases: ["네이버", "naver"], search_rank: 940 },
    { code: "035720", name: "카카오", market: "KOSPI", aliases: ["kakao"], search_rank: 900 },
    { code: "005380", name: "현대차", market: "KOSPI", aliases: ["현대자동차", "hyundai", "hyundai motor"], search_rank: 920 },
    { code: "000270", name: "기아", market: "KOSPI", aliases: ["kia"], search_rank: 900 },
    { code: "373220", name: "LG에너지솔루션", market: "KOSPI", aliases: ["LG엔솔", "엘지에너지솔루션", "엔솔", "lg energy", "lg에너지"], search_rank: 890 },
    { code: "051910", name: "LG화학", market: "KOSPI", aliases: ["엘지화학", "lgchem", "lg 화학"], search_rank: 850 },
    { code: "066570", name: "LG전자", market: "KOSPI", aliases: ["엘지전자", "lg전자", "lg electronics", "엘전"], search_rank: 840 },
    { code: "003550", name: "LG", market: "KOSPI", aliases: ["엘지", "lg corp"], search_rank: 800 },
    { code: "207940", name: "삼성바이오로직스", market: "KOSPI", aliases: ["삼바", "삼성바이오"], search_rank: 880 },
    { code: "006400", name: "삼성SDI", market: "KOSPI", aliases: ["삼성에스디아이", "sdi"], search_rank: 850 },
    { code: "009150", name: "삼성전기", market: "KOSPI", aliases: ["삼전기"], search_rank: 830 },
    { code: "028260", name: "삼성물산", market: "KOSPI", aliases: ["물산"], search_rank: 810 },
    { code: "010140", name: "삼성중공업", market: "KOSPI", aliases: ["삼성중공"], search_rank: 790 },
    { code: "016360", name: "삼성증권", market: "KOSPI", aliases: ["삼성증권"], search_rank: 760 },
    { code: "000810", name: "삼성화재", market: "KOSPI", aliases: ["삼성화재해상보험"], search_rank: 750 },
    { code: "032830", name: "삼성생명", market: "KOSPI", aliases: ["삼성생명보험"], search_rank: 740 },
    { code: "068270", name: "셀트리온", market: "KOSPI", aliases: ["celltrion"], search_rank: 820 },
    { code: "105560", name: "KB금융", market: "KOSPI", aliases: ["국민은행", "kb", "kb금융지주"], search_rank: 790 },
    { code: "055550", name: "신한지주", market: "KOSPI", aliases: ["신한", "신한금융"], search_rank: 770 },
    { code: "316140", name: "우리금융지주", market: "KOSPI", aliases: ["우리금융"], search_rank: 760 },
    { code: "005490", name: "POSCO홀딩스", market: "KOSPI", aliases: ["포스코", "posco", "포스코홀딩스"], search_rank: 760 },
    { code: "028300", name: "HLB", market: "KOSDAQ", aliases: ["에이치엘비"], search_rank: 720 },
    { code: "247540", name: "에코프로비엠", market: "KOSDAQ", aliases: ["에코비엠"], search_rank: 720 },
    { code: "086520", name: "에코프로", market: "KOSDAQ", aliases: ["ecopro"], search_rank: 700 },
    { code: "196170", name: "알테오젠", market: "KOSDAQ", aliases: ["alteogen"], search_rank: 700 },
    { code: "277810", name: "레인보우로보틱스", market: "KOSDAQ", aliases: ["레인보우", "로보틱스"], search_rank: 660 }
  ];

  let timer = null;
  let activeIndex = -1;
  let currentItems = [];
  let lastQuery = "";
  let requestSeq = 0;
  let activeController = null;
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

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/엘지/g, "lg")
      .replace(/에스케이/g, "sk")
      .replace(/에스디아이/g, "sdi")
      .replace(/[\s(){}\[\].,·ㆍ_\-]/g, "")
      .trim();
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function getBaseUrl() {
    if (window.location.origin && window.location.origin !== "null") return window.location.origin;

    try {
      if (document.referrer) return new URL(document.referrer).origin;
    } catch (e) {}

    try {
      if (window.parent && window.parent.location && window.parent.location.origin) {
        return window.parent.location.origin;
      }
    } catch (e) {}

    return window.location.protocol && window.location.host
      ? window.location.protocol + "//" + window.location.host
      : "http://127.0.0.1:8000";
  }

  function resolveUrl(url) {
    try { return new URL(String(url || ""), getBaseUrl()).toString(); }
    catch (e) { return String(url || ""); }
  }

  function readApiUrl() {
    const candidates = [
      app && app.dataset ? app.dataset.stockSearchApiUrl : "",
      app && app.dataset ? app.dataset.searchApiUrl : "",
      window.BITGAK_STOCK_SEARCH_API_URL,
      window.stockSearchApiUrl,
      "/stocks/api/search/"
    ];

    for (const raw of candidates) {
      const value = String(raw || "").trim();
      if (!value) continue;
      if (value.includes("/api/") || value.includes("api/search")) return resolveUrl(value);
    }

    return resolveUrl("/stocks/api/search/");
  }

  const API_URL = readApiUrl();

  function normalizeStockItem(item) {
    item = item || {};
    const code = String(item.code || item.stock_code || "").trim();
    const name = String(item.name || item.stock_name || code || "").trim();
    if (!code && !name) return null;

    return {
      code,
      name,
      market: String(item.market || "KRX").trim() || "KRX",
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      href: item.href || (code ? "/stocks/" + encodeURIComponent(code) + "/" : "#"),
      search_rank: Number(item.search_rank || item.rank || 0) || 0,
      is_derivative: !!item.is_derivative,
      asset_type: String(item.asset_type || item.assetType || "stock").trim() || "stock",
      yahoo_symbol: String(item.yahoo_symbol || item.yahooSymbol || "").trim(),
      price_unit: String(item.price_unit || item.priceUnit || (String(item.market || "").startsWith("INDEX") ? "pt" : "")).trim(),
    };
  }

  function readJsonScript(id) {
    const el = document.getElementById(id);
    if (!el) return [];

    try {
      const parsed = JSON.parse(el.textContent || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function readPreloadedStocks() {
    const buckets = [];

    [
      window.BITGAK_ALL_STOCKS,
      window.BITGAK_STOCKS,
      window.allStocksPayload,
      window.all_stocks_payload,
      window.allStocks,
      window.STOCKS_PAYLOAD,
    ].forEach(function (value) {
      if (Array.isArray(value)) buckets.push(value);
    });

    [
      "all-stocks-payload",
      "all_stocks_payload",
      "all-stocks-data",
      "stock-search-payload",
      "stockSearchPayload",
      "stocksPayload",
    ].forEach(function (id) {
      const parsed = readJsonScript(id);
      if (parsed.length) buckets.push(parsed);
    });

    buckets.push(FALLBACK_STOCKS);

    const map = new Map();
    buckets.flat().map(normalizeStockItem).filter(Boolean).forEach(function (item) {
      const key = item.code || item.name;
      if (!key) return;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }

      existing.aliases = Array.from(new Set([].concat(existing.aliases || [], item.aliases || [])));
      existing.search_rank = Math.max(Number(existing.search_rank || 0), Number(item.search_rank || 0));
      existing.href = existing.href || item.href;
    });

    return Array.from(map.values());
  }

  const LOCAL_STOCKS = readPreloadedStocks();

  function closePanel() {
    panel.classList.remove("show", "active", "is-open");
    panel.removeAttribute("data-query");
    panel.innerHTML = "";
    activeIndex = -1;
  }

  function openPanel() {
    panel.classList.add("show", "active", "is-open");
  }

  function getItemHref(item) {
    return item.href || ("/stocks/" + encodeURIComponent(item.code || "") + "/");
  }

  function itemTemplate(item, index) {
    const href = getItemHref(item);
    const assetType = String(item.asset_type || "stock").toLowerCase();
    const derivativeBadge = item.is_derivative
      ? '<span class="stock-search-market derivative">선물/파생</span>'
      : (assetType === "index" ? '<span class="stock-search-market derivative">INDEX</span>' : "");
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

  function render(items, query, options) {
    options = options || {};
    currentItems = Array.isArray(items) ? items.map(normalizeStockItem).filter(Boolean) : [];
    activeIndex = -1;
    panel.setAttribute("data-query", query || "");

    if (!currentItems.length) {
      panel.innerHTML = `<div class="stock-search-empty">${escapeHtml(query)} 검색 결과가 없습니다.</div>`;
      openPanel();
      return;
    }

    const status = options.loading
      ? '<div class="stock-search-empty stock-search-loading">검색 중...</div>'
      : "";

    panel.innerHTML = status + currentItems.slice(0, MAX_RESULTS).map(itemTemplate).join("");
    openPanel();
  }

  function renderMessage(message, query) {
    currentItems = [];
    activeIndex = -1;
    panel.setAttribute("data-query", query || "");
    panel.innerHTML = `<div class="stock-search-empty">${escapeHtml(message)}</div>`;
    openPanel();
  }

  function itemTargetText(item) {
    return [item.name, item.code].concat(item.aliases || []).map(normalizeSearchText).join(" ");
  }

  function localScore(item, query) {
    const q = normalizeSearchText(query);
    const qDigits = digitsOnly(query);
    if (!q && !qDigits) return Number(item.search_rank || 0);

    const name = normalizeSearchText(item.name);
    const code = String(item.code || "");
    const aliases = (item.aliases || []).map(normalizeSearchText);
    const target = itemTargetText(item);
    const rank = Number(item.search_rank || 0);

    if (qDigits && code === qDigits.padStart(6, "0")) return 100000 + rank;
    if (qDigits && code.startsWith(qDigits)) return 82000 + rank;
    if (name === q) return 90000 + rank;
    if (aliases.some(function (alias) { return alias === q; })) return 86000 + rank;
    if (name.startsWith(q)) return 76000 + rank;
    if (aliases.some(function (alias) { return alias.startsWith(q); })) return 72000 + rank;
    if (target.includes(q)) return 52000 + rank;
    if (qDigits && code.includes(qDigits)) return 50000 + rank;

    return 0;
  }

  function queryLocalStocks(query, limit) {
    const q = normalize(query);
    if (!q) return [];

    return LOCAL_STOCKS
      .map(function (item) {
        return { item, score: localScore(item, q) };
      })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || MAX_RESULTS)
      .map(function (entry) { return entry.item; });
  }

  function mergeResults(serverItems, localItems) {
    const map = new Map();

    [].concat(serverItems || [], localItems || [])
      .map(normalizeStockItem)
      .filter(Boolean)
      .forEach(function (item) {
        const key = item.code || item.name;
        if (!key || map.has(key)) return;
        map.set(key, item);
      });

    return Array.from(map.values()).slice(0, MAX_RESULTS);
  }

  function setActive(index) {
    const rows = Array.from(panel.querySelectorAll(".stock-search-item"));
    rows.forEach(function (row) { row.classList.remove("active"); });
    if (!rows.length) return;

    activeIndex = Math.max(0, Math.min(index, rows.length - 1));
    rows[activeIndex].classList.add("active");
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function abortActiveRequest() {
    if (!activeController) return;
    try { activeController.abort(); } catch (e) {}
    activeController = null;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = window.AbortController ? new AbortController() : null;
    activeController = controller;

    const timeout = window.setTimeout(function () {
      if (controller) {
        try { controller.abort(); } catch (e) {}
      }
    }, timeoutMs || FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, Object.assign({}, options || {}, {
        signal: controller ? controller.signal : undefined,
      }));
    } finally {
      window.clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  }

  async function fetchServerResults(q, seq) {
    const url = new URL(API_URL, getBaseUrl());
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(MAX_RESULTS));

    const res = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "same-origin",
      cache: "no-store",
    }, FETCH_TIMEOUT_MS);

    if (seq !== requestSeq) return null;
    if (!res.ok) throw new Error("search api failed: " + res.status);

    const data = await res.json();
    if (seq !== requestSeq) return null;

    return data && Array.isArray(data.results) ? data.results : [];
  }

  async function fetchResults(query, immediate) {
    const q = normalize(query);

    if (q.length < MIN_QUERY_LEN) {
      closePanel();
      return [];
    }

    if (memoryCache.has(q)) {
      const cached = memoryCache.get(q);
      render(cached, q);
      return cached;
    }

    const localItems = queryLocalStocks(q, MAX_RESULTS);
    const seq = ++requestSeq;

    abortActiveRequest();

    if (localItems.length) {
      render(localItems, q, { loading: !immediate });
    } else if (!immediate) {
      renderMessage("검색 중...", q);
    }

    try {
      const serverItems = await fetchServerResults(q, seq);
      if (seq !== requestSeq || serverItems === null) return [];

      const merged = mergeResults(serverItems, localItems);
      memoryCache.set(q, merged);
      render(merged, q);
      return merged;
    } catch (error) {
      if (error && error.name === "AbortError") return [];
      if (seq !== requestSeq) return [];

      console.warn("Bitgak stock search API fallback:", error);

      if (localItems.length) {
        memoryCache.set(q, localItems);
        render(localItems, q);
        return localItems;
      }

      renderMessage("검색 데이터를 불러오지 못했습니다. 잠시 후 다시 입력해보세요.", q);
      return [];
    }
  }

  function goFirstOrSearch() {
    const active = panel.querySelector(".stock-search-item.active") || panel.querySelector(".stock-search-item");
    if (active) {
      window.location.href = active.getAttribute("href");
      return;
    }

    const q = normalize(input.value);
    if (!q) return;

    const localItems = queryLocalStocks(q, MAX_RESULTS);
    if (localItems.length) {
      render(localItems, q);
      const firstHref = getItemHref(localItems[0]);
      if (firstHref && firstHref !== "#") window.location.href = firstHref;
      return;
    }

    fetchResults(q, true).then(function (items) {
      const first = panel.querySelector(".stock-search-item");
      if (first) {
        window.location.href = first.getAttribute("href");
      } else if (Array.isArray(items) && items.length) {
        window.location.href = getItemHref(items[0]);
      } else {
        input.focus();
      }
    });
  }

  function scheduleSearch() {
    const q = normalize(input.value);
    lastQuery = q;
    window.clearTimeout(timer);

    if (!q) {
      abortActiveRequest();
      closePanel();
      return;
    }

    const localItems = queryLocalStocks(q, MAX_RESULTS);
    if (localItems.length) render(localItems, q, { loading: true });

    timer = window.setTimeout(function () {
      fetchResults(q, false);
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

    if (event.key === "Escape") closePanel();
  });

  if (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      const q = normalize(input.value);
      if (!q) {
        input.focus();
        return;
      }
      goFirstOrSearch();
    });
  }

  panel.addEventListener("mousedown", function (event) {
    const item = event.target.closest(".stock-search-item");
    if (!item) return;
    event.preventDefault();
    window.location.href = item.getAttribute("href");
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest(".bv-search-live") || event.target.closest(".home-search-form")) return;
    closePanel();
  });
})();
