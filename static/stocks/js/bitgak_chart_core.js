(function () {
  if (window.__BITGAK_CHART_CORE_LOADED__) return;
  window.__BITGAK_CHART_CORE_LOADED__ = true;

  const LW = window.LightweightCharts;
  const app = document.querySelector(".bv-app");
  if (!app || !LW) return;

  const code = app.dataset.code || "005930";
  const apiUrl = app.dataset.apiUrl || "/stocks/api/chart/";
  const drawingApiUrl = app.dataset.drawingApiUrl || ("/stocks/api/drawings/" + encodeURIComponent(code) + "/");
  const drawingToolSettingsApiUrl = app.dataset.drawingSettingsApiUrl || "/stocks/api/drawing-tool-settings/";

  const chartEl = document.getElementById("tvChart");
  const chartWrap = document.getElementById("chartWrap");
  const drawingLayer = document.getElementById("drawingLayer");
  const loadingEl = document.getElementById("chartLoading");
  let overlayEl = document.getElementById("chartIndicatorOverlay");

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
  const copyCodeBtn = document.getElementById("copyCodeBtn");

  if (!chartEl || !chartWrap || !drawingLayer) return;

  function normalHandleScrollOptions() {
    return {
      // 마우스휠은 아래 customRightAnchoredWheelZoom에서 직접 처리한다.
      // 기본값을 켜두면 커서 위치 기준 확대/축소가 같이 동작해서
      // TradingView처럼 오른쪽 끝 고정 확대가 되지 않는다.
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    };
  }

  function normalHandleScaleOptions() {
    return {
      // 마우스휠 확대/축소는 오른쪽 고정 방식으로 커스텀 처리한다.
      mouseWheel: false,
      pinch: true,
      axisPressedMouseMove: {
        time: false,
        price: false,
      },
      axisDoubleClickReset: {
        time: true,
        price: true,
      },
    };
  }

  function normalChartInteractionOptions() {
    return {
      handleScroll: normalHandleScrollOptions(),
      handleScale: normalHandleScaleOptions(),
    };
  }

  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.id = "chartIndicatorOverlay";
    overlayEl.className = "chart-indicator-overlay";
    chartWrap.appendChild(overlayEl);
  }

  const KST_OFFSET_SECONDS = 9 * 60 * 60;

  const INTERVAL_META = {
    "1m": { label: "1분", range: "5d", timeVisible: true, seconds: 60, timeframe: "intraday", barSpacing: 8 },
    "2m": { label: "2분", range: "5d", timeVisible: true, seconds: 120, timeframe: "intraday", barSpacing: 8 },
    "3m": { label: "3분", range: "5d", timeVisible: true, seconds: 180, timeframe: "intraday", barSpacing: 8 },
    "5m": { label: "5분", range: "30d", timeVisible: true, seconds: 300, timeframe: "intraday", barSpacing: 8 },
    "10m": { label: "10분", range: "60d", timeVisible: true, seconds: 600, timeframe: "intraday", barSpacing: 8 },
    "15m": { label: "15분", range: "60d", timeVisible: true, seconds: 900, timeframe: "intraday", barSpacing: 8 },
    "30m": { label: "30분", range: "90d", timeVisible: true, seconds: 1800, timeframe: "intraday", barSpacing: 8 },
    "45m": { label: "45분", range: "90d", timeVisible: true, seconds: 2700, timeframe: "intraday", barSpacing: 8 },
    "60m": { label: "1시간", range: "120d", timeVisible: true, seconds: 3600, timeframe: "intraday", barSpacing: 8 },
    "1h": { label: "1시간", range: "120d", timeVisible: true, seconds: 3600, timeframe: "intraday", barSpacing: 8 },
    "2h": { label: "2시간", range: "120d", timeVisible: true, seconds: 7200, timeframe: "intraday", barSpacing: 8 },
    "3h": { label: "3시간", range: "120d", timeVisible: true, seconds: 10800, timeframe: "intraday", barSpacing: 8 },
    "4h": { label: "4시간", range: "120d", timeVisible: true, seconds: 14400, timeframe: "intraday", barSpacing: 8 },

    "1d": { label: "일", range: "all", timeVisible: false, seconds: 86400, timeframe: "daily", barSpacing: 8 },
    "1w": { label: "주", range: "all", timeVisible: false, seconds: 604800, timeframe: "daily", barSpacing: 8 },
    "1mo": { label: "월", range: "all", timeVisible: false, seconds: 2592000, timeframe: "daily", barSpacing: 8 },
    "3mo": { label: "3달", range: "all", timeVisible: false, seconds: 7776000, timeframe: "daily", barSpacing: 8 },
    "6mo": { label: "6달", range: "all", timeVisible: false, seconds: 15552000, timeframe: "daily", barSpacing: 8 },
    "12mo": { label: "12달", range: "all", timeVisible: false, seconds: 31536000, timeframe: "daily", barSpacing: 8 },
  };

  const INTERVAL_ALIASES = {
    "1": "1m", "2": "2m", "3": "3m", "5": "5m", "10": "10m", "15": "15m", "30": "30m", "45": "45m", "60": "1h", "60m": "1h",
    "1H": "1h", "2H": "2h", "3H": "3h", "4H": "4h", "1시간": "1h", "2시간": "2h", "3시간": "3h", "4시간": "4h",
    "D": "1d", "1D": "1d", "day": "1d", "일": "1d",
    "W": "1w", "1W": "1w", "week": "1w", "주": "1w",
    "M": "1mo", "1M": "1mo", "month": "1mo", "월": "1mo",
    "3M": "3mo", "6M": "6mo", "12M": "12mo", "3개월": "3mo", "6개월": "6mo", "12개월": "12mo",
    "3달": "3mo", "6달": "6mo", "12달": "12mo",
  };

  const PANE_LABELS = {
    rsi: "RSI",
    macd: "MACD+RSI",
    stoch: "Stoch",
    volume: "거래량",
  };

  const state = {
    interval: "1d",
    range: "all",
    payload: null,
    baseRows: [],
    rows: [],
    activeTool: "cursor",
    continuousDrawing: false,
    drawings: [],
    tempDrawing: null,
    isDrawing: false,
    startPoint: null,
    requestToken: 0,
    activePaneTypes: [],
    mainPaneHeight: 0,
    insightSnapshotMode: false,
    insightSnapshot: null,
    insightEditorMode: false,
  };

  const insightUrlParams = new URLSearchParams(window.location.search || "");
  state.insightEditorMode = app.dataset.insightEditor === "1" || insightUrlParams.get("insight_editor") === "1" || insightUrlParams.get("insight_mode") === "editor";

  const chartTimeToRow = new Map();
  const paneLabelEls = new Map();
  const mainLabelEls = new Map();
  let paneIndexByType = new Map();

  function isMinuteInterval(interval) {
    const key = normalizeIntervalValue(interval).toLowerCase();
    return /^\d+m$/.test(key) && key !== "60m";
  }

  function isHourInterval(interval) {
    const key = normalizeIntervalValue(interval).toLowerCase();
    return key === "60m" || /^\d+h$/.test(key);
  }

  function getHourBucketSize(interval) {
    const key = normalizeIntervalValue(interval).toLowerCase();
    if (key === "60m" || key === "1h") return 1;
    const match = key.match(/^(\d+)h$/);
    return match ? Math.max(1, Number(match[1])) : 1;
  }

  function isHourlyAggregateInterval(interval) {
    return isHourInterval(interval) && getHourBucketSize(interval) > 1;
  }

  function getServerInterval(interval) {
    const key = normalizeIntervalValue(interval);

    // 시간봉은 백엔드에서 Yahoo/yfinance 1h 원본을 받아 1h/2h/3h/4h로 재집계한다.
    // 분봉 버튼은 현재 노출하지 않지만, 혹시 들어오면 1h로 안전하게 처리한다.
    if (isMinuteInterval(key)) return "1h";
    if (isHourInterval(key)) return key;
    return key;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "-";
    return Number(value).toLocaleString("ko-KR");
  }

  function normalizeIntervalValue(value) {
    const raw = String(value || "1d").trim();
    return INTERVAL_ALIASES[raw] || INTERVAL_ALIASES[raw.toUpperCase()] || raw;
  }

  function getIntervalMeta(interval) {
    return INTERVAL_META[normalizeIntervalValue(interval)] || INTERVAL_META["1d"];
  }

  function isIntradayInterval(interval) {
    const key = normalizeIntervalValue(interval).toLowerCase();
    return key.endsWith("m") || key.endsWith("h") || key === "60m";
  }

  function setLoading(show) {
    if (loadingEl) loadingEl.classList.toggle("show", !!show);
  }

  function showSoftMessage(message) {
    if (ohlcInfo) ohlcInfo.textContent = message;
  }

  function kstPartsFromTimestamp(seconds) {
    const date = new Date((Number(seconds) + KST_OFFSET_SECONDS) * 1000);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }

  function toKstTimestamp(year, month, day, hour, minute, second) {
    return Math.floor(Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0) / 1000) - KST_OFFSET_SECONDS;
  }

  function parseKoreanDateTimeToTimestamp(value) {
    if (typeof value !== "string") return value;
    const text = value.trim();

    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
      const normalized = text.replace(" ", "T");
      const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(normalized);
      const date = new Date(hasTz ? normalized : normalized + "+09:00");
      if (!Number.isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    return value;
  }

  function normalizeTimeForChart(time) {
    if (time === null || time === undefined || time === "") return null;
    if (typeof time === "number") return time;
    if (typeof time === "string") return parseKoreanDateTimeToTimestamp(time);
    if (typeof time === "object" && time.year && time.month && time.day) return time;
    return time;
  }

  function normalizeTimeForDisplay(time) {
    if (!time) return "-";

    const row = chartTimeToRow.get(String(time));
    if (row && row.display_time) return row.display_time;

    if (typeof time === "number") {
      const parts = kstPartsFromTimestamp(time);
      return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    }

    if (typeof time === "string") return time;

    if (typeof time === "object" && time.year && time.month && time.day) {
      return `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
    }

    return String(time);
  }

  function formatTickMark(time) {
    const row = chartTimeToRow.get(String(time));
    const label = row && row.display_time ? row.display_time : normalizeTimeForDisplay(time);

    if (isIntradayInterval(state.interval)) {
      const m = String(label).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
      if (!m) return label;
      return `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}`;
    }

    const d = String(label).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!d) return label;
    return `${d[1]}-${d[2]}-${d[3]}`;
  }

  function createChartInstance() {
    return LW.createChart(chartEl, {
      width: Math.max(1, chartEl.clientWidth || chartWrap.clientWidth || 900),
      height: Math.max(1, chartEl.clientHeight || chartWrap.clientHeight || 520),
      autoSize: false,
      layout: {
        background: { type: "solid", color: "#ffffff" },
        textColor: "#475569",
        fontSize: 11,
        fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        panes: {
          separatorColor: "#dbe5f1",
          separatorHoverColor: "#94a3b8",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: "#e8eef6" },
        horzLines: { color: "#e8eef6" },
      },
      crosshair: {
        mode: LW.CrosshairMode ? LW.CrosshairMode.Normal : 0,
        vertLine: { color: "rgba(51,65,85,.36)", width: 1, style: 3, labelBackgroundColor: "#111827" },
        horzLine: { color: "rgba(51,65,85,.36)", width: 1, style: 3, labelBackgroundColor: "#111827" },
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
        autoScale: true,
        mode: LW.PriceScaleMode ? LW.PriceScaleMode.Normal : 0,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: function (time) {
          return formatTickMark(time);
        },
      },
      handleScroll: normalHandleScrollOptions(),
      handleScale: normalHandleScaleOptions(),
      localization: {
        locale: "ko-KR",
        priceFormatter: function (price) {
          return formatNumber(Math.round(price));
        },
        timeFormatter: function (time) {
          return normalizeTimeForDisplay(time);
        },
      },
    });
  }

  const chart = createChartInstance();

  function addSeries(seriesName, options, paneIndex) {
    const index = Number.isFinite(Number(paneIndex)) ? Number(paneIndex) : 0;
    const ctor = LW[seriesName];

    if (chart.addSeries && ctor) {
      return chart.addSeries(ctor, options || {}, index);
    }

    if (seriesName === "CandlestickSeries" && chart.addCandlestickSeries) return chart.addCandlestickSeries(options || {});
    if (seriesName === "HistogramSeries" && chart.addHistogramSeries) return chart.addHistogramSeries(options || {});
    if (seriesName === "LineSeries" && chart.addLineSeries) return chart.addLineSeries(options || {});

    throw new Error("Lightweight Charts v5 series API를 찾지 못했습니다.");
  }

  const candleSeries = addSeries("CandlestickSeries", {
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
  }, 0);

  function addLineSeries(options) {
    return addSeries("LineSeries", Object.assign({
      priceLineVisible: false,
      lastValueVisible: false,
      lineWidth: 2,
    }, options || {}), 0);
  }

  function addHistogramSeries(options) {
    return addSeries("HistogramSeries", Object.assign({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, options || {}), 0);
  }

  function getPaneBaseType(type) {
    const key = String(type || "").toLowerCase();
    const base = key.split(":")[0];
    return PANE_LABELS[base] ? base : "";
  }

  function normalizePaneType(type) {
    const key = String(type || "").toLowerCase();
    return getPaneBaseType(key) ? key : "";
  }

  function paneBaseType(type) {
    return getPaneBaseType(type) || normalizePaneType(type);
  }

  function paneClassKey(type) {
    return String(type || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }

  function paneDefaultLabel(type) {
    const base = paneBaseType(type);
    return PANE_LABELS[base] || String(type || "").toUpperCase();
  }

  function uniquePaneTypes(types) {
    const result = [];
    (types || []).forEach(function (type) {
      const fixed = normalizePaneType(type);
      if (fixed && !result.includes(fixed)) result.push(fixed);
    });
    return result;
  }

  function rebuildPaneIndexMap(types) {
    paneIndexByType = new Map();
    uniquePaneTypes(types).forEach(function (type, index) {
      paneIndexByType.set(type, index + 1);
    });
  }

  function getPaneIndex(type) {
    const fixed = normalizePaneType(type);
    if (!fixed) return 0;
    if (!paneIndexByType.has(fixed)) {
      const nextIndex = paneIndexByType.size + 1;
      paneIndexByType.set(fixed, nextIndex);
      if (!state.activePaneTypes.includes(fixed)) state.activePaneTypes.push(fixed);
    }
    return paneIndexByType.get(fixed);
  }

  function ensurePaneLabel(type, label) {
    const fixed = normalizePaneType(type);
    if (!fixed || !overlayEl) return null;

    const base = paneBaseType(fixed);
    if (paneLabelEls.has(fixed)) {
      const el = paneLabelEls.get(fixed);
      el.textContent = label || paneDefaultLabel(fixed);
      return el;
    }

    const el = document.createElement("div");
    el.className = "bv-v5-pane-label bv-v5-pane-label-" + base + " bv-v5-pane-label-key-" + paneClassKey(fixed);
    el.dataset.paneType = fixed;
    el.dataset.paneBaseType = base;
    el.textContent = label || paneDefaultLabel(fixed);
    overlayEl.appendChild(el);
    paneLabelEls.set(fixed, el);
    return el;
  }


  function setPaneLabel(type, text, color) {
    const fixed = normalizePaneType(type);
    if (!fixed) return;

    const labelText = text || paneDefaultLabel(fixed);
    const el = ensurePaneLabel(fixed, labelText);
    if (!el) return;

    el.dataset.paneLabelText = labelText;
    el.textContent = labelText;

    if (color) {
      el.dataset.paneLabelColor = color;
      el.style.setProperty("--label-color", color);
    }
  }

  function setMainIndicatorLabels(labels) {
    if (!overlayEl) return;

    const normalized = Array.isArray(labels) ? labels.filter(Boolean) : [];
    const activeKeys = new Set();

    normalized.forEach(function (item, index) {
      const key = String(item.key || item.type || item.label || index);
      activeKeys.add(key);

      let el = mainLabelEls.get(key);
      if (!el) {
        el = document.createElement("div");
        el.className = "bv-v5-main-label";
        overlayEl.appendChild(el);
        mainLabelEls.set(key, el);
      }

      el.textContent = item.label || item.name || key;
      el.style.display = "inline-flex";
      el.style.top = 10 + index * 26 + "px";
      el.style.setProperty("--label-color", item.color || "#2563eb");
    });

    mainLabelEls.forEach(function (el, key) {
      if (!activeKeys.has(key)) el.style.display = "none";
    });
  }

  function updatePaneLabels() {
    if (!overlayEl) return;

    const chartHeight = Math.max(360, chartEl.clientHeight || chartWrap.clientHeight || 520);
    const activeTypes = uniquePaneTypes(state.activePaneTypes);

    paneLabelEls.forEach(function (el) {
      el.style.setProperty("display", "none", "important");
    });

    if (!activeTypes.length) return;

    const preferredHeights = activeTypes.map(function (type) {
      const base = paneBaseType(type);
      if (base === "volume") return 118;
      if (base === "rsi") return 158;
      if (base === "macd") return 172;
      if (base === "stoch") return 158;
      return 150;
    });

    const rawSubHeight = preferredHeights.reduce(function (sum, value) { return sum + value; }, 0);
    const maxSubHeight = Math.min(620, Math.max(0, chartHeight - 240));
    const ratio = rawSubHeight > maxSubHeight && rawSubHeight > 0 ? maxSubHeight / rawSubHeight : 1;
    const paneHeights = preferredHeights.map(function (value) {
      return Math.max(96, Math.floor(value * ratio));
    });

    const subHeight = paneHeights.reduce(function (sum, value) { return sum + value; }, 0);
    const mainHeight = Math.max(230, chartHeight - subHeight);

    let top = mainHeight;
    activeTypes.forEach(function (type, index) {
      const el = paneLabelEls.get(type);
      if (!el) return;

      el.textContent = el.dataset.paneLabelText || paneDefaultLabel(type);
      if (el.dataset.paneLabelColor) el.style.setProperty("--label-color", el.dataset.paneLabelColor);
      el.style.setProperty("display", "inline-flex", "important");
      el.style.top = (top + 8) + "px";
      top += paneHeights[index] || 120;
    });
  }

  function layoutPanes() {
    if (!chart.panes) return;

    const panes = chart.panes();
    const totalHeight = Math.max(360, chartEl.clientHeight || chartWrap.clientHeight || 520);
    const activeTypes = uniquePaneTypes(state.activePaneTypes);
    const paneCount = Math.max(0, activeTypes.length);

    if (chartWrap) {
      chartWrap.classList.toggle("bitgak-has-subpanes", activeTypes.length > 0);
      chartWrap.classList.toggle("bitgak-no-subpanes", activeTypes.length === 0);
      chartWrap.dataset.activePaneCount = String(activeTypes.length);
    }

    const preferredHeights = activeTypes.map(function (type) {
      const base = paneBaseType(type);
      if (base === "volume") return 118;
      if (base === "rsi") return 158;
      if (base === "macd") return 172;
      if (base === "stoch") return 158;
      return 150;
    });

    const rawSubHeight = preferredHeights.reduce(function (sum, value) { return sum + value; }, 0);
    const maxSubHeight = Math.min(620, Math.max(0, totalHeight - 240));
    const ratio = rawSubHeight > maxSubHeight && rawSubHeight > 0 ? maxSubHeight / rawSubHeight : 1;
    const paneHeights = preferredHeights.map(function (value) {
      return Math.max(96, Math.floor(value * ratio));
    });

    const subHeight = paneHeights.reduce(function (sum, value) { return sum + value; }, 0);
    const mainHeight = Math.max(230, totalHeight - subHeight);
    state.mainPaneHeight = mainHeight;
    syncDrawingLayerBounds();

    try {
      if (panes[0] && panes[0].setHeight) panes[0].setHeight(mainHeight);

      for (let i = 1; i < panes.length; i++) {
        if (!panes[i] || !panes[i].setHeight) continue;
        panes[i].setHeight(i <= paneCount ? paneHeights[i - 1] : 1);
      }
    } catch (e) {}

    syncDrawingLayerBounds();
    updatePaneLabels();
  }

  function configureIndicatorPanes(types) {
    state.activePaneTypes = uniquePaneTypes(types);
    rebuildPaneIndexMap(state.activePaneTypes);

    if (chartWrap) {
      chartWrap.classList.toggle("bitgak-has-subpanes", state.activePaneTypes.length > 0);
      chartWrap.classList.toggle("bitgak-no-subpanes", state.activePaneTypes.length === 0);
      chartWrap.dataset.activePaneCount = String(state.activePaneTypes.length);
    }

    state.activePaneTypes.forEach(function (type) {
      ensurePaneLabel(type, paneDefaultLabel(type));
    });

    const refresh = function () {
      layoutPanes();
      syncDrawingLayerBounds();
      renderDrawings();
      fitOrKeepVisibleRange(false);
    };

    setTimeout(refresh, 0);
    requestAnimationFrame(refresh);
    setTimeout(refresh, 120);
  }

  function ensureIndicatorPane(type, label) {
    const fixed = normalizePaneType(type);
    if (!fixed) return null;
    getPaneIndex(fixed);
    return ensurePaneLabel(fixed, label || PANE_LABELS[fixed]);
  }

  function getPaneScaleMargins(type) {
    const fixed = paneBaseType(type);
    if (fixed === "volume") return { top: 0.18, bottom: 0.02 };
    if (fixed === "macd") return { top: 0.24, bottom: 0.08 };
    if (fixed === "rsi") return { top: 0.22, bottom: 0.08 };
    if (fixed === "stoch") return { top: 0.22, bottom: 0.08 };
    return { top: 0.18, bottom: 0.08 };
  }

  function applyPaneScaleMargins(series, type) {
    if (!series || !series.priceScale) return series;

    try {
      series.priceScale().applyOptions({
        scaleMargins: getPaneScaleMargins(type),
      });
    } catch (e) {}

    return series;
  }

  function addPaneLineSeries(type, options) {
    const fixed = normalizePaneType(type);
    if (!fixed) return addLineSeries(options || {});
    ensureIndicatorPane(fixed, paneDefaultLabel(fixed));

    const series = addSeries("LineSeries", Object.assign({
      color: "#2563eb",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    }, options || {}), getPaneIndex(fixed));

    return applyPaneScaleMargins(series, fixed);
  }

  function addPaneHistogramSeries(type, options) {
    const fixed = normalizePaneType(type);
    if (!fixed) return addHistogramSeries(options || {});
    ensureIndicatorPane(fixed, paneDefaultLabel(fixed));

    const series = addSeries("HistogramSeries", Object.assign({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, options || {}), getPaneIndex(fixed));

    return applyPaneScaleMargins(series, fixed);
  }

  function syncPaneTimeScales() {
    layoutPanes();
  }

  function applyIntervalChartOptions() {
    const meta = getIntervalMeta(state.interval);
    state.range = meta.range || "all";

    chart.applyOptions({
      timeScale: {
        timeVisible: !!meta.timeVisible,
        secondsVisible: false,
        barSpacing: meta.barSpacing || 8,
        tickMarkFormatter: function (time) {
          return formatTickMark(time);
        },
      },
      localization: {
        locale: "ko-KR",
        priceFormatter: function (price) {
          return formatNumber(Math.round(price));
        },
        timeFormatter: function (time) {
          return normalizeTimeForDisplay(time);
        },
      },
    });
  }

  function getRequestCandidate() {
    const meta = getIntervalMeta(state.interval);
    const serverInterval = getServerInterval(state.interval);

    return {
      interval: serverInterval,
      range: meta.range || "all",
      resolution: serverInterval,
      timeframe: meta.timeframe || (isIntradayInterval(state.interval) ? "intraday" : "daily"),
      displayInterval: state.interval,
    };
  }

  function getBitgakBaseUrl() {
    if (window.location.origin && window.location.origin !== "null") return window.location.origin;

    if (app && app.dataset && app.dataset.parentOrigin) return app.dataset.parentOrigin;

    try {
      if (document.referrer) return new URL(document.referrer).origin;
    } catch (e) {}

    try {
      if (window.parent && window.parent.location && window.parent.location.origin) return window.parent.location.origin;
    } catch (e) {}

    return window.location.protocol && window.location.host ? (window.location.protocol + "//" + window.location.host) : "http://127.0.0.1:8000";
  }

  function resolveBitgakUrl(url) {
    try { return new URL(String(url || ""), getBitgakBaseUrl()).toString(); }
    catch (e) { return String(url || ""); }
  }

  function buildApiUrl() {
    const candidate = getRequestCandidate();
    const url = new URL(apiUrl, getBitgakBaseUrl());

    url.searchParams.set("interval", candidate.interval);
    url.searchParams.set("range", candidate.range);
    url.searchParams.set("resolution", candidate.resolution);
    url.searchParams.set("timeframe", candidate.timeframe);
    url.searchParams.set("display_interval", candidate.displayInterval || state.interval);

    return url.toString();
  }

  function normalizeRows(data) {
    const rawRows = Array.isArray(data.rows)
      ? data.rows
      : (data.ohlc || []).map(function (row, index) {
          const volume = data.volume && data.volume[index] ? data.volume[index].value : 0;
          return Object.assign({}, row, { volume });
        });

    const rows = rawRows.map(function (row) {
      const rawTime = row.display_time || row.datetime || row.date || row.time;
      const sourceTime = normalizeTimeForChart(row.datetime || row.date || row.display_time || row.time);
      const chartTimeCandidate = normalizeTimeForChart(row.time || row.datetime || row.date || row.display_time);

      return {
        source_time: sourceTime,
        time: chartTimeCandidate,
        display_time: rawTime,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || row.value || 0),
      };
    }).filter(function (row) {
      return row.source_time !== null &&
        row.source_time !== undefined &&
        !Number.isNaN(row.open) &&
        !Number.isNaN(row.high) &&
        !Number.isNaN(row.low) &&
        !Number.isNaN(row.close);
    }).sort(function (a, b) {
      if (typeof a.source_time === "number" && typeof b.source_time === "number") return a.source_time - b.source_time;
      return String(a.source_time).localeCompare(String(b.source_time));
    });

    const result = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const key = String(row.source_time);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(row);
    });

    return result;
  }


  function formatKstDateTimeFromTimestamp(seconds) {
    const parts = kstPartsFromTimestamp(seconds);
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }

  function getHourBucketTimestamp(sourceTime, bucketHours) {
    const normalized = normalizeTimeForChart(sourceTime);
    if (typeof normalized !== "number") return normalized;

    const parts = kstPartsFromTimestamp(normalized);
    const marketOpenMinutes = 9 * 60;
    const currentMinutes = parts.hour * 60 + parts.minute;
    const bucketSize = Math.max(1, Number(bucketHours || 1)) * 60;
    const offset = Math.max(0, currentMinutes - marketOpenMinutes);
    const bucketMinutes = marketOpenMinutes + Math.floor(offset / bucketSize) * bucketSize;
    const bucketHour = Math.floor(bucketMinutes / 60);
    const bucketMinute = bucketMinutes % 60;

    return toKstTimestamp(parts.year, parts.month, parts.day, bucketHour, bucketMinute, 0);
  }

  function aggregateHourlyRows(rows, interval) {
    const bucketHours = getHourBucketSize(interval);
    if (!isHourlyAggregateInterval(interval) || bucketHours <= 1) return rows;

    const grouped = new Map();

    rows.forEach(function (row) {
      const bucketTime = getHourBucketTimestamp(row.source_time, bucketHours);
      const key = String(bucketTime);

      if (!grouped.has(key)) {
        grouped.set(key, Object.assign({}, row, {
          source_time: bucketTime,
          time: bucketTime,
          display_time: typeof bucketTime === "number" ? formatKstDateTimeFromTimestamp(bucketTime) : String(bucketTime),
          volume: Number(row.volume || 0),
        }));
        return;
      }

      const target = grouped.get(key);
      target.high = Math.max(Number(target.high), Number(row.high));
      target.low = Math.min(Number(target.low), Number(row.low));
      target.close = Number(row.close);
      target.volume = Number(target.volume || 0) + Number(row.volume || 0);
      target.display_time = typeof bucketTime === "number" ? formatKstDateTimeFromTimestamp(bucketTime) : target.display_time;
    });

    return Array.from(grouped.values()).sort(function (a, b) {
      if (typeof a.source_time === "number" && typeof b.source_time === "number") return a.source_time - b.source_time;
      return String(a.source_time).localeCompare(String(b.source_time));
    });
  }

  function applyGaplessTimes(rows, interval, payload) {
    chartTimeToRow.clear();

    const intraday = isIntradayInterval(interval) && (payload && payload.intraday !== false);
    const meta = getIntervalMeta(interval);

    if (!intraday) {
      return rows.map(function (row) {
        let chartTime = row.source_time;

        if (typeof chartTime === "number") {
          const parts = kstPartsFromTimestamp(chartTime);
          chartTime = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        }

        const item = Object.assign({}, row, {
          time: chartTime,
          display_time: row.display_time || normalizeTimeForDisplay(chartTime),
        });

        chartTimeToRow.set(String(item.time), item);
        return item;
      });
    }

    const step = Math.max(60, Number(meta.seconds || 60));
    const base = toKstTimestamp(2000, 1, 3, 9, 0, 0);

    return rows.map(function (row, index) {
      const chartTime = base + index * step;
      const item = Object.assign({}, row, {
        time: chartTime,
        display_time: row.display_time || normalizeTimeForDisplay(row.source_time),
      });

      chartTimeToRow.set(String(chartTime), item);
      return item;
    });
  }

  function rowsToOhlcData(rows) {
    return rows.map(function (row) {
      return {
        time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
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

  function fitOrKeepVisibleRange(forceFit) {
    if (!state.rows.length) return;

    const timeScale = chart.timeScale();

    if (forceFit || state.rows.length <= 180) {
      timeScale.fitContent();
      timeScale.applyOptions({ rightOffset: 8, barSpacing: getIntervalMeta(state.interval).barSpacing || 8 });
      return;
    }

    const from = Math.max(0, state.rows.length - 180);
    const to = state.rows.length + 8;

    try {
      timeScale.setVisibleLogicalRange({ from, to });
    } catch (e) {
      timeScale.fitContent();
    }

    timeScale.applyOptions({ rightOffset: 8, barSpacing: getIntervalMeta(state.interval).barSpacing || 8 });
  }

  async function loadChartData() {
    const token = ++state.requestToken;
    setLoading(true);

    try {
      const res = await fetch(buildApiUrl(), {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        cache: "no-store",
      });

      const data = await res.json();

      if (token !== state.requestToken) return;

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "차트 데이터를 불러오지 못했습니다.");
      }

      const normalizedRows = normalizeRows(data);
      const serverAggregated = !!data.server_aggregated || String(data.source || "").indexOf("yfinance") >= 0;
      const baseRows = serverAggregated ? normalizedRows : aggregateHourlyRows(normalizedRows, state.interval);

      if (!baseRows.length) {
        throw new Error("표시할 차트 데이터가 없습니다.");
      }

      state.payload = data;
      state.baseRows = baseRows;
      state.rows = applyGaplessTimes(baseRows, state.interval, data);

      applyIntervalChartOptions();
      resetManualMainPriceRange(false);
      candleSeries.setData(rowsToOhlcData(state.rows));
      updateHeaderInfo(data);

      layoutPanes();
      fitOrKeepVisibleRange(true);

      if (state.insightSnapshotMode && state.insightSnapshot) {
        applyInsightSnapshotPayload(state.insightSnapshot, false);
      } else if (state.insightEditorMode) {
        // 빗각관점 글쓰기 iframe에서는 계정/브라우저에 저장된 드로잉을 섞지 않는다.
        // 이 페이지에서 그린 드로잉은 부모 글쓰기 화면이 스냅샷으로만 저장한다.
        state.drawings = [];
        state.tempDrawing = null;
        renderDrawings();
      } else {
        await loadDrawingsFromStorage();
        renderDrawings();
      }

      document.dispatchEvent(new CustomEvent("bitgak:chart-data-loaded", {
        bubbles: true,
        detail: {
          rows: state.rows,
          baseRows: state.baseRows,
          payload: data,
          interval: state.interval,
        },
      }));

      if (state.insightEditorMode) notifyInsightChartDirty("data-loaded");

      setTimeout(function () {
        layoutPanes();
        hideTradingViewMark();
      }, 100);
    } catch (err) {
      console.error(err);
      showSoftMessage(err.message || "차트 데이터를 불러오지 못했습니다.");
    } finally {
      if (token === state.requestToken) setLoading(false);
    }
  }


  function setupTradingIntervalMenu() {
    if (!intervalDropdown) return;

    const allowed = new Set(["1h", "2h", "3h", "4h", "1d", "1w", "1mo"]);
    let activeIsHidden = false;
    let firstDailyButton = null;

    intervalDropdown.querySelectorAll("[data-interval]").forEach(function (btn) {
      const fixed = normalizeIntervalValue(btn.dataset.interval);

      if (!allowed.has(fixed)) {
        if (btn.classList.contains("active")) activeIsHidden = true;
        btn.classList.remove("active");
        btn.hidden = true;
        btn.classList.add("bv-interval-hidden-unsupported");
        btn.setAttribute("aria-hidden", "true");
        return;
      }

      btn.hidden = false;
      btn.classList.remove("bv-interval-hidden-minute", "bv-interval-hidden-duplicate", "bv-interval-hidden-unsupported");
      btn.removeAttribute("aria-hidden");

      if (!firstDailyButton) firstDailyButton = btn;
    });

    if ((activeIsHidden || !intervalDropdown.querySelector("[data-interval].active")) && firstDailyButton) {
      firstDailyButton.classList.add("active");
      state.interval = normalizeIntervalValue(firstDailyButton.dataset.interval || "1d");
      if (currentIntervalText) currentIntervalText.textContent = firstDailyButton.dataset.label || getIntervalMeta(state.interval).label;
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
    intervalDropdown.classList.contains("open") ? closeIntervalDropdown() : openIntervalDropdown();
  }

  setupTradingIntervalMenu();

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

        let value = normalizeIntervalValue(btn.dataset.interval);
        if (!["1h", "2h", "3h", "4h", "1d", "1w", "1mo"].includes(value)) value = "1d";
        const label = btn.dataset.label || getIntervalMeta(value).label || btn.textContent.trim();

        if (!value) return;

        state.interval = value;
        applyIntervalChartOptions();

        intervalDropdown.querySelectorAll("[data-interval]").forEach(function (node) {
          node.classList.toggle("active", normalizeIntervalValue(node.dataset.interval) === state.interval);
        });

        if (currentIntervalText) currentIntervalText.textContent = label;

        closeIntervalDropdown();

        state.drawings = [];
        state.tempDrawing = null;

        loadChartData();
      });
    });
  }

  function normalizeTime(time) {
    return normalizeTimeForChart(time);
  }

  function sameTime(a, b) {
    return String(normalizeTime(a)) === String(normalizeTime(b));
  }

  function findRowByTime(time) {
    const key = String(normalizeTime(time));
    if (chartTimeToRow.has(key)) return chartTimeToRow.get(key);
    return state.rows.find(function (row) { return sameTime(row.time, time); });
  }

  const DRAWING_PALETTE_COLORS = [
    "#ff4568", "#ff9f1c", "#55d400", "#19aeca", "#3b82f6", "#7c64d8",
    "#ec4899", "#ff6b2c", "#2db84d", "#3aa0cf", "#466bd3", "#9b5de5",
    "#e12ab3", "#dc5f2d", "#36b37e", "#14b8a6", "#5b61b2", "#c13ee4",
    "#fb9aaa", "#ffd19a", "#9be66d", "#7ed3e3", "#93c5fd", "#b8abe3",
    "#ffffff", "#eaf2ff", "#d1d5db", "#9ca3af", "#6b7280", "#374151", "#111827", "#000000"
  ];

  const DRAWING_TOOL_ALIASES = {
    cursor: "cursor", select: "cursor", pointer: "cursor", crosshair: "cursor",
    trend: "trend", line: "trend", segment: "trend",
    extend: "extend", ray: "extend", extended: "extend",
    hline: "hline", horizontal: "hline", horizontal_line: "hline",
    vline: "vline", vertical: "vline", vertical_line: "vline",
    circle: "circle", oval: "circle", ellipse: "circle", marker: "circle", round: "circle",
    fibo: "fibo", fib: "fibo", fib_channel: "fibo", fibonacci: "fibo",
    undo: "undo", clear: "clear", trash: "clear", delete: "clear"
  };

  const DRAWING_TOOL_TITLES = {
    cursor: "십자 선택",
    trend: "라인",
    extend: "연장선",
    hline: "수평선",
    vline: "수직선",
    circle: "원형 표시",
    fibo: "피보나치 채널",
    undo: "되돌리기",
    clear: "전체삭제"
  };

  const DEFAULT_FIBO_LEVELS = [
    { value: -1, enabled: true, color: "#1d4ed8" },
    { value: -0.5, enabled: true, color: "#1d4ed8" },
    { value: 0, enabled: true, color: "#1d4ed8" },
    { value: 0.5, enabled: true, color: "#1d4ed8" },
    { value: 1, enabled: true, color: "#1d4ed8" },
    { value: 1.272, enabled: false, color: "#fdba74" },
    { value: 1.618, enabled: false, color: "#93c5fd" },
    { value: 2, enabled: false, color: "#5eead4" },
    { value: 2.618, enabled: false, color: "#f472b6" },
    { value: 4.236, enabled: false, color: "#c084fc" }
  ];

  function cloneDefaultFiboLevels() {
    return DEFAULT_FIBO_LEVELS.map(function (item) {
      return { value: item.value, enabled: !!item.enabled, color: item.color };
    });
  }

  function normalizeFiboLevels(drawing, fallbackColor) {
    const source = Array.isArray(drawing && drawing.fiboLevels) && drawing.fiboLevels.length
      ? drawing.fiboLevels
      : (Array.isArray(drawing && drawing.levels) && drawing.levels.length
        ? drawing.levels.map(function (value, index) {
            return { value: Number(value), enabled: true, color: fallbackColor || "#1d4ed8" };
          })
        : cloneDefaultFiboLevels());

    return source.map(function (item, index) {
      if (typeof item === "number") {
        return { value: item, enabled: true, color: fallbackColor || "#1d4ed8" };
      }
      const defaultItem = DEFAULT_FIBO_LEVELS[index] || DEFAULT_FIBO_LEVELS[0];
      const value = Number(item && item.value);
      return {
        value: Number.isFinite(value) ? value : defaultItem.value,
        enabled: item && item.enabled !== false,
        color: normalizeDrawingColor(item && item.color, fallbackColor || defaultItem.color || "#1d4ed8")
      };
    }).filter(function (item) {
      return Number.isFinite(Number(item.value));
    });
  }

  function getEnabledFiboLevels(drawing) {
    const levels = normalizeFiboLevels(drawing, drawing && drawing.color);
    const enabled = levels.filter(function (item) { return item.enabled !== false; });
    return (enabled.length ? enabled : levels.slice(0, 1)).sort(function (a, b) {
      return Number(a.value) - Number(b.value);
    });
  }

  const DRAWING_DEFAULTS = {
    trend: { color: "#1d4ed8", width: 2, extendLeft: false, extendRight: false, dash: "" },
    extend: { color: "#1d4ed8", width: 2, extendLeft: true, extendRight: true, dash: "" },
    hline: { color: "#8b5cf6", width: 2, dash: "" },
    vline: { color: "#64748b", width: 2, dash: "" },
    circle: {
      color: "#1d4ed8",
      fillColor: "#60a5fa",
      width: 2,
      dash: "",
      fill: true,
      fillOpacity: 0.16,
      borderOpacity: 1
    },
    fibo: {
      color: "#1d4ed8",
      width: 2,
      extendLeft: true,
      extendRight: true,
      dash: "",
      levels: [-1, -0.5, 0, 0.5, 1],
      fiboLevels: cloneDefaultFiboLevels(),
      fill: true,
      fillColor: "rgba(37, 99, 235, 0.14)",
      opacity: 0.14
    }
  };

  let drawingHistory = [];
  let drawingDrag = null;
  let drawingSettingsModal = null;
  let suppressClickAfterDrag = false;
  let drawingPassThrough = null;
  let drawingServerSaveTimer = null;
  let drawingToolDefaultsServerSaveTimer = null;
  let drawingServerAuthenticated = null;
  let drawingToolSettingsServerAuthenticated = null;

  state.selectedDrawingId = state.selectedDrawingId || null;
  state.hoverDrawingId = null;
  state.crosshairValue = null;
  state.crosshairPoint = null;
  state.fiboStage = 0;

  function normalizeDrawingTool(tool) {
    const key = String(tool || "cursor").trim();
    return DRAWING_TOOL_ALIASES[key] || DRAWING_TOOL_ALIASES[key.toLowerCase()] || key;
  }

  function escapeDrawingHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function makeDrawingId(type) {
    return "drawing_" + type + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function cloneDrawing(drawing) {
    return JSON.parse(JSON.stringify(drawing));
  }

  function normalizeDrawingColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    if (/^rgba?\(/.test(text)) return text;
    return fallback || "#1d4ed8";
  }

  function clonePlainObject(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (e) {
      return {};
    }
  }

  function drawingToolDefaultsStorageKey() {
    return "bitgak:drawing-tool-defaults:v2";
  }


  function getCsrfTokenForBitgak() {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (csrfInput && csrfInput.value) return csrfInput.value;

    const csrfMeta = document.querySelector('meta[name="csrf-token"], meta[name="csrfmiddlewaretoken"]');
    if (csrfMeta && csrfMeta.content) return csrfMeta.content;

    return "";
  }

  async function bitgakJsonFetch(url, options) {
    const opts = Object.assign({ method: "GET" }, options || {});
    opts.credentials = "same-origin";
    opts.headers = Object.assign({
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    }, opts.headers || {});

    if (opts.method && opts.method.toUpperCase() !== "GET") {
      opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
      const csrfToken = getCsrfTokenForBitgak();
      if (csrfToken) opts.headers["X-CSRFToken"] = csrfToken;
    }

    const response = await fetch(resolveBitgakUrl(url), opts);
    let data = null;

    try {
      data = await response.json();
    } catch (e) {
      data = { ok: false, message: "JSON 응답을 읽지 못했습니다." };
    }

    data = data || {};
    data.__status = response.status;
    data.__okResponse = response.ok;
    return data;
  }

  function readLocalJsonValue(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeLocalJsonValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function isDrawingStyleTool(tool) {
    const fixed = normalizeDrawingTool(tool);
    return ["trend", "extend", "hline", "vline", "circle", "fibo"].includes(fixed);
  }

  function getBuiltInDrawingDefaults(type) {
    const fixed = normalizeDrawingTool(type || "trend");
    const base = DRAWING_DEFAULTS[fixed] || DRAWING_DEFAULTS.trend;
    const cloned = clonePlainObject(base);
    if (fixed === "fibo") cloned.fiboLevels = normalizeFiboLevels(cloned, cloned.color).slice(0, 10);
    return cloned;
  }

  function sanitizeDrawingToolDefault(type, raw) {
    const fixed = normalizeDrawingTool(type || "trend");
    if (!isDrawingStyleTool(fixed)) return null;

    const builtIn = getBuiltInDrawingDefaults(fixed);
    const source = Object.assign({}, builtIn, raw || {});
    const result = {
      color: normalizeDrawingColor(source.color, builtIn.color || "#1d4ed8"),
      width: Math.min(6, Math.max(1, Number(source.width || builtIn.width || 2))),
      dash: typeof source.dash === "string" ? source.dash : (builtIn.dash || "")
    };

    if (["trend", "extend", "fibo"].includes(fixed)) {
      result.extendLeft = !!(source.extendLeft !== undefined ? source.extendLeft : builtIn.extendLeft);
      result.extendRight = !!(source.extendRight !== undefined ? source.extendRight : builtIn.extendRight);
    }

    if (fixed === "circle") {
      result.fillColor = normalizeDrawingColor(source.fillColor, builtIn.fillColor || result.color);
      result.fill = source.fill !== undefined ? !!source.fill : !!builtIn.fill;
      result.fillOpacity = Math.min(0.95, Math.max(0, Number(source.fillOpacity !== undefined ? source.fillOpacity : (builtIn.fillOpacity || 0.16))));
      result.borderOpacity = Math.min(1, Math.max(0.05, Number(source.borderOpacity !== undefined ? source.borderOpacity : (builtIn.borderOpacity || 1))));
    }

    if (fixed === "fibo") {
      result.fiboLevels = normalizeFiboLevels(source, result.color).slice(0, 10);
      result.levels = result.fiboLevels.filter(function (item) { return item.enabled !== false; }).map(function (item) { return item.value; });
      result.fill = source.fill !== undefined ? !!source.fill : !!builtIn.fill;
      result.opacity = Math.min(0.85, Math.max(0.02, Number(source.opacity !== undefined ? source.opacity : (builtIn.opacity || 0.14))));
    }

    return result;
  }

  function loadDrawingToolDefaults() {
    const raw = readLocalJsonValue(drawingToolDefaultsStorageKey(), {});
    const result = {};

    Object.keys(raw || {}).forEach(function (tool) {
      const fixed = normalizeDrawingTool(tool);
      const item = sanitizeDrawingToolDefault(fixed, raw[tool]);
      if (item) result[fixed] = item;
    });

    return result;
  }

  async function loadDrawingToolDefaultsFromServer() {
    if (!drawingToolSettingsApiUrl) return;

    try {
      const data = await bitgakJsonFetch(drawingToolSettingsApiUrl);
      drawingToolSettingsServerAuthenticated = data.authenticated === true;

      if (!data.__okResponse || data.ok === false || data.authenticated !== true) return;

      const raw = data.settings || data.drawingToolDefaults || {};
      const result = {};

      Object.keys(raw || {}).forEach(function (tool) {
        const fixed = normalizeDrawingTool(tool);
        const item = sanitizeDrawingToolDefault(fixed, raw[tool]);
        if (item) result[fixed] = item;
      });

      const hasServerSettings = Object.keys(result).length > 0;
      const hasLocalSettings = Object.keys(state.drawingToolDefaults || {}).length > 0;

      if (hasServerSettings) {
        state.drawingToolDefaults = result;
        writeLocalJsonValue(drawingToolDefaultsStorageKey(), result);
        syncDrawingToolDefaultButtonState();
        renderDrawings();
      } else if (hasLocalSettings) {
        // 기존 브라우저 localStorage 값을 로그인 계정 DB로 1회 이관한다.
        scheduleDrawingToolDefaultsServerSave(80);
      }
    } catch (e) {}
  }

  function saveDrawingToolDefaults() {
    writeLocalJsonValue(drawingToolDefaultsStorageKey(), state.drawingToolDefaults || {});
    scheduleDrawingToolDefaultsServerSave();
  }

  function scheduleDrawingToolDefaultsServerSave(delay) {
    if (!drawingToolSettingsApiUrl) return;
    clearTimeout(drawingToolDefaultsServerSaveTimer);
    drawingToolDefaultsServerSaveTimer = setTimeout(saveDrawingToolDefaultsToServer, Number(delay || 450));
  }

  async function saveDrawingToolDefaultsToServer() {
    if (!drawingToolSettingsApiUrl) return;

    try {
      const data = await bitgakJsonFetch(drawingToolSettingsApiUrl, {
        method: "POST",
        body: JSON.stringify({ settings: state.drawingToolDefaults || {} }),
      });

      drawingToolSettingsServerAuthenticated = data.authenticated === true;
    } catch (e) {}
  }

  function getEffectiveDrawingDefaults(type) {
    const fixed = normalizeDrawingTool(type || "trend");
    const base = getBuiltInDrawingDefaults(fixed);
    const saved = state.drawingToolDefaults && state.drawingToolDefaults[fixed]
      ? clonePlainObject(state.drawingToolDefaults[fixed])
      : {};
    const merged = Object.assign({}, base, saved);
    if (fixed === "fibo") merged.fiboLevels = normalizeFiboLevels(merged, merged.color).slice(0, 10);
    return merged;
  }

  function setDrawingToolDefault(type, nextValue) {
    const fixed = normalizeDrawingTool(type || "trend");
    const sanitized = sanitizeDrawingToolDefault(fixed, nextValue);
    if (!sanitized) return false;
    state.drawingToolDefaults = state.drawingToolDefaults || {};
    state.drawingToolDefaults[fixed] = sanitized;
    saveDrawingToolDefaults();
    syncDrawingToolDefaultButtonState();
    return true;
  }

  state.drawingToolDefaults = loadDrawingToolDefaults();
  loadDrawingToolDefaultsFromServer();

  function normalizeDrawing(drawing) {
    if (!drawing) return null;
    const type = normalizeDrawingTool(drawing.type || "trend");
    const defaults = getEffectiveDrawingDefaults(type);
    return Object.assign({}, defaults, drawing, {
      id: drawing.id || makeDrawingId(type),
      type,
      color: normalizeDrawingColor(drawing.color, defaults.color),
      width: Math.min(6, Math.max(1, Number(drawing.width || defaults.width || 2))),
      extendLeft: !!(drawing.extendLeft !== undefined ? drawing.extendLeft : defaults.extendLeft),
      extendRight: !!(drawing.extendRight !== undefined ? drawing.extendRight : defaults.extendRight),
      levels: Array.isArray(drawing.levels) && drawing.levels.length ? drawing.levels : (defaults.levels || []),
      fiboLevels: type === "fibo" ? normalizeFiboLevels(drawing, drawing.color || defaults.color).slice(0, 10) : [],
      fill: drawing.fill !== undefined ? !!drawing.fill : !!defaults.fill,
      fillColor: normalizeDrawingColor(drawing.fillColor, defaults.fillColor || drawing.color || defaults.color),
      fillOpacity: Math.min(0.95, Math.max(0, Number(drawing.fillOpacity !== undefined ? drawing.fillOpacity : (defaults.fillOpacity !== undefined ? defaults.fillOpacity : 0.16)))),
      borderOpacity: Math.min(1, Math.max(0.05, Number(drawing.borderOpacity !== undefined ? drawing.borderOpacity : (defaults.borderOpacity !== undefined ? defaults.borderOpacity : 1)))),
      opacity: Math.min(0.85, Math.max(0.02, Number(drawing.opacity || defaults.opacity || 0.14))),
    });
  }

  function drawingStorageKey() {
    // 드로잉은 종목 기준으로 저장한다. interval별 저장이면 일봉에서 그린 피보나치가 1시간봉에서 사라진다.
    return "bitgak:drawings:" + code;
  }

  function drawingLegacyStorageKey(interval) {
    return "bitgak:drawings:" + code + ":" + interval;
  }

  function collectLocalDrawingsFromStorage() {
    const collected = [];
    const seen = new Set();

    function appendSavedList(raw) {
      if (!raw) return;

      try {
        const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(saved)) return;

        saved.map(normalizeDrawing).filter(Boolean).forEach(function (drawing) {
          if (!drawing || seen.has(drawing.id)) return;
          seen.add(drawing.id);
          collected.push(drawing);
        });
      } catch (e) {}
    }

    appendSavedList(localStorage.getItem(drawingStorageKey()));

    // 기존 interval별 저장 데이터를 새 공통 저장소로 자동 병합한다.
    ["1d", "1w", "1mo", "1h", "2h", "3h", "4h", "60m"].forEach(function (interval) {
      appendSavedList(localStorage.getItem(drawingLegacyStorageKey(interval)));
    });

    return collected;
  }

  function persistDrawingsLocal(drawings) {
    writeLocalJsonValue(drawingStorageKey(), drawings || []);
  }

  let insightDirtyNotifyTimer = null;

  function notifyInsightChartDirty(reason) {
    // 인사이트 글쓰기 iframe과 저장 차트 iframe 모두 부모 페이지에 snapshot 변경을 알린다.
    // 부모 페이지가 서버 draft/snapshot 저장을 담당하므로 localStorage에 의존하지 않는다.
    if (!(state.insightEditorMode || state.insightSnapshotMode)) return;
    clearTimeout(insightDirtyNotifyTimer);
    insightDirtyNotifyTimer = setTimeout(function () {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "bitgak:insight-chart-dirty",
            code: code,
            interval: state.interval || "1d",
            reason: reason || "changed"
          }, "*");
        }
      } catch (e) {}
    }, reason === "data-loaded" ? 250 : 120);
  }

  function saveDrawingsToStorage() {
    // 인사이트 iframe은 localStorage를 쓰지 않는다. 부모 페이지가 snapshot을 받아 서버에 저장한다.
    if (state.insightSnapshotMode || state.insightEditorMode) {
      notifyInsightChartDirty("drawings");
      return;
    }
    persistDrawingsLocal(state.drawings || []);
    scheduleDrawingsServerSave();
  }

  function scheduleDrawingsServerSave(delay) {
    if (!drawingApiUrl) return;
    clearTimeout(drawingServerSaveTimer);
    drawingServerSaveTimer = setTimeout(saveDrawingsToServer, Number(delay || 500));
  }

  async function saveDrawingsToServer() {
    if (!drawingApiUrl) return;

    try {
      const data = await bitgakJsonFetch(drawingApiUrl, {
        method: "POST",
        body: JSON.stringify({ drawings: state.drawings || [] }),
      });

      drawingServerAuthenticated = data.authenticated === true;
    } catch (e) {}
  }

  async function fetchDrawingsFromServer() {
    if (!drawingApiUrl) return null;

    try {
      const data = await bitgakJsonFetch(drawingApiUrl);
      drawingServerAuthenticated = data.authenticated === true;

      if (!data.__okResponse || data.ok === false || data.authenticated !== true) return null;
      return Array.isArray(data.drawings) ? data.drawings : [];
    } catch (e) {
      return null;
    }
  }

  async function loadDrawingsFromStorage() {
    const localDrawings = collectLocalDrawingsFromStorage();
    const serverDrawings = await fetchDrawingsFromServer();

    if (serverDrawings !== null) {
      const normalizedServer = serverDrawings.map(normalizeDrawing).filter(Boolean);

      if (normalizedServer.length > 0) {
        state.drawings = normalizedServer;
        persistDrawingsLocal(state.drawings);
        return;
      }

      if (localDrawings.length > 0) {
        // 기존 localStorage 드로잉을 로그인 계정 DB로 1회 이관한다.
        state.drawings = localDrawings;
        persistDrawingsLocal(state.drawings);
        scheduleDrawingsServerSave(80);
        return;
      }

      state.drawings = [];
      persistDrawingsLocal(state.drawings);
      return;
    }

    // 비로그인 또는 서버 조회 실패 시에는 임시로 기존 localStorage를 사용한다.
    state.drawings = localDrawings;
    persistDrawingsLocal(state.drawings);
  }

  function deleteSelectedDrawing() {
    if (!state.selectedDrawingId) return false;
    pushDrawingHistory();
    state.drawings = (state.drawings || []).filter(function (item) { return item.id !== state.selectedDrawingId; });
    state.selectedDrawingId = null;
    state.tempDrawing = null;
    state.isDrawing = false;
    state.fiboStage = 0;
    saveDrawingsToStorage();
    renderDrawings();
    return true;
  }

  function pushDrawingHistory() {
    try {
      drawingHistory.push(JSON.stringify(state.drawings || []));
      if (drawingHistory.length > 80) drawingHistory.shift();
    } catch (e) {}
  }

  function undoDrawing() {
    const last = drawingHistory.pop();
    if (!last) return;
    try {
      state.drawings = JSON.parse(last) || [];
      saveDrawingsToStorage();
      state.tempDrawing = null;
      state.isDrawing = false;
      state.startPoint = null;
      state.selectedDrawingId = null;
      state.fiboStage = 0;
      renderDrawings();
    } catch (e) {}
  }

  function getEventClientPoint(event) {
    if (!event) return null;

    if (Number.isFinite(Number(event.clientX)) && Number.isFinite(Number(event.clientY))) {
      return { x: Number(event.clientX), y: Number(event.clientY) };
    }

    const touch = event.touches && event.touches.length ? event.touches[0] :
      (event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : null);

    if (touch && Number.isFinite(Number(touch.clientX)) && Number.isFinite(Number(touch.clientY))) {
      return { x: Number(touch.clientX), y: Number(touch.clientY) };
    }

    return null;
  }

  function getLocalPoint(event) {
    const rect = chartEl.getBoundingClientRect();
    const client = getEventClientPoint(event) || { x: rect.left, y: rect.top };
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function getMainPaneClientRect() {
    const rect = chartEl.getBoundingClientRect();
    const mainHeight = Math.max(1, getMainPaneHeight());
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: Math.min(rect.bottom, rect.top + mainHeight),
      width: rect.width,
      height: Math.min(rect.height, mainHeight),
    };
  }

  function getClampedMainPaneClientPoint(event) {
    const client = getEventClientPoint(event);
    const rect = getMainPaneClientRect();
    if (!client) return { x: rect.left, y: rect.top };
    return {
      x: clampNumber(client.x, rect.left, rect.right),
      y: clampNumber(client.y, rect.top, rect.bottom),
    };
  }

  function getStableChartBodyPanPoint(event) {
    const client = getEventClientPoint(event);
    const rect = getMainPaneClientRect();
    if (!client) return { x: rect.left, y: rect.top };

    const outsideY = client.y < rect.top || client.y > rect.bottom;
    let y = clampNumber(client.y, rect.top, rect.bottom);

    // 차트 밖으로 손이 나갔을 때 Y값이 경계로 순간 점프하면서 axisLock이 바뀌는 현상을 막는다.
    if (chartBodyPanDrag && chartBodyPanDrag.axisLock !== "vertical" && outsideY) {
      y = Number(chartBodyPanDrag.lastY || chartBodyPanDrag.startY || y);
    }

    if (chartBodyPanDrag && chartBodyPanDrag.axisLock === "horizontal") {
      y = Number(chartBodyPanDrag.startY || y);
    }

    return {
      x: clampNumber(client.x, rect.left, rect.right),
      y: y,
    };
  }

  function isMobileViewport() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  }

  function coordinateToLogicalSafe(x) {
    try {
      const ts = chart.timeScale();
      if (ts && typeof ts.coordinateToLogical === "function") {
        const logical = ts.coordinateToLogical(x);
        return Number.isFinite(Number(logical)) ? Number(logical) : null;
      }
    } catch (e) {}
    return null;
  }

  function logicalToCoordinateSafe(logical) {
    try {
      const ts = chart.timeScale();
      if (ts && typeof ts.logicalToCoordinate === "function" && Number.isFinite(Number(logical))) {
        const x = ts.logicalToCoordinate(Number(logical));
        return Number.isFinite(Number(x)) ? Number(x) : null;
      }
    } catch (e) {}
    return null;
  }

  function nearestTimeByLogical(logical) {
    const rows = state.rows || [];
    if (!rows.length) return null;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(Number(logical || 0))));
    return rows[index] ? rows[index].time : rows[0].time;
  }

  function dateKeyFromAny(value) {
    if (value === null || value === undefined || value === "") return "";

    if (typeof value === "number") {
      const parts = kstPartsFromTimestamp(value);
      return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    }

    if (typeof value === "object" && value.year && value.month && value.day) {
      return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
    }

    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    return "";
  }

  function timeComparableValue(value) {
    if (value === null || value === undefined || value === "") return null;

    if (typeof value === "number") return value;

    if (typeof value === "object" && value.year && value.month && value.day) {
      return toKstTimestamp(value.year, value.month, value.day, value.hour || 0, value.minute || 0, value.second || 0);
    }

    const text = String(value || "").trim();

    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
      const normalized = text.replace(" ", "T");
      const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(normalized);
      const date = new Date(hasTz ? normalized : normalized + "+09:00");
      if (!Number.isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parts = text.split("-").map(Number);
      return toKstTimestamp(parts[0], parts[1], parts[2], 9, 0, 0);
    }

    return null;
  }

  function rowDateKey(row) {
    if (!row) return "";
    return dateKeyFromAny(row.source_time || row.display_time || row.time);
  }

  function rowComparableTime(row) {
    if (!row) return null;
    return timeComparableValue(row.source_time || row.display_time || row.time);
  }

  function rowAtLogical(logical) {
    const rows = state.rows || [];
    if (!rows.length || !Number.isFinite(Number(logical))) return null;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(Number(logical))));
    return rows[index] || null;
  }

  function closestRowByCoordinate(x) {
    const rows = state.rows || [];
    if (!rows.length) return null;

    let best = null;
    let bestDist = Infinity;

    rows.forEach(function (row) {
      const cx = chart.timeScale().timeToCoordinate(row.time);
      if (cx === null || cx === undefined || !Number.isFinite(Number(cx))) return;

      const dist = Math.abs(Number(cx) - Number(x));
      if (dist < bestDist) {
        best = row;
        bestDist = dist;
      }
    });

    return best;
  }

  function findBestRowForDrawingValue(value) {
    const rows = state.rows || [];
    if (!value || !rows.length) return null;

    const sourceKey = String(value.source_time || "");
    const displayKey = String(value.display_time || "");
    const timeKey = String(normalizeTime(value.time));
    const dateKey = value.date_key || dateKeyFromAny(value.source_time || value.display_time || value.time);
    const targetComparable = timeComparableValue(value.source_time || value.display_time || value.time);

    let row = rows.find(function (item) {
      return String(item.source_time || "") === sourceKey ||
        String(item.display_time || "") === displayKey ||
        String(normalizeTime(item.time)) === timeKey;
    });

    if (row) return row;

    if (dateKey) {
      row = rows.find(function (item) { return rowDateKey(item) === dateKey; });
      if (row) return row;
    }

    if (targetComparable !== null) {
      let best = null;
      let bestDist = Infinity;

      rows.forEach(function (item) {
        const comparable = rowComparableTime(item);
        if (comparable === null) return;

        const dist = Math.abs(comparable - targetComparable);
        if (dist < bestDist) {
          best = item;
          bestDist = dist;
        }
      });

      if (best) return best;
    }

    return null;
  }

  function priceFromCoordinateSafe(y) {
    try {
      const price = candleSeries.coordinateToPrice(y);
      if (price !== null && price !== undefined && !Number.isNaN(Number(price))) return Number(price);
    } catch (e) {}

    try {
      const p1 = candleSeries.coordinateToPrice(0);
      const p2 = candleSeries.coordinateToPrice(100);
      if (p1 !== null && p2 !== null && Number.isFinite(Number(p1)) && Number.isFinite(Number(p2))) {
        return Number(p1) + (Number(p2) - Number(p1)) * (Number(y) / 100);
      }
    } catch (e) {}
    return null;
  }

  function pointToChartValue(point) {
    if (!isLocalPointInsideMainPane(point)) return null;

    const ts = chart.timeScale();
    const logical = coordinateToLogicalSafe(point.x);
    const rawTime = ts.coordinateToTime(point.x);
    let time = normalizeTime(rawTime);
    const row = rowAtLogical(logical) || (time ? findRowByTime(time) : null) || closestRowByCoordinate(point.x);

    if (!time && logical !== null) time = nearestTimeByLogical(logical);

    const price = priceFromCoordinateSafe(point.y);

    if ((!time && logical === null && !row) || price === null || price === undefined || Number.isNaN(Number(price))) return null;

    const sourceTime = row ? (row.source_time || row.display_time || row.time) : (time || nearestTimeByLogical(logical));
    const displayTime = row ? (row.display_time || normalizeTimeForDisplay(row.time)) : normalizeTimeForDisplay(time || nearestTimeByLogical(logical));

    return {
      time: row ? row.time : (time || nearestTimeByLogical(logical)),
      source_time: sourceTime,
      display_time: displayTime,
      date_key: dateKeyFromAny(sourceTime || displayTime || time),
      logical: logical,
      interval: state.interval,
      price: Number(price),
    };
  }

  function valueToPoint(value) {
    if (!value) return null;

    let x = null;
    const sameInterval = !value.interval || value.interval === state.interval;

    if (sameInterval && value.logical !== null && value.logical !== undefined) {
      x = logicalToCoordinateSafe(value.logical);
    }

    if (x === null || x === undefined) {
      const row = findBestRowForDrawingValue(value);
      if (row) x = chart.timeScale().timeToCoordinate(row.time);
    }

    if (x === null || x === undefined) x = chart.timeScale().timeToCoordinate(value.time);
    if ((x === null || x === undefined) && value.logical !== null && value.logical !== undefined) x = logicalToCoordinateSafe(value.logical);

    const y = candleSeries.priceToCoordinate(value.price);
    if (x === null || x === undefined || y === null || y === undefined) return null;
    return { x, y };
  }

  function pointFromEvent(event) {
    const point = getLocalPoint(event);
    const value = pointToChartValue(point);
    return value ? { point, value } : null;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(function ([key, value]) {
      if (value !== null && value !== undefined) el.setAttribute(key, value);
    });
    return el;
  }

  let drawingContentLayer = null;
  const drawingClipId = "bv-main-pane-clip-" + Math.random().toString(36).slice(2);

  function prepareDrawingClipLayer() {
    const size = getLayerSize();
    const defs = svgEl("defs", {});
    const clip = svgEl("clipPath", { id: drawingClipId, clipPathUnits: "userSpaceOnUse" });
    const rect = svgEl("rect", {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });

    clip.appendChild(rect);
    defs.appendChild(clip);
    drawingLayer.appendChild(defs);

    drawingContentLayer = svgEl("g", {
      class: "bv-drawing-content-layer",
      "clip-path": "url(#" + drawingClipId + ")",
    });
    drawingLayer.appendChild(drawingContentLayer);
  }

  function clearSvg() {
    while (drawingLayer.firstChild) drawingLayer.removeChild(drawingLayer.firstChild);
    drawingContentLayer = null;
    prepareDrawingClipLayer();
  }

  function appendSvg(tag, attrs, parent) {
    const el = svgEl(tag, attrs || {});
    (parent || drawingContentLayer || drawingLayer).appendChild(el);
    return el;
  }

  function measureMainPaneHeightFromDom(chartHeight) {
    try {
      const chartRect = chartEl.getBoundingClientRect();
      if (!chartRect || !chartRect.height) return null;

      const rows = Array.from(chartEl.querySelectorAll("table tr"))
        .map(function (row) {
          const rect = row.getBoundingClientRect();
          return {
            top: rect.top - chartRect.top,
            bottom: rect.bottom - chartRect.top,
            height: rect.height,
            width: rect.width,
          };
        })
        .filter(function (rect) {
          return rect.height > 48 && rect.width > chartRect.width * 0.42 && rect.bottom > 0 && rect.top < chartRect.height;
        })
        .sort(function (a, b) { return a.top - b.top; });

      if (rows.length >= 2) {
        const boundary = Math.round(rows[0].bottom);
        if (boundary > 160 && boundary < chartHeight - 72) return boundary;
      }

      const canvases = Array.from(chartEl.querySelectorAll("canvas"))
        .map(function (canvas) {
          const rect = canvas.getBoundingClientRect();
          return {
            top: rect.top - chartRect.top,
            bottom: rect.bottom - chartRect.top,
            height: rect.height,
            width: rect.width,
          };
        })
        .filter(function (rect) {
          return rect.height > 60 && rect.width > chartRect.width * 0.42 && rect.bottom > 0 && rect.top < chartRect.height;
        })
        .sort(function (a, b) { return a.top - b.top; });

      if (canvases.length >= 2) {
        const boundary = Math.round(canvases[0].bottom);
        if (boundary > 160 && boundary < chartHeight - 72) return boundary;
      }
    } catch (e) {}

    return null;
  }

  function estimateMainPaneHeightFromActivePanes(chartHeight) {
    const activeTypes = uniquePaneTypes(state.activePaneTypes || []);
    if (!activeTypes.length) return null;

    let subRatio = 0;
    activeTypes.forEach(function (type) {
      const base = paneBaseType(type);
      if (base === "volume") subRatio += 0.30;
      else if (base === "macd") subRatio += 0.24;
      else if (base === "rsi" || base === "stoch") subRatio += 0.22;
      else subRatio += 0.20;
    });

    subRatio = Math.max(0.22, Math.min(0.55, subRatio));
    const estimated = Math.round(chartHeight * (1 - subRatio));
    return Math.max(210, Math.min(chartHeight - 86, estimated));
  }

  function clampMainPaneHeight(value, chartHeight) {
    const n = Number(value);
    const h = Math.max(1, Number(chartHeight) || chartEl.clientHeight || chartWrap.clientHeight || 1);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.min(h, Math.round(n)));
  }

  function getMainPaneHeight() {
    const chartHeight = Math.max(1, chartEl.clientHeight || chartWrap.clientHeight || 1);

    // Lightweight Charts v5 pane API가 가장 정확하다. 기존처럼 여러 후보의 최소값을 쓰면
    // 보조지표를 켰다 끈 뒤 저장된 old height/추정값 때문에 드로잉 레이어가 잘리거나
    // 이평선/드로잉이 깨져 보일 수 있다.
    try {
      const panes = chart && chart.panes ? chart.panes() : null;
      const firstPane = panes && panes[0] ? panes[0] : null;
      if (firstPane && typeof firstPane.getHeight === "function") {
        const paneHeight = clampMainPaneHeight(firstPane.getHeight(), chartHeight);
        if (paneHeight && paneHeight > 24) return paneHeight;
      }
    } catch (e) {}

    const domMeasured = clampMainPaneHeight(measureMainPaneHeightFromDom(chartHeight), chartHeight);
    if (domMeasured && domMeasured > 24) return domMeasured;

    const saved = clampMainPaneHeight(state.mainPaneHeight || 0, chartHeight);
    if (saved && saved > 24) return saved;

    const estimated = clampMainPaneHeight(estimateMainPaneHeightFromActivePanes(chartHeight), chartHeight);
    if (estimated && estimated > 24) return estimated;

    return chartHeight;
  }

  function syncDrawingLayerBounds() {
    if (!drawingLayer) return;

    const width = Math.max(1, chartEl.clientWidth || chartWrap.clientWidth || 1);
    const height = Math.max(1, getMainPaneHeight());

    drawingLayer.setAttribute("width", width);
    drawingLayer.setAttribute("height", height);
    drawingLayer.setAttribute("viewBox", "0 0 " + width + " " + height);

    drawingLayer.style.left = "0px";
    drawingLayer.style.top = "0px";
    drawingLayer.style.right = "auto";
    drawingLayer.style.bottom = "auto";
    drawingLayer.style.width = width + "px";
    drawingLayer.style.height = height + "px";
    drawingLayer.style.maxHeight = height + "px";
    drawingLayer.style.overflow = "hidden";
    drawingLayer.style.clipPath = "inset(0 0 0 0)";
  }

  function getLayerSize() {
    return {
      width: Number(drawingLayer.getAttribute("width")) || drawingLayer.clientWidth || chartEl.clientWidth || chartWrap.clientWidth || 1,
      height: Number(drawingLayer.getAttribute("height")) || drawingLayer.clientHeight || getMainPaneHeight() || 1,
    };
  }

  function isLocalPointInsideMainPane(point) {
    if (!point) return false;
    const size = getLayerSize();
    const x = Number(point.x);
    const y = Number(point.y);

    return Number.isFinite(x) && Number.isFinite(y) &&
      x >= 0 && x <= size.width &&
      y >= 0 && y <= size.height;
  }

  function isClientPointInsideMainPane(event) {
    if (!event) return false;
    const rect = chartEl.getBoundingClientRect();
    const client = getEventClientPoint(event);
    if (!client) return false;
    const mainBottom = rect.top + getMainPaneHeight();

    return client.x >= rect.left && client.x <= rect.right &&
      client.y >= rect.top && client.y <= mainBottom;
  }

  function drawLineSvg(p1, p2, options, parent) {
    options = options || {};
    return appendSvg("line", {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: options.stroke || options.color || "#2563eb",
      "stroke-width": options.width || 2,
      "stroke-dasharray": options.dash || "",
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
      class: options.className || "",
      "data-drawing-id": options.id || null,
      "data-drawing-role": options.role || null,
    }, parent);
  }

  function drawHitLine(p1, p2, id, role, parent) {
    return drawLineSvg(p1, p2, {
      stroke: "transparent",
      width: 18,
      className: "bv-drawing-hit",
      id,
      role: role || "body",
    }, parent);
  }

  function drawTextSvg(text, x, y, options, parent) {
    options = options || {};
    const label = appendSvg("text", {
      x, y,
      fill: options.fill || "#2563eb",
      "font-size": options.size || 11,
      "font-weight": options.weight || "850",
      "dominant-baseline": options.baseline || "middle",
      "text-anchor": options.anchor || "start",
      class: options.className || "",
      "data-drawing-id": options.id || null,
      "data-drawing-role": options.role || null,
    }, parent);
    label.textContent = text;
    return label;
  }

  function drawRectSvg(x, y, w, h, options, parent) {
    options = options || {};
    return appendSvg("rect", {
      x, y, width: w, height: h,
      rx: options.rx === undefined ? 4 : options.rx,
      fill: options.fill || "#ffffff",
      stroke: options.stroke || "#2563eb",
      "stroke-width": options.width || 1,
      class: options.className || "",
      "data-drawing-id": options.id || null,
      "data-drawing-role": options.role || null,
    }, parent);
  }

  function drawCircleSvg(cx, cy, r, options, parent) {
    options = options || {};
    return appendSvg("circle", {
      cx: cx,
      cy: cy,
      r: Math.max(0, Number(r || 0)),
      fill: options.fill !== undefined ? options.fill : "none",
      "fill-opacity": options.fillOpacity !== undefined ? options.fillOpacity : null,
      stroke: options.stroke || options.color || "#2563eb",
      "stroke-width": options.width || 1,
      "stroke-opacity": options.strokeOpacity !== undefined ? options.strokeOpacity : null,
      "stroke-dasharray": options.dash || "",
      "vector-effect": "non-scaling-stroke",
      class: options.className || "",
      "data-drawing-id": options.id || null,
      "data-drawing-role": options.role || null,
    }, parent);
  }

  function drawHandle(point, parent, drawingId, role) {
    if (!point) return;
    drawRectSvg(point.x - 5.2, point.y - 5.2, 10.4, 10.4, {
      rx: 2.2,
      fill: "#ffffff",
      stroke: "#2563eb",
      width: 2,
      className: "bv-drawing-handle",
      id: drawingId || null,
      role: role || "handle",
    }, parent);
  }

  function drawAxisBadge(text, x, y, options, parent) {
    options = options || {};
    const paddingX = 8;
    const width = Math.max(options.minWidth || 64, String(text).length * 7 + paddingX * 2);
    const height = options.height || 22;
    const rectX = options.anchor === "right" ? x - width : options.anchor === "middle" ? x - width / 2 : x;
    const rectY = y - height / 2;

    drawRectSvg(rectX, rectY, width, height, {
      rx: 6,
      fill: options.bg || "#111827",
      stroke: options.bg || "#111827",
      width: 1,
      className: "bv-drawing-axis-badge",
    }, parent);

    drawTextSvg(text, rectX + width / 2, y + 0.5, {
      fill: "#ffffff",
      size: 11,
      weight: "900",
      anchor: "middle",
      className: "bv-drawing-axis-badge-text",
    }, parent);
  }

  function extendTwoPoints(p1, p2, options) {
    const size = getLayerSize();
    const style = options || {};
    const extendLeft = !!style.extendLeft;
    const extendRight = !!style.extendRight;
    if (!extendLeft && !extendRight) return { a: p1, b: p2 };

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!length) return { a: p1, b: p2 };

    const ux = dx / length;
    const uy = dy / length;
    const far = Math.max(size.width, size.height) * 2.6;
    return {
      a: extendLeft ? { x: p1.x - ux * far, y: p1.y - uy * far } : p1,
      b: extendRight ? { x: p2.x + ux * far, y: p2.y + uy * far } : p2,
    };
  }

  function getDrawingById(id) {
    return (state.drawings || []).find(function (item) { return item && item.id === id; });
  }

  function drawingTitle(type) {
    return DRAWING_TOOL_TITLES[normalizeDrawingTool(type)] || "도구";
  }

  function buildGroup(drawing, isTemp) {
    return appendSvg("g", {
      class: "bv-drawing-group bv-drawing-" + drawing.type + (isTemp ? " is-temp" : "") + (state.selectedDrawingId === drawing.id ? " is-selected" : ""),
      "data-drawing-id": drawing.id || null,
      "data-drawing-type": drawing.type || null,
    });
  }

  function drawTrend(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    const p1 = valueToPoint(drawing.start);
    const p2 = valueToPoint(drawing.end);
    if (!p1 || !p2) return;

    const group = buildGroup(drawing, isTemp);
    const ext = drawing.type === "extend" || drawing.extendLeft || drawing.extendRight
      ? extendTwoPoints(p1, p2, drawing)
      : { a: p1, b: p2 };

    if (!isTemp) drawHitLine(ext.a, ext.b, drawing.id, "body", group);
    drawLineSvg(ext.a, ext.b, {
      stroke: drawing.color,
      width: drawing.width,
      dash: drawing.dash,
      id: drawing.id,
      className: isTemp ? "bv-drawing-preview" : "bv-drawing-line",
    }, group);

    if (isTemp || state.selectedDrawingId === drawing.id) {
      drawHandle(p1, group, drawing.id, "start");
      drawHandle(p2, group, drawing.id, "end");
    }
  }

  function drawHorizontal(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    const p = valueToPoint(drawing.start);
    if (!p) return;

    const size = getLayerSize();
    const group = buildGroup(drawing, isTemp);
    const left = { x: 0, y: p.y };
    const right = { x: size.width, y: p.y };

    if (!isTemp) drawHitLine(left, right, drawing.id, "body", group);
    drawLineSvg(left, right, { stroke: drawing.color, width: drawing.width, dash: drawing.dash, id: drawing.id }, group);
    drawAxisBadge(formatNumber(Math.round(drawing.start.price)), size.width - 4, p.y, { anchor: "right", bg: drawing.color || "#1d4ed8" }, group);
    if (isTemp || state.selectedDrawingId === drawing.id) drawHandle({ x: 28, y: p.y }, group, drawing.id, "start");
  }

  function drawVertical(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    const p = valueToPoint(drawing.start);
    if (!p) return;

    const size = getLayerSize();
    const group = buildGroup(drawing, isTemp);
    const top = { x: p.x, y: 0 };
    const bottom = { x: p.x, y: size.height };

    if (!isTemp) drawHitLine(top, bottom, drawing.id, "body", group);
    drawLineSvg(top, bottom, { stroke: drawing.color, width: drawing.width, dash: drawing.dash, id: drawing.id }, group);
    drawAxisBadge(normalizeTimeForDisplay(drawing.start.time), p.x, size.height - 12, { anchor: "middle", bg: drawing.color || "#1d4ed8", minWidth: 90 }, group);
    if (isTemp || state.selectedDrawingId === drawing.id) drawHandle({ x: p.x, y: 28 }, group, drawing.id, "start");
  }

  function getCircleGeometry(drawing) {
    drawing = normalizeDrawing(drawing);
    const center = valueToPoint(drawing.start);
    const edge = valueToPoint(drawing.end);
    if (!center || !edge) return null;
    const radius = Math.max(2, Math.hypot(edge.x - center.x, edge.y - center.y));
    return { center, edge, radius };
  }

  function drawCircle(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    const geo = getCircleGeometry(drawing);
    if (!geo) return;

    const group = buildGroup(drawing, isTemp);

    if (!isTemp) {
      drawCircleSvg(geo.center.x, geo.center.y, geo.radius, {
        fill: "transparent",
        stroke: "transparent",
        width: Math.max(18, Number(drawing.width || 2) + 14),
        id: drawing.id,
        role: "body",
        className: "bv-drawing-hit",
      }, group);
    }

    drawCircleSvg(geo.center.x, geo.center.y, geo.radius, {
      fill: drawing.fill !== false ? drawing.fillColor : "none",
      fillOpacity: drawing.fill !== false ? drawing.fillOpacity : 0,
      stroke: drawing.color,
      strokeOpacity: drawing.borderOpacity,
      width: drawing.width,
      dash: drawing.dash,
      id: drawing.id,
      className: isTemp ? "bv-drawing-preview bv-drawing-circle" : "bv-drawing-line bv-drawing-circle",
    }, group);

    if (isTemp || state.selectedDrawingId === drawing.id) {
      drawHandle(geo.center, group, drawing.id, "start");
      drawHandle(geo.edge, group, drawing.id, "end");
    }
  }

  function getFiboGeometry(drawing) {
    const p1 = valueToPoint(drawing.start);
    const p2 = valueToPoint(drawing.end);
    const p3 = valueToPoint(drawing.third);
    if (!p1 || !p2) return null;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return null;
    const nx = -dy / len;
    const ny = dx / len;
    const distance = p3 ? ((p3.x - p1.x) * nx + (p3.y - p1.y) * ny) : 0;
    return { p1, p2, p3, nx, ny, distance };
  }

  function drawFibo(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    const geo = getFiboGeometry(drawing);
    if (!geo) return;
    const group = buildGroup(drawing, isTemp);
    const levelItems = getEnabledFiboLevels(drawing);
    const levels = levelItems.map(function (item) { return Number(item.value); });

    if (!geo.p3) {
      const ext = extendTwoPoints(geo.p1, geo.p2, drawing);
      drawLineSvg(ext.a, ext.b, { stroke: drawing.color, width: drawing.width, dash: drawing.dash, className: "bv-drawing-preview" }, group);
      drawHandle(geo.p1, group, drawing.id, "start");
      drawHandle(geo.p2, group, drawing.id, "end");
      return;
    }

    if (drawing.fill !== false) {
      for (let i = 0; i < levels.length - 1; i++) {
        const lv1 = levels[i];
        const lv2 = levels[i + 1];
        const a1 = { x: geo.p1.x + geo.nx * geo.distance * lv1, y: geo.p1.y + geo.ny * geo.distance * lv1 };
        const b1 = { x: geo.p2.x + geo.nx * geo.distance * lv1, y: geo.p2.y + geo.ny * geo.distance * lv1 };
        const a2 = { x: geo.p1.x + geo.nx * geo.distance * lv2, y: geo.p1.y + geo.ny * geo.distance * lv2 };
        const b2 = { x: geo.p2.x + geo.nx * geo.distance * lv2, y: geo.p2.y + geo.ny * geo.distance * lv2 };
        const e1 = extendTwoPoints(a1, b1, drawing);
        const e2 = extendTwoPoints(a2, b2, drawing);
        appendSvg("path", {
          d: "M " + e1.a.x + " " + e1.a.y + " L " + e1.b.x + " " + e1.b.y + " L " + e2.b.x + " " + e2.b.y + " L " + e2.a.x + " " + e2.a.y + " Z",
          fill: "rgba(37, 99, 235, " + (drawing.opacity || 0.14) + ")",
          class: "bv-drawing-fill",
        }, group);
      }
    }

    levelItems.forEach(function (levelItem) {
      const level = Number(levelItem.value);
      const lineColor = normalizeDrawingColor(levelItem.color, drawing.color);
      const start = { x: geo.p1.x + geo.nx * geo.distance * level, y: geo.p1.y + geo.ny * geo.distance * level };
      const end = { x: geo.p2.x + geo.nx * geo.distance * level, y: geo.p2.y + geo.ny * geo.distance * level };
      const ext = extendTwoPoints(start, end, drawing);
      if (!isTemp) drawHitLine(ext.a, ext.b, drawing.id, "body", group);
      drawLineSvg(ext.a, ext.b, {
        stroke: lineColor,
        width: level === 0 ? Math.max(2, drawing.width) : drawing.width,
        dash: drawing.dash,
        id: drawing.id,
        className: isTemp ? "bv-drawing-preview" : "bv-drawing-line",
      }, group);
      drawTextSvg(String(level), ext.b.x + 6, ext.b.y, { fill: lineColor, size: 11, weight: "850", id: drawing.id }, group);
    });

    if (isTemp || state.selectedDrawingId === drawing.id) {
      drawHandle(geo.p1, group, drawing.id, "start");
      drawHandle(geo.p2, group, drawing.id, "end");
      drawHandle(geo.p3, group, drawing.id, "third");
    }
  }

  function shouldDrawManualCrosshair() {
    return !!(isMobileViewport() || normalizeDrawingTool(state.activeTool) !== "cursor" || state.tempDrawing || drawingDrag);
  }

  function drawCrosshairGuide() {
    if (!shouldDrawManualCrosshair() || !state.crosshairValue || !state.crosshairPoint) return;

    const size = getLayerSize();
    const p = state.crosshairPoint;
    if (!isLocalPointInsideMainPane(p)) return;
    const color = "#2563eb";
    const group = appendSvg("g", { class: "bv-drawing-crosshair-guide" });
    drawLineSvg({ x: 0, y: p.y }, { x: size.width, y: p.y }, { stroke: "rgba(37,99,235,.38)", width: 1, dash: "4 4" }, group);
    drawLineSvg({ x: p.x, y: 0 }, { x: p.x, y: size.height }, { stroke: "rgba(37,99,235,.38)", width: 1, dash: "4 4" }, group);
    drawAxisBadge(formatNumber(Math.round(state.crosshairValue.price)), size.width - 4, p.y, { anchor: "right", bg: color }, group);
    drawAxisBadge(normalizeTimeForDisplay(state.crosshairValue.time), p.x, size.height - 12, { anchor: "middle", bg: color, minWidth: 90 }, group);
  }

  function renderOneDrawing(drawing, isTemp) {
    drawing = normalizeDrawing(drawing);
    if (!drawing) return;
    if (drawing.type === "trend" || drawing.type === "extend") drawTrend(drawing, isTemp);
    if (drawing.type === "hline") drawHorizontal(drawing, isTemp);
    if (drawing.type === "vline") drawVertical(drawing, isTemp);
    if (drawing.type === "circle") drawCircle(drawing, isTemp);
    if (drawing.type === "fibo") drawFibo(drawing, isTemp);
  }

  function renderDrawings() {
    if (isChartBodyLivePanActive()) {
      drawingRenderDeferred = true;
      return;
    }

    drawingRenderDeferred = false;
    syncDrawingLayerBounds();
    drawingLayer.classList.toggle("has-drawings", !!((state.drawings || []).length || state.tempDrawing));
    clearSvg();
    (state.drawings || []).forEach(function (drawing) { renderOneDrawing(drawing, false); });
    if (state.tempDrawing) renderOneDrawing(state.tempDrawing, true);
    drawCrosshairGuide();
  }

  function completeDrawing(drawing) {
    if (!drawing) return;
    const fixed = normalizeDrawing(drawing);
    if (!fixed) return;
    pushDrawingHistory();
    state.drawings.push(fixed);
    saveDrawingsToStorage();
    state.selectedDrawingId = fixed.id;
    state.tempDrawing = null;
    state.isDrawing = false;
    state.startPoint = null;
    state.fiboStage = 0;

    if (state.continuousDrawing && normalizeDrawingTool(state.activeTool) === fixed.type) {
      setDrawingTool(fixed.type, { keepSelection: true });
    } else {
      setDrawingTool("cursor", { keepSelection: true });
    }
  }

  let drawingPointerCandidate = null;
  let suppressNextDrawingClick = false;
  let drawingLastHandledTap = null;
  let lastDrawingClick = { id: null, time: 0 };

  function rememberHandledDrawingPointerTap(event) {
    const client = getEventClientPoint(event);
    drawingLastHandledTap = {
      time: Date.now(),
      x: client ? Number(client.x) : 0,
      y: client ? Number(client.y) : 0,
      pointerId: event && event.pointerId !== undefined ? event.pointerId : null,
      tool: normalizeDrawingTool(state.activeTool),
    };
  }

  function isNativeClickFromHandledDrawingPointerTap(event) {
    if (!drawingLastHandledTap || !event) return false;

    const client = getEventClientPoint(event);
    const now = Date.now();
    const dt = now - Number(drawingLastHandledTap.time || 0);
    const x = client ? Number(client.x) : 0;
    const y = client ? Number(client.y) : 0;
    const dist = Math.hypot(x - Number(drawingLastHandledTap.x || 0), y - Number(drawingLastHandledTap.y || 0));

    // pointerup에서 이미 드로잉 포인트를 처리한 직후 브라우저가 생성하는
    // native click만 정확히 버린다. 빠른 두 번째 실제 클릭은 pointerup에서 다시 처리되므로 막지 않는다.
    if (dt >= 0 && dt < 520 && dist < 24) {
      drawingLastHandledTap = null;
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      return true;
    }

    if (dt > 900) drawingLastHandledTap = null;
    return false;
  }
  let crosshairRaf = null;
  let priceAxisDrag = null;
  let chartBodyPanDrag = null;
  let manualMainPriceRange = null;
  let manualAutoscaleProviderReady = false;
  let priceAxisDragOverlay = null;
  let wheelZoomRaf = null;
  let chartBodyPanRaf = null;
  let chartBodyPanPendingRange = null;
  let priceAxisRaf = null;
  let priceAxisPendingRange = null;
  let drawingRenderDeferred = false;

  function isChartBodyLivePanActive() {
    // 수평 팬에서는 LightweightCharts가 X축 이동을 처리한다.
    // 이때 드로잉은 레이어 transform으로 즉시 따라가게 하되, Y축 transform은 절대 허용하지 않는다.
    return !!(chartBodyPanDrag && chartBodyPanDrag.liveTransform && chartBodyPanDrag.axisLock !== "vertical");
  }

  function applyDrawingLayerLiveTransform(dx, dy) {
    if (!drawingLayer) return;
    const x = Math.round((Number.isFinite(Number(dx)) ? Number(dx) : 0) * 100) / 100;
    // 중요: SVG 레이어는 메인 가격 차트 높이까지만 존재하지만, 요소 자체를 Y축으로
    // transform하면 보조지표/거래량 영역 위로 내려와 보인다. 그래서 라이브 이동은 X축만 허용한다.
    const y = 0;

    if (chartBodyPanDrag) chartBodyPanDrag.currentLiveDx = x;

    drawingLayer.classList.add("is-live-panning");
    drawingLayer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    drawingLayer.style.willChange = "transform";
    drawingLayer.style.backfaceVisibility = "hidden";
  }

  function clearDrawingLayerLiveTransform() {
    if (!drawingLayer) return;
    drawingLayer.classList.remove("is-live-panning");
    drawingLayer.style.transform = "";
    drawingLayer.style.willChange = "";
    drawingLayer.style.backfaceVisibility = "";
  }

  function getActualDrawingPanDxFromTimeScale(fallbackDx) {
    if (!chartBodyPanDrag) return Number(fallbackDx || 0);

    const refLogical = chartBodyPanDrag.referenceLogical;
    const refX = chartBodyPanDrag.referenceX;
    if (Number.isFinite(Number(refLogical)) && Number.isFinite(Number(refX))) {
      const currentX = logicalToCoordinateSafe(refLogical);
      if (Number.isFinite(Number(currentX))) {
        return Number(currentX) - Number(refX);
      }
    }

    return Number(fallbackDx || 0);
  }

  let livePanSyncRaf = null;
  function scheduleDrawingLivePanSync(fallbackDx) {
    if (!isChartBodyLivePanActive()) return;

    if (Number.isFinite(Number(fallbackDx))) {
      applyDrawingLayerLiveTransform(fallbackDx, 0);
    }

    if (livePanSyncRaf) return;
    livePanSyncRaf = requestAnimationFrame(function () {
      livePanSyncRaf = null;
      if (!isChartBodyLivePanActive()) return;
      const dx = getActualDrawingPanDxFromTimeScale(chartBodyPanDrag.currentLiveDx || fallbackDx || 0);
      applyDrawingLayerLiveTransform(dx, 0);
    });
  }

  function requestDrawingRender() {
    if (isChartBodyLivePanActive()) {
      // 렌더를 끝까지 미뤄버리면 차트 팬과 드로잉이 따로 노는 느낌이 생긴다.
      // 대신 현재 timeScale 기준의 실제 X 이동량으로 레이어를 즉시 보정한다.
      drawingRenderDeferred = true;
      scheduleDrawingLivePanSync(chartBodyPanDrag ? chartBodyPanDrag.currentLiveDx : 0);
      return;
    }
    renderDrawings();
  }

  function getDrawingRenderScheduler() {
    return function () { requestDrawingRender(); };
  }

  function getDrawingLayerPanDx() {
    if (!chartBodyPanDrag) return 0;
    return Number(chartBodyPanDrag.lastX || chartBodyPanDrag.startX || 0) - Number(chartBodyPanDrag.startX || 0);
  }

  function getDrawingLayerPanDy() {
    if (!chartBodyPanDrag) return 0;
    return Number(chartBodyPanDrag.lastY || chartBodyPanDrag.startY || 0) - Number(chartBodyPanDrag.startY || 0);
  }

  function getDrawingEventTarget(event) {
    if (!event) return null;
    const selector = ".bv-drawing-handle[data-drawing-id], .bv-drawing-hit[data-drawing-id], [data-drawing-id]";

    if (event.target && event.target.closest) {
      const direct = event.target.closest(selector);
      if (direct) return direct;
    }

    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      for (let i = 0; i < path.length; i++) {
        const node = path[i];
        if (node && node.matches && node.matches(selector)) return node;
        if (node && node.closest) {
          const found = node.closest(selector);
          if (found) return found;
        }
      }
    }

    return null;
  }


  function distanceToSegment(point, a, b) {
    if (!point || !a || !b) return Infinity;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = point.x - a.x;
    const wy = point.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (!len2) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function distanceToInfiniteLine(point, a, b) {
    if (!point || !a || !b) return Infinity;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    if (!len) return Math.hypot(point.x - a.x, point.y - a.y);
    return Math.abs((point.x - a.x) * vy - (point.y - a.y) * vx) / len;
  }

  function getExtendedLinePointsForHit(p1, p2, drawing) {
    if (!p1 || !p2) return null;
    if (drawing && (drawing.type === "extend" || drawing.extendLeft || drawing.extendRight)) {
      return extendTwoPoints(p1, p2, drawing);
    }
    return { a: p1, b: p2 };
  }

  function drawingHandleHit(point, drawing) {
    if (!point || !drawing || state.selectedDrawingId !== drawing.id) return null;
    const threshold = 13;

    if (drawing.type === "hline") {
      const p = valueToPoint(drawing.start);
      if (p && Math.hypot(point.x - 28, point.y - p.y) <= threshold) return "start";
      return null;
    }

    if (drawing.type === "vline") {
      const p = valueToPoint(drawing.start);
      if (p && Math.hypot(point.x - p.x, point.y - 28) <= threshold) return "start";
      return null;
    }

    const candidates = [
      { role: "start", point: valueToPoint(drawing.start) },
      { role: "end", point: valueToPoint(drawing.end) },
      { role: "third", point: valueToPoint(drawing.third) },
    ];

    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      if (!item.point) continue;
      if (Math.hypot(point.x - item.point.x, point.y - item.point.y) <= threshold) return item.role;
    }

    return null;
  }

  function hitTestDrawingAtPoint(point) {
    if (!point) return null;
    const drawings = (state.drawings || []).slice().reverse();
    const hitDistance = 10;

    for (let i = 0; i < drawings.length; i++) {
      const drawing = normalizeDrawing(drawings[i]);
      if (!drawing) continue;

      const handleRole = drawingHandleHit(point, drawing);
      if (handleRole) return { id: drawing.id, role: handleRole, drawing: drawing, isHandle: true };

      if (drawing.type === "hline") {
        const p = valueToPoint(drawing.start);
        if (p && Math.abs(point.y - p.y) <= hitDistance) return { id: drawing.id, role: "body", drawing: drawing };
        continue;
      }

      if (drawing.type === "vline") {
        const p = valueToPoint(drawing.start);
        if (p && Math.abs(point.x - p.x) <= hitDistance) return { id: drawing.id, role: "body", drawing: drawing };
        continue;
      }

      if (drawing.type === "circle") {
        const geo = getCircleGeometry(drawing);
        if (!geo) continue;
        const dist = Math.hypot(point.x - geo.center.x, point.y - geo.center.y);
        const onEdge = Math.abs(dist - geo.radius) <= hitDistance;
        const insideFill = drawing.fill !== false && dist <= geo.radius;
        if (onEdge || insideFill) return { id: drawing.id, role: "body", drawing: drawing };
        continue;
      }

      if (drawing.type === "trend" || drawing.type === "extend") {
        const p1 = valueToPoint(drawing.start);
        const p2 = valueToPoint(drawing.end);
        const ext = getExtendedLinePointsForHit(p1, p2, drawing);
        if (ext && distanceToSegment(point, ext.a, ext.b) <= hitDistance) {
          return { id: drawing.id, role: "body", drawing: drawing };
        }
        continue;
      }

      if (drawing.type === "fibo") {
        const geo = getFiboGeometry(drawing);
        if (!geo) continue;

        if (!geo.p3) {
          const ext = extendTwoPoints(geo.p1, geo.p2, drawing);
          if (distanceToSegment(point, ext.a, ext.b) <= hitDistance) return { id: drawing.id, role: "body", drawing: drawing };
          continue;
        }

        const levelItems = getEnabledFiboLevels(drawing);
        for (let j = 0; j < levelItems.length; j++) {
          const level = Number(levelItems[j].value);
          const start = { x: geo.p1.x + geo.nx * geo.distance * level, y: geo.p1.y + geo.ny * geo.distance * level };
          const end = { x: geo.p2.x + geo.nx * geo.distance * level, y: geo.p2.y + geo.ny * geo.distance * level };
          const ext = extendTwoPoints(start, end, drawing);
          if (distanceToSegment(point, ext.a, ext.b) <= hitDistance) return { id: drawing.id, role: "body", drawing: drawing };
        }
      }
    }

    return null;
  }

  function hitTestDrawingEvent(event) {
    if (!event) return null;

    const target = getDrawingEventTarget(event);
    if (target && target.getAttribute("data-drawing-id")) {
      return {
        id: target.getAttribute("data-drawing-id"),
        role: target.getAttribute("data-drawing-role") || "body",
        drawing: getDrawingById(target.getAttribute("data-drawing-id")),
        isHandle: target.classList && target.classList.contains("bv-drawing-handle"),
      };
    }

    return hitTestDrawingAtPoint(getLocalPoint(event));
  }

  function beginDrawingDrag(event, hit) {
    if (!hit || !hit.id) return false;
    const drawing = getDrawingById(hit.id);
    if (!drawing) return false;

    event.preventDefault();
    event.stopPropagation();

    pushDrawingHistory();
    state.selectedDrawingId = hit.id;

    drawingDrag = {
      id: hit.id,
      role: hit.role || "body",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      original: cloneDrawing(drawing),
      moved: false,
    };

    chart.applyOptions({ handleScroll: false, handleScale: false });
    try {
      if (event.currentTarget && event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
      else drawingLayer.setPointerCapture(event.pointerId);
    } catch (e) {}

    renderDrawings();
    return true;
  }

  function handleChartWrapDrawingPointerDown(event) {
    if (normalizeDrawingTool(state.activeTool) !== "cursor") return;
    if (event.target && event.target.closest && event.target.closest(".bv-drawing-settings-modal, .bv-drawing-color-palette, [data-tool], .indicator-panel, .group-panel, .my-stock-panel")) return;

    const hit = hitTestDrawingAtPoint(getLocalPoint(event));
    // 선 몸통 위에서는 차트 드래그/팬을 우선한다. 선택된 점(handle)에서만 도형 편집을 시작한다.
    if (!hit || !hit.isHandle) return;

    beginDrawingDrag(event, hit);
  }

  function handleChartWrapDrawingClick(event) {
    if (isNativeClickFromHandledDrawingPointerTap(event)) return;
    if (normalizeDrawingTool(state.activeTool) !== "cursor") return;
    if (suppressClickAfterDrag) {
      suppressClickAfterDrag = false;
      return;
    }

    const hit = hitTestDrawingAtPoint(getLocalPoint(event));
    if (!hit) {
      state.selectedDrawingId = null;
      renderDrawings();
      return;
    }

    const drawing = getDrawingById(hit.id);
    if (!drawing) return;

    const now = Date.now();
    const isDoubleTap = lastDrawingClick.id === hit.id && (now - lastDrawingClick.time) < 430;

    event.preventDefault();
    event.stopPropagation();

    state.selectedDrawingId = hit.id;
    renderDrawings();

    if ((event.detail >= 2 || isDoubleTap) && drawing) {
      lastDrawingClick = { id: null, time: 0 };
      openDrawingSettings(drawing);
      return;
    }

    lastDrawingClick = { id: hit.id, time: now };
  }

  function handleChartWrapDrawingDoubleClick(event) {
    if (normalizeDrawingTool(state.activeTool) !== "cursor") return;

    const hit = hitTestDrawingAtPoint(getLocalPoint(event));
    if (!hit) return;

    const drawing = getDrawingById(hit.id);
    if (!drawing) return;

    event.preventDefault();
    event.stopPropagation();

    state.selectedDrawingId = hit.id;
    renderDrawings();
    openDrawingSettings(drawing);
  }

  function handleChartWrapDrawingContextMenu(event) {
    if (normalizeDrawingTool(state.activeTool) !== "cursor") return;

    const hit = hitTestDrawingAtPoint(getLocalPoint(event));
    if (!hit) return;

    const drawing = getDrawingById(hit.id);
    if (!drawing) return;

    event.preventDefault();
    event.stopPropagation();

    state.selectedDrawingId = hit.id;
    renderDrawings();
    openDrawingSettings(drawing);
  }

  function scheduleDrawingCrosshairRender(forceClear) {
    if (!forceClear && !shouldDrawManualCrosshair()) return;
    if (crosshairRaf) return;
    crosshairRaf = requestAnimationFrame(function () {
      crosshairRaf = null;
      renderDrawings();
    });
  }

  function setManualCrosshairFromEvent(event) {
    if (!shouldDrawManualCrosshair()) return false;
    const resolved = pointFromEvent(event);
    if (!resolved) return false;

    state.crosshairPoint = resolved.point;
    state.crosshairValue = resolved.value;
    scheduleDrawingCrosshairRender();
    return true;
  }

  function updateDrawingCrosshairFromPointer(event) {
    if (!event || priceAxisDrag || drawingDrag) return;
    if (!shouldDrawManualCrosshair()) return;
    setManualCrosshairFromEvent(event);
  }

  function updateMobileCrosshairFromTouch(event) {
    if (!event || !isMobileViewport() || drawingDrag) return;

    // 모바일 Lightweight Charts는 터치 중 기본 가격/시간 라벨이 잘 안 뜨는 경우가 있어
    // 커서(십자선) 상태에서는 SVG 레이어에 직접 좌표 배지를 그린다.
    if (normalizeDrawingTool(state.activeTool) !== "cursor" && !state.tempDrawing) return;

    setManualCrosshairFromEvent(event);
  }



  function installManualAutoscaleProvider() {
    if (manualAutoscaleProviderReady || !candleSeries || typeof candleSeries.applyOptions !== "function") return;
    manualAutoscaleProviderReady = true;
    try {
      candleSeries.applyOptions({
        autoscaleInfoProvider: function (baseImplementation) {
          if (manualMainPriceRange &&
              Number.isFinite(Number(manualMainPriceRange.from)) &&
              Number.isFinite(Number(manualMainPriceRange.to)) &&
              Number(manualMainPriceRange.to) > Number(manualMainPriceRange.from)) {
            return {
              priceRange: {
                minValue: Number(manualMainPriceRange.from),
                maxValue: Number(manualMainPriceRange.to),
              },
            };
          }

          try {
            return typeof baseImplementation === "function" ? baseImplementation() : null;
          } catch (e) {
            return null;
          }
        },
      });
    } catch (e) {}
  }

  function resetManualMainPriceRange(render) {
    manualMainPriceRange = null;
    try {
      const priceScale = getPrimaryPriceScale();
      if (priceScale && typeof priceScale.applyOptions === "function") {
        priceScale.applyOptions({ autoScale: true });
      }
    } catch (e) {}
    if (render !== false) renderDrawings();
  }

  function getPrimaryPriceScale() {
    try {
      if (candleSeries && typeof candleSeries.priceScale === "function") return candleSeries.priceScale();
    } catch (e) {}
    try {
      if (chart && typeof chart.priceScale === "function") return chart.priceScale("right");
    } catch (e) {}
    return null;
  }

  function getVisibleRowsForPriceRange() {
    const rows = state.rows || [];
    if (!rows.length) return rows;

    let from = 0;
    let to = rows.length - 1;

    try {
      const range = chart.timeScale().getVisibleLogicalRange && chart.timeScale().getVisibleLogicalRange();
      if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to))) {
        from = Math.max(0, Math.floor(Number(range.from)) - 3);
        to = Math.min(rows.length - 1, Math.ceil(Number(range.to)) + 3);
      }
    } catch (e) {}

    return rows.slice(from, to + 1).filter(Boolean);
  }

  function getCurrentVisiblePriceRange() {
    if (manualMainPriceRange && Number.isFinite(Number(manualMainPriceRange.from)) && Number.isFinite(Number(manualMainPriceRange.to)) && Number(manualMainPriceRange.to) > Number(manualMainPriceRange.from)) {
      return { from: Number(manualMainPriceRange.from), to: Number(manualMainPriceRange.to) };
    }

    const priceScale = getPrimaryPriceScale();

    try {
      if (priceScale && typeof priceScale.getVisibleRange === "function") {
        const range = priceScale.getVisibleRange();
        if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to)) && Number(range.to) > Number(range.from)) {
          return { from: Number(range.from), to: Number(range.to) };
        }
      }
    } catch (e) {}

    // 가격축을 처음 클릭할 때 한 번 튀는 문제를 줄이기 위해,
    // 데이터 기반 추정치보다 화면 좌표 기반 현재 가격 범위를 먼저 사용한다.
    // LightweightCharts 버전에 따라 priceScale.getVisibleRange가 없거나 늦게 반영될 수 있다.
    try {
      const h = Math.max(1, getMainPaneHeight() || chartEl.clientHeight || chartWrap.clientHeight || 1);
      if (candleSeries && typeof candleSeries.coordinateToPrice === "function") {
        const topPrice = candleSeries.coordinateToPrice(0);
        const bottomPrice = candleSeries.coordinateToPrice(h);
        const from = Math.min(Number(topPrice), Number(bottomPrice));
        const to = Math.max(Number(topPrice), Number(bottomPrice));
        if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
          return { from, to };
        }
      }
    } catch (e) {}

    const rows = getVisibleRowsForPriceRange();
    let min = Infinity;
    let max = -Infinity;

    rows.forEach(function (row) {
      const low = Number(row.low);
      const high = Number(row.high);
      if (Number.isFinite(low)) min = Math.min(min, low);
      if (Number.isFinite(high)) max = Math.max(max, high);
    });

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      const last = rows.length ? Number(rows[rows.length - 1].close) : 100;
      min = last * 0.92;
      max = last * 1.08;
    }

    const pad = Math.max((max - min) * 0.10, Math.abs(max) * 0.002, 1);
    return { from: min - pad, to: max + pad };
  }

  function isPriceAxisOverlayTarget(target) {
    return !!(target && target.closest && target.closest(".bv-price-axis-drag-overlay"));
  }

  function isPriceAxisPointer(event) {
    if (!event || !chartWrap || !chartEl) return false;
    if (normalizeDrawingTool(state.activeTool) !== "cursor" || drawingDrag) return false;

    if (isPriceAxisOverlayTarget(event.target)) return true;

    if (event.target && event.target.closest && event.target.closest("button, a, input, select, textarea, .tv-interval-dropdown, .bv-drawing-toolbar, .indicator-panel, .group-panel, .my-stock-panel, .mobile-watchlist-panel")) return false;

    const rect = chartEl.getBoundingClientRect();
    // LightweightCharts 내부 DOM 구조에 따라 price scale 영역이 chartEl 밖으로 잡히거나
    // 캔버스 위에 겹쳐 잡힐 수 있어 오른쪽 끝 76px를 명확한 Y축 조작 영역으로 본다.
    const axisWidth = Math.max(64, Math.min(92, rect.width * 0.075));
    return event.clientX >= rect.right - axisWidth && event.clientX <= rect.right + 12 && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function getVisibleLogicalRangeSafe() {
    try {
      const range = chart.timeScale().getVisibleLogicalRange && chart.timeScale().getVisibleLogicalRange();
      if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to))) {
        return { from: Number(range.from), to: Number(range.to) };
      }
    } catch (e) {}
    return null;
  }

  function setVisibleLogicalRangeSafe(range) {
    if (!range || !Number.isFinite(Number(range.from)) || !Number.isFinite(Number(range.to)) || Number(range.to) <= Number(range.from)) return false;
    try {
      chart.timeScale().setVisibleLogicalRange({ from: Number(range.from), to: Number(range.to) });
      return true;
    } catch (e) {}
    return false;
  }

  function forceChartRedrawKeepingTimeRange(range) {
    const fixedRange = range || getVisibleLogicalRangeSafe();
    if (fixedRange) {
      requestAnimationFrame(function () {
        setVisibleLogicalRangeSafe(fixedRange);
        renderDrawings();
      });
    } else {
      requestAnimationFrame(requestDrawingRender);
    }
  }

  function applyPriceAxisVisibleRange(range, keepLogicalRange, options) {
    options = options || {};
    if (!range || !Number.isFinite(Number(range.from)) || !Number.isFinite(Number(range.to)) || Number(range.to) <= Number(range.from)) return false;

    manualMainPriceRange = {
      from: Number(range.from),
      to: Number(range.to),
    };

    installManualAutoscaleProvider();

    const priceScale = getPrimaryPriceScale();
    try {
      if (priceScale && typeof priceScale.applyOptions === "function") priceScale.applyOptions({ autoScale: false });
    } catch (e) {}

    try {
      if (priceScale && typeof priceScale.setVisibleRange === "function") {
        priceScale.setVisibleRange({ from: manualMainPriceRange.from, to: manualMainPriceRange.to });
      }
    } catch (e) {}

    // 차트 본문 드래그에서는 LightweightCharts의 기본 X축 팬을 그대로 살려야 하므로
    // logical range를 다시 고정하지 않는다. Y축 전용 조작일 때만 X축을 잠근다.
    if (options.keepX && keepLogicalRange) {
      if (options.render === false) {
        setVisibleLogicalRangeSafe(keepLogicalRange);
      } else {
        forceChartRedrawKeepingTimeRange(keepLogicalRange);
      }
    } else if (options.render !== false) {
      requestAnimationFrame(requestDrawingRender);
    }

    return true;
  }

  function handlePriceAxisPointerDown(event) {
    if (!isPriceAxisPointer(event)) return;

    const startRange = getCurrentVisiblePriceRange();
    if (!startRange) return;

    const logicalRange = getVisibleLogicalRangeSafe();

    priceAxisDrag = {
      pointerId: event.pointerId,
      startY: Number(event.clientY),
      range: startRange,
      logicalRange: logicalRange,
      lastDy: 0,
    };

    // 첫 move에서 자동 스케일 → 수동 스케일로 전환되며 점프하지 않도록
    // pointerdown 시점의 화면 기준 가격 범위를 먼저 고정한다.
    applyPriceAxisVisibleRange(startRange, logicalRange, { keepX: true, render: false });
    if (logicalRange) setVisibleLogicalRangeSafe(logicalRange);

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    document.documentElement.classList.add("bitgak-y-axis-scaling");
    chart.applyOptions({ handleScroll: false, handleScale: false });

    try {
      const captureTarget = isPriceAxisOverlayTarget(event.target) && priceAxisDragOverlay ? priceAxisDragOverlay : chartWrap;
      captureTarget.setPointerCapture(event.pointerId);
    } catch (e) {}
  }

  function flushPriceAxisScaleFrame() {
    priceAxisRaf = null;
    if (!priceAxisDrag || !priceAxisPendingRange) return;
    const logicalRange = priceAxisDrag.logicalRange;
    applyPriceAxisVisibleRange(priceAxisPendingRange, logicalRange, { keepX: true, render: false });
    if (logicalRange) setVisibleLogicalRangeSafe(logicalRange);
    requestDrawingRender();
  }

  function schedulePriceAxisScale(range) {
    priceAxisPendingRange = range;
    if (priceAxisRaf) return;
    priceAxisRaf = requestAnimationFrame(flushPriceAxisScaleFrame);
  }

  function handlePriceAxisPointerMove(event) {
    if (!priceAxisDrag) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    const dy = Number(event.clientY) - Number(priceAxisDrag.startY);
    // 미세 떨림은 무시하고, 큰 이동만 부드럽게 반영한다.
    if (Math.abs(dy - Number(priceAxisDrag.lastDy || 0)) < 0.65) return;
    priceAxisDrag.lastDy = dy;
    schedulePriceAxisScale(scalePriceRangeByPixels(priceAxisDrag.range, dy));
  }

  function finishPriceAxisPointerDrag(event) {
    if (!priceAxisDrag) return;

    event && event.preventDefault && event.preventDefault();
    event && event.stopPropagation && event.stopPropagation();
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    try {
      if (priceAxisDragOverlay && priceAxisDragOverlay.hasPointerCapture && priceAxisDragOverlay.hasPointerCapture(priceAxisDrag.pointerId)) {
        priceAxisDragOverlay.releasePointerCapture(priceAxisDrag.pointerId);
      } else {
        chartWrap.releasePointerCapture(priceAxisDrag.pointerId);
      }
    } catch (e) {}
    if (priceAxisRaf) cancelAnimationFrame(priceAxisRaf);
    priceAxisRaf = null;
    priceAxisPendingRange = null;
    priceAxisDrag = null;
    document.documentElement.classList.remove("bitgak-y-axis-scaling");
    chart.applyOptions(normalChartInteractionOptions());
    renderDrawings();
  }

  function handlePriceAxisDoubleClick(event) {
    if (!isPriceAxisPointer(event)) return;

    event.preventDefault();
    event.stopPropagation();
    resetManualMainPriceRange(true);
  }


  function isPrimaryLeftMouseDrag(event) {
    if (!event) return false;
    if (event.pointerType === "touch") return false;
    if (event.button !== undefined && event.button !== 0) return false;
    if (event.buttons !== undefined && event.buttons !== 1) return false;
    return true;
  }

  function isChartControlTarget(target) {
    return !!(target && target.closest && target.closest(
      "button, a, input, select, textarea, label, " +
      ".tv-interval-dropdown, .bv-drawing-toolbar, .indicator-panel, .group-panel, .my-stock-panel, .mobile-watchlist-panel, " +
      ".bv-tool-drawer, .bv-symbol-panel, .bv-header, .stock-search-panel, .bv-drawing-settings-modal, .bv-drawing-color-palette"
    ));
  }

  function shouldStartChartBodyPan(event) {
    if (!isPrimaryLeftMouseDrag(event)) return false;
    if (normalizeDrawingTool(state.activeTool) !== "cursor" || drawingDrag || priceAxisDrag) return false;
    if (isChartControlTarget(event.target)) return false;
    if (isPriceAxisPointer(event)) return false;

    const rect = chartEl.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return false;
    if (!isClientPointInsideMainPane(event)) return false;

    const hit = hitTestDrawingAtPoint(getLocalPoint(event));
    if (hit && hit.isHandle) return false;

    return true;
  }

  function shiftPriceRangeByPixels(startRange, dy) {
    const height = Math.max(1, getMainPaneHeight() || chartEl.clientHeight || chartWrap.clientHeight || 1);
    const span = Math.max(1, Number(startRange.to) - Number(startRange.from));

    // TradingView style: 마우스를 위로 끌면 캔들도 위로 따라 올라가야 하므로
    // 가격 범위를 같은 방향으로 이동시킨다. dy<0이면 range도 내려간다.
    const shift = Number(dy || 0) * (span / height);
    return {
      from: Number(startRange.from) + shift,
      to: Number(startRange.to) + shift,
    };
  }

  function scalePriceRangeByPixels(startRange, dy) {
    const center = (Number(startRange.from) + Number(startRange.to)) / 2;
    const half = Math.max((Number(startRange.to) - Number(startRange.from)) / 2, 1);
    // Y축 스케일은 너무 빠르면 한 번 튀는 느낌이 나므로 부드럽게 조정한다.
    const factor = Math.max(0.42, Math.min(2.65, Math.exp(Number(dy || 0) * 0.00215)));
    const nextHalf = half * factor;
    return { from: center - nextHalf, to: center + nextHalf };
  }

  function handleChartBodyPanPointerDown(event) {
    if (!shouldStartChartBodyPan(event)) return;

    const startPoint = getClampedMainPaneClientPoint(event);

    const startLogicalRange = getVisibleLogicalRangeSafe();
    const referenceLogical = startLogicalRange && Number.isFinite(Number(startLogicalRange.to)) ? Number(startLogicalRange.to) : null;
    const referenceX = Number.isFinite(Number(referenceLogical)) ? logicalToCoordinateSafe(referenceLogical) : null;

    chartBodyPanDrag = {
      pointerId: event.pointerId,
      startX: startPoint.x,
      startY: startPoint.y,
      lastX: startPoint.x,
      lastY: startPoint.y,
      range: getCurrentVisiblePriceRange(),
      startLogicalRange: startLogicalRange,
      referenceLogical: referenceLogical,
      referenceX: referenceX,
      currentLiveDx: 0,
      lastAppliedDy: 0,
      axisLock: null,
      liveTransform: true,
    };

    chartBodyPanPendingRange = null;
    drawingRenderDeferred = false;
    clearDrawingLayerLiveTransform();
    document.documentElement.classList.add("bitgak-chart-body-panning");
    if (chartWrap) chartWrap.classList.add("is-live-panning");

    // 포인터가 차트 영역 밖으로 살짝 나가도 좌표가 튀지 않도록 chartWrap이 포인터를 계속 잡는다.
    try { if (chartWrap && chartWrap.setPointerCapture) chartWrap.setPointerCapture(event.pointerId); } catch (e) {}
    // preventDefault/stopPropagation을 하지 않는다. LightweightCharts 기본 X축 팬은 그대로 살리고,
    // 여기서는 Y축 위치 이동만 추가한다.
  }

  function flushChartBodyPanFrame() {
    chartBodyPanRaf = null;
    if (!chartBodyPanDrag || !chartBodyPanPendingRange) return;

    // 좌우 이동은 LightweightCharts 기본 팬이 처리한다.
    // 세로 이동은 가격 범위만 바꾸고 SVG는 메인 차트 안에서 즉시 재계산한다.
    // SVG 레이어 자체를 Y축으로 이동시키면 RSI/거래량 영역으로 침범한다.
    applyPriceAxisVisibleRange(chartBodyPanPendingRange, null, { keepX: false, render: false });
    if (chartBodyPanDrag.axisLock === "vertical") {
      renderDrawings();
    }
  }

  function scheduleChartBodyPanRange(range) {
    chartBodyPanPendingRange = range;
    if (chartBodyPanRaf) return;
    chartBodyPanRaf = requestAnimationFrame(flushChartBodyPanFrame);
  }

  function handleChartBodyPanPointerMove(event) {
    if (!chartBodyPanDrag || event.pointerId !== chartBodyPanDrag.pointerId) return;
    if (event.buttons !== undefined && event.buttons !== 1) {
      finishChartBodyPan(event);
      return;
    }

    const rawClient = getEventClientPoint(event);
    const point = getStableChartBodyPanPoint(event);
    const eventKey = [event.timeStamp, rawClient && rawClient.x, rawClient && rawClient.y, event.buttons].join(":");
    if (chartBodyPanDrag.lastMoveEventKey === eventKey) return;
    chartBodyPanDrag.lastMoveEventKey = eventKey;

    chartBodyPanDrag.lastX = point.x;
    chartBodyPanDrag.lastY = point.y;

    const dx = Number(point.x) - Number(chartBodyPanDrag.startX);
    const dy = Number(point.y) - Number(chartBodyPanDrag.startY);
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // 방향 잠금 강화:
    // - 기본 차트 이동은 대부분 좌우 팬이므로 수평을 우선한다.
    // - 세로 이동은 거의 수직으로 크게 끌 때만 작동하게 해서, 차트 밖으로 나갈 때의 Y 점프를 막는다.
    if (!chartBodyPanDrag.axisLock) {
      if (absX >= 6 && absX >= absY * 0.55) {
        chartBodyPanDrag.axisLock = "horizontal";
      } else if (absY >= 34 && absY > absX * 2.8) {
        chartBodyPanDrag.axisLock = "vertical";
      } else if (Math.max(absX, absY) >= 14) {
        chartBodyPanDrag.axisLock = "horizontal";
      }
    }

    if (chartBodyPanDrag.axisLock === "vertical") {
      clearDrawingLayerLiveTransform();
      if (Math.abs(dy - Number(chartBodyPanDrag.lastAppliedDy || 0)) >= 1.2) {
        chartBodyPanDrag.lastAppliedDy = dy;
        scheduleChartBodyPanRange(shiftPriceRangeByPixels(chartBodyPanDrag.range, dy));
      }
      return;
    }

    // 수평 팬에서는 X축만 임시 이동한다. Y축은 절대 이동하지 않아 보조지표로 넘치지 않는다.
    // 즉시 pointer dx로 따라가게 하고, 다음 프레임에 실제 timeScale 이동량으로 보정한다.
    scheduleDrawingLivePanSync(dx);
  }

  function finishChartBodyPan(event) {
    if (!chartBodyPanDrag) return;
    if (chartBodyPanRaf) cancelAnimationFrame(chartBodyPanRaf);
    chartBodyPanRaf = null;
    if (livePanSyncRaf) cancelAnimationFrame(livePanSyncRaf);
    livePanSyncRaf = null;

    // 마지막 대기 중인 Y축 이동 범위를 먼저 차트에 반영한다.
    if (chartBodyPanPendingRange) {
      applyPriceAxisVisibleRange(chartBodyPanPendingRange, null, { keepX: false, render: false });
    }

    try {
      if (chartWrap && chartBodyPanDrag && chartWrap.hasPointerCapture && chartWrap.hasPointerCapture(chartBodyPanDrag.pointerId)) {
        chartWrap.releasePointerCapture(chartBodyPanDrag.pointerId);
      }
    } catch (e) {}

    chartBodyPanPendingRange = null;
    chartBodyPanDrag = null;
    document.documentElement.classList.remove("bitgak-chart-body-panning");
    if (chartWrap) chartWrap.classList.remove("is-live-panning");
    drawingRenderDeferred = false;

    // 새 차트 좌표 기준으로 SVG를 다시 계산한다.
    // transform을 먼저 제거하고 같은 프레임에서 다시 그려 종료 순간의 이중 이동/깜빡임을 줄인다.
    clearDrawingLayerLiveTransform();
    renderDrawings();
    requestAnimationFrame(renderDrawings);
  }

  function processDrawingToolTap(event) {
    const active = normalizeDrawingTool(state.activeTool);
    if (active === "cursor") return false;

    const resolved = pointFromEvent(event);
    if (!resolved) return false;
    const value = resolved.value;

    event.preventDefault();
    event.stopPropagation();

    if (active === "hline") {
      completeDrawing({ id: makeDrawingId("hline"), type: "hline", start: value });
      return true;
    }

    if (active === "vline") {
      completeDrawing({ id: makeDrawingId("vline"), type: "vline", start: value });
      return true;
    }

    if (active === "trend" || active === "extend" || active === "circle") {
      if (!state.tempDrawing || state.tempDrawing.type !== active) {
        state.tempDrawing = normalizeDrawing({ id: makeDrawingId(active), type: active, start: value, end: value });
        state.isDrawing = true;
        state.startPoint = value;
        renderDrawings();
        return true;
      }

      state.tempDrawing.end = value;
      completeDrawing(state.tempDrawing);
      return true;
    }

    if (active === "fibo") {
      if (!state.tempDrawing || state.tempDrawing.type !== "fibo") {
        state.tempDrawing = normalizeDrawing({ id: makeDrawingId("fibo"), type: "fibo", start: value, end: value, third: null });
        state.fiboStage = 1;
        state.isDrawing = true;
        state.startPoint = value;
        renderDrawings();
        return true;
      }

      if (state.fiboStage === 1) {
        state.tempDrawing.end = value;
        state.fiboStage = 2;
        renderDrawings();
        return true;
      }

      state.tempDrawing.third = value;
      completeDrawing(state.tempDrawing);
      return true;
    }

    return false;
  }

  function clonePointerEventForChart(event, type) {
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      isPrimary: event.isPrimary !== false,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      pageX: event.pageX,
      pageY: event.pageY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      pressure: event.pressure || 0,
      width: event.width || 1,
      height: event.height || 1,
    };
    try { return new PointerEvent(type || event.type, common); }
    catch (e) { return new MouseEvent(type || event.type.replace("pointer", "mouse"), common); }
  }

  function cleanupDrawingPassThrough() {
    if (!drawingPassThrough) return;
    drawingLayer.style.pointerEvents = drawingPassThrough.previousPointerEvents || "";
    drawingPassThrough = null;
    window.removeEventListener("pointerup", cleanupDrawingPassThrough, true);
    window.removeEventListener("pointercancel", cleanupDrawingPassThrough, true);
  }

  function startChartPassThrough(event) {
    if (drawingPassThrough || normalizeDrawingTool(state.activeTool) !== "cursor") return false;

    const previousPointerEvents = drawingLayer.style.pointerEvents;
    drawingLayer.style.pointerEvents = "none";

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === drawingLayer || drawingLayer.contains(target)) {
      drawingLayer.style.pointerEvents = previousPointerEvents;
      return false;
    }

    drawingPassThrough = { previousPointerEvents: previousPointerEvents };
    window.addEventListener("pointerup", cleanupDrawingPassThrough, true);
    window.addEventListener("pointercancel", cleanupDrawingPassThrough, true);

    try { target.dispatchEvent(clonePointerEventForChart(event, "pointerdown")); } catch (e) {}
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleDrawingClick(event) {
    if (isNativeClickFromHandledDrawingPointerTap(event)) return;
    if (suppressClickAfterDrag) {
      suppressClickAfterDrag = false;
      return;
    }
    if (suppressNextDrawingClick) {
      suppressNextDrawingClick = false;
      return;
    }

    const active = normalizeDrawingTool(state.activeTool);
    const target = getDrawingEventTarget(event);

    if (active !== "cursor") {
      processDrawingToolTap(event);
      return;
    }

    if (target && target.getAttribute("data-drawing-id")) {
      const id = target.getAttribute("data-drawing-id");
      const drawing = getDrawingById(id);
      const now = Date.now();
      const isDoubleTap = lastDrawingClick.id === id && (now - lastDrawingClick.time) < 430;

      state.selectedDrawingId = id;
      renderDrawings();

      event.preventDefault();
      event.stopPropagation();

      if ((event.detail >= 2 || isDoubleTap) && drawing) {
        lastDrawingClick = { id: null, time: 0 };
        openDrawingSettings(drawing);
        return;
      }

      lastDrawingClick = { id: id, time: now };
      return;
    }

    state.selectedDrawingId = null;
    renderDrawings();
  }

  function handleDrawingMove(event) {
    const active = normalizeDrawingTool(state.activeTool);
    const target = getDrawingEventTarget(event);
    state.hoverDrawingId = target ? target.getAttribute("data-drawing-id") : null;

    const resolved = pointFromEvent(event);
    if (resolved) {
      state.crosshairPoint = resolved.point;
      state.crosshairValue = resolved.value;
    }

    if (active === "cursor") {
      const hit = hitTestDrawingEvent(event);
      drawingLayer.style.cursor = hit && hit.isHandle ? "grab" : "default";
    } else {
      drawingLayer.style.cursor = "crosshair";
    }

    if (drawingDrag) return;

    if (state.tempDrawing && resolved) {
      if (state.tempDrawing.type === "fibo" && state.fiboStage === 2) state.tempDrawing.third = resolved.value;
      else state.tempDrawing.end = resolved.value;
      renderDrawings();
      return;
    }

    if (["hline", "vline", "trend", "extend", "circle", "fibo"].includes(active)) {
      renderDrawings();
    }
  }

  function handleDrawingPointerDown(event) {
    const active = normalizeDrawingTool(state.activeTool);

    if (active !== "cursor") {
      drawingPointerCandidate = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      try { drawingLayer.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const hit = hitTestDrawingEvent(event);
    // 일반 선 위에서는 차트 이동을 막지 않는다. 선택된 핸들만 직접 드래그 편집한다.
    if (!hit || !hit.id || !hit.isHandle) return;

    beginDrawingDrag(event, hit);
  }

  function movedValueFromOriginal(value, dx, dy) {
    const p = valueToPoint(value);
    if (!p) return value;
    const moved = pointToChartValue({ x: p.x + dx, y: p.y + dy });
    return moved || value;
  }

  function handleDrawingDragMove(event) {
    if (!drawingDrag) return;
    event.preventDefault();
    event.stopPropagation();

    const drawing = getDrawingById(drawingDrag.id);
    if (!drawing) return;

    const dx = event.clientX - drawingDrag.startClientX;
    const dy = event.clientY - drawingDrag.startClientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drawingDrag.moved = true;

    const original = drawingDrag.original;
    const role = drawingDrag.role || "body";

    function moveOnePoint(key) {
      if (!original[key]) return;
      drawing[key] = movedValueFromOriginal(original[key], dx, dy);
    }

    if (role === "start" || role === "end" || role === "third") {
      if (drawing.type === "hline") {
        const p = valueToPoint(original.start);
        if (p) drawing.start = Object.assign({}, drawing.start, { price: candleSeries.coordinateToPrice(p.y + dy) || drawing.start.price });
      } else if (drawing.type === "vline") {
        const p = valueToPoint(original.start);
        if (p) {
          const moved = pointToChartValue({ x: p.x + dx, y: p.y });
          if (moved) drawing.start = Object.assign({}, drawing.start, moved, { price: drawing.start.price });
        }
      } else {
        moveOnePoint(role);
      }
    } else if (drawing.type === "hline") {
      const p = valueToPoint(original.start);
      if (p) drawing.start = Object.assign({}, drawing.start, { price: candleSeries.coordinateToPrice(p.y + dy) || drawing.start.price });
    } else if (drawing.type === "vline") {
      const p = valueToPoint(original.start);
      if (p) {
        const moved = pointToChartValue({ x: p.x + dx, y: p.y });
        if (moved) drawing.start = Object.assign({}, drawing.start, moved, { price: drawing.start.price });
      }
    } else {
      drawing.start = movedValueFromOriginal(original.start, dx, dy);
      drawing.end = movedValueFromOriginal(original.end, dx, dy);
      if (original.third) drawing.third = movedValueFromOriginal(original.third, dx, dy);
    }

    renderDrawings();
  }

  function handleDrawingPointerUp(event) {
    if (!drawingDrag && drawingPointerCandidate && normalizeDrawingTool(state.activeTool) !== "cursor") {
      if (event.pointerId !== undefined && drawingPointerCandidate.pointerId !== undefined && event.pointerId !== drawingPointerCandidate.pointerId) return;

      const dx = event.clientX - drawingPointerCandidate.startClientX;
      const dy = event.clientY - drawingPointerCandidate.startClientY;
      const isTap = Math.hypot(dx, dy) < 12;
      try { drawingLayer.releasePointerCapture(drawingPointerCandidate.pointerId); } catch (e) {}
      drawingPointerCandidate = null;

      event.preventDefault();
      event.stopPropagation();

      if (isTap) {
        if (processDrawingToolTap(event)) rememberHandledDrawingPointerTap(event);
        return;
      }

      // 첫 점이 이미 잡혀 있는 상태에서 드래그 후 놓으면 현재 단계만 확정한다.
      // 추세선/연장선/원형은 완성, 피보나치는 1단계면 기준선 고정, 2단계면 채널 완성이다.
      if (state.tempDrawing) {
        if (processDrawingToolTap(event)) rememberHandledDrawingPointerTap(event);
      }
      return;
    }

    if (!drawingDrag) return;
    event.preventDefault();
    event.stopPropagation();
    try { drawingLayer.releasePointerCapture(drawingDrag.pointerId); } catch (e) {}
    try { chartWrap.releasePointerCapture(drawingDrag.pointerId); } catch (e) {}
    suppressClickAfterDrag = !!drawingDrag.moved;
    drawingDrag = null;
    saveDrawingsToStorage();
    if (normalizeDrawingTool(state.activeTool) === "cursor") chart.applyOptions(normalChartInteractionOptions());
    renderDrawings();
  }

  function rowIndexByTime(time) {
    const rows = state.rows || [];
    const key = String(normalizeTime(time));
    let found = rows.findIndex(function (row) { return String(normalizeTime(row.time)) === key; });
    if (found >= 0) return found;
    const x = chart.timeScale().timeToCoordinate(time);
    if (x === null || x === undefined) return -1;
    let best = -1;
    let bestDist = Infinity;
    rows.forEach(function (row, index) {
      const rx = chart.timeScale().timeToCoordinate(row.time);
      if (rx === null || rx === undefined) return;
      const dist = Math.abs(rx - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return best;
  }

  function shiftTimeByRows(time, step) {
    const rows = state.rows || [];
    if (!rows.length) return time;
    const index = rowIndexByTime(time);
    if (index < 0) return time;
    const next = Math.max(0, Math.min(rows.length - 1, index + step));
    return rows[next].time;
  }

  function nudgeValue(value, timeStep, priceStep) {
    if (!value) return value;
    const next = Object.assign({}, value);

    if (timeStep) {
      next.time = shiftTimeByRows(next.time, timeStep);
      const row = findRowByTime(next.time) || findBestRowForDrawingValue(next);
      if (row) {
        next.source_time = row.source_time || row.display_time || row.time;
        next.display_time = row.display_time || normalizeTimeForDisplay(row.time);
        next.date_key = dateKeyFromAny(next.source_time || next.display_time || next.time);
        next.interval = state.interval;
      }
    }

    if (priceStep) next.price = Number(next.price || 0) + priceStep;
    return next;
  }

  function nudgeSelectedDrawing(key) {
    if (!state.selectedDrawingId) return false;
    const drawing = getDrawingById(state.selectedDrawingId);
    if (!drawing) return false;

    let timeStep = 0;
    let priceStep = 0;
    if (key === "ArrowLeft") timeStep = -1;
    if (key === "ArrowRight") timeStep = 1;
    if (key === "ArrowUp") priceStep = 0.5;
    if (key === "ArrowDown") priceStep = -0.5;
    if (!timeStep && !priceStep) return false;

    pushDrawingHistory();

    if (drawing.type === "hline") {
      if (priceStep) drawing.start = nudgeValue(drawing.start, 0, priceStep);
    } else if (drawing.type === "vline") {
      if (timeStep) drawing.start = nudgeValue(drawing.start, timeStep, 0);
    } else {
      drawing.start = nudgeValue(drawing.start, timeStep, priceStep);
      drawing.end = nudgeValue(drawing.end, timeStep, priceStep);
      if (drawing.third) drawing.third = nudgeValue(drawing.third, timeStep, priceStep);
    }

    saveDrawingsToStorage();
    renderDrawings();
    return true;
  }

  function handleDrawingContextMenu(event) {
    const target = getDrawingEventTarget(event);
    const id = target ? target.getAttribute("data-drawing-id") : null;
    if (!id) return;

    const drawing = getDrawingById(id);
    if (!drawing) return;

    event.preventDefault();
    event.stopPropagation();
    state.selectedDrawingId = id;
    renderDrawings();
    openDrawingSettings(drawing);
  }

  function handleDrawingDoubleClick(event) {
    const target = getDrawingEventTarget(event);
    const id = target ? target.getAttribute("data-drawing-id") : state.selectedDrawingId;
    if (!id) return;

    const drawing = getDrawingById(id);
    if (!drawing) return;

    event.preventDefault();
    event.stopPropagation();
    state.selectedDrawingId = id;
    lastDrawingClick = { id: null, time: 0 };
    renderDrawings();
    openDrawingSettings(drawing);
  }

  function drawingColorButton(id, label, value) {
    const color = normalizeDrawingColor(value, "#1d4ed8");
    return `
      <div class="bv-drawing-setting-field">
        <span>${escapeDrawingHtml(label)}</span>
        <button type="button" class="bv-drawing-color-button" data-drawing-color-button data-target="${escapeDrawingHtml(id)}" style="--draw-color:${escapeDrawingHtml(color)}"></button>
        <input id="${escapeDrawingHtml(id)}" type="hidden" value="${escapeDrawingHtml(color)}">
      </div>`;
  }

  function fiboLevelRowHtml(item, index) {
    const id = "drawFiboColor_" + index;
    const color = normalizeDrawingColor(item.color, "#1d4ed8");
    return `
      <div class="bv-fibo-level-row" data-fibo-level-row>
        <input class="bv-fibo-level-check" type="checkbox" data-fibo-enabled ${item.enabled !== false ? "checked" : ""} title="표시">
        <input class="bv-fibo-level-value" type="number" step="0.5" data-fibo-value value="${escapeDrawingHtml(item.value)}" title="레벨 값">
        <button type="button" class="bv-fibo-level-color" data-drawing-color-button data-target="${escapeDrawingHtml(id)}" style="--draw-color:${escapeDrawingHtml(color)}" title="색상 선택"></button>
        <input id="${escapeDrawingHtml(id)}" data-fibo-color type="hidden" value="${escapeDrawingHtml(color)}">
      </div>`;
  }

  function openDrawingPalette(button) {
    closeDrawingPalette();
    const targetId = button.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;

    const palette = document.createElement("div");
    palette.className = "bv-drawing-color-palette";
    palette.innerHTML = `
      <strong>색상 선택</strong>
      <div class="bv-drawing-color-grid">
        ${DRAWING_PALETTE_COLORS.map(function (color) {
          const active = String(input.value).toLowerCase() === color.toLowerCase();
          return `<button type="button" class="bv-drawing-color-dot ${active ? "active" : ""}" data-color="${escapeDrawingHtml(color)}" style="--dot-color:${escapeDrawingHtml(color)}"></button>`;
        }).join("")}
      </div>`;
    document.body.appendChild(palette);

    const rect = button.getBoundingClientRect();
    const width = 360;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left - 20));
    const top = Math.min(window.innerHeight - 360, Math.max(70, rect.bottom + 10));
    palette.style.left = left + "px";
    palette.style.top = top + "px";

    palette.addEventListener("click", function (event) {
      const dot = event.target.closest("[data-color]");
      if (!dot) return;
      input.value = dot.dataset.color;
      button.style.setProperty("--draw-color", dot.dataset.color);
      closeDrawingPalette();
    });
  }

  function closeDrawingPalette() {
    document.querySelectorAll(".bv-drawing-color-palette").forEach(function (el) { el.remove(); });
  }

  document.addEventListener("pointerdown", function (event) {
    if (event.target && event.target.closest && (event.target.closest(".bv-drawing-color-palette") || event.target.closest("[data-drawing-color-button]"))) return;
    closeDrawingPalette();
  }, true);

  function ensureDrawingSettingsModal() {
    if (drawingSettingsModal) return drawingSettingsModal;

    drawingSettingsModal = document.createElement("div");
    drawingSettingsModal.className = "bv-drawing-settings-modal";
    drawingSettingsModal.innerHTML = `
      <div class="bv-drawing-settings-panel">
        <div class="bv-drawing-settings-head">
          <strong id="drawingSettingsTitle">도구 설정</strong>
          <button type="button" data-close-drawing-settings>×</button>
        </div>
        <div class="bv-drawing-settings-body" id="drawingSettingsBody"></div>
        <div class="bv-drawing-settings-foot">
          <button type="button" class="ghost" data-close-drawing-settings>취소</button>
          <button type="button" class="primary" id="saveDrawingSettings">확인</button>
        </div>
      </div>`;
    document.body.appendChild(drawingSettingsModal);

    drawingSettingsModal.addEventListener("click", function (event) {
      if (event.target === drawingSettingsModal || event.target.closest("[data-close-drawing-settings]")) {
        closeDrawingSettings();
        return;
      }
      const colorBtn = event.target.closest("[data-drawing-color-button]");
      if (colorBtn) {
        event.preventDefault();
        event.stopPropagation();
        openDrawingPalette(colorBtn);
      }
    });

    drawingSettingsModal.querySelector("#saveDrawingSettings").addEventListener("click", applyDrawingSettings);
    return drawingSettingsModal;
  }

  function openDrawingSettings(drawing, options) {
    options = options || {};
    const defaultMode = !!options.defaultMode;
    const type = normalizeDrawingTool(options.toolType || (drawing && drawing.type) || "trend");
    const source = defaultMode
      ? Object.assign({ id: "default_" + type, type: type }, getEffectiveDrawingDefaults(type), drawing || {})
      : drawing;

    drawing = normalizeDrawing(source);
    if (!drawing) return;

    const modal = ensureDrawingSettingsModal();
    const body = modal.querySelector("#drawingSettingsBody");
    modal.querySelector("#drawingSettingsTitle").textContent = drawingTitle(type) + (defaultMode ? " 기본 속성" : " 설정");

    body.dataset.settingsMode = defaultMode ? "default" : "drawing";
    body.dataset.toolType = type;
    body.dataset.drawingId = defaultMode ? "" : drawing.id;

    const notice = defaultMode ? `
      <div class="bv-drawing-default-notice">
        오른쪽 버튼으로 연 기본 속성입니다. 저장하면 앞으로 새로 그리는 ${escapeDrawingHtml(drawingTitle(type))}에 계속 적용됩니다.
      </div>` : "";

    const extendFields = (type === "trend" || type === "extend" || type === "fibo") ? `
      <section class="bv-drawing-extend-section">
        <div class="bv-drawing-extend-head">
          <strong>익스텐드</strong>
          <span>선이 차트 밖까지 이어지는 방향</span>
        </div>
        <div class="bv-drawing-extend-grid">
          <label class="bv-drawing-extend-card ${drawing.extendLeft ? "checked" : ""}">
            <input id="drawExtendLeft" type="checkbox" ${drawing.extendLeft ? "checked" : ""}>
            <span class="bv-extend-icon left" aria-hidden="true"></span>
            <b>왼쪽</b>
          </label>
          <label class="bv-drawing-extend-card ${drawing.extendRight ? "checked" : ""}">
            <input id="drawExtendRight" type="checkbox" ${drawing.extendRight ? "checked" : ""}>
            <span class="bv-extend-icon right" aria-hidden="true"></span>
            <b>오른쪽</b>
          </label>
        </div>
      </section>` : "";

    const fiboRows = type === "fibo" ? normalizeFiboLevels(drawing, drawing.color).slice(0, 10) : [];
    const fiboFields = type === "fibo" ? `
      <section class="bv-fibo-level-section">
        <div class="bv-fibo-level-head">
          <strong>피보나치 레벨</strong>
          <span>표시 · 수치 · 색상</span>
        </div>
        <div class="bv-fibo-level-list">
          ${fiboRows.map(function (item, index) { return fiboLevelRowHtml(item, index); }).join("")}
        </div>
      </section>
      <label class="bv-drawing-setting-field"><span>배경 채우기</span><input id="drawFill" type="checkbox" ${drawing.fill !== false ? "checked" : ""}></label>
      <label class="bv-drawing-setting-field"><span>배경 투명도</span><input id="drawOpacity" type="number" min="0.02" max="0.85" step="0.01" value="${escapeDrawingHtml(drawing.opacity || 0.14)}"></label>` : "";

    const colorFields = type === "circle" ? `
      ${drawingColorButton("drawColor", "테두리 색", drawing.color)}
      ${drawingColorButton("drawFillColor", "채우기 색", drawing.fillColor || drawing.color)}
    ` : drawingColorButton("drawColor", "색상", drawing.color);

    const circleFields = type === "circle" ? `
      <label class="bv-drawing-setting-field"><span>채우기</span><input id="drawFill" type="checkbox" ${drawing.fill !== false ? "checked" : ""}></label>
      <label class="bv-drawing-setting-field"><span>채우기 투명도</span><input id="drawFillOpacity" type="number" min="0" max="0.95" step="0.01" value="${escapeDrawingHtml(drawing.fillOpacity !== undefined ? drawing.fillOpacity : 0.16)}"></label>
      <label class="bv-drawing-setting-field"><span>테두리 투명도</span><input id="drawBorderOpacity" type="number" min="0.05" max="1" step="0.05" value="${escapeDrawingHtml(drawing.borderOpacity !== undefined ? drawing.borderOpacity : 1)}"></label>
    ` : "";

    body.innerHTML = `
      ${notice}
      <div class="bv-drawing-setting-grid">
        ${colorFields}
        <label class="bv-drawing-setting-field"><span>선 굵기</span><select id="drawWidth"><option value="1">1px</option><option value="2">2px</option><option value="3">3px</option><option value="4">4px</option><option value="5">5px</option><option value="6">6px</option></select></label>
        ${extendFields}
        ${circleFields}
        ${fiboFields}
      </div>`;

    const widthEl = body.querySelector("#drawWidth");
    if (widthEl) widthEl.value = String(drawing.width || 2);
    modal.classList.add("open");
  }

  function closeDrawingSettings() {
    closeDrawingPalette();
    if (drawingSettingsModal) drawingSettingsModal.classList.remove("open");
  }

  function applyDrawingFormValues(drawing, body) {
    drawing.color = normalizeDrawingColor((body.querySelector("#drawColor") || {}).value, drawing.color);
    const fillColorEl = body.querySelector("#drawFillColor");
    if (fillColorEl) drawing.fillColor = normalizeDrawingColor(fillColorEl.value, drawing.fillColor || drawing.color);

    drawing.width = Math.min(6, Math.max(1, Number((body.querySelector("#drawWidth") || {}).value || drawing.width || 2)));

    const extendLeft = body.querySelector("#drawExtendLeft");
    const extendRight = body.querySelector("#drawExtendRight");
    if (extendLeft) drawing.extendLeft = !!extendLeft.checked;
    if (extendRight) drawing.extendRight = !!extendRight.checked;

    const fiboRows = body.querySelectorAll("[data-fibo-level-row]");
    if (fiboRows && fiboRows.length) {
      const fiboLevels = Array.from(fiboRows).map(function (row) {
        const value = Number((row.querySelector("[data-fibo-value]") || {}).value);
        const color = (row.querySelector("[data-fibo-color]") || {}).value || drawing.color;
        const enabled = !!((row.querySelector("[data-fibo-enabled]") || {}).checked);
        return Number.isFinite(value) ? { value: value, enabled: enabled, color: normalizeDrawingColor(color, drawing.color) } : null;
      }).filter(Boolean);
      drawing.fiboLevels = fiboLevels.length ? fiboLevels : cloneDefaultFiboLevels();
      drawing.levels = drawing.fiboLevels.filter(function (item) { return item.enabled !== false; }).map(function (item) { return item.value; });
    }

    const fillEl = body.querySelector("#drawFill");
    const opacityEl = body.querySelector("#drawOpacity");
    const fillOpacityEl = body.querySelector("#drawFillOpacity");
    const borderOpacityEl = body.querySelector("#drawBorderOpacity");
    if (fillEl) drawing.fill = !!fillEl.checked;
    if (opacityEl) drawing.opacity = Math.min(0.85, Math.max(0.02, Number(opacityEl.value || 0.14)));
    if (fillOpacityEl) drawing.fillOpacity = Math.min(0.95, Math.max(0, Number(fillOpacityEl.value || 0.16)));
    if (borderOpacityEl) drawing.borderOpacity = Math.min(1, Math.max(0.05, Number(borderOpacityEl.value || 1)));

    return drawing;
  }

  function applyDrawingSettings() {
    const modal = ensureDrawingSettingsModal();
    const body = modal.querySelector("#drawingSettingsBody");
    const mode = body.dataset.settingsMode || "drawing";
    const toolType = normalizeDrawingTool(body.dataset.toolType || "trend");

    if (mode === "default") {
      const draft = normalizeDrawing(Object.assign({ id: "default_" + toolType, type: toolType }, getEffectiveDrawingDefaults(toolType)));
      applyDrawingFormValues(draft, body);
      setDrawingToolDefault(toolType, draft);
      closeDrawingSettings();
      return;
    }

    const drawing = getDrawingById(body.dataset.drawingId);
    if (!drawing) return;

    pushDrawingHistory();
    applyDrawingFormValues(drawing, body);
    saveDrawingsToStorage();
    renderDrawings();
    closeDrawingSettings();
  }

  function svgIcon(name) {
    const icons = {
      cursor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
      trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 18 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="4" cy="18" r="2.1" fill="currentColor"/><circle cx="18" cy="6" r="2.1" fill="currentColor"/></svg>',
      extend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19.5 20.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M17 4.5h3.5V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 19.5H3.5V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      hline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
      vline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
      circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".35"/></svg>',
      fibo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 20 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13 19 1" stroke="currentColor" stroke-width="1.35" opacity=".48"/><path d="M6 22 22 10" stroke="currentColor" stroke-width="1.35" opacity=".48"/></svg>',
      undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12c1.4-4.2 5-6.4 9-5.6 4 .8 6.8 4.4 6.4 8.5-.4 4-3.8 7.1-7.9 7.1-2.7 0-5.2-1.3-6.7-3.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
      clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 4h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 11v5M14 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    };
    return icons[name] || icons.cursor;
  }

  function findDrawingToolbar() {
    return document.querySelector(".bv-drawing-toolbar") ||
      document.querySelector(".bv-left-tools") ||
      (document.querySelector("[data-tool]") ? document.querySelector("[data-tool]").parentElement : null);
  }

  function createToolbarButton(className, attrs, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className || "tool-btn";
    Object.keys(attrs || {}).forEach(function (key) { button.setAttribute(key, attrs[key]); });
    button.innerHTML = text || "";
    return button;
  }

  function ensureDrawingToolbarExtraButtons() {
    const toolbar = findDrawingToolbar();
    if (!toolbar) return;

    if (!toolbar.querySelector('[data-tool="circle"]')) {
      const circleBtn = createToolbarButton("tool-btn", { "data-tool": "circle", title: "원형 표시" }, "○");
      const fiboBtn = toolbar.querySelector('[data-tool="fibo"]');
      const undoBtn = toolbar.querySelector('[data-tool="undo"]');
      toolbar.insertBefore(circleBtn, fiboBtn || undoBtn || null);
    }

    if (!toolbar.querySelector("[data-drawing-continuous]")) {
      const continuousBtn = createToolbarButton("tool-btn bv-drawing-continuous-btn", {
        "data-drawing-continuous": "1",
        title: "연속 그리기",
        "aria-label": "연속 그리기",
        "aria-pressed": "false"
      }, "연속");
      const undoBtn = toolbar.querySelector('[data-tool="undo"]');
      toolbar.insertBefore(continuousBtn, undoBtn || null);
    }
  }

  function syncDrawingContinuousButtons() {
    document.querySelectorAll("[data-drawing-continuous]").forEach(function (button) {
      button.classList.toggle("active", !!state.continuousDrawing);
      button.setAttribute("aria-pressed", state.continuousDrawing ? "true" : "false");
      button.title = state.continuousDrawing ? "연속 그리기 켜짐" : "연속 그리기";
    });
  }

  function syncDrawingToolDefaultButtonState() {
    document.querySelectorAll("[data-tool]").forEach(function (button) {
      const tool = normalizeDrawingTool(button.dataset.tool);
      if (!isDrawingStyleTool(tool)) {
        button.classList.remove("has-custom-default");
        button.style.removeProperty("--tool-default-color");
        return;
      }
      const hasCustom = !!(state.drawingToolDefaults && state.drawingToolDefaults[tool]);
      const effective = getEffectiveDrawingDefaults(tool);
      button.classList.toggle("has-custom-default", hasCustom);
      button.style.setProperty("--tool-default-color", effective.color || "#1d4ed8");
      button.title = DRAWING_TOOL_TITLES[tool] + " · 우클릭 기본 속성";
      button.setAttribute("aria-label", DRAWING_TOOL_TITLES[tool] + " · 우클릭 기본 속성");
    });
  }

  function openDrawingToolDefaultSettings(tool) {
    const fixed = normalizeDrawingTool(tool);
    if (!isDrawingStyleTool(fixed)) return false;
    const draft = Object.assign({ id: "default_" + fixed, type: fixed }, getEffectiveDrawingDefaults(fixed));
    openDrawingSettings(draft, { defaultMode: true, toolType: fixed });
    return true;
  }

  function attachDrawingToolContextMenus() {
    document.querySelectorAll("[data-tool]").forEach(function (button) {
      if (button.dataset.defaultSettingsBound === "1") return;
      button.dataset.defaultSettingsBound = "1";
      button.addEventListener("contextmenu", function (event) {
        const tool = normalizeDrawingTool(button.dataset.tool);
        if (!isDrawingStyleTool(tool)) return;
        event.preventDefault();
        event.stopPropagation();
        openDrawingToolDefaultSettings(tool);
      });
    });
  }

  function installDrawingUiSkin() {
    ensureDrawingToolbarExtraButtons();
    if (!document.getElementById("bitgakDrawingUiStyle")) {
      const style = document.createElement("style");
      style.id = "bitgakDrawingUiStyle";
      style.textContent = `
        #chartWrap, #tvChart { cursor: default; }
        #drawingLayer { touch-action: none; pointer-events: none; overflow: hidden; }
        .drawing-mode #drawingLayer { pointer-events: auto; }
        #drawingLayer.has-drawings .bv-drawing-hit { cursor: default; pointer-events: none; }
        #drawingLayer.has-drawings .bv-drawing-handle { pointer-events: all; cursor: grab; filter: drop-shadow(0 1px 2px rgba(15,23,42,.24)); }
        #drawingLayer.has-drawings .bv-drawing-handle:active { cursor: grabbing; }
        #drawingLayer .bv-drawing-line, #drawingLayer .bv-drawing-preview, #drawingLayer .bv-drawing-fill, #drawingLayer .bv-drawing-axis-badge, #drawingLayer .bv-drawing-axis-badge-text, #drawingLayer .bv-drawing-crosshair-guide * { pointer-events: none; }
        #drawingLayer .bv-drawing-preview { opacity: .94; }
        #chartWrap, #tvChart { overflow: hidden; }
        .drawing-mode #drawingLayer { cursor: crosshair; }
        .bv-drawing-settings-modal { position: fixed; inset: 0; z-index: 100000; display: none; place-items: center; background: rgba(15,23,42,.34); backdrop-filter: blur(6px); }
        .bv-drawing-settings-modal.open { display: grid; }
        .bv-drawing-settings-panel { width: min(560px, calc(100vw - 28px)); border-radius: 18px; background: #fff; color: #0f172a; box-shadow: 0 24px 80px rgba(2,6,23,.28); border: 1px solid rgba(148,163,184,.24); overflow: hidden; }
        .bv-drawing-settings-head, .bv-drawing-settings-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 17px; border-bottom: 1px solid #e2e8f0; }
        .bv-drawing-settings-foot { justify-content: flex-end; border-top: 1px solid #e2e8f0; border-bottom: 0; }
        .bv-drawing-settings-head strong { font-size: 19px; font-weight: 950; }
        .bv-drawing-settings-head button { width: 34px; height: 34px; border: 0; border-radius: 10px; background: #f1f5f9; font-size: 24px; line-height: 1; color: #334155; }
        .bv-drawing-settings-body { padding: 17px; }
        .bv-drawing-setting-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .bv-drawing-setting-field { display: grid; gap: 7px; font-size: 12px; font-weight: 850; color: #475569; }
        .bv-drawing-setting-field.wide { grid-column: 1 / -1; }
        .bv-drawing-setting-field input[type='number'], .bv-drawing-setting-field input[type='text'], .bv-drawing-setting-field select { height: 40px; border: 1px solid #cbd5e1; border-radius: 11px; padding: 0 11px; font-size: 14px; font-weight: 750; background: #fff; color: #0f172a; }
        .bv-drawing-extend-section { grid-column: 1 / -1; display: grid; gap: 11px; padding: 14px; border-radius: 18px; background: linear-gradient(180deg, #f8fbff, #f1f5f9); border: 1px solid #dbe5f1; }
        .bv-drawing-extend-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .bv-drawing-extend-head strong { font-size: 14px; font-weight: 950; color: #0f172a; }
        .bv-drawing-extend-head span { font-size: 11px; font-weight: 850; color: #64748b; }
        .bv-drawing-extend-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .bv-drawing-extend-card { min-height: 54px; display: grid; grid-template-columns: 18px 38px minmax(0,1fr); align-items: center; gap: 10px; padding: 10px 12px; border-radius: 15px; background: rgba(255,255,255,.78); border: 1px solid rgba(203,213,225,.86); cursor: pointer; transition: .16s ease; }
        .bv-drawing-extend-card:hover { border-color: rgba(37,99,235,.42); box-shadow: 0 8px 20px rgba(15,23,42,.06); }
        .bv-drawing-extend-card:has(input:checked), .bv-drawing-extend-card.checked { background: rgba(37,99,235,.08); border-color: rgba(37,99,235,.52); }
        .bv-drawing-extend-card input { width: 16px; height: 16px; accent-color: #2563eb; }
        .bv-drawing-extend-card b { font-size: 13px; font-weight: 950; color: #1e293b; }
        .bv-extend-icon { position: relative; width: 38px; height: 22px; border-radius: 999px; background: #eaf2ff; overflow: hidden; }
        .bv-extend-icon::before { content: ''; position: absolute; left: 7px; right: 7px; top: 10px; height: 2px; background: #2563eb; border-radius: 99px; }
        .bv-extend-icon::after { content: ''; position: absolute; top: 6px; width: 8px; height: 8px; border-top: 2px solid #2563eb; border-right: 2px solid #2563eb; }
        .bv-extend-icon.left::after { left: 6px; transform: rotate(-135deg); }
        .bv-extend-icon.right::after { right: 6px; transform: rotate(45deg); }
        .bv-drawing-color-button { width: 42px; height: 42px; border: 0; border-radius: 999px; background: var(--draw-color); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22), 0 0 0 4px rgba(148,163,184,.16); }
        .bv-drawing-settings-foot button { height: 39px; min-width: 76px; border-radius: 11px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-weight: 850; }
        .bv-drawing-settings-foot button.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
        .bv-drawing-color-palette { position: fixed; z-index: 100001; width: 360px; max-width: calc(100vw - 24px); padding: 20px; border-radius: 22px; background: rgba(8,17,31,.98); color: #fff; border: 1px solid rgba(96,165,250,.26); box-shadow: 0 28px 90px rgba(0,0,0,.48); backdrop-filter: blur(16px); }
        .bv-drawing-color-palette strong { display: block; margin-bottom: 16px; font-size: 18px; font-weight: 950; }
        .bv-drawing-color-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
        .bv-drawing-color-dot { width: 36px; height: 36px; border: 0; border-radius: 999px; background: var(--dot-color); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
        .bv-drawing-color-dot:hover, .bv-drawing-color-dot.active { outline: 3px solid rgba(56,189,248,.36); outline-offset: 3px; }
        .bv-fibo-level-section { grid-column: 1 / -1; display: grid; gap: 12px; padding: 14px; border-radius: 18px; background: linear-gradient(180deg, #f8fafc, #f1f5f9); border: 1px solid #dbe5f1; box-shadow: inset 0 1px 0 rgba(255,255,255,.72); }
        .bv-fibo-level-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #0f172a; }
        .bv-fibo-level-head strong { font-size: 14px; font-weight: 950; letter-spacing: -0.03em; }
        .bv-fibo-level-head span { font-size: 11px; font-weight: 850; color: #64748b; }
        .bv-fibo-level-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 12px; max-height: none; overflow: visible; padding-right: 0; }
        .bv-fibo-level-row { min-width: 0; height: 42px; display: grid; grid-template-columns: 22px minmax(0, 1fr) 36px; align-items: center; gap: 8px; padding: 5px 7px; border-radius: 12px; background: rgba(255,255,255,.76); border: 1px solid rgba(203,213,225,.72); }
        .bv-fibo-level-row input[type='checkbox'] { width: 16px; height: 16px; accent-color: #1d4ed8; }
        .bv-fibo-level-value { width: 100%; height: 30px !important; border-radius: 9px !important; padding: 0 8px !important; font-size: 13px !important; border-color: transparent !important; background: transparent !important; }
        .bv-fibo-level-value:focus { background:#fff !important; border-color:#60a5fa !important; outline: none; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
        .bv-fibo-level-color { width: 30px; height: 30px; border: 0; border-radius: 10px; background: var(--draw-color); box-shadow: inset 0 0 0 1px rgba(255,255,255,.28), 0 0 0 3px rgba(148,163,184,.16); }
        .bv-drawing-continuous-btn { min-width: 48px; padding: 0 10px; font-size: 12px; font-weight: 950; letter-spacing: -0.04em; }
        .bv-drawing-continuous-btn.active { background: #2563eb !important; color: #fff !important; box-shadow: 0 8px 18px rgba(37,99,235,.26); }
        .bv-drawing-circle { vector-effect: non-scaling-stroke; }
        [data-tool] { position: relative; }
        [data-tool] svg { width: 18px; height: 18px; display: block; }
        [data-tool].has-custom-default::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 7px; height: 7px; border-radius: 999px; background: var(--tool-default-color, #2563eb); box-shadow: 0 0 0 2px rgba(255,255,255,.82), 0 4px 10px rgba(15,23,42,.25); }
        .bv-drawing-default-notice { margin-bottom: 13px; padding: 11px 12px; border-radius: 13px; background: rgba(37,99,235,.08); border: 1px solid rgba(37,99,235,.18); color: #1e3a8a; font-size: 12px; font-weight: 850; line-height: 1.45; }
      `;
      document.head.appendChild(style);
    }

    ensureDrawingToolbarExtraButtons();

  document.querySelectorAll("[data-tool]").forEach(function (btn) {
      const tool = normalizeDrawingTool(btn.dataset.tool);
      if (!DRAWING_TOOL_TITLES[tool]) return;
      btn.innerHTML = svgIcon(tool);
      btn.title = DRAWING_TOOL_TITLES[tool];
      btn.setAttribute("aria-label", DRAWING_TOOL_TITLES[tool]);
      btn.classList.toggle("active", normalizeDrawingTool(state.activeTool) === tool);
    });

    syncDrawingContinuousButtons();
    attachDrawingToolContextMenus();
    syncDrawingToolDefaultButtonState();
  }

  function clampNumberForRange(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function isWheelZoomControlTarget(target) {
    return !!(target && target.closest && target.closest(
      "button, a, input, select, textarea, .bv-header, .chart-card-top, .tv-interval-dropdown, .bv-drawing-toolbar, .bv-symbol-panel, .stock-search-panel, .indicator-panel, .group-panel, .my-stock-panel, .mobile-watchlist-panel, .bv-drawing-settings-modal, .bv-drawing-color-palette"
    ));
  }

  function shouldUseRightAnchoredWheelZoom(event) {
    if (!event || !chartWrap || !chartEl) return false;
    if (normalizeDrawingTool(state.activeTool) !== "cursor" || drawingDrag || priceAxisDrag) return false;
    if (isWheelZoomControlTarget(event.target)) return false;
    if (isPriceAxisPointer(event)) return false;

    const rect = chartEl.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function rightAnchoredWheelZoom(event) {
    if (!shouldUseRightAnchoredWheelZoom(event)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    const range = getVisibleLogicalRangeSafe();
    if (!range) return;

    const currentSpan = Math.max(1, Number(range.to) - Number(range.from));
    const rowCount = Math.max((state.rows || []).length, 80);
    const minSpan = Math.max(8, Math.min(42, rowCount * 0.02));
    const maxSpan = Math.max(80, rowCount + 120);

    const normalizedDelta = clampNumberForRange(Number(event.deltaY || 0), -180, 180);
    const factor = Math.exp(normalizedDelta * 0.00118);
    const nextSpan = clampNumberForRange(currentSpan * factor, minSpan, maxSpan);

    // TradingView식 휠 줌: 현재 커서 위치가 아니라 오른쪽 끝을 기준점으로 고정한다.
    // 그래서 to는 그대로 두고 from만 움직인다.
    const nextRange = {
      from: Number(range.to) - nextSpan,
      to: Number(range.to),
    };

    setVisibleLogicalRangeSafe(nextRange);

    if (!wheelZoomRaf) {
      wheelZoomRaf = requestAnimationFrame(function () {
        wheelZoomRaf = null;
        requestDrawingRender();
      });
    }
  }


  function handlePriceAxisWheel(event) {
    if (!isPriceAxisPointer(event)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    const logicalRange = getVisibleLogicalRangeSafe();
    const startRange = getCurrentVisiblePriceRange();
    if (!startRange) return;

    const normalizedDelta = clampNumberForRange(Number(event.deltaY || 0), -140, 140);
    const nextRange = scalePriceRangeByPixels(startRange, normalizedDelta * 0.52);
    applyPriceAxisVisibleRange(nextRange, logicalRange, { keepX: true, render: false });
    if (logicalRange) setVisibleLogicalRangeSafe(logicalRange);
    requestDrawingRender();
  }

  function ensurePriceAxisDragOverlay() {
    if (priceAxisDragOverlay || !chartWrap) return;

    priceAxisDragOverlay = document.createElement("div");
    priceAxisDragOverlay.id = "bvPriceAxisDragOverlay";
    priceAxisDragOverlay.className = "bv-price-axis-drag-overlay";
    priceAxisDragOverlay.setAttribute("aria-hidden", "true");
    chartWrap.appendChild(priceAxisDragOverlay);

    priceAxisDragOverlay.addEventListener("pointerdown", handlePriceAxisPointerDown, true);
    priceAxisDragOverlay.addEventListener("pointermove", handlePriceAxisPointerMove, true);
    priceAxisDragOverlay.addEventListener("dblclick", handlePriceAxisDoubleClick, true);
    priceAxisDragOverlay.addEventListener("wheel", handlePriceAxisWheel, { passive: false, capture: true });
  }

  function setDrawingTool(tool, options) {
    options = options || {};
    const fixed = normalizeDrawingTool(tool);
    state.activeTool = fixed;
    state.tempDrawing = null;
    state.isDrawing = false;
    state.startPoint = null;
    state.fiboStage = 0;
    if (!options.keepSelection && fixed !== "cursor") state.selectedDrawingId = null;

    document.querySelectorAll("[data-tool]").forEach(function (node) {
      node.classList.toggle("active", normalizeDrawingTool(node.dataset.tool) === fixed);
    });
    syncDrawingContinuousButtons();

    const drawingMode = fixed !== "cursor";
    chartWrap.classList.toggle("drawing-mode", drawingMode);
    drawingLayer.style.cursor = drawingMode ? "crosshair" : "default";

    chart.applyOptions({
      handleScroll: drawingMode ? false : normalHandleScrollOptions(),
      handleScale: drawingMode ? false : normalHandleScaleOptions(),
    });

    renderDrawings();
  }

  // TradingView-like interaction:
  // - 차트 본문 드래그: 기본 X축 팬 + 커스텀 Y축 위치 이동
  // - 차트 본문 휠 확대/축소: 오른쪽 끝 고정, 왼쪽 logical range만 변경
  // - 오른쪽 가격축 드래그: X축 고정 + Y축 확대/축소
  ensurePriceAxisDragOverlay();
  chartWrap.addEventListener("wheel", handlePriceAxisWheel, { passive: false, capture: true });
  chartEl.addEventListener("wheel", handlePriceAxisWheel, { passive: false, capture: true });
  chartWrap.addEventListener("wheel", rightAnchoredWheelZoom, { passive: false, capture: true });
  chartEl.addEventListener("wheel", rightAnchoredWheelZoom, { passive: false, capture: true });
  chartWrap.addEventListener("pointerdown", handlePriceAxisPointerDown, true);
  chartWrap.addEventListener("pointermove", handlePriceAxisPointerMove, true);
  window.addEventListener("pointermove", handlePriceAxisPointerMove, true);
  window.addEventListener("pointerup", finishPriceAxisPointerDrag, true);
  window.addEventListener("pointercancel", finishPriceAxisPointerDrag, true);
  chartWrap.addEventListener("dblclick", handlePriceAxisDoubleClick, true);

  chartWrap.addEventListener("pointerdown", handleChartBodyPanPointerDown, true);
  // pointermove는 capture 단계가 아니라 chartWrap bubble 단계에서 처리한다.
  // 그래야 LightweightCharts가 먼저 X축 팬을 반영하고, 그 직후 Y축/드로잉을 맞출 수 있다.
  chartWrap.addEventListener("pointermove", handleChartBodyPanPointerMove, false);
  chartEl.addEventListener("pointermove", handleChartBodyPanPointerMove, false);
  window.addEventListener("pointermove", handleChartBodyPanPointerMove, true);
  window.addEventListener("pointerup", finishChartBodyPan, true);
  window.addEventListener("pointercancel", finishChartBodyPan, true);

  chartWrap.addEventListener("pointerdown", handleChartWrapDrawingPointerDown, true);
  chartWrap.addEventListener("click", handleChartWrapDrawingClick, true);
  chartWrap.addEventListener("dblclick", handleChartWrapDrawingDoubleClick, true);
  chartWrap.addEventListener("contextmenu", handleChartWrapDrawingContextMenu, true);

  drawingLayer.addEventListener("click", handleDrawingClick);
  drawingLayer.addEventListener("pointermove", handleDrawingMove);
  chartWrap.addEventListener("pointerdown", updateMobileCrosshairFromTouch, { passive: true, capture: true });
  chartEl.addEventListener("pointerdown", updateMobileCrosshairFromTouch, { passive: true, capture: true });
  chartWrap.addEventListener("pointermove", updateDrawingCrosshairFromPointer, { passive: true });
  chartEl.addEventListener("pointermove", updateDrawingCrosshairFromPointer, { passive: true });
  chartWrap.addEventListener("touchstart", updateMobileCrosshairFromTouch, { passive: true });
  chartWrap.addEventListener("touchmove", updateMobileCrosshairFromTouch, { passive: true });
  chartEl.addEventListener("touchstart", updateMobileCrosshairFromTouch, { passive: true });
  chartEl.addEventListener("touchmove", updateMobileCrosshairFromTouch, { passive: true });
  drawingLayer.addEventListener("pointerdown", handleDrawingPointerDown);
  drawingLayer.addEventListener("pointermove", handleDrawingDragMove);
  drawingLayer.addEventListener("pointerup", handleDrawingPointerUp);
  drawingLayer.addEventListener("pointercancel", handleDrawingPointerUp);
  window.addEventListener("pointermove", handleDrawingDragMove, true);
  window.addEventListener("pointerup", handleDrawingPointerUp, true);
  window.addEventListener("pointercancel", handleDrawingPointerUp, true);
  drawingLayer.addEventListener("contextmenu", handleDrawingContextMenu, true);
  drawingLayer.addEventListener("dblclick", handleDrawingDoubleClick, true);
  drawingLayer.addEventListener("wheel", function (event) {
    if (normalizeDrawingTool(state.activeTool) !== "cursor" || drawingDrag) return;
    const oldPointerEvents = drawingLayer.style.pointerEvents;
    drawingLayer.style.pointerEvents = "none";
    const target = document.elementFromPoint(event.clientX, event.clientY);
    drawingLayer.style.pointerEvents = oldPointerEvents;
    if (!target || target === drawingLayer || drawingLayer.contains(target)) return;
    try {
      target.dispatchEvent(new WheelEvent(event.type, event));
      event.preventDefault();
      event.stopPropagation();
    } catch (e) {}
  }, { passive: false });

  ensureDrawingToolbarExtraButtons();

  document.querySelectorAll("[data-tool]").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const tool = normalizeDrawingTool(btn.dataset.tool);
      if (tool === "undo") { undoDrawing(); return; }
      if (tool === "clear") {
        pushDrawingHistory();
        state.drawings = [];
        state.tempDrawing = null;
        state.isDrawing = false;
        state.startPoint = null;
        state.selectedDrawingId = null;
        state.fiboStage = 0;
        saveDrawingsToStorage();
        renderDrawings();
        return;
      }
      setDrawingTool(tool);
    });
  });

  document.querySelectorAll("[data-drawing-continuous]").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      state.continuousDrawing = !state.continuousDrawing;
      syncDrawingContinuousButtons();
    });
  });

  installDrawingUiSkin();

  chart.subscribeCrosshairMove(function (param) {
    if (shouldDrawManualCrosshair() && param && param.time && param.point && Number.isFinite(param.point.x) && Number.isFinite(param.point.y) && isLocalPointInsideMainPane(param.point)) {
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price !== null && price !== undefined && !Number.isNaN(Number(price))) {
        state.crosshairPoint = { x: param.point.x, y: param.point.y };
        state.crosshairValue = { time: normalizeTime(param.time), price: Number(price) };
        scheduleDrawingCrosshairRender();
      }
    } else if (!state.tempDrawing && !drawingDrag && state.crosshairValue) {
      state.crosshairPoint = null;
      state.crosshairValue = null;
      scheduleDrawingCrosshairRender(true);
    }

    if (!param || !param.time || !state.payload) return;

    const row = findRowByTime(param.time);
    if (row) {
      updateOHLC(row);
      return;
    }

    const candleData = param.seriesData && param.seriesData.get ? param.seriesData.get(candleSeries) : null;

    if (!candleData || !ohlcInfo) return;

    ohlcInfo.textContent =
      `날짜 ${normalizeTimeForDisplay(param.time)}　` +
      `시가 ${formatNumber(candleData.open)}　` +
      `고가 ${formatNumber(candleData.high)}　` +
      `저가 ${formatNumber(candleData.low)}　` +
      `종가 ${formatNumber(candleData.close)}　` +
      `거래량 -`;
  });

  let visibleRangeRenderRaf = null;
  chart.timeScale().subscribeVisibleTimeRangeChange(function () {
    if (isChartBodyLivePanActive()) {
      drawingRenderDeferred = true;
      scheduleDrawingLivePanSync(chartBodyPanDrag ? chartBodyPanDrag.currentLiveDx : 0);
      return;
    }
    if (visibleRangeRenderRaf) return;
    visibleRangeRenderRaf = requestAnimationFrame(function () {
      visibleRangeRenderRaf = null;
      requestDrawingRender();
    });
  });

  function resizeChart() {
    const width = Math.max(1, chartEl.clientWidth || chartWrap.clientWidth || 800);
    const height = Math.max(1, chartEl.clientHeight || chartWrap.clientHeight || 520);

    chart.applyOptions({ width, height });

    syncDrawingLayerBounds();

    layoutPanes();
    renderDrawings();
    hideTradingViewMark();
  }

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(resizeChart);
    resizeObserver.observe(chartWrap);
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

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(code);
        copyCodeBtn.textContent = "복사됨";
        setTimeout(function () { copyCodeBtn.textContent = "코드 복사"; }, 1200);
      } catch (e) {
        copyCodeBtn.textContent = code;
        setTimeout(function () { copyCodeBtn.textContent = "코드 복사"; }, 1200);
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (intervalDropdown && !intervalDropdown.contains(event.target)) closeIntervalDropdown();
  });

  document.addEventListener("keydown", function (event) {
    const tag = String(event.target && event.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || (event.target && event.target.isContentEditable);

    if (!typing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      if (nudgeSelectedDrawing(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
      if (deleteSelectedDrawing()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (event.key === "Escape") {
      state.isDrawing = false;
      state.startPoint = null;
      state.tempDrawing = null;
      state.fiboStage = 0;
      setDrawingTool("cursor", { keepSelection: true });
      renderDrawings();
      closeIntervalDropdown();
    }
  });


  function installAverageCalculator() {
    const rowsWrap = document.getElementById("avgCalcRows");
    const addBtn = document.getElementById("avgAddRowBtn");
    const totalQtyEl = document.getElementById("avgTotalQty");
    const totalAmountEl = document.getElementById("avgTotalAmount");
    const averageEl = document.getElementById("avgAveragePrice");
    const profitLossEl = document.getElementById("avgProfitLoss");
    const returnRateEl = document.getElementById("avgReturnRate");
    const resetBtn = document.getElementById("avgCalcReset");
    const autoSaveStatus = document.getElementById("avgAutoSaveStatus");
    const openMyStockBtn = document.getElementById("openMyStockBtn");

    const modal = document.getElementById("myStockModal");
    const closeModalBtn = modal ? modal.querySelector("[data-close-my-stock]") : null;
    const myStockSaveBtn = document.getElementById("myStockSaveBtn");
    const myStockDeleteBtn = document.getElementById("myStockDeleteBtn");
    const memoInput = document.getElementById("investMemoInput");
    const noteCurrentPrice = document.getElementById("noteCurrentPrice");
    const noteAveragePrice = document.getElementById("noteAveragePrice");
    const noteHoldQty = document.getElementById("noteHoldQty");
    const noteReturnRate = document.getElementById("noteReturnRate");
    const tableBody = document.getElementById("myStockTableBody");

    const avgLineStyleSelect = document.getElementById("avgLineStyleSelect");
    const avgLineWidthSelect = document.getElementById("avgLineWidthSelect");
    const avgLineColorButton = document.querySelector("[data-avgline-color-button]");
    const avgLineColorPopover = document.querySelector("[data-avgline-popover]");

    if (!rowsWrap) return;

    const storageKey = "bitgak:investment-note:" + code;
    const DEFAULT_NOTE_STYLE = {
      bg: "rgba(15, 23, 42, 0.82)",
      text: "#eaf2ff",
      accent: "#67e8f9",
    };
    const DEFAULT_AVG_LINE = {
      color: "#22d3ee",
      lineStyle: "dashed",
      lineWidth: 2,
    };

    let noteStyle = Object.assign({}, DEFAULT_NOTE_STYLE);
    let avgLineStyle = Object.assign({}, DEFAULT_AVG_LINE);
    let rowId = 0;
    let saveTimer = null;
    let avgPriceLine = null;
    let transactionPriceLines = [];

    const LINE_STYLE_MAP = {
      solid: 0,
      dotted: 1,
      dashed: 2,
      largeDashed: 3,
      sparseDotted: 4,
    };

    const PALETTE_COLORS = [
      "#ff4b6e", "#ff9f1c", "#52d400", "#2bbbd8", "#3b82f6", "#7c5bd6",
      "#e84393", "#ff6b2b", "#34c759", "#38a8cf", "#4f73d9", "#9b5de5",
      "#db2ba7", "#e2672c", "#43b883", "#18b8a6", "#5b5db8", "#bb3fe0",
      "#fb8da0", "#ffd09a", "#98e96e", "#7ed7e2", "#93c5fd", "#b7a9df",
      "#ffffff", "#eaf2ff", "#d8dee6", "#a5adba", "#7b8494", "#384454", "#111827", "#000000"
    ];

    function toNumber(value) {
      const n = Number(String(value || "").replace(/,/g, ""));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function getLastClose() {
      const last = state.rows && state.rows.length ? state.rows[state.rows.length - 1] : null;
      return last ? Number(last.close || 0) : 0;
    }

    function defaultTradeColor(type) {
      return type === "sell" ? "#fb7185" : "#60a5fa";
    }

    function normalizeColor(value, fallback) {
      const text = String(value || "").trim();
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : String(fallback || "#60a5fa").toLowerCase();
    }

    function normalizeNoteColor(value, fallback) {
      const text = String(value || "").trim();
      if (/^rgba?\(/.test(text)) return text;
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
    }

    function normalizeLineStyle(value) {
      return LINE_STYLE_MAP[value] !== undefined ? value : "dashed";
    }

    function normalizeLineWidth(value) {
      const n = Number(value || 1);
      if (n <= 1) return 1;
      if (n >= 4) return 4;
      return Math.round(n);
    }

    function lineStyleValue(styleKey) {
      return LINE_STYLE_MAP[normalizeLineStyle(styleKey)];
    }

    function positionFloatingPopover(popover, trigger) {
      if (!popover || !trigger) return;

      const rect = trigger.getBoundingClientRect();
      const width = 292;
      const gap = 10;
      let left = rect.right + gap;
      let top = rect.top - 10;

      if (left + width > window.innerWidth - 12) {
        left = rect.left - width - gap;
      }
      if (left < 12) {
        left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left - 120));
        top = rect.bottom + gap;
      }

      top = Math.max(70, Math.min(top, window.innerHeight - 320));
      popover.style.left = left + "px";
      popover.style.top = top + "px";
    }

    function closeNoteColorPopovers(exceptControl) {
      document.querySelectorAll(".note-color-popover.open").forEach(function (popover) {
        if (exceptControl && exceptControl.contains(popover)) return;
        popover.classList.remove("open");
      });
      document.querySelectorAll(".note-color-button.active, .avgline-color-button.active").forEach(function (btn) {
        if (exceptControl && exceptControl.contains(btn)) return;
        btn.classList.remove("active");
      });
    }

    function setPopoverActive(popover, color) {
      if (!popover) return;
      const fixed = normalizeColor(color, "#60a5fa");
      popover.querySelectorAll("button[data-color]").forEach(function (dot) {
        dot.classList.toggle("active", normalizeColor(dot.dataset.color, "") === fixed);
      });
    }

    function formatWon(value) {
      return value > 0 ? formatNumber(Math.round(value)) + "원" : "-";
    }

    function formatQty(value) {
      return value > 0 ? formatNumber(value) + "주" : "-";
    }

    function tradeLabel(item, index) {
      return String(index + 1) + "차 " + (item.type === "sell" ? "매도" : "매수");
    }

    function applyNoteStyle(style) {
      noteStyle = Object.assign({}, DEFAULT_NOTE_STYLE, style || {});
      noteStyle.bg = normalizeNoteColor(noteStyle.bg, DEFAULT_NOTE_STYLE.bg);
      noteStyle.text = normalizeNoteColor(noteStyle.text, DEFAULT_NOTE_STYLE.text);
      noteStyle.accent = normalizeNoteColor(noteStyle.accent, DEFAULT_NOTE_STYLE.accent);

      const badge = document.getElementById("investChartBadge");
      if (badge) {
        badge.style.setProperty("--note-bg", noteStyle.bg);
        badge.style.setProperty("--note-text", noteStyle.text);
        badge.style.setProperty("--note-accent", noteStyle.accent);
      }

      const preview = document.getElementById("noteStylePreview");
      if (preview) {
        preview.style.setProperty("--note-bg", noteStyle.bg);
        preview.style.setProperty("--note-text", noteStyle.text);
        preview.style.setProperty("--note-accent", noteStyle.accent);
      }

      document.querySelectorAll(".note-color-control").forEach(function (control) {
        const field = control.dataset.noteField;
        const color = normalizeNoteColor(noteStyle[field], DEFAULT_NOTE_STYLE[field]);
        const btn = control.querySelector("[data-note-color-button]");
        const popover = control.querySelector("[data-note-popover]");

        if (btn) btn.style.setProperty("--note-dot-color", color);
        setPopoverActive(popover, color);
      });
    }

    function applyAvgLineStyle(style) {
      avgLineStyle = Object.assign({}, DEFAULT_AVG_LINE, style || {});
      avgLineStyle.color = normalizeColor(avgLineStyle.color, DEFAULT_AVG_LINE.color);
      avgLineStyle.lineStyle = normalizeLineStyle(avgLineStyle.lineStyle);
      avgLineStyle.lineWidth = normalizeLineWidth(avgLineStyle.lineWidth);

      if (avgLineColorButton) {
        avgLineColorButton.style.setProperty("--avgline-dot-color", avgLineStyle.color);
      }
      if (avgLineStyleSelect) avgLineStyleSelect.value = avgLineStyle.lineStyle;
      if (avgLineWidthSelect) avgLineWidthSelect.value = String(avgLineStyle.lineWidth);
      setPopoverActive(avgLineColorPopover, avgLineStyle.color);
    }

    function paletteHtml(activeColor) {
      const active = normalizeColor(activeColor, "#60a5fa");
      return ''
        + '<div class="avg-color-popover-title">색상 선택</div>'
        + '<div class="avg-color-grid">'
        + PALETTE_COLORS.map(function (color) {
            const fixed = normalizeColor(color, "#60a5fa");
            return '<button class="avg-color-dot' + (fixed === active ? ' active' : '') + '" type="button" data-color="' + fixed + '" style="--dot-color:' + fixed + '"></button>';
          }).join("")
        + '</div>';
    }

    function setColorPickerValue(panel, color, markUserChanged) {
      const fixed = normalizeColor(color, "#60a5fa");
      const hidden = panel.querySelector(".avg-line-color");
      const btn = panel.querySelector(".avg-line-color-button");
      const popover = panel.querySelector(".avg-color-popover");

      if (hidden) hidden.value = fixed;
      if (btn) {
        btn.style.setProperty("--line-color", fixed);
        btn.dataset.color = fixed;
      }
      if (markUserChanged && hidden) hidden.dataset.userChanged = "1";

      if (popover) {
        popover.querySelectorAll(".avg-color-dot").forEach(function (dot) {
          dot.classList.toggle("active", normalizeColor(dot.dataset.color, "") === fixed);
        });
      }
    }

    function closeAllColorPopovers(exceptPanel) {
      document.querySelectorAll(".avg-color-popover.open").forEach(function (popover) {
        if (exceptPanel && exceptPanel.contains(popover)) return;
        popover.classList.remove("open");
      });
      document.querySelectorAll(".avg-line-color-button.active").forEach(function (btn) {
        if (exceptPanel && exceptPanel.contains(btn)) return;
        btn.classList.remove("active");
      });
    }

    function getRowsFromDom() {
      return Array.from(rowsWrap.querySelectorAll(".avg-calc-row-item")).map(function (row, index) {
        const rowId = row.dataset.rowId;
        const panel = rowsWrap.querySelector('.avg-line-style-panel[data-for="' + rowId + '"]');
        const typeInput = panel ? panel.querySelector(".avg-line-type-select") : null;
        const colorInput = panel ? panel.querySelector(".avg-line-color") : null;
        const styleInput = panel ? panel.querySelector(".avg-line-style-select") : null;
        const widthInput = panel ? panel.querySelector(".avg-line-width-select") : null;

        return {
          type: typeInput && typeInput.value === "sell" ? "sell" : "buy",
          price: toNumber(row.querySelector(".avg-price-input") && row.querySelector(".avg-price-input").value),
          qty: toNumber(row.querySelector(".avg-qty-input") && row.querySelector(".avg-qty-input").value),
          lineColor: colorInput && colorInput.value ? colorInput.value : defaultTradeColor(typeInput && typeInput.value),
          lineStyle: normalizeLineStyle(styleInput && styleInput.value),
          lineWidth: normalizeLineWidth(widthInput && widthInput.value),
          order: index + 1,
        };
      }).filter(function (item) {
        return item.price > 0 || item.qty > 0;
      });
    }

    function calcSummary(items) {
      let buyQty = 0;
      let buyAmount = 0;
      let sellQty = 0;
      let sellAmount = 0;

      (items || []).forEach(function (item) {
        const price = Number(item.price || 0);
        const qty = Number(item.qty || 0);
        const amount = price * qty;

        if (item.type === "sell") {
          sellQty += qty;
          sellAmount += amount;
        } else {
          buyQty += qty;
          buyAmount += amount;
        }
      });

      const average = buyQty > 0 ? buyAmount / buyQty : 0;
      const holdQty = Math.max(0, buyQty - sellQty);
      const currentPrice = getLastClose();
      const costBasis = average * holdQty;
      const valuation = currentPrice * holdQty;
      const profit = holdQty > 0 ? valuation - costBasis : 0;
      const returnRate = costBasis > 0 ? profit / costBasis * 100 : 0;

      return { buyQty, buyAmount, sellQty, sellAmount, holdQty, average, currentPrice, valuation, profit, returnRate };
    }

    function createRow(item) {
      rowId += 1;
      const id = String(rowId);
      const row = document.createElement("div");
      row.className = "avg-calc-row avg-calc-row-item";
      row.dataset.rowId = id;

      const type = item && item.type === "sell" ? "sell" : "buy";
      const lineColor = normalizeColor(item && item.lineColor, defaultTradeColor(type));
      const lineStyle = normalizeLineStyle(item && item.lineStyle);
      const lineWidth = normalizeLineWidth(item && item.lineWidth);

      row.innerHTML = ''
        + '<span class="avg-step-label">' + id + '차</span>'
        + '<input class="avg-price-input" type="number" min="0" step="1" placeholder="단가">'
        + '<input class="avg-qty-input" type="number" min="0" step="1" placeholder="수량">'
        + '<output class="avg-amount-output">-</output>'
        + '<div class="avg-row-actions">'
        + '  <button class="avg-row-style" type="button" title="속성">⚙</button>'
        + '  <button class="avg-row-delete" type="button" title="삭제">×</button>'
        + '</div>';

      const panel = document.createElement("div");
      panel.className = "avg-line-style-panel";
      panel.dataset.for = id;
      panel.innerHTML = ''
        + '<select class="avg-line-type-select" aria-label="매수 매도 선택">'
        + '  <option value="buy">매수</option>'
        + '  <option value="sell">매도</option>'
        + '</select>'
        + '<div class="avg-line-color-wrap">'
        + '  <input class="avg-line-color" type="hidden" value="' + lineColor + '">'
        + '  <button class="avg-line-color-button" type="button" title="색상 선택" style="--line-color:' + lineColor + '"></button>'
        + '  <b class="avg-line-color-label">색상</b>'
        + '  <div class="avg-color-popover">' + paletteHtml(lineColor) + '</div>'
        + '</div>'
        + '<select class="avg-line-style-select" aria-label="선 스타일">'
        + '  <option value="solid">실선</option>'
        + '  <option value="dashed">점선</option>'
        + '  <option value="dotted">점</option>'
        + '  <option value="largeDashed">긴 점선</option>'
        + '</select>'
        + '<select class="avg-line-width-select" aria-label="선 두께">'
        + '  <option value="1">1px</option>'
        + '  <option value="2">2px</option>'
        + '  <option value="3">3px</option>'
        + '  <option value="4">4px</option>'
        + '</select>';

      const priceEl = row.querySelector(".avg-price-input");
      const qtyEl = row.querySelector(".avg-qty-input");
      const styleBtn = row.querySelector(".avg-row-style");
      const typeEl = panel.querySelector(".avg-line-type-select");
      const colorEl = panel.querySelector(".avg-line-color");
      const colorBtn = panel.querySelector(".avg-line-color-button");
      const colorPopover = panel.querySelector(".avg-color-popover");
      const styleEl = panel.querySelector(".avg-line-style-select");
      const widthEl = panel.querySelector(".avg-line-width-select");

      typeEl.value = type;
      styleEl.value = lineStyle;
      widthEl.value = String(lineWidth);
      if (item && item.price) priceEl.value = String(item.price);
      if (item && item.qty) qtyEl.value = String(item.qty);

      styleBtn.addEventListener("click", function () {
        panel.classList.toggle("open");
        styleBtn.classList.toggle("active", panel.classList.contains("open"));
      });

      if (colorBtn && colorPopover) {
        colorBtn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();

          const willOpen = !colorPopover.classList.contains("open");
          closeAllColorPopovers(panel);

          if (willOpen) {
            const rect = colorBtn.getBoundingClientRect();
            colorPopover.style.left = Math.min(window.innerWidth - 372, Math.max(12, rect.left - 20)) + "px";
            colorPopover.style.top = Math.min(window.innerHeight - 350, Math.max(70, rect.bottom + 10)) + "px";
            colorPopover.classList.add("open");
            colorBtn.classList.add("active");
          }
        });

        colorPopover.addEventListener("click", function (event) {
          const dot = event.target.closest(".avg-color-dot");
          if (!dot) return;
          event.preventDefault();
          event.stopPropagation();

          setColorPickerValue(panel, dot.dataset.color, true);
          colorPopover.classList.remove("open");
          colorBtn.classList.remove("active");
          update();
        });
      }

      row.querySelector(".avg-row-delete").addEventListener("click", function () {
        panel.remove();
        row.remove();
        renumberRows();
        if (!rowsWrap.querySelector(".avg-calc-row-item")) createRow({ type: "buy" });
        update();
      });

      typeEl.addEventListener("change", function () {
        if (!colorEl.dataset.userChanged) {
          setColorPickerValue(panel, defaultTradeColor(typeEl.value), false);
        }
        update();
      });

      [priceEl, qtyEl, typeEl, styleEl, widthEl].forEach(function (input) {
        input.addEventListener("input", update);
        input.addEventListener("change", update);
      });

      rowsWrap.appendChild(row);
      rowsWrap.appendChild(panel);
      renumberRows();
      return row;
    }

    function renumberRows() {
      Array.from(rowsWrap.querySelectorAll(".avg-calc-row-item")).forEach(function (row, index) {
        const label = row.querySelector(".avg-step-label");
        if (label) label.textContent = String(index + 1) + "차";
      });
    }

    function loadNote() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        if (!parsed || typeof parsed !== "object") return { rows: [], memo: "", style: null, avgLine: null };
        return {
          rows: Array.isArray(parsed.rows) ? parsed.rows : [],
          memo: parsed.memo || "",
          style: parsed.style || null,
          avgLine: parsed.avgLine || null,
        };
      } catch (e) {
        return { rows: [], memo: "", style: null, avgLine: null };
      }
    }

    function collectNote() {
      return {
        code,
        name: app.dataset.name || "",
        rows: getRowsFromDom(),
        memo: memoInput ? memoInput.value : "",
        style: noteStyle,
        avgLine: avgLineStyle,
        updatedAt: new Date().toISOString(),
      };
    }

    function saveNote(silent) {
      const note = collectNote();
      localStorage.setItem(storageKey, JSON.stringify(note));

      if (autoSaveStatus) {
        autoSaveStatus.textContent = "자동 저장됨";
        autoSaveStatus.classList.remove("saving");
      }

      return note;
    }

    function scheduleSave() {
      if (autoSaveStatus) {
        autoSaveStatus.textContent = "저장 중...";
        autoSaveStatus.classList.add("saving");
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveNote(true); }, 450);
    }

    function clearPriceLines() {
      try { if (avgPriceLine) candleSeries.removePriceLine(avgPriceLine); } catch (e) {}
      avgPriceLine = null;
      transactionPriceLines.forEach(function (line) {
        try { candleSeries.removePriceLine(line); } catch (e) {}
      });
      transactionPriceLines = [];
    }

    function updateChartInvestmentLines(summary, items) {
      clearPriceLines();

      if (!summary || !summary.average || !summary.holdQty) {
        const badge = document.getElementById("investChartBadge");
        if (badge) badge.style.display = "none";
        return;
      }

      try {
        avgPriceLine = candleSeries.createPriceLine({
          price: summary.average,
          color: avgLineStyle.color,
          lineWidth: normalizeLineWidth(avgLineStyle.lineWidth),
          lineStyle: lineStyleValue(avgLineStyle.lineStyle),
          axisLabelVisible: true,
          title: "내 평단 " + formatNumber(Math.round(summary.average)),
        });
      } catch (e) {}

      (items || []).slice(0, 12).forEach(function (item, index) {
        if (!item.price || !item.qty) return;
        const label = tradeLabel(item, index);
        try {
          transactionPriceLines.push(candleSeries.createPriceLine({
            price: item.price,
            color: item.lineColor || defaultTradeColor(item.type),
            lineWidth: normalizeLineWidth(item.lineWidth),
            lineStyle: lineStyleValue(item.lineStyle),
            axisLabelVisible: true,
            title: label + " " + formatNumber(Math.round(item.price)),
          }));
        } catch (e) {}
      });

      let badge = document.getElementById("investChartBadge");
      if (!badge && overlayEl) {
        badge = document.createElement("div");
        badge.id = "investChartBadge";
        badge.className = "invest-chart-badge";
        overlayEl.appendChild(badge);
      }

      applyNoteStyle(noteStyle);

      if (badge) {
        const visibleItems = (items || []).filter(function (item) {
          return item.price && item.qty;
        }).slice(0, 4);

        badge.style.display = "block";
        badge.classList.toggle("negative", summary.returnRate < 0);
        badge.innerHTML = ''
          + '<strong>내종목 투자노트</strong>'
          + '<span><em>평단가</em><b>' + formatWon(summary.average) + '</b></span>'
          + '<span><em>보유</em><b>' + formatQty(summary.holdQty) + '</b></span>'
          + '<span><em>수익률</em><b>' + (summary.returnRate > 0 ? "+" : "") + (Math.round(summary.returnRate * 100) / 100).toFixed(2) + '%</b></span>'
          + '<div class="invest-badge-trades">'
          + visibleItems.map(function (item, index) {
              return '<small>' + tradeLabel(item, index) + ' · ' + formatWon(item.price) + ' · ' + formatQty(item.qty) + '</small>';
            }).join("")
          + '</div>';
      }
    }

    function updateNoteStylePreview(summary, items) {
      const preview = document.getElementById("noteStylePreview");
      if (!preview) return;

      preview.style.setProperty("--note-bg", noteStyle.bg);
      preview.style.setProperty("--note-text", noteStyle.text);
      preview.style.setProperty("--note-accent", noteStyle.accent);

      const avg = document.getElementById("previewAveragePrice");
      const hold = document.getElementById("previewHoldQty");
      const rate = document.getElementById("previewReturnRate");
      const trades = document.getElementById("previewTradeList");

      if (avg) avg.textContent = summary && summary.average ? formatWon(summary.average) : "-";
      if (hold) hold.textContent = summary && summary.holdQty ? formatQty(summary.holdQty) : "-";
      if (rate) rate.textContent = summary && summary.holdQty ? (summary.returnRate > 0 ? "+" : "") + (Math.round(summary.returnRate * 100) / 100).toFixed(2) + "%" : "-";

      if (trades) {
        const list = (items || []).filter(function (item) {
          return item.price && item.qty;
        }).slice(0, 3);

        trades.innerHTML = list.length
          ? list.map(function (item, index) {
              return "<small>" + tradeLabel(item, index) + " · " + formatWon(item.price) + " · " + formatQty(item.qty) + "</small>";
            }).join("")
          : "<small>매수/매도 계획을 입력하면 여기에 표시됩니다.</small>";
      }
    }

    function renderModal(summary, items) {
      if (noteCurrentPrice) noteCurrentPrice.textContent = formatWon(summary.currentPrice);
      if (noteAveragePrice) noteAveragePrice.textContent = formatWon(summary.average);
      if (noteHoldQty) noteHoldQty.textContent = formatQty(summary.holdQty);
      if (noteReturnRate) {
        noteReturnRate.textContent = summary.holdQty > 0 ? (summary.returnRate > 0 ? "+" : "") + (Math.round(summary.returnRate * 100) / 100).toFixed(2) + "%" : "-";
        noteReturnRate.classList.toggle("positive", summary.returnRate >= 0);
        noteReturnRate.classList.toggle("negative", summary.returnRate < 0);
      }

      if (tableBody) {
        if (!items.length) {
          tableBody.innerHTML = '<tr><td colspan="4">저장된 투자노트가 없습니다.</td></tr>';
        } else {
          tableBody.innerHTML = items.map(function (item, index) {
            const amount = Number(item.price || 0) * Number(item.qty || 0);
            const typeText = tradeLabel(item, index);
            return ''
              + '<tr>'
              + '<td>' + typeText + '</td>'
              + '<td>' + formatWon(item.price) + '</td>'
              + '<td>' + formatQty(item.qty) + '</td>'
              + '<td>' + formatWon(amount) + '</td>'
              + '</tr>';
          }).join("");
        }
      }
    }

    function update() {
      const items = getRowsFromDom();

      rowsWrap.querySelectorAll(".avg-calc-row-item").forEach(function (row) {
        const price = toNumber(row.querySelector(".avg-price-input") && row.querySelector(".avg-price-input").value);
        const qty = toNumber(row.querySelector(".avg-qty-input") && row.querySelector(".avg-qty-input").value);
        const out = row.querySelector(".avg-amount-output");
        if (out) out.textContent = price && qty ? formatNumber(Math.round(price * qty)) : "-";
      });

      const summary = calcSummary(items);

      if (totalQtyEl) totalQtyEl.textContent = formatQty(summary.holdQty);
      if (totalAmountEl) totalAmountEl.textContent = formatWon(summary.buyAmount);
      if (averageEl) averageEl.textContent = formatWon(summary.average);

      if (profitLossEl) {
        profitLossEl.classList.remove("positive", "negative");
        profitLossEl.textContent = summary.holdQty > 0 ? (summary.profit > 0 ? "+" : "") + formatNumber(Math.round(summary.profit)) + "원" : "-";
        if (summary.holdQty > 0) profitLossEl.classList.add(summary.profit >= 0 ? "positive" : "negative");
      }

      if (returnRateEl) {
        returnRateEl.classList.remove("positive", "negative");
        returnRateEl.textContent = summary.holdQty > 0 ? (summary.returnRate > 0 ? "+" : "") + (Math.round(summary.returnRate * 100) / 100).toFixed(2) + "%" : "-";
        if (summary.holdQty > 0) returnRateEl.classList.add(summary.returnRate >= 0 ? "positive" : "negative");
      }

      updateChartInvestmentLines(summary, items);
      renderModal(summary, items);
      updateNoteStylePreview(summary, items);
      scheduleSave();
    }

    function resetRows() {
      rowsWrap.innerHTML = "";
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
      if (memoInput) memoInput.value = "";
      applyNoteStyle(DEFAULT_NOTE_STYLE);
      applyAvgLineStyle(DEFAULT_AVG_LINE);
      update();
    }

    const loaded = loadNote();
    applyNoteStyle(loaded.style || DEFAULT_NOTE_STYLE);
    applyAvgLineStyle(loaded.avgLine || DEFAULT_AVG_LINE);
    if (memoInput) memoInput.value = loaded.memo || "";

    if (loaded.rows && loaded.rows.length) {
      loaded.rows.forEach(function (item) { createRow(item); });
    } else {
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
      createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        createRow({ type: "buy", lineStyle: "dashed", lineWidth: 1, lineColor: "#60a5fa" });
        update();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        resetRows();
        localStorage.removeItem(storageKey);
      });
    }

    if (myStockSaveBtn) {
      myStockSaveBtn.addEventListener("click", function () {
        saveNote(false);
        update();
        const oldText = myStockSaveBtn.textContent;
        myStockSaveBtn.textContent = "저장됨";
        myStockSaveBtn.classList.add("saved");
        setTimeout(function () {
          myStockSaveBtn.textContent = oldText || "저장하기";
          myStockSaveBtn.classList.remove("saved");
          if (modal) {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
          }
        }, 500);
      });
    }

    if (myStockDeleteBtn) {
      myStockDeleteBtn.addEventListener("click", function () {
        localStorage.removeItem(storageKey);
        resetRows();
        if (modal) modal.classList.remove("open");
      });
    }

    if (openMyStockBtn && modal) {
      openMyStockBtn.addEventListener("click", function () {
        update();
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
      });
    }

    if (closeModalBtn && modal) {
      closeModalBtn.addEventListener("click", function () {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
      });
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) {
          modal.classList.remove("open");
          modal.setAttribute("aria-hidden", "true");
        }
      });
    }

    document.querySelectorAll(".note-color-control").forEach(function (control) {
      const trigger = control.querySelector("[data-note-color-button]");
      const popover = control.querySelector("[data-note-popover]");

      if (trigger && popover) {
        trigger.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();

          const willOpen = !popover.classList.contains("open");
          closeNoteColorPopovers(control);

          if (willOpen) {
            positionFloatingPopover(popover, trigger);
            popover.classList.add("open");
            trigger.classList.add("active");
          }
        });

        popover.addEventListener("click", function (event) {
          const dot = event.target.closest("button[data-color]");
          if (!dot) return;

          event.preventDefault();
          event.stopPropagation();

          const field = control.dataset.noteField;
          if (!field) return;

          noteStyle[field] = normalizeNoteColor(dot.dataset.color, noteStyle[field] || DEFAULT_NOTE_STYLE[field]);
          applyNoteStyle(noteStyle);
          saveNote(true);
          update();

          popover.classList.remove("open");
          trigger.classList.remove("active");
        });
      }
    });

    if (avgLineColorButton && avgLineColorPopover) {
      avgLineColorButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const willOpen = !avgLineColorPopover.classList.contains("open");
        closeNoteColorPopovers(avgLineColorButton.closest("[data-avgline-color-control]"));

        if (willOpen) {
          positionFloatingPopover(avgLineColorPopover, avgLineColorButton);
          avgLineColorPopover.classList.add("open");
          avgLineColorButton.classList.add("active");
        }
      });

      avgLineColorPopover.addEventListener("click", function (event) {
        const dot = event.target.closest("button[data-color]");
        if (!dot) return;

        event.preventDefault();
        event.stopPropagation();

        avgLineStyle.color = normalizeColor(dot.dataset.color, DEFAULT_AVG_LINE.color);
        applyAvgLineStyle(avgLineStyle);
        saveNote(true);
        update();

        avgLineColorPopover.classList.remove("open");
        avgLineColorButton.classList.remove("active");
      });
    }

    if (avgLineStyleSelect) {
      avgLineStyleSelect.addEventListener("change", function () {
        avgLineStyle.lineStyle = normalizeLineStyle(avgLineStyleSelect.value);
        applyAvgLineStyle(avgLineStyle);
        saveNote(true);
        update();
      });
    }

    if (avgLineWidthSelect) {
      avgLineWidthSelect.addEventListener("change", function () {
        avgLineStyle.lineWidth = normalizeLineWidth(avgLineWidthSelect.value);
        applyAvgLineStyle(avgLineStyle);
        saveNote(true);
        update();
      });
    }

    if (memoInput) {
      memoInput.addEventListener("input", scheduleSave);
      memoInput.addEventListener("change", scheduleSave);
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest(".avg-line-color-wrap")) return;
      closeAllColorPopovers(null);
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest(".note-color-control") || event.target.closest("[data-avgline-color-control]")) return;
      closeNoteColorPopovers(null);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAllColorPopovers(null);
        closeNoteColorPopovers(null);
      }
    });

    window.addEventListener("resize", function () {
      closeNoteColorPopovers(null);
    });

    document.addEventListener("bitgak:chart-data-loaded", function () { update(); });

    update();
  }


  /* =========================================================
     Insight snapshot API
     - 상세 글 iframe에서 작성자가 저장한 드로잉/화면 범위를 임시 적용
     - 방문자가 움직여도 서버/localStorage에 저장하지 않음
     ========================================================= */
  function cloneInsightValue(value) {
    try { return JSON.parse(JSON.stringify(value || null)); } catch (e) { return null; }
  }


  function getStoredInsightIndicators() {
    try {
      if (window.BitgakIndicators && typeof window.BitgakIndicators.getIndicators === "function") {
        return window.BitgakIndicators.getIndicators() || [];
      }
    } catch (e) {}

    try {
      const saved = JSON.parse(localStorage.getItem("bitgak_chart_indicators_v5_tv") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (e) {
      return [];
    }
  }

  function applyStoredInsightIndicators(indicators) {
    if (!Array.isArray(indicators)) return;

    try {
      if (window.BitgakIndicators && typeof window.BitgakIndicators.setIndicators === "function") {
        window.BitgakIndicators.setIndicators(indicators);
        return;
      }
    } catch (e) {}

    // 인사이트 iframe에서는 stock_detail의 개인 localStorage 지표 설정을 건드리지 않는다.
    // 지표 스크립트가 이미 로드되어 있으면 API로 바로 적용하고, 아니면 이벤트로만 전달한다.
    if (state.insightEditorMode || state.insightSnapshotMode) {
      try {
        document.dispatchEvent(new CustomEvent("bitgak:apply-insight-indicators", { detail: { indicators: indicators || [] } }));
      } catch (e) {}
      return;
    }

    try {
      localStorage.setItem("bitgak_chart_indicators_v5_tv", JSON.stringify(indicators || []));
    } catch (e) {}

    try {
      document.dispatchEvent(new CustomEvent("bitgak:apply-insight-indicators", { detail: { indicators: indicators || [] } }));
    } catch (e) {}
  }

  function serializeSvgToDataUrl(svg, width, height) {
    if (!svg || !svg.children || !svg.children.length) return "";
    try {
      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      clone.setAttribute("viewBox", "0 0 " + width + " " + height);
      const xml = new XMLSerializer().serializeToString(clone);
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    } catch (e) {
      return "";
    }
  }

  function captureInsightThumbnail() {
    return new Promise(function (resolve) {
      try {
        const target = chartWrap || chartEl;
        if (!target) { resolve(""); return; }

        const rect = target.getBoundingClientRect();
        const sourceWidth = Math.max(1, Math.round(rect.width || target.clientWidth || 900));
        const sourceHeight = Math.max(1, Math.round(rect.height || target.clientHeight || 520));
        const maxWidth = 1280;
        const maxHeight = 720;
        const scale = Math.min(1.35, maxWidth / sourceWidth, maxHeight / sourceHeight);
        const width = Math.max(320, Math.round(sourceWidth * scale));
        const height = Math.max(180, Math.round(sourceHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(""); return; }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        const canvases = Array.from(target.querySelectorAll("canvas"));
        canvases.forEach(function (item) {
          try {
            const itemRect = item.getBoundingClientRect();
            const x = (itemRect.left - rect.left) * scale;
            const y = (itemRect.top - rect.top) * scale;
            const w = itemRect.width * scale;
            const h = itemRect.height * scale;
            if (w > 0 && h > 0) ctx.drawImage(item, x, y, w, h);
          } catch (e) {}
        });

        const svgUrl = serializeSvgToDataUrl(drawingLayer, sourceWidth, sourceHeight);
        if (!svgUrl) {
          resolve(canvas.toDataURL("image/jpeg", 0.88));
          return;
        }

        const img = new Image();
        img.onload = function () {
          try { ctx.drawImage(img, 0, 0, width, height); } catch (e) {}
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = function () {
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.src = svgUrl;
      } catch (e) {
        resolve("");
      }
    });
  }

  function captureInsightSnapshot() {
    let visibleLogicalRange = null;
    try {
      if (chart.timeScale && chart.timeScale().getVisibleLogicalRange) {
        visibleLogicalRange = chart.timeScale().getVisibleLogicalRange();
      }
    } catch (e) {}

    return {
      version: 1,
      source: "bitgakview",
      code: code,
      name: state.payload && state.payload.name ? state.payload.name : (app.dataset.name || ""),
      interval: state.interval || "1d",
      apiUrl: app.dataset.apiUrl || "",
      chartUrl: app.dataset.chartUrl || window.location.pathname,
      capturedAt: new Date().toISOString(),
      visibleLogicalRange: visibleLogicalRange,
      drawings: cloneInsightValue(state.drawings || []) || [],
      indicators: cloneInsightValue(getStoredInsightIndicators() || []) || []
    };
  }

  function applyInsightVisibleRange(snapshot) {
    if (!snapshot) return;
    const range = snapshot.visibleLogicalRange || snapshot.logicalRange || null;
    if (!range) return;

    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;

    try {
      chart.timeScale().setVisibleLogicalRange({ from: from, to: to });
    } catch (e) {}
  }

  function applyInsightSnapshotPayload(snapshot, shouldRender) {
    const source = snapshot || {};
    const drawings = Array.isArray(source.drawings) ? source.drawings : [];

    state.drawings = drawings.map(normalizeDrawing).filter(Boolean);
    if (Array.isArray(source.indicators)) applyStoredInsightIndicators(source.indicators);
    state.tempDrawing = null;
    state.selectedDrawingId = null;
    state.isDrawing = false;
    state.fiboStage = 0;

    applyInsightVisibleRange(source);
    if (shouldRender !== false) renderDrawings();

    setTimeout(function () {
      applyInsightVisibleRange(source);
      renderDrawings();
    }, 120);
  }

  function applyInsightSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;

    state.insightSnapshotMode = true;
    state.insightSnapshot = cloneInsightValue(snapshot) || snapshot;

    const nextInterval = normalizeIntervalValue(snapshot.interval || state.interval || "1d");
    if (nextInterval && nextInterval !== state.interval && ["1h", "2h", "3h", "4h", "1d", "1w", "1mo"].includes(nextInterval)) {
      state.interval = nextInterval;
      applyIntervalChartOptions();
      if (intervalDropdown) {
        intervalDropdown.querySelectorAll("[data-interval]").forEach(function (node) {
          node.classList.toggle("active", normalizeIntervalValue(node.dataset.interval) === state.interval);
        });
      }
      if (currentIntervalText) currentIntervalText.textContent = getIntervalMeta(state.interval).label || state.interval;
      loadChartData();
      return true;
    }

    applyInsightSnapshotPayload(state.insightSnapshot, true);
    return true;
  }

  function isTrustedInsightMessage(event) {
    if (event.source && event.source === window.parent) return true;

    const origin = String(event.origin || "");
    const here = String(window.location.origin || "");
    if (origin && here && here !== "null" && origin === here) return true;

    const base = getBitgakBaseUrl();
    if (origin && base && origin === base) return true;

    return false;
  }

  window.addEventListener("message", function (event) {
    if (!isTrustedInsightMessage(event)) return;
    const data = event.data || {};
    if (!data || data.type !== "bitgak:capture-insight-snapshot-request") return;

    const snapshot = captureInsightSnapshot();
    function sendSnapshot(thumbnailDataUrl) {
      if (thumbnailDataUrl) snapshot.thumbnailDataUrl = thumbnailDataUrl;
      try {
        event.source.postMessage({
          type: "bitgak:insight-snapshot-response",
          requestId: data.requestId || "",
          snapshot: snapshot,
        }, event.origin && event.origin !== "null" ? event.origin : "*");
      } catch (e) {}
    }
    if (data.noThumbnail) {
      sendSnapshot("");
      return;
    }
    captureInsightThumbnail().then(sendSnapshot);
  });

  window.addEventListener("message", function (event) {
    if (!isTrustedInsightMessage(event)) return;
    const data = event.data || {};
    if (!data || data.type !== "bitgak:apply-insight-snapshot") return;
    applyInsightSnapshot(data.snapshot || {});
  });

  window.BitgakChart = {
    app,
    code,
    chart,
    candleSeries,
    state,
    formatNumber,
    normalizeTime,
    normalizeTimeForDisplay,
    normalizeIntervalValue,
    getRows: function () { return state.rows; },
    getBaseRows: function () { return state.baseRows; },
    getChartContainer: function () { return chartWrap || chartEl; },
    resize: resizeChart,
    getIntervalMeta,
    configureIndicatorPanes,
    ensureIndicatorPane,
    addPaneLineSeries,
    addPaneHistogramSeries,
    syncPaneTimeScales,
    refreshPaneLabels: updatePaneLabels,
    setMainIndicatorLabels,
    setPaneLabel,
    addLineSeries,
    addHistogramSeries,
    removeSeries: function (series) {
      if (!series) return;
      try { chart.removeSeries(series); } catch (e) {}
      setTimeout(function () {
        layoutPanes();
        updatePaneLabels();
      }, 0);
    },
    setVolumeVisible: function () {},
    getDrawings: function () { return cloneInsightValue(state.drawings || []) || []; },
    setDrawings: function (drawings) {
      state.drawings = (Array.isArray(drawings) ? drawings : []).map(normalizeDrawing).filter(Boolean);
      renderDrawings();
    },
    getVisibleLogicalRange: function () {
      try { return chart.timeScale().getVisibleLogicalRange(); } catch (e) { return null; }
    },
    captureInsightSnapshot,
    applyInsightSnapshot,
    loadChartData,
  };

  const initialIntervalBtn = intervalDropdown
    ? intervalDropdown.querySelector("[data-interval].active") || intervalDropdown.querySelector("[data-interval='1d']")
    : null;

  if (initialIntervalBtn) {
    state.interval = normalizeIntervalValue(initialIntervalBtn.dataset.interval || "1d");
    if (!["1h", "2h", "3h", "4h", "1d", "1w", "1mo"].includes(state.interval)) state.interval = "1d";
    if (currentIntervalText) {
      currentIntervalText.textContent = initialIntervalBtn.dataset.label || getIntervalMeta(state.interval).label || initialIntervalBtn.textContent.trim();
    }
  }

  const queryInterval = normalizeIntervalValue(insightUrlParams.get("interval") || "");
  if (["1h", "2h", "3h", "4h", "1d", "1w", "1mo"].includes(queryInterval)) {
    state.interval = queryInterval;
    if (intervalDropdown) {
      intervalDropdown.querySelectorAll("[data-interval]").forEach(function (node) {
        node.classList.toggle("active", normalizeIntervalValue(node.dataset.interval) === state.interval);
      });
    }
    if (currentIntervalText) currentIntervalText.textContent = getIntervalMeta(state.interval).label || state.interval;
  }

  applyIntervalChartOptions();
  installAverageCalculator();
  resizeChart();
  loadChartData();
})();
