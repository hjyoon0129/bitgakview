(function () {
  if (window.__BITGAK_SEARCH_LOADED__) return;
  window.__BITGAK_SEARCH_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  if (!app) return;

  const searchUrl = app.dataset.searchUrl || "/stocks/";

  const input = document.getElementById("stockSearchInput");
  const btn = document.getElementById("stockSearchBtn");
  const box = document.querySelector(".bv-search-live");
  const panel = document.getElementById("stockSearchPanel");

  if (!input || !panel) return;

  const state = {
    timer: null,
    universe: null,
  };

  const fallbackStocks = [
    { name: "삼성전자", code: "005930", market: "KOSPI", aliases: ["삼성", "삼전", "samsung"] },
    { name: "삼성전자우", code: "005935", market: "KOSPI", aliases: ["삼전우", "삼성우"] },
    { name: "SK하이닉스", code: "000660", market: "KOSPI", aliases: ["하이닉스", "하닉", "hynix"] },
    { name: "NAVER", code: "035420", market: "KOSPI", aliases: ["네이버", "naver"] },
    { name: "카카오", code: "035720", market: "KOSPI", aliases: ["kakao"] },
    { name: "LG", code: "003550", market: "KOSPI", aliases: ["엘지"] },
    { name: "LG전자", code: "066570", market: "KOSPI", aliases: ["엘지전자"] },
    { name: "LG에너지솔루션", code: "373220", market: "KOSPI", aliases: ["엘지에너지솔루션", "엔솔"] },
    { name: "현대차", code: "005380", market: "KOSPI", aliases: ["현대자동차"] },
    { name: "기아", code: "000270", market: "KOSPI", aliases: ["kia"] },
    { name: "셀트리온", code: "068270", market: "KOSPI", aliases: ["celltrion"] },
    { name: "우리금융지주", code: "316140", market: "KOSPI", aliases: ["우리금융"] },
    { name: "에코프로비엠", code: "247540", market: "KOSDAQ", aliases: ["에코비엠"] },
    { name: "에코프로", code: "086520", market: "KOSDAQ", aliases: ["ecopro"] },
    { name: "알테오젠", code: "196170", market: "KOSDAQ", aliases: ["alteogen"] },
    { name: "HLB", code: "028300", market: "KOSDAQ", aliases: ["에이치엘비"] },
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[(){}\[\].,·ㆍ_\-]/g, "")
      .trim();
  }

  function normalizeCode(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.length <= 6 ? digits.padStart(6, "0") : digits.slice(-6);
  }

  function normalizeItem(raw) {
    const name = String(raw.name || raw.stock_name || raw.ticker_name || "").trim();
    const code = normalizeCode(raw.code || raw.ticker || raw.symbol || "");
    const market = String(raw.market || raw.market_name || "KRX").trim();
    const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];

    if (!name || !code) return null;

    return {
      name,
      code,
      market,
      aliases,
      url: raw.href || raw.url || `/stocks/${code}/`,
    };
  }

  function openPanel() {
    if (box) box.classList.add("open");
    panel.style.display = "block";
  }

  function closePanel() {
    if (box) box.classList.remove("open");
    panel.style.display = "";
  }

  function renderEmpty(message) {
    panel.innerHTML = `<div class="stock-search-empty">${escapeHtml(message)}</div>`;
    openPanel();
  }

  function parseUniverseFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const results = [];
    const map = new Map();

    const jsonNode = doc.getElementById("allStocksData");

    if (jsonNode) {
      try {
        const parsed = JSON.parse(jsonNode.textContent || "[]");

        if (Array.isArray(parsed)) {
          parsed.forEach(function (raw) {
            const item = normalizeItem(raw);
            if (item && !map.has(item.code)) {
              map.set(item.code, item);
              results.push(item);
            }
          });
        }
      } catch (e) {}
    }

    doc.querySelectorAll("a[href*='/stocks/']").forEach(function (a) {
      const href = a.getAttribute("href") || "";
      const match = href.match(/\/stocks\/([0-9A-Za-z]{6})\/?/);
      if (!match) return;

      const code = normalizeCode(match[1]);
      if (!code || map.has(code)) return;

      const name =
        a.querySelector(".stock-name")?.textContent?.trim() ||
        a.querySelector(".live-suggest-name")?.textContent?.trim() ||
        a.querySelector(".quick-name")?.textContent?.trim() ||
        a.textContent?.trim()?.split(/\s+/)[0] ||
        "";

      if (!name) return;

      const market =
        a.querySelector(".market-pill")?.textContent?.trim() ||
        a.querySelector(".live-suggest-market")?.textContent?.trim() ||
        a.querySelector(".badge")?.textContent?.trim() ||
        "KRX";

      const item = { name, code, market, aliases: [], url: href };

      map.set(code, item);
      results.push(item);
    });

    fallbackStocks.forEach(function (raw) {
      const item = normalizeItem(raw);

      if (item && !map.has(item.code)) {
        map.set(item.code, item);
        results.push(item);
      }
    });

    return results;
  }

  async function getUniverse() {
    if (Array.isArray(state.universe) && state.universe.length) {
      return state.universe;
    }

    try {
      const url = new URL(searchUrl, window.location.origin);

      const res = await fetch(url.toString(), {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        cache: "force-cache",
      });

      const html = await res.text();
      state.universe = parseUniverseFromHtml(html);
    } catch (e) {
      state.universe = fallbackStocks.map(normalizeItem).filter(Boolean);
    }

    if (!state.universe.length) {
      state.universe = fallbackStocks.map(normalizeItem).filter(Boolean);
    }

    return state.universe;
  }

  function scoreItem(item, query) {
    const q = normalizeText(query);
    if (!q) return 0;

    const name = normalizeText(item.name);
    const code = normalizeText(item.code);
    const market = normalizeText(item.market);
    const alias = normalizeText((item.aliases || []).join(" "));

    let score = 0;

    if (code === q) score = 10000;
    else if (name === q) score = 9500;
    else if (alias === q) score = 9300;
    else if (code.startsWith(q)) score = 8500;
    else if (name.startsWith(q)) score = 7800;
    else if (alias.includes(q)) score = 7200;
    else if (name.includes(q)) score = 6200;
    else if (code.includes(q)) score = 5500;
    else if (market.includes(q)) score = 800;

    if (!score) return 0;

    if (name.includes("삼성전자")) score += 500;
    if (name.includes("sk하이닉스")) score += 450;
    if (name.includes("naver")) score += 350;
    if (name.includes("카카오")) score += 300;

    return score;
  }

  function findMatches(universe, query) {
    const q = query.trim();
    if (!q) return [];

    return universe
      .map(function (item) {
        return {
          ...item,
          score: scoreItem(item, q),
        };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.name).localeCompare(String(b.name), "ko");
      })
      .slice(0, 20);
  }

  function renderResults(results) {
    if (!results.length) {
      renderEmpty("검색 결과가 없습니다.");
      return;
    }

    panel.innerHTML = results.slice(0, 12).map(function (item) {
      return `
        <button type="button" class="stock-search-item" data-url="${escapeHtml(item.url || `/stocks/${item.code}/`)}">
          <div>
            <div class="stock-search-name">${escapeHtml(item.name)}</div>
            <div class="stock-search-code">${escapeHtml(item.code)}</div>
          </div>
          <div class="stock-search-market">${escapeHtml(item.market || "KRX")}</div>
        </button>
      `;
    }).join("");

    openPanel();
  }

  async function runSearch(query, options) {
    options = options || {};

    const q = String(query || "").trim();

    if (!q) {
      renderEmpty("종목명 또는 코드를 입력하세요.");
      return [];
    }

    const onlyNumber = q.replace(/[^0-9]/g, "");

    if (onlyNumber.length === 6) {
      const direct = [{
        name: "종목코드 직접 이동",
        code: onlyNumber,
        market: "KRX",
        url: `/stocks/${onlyNumber}/`,
      }];

      renderResults(direct);

      if (options.navigateFirst) {
        window.location.href = direct[0].url;
      }

      return direct;
    }

    renderEmpty("검색 중입니다...");

    const universe = await getUniverse();
    const results = findMatches(universe, q);

    renderResults(results);

    if (options.navigateFirst && results[0]) {
      window.location.href = results[0].url;
    }

    return results;
  }

  function scheduleSearch() {
    clearTimeout(state.timer);

    state.timer = setTimeout(function () {
      runSearch(input.value);
    }, 180);
  }

  input.addEventListener("focus", function () {
    openPanel();

    if (!input.value.trim()) {
      renderEmpty("종목명 또는 코드를 입력하세요.");
    } else {
      scheduleSearch();
    }
  });

  input.addEventListener("input", scheduleSearch);

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();

      const first = panel.querySelector(".stock-search-item");

      if (first) {
        window.location.href = first.dataset.url;
        return;
      }

      runSearch(input.value, { navigateFirst: true });
    }

    if (event.key === "Escape") {
      closePanel();
    }
  });

  btn && btn.addEventListener("click", function () {
    runSearch(input.value);
  });

  panel.addEventListener("click", function (event) {
    const item = event.target.closest(".stock-search-item");
    if (!item) return;

    window.location.href = item.dataset.url;
  });

  document.addEventListener("click", function (event) {
    if (box && !box.contains(event.target)) {
      closePanel();
    }
  });

  renderEmpty("종목명 또는 코드를 입력하세요.");
})();