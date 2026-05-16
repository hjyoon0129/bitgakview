(function () {
  if (window.__BITGAK_INDICATORS_LOADED__) return;
  window.__BITGAK_INDICATORS_LOADED__ = true;

  const api = window.BitgakChart;
  if (!api) return;

  const modal = document.getElementById("indicatorModal");
  const panel = modal ? modal.querySelector(".indicator-panel") : null;
  const openTopBtn = document.getElementById("openIndicatorBtn");
  const openSideBtn = document.getElementById("openIndicatorBtnSide");
  const searchInput = document.getElementById("indicatorSearchInput");
  const quickSearchInput = document.getElementById("indicatorQuickSearchInput");
  const quickSearchBtn = document.getElementById("indicatorQuickSearchBtn");
  const catalogEl = document.getElementById("indicatorCatalog");
  const settingsBox = document.getElementById("indicatorSettingsBox");
  const settingsTitle = document.getElementById("indicatorSettingsTitle");
  const activeSettingsEl = document.getElementById("activeIndicatorList");
  const applyBtn = document.getElementById("applyIndicatorSettings");
  const rightList = document.getElementById("rightIndicatorList");
  const countEl = document.getElementById("activeIndicatorCount");

  if (!modal || !catalogEl || !rightList) return;

  const STORAGE_KEY = "bitgak_chart_indicators_v5_tv";
  const LEGACY_KEYS = ["bitgak_chart_indicators_v3", "bitgak_chart_indicators_v2", "bitgakview_applied_indicators_v2"];
  const FAVORITE_KEY = "bitgak_indicator_favorites_v1";

  const PALETTE_COLORS = [
    "#ff4568", "#ff9f1c", "#55d400", "#19aeca", "#3b82f6", "#7c64d8",
    "#ec4899", "#ff6b2c", "#2db84d", "#3aa0cf", "#466bd3", "#9b5de5",
    "#e12ab3", "#dc5f2d", "#36b37e", "#14b8a6", "#5b61b2", "#c13ee4",
    "#fb9aaa", "#ffd19a", "#9be66d", "#7ed3e3", "#93c5fd", "#b8abe3",
    "#ffffff", "#d1d5db", "#9ca3af", "#6b7280", "#374151", "#111827"
  ];

  const SOURCE_OPTIONS = [
    { value: "close", label: "종가" },
    { value: "open", label: "시가" },
    { value: "high", label: "고가" },
    { value: "low", label: "저가" },
    { value: "hl2", label: "고저평균" },
    { value: "ohlc4", label: "OHLC평균" },
  ];

  const METHOD_OPTIONS = [
    { value: "sma", label: "단순" },
    { value: "ema", label: "지수" },
  ];

  const WIDTH_OPTIONS = [1, 2, 3, 4, 5, 6].map(function (v) {
    return { value: String(v), label: v + "px ━" };
  });

  const VISIBLE_OPTIONS = [
    { value: "true", label: "표시" },
    { value: "false", label: "숨김" },
  ];

  const DEFAULT_MA_LINES = [
    { id: "ma_5", visible: true, period: 5, width: 4, source: "close", method: "ema", color: "#19aeca" },
    { id: "ma_10", visible: true, period: 10, width: 2, source: "close", method: "ema", color: "#3b82f6" },
    { id: "ma_20", visible: true, period: 20, width: 2, source: "close", method: "ema", color: "#9be66d" },
    { id: "ma_60", visible: true, period: 60, width: 2, source: "close", method: "ema", color: "#36b37e" },
    { id: "ma_112", visible: true, period: 112, width: 4, source: "close", method: "sma", color: "#3b82f6" },
    { id: "ma_224", visible: true, period: 224, width: 4, source: "close", method: "sma", color: "#ff7a00" },
    { id: "ma_480", visible: false, period: 480, width: 2, source: "close", method: "ema", color: "#64748b" },
    { id: "ma_720", visible: false, period: 720, width: 2, source: "close", method: "ema", color: "#eab308" },
    { id: "ma_960", visible: false, period: 960, width: 2, source: "close", method: "ema", color: "#ec4899" },
    { id: "ma_1200", visible: false, period: 1200, width: 2, source: "close", method: "ema", color: "#19aeca" },
  ];

  const catalog = [
    {
      type: "ma_pack",
      name: "주가이동평균",
      shortName: "MA",
      desc: "5·10·20·60·112·224·480·720·960·1200선의 기간, 굵기, 색상, 기준가격, 단순/지수를 한 번에 설정합니다.",
      keywords: "ma moving average sma ema 이동평균 이평선 단순 지수 주가이동평균",
      defaultPeriod: 20,
      color: "#19aeca",
    },
    {
      type: "boll",
      name: "볼린저 밴드",
      shortName: "BOLL",
      desc: "이동평균과 표준편차로 가격 범위를 표시합니다.",
      keywords: "boll bollinger bands 볼린저 밴드 bb",
      defaultPeriod: 20,
      color: "#8b5cf6",
    },
    {
      type: "volume",
      name: "거래량",
      shortName: "VOL",
      desc: "거래량 막대를 표시합니다.",
      keywords: "volume vol 거래량",
      defaultPeriod: 0,
      color: "#64748b",
    },
    {
      type: "rsi",
      name: "RSI",
      shortName: "RSI",
      desc: "상승과 하락 강도를 비교하는 모멘텀 지표입니다.",
      keywords: "rsi relative strength index 상대강도",
      defaultPeriod: 14,
      color: "#db2777",
    },
    {
      type: "macd",
      name: "MACD",
      shortName: "MACD",
      desc: "단기/장기 이동평균 차이를 보는 추세 지표입니다.",
      keywords: "macd signal histogram",
      defaultPeriod: 12,
      color: "#2563eb",
    },
  ];

  let indicators = [];
  let editingId = null;
  let favoriteTypes = readFavoriteTypes();
  let favoritePanelEl = null;
  let catalogLayoutReady = false;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[(){}\[\].,·ㆍ_\-]/g, "").trim();
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function fixType(type) {
    if (type === "bb") return "boll";
    if (type === "ma" || type === "ema") return "ma_pack";
    if (type === "vol") return "volume";
    return type || "ma_pack";
  }

  function getMeta(type) {
    const fixedType = fixType(type);
    return catalog.find(function (item) { return item.type === fixedType; }) || catalog[0];
  }

  function readFavoriteTypes() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITE_KEY));
      if (Array.isArray(saved)) return saved.map(fixType).filter(Boolean);
    } catch (e) {}
    return ["volume", "macd"];
  }

  function saveFavoriteTypes() {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(Array.from(new Set(favoriteTypes.map(fixType)))));
  }

  function isFavorite(type) {
    return favoriteTypes.includes(fixType(type));
  }

  function toggleFavorite(type) {
    const fixedType = fixType(type);
    if (isFavorite(fixedType)) favoriteTypes = favoriteTypes.filter(function (item) { return item !== fixedType; });
    else favoriteTypes.push(fixedType);
    favoriteTypes = Array.from(new Set(favoriteTypes.map(fixType)));
    saveFavoriteTypes();
    renderCatalog();
    renderFavoritePanel();
  }

  function starIcon(active) { return active ? "★" : "☆"; }

  function eyeIcon(visible) {
    if (visible) {
      return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.1 7.6C3.8 9.2 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.35 4-.9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  function trashIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  }

  function editIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  function optionLabel(options, value) {
    const found = options.find(function (item) { return String(item.value) === String(value); });
    return found ? found.label : String(value || "");
  }

  function customSelectHtml(options) {
    const items = options.options || [];
    const value = String(options.value ?? (items[0] ? items[0].value : ""));
    const label = optionLabel(items, value);
    const idAttr = options.id ? ' id="' + escapeHtml(options.id) + '"' : "";
    const fieldAttr = options.maField ? ' data-ma-field="' + escapeHtml(options.maField) + '"' : "";
    const nameClass = options.className ? " " + options.className : "";

    return `
      <div class="bv-select${nameClass}" data-bv-select>
        <button type="button" class="bv-select-btn" data-bv-select-btn>
          <span class="bv-select-label">${escapeHtml(label)}</span>
        </button>
        <input type="hidden"${idAttr}${fieldAttr} value="${escapeHtml(value)}">
        <div class="bv-select-menu" data-bv-select-menu>
          ${items.map(function (item) {
            const active = String(item.value) === value;
            return `<button type="button" class="bv-select-option ${active ? "active" : ""}" data-bv-select-option data-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function cloneDefaultMaLines() {
    return DEFAULT_MA_LINES.map(function (line) {
      return { ...line, id: line.id + "_" + Math.floor(Math.random() * 100000) };
    });
  }

  function normalizeMaLine(raw, index) {
    raw = raw || {};
    const fallback = DEFAULT_MA_LINES[index] || DEFAULT_MA_LINES[0];
    const source = SOURCE_OPTIONS.some(function (x) { return x.value === raw.source; }) ? raw.source : fallback.source;
    const method = METHOD_OPTIONS.some(function (x) { return x.value === raw.method; }) ? raw.method : fallback.method;
    return {
      id: raw.id || makeId("ma_line_" + index),
      visible: raw.visible !== false && raw.enabled !== false,
      period: clampNumber(raw.period, 1, 2000, fallback.period),
      width: clampNumber(raw.width, 1, 6, fallback.width),
      source,
      method,
      color: raw.color || fallback.color,
    };
  }

  function normalizeIndicator(raw) {
    if (!raw) return null;

    const legacyId = raw.id || raw.uid;
    const originalType = raw.type || legacyId;
    const type = fixType(originalType);
    const meta = getMeta(type);
    const settings = raw.settings || {};

    if (type === "ma_pack") {
      let lines = Array.isArray(raw.lines) ? raw.lines : null;
      if (!lines && Array.isArray(settings.lines)) {
        lines = settings.lines.map(function (line) {
          return {
            id: line.id,
            visible: line.visible !== false && line.enabled !== false,
            period: line.period,
            width: line.width,
            source: line.source || "close",
            method: String(line.type || line.method || "sma").toLowerCase(),
            color: line.color,
          };
        });
      }
      if (!lines && (originalType === "ma" || originalType === "ema")) {
        lines = [{
          id: raw.id || raw.uid || makeId("ma_line"),
          visible: raw.visible !== false,
          period: Number(raw.period || settings.period || meta.defaultPeriod || 20),
          width: Number(raw.width || settings.width || 2),
          source: raw.source || settings.source || "close",
          method: originalType === "ema" ? "ema" : "sma",
          color: raw.color || settings.color || meta.color,
        }];
      }
      if (!lines) lines = cloneDefaultMaLines();

      const fixedLines = lines.map(normalizeMaLine);
      DEFAULT_MA_LINES.forEach(function (line, index) {
        if (!fixedLines[index]) fixedLines[index] = normalizeMaLine({ ...line }, index);
      });

      return {
        id: raw.id || raw.uid || makeId("ma_pack"),
        type: "ma_pack",
        visible: raw.visible !== false,
        lines: fixedLines.slice(0, 10),
        series: [],
      };
    }

    return {
      id: raw.id || raw.uid || makeId(type),
      type,
      period: Number(raw.period || settings.period || meta.defaultPeriod || 20),
      fast: Number(raw.fast || settings.fast || 12),
      slow: Number(raw.slow || settings.slow || 26),
      signal: Number(raw.signal || settings.signal || 9),
      source: raw.source || settings.source || (type === "volume" ? "volume" : "close"),
      color: raw.color || settings.color || meta.color,
      width: Number(raw.width || settings.width || 2),
      visible: raw.visible !== false,
      series: [],
    };
  }

  function readStoredIndicators() {
    const keys = [STORAGE_KEY].concat(LEGACY_KEYS);
    for (const key of keys) {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved)) return saved;
      } catch (e) {}
    }
    return [];
  }

  function loadIndicators() {
    indicators = readStoredIndicators().map(normalizeIndicator).filter(Boolean);
    saveIndicators();
  }

  function saveIndicators() {
    const plain = indicators.map(function (item) {
      if (item.type === "ma_pack") {
        return {
          id: item.id,
          type: item.type,
          visible: item.visible,
          lines: (item.lines || []).map(function (line) {
            return {
              id: line.id,
              visible: line.visible,
              period: line.period,
              width: line.width,
              source: line.source,
              method: line.method,
              color: line.color,
            };
          }),
        };
      }
      return {
        id: item.id,
        type: item.type,
        period: item.period,
        fast: item.fast,
        slow: item.slow,
        signal: item.signal,
        source: item.source,
        color: item.color,
        width: item.width,
        visible: item.visible,
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
  }

  function getSourceValue(row, source) {
    if (!row) return null;
    let value;
    if (source === "hl2") value = (Number(row.high) + Number(row.low)) / 2;
    else if (source === "ohlc4") value = (Number(row.open) + Number(row.high) + Number(row.low) + Number(row.close)) / 4;
    else value = Number(row[source || "close"]);
    return Number.isNaN(value) ? null : value;
  }

  function calcMA(rows, period, source) {
    const result = [];
    if (!period || period < 1) return result;
    for (let i = 0; i < rows.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      let valid = true;
      for (let j = i - period + 1; j <= i; j++) {
        const value = getSourceValue(rows[j], source);
        if (value === null) { valid = false; break; }
        sum += value;
      }
      if (valid) result.push({ time: rows[i].time, value: Math.round((sum / period) * 100) / 100 });
    }
    return result;
  }

  function calcEMA(rows, period, source) {
    const result = [];
    if (!period || period < 1 || rows.length < period) return result;
    const multiplier = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      const value = getSourceValue(rows[i], source);
      if (value === null) return result;
      sum += value;
    }
    let ema = sum / period;
    result.push({ time: rows[period - 1].time, value: Math.round(ema * 100) / 100 });
    for (let i = period; i < rows.length; i++) {
      const price = getSourceValue(rows[i], source);
      if (price === null) continue;
      ema = (price - ema) * multiplier + ema;
      result.push({ time: rows[i].time, value: Math.round(ema * 100) / 100 });
    }
    return result;
  }

  function calcLineMA(rows, line) {
    return line.method === "ema" ? calcEMA(rows, Number(line.period || 20), line.source || "close") : calcMA(rows, Number(line.period || 20), line.source || "close");
  }

  function calcBoll(rows, period, source) {
    const upper = [], middle = [], lower = [];
    if (!period || period < 2) return { upper, middle, lower };
    for (let i = 0; i < rows.length; i++) {
      if (i < period - 1) continue;
      const values = [];
      for (let j = i - period + 1; j <= i; j++) {
        const value = getSourceValue(rows[j], source);
        if (value !== null) values.push(value);
      }
      if (values.length !== period) continue;
      const mean = values.reduce(function (a, b) { return a + b; }, 0) / period;
      const variance = values.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / period;
      const std = Math.sqrt(variance);
      upper.push({ time: rows[i].time, value: Math.round((mean + std * 2) * 100) / 100 });
      middle.push({ time: rows[i].time, value: Math.round(mean * 100) / 100 });
      lower.push({ time: rows[i].time, value: Math.round((mean - std * 2) * 100) / 100 });
    }
    return { upper, middle, lower };
  }

  function calcRSI(rows, period) {
    const result = [];
    if (!period || rows.length <= period) return result;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = Number(rows[i].close) - Number(rows[i - 1].close);
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < rows.length; i++) {
      const diff = Number(rows[i].close) - Number(rows[i - 1].close);
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push({ time: rows[i].time, value: Math.round(rsi * 100) / 100 });
    }
    return result;
  }

  function calcSeriesMA(data, period) {
    const result = [];
    if (!period || period < 1 || !Array.isArray(data) || data.length < period) return result;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      let valid = true;

      for (let j = i - period + 1; j <= i; j++) {
        const value = Number(data[j].value);
        if (!Number.isFinite(value)) { valid = false; break; }
        sum += value;
      }

      if (valid) result.push({ time: data[i].time, value: Math.round((sum / period) * 100) / 100 });
    }

    return result;
  }

  function calcSeriesEMA(data, period) {
    const result = [];
    if (!period || period < 1 || !Array.isArray(data) || data.length < period) return result;

    const multiplier = 2 / (period + 1);
    let sum = 0;

    for (let i = 0; i < period; i++) {
      const value = Number(data[i].value);
      if (!Number.isFinite(value)) return result;
      sum += value;
    }

    let ema = sum / period;
    result.push({ time: data[period - 1].time, value: Math.round(ema * 100) / 100 });

    for (let i = period; i < data.length; i++) {
      const value = Number(data[i].value);
      if (!Number.isFinite(value)) continue;
      ema = (value - ema) * multiplier + ema;
      result.push({ time: data[i].time, value: Math.round(ema * 100) / 100 });
    }

    return result;
  }

  function buildConstantLine(rows, value) {
    return (rows || []).map(function (row) {
      return { time: row.time, value: value };
    });
  }

  function calcMACD(rows, fastPeriod, slowPeriod, signalPeriod) {
    const fast = calcEMA(rows, fastPeriod || 12, "close");
    const slow = calcEMA(rows, slowPeriod || 26, "close");
    const slowMap = new Map(slow.map(function (x) { return [String(x.time), x.value]; }));
    const macd = [];

    fast.forEach(function (x) {
      const slowValue = slowMap.get(String(x.time));
      if (slowValue === undefined) return;
      macd.push({ time: x.time, value: Math.round((x.value - slowValue) * 100) / 100 });
    });

    const signal = calcSeriesEMA(macd, signalPeriod || 9);
    const signalMap = new Map(signal.map(function (x) { return [String(x.time), x.value]; }));
    const histogram = [];

    macd.forEach(function (x) {
      const signalValue = signalMap.get(String(x.time));
      if (signalValue === undefined) return;

      const value = Math.round((x.value - signalValue) * 100) / 100;
      histogram.push({
        time: x.time,
        value: value,
        color: value >= 0 ? "rgba(20, 184, 166, 0.62)" : "rgba(248, 113, 113, 0.62)",
      });
    });

    return { macd, signal, histogram };
  }

  function clearSeries(indicator) {
    if (!indicator || !indicator.series) return;
    indicator.series.forEach(function (series) { api.removeSeries(series); });
    indicator.series = [];
  }

  function addLine(color, width) {
    return api.addLineSeries({
      color,
      lineWidth: clampNumber(width, 1, 6, 2),
      priceLineVisible: false,
      lastValueVisible: false,
    });
  }

  function addPaneLine(paneType, color, width, extraOptions) {
    const options = Object.assign({
      color,
      lineWidth: clampNumber(width, 1, 6, 2),
      priceLineVisible: false,
      lastValueVisible: false,
    }, extraOptions || {});

    if (api.addPaneLineSeries) return api.addPaneLineSeries(paneType, options);
    return api.addLineSeries(options);
  }

  function addPaneHistogram(paneType, extraOptions) {
    const options = Object.assign({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, extraOptions || {});

    if (api.addPaneHistogramSeries) return api.addPaneHistogramSeries(paneType, options);
    return api.addHistogramSeries(options);
  }

  function rowsToVolumeData(rows) {
    return (rows || []).map(function (row) {
      const up = Number(row.close) >= Number(row.open);
      return {
        time: row.time,
        value: Number(row.volume || 0),
        color: up ? "rgba(38, 166, 154, 0.45)" : "rgba(239, 83, 80, 0.45)",
      };
    });
  }


  function formatCompactNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "-";
    if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    return Math.round(n * 100) / 100;
  }

  function lastValueOf(data) {
    if (!Array.isArray(data) || !data.length) return null;
    const item = data[data.length - 1];
    if (!item) return null;
    if (item.value !== undefined) return item.value;
    if (item.close !== undefined) return item.close;
    return null;
  }


  function rebuildOne(indicator) {
    const rows = api.getRows();
    clearSeries(indicator);

    if (!indicator.visible) {
      if (indicator.type === "volume") api.setVolumeVisible(false);
      return;
    }

    if (indicator.type === "volume") {
      api.setVolumeVisible(false);
      if (api.ensureIndicatorPane) api.ensureIndicatorPane("volume", "거래량");
      const series = addPaneHistogram("volume", {
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const data = rowsToVolumeData(rows);
      series.setData(data);
      if (api.setPaneLabel) api.setPaneLabel("volume", "거래량", "#64748b");
      indicator.series = [series];
      return;
    }

    if (indicator.type === "ma_pack") {
      const created = [];
      (indicator.lines || []).forEach(function (line) {
        if (!line.visible) return;
        const series = addLine(line.color || "#ffffff", line.width || 2);
        series.setData(calcLineMA(rows, line));
        created.push(series);
      });
      indicator.series = created;
      return;
    }

    if (indicator.type === "boll") {
      const data = calcBoll(rows, Number(indicator.period || 20), indicator.source || "close");
      const upper = addLine(indicator.upperColor || "#ef4444", indicator.width || 2);
      const middle = addLine(indicator.middleColor || "#3b82f6", indicator.width || 2);
      const lower = addLine(indicator.lowerColor || "#14b8a6", indicator.width || 2);

      upper.setData(data.upper);
      middle.setData(data.middle);
      lower.setData(data.lower);

      indicator.series = [upper, middle, lower];
      return;
    }

    if (indicator.type === "rsi") {
      if (api.ensureIndicatorPane) api.ensureIndicatorPane("rsi", "RSI");

      const rsiData = calcRSI(rows, Number(indicator.period || 14));
      const rsiSeries = addPaneLine("rsi", indicator.color || "#8b5cf6", indicator.width || 2, {
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      rsiSeries.setData(rsiData);

      const maData = calcSeriesMA(rsiData, Number(indicator.signal || 14));
      const maSeries = addPaneLine("rsi", indicator.maColor || "#facc15", 1, {
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      maSeries.setData(maData);

      const upperLine = addPaneLine("rsi", "rgba(148, 163, 184, 0.72)", 1, {
        lineStyle: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      const middleLine = addPaneLine("rsi", "rgba(148, 163, 184, 0.42)", 1, {
        lineStyle: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      const lowerLine = addPaneLine("rsi", "rgba(148, 163, 184, 0.72)", 1, {
        lineStyle: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });

      upperLine.setData(buildConstantLine(rows, 70));
      middleLine.setData(buildConstantLine(rows, 50));
      lowerLine.setData(buildConstantLine(rows, 30));

      if (api.setPaneLabel) api.setPaneLabel("rsi", "RSI", indicator.color || "#8b5cf6");
      indicator.series = [rsiSeries, maSeries, upperLine, middleLine, lowerLine];
      return;
    }

    if (indicator.type === "macd") {
      if (api.ensureIndicatorPane) api.ensureIndicatorPane("macd", "MACD");

      const data = calcMACD(
        rows,
        Number(indicator.fast || 12),
        Number(indicator.slow || 26),
        Number(indicator.signal || 9)
      );

      const histogram = addPaneHistogram("macd", {
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histogram.setData(data.histogram);

      const macdLine = addPaneLine("macd", indicator.color || "#38bdf8", indicator.width || 2, {
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      macdLine.setData(data.macd);

      const signalLine = addPaneLine("macd", indicator.signalColor || "#fb923c", 2, {
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      signalLine.setData(data.signal);

      try {
        macdLine.createPriceLine({
          price: 0,
          color: "rgba(148, 163, 184, 0.70)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: "",
        });
      } catch (e) {}

      if (api.setPaneLabel) api.setPaneLabel("macd", "MACD", indicator.color || "#38bdf8");
      indicator.series = [histogram, macdLine, signalLine];
    }
  }

  function getActiveBottomPaneTypes() {
    const visible = new Set();
    indicators.forEach(function (indicator) {
      if (!indicator.visible) return;
      if (["volume", "rsi", "macd"].includes(indicator.type)) visible.add(indicator.type);
    });
    return ["volume", "rsi", "macd"].filter(function (type) { return visible.has(type); });
  }

  function rebuildAll() {
    if (api.configureIndicatorPanes) api.configureIndicatorPanes(getActiveBottomPaneTypes());
    api.setVolumeVisible(false);
    indicators.forEach(rebuildOne);
    renderRightList();
    if (api.syncPaneTimeScales) api.syncPaneTimeScales();
  }

  function renderRightList() {
    if (countEl) countEl.textContent = String(indicators.length);
    if (!rightList) return;

    if (!indicators.length) {
      rightList.innerHTML = '<div class="indicator-empty">아직 추가된 지표가 없습니다. 위 검색창 또는 [지표추가] 버튼으로 지표를 추가하세요.</div>';
      return;
    }

    function rowHtml(indicator) {
      const meta = getMeta(indicator.type);
      const visibleLine = indicator.type === "ma_pack"
        ? (indicator.lines || []).find(function (line) { return line.visible; })
        : null;
      const color = indicator.type === "ma_pack" ? ((visibleLine && visibleLine.color) || meta.color) : (indicator.color || meta.color);

      return `
        <div class="indicator-row ${indicator.visible ? "" : "off"}" data-indicator-row="${escapeHtml(indicator.id)}" title="더블클릭하면 설정창이 열립니다.">
          <div class="indicator-row-main">
            <div class="indicator-row-title">
              <span class="indicator-color-dot" style="background:${escapeHtml(color)}; box-shadow:0 0 10px ${escapeHtml(color)}66;"></span>
              <strong>${escapeHtml(meta.name)}</strong>
            </div>
          </div>
          <div class="indicator-row-actions">
            <button class="indicator-eye-btn ${indicator.visible ? "" : "off"}" type="button" data-toggle-indicator-visible="${escapeHtml(indicator.id)}" title="차트 표시/숨김">${eyeIcon(indicator.visible)}</button>
            <button class="indicator-edit-btn" type="button" data-edit-indicator="${escapeHtml(indicator.id)}" title="지표 속성">${editIcon()}</button>
            <button class="indicator-trash-btn" type="button" data-remove-indicator="${escapeHtml(indicator.id)}" title="지표 삭제">${trashIcon()}</button>
          </div>
        </div>
      `;
    }

    const sorted = indicators.slice().sort(function (a, b) {
      const aw = a.type === "ma_pack" ? 0 : 1;
      const bw = b.type === "ma_pack" ? 0 : 1;
      return aw - bw;
    });

    rightList.innerHTML = sorted.map(rowHtml).join("");
  }

  function openModal() {
    modal.classList.add("open", "is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("open", "is-open", "ma-settings-open", "settings-mode", "indicator-settings-only", "indicator-search-only");
    modal.setAttribute("aria-hidden", "true");
    closeColorPalette();
    closeAllCustomSelects();
    if (activeSettingsEl) activeSettingsEl.removeAttribute("data-mode");
  }

  function setTitle(text) {
    const titleEl = document.getElementById("indicatorModalTitle");
    if (titleEl) titleEl.textContent = text;
  }

  function setSubtitle(text) {
    const candidates = [
      document.getElementById("indicatorModalSubtitle"),
      document.getElementById("indicatorModalDesc"),
      modal.querySelector(".indicator-modal-subtitle"),
      modal.querySelector(".indicator-modal-desc"),
      modal.querySelector(".indicator-panel-subtitle"),
      modal.querySelector(".indicator-panel-desc"),
      modal.querySelector(".indicator-subtitle"),
      modal.querySelector(".modal-desc"),
      modal.querySelector(".indicator-panel-head p"),
      modal.querySelector(".indicator-panel-header p"),
      modal.querySelector(".indicator-panel > p"),
    ].filter(Boolean);

    const target = candidates[0];
    if (target) target.textContent = text;
  }

  function openSearch(query) {
    editingId = null;
    modal.classList.remove("ma-settings-open", "settings-mode", "regular-settings-open");
    if (settingsBox) delete settingsBox.dataset.mode;
    if (activeSettingsEl) delete activeSettingsEl.dataset.mode;
    setModalMode("search");
    setTitle("지표 검색");
    setSubtitle("차트에 추가할 지표를 검색하세요. 추가된 지표는 오른쪽 지표 관리 영역에 표시됩니다.");
    if (searchInput) {
      searchInput.value = query || "";
    }
    renderCatalog();
    openModal();
    setTimeout(function () {
      if (searchInput) { searchInput.focus(); searchInput.select(); }
    }, 30);
  }

  function openSettings(id) {
    const indicator = indicators.find(function (item) { return item.id === id; });
    if (!indicator) return;

    editingId = id;
    const isMa = indicator.type === "ma_pack";
    const meta = getMeta(indicator.type);

    setTitle(isMa ? "이평선 설정" : meta.name + " 설정");
    setSubtitle(isMa ? "이평선 전용 설정입니다. 검색 목록/즐겨찾기와 분리해서 독립적으로 관리됩니다." : "보조지표 전용 설정입니다. 적용 후 오른쪽 지표 관리 영역에서 표시/숨김을 제어할 수 있습니다.");
    modal.classList.add("settings-mode");
    modal.classList.toggle("ma-settings-open", isMa);
    modal.classList.toggle("regular-settings-open", !isMa);

    if (settingsBox) settingsBox.dataset.mode = isMa ? "ma" : "indicator";
    if (activeSettingsEl) activeSettingsEl.dataset.mode = isMa ? "ma" : "indicator";

    setModalMode("settings");
    renderSettings(indicator);
    openModal();
  }

  function ensureCatalogLayout() {
    if (catalogLayoutReady || !catalogEl || !catalogEl.parentNode) return;
    const layout = document.createElement("div");
    layout.className = "indicator-search-layout";
    const results = document.createElement("div");
    results.className = "indicator-search-results";
    favoritePanelEl = document.createElement("aside");
    favoritePanelEl.className = "indicator-favorite-panel";
    catalogEl.parentNode.insertBefore(layout, catalogEl);
    layout.appendChild(results);
    results.appendChild(catalogEl);
    layout.appendChild(favoritePanelEl);
    catalogLayoutReady = true;
  }

  function setCatalogLayoutVisible(visible) {
    ensureCatalogLayout();
    const layout = catalogEl ? catalogEl.closest(".indicator-search-layout") : null;

    [layout, catalogEl, favoritePanelEl].forEach(function (el) {
      if (!el) return;
      el.hidden = !visible;
      if (visible) {
        el.style.removeProperty("display");
        if (el === layout) el.style.setProperty("display", "grid");
      } else {
        el.style.setProperty("display", "none", "important");
      }
    });
  }

  function setModalMode(mode) {
    const isSettings = mode === "settings";
    modal.dataset.indicatorMode = isSettings ? "settings" : "search";
    modal.classList.toggle("indicator-settings-only", isSettings);
    modal.classList.toggle("indicator-search-only", !isSettings);

    if (searchInput) {
      searchInput.hidden = isSettings;
      searchInput.style.setProperty("display", isSettings ? "none" : "", isSettings ? "important" : "");
      if (!isSettings) searchInput.style.removeProperty("display");
    }

    setCatalogLayoutVisible(!isSettings);

    if (settingsBox) {
      settingsBox.hidden = !isSettings;
      settingsBox.classList.toggle("open", isSettings);
      settingsBox.classList.toggle("is-open", isSettings);
      if (isSettings) settingsBox.style.setProperty("display", "flex", "important");
      else settingsBox.style.setProperty("display", "none", "important");
    }

    if (panel) panel.scrollTop = 0;
  }

  function renderFavoritePanel() {
    ensureCatalogLayout();
    if (!favoritePanelEl) return;
    const favorites = favoriteTypes.map(function (type) { return getMeta(type); }).filter(Boolean);
    favoritePanelEl.innerHTML = `
      <div class="indicator-favorite-head"><strong>즐겨찾기</strong><span>${favorites.length}</span></div>
      <div class="indicator-favorite-list">
        ${favorites.length ? favorites.map(function (item) {
          return `
            <div class="indicator-favorite-item">
              <button type="button" class="indicator-favorite-add" data-add-indicator="${escapeHtml(item.type)}">
                <strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.shortName)}</span>
              </button>
              <button type="button" class="indicator-star-btn active" data-favorite-indicator="${escapeHtml(item.type)}" title="즐겨찾기 해제">★</button>
            </div>`;
        }).join("") : '<div class="indicator-favorite-empty">지표 왼쪽 별표를 누르면 여기에 저장됩니다.</div>'}
      </div>
    `;
  }

  function renderCatalog() {
    ensureCatalogLayout();
    const q = normalizeText(searchInput ? searchInput.value : "");
    const items = catalog.filter(function (item) {
      const haystack = normalizeText(`${item.name} ${item.shortName} ${item.desc} ${item.keywords}`);
      return !q || haystack.includes(q);
    });
    if (!items.length) {
      catalogEl.innerHTML = '<div class="indicator-empty">검색 결과가 없습니다. 예: 이동평균, EMA, RSI, MACD</div>';
      renderFavoritePanel();
      return;
    }
    catalogEl.innerHTML = items.map(function (item) {
      const active = isFavorite(item.type);
      return `
        <div class="indicator-catalog-item" data-add-indicator="${escapeHtml(item.type)}">
          <button type="button" class="indicator-star-btn ${active ? "active" : ""}" data-favorite-indicator="${escapeHtml(item.type)}" title="즐겨찾기">${starIcon(active)}</button>
          <div class="indicator-catalog-main">
            <div class="indicator-catalog-title"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.shortName)}</small></div>
            <div class="indicator-catalog-desc">${escapeHtml(item.desc)}</div>
          </div>
          <button type="button" class="indicator-add-btn" data-add-indicator="${escapeHtml(item.type)}">추가</button>
        </div>`;
    }).join("");
    renderFavoritePanel();
  }

  function closeColorPalette() {
    const oldPalette = document.querySelector(".indicator-color-palette");
    if (oldPalette) oldPalette.remove();
  }

  function openColorPalette(button) {
    closeColorPalette();
    const row = button.closest(".ma-setting-row") || button.closest(".indicator-setting-field") || activeSettingsEl;
    const input = row ? (row.querySelector('[data-ma-field="color"]') || row.querySelector("#settingColor")) : null;
    if (!input) return;
    const palette = document.createElement("div");
    palette.className = "indicator-color-palette";
    palette.innerHTML = `
      <div class="indicator-color-palette-title">색상 선택</div>
      <div class="indicator-color-palette-grid">
        ${PALETTE_COLORS.map(function (color) {
          const selected = String(input.value).toLowerCase() === color.toLowerCase();
          return `<button type="button" class="indicator-palette-dot ${selected ? "active" : ""}" data-palette-color="${escapeHtml(color)}" style="--palette-color:${escapeHtml(color)}" aria-label="${escapeHtml(color)}"></button>`;
        }).join("")}
      </div>`;
    document.body.appendChild(palette);
    const rect = button.getBoundingClientRect();
    const paletteWidth = 392;
    const paletteHeight = 330;
    const left = Math.min(window.innerWidth - paletteWidth - 12, Math.max(12, rect.left - paletteWidth + rect.width));
    const top = Math.min(window.innerHeight - paletteHeight - 12, rect.bottom + 10);
    palette.style.left = left + "px";
    palette.style.top = Math.max(12, top) + "px";
    palette.addEventListener("click", function (event) {
      const colorBtn = event.target.closest("[data-palette-color]");
      if (!colorBtn) return;
      const color = colorBtn.dataset.paletteColor;
      input.value = color;
      button.style.setProperty("--selected-color", color);
      closeColorPalette();
    });
  }

  function renderMaSettings(indicator) {
    const lines = indicator.lines || [];
    activeSettingsEl.innerHTML = `
      <div class="indicator-settings-split ma-settings-split">
        <section class="indicator-settings-card indicator-settings-card-ma">
          <div class="indicator-settings-card-head">
            <strong>이평선 전용 설정</strong>
            <span>주가이동평균은 보조지표 설정과 독립적으로 관리됩니다.</span>
          </div>
          <div class="ma-master-row">
            <label class="ma-toggle-master">
              <input id="settingVisible" type="checkbox" ${indicator.visible ? "checked" : ""}>
              <span>이평선 전체 표시</span>
            </label>
            <span class="ma-master-hint">각 선마다 기간·굵기·기준가격·단순/지수를 독립 설정합니다.</span>
          </div>
          <div class="ma-setting-list">
            ${lines.map(function (line, index) {
              return `
                <div class="ma-setting-row" data-ma-index="${index}">
                  <label class="ma-visible-check" title="선 표시"><input data-ma-field="visible" type="checkbox" ${line.visible ? "checked" : ""}><span></span></label>
                  <div class="ma-period-stepper">
                    <button type="button" data-ma-step="-1" aria-label="기간 감소">−</button>
                    <input data-ma-field="period" type="number" min="1" max="2000" value="${escapeHtml(line.period)}">
                    <button type="button" data-ma-step="1" aria-label="기간 증가">＋</button>
                  </div>
                  ${customSelectHtml({ maField: "width", value: String(line.width || 2), options: WIDTH_OPTIONS, className: "ma-width-select" })}
                  ${customSelectHtml({ maField: "source", value: line.source || "close", options: SOURCE_OPTIONS, className: "ma-source-select" })}
                  ${customSelectHtml({ maField: "method", value: line.method || "sma", options: METHOD_OPTIONS, className: "ma-method-select" })}
                  <button class="ma-color-button" type="button" data-color-target="ma" style="--selected-color:${escapeHtml(line.color || "#111827")};" title="색상 선택"></button>
                  <input class="ma-color-input" data-ma-field="color" type="hidden" value="${escapeHtml(line.color || "#111827")}">
                </div>`;
            }).join("")}
          </div>
        </section>
      </div>`;
  }

  function renderSettings(indicator) {
    const meta = getMeta(indicator.type);
    if (settingsTitle) settingsTitle.textContent = `${meta.name} 설정`;
    if (activeSettingsEl) activeSettingsEl.dataset.mode = indicator.type === "ma_pack" ? "ma" : "single";
    if (indicator.type === "ma_pack") { renderMaSettings(indicator); return; }
    if (indicator.type === "volume") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          <div class="indicator-setting-field"><label>표시 여부</label>${customSelectHtml({ id: "settingVisible", value: String(indicator.visible !== false), options: VISIBLE_OPTIONS })}</div>
          <div class="indicator-setting-field"><label>색상</label><button class="indicator-color-button" type="button" data-color-target="single" style="--selected-color:${escapeHtml(indicator.color || meta.color)};"></button><input id="settingColor" type="hidden" value="${escapeHtml(indicator.color || meta.color)}"></div>
        </div>`;
      return;
    }
    if (indicator.type === "macd") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          <div class="indicator-setting-field"><label>표시 여부</label>${customSelectHtml({ id: "settingVisible", value: String(indicator.visible !== false), options: VISIBLE_OPTIONS })}</div>
          <div class="indicator-setting-field"><label>단기</label><input id="settingFast" type="number" min="1" max="300" value="${escapeHtml(indicator.fast || 12)}"></div>
          <div class="indicator-setting-field"><label>장기</label><input id="settingSlow" type="number" min="1" max="500" value="${escapeHtml(indicator.slow || 26)}"></div>
          <div class="indicator-setting-field"><label>시그널</label><input id="settingSignal" type="number" min="1" max="300" value="${escapeHtml(indicator.signal || 9)}"></div>
          <div class="indicator-setting-field"><label>선 굵기</label>${customSelectHtml({ id: "settingWidth", value: String(indicator.width || 2), options: WIDTH_OPTIONS })}</div>
          <div class="indicator-setting-field"><label>색상</label><button class="indicator-color-button" type="button" data-color-target="single" style="--selected-color:${escapeHtml(indicator.color || meta.color)};"></button><input id="settingColor" type="hidden" value="${escapeHtml(indicator.color || meta.color)}"></div>
        </div>`;
      return;
    }
    activeSettingsEl.innerHTML = `
      <div class="indicator-setting-grid">
        <div class="indicator-setting-field"><label>표시 여부</label>${customSelectHtml({ id: "settingVisible", value: String(indicator.visible !== false), options: VISIBLE_OPTIONS })}</div>
        <div class="indicator-setting-field"><label>기간</label><input id="settingPeriod" type="number" min="1" max="500" value="${escapeHtml(indicator.period || meta.defaultPeriod || 20)}"></div>
        <div class="indicator-setting-field"><label>기준가격</label>${customSelectHtml({ id: "settingSource", value: indicator.source || "close", options: SOURCE_OPTIONS })}</div>
        <div class="indicator-setting-field"><label>선 굵기</label>${customSelectHtml({ id: "settingWidth", value: String(indicator.width || 2), options: WIDTH_OPTIONS })}</div>
        <div class="indicator-setting-field"><label>색상</label><button class="indicator-color-button" type="button" data-color-target="single" style="--selected-color:${escapeHtml(indicator.color || meta.color)};"></button><input id="settingColor" type="hidden" value="${escapeHtml(indicator.color || meta.color)}"></div>
      </div>`;
  }

  function addIndicator(type) {
    const fixedType = fixType(type);
    const meta = getMeta(fixedType);

    if (fixedType === "ma_pack") {
      const existing = indicators.find(function (item) { return item.type === "ma_pack"; });
      if (existing) {
        existing.visible = true;
        saveIndicators();
        rebuildAll();
        closeModal();
        return;
      }
    }

    const indicator = fixedType === "ma_pack" ? {
      id: makeId("ma_pack"),
      type: "ma_pack",
      visible: true,
      lines: cloneDefaultMaLines(),
      series: [],
    } : {
      id: makeId(fixedType),
      type: fixedType,
      period: meta.defaultPeriod || 20,
      fast: 12,
      slow: 26,
      signal: 9,
      source: fixedType === "volume" ? "volume" : "close",
      color: meta.color,
      width: fixedType === "boll" ? 1 : 2,
      visible: true,
      series: [],
    };

    if (fixedType === "volume") {
      const exists = indicators.find(function (item) { return item.type === "volume"; });
      if (exists) exists.visible = true;
      else indicators.push(indicator);
    } else {
      indicators.push(indicator);
    }

    saveIndicators();
    rebuildAll();

    /*
      주가이동평균 추가 시 설정창을 바로 열지 않습니다.
      오른쪽 적용지표의 '이평선' 칸에만 추가하고, 세부 수정은 연필 버튼에서 열리게 분리했습니다.
    */
    closeModal();
  }

  function toggleIndicatorVisible(id) {
    const indicator = indicators.find(function (item) { return item.id === id; });
    if (!indicator) return;
    indicator.visible = !indicator.visible;
    saveIndicators();
    rebuildAll();
  }

  function removeIndicator(id) {
    const indicator = indicators.find(function (item) { return item.id === id; });
    if (indicator) {
      clearSeries(indicator);
      if (indicator.type === "volume") api.setVolumeVisible(false);
    }
    indicators = indicators.filter(function (item) { return item.id !== id; });
    saveIndicators();
    rebuildAll();
  }

  function applyMaSettings(indicator) {
    const visibleEl = document.getElementById("settingVisible");
    if (visibleEl) indicator.visible = !!visibleEl.checked;
    const rows = activeSettingsEl.querySelectorAll(".ma-setting-row");
    indicator.lines = Array.from(rows).map(function (row, index) {
      const current = indicator.lines[index] || {};
      const visibleInput = row.querySelector('[data-ma-field="visible"]');
      const periodInput = row.querySelector('[data-ma-field="period"]');
      const widthInput = row.querySelector('[data-ma-field="width"]');
      const sourceInput = row.querySelector('[data-ma-field="source"]');
      const methodInput = row.querySelector('[data-ma-field="method"]');
      const colorInput = row.querySelector('[data-ma-field="color"]');
      return normalizeMaLine({
        id: current.id || makeId("ma_line"),
        visible: visibleInput ? visibleInput.checked : true,
        period: periodInput ? periodInput.value : current.period,
        width: widthInput ? widthInput.value : current.width,
        source: sourceInput ? sourceInput.value : current.source,
        method: methodInput ? methodInput.value : current.method,
        color: colorInput ? colorInput.value : current.color,
      }, index);
    });
  }

  function applySettings() {
    const indicator = indicators.find(function (item) { return item.id === editingId; });
    if (!indicator) return;
    const meta = getMeta(indicator.type);
    if (indicator.type === "ma_pack") {
      applyMaSettings(indicator);
      saveIndicators();
      rebuildAll();
      closeModal();
      return;
    }
    const visibleEl = document.getElementById("settingVisible");
    const periodEl = document.getElementById("settingPeriod");
    const sourceEl = document.getElementById("settingSource");
    const fastEl = document.getElementById("settingFast");
    const slowEl = document.getElementById("settingSlow");
    const signalEl = document.getElementById("settingSignal");
    const widthEl = document.getElementById("settingWidth");
    const colorEl = document.getElementById("settingColor");
    if (visibleEl) indicator.visible = visibleEl.value === "true";
    if (periodEl) indicator.period = Math.max(1, Number(periodEl.value || meta.defaultPeriod || 20));
    if (sourceEl) indicator.source = sourceEl.value || "close";
    if (fastEl) indicator.fast = Math.max(1, Number(fastEl.value || 12));
    if (slowEl) indicator.slow = Math.max(1, Number(slowEl.value || 26));
    if (signalEl) indicator.signal = Math.max(1, Number(signalEl.value || 9));
    if (widthEl) indicator.width = clampNumber(widthEl.value || 2, 1, 6, 2);
    if (colorEl) indicator.color = colorEl.value || meta.color;
    saveIndicators();
    rebuildAll();
    closeModal();
  }

  function closeAllCustomSelects(except) {
    document.querySelectorAll(".bv-select.open").forEach(function (el) {
      if (except && el === except) return;
      el.classList.remove("open");
    });
  }

  function handleCustomSelectClick(event) {
    const btn = event.target.closest("[data-bv-select-btn]");
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      const wrap = btn.closest("[data-bv-select]");
      if (!wrap) return;
      const open = wrap.classList.contains("open");
      closeAllCustomSelects(wrap);
      wrap.classList.toggle("open", !open);
      return;
    }
    const option = event.target.closest("[data-bv-select-option]");
    if (option) {
      event.preventDefault();
      event.stopPropagation();
      const wrap = option.closest("[data-bv-select]");
      if (!wrap) return;
      const input = wrap.querySelector("input[type='hidden']");
      const label = wrap.querySelector(".bv-select-label");
      if (input) input.value = option.dataset.value || "";
      if (label) label.textContent = option.textContent.trim();
      wrap.querySelectorAll("[data-bv-select-option]").forEach(function (node) { node.classList.toggle("active", node === option); });
      wrap.classList.remove("open");
    }
  }

  openTopBtn && openTopBtn.addEventListener("click", function (event) { event.preventDefault(); event.stopPropagation(); openSearch(""); });
  openSideBtn && openSideBtn.addEventListener("click", function (event) { event.preventDefault(); event.stopPropagation(); openSearch(""); });
  quickSearchBtn && quickSearchBtn.addEventListener("click", function () { openSearch(quickSearchInput ? quickSearchInput.value : ""); });
  quickSearchInput && quickSearchInput.addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); openSearch(quickSearchInput.value || ""); } });
  searchInput && searchInput.addEventListener("input", renderCatalog);

  catalogEl.addEventListener("click", function (event) {
    const favoriteBtn = event.target.closest("[data-favorite-indicator]");
    if (favoriteBtn) { event.preventDefault(); event.stopPropagation(); toggleFavorite(favoriteBtn.dataset.favoriteIndicator); return; }
    const addBtn = event.target.closest(".indicator-add-btn");
    const item = addBtn || event.target.closest(".indicator-catalog-item[data-add-indicator]");
    if (!item) return;
    addIndicator(item.dataset.addIndicator);
  });

  document.addEventListener("click", function (event) {
    const favoriteBtn = event.target.closest(".indicator-favorite-panel [data-favorite-indicator]");
    if (favoriteBtn) { event.preventDefault(); event.stopPropagation(); toggleFavorite(favoriteBtn.dataset.favoriteIndicator); return; }
    const favAddBtn = event.target.closest(".indicator-favorite-panel [data-add-indicator]");
    if (favAddBtn) { event.preventDefault(); event.stopPropagation(); addIndicator(favAddBtn.dataset.addIndicator); return; }
  });

  activeSettingsEl && activeSettingsEl.addEventListener("click", function (event) {
    handleCustomSelectClick(event);
    const colorBtn = event.target.closest("[data-color-target]");
    if (colorBtn) { event.preventDefault(); event.stopPropagation(); openColorPalette(colorBtn); return; }
    const stepBtn = event.target.closest("[data-ma-step]");
    if (!stepBtn) return;
    event.preventDefault();
    const row = stepBtn.closest(".ma-setting-row");
    const input = row ? row.querySelector('[data-ma-field="period"]') : null;
    if (!input) return;
    const step = Number(stepBtn.dataset.maStep || 0);
    input.value = clampNumber(Number(input.value || 1) + step, 1, 2000, 20);
  });

  rightList.addEventListener("click", function (event) {
    const toggleBtn = event.target.closest("[data-toggle-indicator-visible]");
    if (toggleBtn) { event.preventDefault(); event.stopPropagation(); toggleIndicatorVisible(toggleBtn.dataset.toggleIndicatorVisible); return; }
    const removeBtn = event.target.closest("[data-remove-indicator]");
    if (removeBtn) { event.preventDefault(); event.stopPropagation(); removeIndicator(removeBtn.dataset.removeIndicator); return; }
    const editBtn = event.target.closest("[data-edit-indicator]");
    if (editBtn) { event.preventDefault(); event.stopPropagation(); openSettings(editBtn.dataset.editIndicator); }
  });

  rightList.addEventListener("dblclick", function (event) {
    const row = event.target.closest("[data-indicator-row]");
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    openSettings(row.dataset.indicatorRow);
  });

  applyBtn && applyBtn.addEventListener("click", applySettings);
  document.querySelectorAll("[data-close-indicator]").forEach(function (btn) { btn.addEventListener("click", closeModal); });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-bv-select]")) {
      handleCustomSelectClick(event);
      return;
    }
    closeAllCustomSelects();
    if (modal.classList.contains("open") && panel && !panel.contains(event.target) && !event.target.closest(".indicator-color-palette") && !openTopBtn?.contains(event.target) && !openSideBtn?.contains(event.target) && !quickSearchBtn?.contains(event.target)) {
      closeModal();
    }
    if (!event.target.closest(".indicator-color-palette") && !event.target.closest("[data-color-target]")) closeColorPalette();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeAllCustomSelects();
      closeColorPalette();
      closeModal();
    }
  });

  document.addEventListener("bitgak:chart-data-loaded", rebuildAll);

  loadIndicators();
  ensureCatalogLayout();
  renderCatalog();
  renderFavoritePanel();
  renderRightList();
})();
