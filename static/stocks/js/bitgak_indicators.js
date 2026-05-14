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

  const STORAGE_KEY = "bitgak_chart_indicators_v4";
  const LEGACY_KEYS = ["bitgak_chart_indicators_v3", "bitgak_chart_indicators_v2"];

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

  const DEFAULT_MA_LINES = [
    { id: "ma_5", visible: false, period: 5, width: 4, source: "close", method: "ema", color: "#14a7c7" },
    { id: "ma_10", visible: false, period: 10, width: 2, source: "close", method: "ema", color: "#3b82f6" },
    { id: "ma_20", visible: true, period: 20, width: 2, source: "close", method: "ema", color: "#9be66d" },
    { id: "ma_60", visible: true, period: 60, width: 2, source: "close", method: "ema", color: "#36b37e" },
    { id: "ma_112", visible: true, period: 112, width: 4, source: "close", method: "sma", color: "#ff4d6d" },
    { id: "ma_224", visible: true, period: 224, width: 4, source: "close", method: "sma", color: "#ff7a00" },
  ];

  const catalog = [
    {
      type: "ma_pack",
      name: "주가이동평균",
      shortName: "MA",
      desc: "5·10·20·60·112·224선의 기간, 굵기, 색상, 기준가격, 단순/지수를 한 번에 설정합니다.",
      keywords: "ma moving average sma ema 이동평균 이평선 단순 지수 주가이동평균",
      defaultPeriod: 20,
      color: "#111827",
    },
    {
      type: "boll",
      name: "볼린저 밴드",
      shortName: "BOLL",
      desc: "이동평균과 표준편차로 가격 범위를 표시합니다.",
      keywords: "boll bollinger bands 볼린저 밴드 bb",
      defaultPeriod: 20,
      color: "#0284c7",
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

  function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (Number.isNaN(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function fixType(type) {
    if (type === "bb") return "boll";
    if (type === "ma" || type === "ema") return "ma_pack";
    return type || "ma_pack";
  }

  function getMeta(type) {
    const fixedType = fixType(type);
    return catalog.find(function (item) {
      return item.type === fixedType;
    }) || catalog[0];
  }

  function cloneDefaultMaLines() {
    return DEFAULT_MA_LINES.map(function (line) {
      return { ...line, id: line.id + "_" + Math.floor(Math.random() * 100000) };
    });
  }

  function normalizeMaLine(raw, index) {
    raw = raw || {};

    return {
      id: raw.id || makeId("ma_line_" + index),
      visible: raw.visible !== false,
      period: clampNumber(raw.period, 1, 1000, DEFAULT_MA_LINES[index]?.period || 20),
      width: clampNumber(raw.width, 1, 4, DEFAULT_MA_LINES[index]?.width || 2),
      source: SOURCE_OPTIONS.some(function (x) { return x.value === raw.source; }) ? raw.source : "close",
      method: METHOD_OPTIONS.some(function (x) { return x.value === raw.method; }) ? raw.method : "sma",
      color: raw.color || DEFAULT_MA_LINES[index]?.color || "#111827",
    };
  }

  function normalizeIndicator(raw) {
    if (!raw) return null;

    const originalType = raw.type === "bb" ? "boll" : raw.type;
    const type = fixType(originalType);
    const meta = getMeta(type);
    const settings = raw.settings || {};

    if (type === "ma_pack") {
      let lines = Array.isArray(raw.lines) ? raw.lines : null;

      if (!lines && (originalType === "ma" || originalType === "ema")) {
        lines = [
          {
            id: raw.id || raw.uid || makeId("ma_line"),
            visible: raw.visible !== false,
            period: Number(raw.period || settings.period || meta.defaultPeriod || 20),
            width: Number(raw.width || settings.width || 2),
            source: raw.source || settings.source || "close",
            method: originalType === "ema" ? "ema" : "sma",
            color: raw.color || settings.color || meta.color,
          },
        ];
      }

      if (!lines) lines = cloneDefaultMaLines();

      return {
        id: raw.id || raw.uid || makeId("ma_pack"),
        type: "ma_pack",
        visible: raw.visible !== false,
        lines: lines.map(normalizeMaLine),
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

  function sourceLabel(source) {
    return SOURCE_OPTIONS.find(function (x) { return x.value === source; })?.label || "종가";
  }

  function methodLabel(method) {
    return METHOD_OPTIONS.find(function (x) { return x.value === method; })?.label || "단순";
  }

  function getSourceValue(row, source) {
    if (!row) return null;

    let value;
    if (source === "hl2") {
      value = (Number(row.high) + Number(row.low)) / 2;
    } else if (source === "ohlc4") {
      value = (Number(row.open) + Number(row.high) + Number(row.low) + Number(row.close)) / 4;
    } else {
      value = Number(row[source || "close"]);
    }

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
        if (value === null) {
          valid = false;
          break;
        }
        sum += value;
      }

      if (valid) {
        result.push({
          time: rows[i].time,
          value: Math.round((sum / period) * 100) / 100,
        });
      }
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

    result.push({
      time: rows[period - 1].time,
      value: Math.round(ema * 100) / 100,
    });

    for (let i = period; i < rows.length; i++) {
      const price = getSourceValue(rows[i], source);
      if (price === null) continue;

      ema = (price - ema) * multiplier + ema;

      result.push({
        time: rows[i].time,
        value: Math.round(ema * 100) / 100,
      });
    }

    return result;
  }

  function calcLineMA(rows, line) {
    const period = Number(line.period || 20);
    const source = line.source || "close";
    return line.method === "ema" ? calcEMA(rows, period, source) : calcMA(rows, period, source);
  }

  function calcBoll(rows, period, source) {
    const upper = [];
    const middle = [];
    const lower = [];

    if (!period || period < 2) return { upper, middle, lower };

    for (let i = 0; i < rows.length; i++) {
      if (i < period - 1) continue;

      const values = [];

      for (let j = i - period + 1; j <= i; j++) {
        const value = getSourceValue(rows[j], source);
        if (value !== null) values.push(value);
      }

      if (values.length !== period) continue;

      const mean = values.reduce(function (a, b) {
        return a + b;
      }, 0) / period;

      const variance = values.reduce(function (a, b) {
        return a + Math.pow(b - mean, 2);
      }, 0) / period;

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

    let gains = 0;
    let losses = 0;

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

      result.push({
        time: rows[i].time,
        value: Math.round(rsi * 100) / 100,
      });
    }

    return result;
  }

  function calcMACD(rows, fastPeriod, slowPeriod) {
    const fast = calcEMA(rows, fastPeriod || 12, "close");
    const slow = calcEMA(rows, slowPeriod || 26, "close");
    const slowMap = new Map(slow.map(function (x) {
      return [String(x.time), x.value];
    }));

    const result = [];

    fast.forEach(function (x) {
      const slowValue = slowMap.get(String(x.time));
      if (slowValue === undefined) return;

      result.push({
        time: x.time,
        value: Math.round((x.value - slowValue) * 100) / 100,
      });
    });

    return result;
  }

  function clearSeries(indicator) {
    if (!indicator || !indicator.series) return;

    indicator.series.forEach(function (series) {
      api.removeSeries(series);
    });

    indicator.series = [];
  }

  function addLine(color, width, priceScaleId) {
    return api.addLineSeries({
      color,
      lineWidth: clampNumber(width, 1, 4, 2),
      priceScaleId: priceScaleId || undefined,
      priceLineVisible: false,
      lastValueVisible: false,
    });
  }

  function rebuildOne(indicator) {
    const rows = api.getRows();

    clearSeries(indicator);

    if (!indicator.visible) {
      if (indicator.type === "volume") api.setVolumeVisible(false);
      return;
    }

    if (indicator.type === "volume") {
      api.setVolumeVisible(true);
      return;
    }

    if (indicator.type === "ma_pack") {
      const created = [];

      (indicator.lines || []).forEach(function (line) {
        if (!line.visible) return;

        const series = addLine(line.color || "#111827", line.width || 2);
        series.setData(calcLineMA(rows, line));
        created.push(series);
      });

      indicator.series = created;
      return;
    }

    if (indicator.type === "boll") {
      const data = calcBoll(rows, Number(indicator.period || 20), indicator.source || "close");

      const upper = addLine(indicator.color || "#0284c7", indicator.width || 1);
      const middle = addLine("#64748b", indicator.width || 1);
      const lower = addLine(indicator.color || "#0284c7", indicator.width || 1);

      upper.setData(data.upper);
      middle.setData(data.middle);
      lower.setData(data.lower);

      indicator.series = [upper, middle, lower];
      return;
    }

    if (indicator.type === "rsi") {
      const series = addLine(indicator.color || "#db2777", indicator.width || 2, "rsi");

      api.chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: 0.72, bottom: 0.12 },
      });

      series.setData(calcRSI(rows, Number(indicator.period || 14)));
      indicator.series = [series];
      return;
    }

    if (indicator.type === "macd") {
      const series = addLine(indicator.color || "#2563eb", indicator.width || 2, "macd");

      api.chart.priceScale("macd").applyOptions({
        scaleMargins: { top: 0.72, bottom: 0.12 },
      });

      series.setData(calcMACD(rows, Number(indicator.fast || 12), Number(indicator.slow || 26)));
      indicator.series = [series];
    }
  }

  function rebuildAll() {
    api.setVolumeVisible(false);

    indicators.forEach(function (indicator) {
      rebuildOne(indicator);
    });

    renderRightList();
  }

  function trashIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function editIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  function indicatorDescription(indicator) {
    if (indicator.type === "ma_pack") {
      const visibleLines = (indicator.lines || [])
        .filter(function (line) { return line.visible; })
        .map(function (line) {
          return `${line.period}${line.method === "ema" ? " EMA" : " SMA"}`;
        });

      return visibleLines.length ? visibleLines.join(" · ") : "숨김";
    }

    if (indicator.type === "volume") return indicator.visible ? "표시" : "숨김";
    if (indicator.type === "macd") return `${indicator.fast}/${indicator.slow}/${indicator.signal}`;
    return `${indicator.period || "-"} · ${sourceLabel(indicator.source || "close")} · ${indicator.width || 2}px`;
  }

  function renderRightList() {
    if (countEl) countEl.textContent = String(indicators.length);

    if (!rightList) return;

    if (!indicators.length) {
      rightList.innerHTML = `
        <div class="indicator-empty">
          아직 추가된 지표가 없습니다. 위 검색창 또는 [지표추가] 버튼으로 지표를 추가하세요.
        </div>
      `;
      return;
    }

    rightList.innerHTML = indicators.map(function (indicator) {
      const meta = getMeta(indicator.type);
      const color = indicator.type === "ma_pack"
        ? ((indicator.lines || []).find(function (line) { return line.visible; })?.color || meta.color)
        : (indicator.color || meta.color);

      return `
        <div class="indicator-row" data-indicator-row="${escapeHtml(indicator.id)}" title="더블클릭하면 설정창이 열립니다.">
          <div class="indicator-row-main">
            <div class="indicator-row-title">
              <span class="indicator-color-dot" style="background:${escapeHtml(color)}; box-shadow:0 0 10px ${escapeHtml(color)}66;"></span>
              <strong>${escapeHtml(meta.name)}</strong>
            </div>
            <div class="indicator-row-desc">${escapeHtml(indicatorDescription(indicator))}</div>
          </div>

          <div class="indicator-row-actions">
            <button class="indicator-edit-btn" type="button" data-edit-indicator="${escapeHtml(indicator.id)}" title="지표 속성">
              ${editIcon()}
            </button>
            <button class="indicator-trash-btn" type="button" data-remove-indicator="${escapeHtml(indicator.id)}" title="지표 삭제">
              ${trashIcon()}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("ma-settings-open");
  }

  function openSearch(query) {
    editingId = null;
    modal.classList.remove("ma-settings-open");

    const titleEl = document.getElementById("indicatorModalTitle");
    if (titleEl) titleEl.textContent = "지표 검색";

    if (searchInput) {
      searchInput.style.display = "";
      searchInput.value = query || "";
    }

    if (catalogEl) catalogEl.style.display = "";
    if (settingsBox) {
      settingsBox.classList.remove("open");
      settingsBox.style.display = "none";
    }

    renderCatalog();
    openModal();

    setTimeout(function () {
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }, 30);
  }

  function openSettings(id) {
    const indicator = indicators.find(function (item) {
      return item.id === id;
    });

    if (!indicator) return;

    editingId = id;

    const titleEl = document.getElementById("indicatorModalTitle");
    if (titleEl) titleEl.textContent = "지표 속성";

    modal.classList.toggle("ma-settings-open", indicator.type === "ma_pack");

    if (searchInput) searchInput.style.display = "none";
    if (catalogEl) catalogEl.style.display = "none";

    if (settingsBox) {
      settingsBox.classList.add("open");
      settingsBox.style.display = "block";
    }

    renderSettings(indicator);
    openModal();
  }

  function renderCatalog() {
    const q = normalizeText(searchInput ? searchInput.value : "");

    const items = catalog.filter(function (item) {
      const haystack = normalizeText(`${item.name} ${item.shortName} ${item.desc} ${item.keywords}`);
      return !q || haystack.includes(q);
    });

    if (!items.length) {
      catalogEl.innerHTML = `
        <div class="indicator-empty">
          검색 결과가 없습니다. 예: 이동평균, EMA, RSI, MACD
        </div>
      `;
      return;
    }

    catalogEl.innerHTML = items.map(function (item) {
      return `
        <div class="indicator-catalog-item" data-add-indicator="${escapeHtml(item.type)}">
          <strong>${escapeHtml(item.name)} <small>${escapeHtml(item.shortName)}</small></strong>
          <span>${escapeHtml(item.desc)}</span>
        </div>
      `;
    }).join("");
  }

  function makeSourceOptions(selected) {
    return SOURCE_OPTIONS.map(function (option) {
      return `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
    }).join("");
  }

  function makeMethodOptions(selected) {
    return METHOD_OPTIONS.map(function (option) {
      return `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
    }).join("");
  }

  function renderMaSettings(indicator) {
    const lines = indicator.lines || [];

    activeSettingsEl.innerHTML = `
      <div class="ma-master-row">
        <label class="ma-toggle-master">
          <input id="settingVisible" type="checkbox" ${indicator.visible ? "checked" : ""}>
          <span>주가이동평균 전체 표시</span>
        </label>
        <span class="ma-master-hint">각 선마다 기간·굵기·기준가격·단순/지수를 따로 설정합니다.</span>
      </div>

      <div class="ma-setting-list">
        ${lines.map(function (line, index) {
          const checked = line.visible ? "checked" : "";

          return `
            <div class="ma-setting-row" data-ma-index="${index}">
              <label class="ma-visible-check" title="선 표시">
                <input data-ma-field="visible" type="checkbox" ${checked}>
                <span></span>
              </label>

              <div class="ma-period-stepper">
                <button type="button" data-ma-step="-1" aria-label="기간 감소">−</button>
                <input data-ma-field="period" type="number" min="1" max="1000" value="${escapeHtml(line.period)}">
                <button type="button" data-ma-step="1" aria-label="기간 증가">＋</button>
              </div>

              <div class="ma-width-select">
                <select data-ma-field="width" title="선 굵기">
                  <option value="1" ${Number(line.width) === 1 ? "selected" : ""}>1px ─</option>
                  <option value="2" ${Number(line.width) === 2 ? "selected" : ""}>2px ━</option>
                  <option value="3" ${Number(line.width) === 3 ? "selected" : ""}>3px ━</option>
                  <option value="4" ${Number(line.width) === 4 ? "selected" : ""}>4px ━</option>
                </select>
              </div>

              <select class="ma-source-select" data-ma-field="source" title="기준가격">
                ${makeSourceOptions(line.source || "close")}
              </select>

              <select class="ma-method-select" data-ma-field="method" title="이동평균 종류">
                ${makeMethodOptions(line.method || "sma")}
              </select>

              <input class="ma-color-input" data-ma-field="color" type="color" value="${escapeHtml(line.color || "#111827")}" title="색상">
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSettings(indicator) {
    const meta = getMeta(indicator.type);

    if (settingsTitle) settingsTitle.textContent = `${meta.name} 설정`;

    if (indicator.type === "ma_pack") {
      renderMaSettings(indicator);
      return;
    }

    if (indicator.type === "volume") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          <div class="indicator-setting-field">
            <label>표시 여부</label>
            <select id="settingVisible">
              <option value="true" ${indicator.visible ? "selected" : ""}>표시</option>
              <option value="false" ${!indicator.visible ? "selected" : ""}>숨김</option>
            </select>
          </div>

          <div class="indicator-setting-field">
            <label>색상</label>
            <input id="settingColor" type="color" value="${escapeHtml(indicator.color || meta.color)}">
          </div>
        </div>
      `;
      return;
    }

    if (indicator.type === "macd") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          <div class="indicator-setting-field">
            <label>표시 여부</label>
            <select id="settingVisible">
              <option value="true" ${indicator.visible ? "selected" : ""}>표시</option>
              <option value="false" ${!indicator.visible ? "selected" : ""}>숨김</option>
            </select>
          </div>

          <div class="indicator-setting-field">
            <label>단기</label>
            <input id="settingFast" type="number" min="1" max="300" value="${escapeHtml(indicator.fast || 12)}">
          </div>

          <div class="indicator-setting-field">
            <label>장기</label>
            <input id="settingSlow" type="number" min="1" max="500" value="${escapeHtml(indicator.slow || 26)}">
          </div>

          <div class="indicator-setting-field">
            <label>시그널</label>
            <input id="settingSignal" type="number" min="1" max="300" value="${escapeHtml(indicator.signal || 9)}">
          </div>

          <div class="indicator-setting-field">
            <label>선 굵기</label>
            <input id="settingWidth" type="number" min="1" max="4" value="${escapeHtml(indicator.width || 2)}">
          </div>

          <div class="indicator-setting-field">
            <label>색상</label>
            <input id="settingColor" type="color" value="${escapeHtml(indicator.color || meta.color)}">
          </div>
        </div>
      `;
      return;
    }

    activeSettingsEl.innerHTML = `
      <div class="indicator-setting-grid">
        <div class="indicator-setting-field">
          <label>표시 여부</label>
          <select id="settingVisible">
            <option value="true" ${indicator.visible ? "selected" : ""}>표시</option>
            <option value="false" ${!indicator.visible ? "selected" : ""}>숨김</option>
          </select>
        </div>

        <div class="indicator-setting-field">
          <label>기간</label>
          <input id="settingPeriod" type="number" min="1" max="500" value="${escapeHtml(indicator.period || meta.defaultPeriod || 20)}">
        </div>

        <div class="indicator-setting-field">
          <label>기준가격</label>
          <select id="settingSource">
            ${makeSourceOptions(indicator.source || "close")}
          </select>
        </div>

        <div class="indicator-setting-field">
          <label>선 굵기</label>
          <input id="settingWidth" type="number" min="1" max="4" value="${escapeHtml(indicator.width || 2)}">
        </div>

        <div class="indicator-setting-field">
          <label>색상</label>
          <input id="settingColor" type="color" value="${escapeHtml(indicator.color || meta.color)}">
        </div>
      </div>
    `;
  }

  function addIndicator(type) {
    const fixedType = fixType(type);
    const meta = getMeta(fixedType);

    if (fixedType === "ma_pack") {
      const existing = indicators.find(function (item) {
        return item.type === "ma_pack";
      });

      if (existing) {
        closeModal();
        openSettings(existing.id);
        return;
      }
    }

    const indicator = fixedType === "ma_pack"
      ? {
          id: makeId("ma_pack"),
          type: "ma_pack",
          visible: true,
          lines: cloneDefaultMaLines(),
          series: [],
        }
      : {
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
      const exists = indicators.find(function (item) {
        return item.type === "volume";
      });

      if (exists) {
        exists.visible = true;
      } else {
        indicators.push(indicator);
      }
    } else {
      indicators.push(indicator);
    }

    saveIndicators();
    rebuildAll();
    closeModal();

    if (fixedType === "ma_pack") {
      setTimeout(function () {
        openSettings(indicator.id);
      }, 30);
    }
  }

  function removeIndicator(id) {
    const indicator = indicators.find(function (item) {
      return item.id === id;
    });

    if (indicator) {
      clearSeries(indicator);
      if (indicator.type === "volume") api.setVolumeVisible(false);
    }

    indicators = indicators.filter(function (item) {
      return item.id !== id;
    });

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
    const indicator = indicators.find(function (item) {
      return item.id === editingId;
    });

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
    if (widthEl) indicator.width = clampNumber(widthEl.value || 2, 1, 4, 2);
    if (colorEl) indicator.color = colorEl.value || meta.color;

    saveIndicators();
    rebuildAll();
    closeModal();
  }

  openTopBtn && openTopBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    openSearch("");
  });

  openSideBtn && openSideBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    openSearch("");
  });

  quickSearchBtn && quickSearchBtn.addEventListener("click", function () {
    openSearch(quickSearchInput ? quickSearchInput.value : "");
  });

  quickSearchInput && quickSearchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      openSearch(quickSearchInput.value || "");
    }
  });

  searchInput && searchInput.addEventListener("input", renderCatalog);

  catalogEl.addEventListener("click", function (event) {
    const item = event.target.closest("[data-add-indicator]");
    if (!item) return;

    addIndicator(item.dataset.addIndicator);
  });

  activeSettingsEl && activeSettingsEl.addEventListener("click", function (event) {
    const stepBtn = event.target.closest("[data-ma-step]");
    if (!stepBtn) return;

    event.preventDefault();
    const row = stepBtn.closest(".ma-setting-row");
    const input = row ? row.querySelector('[data-ma-field="period"]') : null;
    if (!input) return;

    const step = Number(stepBtn.dataset.maStep || 0);
    input.value = clampNumber(Number(input.value || 1) + step, 1, 1000, 20);
  });

  rightList.addEventListener("click", function (event) {
    const removeBtn = event.target.closest("[data-remove-indicator]");
    if (removeBtn) {
      event.preventDefault();
      event.stopPropagation();
      removeIndicator(removeBtn.dataset.removeIndicator);
      return;
    }

    const editBtn = event.target.closest("[data-edit-indicator]");
    if (editBtn) {
      event.preventDefault();
      event.stopPropagation();
      openSettings(editBtn.dataset.editIndicator);
    }
  });

  rightList.addEventListener("dblclick", function (event) {
    const row = event.target.closest("[data-indicator-row]");
    if (!row) return;

    event.preventDefault();
    event.stopPropagation();
    openSettings(row.dataset.indicatorRow);
  });

  applyBtn && applyBtn.addEventListener("click", applySettings);

  document.querySelectorAll("[data-close-indicator]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  document.addEventListener("click", function (event) {
    if (
      modal.classList.contains("open") &&
      panel &&
      !panel.contains(event.target) &&
      !openTopBtn?.contains(event.target) &&
      !openSideBtn?.contains(event.target) &&
      !quickSearchBtn?.contains(event.target)
    ) {
      closeModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
  });

  document.addEventListener("bitgak:chart-data-loaded", rebuildAll);

  loadIndicators();
  renderCatalog();
  renderRightList();
})();