(function () {
  if (window.__BITGAK_PORTFOLIO_DRAWER_LOADED__) return;
  window.__BITGAK_PORTFOLIO_DRAWER_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  if (!app) return;

  const STORAGE_KEY = "bitgak:portfolio:v1";
  const DEFAULT_CAPITAL = 10000000;
  const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#facc15", "#64748b", "#ef4444", "#06b6d4"];

  const layout = document.querySelector(".bv-layout, .bv-layout-full");
  const drawer = document.getElementById("bvToolDrawer");
  const closeBtn = document.getElementById("closeToolDrawerBtn");
  const drawerTitle = document.getElementById("bvToolDrawerTitle");
  const drawerSubtitle = document.getElementById("bvToolDrawerSubtitle");
  const openAvgBtn = document.getElementById("openAvgDrawerBtn");
  const openPortfolioBtn = document.getElementById("openPortfolioDrawerBtn");
  const avgTab = document.getElementById("avgDrawerTab");
  const portfolioTab = document.getElementById("portfolioDrawerTab");
  const avgView = document.getElementById("avgDrawerView");
  const portfolioView = document.getElementById("portfolioDrawerView");

  const savePortfolioBtn = document.getElementById("avgSavePortfolioBtn");
  const avgPortfolioMessage = document.getElementById("avgPortfolioMessage");

  const capitalInput = document.getElementById("portfolioCapitalInput");
  const saveCapitalBtn = document.getElementById("portfolioSaveCapitalBtn");
  const alertEl = document.getElementById("portfolioAlert");
  const fixActions = document.getElementById("portfolioFixActions");
  const increaseCapitalBtn = document.getElementById("portfolioIncreaseCapitalBtn");
  const resetTradesBtn = document.getElementById("portfolioResetTradesBtn");

  const totalAssetEl = document.getElementById("portfolioTotalAsset");
  const investedEl = document.getElementById("portfolioInvested");
  const cashEl = document.getElementById("portfolioCash");
  const profitEl = document.getElementById("portfolioProfit");
  const donutEl = document.getElementById("portfolioDonut");
  const legendEl = document.getElementById("portfolioLegend");
  const holdingListEl = document.getElementById("portfolioHoldingList");

  let activePortfolioView = "stock";
  let activeDrawerView = null;
  let drawerCloseTimer = null;

  function toNumber(value) {
    const n = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function positiveNumber(value) {
    const n = toNumber(value);
    return n > 0 ? n : 0;
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return Math.round(n).toLocaleString("ko-KR");
  }

  function formatWon(value) {
    const n = Number(value || 0);
    const sign = n > 0 ? "" : n < 0 ? "-" : "";
    return sign + formatNumber(Math.abs(n)) + "원";
  }

  function formatRate(value) {
    const n = Number(value || 0);
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }

  function getRows() {
    if (window.BitgakChart && typeof window.BitgakChart.getRows === "function") return window.BitgakChart.getRows() || [];
    return [];
  }

  function getCurrentPrice() {
    const rows = getRows();
    const last = rows.length ? rows[rows.length - 1] : null;
    if (last && Number(last.close) > 0) return Number(last.close);

    const text = document.getElementById("currentPriceText") ? document.getElementById("currentPriceText").textContent : "";
    return positiveNumber(text);
  }

  function getStockInfo() {
    const name = app.dataset.name || "현재 종목";
    const code = app.dataset.code || "";
    const market = app.dataset.market || "KRX";
    const sectorFromServer = app.dataset.sector || "";

    return {
      code,
      name,
      market,
      sector: sectorFromServer || inferSector(name, code, market),
      lastPrice: getCurrentPrice(),
    };
  }

  function inferSector(name, code, market) {
    const text = String(name || "") + " " + String(code || "");
    if (/삼성전자|하이닉스|반도체|DB하이텍|한미반도체/.test(text)) return "반도체";
    if (/은행|금융|증권|화재|보험|카드|지주/.test(text)) return "금융";
    if (/현대차|기아|모비스|만도|자동차|타이어/.test(text)) return "자동차";
    if (/디스플레이|OLED|LCD/.test(text)) return "디스플레이";
    if (/바이오|제약|헬스|셀트리온|유한양행/.test(text)) return "바이오/제약";
    if (/화학|정유|에너지|가스|전력|배터리|2차전지/.test(text)) return "화학/에너지";
    if (/게임|엔씨|넷마블|크래프톤|카카오|NAVER|네이버/.test(text)) return "인터넷/게임";
    if (/건설|시멘트|철강|제철/.test(text)) return "산업재";
    return market || "기타";
  }

  function loadPortfolio() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        capital: positiveNumber(parsed.capital) || DEFAULT_CAPITAL,
        trades: Array.isArray(parsed.trades) ? parsed.trades.filter(Boolean) : [],
        updatedAt: parsed.updatedAt || null,
      };
    } catch (e) {
      return { capital: DEFAULT_CAPITAL, trades: [], updatedAt: null };
    }
  }

  function savePortfolio(portfolio) {
    const payload = {
      capital: positiveNumber(portfolio.capital) || DEFAULT_CAPITAL,
      trades: Array.isArray(portfolio.trades) ? portfolio.trades : [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    document.dispatchEvent(new CustomEvent("bitgak:portfolio-updated", { detail: payload }));
    return payload;
  }

  function showMessage(text, type) {
    if (!avgPortfolioMessage) return;
    avgPortfolioMessage.textContent = text;
    avgPortfolioMessage.classList.remove("ok", "warn", "error");
    if (type) avgPortfolioMessage.classList.add(type);
  }

  function isDrawerOpen() {
    return !!(layout && layout.classList.contains("bv-drawer-open"));
  }

  function syncDrawerState(isOpen) {
    if (!layout || !drawer) return;

    clearTimeout(drawerCloseTimer);
    drawerCloseTimer = null;

    if (isOpen) {
      drawer.style.removeProperty("display");
      drawer.style.removeProperty("visibility");
      drawer.style.removeProperty("opacity");
      drawer.style.removeProperty("pointer-events");
      drawer.style.removeProperty("transform");

      drawer.setAttribute("aria-hidden", "false");
      drawer.classList.remove("bv-drawer-closing");

      // display:none 상태에서 바로 open 클래스를 주면 transition이 먹지 않으므로 한 프레임 뒤 열림 처리한다.
      requestAnimationFrame(function () {
        layout.classList.add("bv-drawer-open");
        drawer.classList.add("open");
      });
    } else {
      drawer.setAttribute("aria-hidden", "true");
      drawer.classList.add("bv-drawer-closing");
      drawer.classList.remove("open");
      layout.classList.remove("bv-drawer-open");

      // CSS grid 0px column + opacity/transform transition으로 닫히게 두고,
      // transition이 끝난 뒤에만 완전히 숨겨 포커스/클릭을 차단한다.
      drawerCloseTimer = setTimeout(function () {
        drawer.classList.remove("bv-drawer-closing");
        if (!isDrawerOpen()) {
          drawer.style.setProperty("visibility", "hidden", "important");
          drawer.style.setProperty("pointer-events", "none", "important");
        }
      }, 520);
    }
  }

  function openDrawer(view) {
    if (!layout || !drawer) return;
    const target = view === "portfolio" ? "portfolio" : "avg";
    activeDrawerView = target;

    syncDrawerState(true);

    avgView && avgView.classList.toggle("active", target === "avg");
    portfolioView && portfolioView.classList.toggle("active", target === "portfolio");
    avgTab && avgTab.classList.toggle("active", target === "avg");
    portfolioTab && portfolioTab.classList.toggle("active", target === "portfolio");
    openAvgBtn && openAvgBtn.classList.toggle("active", target === "avg");
    openPortfolioBtn && openPortfolioBtn.classList.toggle("active", target === "portfolio");

    if (drawerTitle) drawerTitle.textContent = target === "portfolio" ? "포트폴리오" : "평단가 계산기";
    if (drawerSubtitle) drawerSubtitle.textContent = target === "portfolio" ? "보유 종목과 현금 비중을 확인합니다." : "현재 종목의 매수/매도 계획을 계산합니다.";

    if (target === "portfolio") renderPortfolio();

    requestResize();
  }

  function toggleDrawer(view) {
    const target = view === "portfolio" ? "portfolio" : "avg";
    if (isDrawerOpen() && activeDrawerView === target) {
      closeDrawer();
      return;
    }
    openDrawer(target);
  }

  function closeDrawer() {
    if (!layout || !drawer) return;
    activeDrawerView = null;
    syncDrawerState(false);
    openAvgBtn && openAvgBtn.classList.remove("active");
    openPortfolioBtn && openPortfolioBtn.classList.remove("active");
    requestResize();
  }

  function requestResize() {
    const fire = function () { window.dispatchEvent(new Event("resize")); };
    requestAnimationFrame(fire);
    setTimeout(fire, 40);
    setTimeout(fire, 260);
  }

  function readAvgRowsFromDom() {
    const rowsWrap = document.getElementById("avgCalcRows");
    if (!rowsWrap) return [];

    return Array.from(rowsWrap.querySelectorAll(".avg-calc-row-item")).map(function (row, index) {
      const rowId = row.dataset.rowId;
      const panel = rowsWrap.querySelector('.avg-line-style-panel[data-for="' + rowId + '"]');
      const typeInput = panel ? panel.querySelector(".avg-line-type-select") : null;
      const colorInput = panel ? panel.querySelector(".avg-line-color") : null;
      const styleInput = panel ? panel.querySelector(".avg-line-style-select") : null;
      const widthInput = panel ? panel.querySelector(".avg-line-width-select") : null;
      const price = positiveNumber(row.querySelector(".avg-price-input") && row.querySelector(".avg-price-input").value);
      const qty = positiveNumber(row.querySelector(".avg-qty-input") && row.querySelector(".avg-qty-input").value);
      const type = typeInput && typeInput.value === "sell" ? "sell" : "buy";

      return {
        type,
        price,
        qty,
        amount: price * qty,
        lineColor: colorInput && colorInput.value ? colorInput.value : type === "sell" ? "#fb7185" : "#60a5fa",
        lineStyle: styleInput && styleInput.value ? styleInput.value : "dashed",
        lineWidth: widthInput && widthInput.value ? Number(widthInput.value) : 1,
        order: index + 1,
      };
    }).filter(function (item) {
      return item.price > 0 && item.qty > 0;
    });
  }

  function calcTradeTotals(trades) {
    let buyAmount = 0;
    let sellAmount = 0;
    let buyQty = 0;
    let sellQty = 0;

    (trades || []).forEach(function (trade) {
      const amount = Number(trade.price || 0) * Number(trade.qty || 0);
      if (trade.type === "sell") {
        sellAmount += amount;
        sellQty += Number(trade.qty || 0);
      } else {
        buyAmount += amount;
        buyQty += Number(trade.qty || 0);
      }
    });

    return {
      buyAmount,
      sellAmount,
      buyQty,
      sellQty,
      netCashUsed: buyAmount - sellAmount,
      holdQty: buyQty - sellQty,
    };
  }

  function groupPositions(trades) {
    const map = new Map();

    (trades || []).forEach(function (trade) {
      const key = trade.code || "UNKNOWN";
      if (!map.has(key)) {
        map.set(key, {
          code: key,
          name: trade.name || key,
          market: trade.market || "KRX",
          sector: trade.sector || "기타",
          lastPrice: positiveNumber(trade.lastPrice),
          trades: [],
          buyAmount: 0,
          sellAmount: 0,
          buyQty: 0,
          sellQty: 0,
        });
      }
      const item = map.get(key);
      item.trades.push(trade);
      item.lastPrice = positiveNumber(trade.lastPrice) || item.lastPrice;
      item.sector = trade.sector || item.sector;
      item.name = trade.name || item.name;

      const amount = Number(trade.price || 0) * Number(trade.qty || 0);
      if (trade.type === "sell") {
        item.sellAmount += amount;
        item.sellQty += Number(trade.qty || 0);
      } else {
        item.buyAmount += amount;
        item.buyQty += Number(trade.qty || 0);
      }
    });

    const current = getStockInfo();
    if (map.has(current.code)) {
      const item = map.get(current.code);
      if (current.lastPrice > 0) item.lastPrice = current.lastPrice;
      if (current.sector) item.sector = current.sector;
    }

    return Array.from(map.values()).map(function (item) {
      const holdQty = Math.max(0, item.buyQty - item.sellQty);
      const average = item.buyQty > 0 ? item.buyAmount / item.buyQty : 0;
      const costBasis = average * holdQty;
      const valuation = holdQty * (item.lastPrice || average || 0);
      const profit = valuation - costBasis;
      const returnRate = costBasis > 0 ? profit / costBasis * 100 : 0;
      const netCashUsed = item.buyAmount - item.sellAmount;

      return Object.assign(item, { holdQty, average, costBasis, valuation, profit, returnRate, netCashUsed });
    }).filter(function (item) {
      return item.holdQty > 0 || item.netCashUsed !== 0;
    });
  }

  function calcPortfolio(portfolio) {
    const trades = portfolio.trades || [];
    const totals = calcTradeTotals(trades);
    const cash = Number(portfolio.capital || DEFAULT_CAPITAL) - totals.netCashUsed;
    const positions = groupPositions(trades);
    const valuation = positions.reduce(function (sum, item) { return sum + Number(item.valuation || 0); }, 0);
    const totalAsset = cash + valuation;
    const profit = totalAsset - Number(portfolio.capital || DEFAULT_CAPITAL);
    const returnRate = portfolio.capital > 0 ? profit / portfolio.capital * 100 : 0;

    return { totals, cash, positions, valuation, totalAsset, profit, returnRate };
  }

  function saveCurrentAverageToPortfolio() {
    const avgRows = readAvgRowsFromDom();
    if (!avgRows.length) {
      showMessage("저장할 매수/매도 줄이 없습니다.", "warn");
      return;
    }

    const current = getStockInfo();
    const totals = calcTradeTotals(avgRows);

    if (totals.sellQty > totals.buyQty) {
      showMessage("매도 수량이 매수 수량보다 많습니다. 수량을 확인하세요.", "error");
      return;
    }

    const portfolio = loadPortfolio();
    const otherTrades = portfolio.trades.filter(function (trade) { return trade.code !== current.code; });
    const newTrades = avgRows.map(function (row) {
      return Object.assign({}, row, {
        code: current.code,
        name: current.name,
        market: current.market,
        sector: current.sector,
        lastPrice: current.lastPrice,
        savedAt: new Date().toISOString(),
      });
    });

    const candidate = { capital: portfolio.capital, trades: otherTrades.concat(newTrades) };
    const calc = calcPortfolio(candidate);

    if (calc.cash < -0.0001) {
      showMessage("잔액이 없습니다. 돈이 부족합니다. 포트폴리오 원금을 늘리거나 기존 매수를 초기화하세요.", "error");
      openDrawer("portfolio");
      renderPortfolio(candidate);
      return;
    }

    savePortfolio(candidate);
    showMessage("포트폴리오에 저장되었습니다.", "ok");
    renderPortfolio();
    openDrawer("portfolio");
  }

  function setText(el, text, className) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("positive", "negative", "warning");
    if (className) el.classList.add(className);
  }

  function buildBreakdown(calc, view) {
    const positions = calc.positions || [];
    const items = [];

    if (view === "sector") {
      const map = new Map();
      positions.forEach(function (pos) {
        const key = pos.sector || "기타";
        map.set(key, (map.get(key) || 0) + Number(pos.valuation || 0));
      });
      map.forEach(function (value, key) {
        if (value > 0) items.push({ name: key, value });
      });
    } else {
      positions.forEach(function (pos) {
        if (pos.valuation > 0) items.push({ name: pos.name, code: pos.code, value: pos.valuation });
      });
    }

    if (calc.cash > 0) items.push({ name: "현금", value: calc.cash, isCash: true });
    return items.sort(function (a, b) { return b.value - a.value; });
  }

  function renderDonut(items) {
    if (!donutEl || !legendEl) return;

    const total = items.reduce(function (sum, item) { return sum + Math.max(0, Number(item.value || 0)); }, 0);
    if (!items.length || total <= 0) {
      donutEl.style.background = "conic-gradient(#1e293b 0deg 360deg)";
      donutEl.innerHTML = "<span>비어있음</span>";
      legendEl.innerHTML = '<div class="portfolio-empty">포트폴리오에 저장된 종목이 없습니다.</div>';
      return;
    }

    let deg = 0;
    const gradients = [];
    const legend = [];

    items.forEach(function (item, index) {
      const ratio = Math.max(0, Number(item.value || 0)) / total;
      const next = deg + ratio * 360;
      const color = item.isCash ? "#334155" : COLORS[index % COLORS.length];
      gradients.push(color + " " + deg.toFixed(2) + "deg " + next.toFixed(2) + "deg");
      legend.push({ item, color, ratio });
      deg = next;
    });

    donutEl.style.background = "conic-gradient(" + gradients.join(",") + ")";
    donutEl.innerHTML = '<span>' + formatWon(total) + '<small>총 비중</small></span>';
    legendEl.innerHTML = legend.map(function (entry) {
      return ''
        + '<div class="portfolio-legend-row">'
        + '<i style="--legend-color:' + entry.color + '"></i>'
        + '<span>' + escapeHtml(entry.item.name) + '</span>'
        + '<b>' + (entry.ratio * 100).toFixed(1) + '%</b>'
        + '</div>';
    }).join("");
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stockUrl(code) {
    const path = window.location.pathname;
    const match = path.match(/\/stocks\/([^/]+)\//);
    if (match) return path.replace(/\/stocks\/[^/]+\//, "/stocks/" + code + "/");
    return "/stocks/" + code + "/";
  }

  function renderHoldings(calc) {
    if (!holdingListEl) return;
    const positions = calc.positions || [];

    if (!positions.length) {
      holdingListEl.innerHTML = '<div class="portfolio-empty">평단가 계산기에서 매수/매도 줄을 입력하고 [포트폴리오에 저장]을 눌러주세요.</div>';
      return;
    }

    holdingListEl.innerHTML = positions.map(function (pos) {
      const cls = pos.profit >= 0 ? "positive" : "negative";
      return ''
        + '<a class="portfolio-holding-item" href="' + stockUrl(pos.code) + '">'
        + '  <div class="portfolio-holding-main">'
        + '    <strong>' + escapeHtml(pos.name) + '</strong>'
        + '    <span>' + escapeHtml(pos.code) + ' · ' + escapeHtml(pos.sector || "기타") + '</span>'
        + '  </div>'
        + '  <div class="portfolio-holding-values">'
        + '    <b>' + formatWon(pos.valuation) + '</b>'
        + '    <em class="' + cls + '">' + (pos.profit >= 0 ? "+" : "") + formatWon(pos.profit) + ' · ' + formatRate(pos.returnRate) + '</em>'
        + '  </div>'
        + '</a>';
    }).join("");
  }

  function renderPortfolio(overridePortfolio) {
    const portfolio = overridePortfolio || loadPortfolio();
    const calc = calcPortfolio(portfolio);
    const capital = Number(portfolio.capital || DEFAULT_CAPITAL);
    const required = calc.totals.netCashUsed;

    if (capitalInput) capitalInput.value = String(Math.round(capital));

    setText(totalAssetEl, formatWon(calc.totalAsset), calc.profit >= 0 ? "positive" : "negative");
    setText(investedEl, formatWon(required));
    setText(cashEl, formatWon(calc.cash), calc.cash >= 0 ? "positive" : "negative");
    setText(profitEl, formatRate(calc.returnRate), calc.profit >= 0 ? "positive" : "negative");

    if (alertEl && fixActions) {
      if (required > capital) {
        alertEl.hidden = false;
        fixActions.hidden = false;
        alertEl.textContent = "현재 저장된 매수금이 포트폴리오 원금보다 큽니다. 원금을 " + formatWon(required) + " 이상으로 늘리거나 매수/매도 기록을 초기화하세요.";
      } else if (calc.cash < 0) {
        alertEl.hidden = false;
        fixActions.hidden = false;
        alertEl.textContent = "잔액이 없습니다. 돈이 부족합니다.";
      } else {
        alertEl.hidden = true;
        fixActions.hidden = true;
        alertEl.textContent = "";
      }
    }

    renderDonut(buildBreakdown(calc, activePortfolioView));
    renderHoldings(calc);
  }

  function saveCapital() {
    const portfolio = loadPortfolio();
    const newCapital = positiveNumber(capitalInput && capitalInput.value) || DEFAULT_CAPITAL;
    portfolio.capital = newCapital;
    savePortfolio(portfolio);
    renderPortfolio();
  }

  function increaseCapitalToNeeded() {
    const portfolio = loadPortfolio();
    const calc = calcPortfolio(portfolio);
    portfolio.capital = Math.max(Number(portfolio.capital || 0), Math.ceil(calc.totals.netCashUsed));
    savePortfolio(portfolio);
    renderPortfolio();
  }

  function resetPortfolioTrades() {
    const portfolio = loadPortfolio();
    if (!window.confirm("포트폴리오에 저장된 모든 매수/매도 기록을 초기화할까요?")) return;
    portfolio.trades = [];
    savePortfolio(portfolio);
    renderPortfolio();
  }

  document.querySelectorAll("[data-drawer-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      toggleDrawer(btn.dataset.drawerOpen);
    });
  });

  document.querySelectorAll("[data-drawer-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openDrawer(btn.dataset.drawerTab);
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (savePortfolioBtn) savePortfolioBtn.addEventListener("click", saveCurrentAverageToPortfolio);
  if (saveCapitalBtn) saveCapitalBtn.addEventListener("click", saveCapital);
  if (increaseCapitalBtn) increaseCapitalBtn.addEventListener("click", increaseCapitalToNeeded);
  if (resetTradesBtn) resetTradesBtn.addEventListener("click", resetPortfolioTrades);

  document.querySelectorAll("[data-portfolio-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activePortfolioView = btn.dataset.portfolioView === "sector" ? "sector" : "stock";
      document.querySelectorAll("[data-portfolio-view]").forEach(function (el) {
        el.classList.toggle("active", el === btn);
      });
      renderPortfolio();
    });
  });

  document.addEventListener("bitgak:chart-data-loaded", renderPortfolio);
  document.addEventListener("bitgak:portfolio-updated", renderPortfolio);

  syncDrawerState(false);
  renderPortfolio();
})();
