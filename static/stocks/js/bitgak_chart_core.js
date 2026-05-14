(function () {
  if (window.__BITGAK_CHART_CORE_LOADED__) return;
  window.__BITGAK_CHART_CORE_LOADED__ = true;

  const app = document.querySelector(".bv-app");
  if (!app) return;

  const code = app.dataset.code || "005930";
  const apiUrl = app.dataset.apiUrl || "/stocks/api/chart/";

  const chartEl = document.getElementById("tvChart");
  const chartWrap = document.getElementById("chartWrap");
  const drawingLayer = document.getElementById("drawingLayer");
  const loadingEl = document.getElementById("chartLoading");

  const stockNameText = document.getElementById("stockNameText");
  const chartTitle = document.getElementById("chartTitle");
  const currentPriceText = document.getElementById("currentPriceText");
  const changeText = document.getElementById("changeText");
  const ohlcInfo = document.getElementById("ohlcInfo");
  const infoName = document.getElementById("infoName");
  const infoCode = document.getElementById("infoCode");

  const intervalDropdown = document.getElementById("intervalDropdown");
  const intervalDropdownBtn = document.getElementById("intervalDropdownBtn");
  const currentIntervalText = document.getElementById("currentIntervalText");

  if (!chartEl || !chartWrap || !drawingLayer || !window.LightweightCharts) return;

  const state = {
    interval: "1d",
    range: "all",
    payload: null,
    rows: [],
    activeTool: "cursor",
    drawings: [],
    tempDrawing: null,
    isDrawing: false,
    startPoint: null,
  };

  function formatNumber(value) {
    if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "-";
    return Number(value).toLocaleString("ko-KR");
  }

  function setLoading(show) {
    if (!loadingEl) return;
    loadingEl.classList.toggle("show", !!show);
  }

  function showSoftMessage(message) {
    if (ohlcInfo) ohlcInfo.textContent = message;
  }

  function normalizeTimeForDisplay(time) {
    if (!time) return "-";

    if (typeof time === "number") {
      const dt = new Date(time * 1000);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${d} ${hh}:${mm}`;
    }

    if (typeof time === "string") return time;

    if (typeof time === "object" && time.year && time.month && time.day) {
      const y = String(time.year);
      const m = String(time.month).padStart(2, "0");
      const d = String(time.day).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    return String(time);
  }

  function normalizeTime(time) {
    if (!time) return null;
    if (typeof time === "string") return time;
    if (typeof time === "number") return time;

    if (typeof time === "object" && time.year && time.month && time.day) {
      const y = String(time.year);
      const m = String(time.month).padStart(2, "0");
      const d = String(time.day).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    return time;
  }

  function sameTime(a, b) {
    return String(normalizeTime(a)) === String(normalizeTime(b));
  }

  function findRowByTime(time) {
    const target = normalizeTime(time);
    return state.rows.find((row) => sameTime(row.time, target));
  }

  function createChartInstance() {
    return LightweightCharts.createChart(chartEl, {
      width: chartEl.clientWidth,
      height: chartEl.clientHeight,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#475569",
        fontSize: 11,
        fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      },
      grid: {
        vertLines: { color: "#e8eef6" },
        horzLines: { color: "#e8eef6" },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: "rgba(51,65,85,.35)", width: 1, style: 3 },
        horzLine: { color: "rgba(51,65,85,.35)", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
        minBarSpacing: 3,
      },
      handleScroll: true,
      handleScale: true,
      localization: {
        locale: "ko-KR",
        priceFormatter: function (price) {
          return formatNumber(Math.round(price));
        },
      },
    });
  }

  const chart = createChartInstance();

  function addCandlestickSeries(options) {
    if (chart.addCandlestickSeries) return chart.addCandlestickSeries(options);
    return chart.addSeries(LightweightCharts.CandlestickSeries, options);
  }

  function addHistogramSeries(options) {
    if (chart.addHistogramSeries) return chart.addHistogramSeries(options);
    return chart.addSeries(LightweightCharts.HistogramSeries, options);
  }

  function addLineSeries(options) {
    if (chart.addLineSeries) return chart.addLineSeries(options);
    return chart.addSeries(LightweightCharts.LineSeries, options);
  }

  const candleSeries = addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
    priceLineColor: "#ef4444",
    priceLineWidth: 1,
    priceLineStyle: 2,
    priceFormat: { type: "price", precision: 0, minMove: 1 },
  });

  const volumeSeries = addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    visible: false,
  });

  chart.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });

  function getApiUrl() {
    const url = new URL(apiUrl, window.location.origin);
    url.searchParams.set("interval", state.interval);
    url.searchParams.set("range", "all");
    return url.toString();
  }

  function normalizeRows(data) {
    if (Array.isArray(data.rows)) return data.rows;

    const ohlc = data.ohlc || [];
    const volume = data.volume || [];

    return ohlc.map(function (row, index) {
      return {
        time: row.time,
        display_time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: volume[index] ? volume[index].value : 0,
      };
    });
  }

  function updateOHLC(row) {
    if (!row || !ohlcInfo) return;

    ohlcInfo.textContent =
      `날짜 ${row.display_time || normalizeTimeForDisplay(row.time)}　` +
      `시가 ${formatNumber(row.open)}　` +
      `고가 ${formatNumber(row.high)}　` +
      `저가 ${formatNumber(row.low)}　` +
      `종가 ${formatNumber(row.close)}　` +
      `거래량 ${formatNumber(row.volume)}`;
  }

  function updateHeaderInfo(data) {
    const name = data.name || app.dataset.name || "";
    const codeText = data.code || code;

    if (stockNameText) stockNameText.textContent = `${name} · ${codeText}`;
    if (chartTitle) chartTitle.textContent = `${name} · ${codeText}`;
    if (infoName) infoName.textContent = name;
    if (infoCode) infoCode.textContent = codeText;

    const price = data.current && data.current.price ? data.current.price : 0;
    const change = data.current && data.current.change ? data.current.change : 0;
    const changeRate = data.current && data.current.change_rate ? data.current.change_rate : 0;

    if (currentPriceText) currentPriceText.textContent = `${formatNumber(price)}원`;

    if (changeText) {
      const sign = change > 0 ? "+" : "";
      changeText.textContent = `${sign}${formatNumber(change)} (${sign}${changeRate}%)`;
      changeText.classList.remove("up", "down");
      changeText.classList.add(change >= 0 ? "up" : "down");
    }

    const last = state.rows[state.rows.length - 1];
    if (last) updateOHLC(last);
  }

  async function loadChartData() {
    setLoading(true);

    try {
      const res = await fetch(getApiUrl(), {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "차트 데이터를 불러오지 못했습니다.");
      }

      state.payload = data;
      state.rows = normalizeRows(data);

      candleSeries.setData(data.ohlc || []);
      volumeSeries.setData(data.volume || []);

      updateHeaderInfo(data);
      chart.timeScale().fitContent();
      renderDrawings();

      document.dispatchEvent(new CustomEvent("bitgak:chart-data-loaded", {
        bubbles: true,
        detail: {
          rows: state.rows,
          payload: data,
          interval: state.interval,
        },
      }));

      setTimeout(hideTradingViewMark, 100);
      setTimeout(hideTradingViewMark, 500);
    } catch (err) {
      console.error(err);
      showSoftMessage(err.message || "차트 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openIntervalDropdown() {
    if (!intervalDropdown) return;
    intervalDropdown.classList.add("open");
    if (intervalDropdownBtn) intervalDropdownBtn.setAttribute("aria-expanded", "true");
  }

  function closeIntervalDropdown() {
    if (!intervalDropdown) return;
    intervalDropdown.classList.remove("open");
    if (intervalDropdownBtn) intervalDropdownBtn.setAttribute("aria-expanded", "false");
  }

  function toggleIntervalDropdown() {
    if (!intervalDropdown) return;

    if (intervalDropdown.classList.contains("open")) {
      closeIntervalDropdown();
    } else {
      openIntervalDropdown();
    }
  }

  if (intervalDropdown && intervalDropdownBtn) {
    intervalDropdownBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleIntervalDropdown();
    });

    intervalDropdown.querySelectorAll("[data-interval]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const value = btn.dataset.interval;
        const label = btn.dataset.label || btn.textContent.trim();

        if (!value) return;

        state.interval = value;

        intervalDropdown.querySelectorAll("[data-interval]").forEach(function (node) {
          node.classList.toggle("active", node === btn);
        });

        if (currentIntervalText) currentIntervalText.textContent = label;

        closeIntervalDropdown();

        state.drawings = [];
        state.tempDrawing = null;

        loadChartData();
      });
    });
  }

  function getLocalPoint(event) {
    const rect = drawingLayer.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pointToChartValue(point) {
    const time = normalizeTime(chart.timeScale().coordinateToTime(point.x));
    const price = candleSeries.coordinateToPrice(point.y);

    if (!time || price === null || price === undefined) return null;
    return { time, price: Number(price) };
  }

  function valueToPoint(value) {
    if (!value) return null;

    const x = chart.timeScale().timeToCoordinate(value.time);
    const y = candleSeries.priceToCoordinate(value.price);

    if (x === null || x === undefined || y === null || y === undefined) return null;
    return { x, y };
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);

    Object.entries(attrs || {}).forEach(function ([key, value]) {
      if (value !== null && value !== undefined) el.setAttribute(key, value);
    });

    return el;
  }

  function clearSvg() {
    while (drawingLayer.firstChild) drawingLayer.removeChild(drawingLayer.firstChild);
  }

  function drawLine(p1, p2, options) {
    options = options || {};

    drawingLayer.appendChild(
      svgEl("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke: options.stroke || "#2563eb",
        "stroke-width": options.width || 2,
        "stroke-dasharray": options.dash || "",
        "stroke-linecap": "round",
      })
    );
  }

  function drawText(text, x, y, options) {
    options = options || {};

    const label = svgEl("text", {
      x,
      y,
      fill: options.fill || "#2563eb",
      "font-size": options.size || 11,
      "font-weight": "800",
      "dominant-baseline": "middle",
    });

    label.textContent = text;
    drawingLayer.appendChild(label);
  }

  function drawTrend(drawing) {
    const p1 = valueToPoint(drawing.start);
    const p2 = valueToPoint(drawing.end);
    if (!p1 || !p2) return;
    drawLine(p1, p2, { stroke: "#2563eb", width: 2 });
  }

  function drawExtended(drawing) {
    const p1 = valueToPoint(drawing.start);
    const p2 = valueToPoint(drawing.end);
    if (!p1 || !p2) return;

    const width = drawingLayer.clientWidth || chartEl.clientWidth;

    if (Math.abs(p2.x - p1.x) < 1) {
      drawLine(
        { x: p1.x, y: 0 },
        { x: p1.x, y: drawingLayer.clientHeight },
        { stroke: "#7c3aed", width: 2 }
      );
      return;
    }

    const slope = (p2.y - p1.y) / (p2.x - p1.x);

    drawLine(
      { x: 0, y: p1.y + slope * (0 - p1.x) },
      { x: width, y: p1.y + slope * (width - p1.x) },
      { stroke: "#7c3aed", width: 2 }
    );
  }

  function drawHorizontal(drawing) {
    const p = valueToPoint(drawing.start);
    if (!p) return;

    drawLine(
      { x: 0, y: p.y },
      { x: drawingLayer.clientWidth || chartEl.clientWidth, y: p.y },
      { stroke: "#ef4444", width: 1.5, dash: "4 4" }
    );

    drawText(formatNumber(Math.round(drawing.start.price)), 8, p.y - 9, { fill: "#ef4444" });
  }

  function drawVertical(drawing) {
    const p = valueToPoint(drawing.start);
    if (!p) return;

    drawLine(
      { x: p.x, y: 0 },
      { x: p.x, y: drawingLayer.clientHeight || chartEl.clientHeight },
      { stroke: "#64748b", width: 1.5, dash: "4 4" }
    );

    drawText(normalizeTimeForDisplay(drawing.start.time), p.x + 6, 16, { fill: "#64748b" });
  }

  function drawFibo(drawing) {
    const p1 = valueToPoint(drawing.start);
    const p2 = valueToPoint(drawing.end);
    if (!p1 || !p2) return;

    const levels = [
      { label: "0", value: 0 },
      { label: "0.236", value: 0.236 },
      { label: "0.382", value: 0.382 },
      { label: "0.5", value: 0.5 },
      { label: "0.618", value: 0.618 },
      { label: "1", value: 1 },
    ];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    levels.forEach(function (level) {
      const offset = dy * level.value;

      const a = { x: p1.x, y: p1.y + offset };
      const b = { x: p1.x + dx, y: p1.y + offset + dy };

      drawLine(a, b, {
        stroke: level.value === 0 || level.value === 1 ? "#0f766e" : "#14b8a6",
        width: level.value === 0 || level.value === 1 ? 2 : 1.2,
        dash: level.value === 0 || level.value === 1 ? "" : "3 3",
      });

      drawText(level.label, b.x + 6, b.y, { fill: "#0f766e" });
    });
  }

  function renderOneDrawing(drawing) {
    if (!drawing) return;
    if (drawing.type === "trend") drawTrend(drawing);
    if (drawing.type === "extend") drawExtended(drawing);
    if (drawing.type === "hline") drawHorizontal(drawing);
    if (drawing.type === "vline") drawVertical(drawing);
    if (drawing.type === "fibo") drawFibo(drawing);
  }

  function renderDrawings() {
    clearSvg();
    state.drawings.forEach(renderOneDrawing);
    if (state.tempDrawing) renderOneDrawing(state.tempDrawing);
  }

  function startDrawing(event) {
    if (state.activeTool === "cursor") return;

    event.preventDefault();

    const point = getLocalPoint(event);
    const value = pointToChartValue(point);
    if (!value) return;

    if (state.activeTool === "hline") {
      state.drawings.push({ type: "hline", start: value });
      renderDrawings();
      return;
    }

    if (state.activeTool === "vline") {
      state.drawings.push({ type: "vline", start: value });
      renderDrawings();
      return;
    }

    state.isDrawing = true;
    state.startPoint = value;
    state.tempDrawing = { type: state.activeTool, start: value, end: value };

    try {
      drawingLayer.setPointerCapture(event.pointerId);
    } catch (e) {}

    renderDrawings();
  }

  function moveDrawing(event) {
    if (!state.isDrawing || !state.tempDrawing) return;

    event.preventDefault();

    const point = getLocalPoint(event);
    const value = pointToChartValue(point);
    if (!value) return;

    state.tempDrawing.end = value;
    renderDrawings();
  }

  function endDrawing(event) {
    if (!state.isDrawing || !state.tempDrawing) return;

    event.preventDefault();

    const point = getLocalPoint(event);
    const value = pointToChartValue(point);

    if (value) state.tempDrawing.end = value;

    const p1 = valueToPoint(state.tempDrawing.start);
    const p2 = valueToPoint(state.tempDrawing.end);

    if (p1 && p2) {
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (distance > 8) state.drawings.push({ ...state.tempDrawing });
    }

    state.isDrawing = false;
    state.startPoint = null;
    state.tempDrawing = null;

    try {
      drawingLayer.releasePointerCapture(event.pointerId);
    } catch (e) {}

    renderDrawings();
  }

  drawingLayer.addEventListener("pointerdown", startDrawing);
  drawingLayer.addEventListener("pointermove", moveDrawing);
  drawingLayer.addEventListener("pointerup", endDrawing);
  drawingLayer.addEventListener("pointercancel", endDrawing);

  document.querySelectorAll("[data-tool]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tool = btn.dataset.tool;

      if (tool === "undo") {
        state.drawings.pop();
        renderDrawings();
        return;
      }

      if (tool === "clear") {
        state.drawings = [];
        state.tempDrawing = null;
        renderDrawings();
        return;
      }

      state.activeTool = tool;

      document.querySelectorAll("[data-tool]").forEach(function (node) {
        node.classList.toggle("active", node.dataset.tool === tool);
      });

      const drawingMode = tool !== "cursor";
      chartWrap.classList.toggle("drawing-mode", drawingMode);

      chart.applyOptions({
        handleScroll: !drawingMode,
        handleScale: !drawingMode,
      });
    });
  });

  chart.subscribeCrosshairMove(function (param) {
    if (!param || !param.time || !state.payload) return;

    const row = findRowByTime(param.time);
    if (row) {
      updateOHLC(row);
      return;
    }

    const candleData = param.seriesData.get(candleSeries);
    const volumeData = param.seriesData.get(volumeSeries);

    if (!candleData || !ohlcInfo) return;

    const time = normalizeTime(param.time);
    const volume = volumeData && volumeData.value ? volumeData.value : 0;

    ohlcInfo.textContent =
      `날짜 ${normalizeTimeForDisplay(time)}　` +
      `시가 ${formatNumber(candleData.open)}　` +
      `고가 ${formatNumber(candleData.high)}　` +
      `저가 ${formatNumber(candleData.low)}　` +
      `종가 ${formatNumber(candleData.close)}　` +
      `거래량 ${formatNumber(volume)}`;
  });

  chart.timeScale().subscribeVisibleTimeRangeChange(renderDrawings);

  function resizeChart() {
    chart.applyOptions({
      width: chartEl.clientWidth,
      height: chartEl.clientHeight,
    });

    drawingLayer.setAttribute("width", chartEl.clientWidth);
    drawingLayer.setAttribute("height", chartEl.clientHeight);

    renderDrawings();
    hideTradingViewMark();
  }

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(resizeChart);
    resizeObserver.observe(chartEl);
  } else {
    window.addEventListener("resize", resizeChart);
  }

  function hideTradingViewMark() {
    const targets = chartEl.querySelectorAll("a");

    targets.forEach(function (el) {
      const href = el.getAttribute("href") || "";
      const text = (el.textContent || "").toLowerCase();

      if (href.includes("tradingview") || text.includes("tradingview")) {
        el.style.display = "none";
        el.style.opacity = "0";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
      }
    });
  }

  const copyCodeBtn = document.getElementById("copyCodeBtn");

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(code);
        copyCodeBtn.textContent = "복사됨";
        setTimeout(function () {
          copyCodeBtn.textContent = "코드 복사";
        }, 1200);
      } catch (e) {
        copyCodeBtn.textContent = code;
        setTimeout(function () {
          copyCodeBtn.textContent = "코드 복사";
        }, 1200);
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (intervalDropdown && !intervalDropdown.contains(event.target)) {
      closeIntervalDropdown();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      state.isDrawing = false;
      state.startPoint = null;
      state.tempDrawing = null;
      renderDrawings();
      closeIntervalDropdown();
    }
  });

  window.BitgakChart = {
    app,
    code,
    chart,
    candleSeries,
    volumeSeries,
    state,
    formatNumber,
    normalizeTime,
    normalizeTimeForDisplay,
    getRows: function () {
      return state.rows;
    },
    addLineSeries,
    addHistogramSeries,
    removeSeries: function (series) {
      try {
        chart.removeSeries(series);
      } catch (e) {}
    },
    setVolumeVisible: function (visible) {
      volumeSeries.applyOptions({ visible: !!visible });
    },
    loadChartData,
  };

  resizeChart();
  loadChartData();
})();