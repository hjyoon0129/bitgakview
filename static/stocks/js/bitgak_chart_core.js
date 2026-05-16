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
    macd: "MACD",
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

    // 현재 프로젝트에서는 분봉 API가 불안정하므로 분봉 요청은 1시간봉으로 안전하게 우회한다.
    // 2h/3h/4h는 서버에서 1h를 받은 뒤 프론트에서 OHLCV를 재집계한다.
    if (isMinuteInterval(key) || isHourInterval(key)) return "1h";
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

    const el = ensurePaneLabel(fixed, text || PANE_LABELS[fixed]);
    if (!el) return;

    el.textContent = text || PANE_LABELS[fixed] || fixed.toUpperCase();

    if (color) {
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
      el.style.display = "none";
    });

    if (!activeTypes.length) return;

    const preferredHeights = activeTypes.map(function (type) {
      if (type === "volume") return 118;
      if (type === "rsi") return 158;
      if (type === "macd") return 172;
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

      el.textContent = PANE_LABELS[type] || type.toUpperCase();
      el.style.display = "inline-flex";
      el.style.top = (top + 12) + "px";
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

  function addPaneLineSeries(type, options) {
    const fixed = normalizePaneType(type);
    if (!fixed) return addLineSeries(options || {});
    ensureIndicatorPane(fixed, PANE_LABELS[fixed]);

    return addSeries("LineSeries", Object.assign({
      color: "#2563eb",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    }, options || {}), getPaneIndex(fixed));
  }

  function addPaneHistogramSeries(type, options) {
    const fixed = normalizePaneType(type);
    if (!fixed) return addHistogramSeries(options || {});
    ensureIndicatorPane(fixed, PANE_LABELS[fixed]);

    return addSeries("HistogramSeries", Object.assign({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, options || {}), getPaneIndex(fixed));
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
      const baseRows = aggregateHourlyRows(normalizedRows, state.interval);

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


  function setupDailyOnlyIntervalMenu() {
    if (!intervalDropdown) return;

    const allowed = new Set(["1d", "1w", "1mo"]);
    let activeIsHidden = false;
    let firstDailyButton = null;

    intervalDropdown.querySelectorAll("[data-interval]").forEach(function (btn) {
      const fixed = normalizeIntervalValue(btn.dataset.interval);

      if (!allowed.has(fixed)) {
        if (btn.classList.contains("active")) activeIsHidden = true;
        btn.classList.remove("active");
        btn.hidden = true;
        btn.classList.add("bv-interval-hidden-daily");
        btn.setAttribute("aria-hidden", "true");
        return;
      }

      btn.hidden = false;
      btn.classList.remove("bv-interval-hidden-minute", "bv-interval-hidden-duplicate", "bv-interval-hidden-daily");
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

  setupDailyOnlyIntervalMenu();

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
        if (!["1d", "1w", "1mo"].includes(value)) value = "1d";
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
      drawLine({ x: p1.x, y: 0 }, { x: p1.x, y: drawingLayer.clientHeight }, { stroke: "#7c3aed", width: 2 });
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

    drawLine({ x: 0, y: p.y }, { x: drawingLayer.clientWidth || chartEl.clientWidth, y: p.y }, { stroke: "#ef4444", width: 1.5, dash: "4 4" });
    drawText(formatNumber(Math.round(drawing.start.price)), 8, p.y - 9, { fill: "#ef4444" });
  }

  function drawVertical(drawing) {
    const p = valueToPoint(drawing.start);
    if (!p) return;

    drawLine({ x: p.x, y: 0 }, { x: p.x, y: drawingLayer.clientHeight || chartEl.clientHeight }, { stroke: "#64748b", width: 1.5, dash: "4 4" });
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

    try { drawingLayer.setPointerCapture(event.pointerId); } catch (e) {}

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
      if (distance > 8) state.drawings.push(Object.assign({}, state.tempDrawing));
    }

    state.isDrawing = false;
    state.startPoint = null;
    state.tempDrawing = null;

    try { drawingLayer.releasePointerCapture(event.pointerId); } catch (e) {}

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
    if (event.key === "Escape") {
      state.isDrawing = false;
      state.startPoint = null;
      state.tempDrawing = null;
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
    if (!["1d", "1w", "1mo"].includes(state.interval)) state.interval = "1d";
    if (currentIntervalText) {
      currentIntervalText.textContent = initialIntervalBtn.dataset.label || getIntervalMeta(state.interval).label || initialIntervalBtn.textContent.trim();
    }
  }

  applyIntervalChartOptions();
  installAverageCalculator();
  resizeChart();
  loadChartData();
})();
