(function () {
  "use strict";

  if (window.__BITGAK_PIRAMID_LOADED__) return;
  window.__BITGAK_PIRAMID_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  const panel = document.getElementById("piramidDrawerView");
  if (!app || !panel) return;

  const code = String(app.dataset.code || "global");
  const PIRAMID_API_URL = app.dataset.piramidApiUrl || ("/stocks/api/piramid/" + encodeURIComponent(code) + "/");
  let serverLoaded = false;
  let serverSaveTimer = null;
  const DRAWER_ANIMATION_MS = 1450;
  const DRAWER_SAFE_RESIZE_EVENTS = [0, 80, 180, 360, 760, 1280, 1700];

  const STRATEGIES = {
    exit: {
      label: "빠른탈출형",
      desc: "0.5a + 0.5a + 1a + 2a + 4a",
      weights: [0.5, 0.5, 1, 2, 4],
      colors: ["#38bdf8", "#3b82f6", "#2563eb", "#1d4ed8", "#0f766e"]
    },
    balanced: {
      label: "균형형",
      desc: "1a + 1a + 1.5a + 2a + 2.5a",
      weights: [1, 1, 1.5, 2, 2.5],
      colors: ["#7dd3fc", "#38bdf8", "#3b82f6", "#2563eb", "#1d4ed8"]
    },
    classic: {
      label: "기존 4분할",
      desc: "1a + 1a + 2a + 4a, 5차 없음",
      weights: [1, 1, 2, 4, 0],
      colors: ["#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8", "#94a3b8"]
    }
  };

  const layout = document.querySelector(".bv-layout, .bv-layout-full");
  const drawer = document.getElementById("bvToolDrawer");
  const closeBtn = document.getElementById("closeToolDrawerBtn");
  const drawerTitle = document.getElementById("bvToolDrawerTitle");
  const drawerSubtitle = document.getElementById("bvToolDrawerSubtitle");
  const piramidTab = document.getElementById("piramidDrawerTab");
  const openButtons = Array.from(document.querySelectorAll("[data-piramid-open]"));

  const strategyInput = document.getElementById("piramidStrategySelect");
  const unitInput = document.getElementById("piramidUnitInput");
  const startPriceInput = document.getElementById("piramidStartPriceInput");
  const dropRateInput = document.getElementById("piramidDropRateInput");
  const useCurrentBtn = document.getElementById("piramidUseCurrentPriceBtn");
  const calcBtn = document.getElementById("piramidCalcBtn");
  const applyBtn = document.getElementById("piramidApplyChartBtn");
  const clearBtn = document.getElementById("piramidClearChartBtn");
  const resetBtn = document.getElementById("piramidResetBtn");
  const tableBody = document.getElementById("piramidTableBody");
  const statusEl = document.getElementById("piramidStatus");

  const summaryEls = {
    totalPlan: document.getElementById("piramidTotalPlan"),
    totalActual: document.getElementById("piramidTotalActual"),
    totalQty: document.getElementById("piramidTotalQty"),
    finalAvg: document.getElementById("piramidFinalAvg"),
    finalLoss: document.getElementById("piramidFinalLoss"),
    rebound: document.getElementById("piramidReboundRate")
  };

  let activePlan = null;
  let chartSeries = [];
  let priceLines = [];
  let overlayEl = null;
  let overlayTimer = null;
  let saveTimer = null;
  let resizeTimer = null;

  function getCookie(name) {
    const value = `; ${document.cookie || ""}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift());
    return "";
  }

  function getAccessInfo() {
    if (window.BITGAK_ACCESS) return window.BITGAK_ACCESS;

    const el = document.getElementById("bitgak-access-data");
    if (!el) return {};

    try {
      const parsed = JSON.parse(el.textContent || "{}");
      window.BITGAK_ACCESS = parsed;
      return parsed;
    } catch (e) {
      return {};
    }
  }

  function isAuthenticated() {
    return !!getAccessInfo().is_authenticated;
  }

  function isPremium() {
    return !!getAccessInfo().is_premium;
  }

  function openAccessLock(kind, options) {
    if (window.BitgakAccessLock && typeof window.BitgakAccessLock.open === "function") {
      window.BitgakAccessLock.open(kind, options || {});
      return;
    }

    if (kind === "login") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/accounts/login/?next=" + next;
      return;
    }

    window.location.href = "/stocks/pricing/";
  }

  function requirePiramidPremium() {
    if (!isAuthenticated()) {
      openAccessLock("login", {
        title: "로그인 후 사용할 수 있습니다",
        message: "분할매수 전략 계산기는 로그인 후 이용할 수 있습니다."
      });
      return false;
    }

    if (!isPremium()) {
      openAccessLock("premium", {
        title: "프리미엄 전용 기능입니다",
        message: "분할매수 전략 계산기는 프리미엄 회원 또는 쿠폰 이용자만 사용할 수 있습니다."
      });
      return false;
    }

    return true;
  }

  function api() {
    return window.BitgakChart || null;
  }

  function toNumber(value) {
    const n = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function positiveNumber(value) {
    const n = toNumber(value);
    return n > 0 ? n : 0;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return Math.round(n).toLocaleString("ko-KR");
  }

  function formatWon(value) {
    return formatNumber(value) + "원";
  }

  function formatQty(value) {
    return formatNumber(value) + "주";
  }

  function formatCompactWon(value) {
    const n = Math.round(Number(value || 0));
    const abs = Math.abs(n);

    if (!Number.isFinite(n) || abs === 0) return "0";
    if (abs >= 100000000) {
      const v = n / 100000000;
      return (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + "억";
    }
    if (abs >= 10000) {
      return Math.round(n / 10000).toLocaleString("ko-KR") + "만";
    }
    return formatNumber(n);
  }

  function formatTablePrice(value) {
    const n = Math.round(Number(value || 0));
    if (!Number.isFinite(n) || n <= 0) return "-";
    return n.toLocaleString("ko-KR");
  }

  function formatTableActual(value) {
    const n = Math.round(Number(value || 0));
    if (!Number.isFinite(n) || n <= 0) return "-";
    return n.toLocaleString("ko-KR");
  }

  function formatMobileMoney(value) {
    const n = Math.round(Number(value || 0));
    if (!Number.isFinite(n) || n <= 0) return "-";

    const abs = Math.abs(n);

    if (abs >= 100000000) {
      const v = n / 100000000;
      return (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + "억";
    }

    if (abs >= 10000) {
      const v = n / 10000;
      const fixed = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "");
      return fixed + "만";
    }

    return n.toLocaleString("ko-KR");
  }

  function formatRate(value) {
    const n = Number(value || 0);
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }

  function roundPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(1, Math.round(n));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getRows() {
    const chartApi = api();
    if (chartApi && typeof chartApi.getRows === "function") return chartApi.getRows() || [];
    return [];
  }

  function getCurrentPrice() {
    const rows = getRows();
    const last = rows.length ? rows[rows.length - 1] : null;
    if (last && Number(last.close) > 0) return Number(last.close);

    const text = document.getElementById("currentPriceText") ? document.getElementById("currentPriceText").textContent : "";
    return positiveNumber(text);
  }

  function getStrategy() {
    const key = strategyInput ? String(strategyInput.value || "exit") : "exit";
    return STRATEGIES[key] || STRATEGIES.exit;
  }

  function getFormValues() {
    return {
      strategy: strategyInput ? String(strategyInput.value || "exit") : "exit",
      unit: positiveNumber(unitInput ? unitInput.value : 500000) || 500000,
      startPrice: positiveNumber(startPriceInput ? startPriceInput.value : 0),
      dropRate: clampNumber(dropRateInput ? dropRateInput.value : 15, 1, 80, 15)
    };
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = "piramid-status" + (type ? " " + type : "");
  }

  function buildPlan() {
    const values = getFormValues();
    const strategy = STRATEGIES[values.strategy] || STRATEGIES.exit;
    const startPrice = values.startPrice || getCurrentPrice();

    if (!startPrice || startPrice <= 0) {
      return {
        ok: false,
        message: "시작가격을 입력하거나 [현재가 입력]을 눌러주세요.",
        rows: [],
        summary: null
      };
    }

    const rows = [];
    let cumQty = 0;
    let cumActual = 0;
    let cumPlan = 0;

    strategy.weights.forEach(function (weight, index) {
      const step = index + 1;
      const price = roundPrice(startPrice * Math.pow(1 - values.dropRate / 100, index));
      const planAmount = Math.round(values.unit * Number(weight || 0));
      const qty = price > 0 && planAmount > 0 ? Math.max(1, Math.floor(planAmount / price)) : 0;
      const actualAmount = qty * price;

      cumPlan += planAmount;
      cumQty += qty;
      cumActual += actualAmount;

      const avg = cumQty > 0 ? cumActual / cumQty : 0;
      const dropFromStart = (price / startPrice - 1) * 100;
      const lossAtStep = avg > 0 ? (price / avg - 1) * 100 : 0;
      const rebound = price > 0 && avg > 0 ? (avg / price - 1) * 100 : 0;

      rows.push({
        step,
        weight,
        price,
        planAmount,
        qty,
        actualAmount,
        cumPlan,
        cumQty,
        cumActual,
        avg,
        dropFromStart,
        lossAtStep,
        rebound,
        color: strategy.colors[index] || "#2563eb"
      });
    });

    const lastActive = rows.filter(function (row) { return row.qty > 0 && row.weight > 0; }).pop() || rows[rows.length - 1];
    const summary = {
      strategyKey: values.strategy,
      strategyLabel: strategy.label,
      strategyDesc: strategy.desc,
      unit: values.unit,
      startPrice,
      dropRate: values.dropRate,
      totalPlan: rows.reduce(function (sum, row) { return sum + row.planAmount; }, 0),
      totalActual: lastActive ? lastActive.cumActual : 0,
      totalQty: lastActive ? lastActive.cumQty : 0,
      finalAvg: lastActive ? lastActive.avg : 0,
      finalPrice: lastActive ? lastActive.price : 0,
      finalLoss: lastActive ? lastActive.lossAtStep : 0,
      rebound: lastActive ? lastActive.rebound : 0
    };

    return { ok: true, rows, summary };
  }

  function renderTable(plan) {
    if (!tableBody) return;

    if (!plan || !plan.ok) {
      tableBody.innerHTML = '<tr><td colspan="6">시작가격과 a 금액을 입력하면 바로 자동 계산됩니다.</td></tr>';
      return;
    }

    tableBody.innerHTML = plan.rows.map(function (row) {
      const noBuy = !(row.weight > 0 && row.planAmount > 0);
      const stepText = row.step + "차";
      const stepDesktop = row.step + "차매수";
      const priceText = row.price ? formatTablePrice(row.price) : "-";
      const priceMobile = row.price ? formatMobileMoney(row.price) : "-";
      const qtyText = row.qty ? formatNumber(row.qty) : "-";
      const actualDesktop = row.actualAmount ? formatTableActual(row.actualAmount) : "-";
      const actualMobile = row.actualAmount ? formatMobileMoney(row.actualAmount) : "-";
      const avgText = row.avg ? formatTablePrice(row.avg) : "-";
      const avgMobile = row.avg ? formatMobileMoney(row.avg) : "-";

      return `
        <tr class="${noBuy ? "no-buy" : ""}">
          <td class="step-cell">
            <span class="piramid-step-pill">
              <span class="piramid-desktop-text">${stepDesktop}</span>
              <span class="piramid-mobile-text">${stepText}</span>
            </span>
          </td>
          <td class="price-cell">
            <span class="piramid-desktop-text">${priceText}</span>
            <span class="piramid-mobile-text">${priceMobile}</span>
          </td>
          <td class="drop-cell">${formatRate(row.dropFromStart)}</td>
          <td class="qty-cell">
            <span class="piramid-desktop-text">${row.qty ? formatQty(row.qty) : "-"}</span>
            <span class="piramid-mobile-text">${qtyText}</span>
          </td>
          <td class="actual-cell">
            <span class="piramid-desktop-text">${actualDesktop}</span>
            <span class="piramid-mobile-text">${actualMobile}</span>
          </td>
          <td class="avg-cell">
            <span class="piramid-desktop-text">${avgText}</span>
            <span class="piramid-mobile-text">${avgMobile}</span>
          </td>
        </tr>`;
    }).join("");
  }

  function renderSummary(plan) {
    const summary = plan && plan.ok ? plan.summary : null;
    if (!summary) {
      if (summaryEls.totalPlan) summaryEls.totalPlan.textContent = "-";
      if (summaryEls.totalActual) summaryEls.totalActual.textContent = "-";
      if (summaryEls.totalQty) summaryEls.totalQty.textContent = "-";
      if (summaryEls.finalAvg) summaryEls.finalAvg.textContent = "-";
      if (summaryEls.finalLoss) summaryEls.finalLoss.textContent = "-";
      if (summaryEls.rebound) summaryEls.rebound.textContent = "-";
      return;
    }

    if (summaryEls.totalPlan) summaryEls.totalPlan.textContent = formatWon(summary.totalPlan);
    if (summaryEls.totalActual) summaryEls.totalActual.textContent = formatWon(summary.totalActual);
    if (summaryEls.totalQty) summaryEls.totalQty.textContent = formatQty(summary.totalQty);
    if (summaryEls.finalAvg) summaryEls.finalAvg.textContent = formatWon(summary.finalAvg);
    if (summaryEls.finalLoss) summaryEls.finalLoss.textContent = formatRate(summary.finalLoss);
    if (summaryEls.rebound) summaryEls.rebound.textContent = formatRate(summary.rebound);
  }

  function calculateAndRender(showMessage) {
    const plan = buildPlan();
    renderTable(plan);
    renderSummary(plan);

    if (!plan.ok) {
      setStatus(plan.message, "warn");
    } else if (showMessage) {
      setStatus(plan.summary.strategyLabel + " 계산 완료 · 5차 기준 최종 평단 " + formatWon(plan.summary.finalAvg), "ok");
    }

    return plan;
  }

  function normalizeSavedForm(raw) {
    raw = raw || {};
    const payload = raw.piramid || raw.data || raw;
    return {
      strategy: payload.strategy || "exit",
      unit: positiveNumber(payload.unit) || 500000,
      startPrice: positiveNumber(payload.startPrice || payload.start_price) || 0,
      dropRate: clampNumber(payload.dropRate || payload.drop_rate || 15, 1, 80, 15)
    };
  }

  function applyFormValues(saved) {
    const values = normalizeSavedForm(saved || {});
    if (strategyInput) strategyInput.value = STRATEGIES[values.strategy] ? values.strategy : "exit";
    if (unitInput) unitInput.value = String(values.unit || 500000);
    if (dropRateInput) dropRateInput.value = String(values.dropRate || 15);
    if (startPriceInput) startPriceInput.value = values.startPrice ? String(values.startPrice) : "";
  }

  function restoreForm() {
    applyFormValues({ strategy: "exit", unit: 500000, dropRate: 15, startPrice: 0 });
  }

  async function fetchServerForm() {
    if (!isAuthenticated()) {
      serverLoaded = true;
      return false;
    }

    try {
      const res = await fetch(PIRAMID_API_URL, {
        method: "GET",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!res.ok) throw new Error("piramid api get failed");

      const data = await res.json();
      const payload = data && (data.piramid || data.data || data);
      if (payload && Object.keys(payload).length) {
        applyFormValues(payload);
        calculateAndRender(false);
        setStatus("서버에 저장된 분할매수 설정을 불러왔습니다.", "ok");
      }

      serverLoaded = true;
      return true;
    } catch (e) {
      serverLoaded = false;
      console.warn("Bitgak piramid server load failed:", e);
      return false;
    }
  }

  function saveFormSoon() {
    clearTimeout(saveTimer);
    clearTimeout(serverSaveTimer);

    if (!isAuthenticated()) return;

    serverSaveTimer = setTimeout(async function () {
      try {
        const res = await fetch(PIRAMID_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": getCookie("csrftoken")
          },
          credentials: "same-origin",
          body: JSON.stringify({ piramid: getFormValues() })
        });

        if (!res.ok) throw new Error("piramid api save failed");
        serverLoaded = true;
      } catch (e) {
        console.warn("Bitgak piramid server save failed:", e);
      }
    }, 260);
  }

  function requestResize() {
    const fire = function () { window.dispatchEvent(new Event("resize")); };
    requestAnimationFrame(fire);
    clearTimeout(resizeTimer);
    const startedAt = Date.now();
    resizeTimer = setInterval(function () {
      fire();
      if (Date.now() - startedAt > DRAWER_ANIMATION_MS + 160) {
        clearInterval(resizeTimer);
        resizeTimer = null;
        requestAnimationFrame(fire);
      }
    }, 80);
  }

  function requestDrawerSafeResize() {
    DRAWER_SAFE_RESIZE_EVENTS.forEach(function (delay) {
      setTimeout(function () {
        try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        try {
          if (window.BitgakChart && typeof window.BitgakChart.renderDrawings === "function") {
            window.BitgakChart.renderDrawings();
          }
        } catch (e) {}
      }, delay);
    });
  }

  function openDrawer() {
    if (!requirePiramidPremium()) return;
    if (!layout || !drawer) return;

    drawer.style.removeProperty("display");
    drawer.style.removeProperty("visibility");
    drawer.style.removeProperty("opacity");
    drawer.style.removeProperty("pointer-events");
    drawer.style.removeProperty("transform");
    drawer.setAttribute("aria-hidden", "false");
    drawer.classList.remove("bv-drawer-closing");

    requestAnimationFrame(function () {
      layout.classList.add("bv-drawer-open");
      drawer.classList.add("open");
    });

    document.querySelectorAll(".bv-drawer-view").forEach(function (view) {
      view.classList.toggle("active", view === panel);
    });

    document.querySelectorAll(".bv-tool-tab").forEach(function (tab) {
      tab.classList.toggle("active", tab === piramidTab);
    });

    document.querySelectorAll("#openAvgDrawerBtn, #openPortfolioDrawerBtn").forEach(function (btn) {
      btn.classList.remove("active");
    });

    openButtons.forEach(function (btn) { btn.classList.add("active"); });

    if (drawerTitle) drawerTitle.textContent = "분할매수 전략";
    if (drawerSubtitle) drawerSubtitle.textContent = "a 금액과 시작가격으로 1차~5차 매수가·수량·평단을 계산합니다.";

    calculateAndRender(false);
    try { panel.scrollTop = 0; } catch (e) {}
    try { drawer.scrollTop = 0; } catch (e) {}
    requestResize();
    requestDrawerSafeResize();
  }

  function isPiramidDrawerOpen() {
    return !!(layout && drawer && layout.classList.contains("bv-drawer-open") && drawer.classList.contains("open") && panel.classList.contains("active"));
  }

  function closeDrawer() {
    if (!layout || !drawer) return;

    drawer.setAttribute("aria-hidden", "true");
    drawer.classList.add("bv-drawer-closing");
    drawer.classList.remove("open");
    layout.classList.remove("bv-drawer-open");
    deactivatePiramidUi();

    setTimeout(function () {
      if (!layout.classList.contains("bv-drawer-open")) {
        drawer.classList.remove("bv-drawer-closing");
        drawer.style.setProperty("visibility", "hidden", "important");
        drawer.style.setProperty("pointer-events", "none", "important");
      }
      requestDrawerSafeResize();
    }, DRAWER_ANIMATION_MS);

    requestResize();
    requestDrawerSafeResize();
  }

  function deactivatePiramidUi() {
    panel.classList.remove("active");
    if (piramidTab) piramidTab.classList.remove("active");
    openButtons.forEach(function (btn) { btn.classList.remove("active"); });
  }

  function getLineStyleDashed() {
    const LW = window.LightweightCharts || {};
    return LW.LineStyle && LW.LineStyle.Dashed !== undefined ? LW.LineStyle.Dashed : 2;
  }

  function removeChartObjects() {
    const chartApi = api();

    priceLines.forEach(function (line) {
      try {
        if (chartApi && chartApi.candleSeries && chartApi.candleSeries.removePriceLine) {
          chartApi.candleSeries.removePriceLine(line);
        }
      } catch (e) {}
    });
    priceLines = [];

    chartSeries.forEach(function (series) {
      try {
        if (chartApi && typeof chartApi.removeSeries === "function") chartApi.removeSeries(series);
        else if (chartApi && chartApi.chart && chartApi.chart.removeSeries) chartApi.chart.removeSeries(series);
      } catch (e) {}
    });
    chartSeries = [];

    if (overlayEl) overlayEl.innerHTML = "";
    activePlan = null;
    if (chartApi && chartApi.getChartContainer) {
      const wrap = chartApi.getChartContainer();
      if (wrap) wrap.classList.remove("piramid-chart-active");
    }
    stopOverlayTimer();
  }

  function getLineTimeEndpoints() {
    const rows = getRows();
    if (rows.length >= 2) return [rows[0].time, rows[rows.length - 1].time];
    if (rows.length === 1) return [rows[0].time, rows[0].time];
    return [null, null];
  }

  function addHorizontalSeries(price, color, width, dashed) {
    const chartApi = api();
    if (!chartApi || typeof chartApi.addLineSeries !== "function") return null;

    const times = getLineTimeEndpoints();
    if (!times[0] || !times[1]) return null;

    const series = chartApi.addLineSeries({
      color: color || "#2563eb",
      lineWidth: width || 1,
      lineStyle: dashed ? getLineStyleDashed() : 0,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });

    try {
      series.setData([
        { time: times[0], value: Number(price) },
        { time: times[1], value: Number(price) }
      ]);
      chartSeries.push(series);
      return series;
    } catch (e) {
      try { chartApi.removeSeries(series); } catch (err) {}
      return null;
    }
  }

  function addPriceLine(price, color, title, width, dashed) {
    const chartApi = api();
    if (!chartApi || !chartApi.candleSeries || !chartApi.candleSeries.createPriceLine) return null;

    try {
      const line = chartApi.candleSeries.createPriceLine({
        price: Number(price),
        color: color || "#2563eb",
        lineWidth: width || 1,
        lineStyle: dashed ? getLineStyleDashed() : 0,
        axisLabelVisible: false,
        title: ""
      });
      priceLines.push(line);
      return line;
    } catch (e) {
      return null;
    }
  }

  function ensureOverlay() {
    const chartApi = api();
    const wrap = chartApi && chartApi.getChartContainer ? chartApi.getChartContainer() : document.getElementById("chartWrap");
    if (!wrap) return null;

    overlayEl = document.getElementById("piramidChartOverlay");
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "piramidChartOverlay";
      overlayEl.className = "piramid-chart-overlay";
      wrap.appendChild(overlayEl);
    }
    wrap.classList.add("piramid-chart-active");
    return overlayEl;
  }

  function buildOverlayHtml(plan) {
    const activeRows = plan.rows.filter(function (row) { return row.weight > 0 && row.planAmount > 0 && row.price > 0; });
    const labels = activeRows.map(function (row) {
      return `
        <div class="piramid-chart-label" data-piramid-price="${row.price}" style="--piramid-line-color:${row.color}">
          <b>${row.step}차매수</b><span>${formatWon(row.price)}</span>
        </div>`;
    }).join("");

    const avg = plan.summary.finalAvg || 0;
    const badge = `
      <div class="piramid-chart-summary-badge">
        <strong>${escapeHtml(plan.summary.strategyLabel)} 분할매수</strong><br>
        총투입 <b>${formatWon(plan.summary.totalActual)}</b> · 수량 <b>${formatQty(plan.summary.totalQty)}</b><br>
        최종 평단 <b>${formatWon(avg)}</b> · 평단회복 필요 <b>${formatRate(plan.summary.rebound)}</b>
      </div>`;

    const avgLabel = avg ? `
      <div class="piramid-chart-label avg" data-piramid-price="${avg}">
        <b>최종평단</b><span>${formatWon(avg)}</span>
      </div>` : "";

    return labels + avgLabel + badge;
  }

  function updateOverlayPositions() {
    if (!activePlan || !overlayEl) return;
    const chartApi = api();
    if (!chartApi || !chartApi.candleSeries || !chartApi.candleSeries.priceToCoordinate) return;

    const wrap = chartApi.getChartContainer ? chartApi.getChartContainer() : document.getElementById("chartWrap");
    const drawingLayer = document.getElementById("drawingLayer");
    const wrapHeight = wrap ? wrap.clientHeight : 0;
    const mainHeight = drawingLayer ? drawingLayer.getBoundingClientRect().height : wrapHeight;
    const maxHeight = mainHeight || wrapHeight || 0;

    overlayEl.querySelectorAll("[data-piramid-price]").forEach(function (label) {
      const price = Number(label.dataset.piramidPrice);
      let y = null;
      try { y = chartApi.candleSeries.priceToCoordinate(price); } catch (e) {}

      if (y === null || y === undefined || !Number.isFinite(Number(y))) {
        label.style.display = "none";
        return;
      }

      const numberY = Number(y);
      if (maxHeight && (numberY < -18 || numberY > maxHeight + 18)) {
        label.style.display = "none";
        return;
      }

      label.style.display = "inline-flex";
      label.style.top = Math.round(numberY) + "px";
    });
  }

  function startOverlayTimer() {
    stopOverlayTimer();
    overlayTimer = setInterval(updateOverlayPositions, 260);
  }

  function stopOverlayTimer() {
    if (overlayTimer) clearInterval(overlayTimer);
    overlayTimer = null;
  }

  function renderPlanOnChart(plan) {
    const chartApi = api();
    if (!chartApi || !chartApi.candleSeries) {
      setStatus("차트가 아직 준비되지 않았습니다. 잠시 후 다시 눌러주세요.", "warn");
      return;
    }

    const targetPlan = plan && plan.ok ? plan : calculateAndRender(false);
    if (!targetPlan.ok) {
      setStatus(targetPlan.message, "warn");
      return;
    }

    removeChartObjects();
    activePlan = targetPlan;

    targetPlan.rows.forEach(function (row) {
      if (!(row.weight > 0 && row.qty > 0)) return;
      addHorizontalSeries(row.price, row.color, 1, true);
    });

    if (targetPlan.summary.finalAvg > 0) {
      addHorizontalSeries(targetPlan.summary.finalAvg, "#ef4444", 2, false);
    }

    const overlay = ensureOverlay();
    if (overlay) {
      overlay.innerHTML = buildOverlayHtml(targetPlan);
      requestAnimationFrame(updateOverlayPositions);
      setTimeout(updateOverlayPositions, 80);
      setTimeout(updateOverlayPositions, 240);
      startOverlayTimer();
    }

    setStatus("차트에 1차~5차 매수선과 최종 평단가를 표시했습니다.", "ok");
  }

  function setCurrentPriceToStart() {
    const price = getCurrentPrice();
    if (!price) {
      setStatus("현재가를 아직 불러오지 못했습니다. 차트 데이터 로딩 후 다시 눌러주세요.", "warn");
      return;
    }
    if (startPriceInput) startPriceInput.value = String(roundPrice(price));
    const plan = calculateAndRender(true);
    if (activePlan) renderPlanOnChart(plan);
    saveFormSoon();
  }

  function resetForm() {
    if (strategyInput) strategyInput.value = "exit";
    if (unitInput) unitInput.value = "500000";
    if (dropRateInput) dropRateInput.value = "15";
    if (startPriceInput) startPriceInput.value = "";
    calculateAndRender(false);
    saveFormSoon();
    setStatus("초기화했습니다. 서버 저장값도 기본값으로 갱신합니다.", "ok");
  }

  function bindDrawerScrollGuards() {
    [drawer, panel].forEach(function (target) {
      if (!target || target.dataset.piramidScrollGuard === "1") return;
      target.dataset.piramidScrollGuard = "1";
      ["wheel", "touchmove", "pointermove"].forEach(function (eventName) {
        target.addEventListener(eventName, function (event) {
          event.stopPropagation();
        }, { passive: true });
      });
    });
  }

  function bindEvents() {
    bindDrawerScrollGuards();
    openButtons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (isPiramidDrawerOpen()) closeDrawer();
        else openDrawer();
      });
    });

    if (piramidTab) {
      piramidTab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (isPiramidDrawerOpen()) closeDrawer();
        else openDrawer();
      });
    }

    document.querySelectorAll("#openAvgDrawerBtn, #openPortfolioDrawerBtn, #avgDrawerTab, #portfolioDrawerTab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTimeout(deactivatePiramidUi, 0);
        requestDrawerSafeResize();
      });
    });


    if (drawer) {
      ["wheel", "touchmove"].forEach(function (eventName) {
        drawer.addEventListener(eventName, function (event) {
          event.stopPropagation();
        }, { passive: true });
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setTimeout(function () {
          openButtons.forEach(function (btn) { btn.classList.remove("active"); });
          if (piramidTab) piramidTab.classList.remove("active");
        }, 0);
      });
    }

    [strategyInput, unitInput, startPriceInput, dropRateInput].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", function () {
        const plan = calculateAndRender(false);
        if (activePlan) renderPlanOnChart(plan);
        saveFormSoon();
      });
      el.addEventListener("change", function () {
        const plan = calculateAndRender(false);
        if (activePlan) renderPlanOnChart(plan);
        saveFormSoon();
      });
    });

    if (useCurrentBtn) useCurrentBtn.addEventListener("click", setCurrentPriceToStart);
    if (calcBtn) calcBtn.addEventListener("click", function () { calculateAndRender(true); saveFormSoon(); });
    if (applyBtn) applyBtn.addEventListener("click", function () { renderPlanOnChart(calculateAndRender(false)); saveFormSoon(); });
    if (clearBtn) clearBtn.addEventListener("click", function () { removeChartObjects(); setStatus("차트 표시를 삭제했습니다.", "ok"); });
    if (resetBtn) resetBtn.addEventListener("click", resetForm);

    window.addEventListener("resize", function () {
      requestAnimationFrame(updateOverlayPositions);
      setTimeout(updateOverlayPositions, 120);
    });

    document.addEventListener("bitgak:chart-data-loaded", function () {
      if (startPriceInput && !positiveNumber(startPriceInput.value)) {
        const price = getCurrentPrice();
        if (price) startPriceInput.placeholder = String(roundPrice(price));
      }
      calculateAndRender(false);
      if (activePlan) renderPlanOnChart(calculateAndRender(false));
    });

    try {
      const chartApi = api();
      if (chartApi && chartApi.chart && chartApi.chart.timeScale && chartApi.chart.timeScale().subscribeVisibleLogicalRangeChange) {
        chartApi.chart.timeScale().subscribeVisibleLogicalRangeChange(updateOverlayPositions);
      }
    } catch (e) {}
  }

  restoreForm();
  bindEvents();
  calculateAndRender(false);
  fetchServerForm();
})();
