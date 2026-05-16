(function () {
  if (window.__BITGAK_CHART_CORE_LOADED__) return;
  window.__BITGAK_CHART_CORE_LOADED__ = true;

  const LW = window.LightweightCharts;
  const app = document.querySelector(".bv-app");
  if (!app || !LW) return;

  const code = app.dataset.code || "005930";
  const apiUrl = app.dataset.apiUrl || "/stocks/api/chart/";

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
    drawings: [],
    tempDrawing: null,
    isDrawing: false,
    startPoint: null,
    requestToken: 0,
    activePaneTypes: [],
  };

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
      handleScroll: true,
      handleScale: true,
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

  function normalizePaneType(type) {
    const key = String(type || "").toLowerCase();
    return PANE_LABELS[key] ? key : "";
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

    if (paneLabelEls.has(fixed)) {
      const el = paneLabelEls.get(fixed);
      el.textContent = label || PANE_LABELS[fixed] || fixed.toUpperCase();
      return el;
    }

    const el = document.createElement("div");
    el.className = "bv-v5-pane-label bv-v5-pane-label-" + fixed;
    el.textContent = label || PANE_LABELS[fixed] || fixed.toUpperCase();
    overlayEl.appendChild(el);
    paneLabelEls.set(fixed, el);
    return el;
  }


  function setPaneLabel(type, text, color) {
    const fixed = normalizePaneType(type);
    if (!fixed) return;

    const labelText = text || PANE_LABELS[fixed] || fixed.toUpperCase();
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
      if (type === "volume") return 118;
      if (type === "rsi") return 158;
      if (type === "macd") return 172;
      if (type === "stoch") return 158;
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

      el.textContent = el.dataset.paneLabelText || PANE_LABELS[type] || type.toUpperCase();
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

    const preferredHeights = activeTypes.map(function (type) {
      if (type === "volume") return 118;
      if (type === "rsi") return 158;
      if (type === "macd") return 172;
      if (type === "stoch") return 158;
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

    try {
      if (panes[0] && panes[0].setHeight) panes[0].setHeight(mainHeight);

      for (let i = 1; i < panes.length; i++) {
        if (!panes[i] || !panes[i].setHeight) continue;
        panes[i].setHeight(i <= paneCount ? paneHeights[i - 1] : 1);
      }
    } catch (e) {}

    updatePaneLabels();
  }

  function configureIndicatorPanes(types) {
    state.activePaneTypes = uniquePaneTypes(types);
    rebuildPaneIndexMap(state.activePaneTypes);

    state.activePaneTypes.forEach(function (type) {
      ensurePaneLabel(type, PANE_LABELS[type]);
    });

    setTimeout(function () {
      layoutPanes();
      fitOrKeepVisibleRange(false);
    }, 0);
  }

  function ensureIndicatorPane(type, label) {
    const fixed = normalizePaneType(type);
    if (!fixed) return null;
    getPaneIndex(fixed);
    return ensurePaneLabel(fixed, label || PANE_LABELS[fixed]);
  }

  function getPaneScaleMargins(type) {
    const fixed = normalizePaneType(type);
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
    ensureIndicatorPane(fixed, PANE_LABELS[fixed]);

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
    ensureIndicatorPane(fixed, PANE_LABELS[fixed]);

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

  function buildApiUrl() {
    const candidate = getRequestCandidate();
    const url = new URL(apiUrl, window.location.origin);

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
      candleSeries.setData(rowsToOhlcData(state.rows));
      updateHeaderInfo(data);

      layoutPanes();
      fitOrKeepVisibleRange(true);
      loadDrawingsFromStorage();
      renderDrawings();

      document.dispatchEvent(new CustomEvent("bitgak:chart-data-loaded", {
        bubbles: true,
        detail: {
          rows: state.rows,
          baseRows: state.baseRows,
          payload: data,
          interval: state.interval,
        },
      }));

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
    fibo: "fibo", fib: "fibo", fib_channel: "fibo", fibonacci: "fibo",
    undo: "undo", clear: "clear", trash: "clear", delete: "clear"
  };

  const DRAWING_TOOL_TITLES = {
    cursor: "십자 선택",
    trend: "라인",
    extend: "연장선",
    hline: "수평선",
    vline: "수직선",
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

  function normalizeDrawing(drawing) {
    if (!drawing) return null;
    const type = normalizeDrawingTool(drawing.type || "trend");
    const defaults = DRAWING_DEFAULTS[type] || DRAWING_DEFAULTS.trend;
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

  function saveDrawingsToStorage() {
    try {
      localStorage.setItem(drawingStorageKey(), JSON.stringify(state.drawings || []));
    } catch (e) {}
  }

  function loadDrawingsFromStorage() {
    const collected = [];
    const seen = new Set();

    function appendSavedList(raw) {
      if (!raw) return;

      try {
        const saved = JSON.parse(raw);
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

    state.drawings = collected;
    saveDrawingsToStorage();
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

  function getLocalPoint(event) {
    const rect = chartEl.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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

  function clearSvg() {
    while (drawingLayer.firstChild) drawingLayer.removeChild(drawingLayer.firstChild);
  }

  function appendSvg(tag, attrs, parent) {
    const el = svgEl(tag, attrs || {});
    (parent || drawingLayer).appendChild(el);
    return el;
  }

  function getLayerSize() {
    return {
      width: Number(drawingLayer.getAttribute("width")) || drawingLayer.clientWidth || chartEl.clientWidth || chartWrap.clientWidth || 1,
      height: Number(drawingLayer.getAttribute("height")) || drawingLayer.clientHeight || chartEl.clientHeight || chartWrap.clientHeight || 1,
    };
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

  function drawCrosshairGuide() {
    if (!state.crosshairValue || !state.crosshairPoint) return;

    const size = getLayerSize();
    const p = state.crosshairPoint;
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
    if (drawing.type === "fibo") drawFibo(drawing, isTemp);
  }

  function renderDrawings() {
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
    setDrawingTool("cursor", { keepSelection: true });
  }

  let drawingPointerCandidate = null;
  let suppressNextDrawingClick = false;
  let lastDrawingClick = { id: null, time: 0 };
  let crosshairRaf = null;

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
    if (!hit) return;

    beginDrawingDrag(event, hit);
  }

  function handleChartWrapDrawingClick(event) {
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

  function updateDrawingCrosshairFromPointer(event) {
    if (!event || drawingDrag) return;
    const resolved = pointFromEvent(event);
    if (!resolved) return;

    state.crosshairPoint = resolved.point;
    state.crosshairValue = resolved.value;

    if (crosshairRaf) return;
    crosshairRaf = requestAnimationFrame(function () {
      crosshairRaf = null;
      renderDrawings();
    });
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

    if (active === "trend" || active === "extend") {
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

    if (state.hoverDrawingId && active === "cursor") {
      drawingLayer.style.cursor = "move";
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

    if (["hline", "vline", "trend", "extend", "fibo"].includes(active)) {
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
    if (!hit || !hit.id) return;

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
      const dx = event.clientX - drawingPointerCandidate.startClientX;
      const dy = event.clientY - drawingPointerCandidate.startClientY;
      const isTap = Math.hypot(dx, dy) < 12;
      try { drawingLayer.releasePointerCapture(drawingPointerCandidate.pointerId); } catch (e) {}
      drawingPointerCandidate = null;
      if (isTap) {
        suppressNextDrawingClick = true;
        processDrawingToolTap(event);
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
    if (normalizeDrawingTool(state.activeTool) === "cursor") chart.applyOptions({ handleScroll: true, handleScale: true });
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

  function openDrawingSettings(drawing) {
    drawing = normalizeDrawing(drawing);
    const modal = ensureDrawingSettingsModal();
    const body = modal.querySelector("#drawingSettingsBody");
    const type = drawing.type;
    modal.querySelector("#drawingSettingsTitle").textContent = drawingTitle(type) + " 설정";
    body.dataset.drawingId = drawing.id;

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

    body.innerHTML = `
      <div class="bv-drawing-setting-grid">
        ${drawingColorButton("drawColor", "색상", drawing.color)}
        <label class="bv-drawing-setting-field"><span>선 굵기</span><select id="drawWidth"><option value="1">1px</option><option value="2">2px</option><option value="3">3px</option><option value="4">4px</option><option value="5">5px</option><option value="6">6px</option></select></label>
        ${extendFields}
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

  function applyDrawingSettings() {
    const modal = ensureDrawingSettingsModal();
    const body = modal.querySelector("#drawingSettingsBody");
    const drawing = getDrawingById(body.dataset.drawingId);
    if (!drawing) return;

    pushDrawingHistory();
    drawing.color = normalizeDrawingColor((body.querySelector("#drawColor") || {}).value, drawing.color);
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
    if (fillEl) drawing.fill = !!fillEl.checked;
    if (opacityEl) drawing.opacity = Math.min(0.85, Math.max(0.02, Number(opacityEl.value || 0.14)));

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
      fibo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 20 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13 19 1" stroke="currentColor" stroke-width="1.35" opacity=".48"/><path d="M6 22 22 10" stroke="currentColor" stroke-width="1.35" opacity=".48"/></svg>',
      undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12c1.4-4.2 5-6.4 9-5.6 4 .8 6.8 4.4 6.4 8.5-.4 4-3.8 7.1-7.9 7.1-2.7 0-5.2-1.3-6.7-3.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
      clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 4h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 11v5M14 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    };
    return icons[name] || icons.cursor;
  }

  function installDrawingUiSkin() {
    if (!document.getElementById("bitgakDrawingUiStyle")) {
      const style = document.createElement("style");
      style.id = "bitgakDrawingUiStyle";
      style.textContent = `
        #chartWrap, #tvChart { cursor: crosshair; }
        #drawingLayer { touch-action: none; pointer-events: none; overflow: visible; }
        .drawing-mode #drawingLayer { pointer-events: auto; }
        #drawingLayer.has-drawings .bv-drawing-hit { cursor: move; pointer-events: stroke; }
        #drawingLayer.has-drawings .bv-drawing-handle { pointer-events: all; cursor: grab; filter: drop-shadow(0 1px 2px rgba(15,23,42,.24)); }
        #drawingLayer.has-drawings .bv-drawing-handle:active { cursor: grabbing; }
        #drawingLayer .bv-drawing-line, #drawingLayer .bv-drawing-preview, #drawingLayer .bv-drawing-fill, #drawingLayer .bv-drawing-axis-badge, #drawingLayer .bv-drawing-axis-badge-text, #drawingLayer .bv-drawing-crosshair-guide * { pointer-events: none; }
        #drawingLayer .bv-drawing-preview { opacity: .94; }
        #chartWrap, #tvChart { overflow: visible; }
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
        [data-tool] svg { width: 18px; height: 18px; display: block; }
      `;
      document.head.appendChild(style);
    }

    document.querySelectorAll("[data-tool]").forEach(function (btn) {
      const tool = normalizeDrawingTool(btn.dataset.tool);
      if (!DRAWING_TOOL_TITLES[tool]) return;
      btn.innerHTML = svgIcon(tool);
      btn.title = DRAWING_TOOL_TITLES[tool];
      btn.setAttribute("aria-label", DRAWING_TOOL_TITLES[tool]);
      btn.classList.toggle("active", normalizeDrawingTool(state.activeTool) === tool);
    });
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

    const drawingMode = fixed !== "cursor";
    chartWrap.classList.toggle("drawing-mode", drawingMode);
    drawingLayer.style.cursor = "crosshair";

    chart.applyOptions({
      handleScroll: !drawingMode,
      handleScale: !drawingMode,
    });

    renderDrawings();
  }

  chartWrap.addEventListener("pointerdown", handleChartWrapDrawingPointerDown, true);
  chartWrap.addEventListener("click", handleChartWrapDrawingClick, true);
  chartWrap.addEventListener("dblclick", handleChartWrapDrawingDoubleClick, true);
  chartWrap.addEventListener("contextmenu", handleChartWrapDrawingContextMenu, true);

  drawingLayer.addEventListener("click", handleDrawingClick);
  drawingLayer.addEventListener("pointermove", handleDrawingMove);
  chartWrap.addEventListener("pointermove", updateDrawingCrosshairFromPointer, { passive: true });
  chartEl.addEventListener("pointermove", updateDrawingCrosshairFromPointer, { passive: true });
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

  installDrawingUiSkin();

  chart.subscribeCrosshairMove(function (param) {
    if (param && param.time && param.point && Number.isFinite(param.point.x) && Number.isFinite(param.point.y)) {
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price !== null && price !== undefined && !Number.isNaN(Number(price))) {
        state.crosshairPoint = { x: param.point.x, y: param.point.y };
        state.crosshairValue = { time: normalizeTime(param.time), price: Number(price) };
        renderDrawings();
      }
    } else if (!state.tempDrawing && !drawingDrag) {
      state.crosshairPoint = null;
      state.crosshairValue = null;
      renderDrawings();
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

  chart.timeScale().subscribeVisibleTimeRangeChange(renderDrawings);

  function resizeChart() {
    const width = Math.max(1, chartEl.clientWidth || chartWrap.clientWidth || 800);
    const height = Math.max(1, chartEl.clientHeight || chartWrap.clientHeight || 520);

    chart.applyOptions({ width, height });

    drawingLayer.setAttribute("width", width);
    drawingLayer.setAttribute("height", height);

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

  applyIntervalChartOptions();
  installAverageCalculator();
  resizeChart();
  loadChartData();
})();
