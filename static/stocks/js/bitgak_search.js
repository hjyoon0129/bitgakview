(function () {
  if (window.__BITGAK_HEADER_SEARCH_LOADED__) return;
  window.__BITGAK_HEADER_SEARCH_LOADED__ = true;

  const input = document.getElementById("stockSearchInput");
  const button = document.getElementById("stockSearchBtn");
  const panel = document.getElementById("stockSearchPanel");
  const jsonNode = document.getElementById("allStocksData");

  if (!input || !panel) return;

  const fallbackStocks = [
    { name: "삼성전자", code: "005930", market: "KOSPI", aliases: ["삼성", "삼전", "samsung", "samsung electronics"], search_rank: 1000 },
    { name: "삼성전자우", code: "005935", market: "KOSPI", aliases: ["삼전우", "삼성우"], search_rank: 930 },
    { name: "삼성바이오로직스", code: "207940", market: "KOSPI", aliases: ["삼바", "삼성바이오"], search_rank: 880 },
    { name: "삼성SDI", code: "006400", market: "KOSPI", aliases: ["삼성에스디아이", "sdi"], search_rank: 850 },
    { name: "삼성전기", code: "009150", market: "KOSPI", aliases: ["삼전기"], search_rank: 830 },
    { name: "삼성물산", code: "028260", market: "KOSPI", aliases: ["물산"], search_rank: 810 },
    { name: "삼성중공업", code: "010140", market: "KOSPI", aliases: ["삼성중공"], search_rank: 790 },
    { name: "SK하이닉스", code: "000660", market: "KOSPI", aliases: ["하이닉스", "하닉", "hynix"], search_rank: 980 },
    { name: "NAVER", code: "035420", market: "KOSPI", aliases: ["네이버", "naver"], search_rank: 940 },
    { name: "카카오", code: "035720", market: "KOSPI", aliases: ["kakao"], search_rank: 900 },
    { name: "현대차", code: "005380", market: "KOSPI", aliases: ["현대자동차", "hyundai"], search_rank: 920 },
    { name: "기아", code: "000270", market: "KOSPI", aliases: ["kia"], search_rank: 900 },
    { name: "LG에너지솔루션", code: "373220", market: "KOSPI", aliases: ["엘지에너지솔루션", "lg엔솔", "엔솔"], search_rank: 890 },
    { name: "LG전자", code: "066570", market: "KOSPI", aliases: ["엘지전자"], search_rank: 840 },
    { name: "LG화학", code: "051910", market: "KOSPI", aliases: ["엘지화학"], search_rank: 850 },
    { name: "LG", code: "003550", market: "KOSPI", aliases: ["엘지"], search_rank: 800 },
    { name: "셀트리온", code: "068270", market: "KOSPI", aliases: ["celltrion"], search_rank: 820 },
    { name: "KB금융", code: "105560", market: "KOSPI", aliases: ["kb", "국민은행"], search_rank: 790 },
    { name: "신한지주", code: "055550", market: "KOSPI", aliases: ["신한"], search_rank: 770 },
    { name: "우리금융지주", code: "316140", market: "KOSPI", aliases: ["우리금융"], search_rank: 760 },
    { name: "POSCO홀딩스", code: "005490", market: "KOSPI", aliases: ["포스코", "posco"], search_rank: 760 },
    { name: "HLB", code: "028300", market: "KOSDAQ", aliases: ["에이치엘비"], search_rank: 720 },
    { name: "에코프로비엠", code: "247540", market: "KOSDAQ", aliases: ["에코비엠"], search_rank: 720 },
    { name: "에코프로", code: "086520", market: "KOSDAQ", aliases: ["ecopro"], search_rank: 700 },
    { name: "알테오젠", code: "196170", market: "KOSDAQ", aliases: ["alteogen"], search_rank: 700 },
    { name: "레인보우로보틱스", code: "277810", market: "KOSDAQ", aliases: ["레인보우", "로보틱스"], search_rank: 660 }
  ];

  const derivativeKeywords = ["ETF", "ETN", "ETNH", "레버리지", "인버스", "선물", "합성", "TR", "채권", "국채", "CD금리", "커버드콜"];
  const CACHE_KEY = "bitgak:all-stocks-cache:v3";

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[(){}\[\].,·ㆍ_\-]/g, "")
      .trim();
  }

  function normalizeCode(value) {
    const text = String(value || "").trim();
    const digits = text.replace(/\D/g, "");
    if (!digits) return text;
    return digits.length <= 6 ? digits.padStart(6, "0") : digits.slice(-6);
  }

  function isDerivativeName(name) {
    const text = String(name || "").toUpperCase().replace(/\s+/g, "");
    return derivativeKeywords.some(function (keyword) {
      return text.includes(String(keyword).toUpperCase().replace(/\s+/g, ""));
    });
  }

  function readJsonItems() {
    if (!jsonNode) return [];
    try {
      const parsed = JSON.parse(jsonNode.textContent || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function normalizeItem(item) {
    const code = normalizeCode(item.code || item.ticker || item.symbol || "");
    const name = String(item.name || item.stock_name || item.ticker_name || "").trim();

    return {
      name,
      code,
      market: String(item.market || item.market_name || "KRX").trim(),
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      href: String(item.href || item.url || "").trim(),
      isDerivative: Boolean(item.is_derivative || item.isDerivative || isDerivativeName(name)),
      searchRank: Number(item.search_rank || item.searchRank || 0) || 0
    };
  }

  function loadCachedItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function buildItems() {
    const map = new Map();
    const rawItems = readJsonItems();
    const cachedItems = rawItems.length ? [] : loadCachedItems();

    rawItems.concat(cachedItems).concat(fallbackStocks).forEach(function (raw) {
      const item = normalizeItem(raw);
      if (!item.name || !item.code || item.code === "000000") return;

      const prev = map.get(item.code);
      if (!prev) {
        map.set(item.code, item);
        return;
      }

      map.set(item.code, {
        name: prev.name || item.name,
        code: item.code,
        market: prev.market || item.market,
        aliases: Array.from(new Set((prev.aliases || []).concat(item.aliases || []))),
        href: prev.href || item.href,
        isDerivative: Boolean(prev.isDerivative || item.isDerivative),
        searchRank: Math.max(Number(prev.searchRank || 0), Number(item.searchRank || 0))
      });
    });

    const result = Array.from(map.values()).map(function (item) {
      item.href = item.href || "/stocks/" + item.code + "/";
      return item;
    });

    if (rawItems.length) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) {}
    }

    return result;
  }

  const items = buildItems();

  const chosungList = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

  function getChosung(value) {
    return String(value || "").split("").map(function (char) {
      const code = char.charCodeAt(0) - 44032;
      if (code >= 0 && code <= 11171) return chosungList[Math.floor(code / 588)];
      return char.toLowerCase();
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sequentialMatch(text, query) {
    let index = 0;
    for (const char of text) {
      if (char === query[index]) index += 1;
      if (index >= query.length) return true;
    }
    return false;
  }

  function scoreItem(item, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return 0;

    const name = normalize(item.name);
    const code = normalize(item.code);
    const market = normalize(item.market);
    const alias = normalize((item.aliases || []).join(" "));
    const chosungName = getChosung(item.name);
    const chosungAlias = getChosung((item.aliases || []).join(" "));
    const chosungQuery = getChosung(rawQuery);

    let score = 0;

    if (code === query) score = 5000;
    else if (name === query) score = 4800;
    else if (alias === query) score = 4700;
    else if (code.startsWith(query)) score = 4300;
    else if (name.startsWith(query)) score = 3900;
    else if (alias.includes(query)) score = 3700;
    else if (name.includes(query)) score = 3100;
    else if (code.includes(query)) score = 2800;
    else if (chosungQuery && chosungName.startsWith(chosungQuery)) score = 2300;
    else if (chosungQuery && chosungName.includes(chosungQuery)) score = 2100;
    else if (chosungQuery && chosungAlias.includes(chosungQuery)) score = 2000;
    else if (query.length >= 2 && sequentialMatch(name, query)) score = 1100;
    else if (market.includes(query)) score = 300;

    if (!score) return 0;
    score += Math.min(Number(item.searchRank || 0), 1200);
    if (item.isDerivative) score -= 250;
    return score;
  }

  function getMatches(query) {
    const q = normalize(query);
    if (!q) return [];

    return items
      .map(function (item) {
        return Object.assign({}, item, { score: scoreItem(item, query) });
      })
      .filter(function (item) { return item.score > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (Number(b.searchRank || 0) !== Number(a.searchRank || 0)) return Number(b.searchRank || 0) - Number(a.searchRank || 0);
        if (a.isDerivative !== b.isDerivative) return a.isDerivative ? 1 : -1;
        return String(a.name).localeCompare(String(b.name), "ko");
      })
      .slice(0, 80);
  }

  function createItem(item, index) {
    return ''
      + '<a class="stock-search-item" data-index="' + index + '" href="' + escapeHtml(item.href) + '">'
      + '  <div>'
      + '    <div class="stock-search-name">' + escapeHtml(item.name) + '</div>'
      + '    <div class="stock-search-code">' + escapeHtml(item.code) + '</div>'
      + '  </div>'
      + '  <span class="stock-search-market">' + escapeHtml(item.market) + '</span>'
      + '</a>';
  }

  let lastMatches = [];
  let activeIndex = -1;

  function paintActive() {
    panel.querySelectorAll(".stock-search-item").forEach(function (node) {
      const index = Number(node.getAttribute("data-index"));
      node.classList.toggle("active", index === activeIndex);
    });
  }

  function render(query) {
    const q = query.trim();
    lastMatches = getMatches(q);
    activeIndex = -1;
    panel.innerHTML = "";

    if (!q) {
      panel.classList.remove("show");
      return;
    }

    panel.classList.add("show");

    if (!lastMatches.length) {
      panel.innerHTML = '<div class="stock-search-empty">검색 결과가 없습니다. 예: 삼성전자, 삼전, LG, NAVER, 005930</div>';
      return;
    }

    panel.innerHTML = lastMatches.slice(0, 60).map(createItem).join("");
  }

  function goTarget() {
    const matches = lastMatches.length ? lastMatches : getMatches(input.value);
    const target = activeIndex >= 0 ? matches[activeIndex] : matches[0];

    if (target) {
      window.location.href = target.href;
      return true;
    }

    return false;
  }

  input.addEventListener("input", function () {
    render(input.value);
  });

  input.addEventListener("focus", function () {
    if (input.value.trim()) render(input.value);
  });

  input.addEventListener("keydown", function (event) {
    const count = Math.min(lastMatches.length, 60);

    if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      activeIndex = activeIndex < count - 1 ? activeIndex + 1 : 0;
      paintActive();
      return;
    }

    if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      activeIndex = activeIndex > 0 ? activeIndex - 1 : count - 1;
      paintActive();
      return;
    }

    if (event.key === "Enter") {
      if (goTarget()) event.preventDefault();
    }

    if (event.key === "Escape") {
      panel.classList.remove("show");
      activeIndex = -1;
    }
  });

  if (button) {
    button.addEventListener("click", function () {
      if (!goTarget()) {
        const q = encodeURIComponent(input.value.trim());
        if (q) window.location.href = "/stocks/?q=" + q;
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".bv-search-live")) {
      panel.classList.remove("show");
    }
  });

  if (input.value.trim()) render(input.value);
})();
