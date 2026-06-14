(function () {
  if (window.__BITGAK_INDICATORS_LOADED__) return;
  window.__BITGAK_INDICATORS_LOADED__ = true;

  const api = window.BitgakChart;
  if (!api) return;

  const app = document.querySelector(".bv-app");
  const IS_INSIGHT_EMBED = !!(app && (app.dataset.insightEditor === "1" || app.dataset.insightViewer === "1" || app.dataset.insightEmbed === "1"));

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

  // 모바일 전용: 현재 적용 중인 지표를 별도 창에서 관리
  const openMobileBtn = document.getElementById("openMobileIndicatorsBtn");
  const mobileModal = document.getElementById("mobileIndicatorModal");
  const mobilePanel = mobileModal ? mobileModal.querySelector(".mobile-indicator-panel") : null;
  const mobileList = document.getElementById("mobileIndicatorList");
  const mobileCountEl = document.getElementById("mobileActiveIndicatorCount");
  const mobileBadgeEl = document.getElementById("mobileActiveIndicatorBadge");
  const mobileAddBtn = document.getElementById("mobileAddIndicatorBtn");

  if (!modal || !catalogEl || !rightList) return;

  const CURRENT_STOCK_CODE = String((app && app.dataset && app.dataset.code) || "global").trim() || "global";

  // 종목별 지표 저장으로 변경합니다.
  // 이전 전역 key를 그대로 쓰면 A종목에서 켠 거래량/이평선/RSI가 B종목에서도 자동으로 떠서
  // "새 종목은 기본 캔들 차트만"이라는 동작이 깨집니다.
  const STORAGE_KEY_BASE = "bitgak_chart_indicators_v6_tv";
  const STORAGE_KEY = IS_INSIGHT_EMBED ? STORAGE_KEY_BASE + ":insight" : STORAGE_KEY_BASE + ":" + CURRENT_STOCK_CODE;
  const LEGACY_KEYS = IS_INSIGHT_EMBED ? [] : [
    STORAGE_KEY_BASE + ":" + CURRENT_STOCK_CODE,
    "bitgak_chart_indicators_v5_tv:" + CURRENT_STOCK_CODE
  ];
  const FAVORITE_KEY = "bitgak_indicator_favorites_v1";


  const CHART_API_URL = app && app.dataset
    ? (app.dataset.apiUrl || ("/stocks/api/ohlcv/" + encodeURIComponent(CURRENT_STOCK_CODE) + "/"))
    : ("/stocks/api/ohlcv/" + encodeURIComponent(CURRENT_STOCK_CODE) + "/");

  const STRATEGY_TIMEFRAME_OPTIONS = [
    { value: "current", label: "현재 차트 기준" },
    { value: "4h", label: "4시간봉 기준" },
    { value: "1d", label: "일봉 기준" },
    { value: "1w", label: "주봉 기준" },
    { value: "1mo", label: "월봉 기준" },
  ];

  // 과거 저장값 호환용 별칭입니다. HH/LL 지표 자체는 더 이상 카탈로그에 노출하지 않습니다.
  const HHLL_TIMEFRAME_OPTIONS = STRATEGY_TIMEFRAME_OPTIONS;
  const HHLL_SIGNAL_MODE_OPTIONS = [];
  const TOTAL_STRATEGY_MODE_OPTIONS = [];

  const FVG_STATUS_OPTIONS = [
    { value: "open", label: "미체결 갭만 표시" },
    { value: "all", label: "전체 갭 표시" },
    { value: "filled", label: "채워진 갭만 표시" },
  ];


  // v7 서버 저장 모드: stock_detail의 지표 상태는 localStorage가 아니라
  // 로그인 사용자 + 종목코드 기준 서버 API에 저장한다.
  // 인사이트 iframe은 부모 페이지의 chart_snapshot 서버 저장 흐름을 사용한다.
  const INDICATOR_SERVER_URL = app && app.dataset
    ? (app.dataset.indicatorApiUrl || app.dataset.indicatorsApiUrl || ("/stocks/api/indicators/" + encodeURIComponent(CURRENT_STOCK_CODE) + "/"))
    : ("/stocks/api/indicators/" + encodeURIComponent(CURRENT_STOCK_CODE) + "/");

  let indicatorServerLoading = false;
  let indicatorServerSaveTimer = null;
  let indicatorServerAvailable = false;
  let suppressIndicatorServerSave = false;

  function getCookie(name) {
    const value = `; ${document.cookie || ""}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift());
    return "";
  }

  function isAuthenticatedForIndicatorServer() {
    if (IS_INSIGHT_EMBED) return false;
    if (window.BITGAK_ACCESS && window.BITGAK_ACCESS.is_authenticated) return true;
    return !!document.getElementById("bitgak-access-data") && !document.body.classList.contains("is-guest");
  }

  function normalizeServerIndicatorsPayload(data) {
    data = data || {};
    const raw = Array.isArray(data.indicators)
      ? data.indicators
      : (data.data && Array.isArray(data.data.indicators) ? data.data.indicators : []);
    return raw.map(normalizeIndicator).filter(Boolean);
  }

  async function fetchServerIndicators() {
    if (!INDICATOR_SERVER_URL || !isAuthenticatedForIndicatorServer() || indicatorServerLoading) return false;

    indicatorServerLoading = true;
    try {
      const res = await fetch(INDICATOR_SERVER_URL, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        cache: "no-store",
      });

      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false || data.authenticated === false) {
        indicatorServerAvailable = false;
        return false;
      }

      indicatorServerAvailable = true;
      suppressIndicatorServerSave = true;
      indicators = normalizeServerIndicatorsPayload(data);
      suppressIndicatorServerSave = false;
      rebuildAll();
      renderCatalog();
      renderFavoritePanel();
      renderRightList();
      schedulePaneLabelRefresh();
      scheduleChartRelayout();
      return true;
    } catch (e) {
      indicatorServerAvailable = false;
      suppressIndicatorServerSave = false;
      return false;
    } finally {
      indicatorServerLoading = false;
    }
  }

  function scheduleServerIndicatorSave() {
    if (IS_INSIGHT_EMBED) return;
    if (suppressIndicatorServerSave) return;
    if (!INDICATOR_SERVER_URL || !isAuthenticatedForIndicatorServer()) return;

    clearTimeout(indicatorServerSaveTimer);
    indicatorServerSaveTimer = setTimeout(saveIndicatorsToServer, 220);
  }

  async function saveIndicatorsToServer() {
    if (!INDICATOR_SERVER_URL || !isAuthenticatedForIndicatorServer()) return;

    try {
      const res = await fetch(INDICATOR_SERVER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          stockCode: CURRENT_STOCK_CODE,
          indicators: getPlainIndicators(),
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      indicatorServerAvailable = !!(res.ok && data.ok !== false && data.authenticated !== false);
    } catch (e) {
      indicatorServerAvailable = false;
    }
  }

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
      type: "ichimoku",
      name: "일목구름",
      shortName: "ICH",
      desc: "전환선·기준선·선행스팬·후행스팬을 차트 위에 표시합니다.",
      keywords: "ichimoku 일목균형표 일목구름 구름 전환선 기준선 선행스팬 후행스팬",
      defaultPeriod: 9,
      color: "#22c55e",
    },
    {
      type: "volume",
      name: "거래량",
      shortName: "VOL",
      desc: "거래량 막대를 차트 바로 아래 보조창에 표시합니다.",
      keywords: "volume vol 거래량",
      defaultPeriod: 0,
      color: "#64748b",
    },
    {
      type: "fvg",
      name: "FVG 갭 전략",
      shortName: "FVG",
      desc: "3개 캔들 사이의 Fair Value Gap 불균형 구간을 박스로 표시합니다. 미체결 갭, 채워진 갭, 리테스트 신호를 설정할 수 있습니다.",
      keywords: "fvg fair value gap ict imbalance order block 갭전략 불균형 페어밸류갭 매수 매도 리테스트",
      defaultPeriod: 3,
      color: "#06b6d4",
    },
    {
      type: "ma_cross",
      name: "이평선 크로스 전략",
      shortName: "CROSS",
      desc: "빠른 이평선과 느린 이평선의 골든크로스·데드크로스를 BUY/SELL 신호로 표시합니다. 기본값은 112/224입니다.",
      keywords: "ma cross moving average golden cross death cross 112 224 이평선 골든크로스 데드크로스 buy sell 매수 매도",
      defaultPeriod: 112,
      color: "#22c55e",
    },
    {
      type: "rsi",
      name: "RSI",
      shortName: "RSI",
      desc: "상승과 하락 강도를 비교하는 모멘텀 지표입니다. RSI선, RSI MA, 상·중·하단 레벨을 설정할 수 있습니다.",
      keywords: "rsi relative strength index 상대강도 과매수 과매도",
      defaultPeriod: 14,
      color: "#8b5cf6",
    },
    {
      type: "stoch",
      name: "스토캐스틱",
      shortName: "STOCH",
      desc: "%K와 %D로 과매수·과매도 구간을 확인하는 모멘텀 지표입니다. 80·50·20 밴드와 배경을 설정할 수 있습니다.",
      keywords: "stoch stochastic stocastic 스토캐스틱 스토캐스틱오실레이터 과매수 과매도 k d",
      defaultPeriod: 14,
      color: "#3b82f6",
    },
    {
      type: "macd",
      name: "MACD+RSI",
      shortName: "M+R",
      desc: "MACD를 % 오실레이터로 정규화하고 RSI를 50 중심선 기준으로 함께 표시합니다. MACD 버튼 하나로 복합지표가 추가됩니다.",
      keywords: "macd rsi combo macd+rsi 복합지표 오실레이터 시그널 히스토그램",
      defaultPeriod: 12,
      color: "#22c55e",
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
    const value = String(type || "").toLowerCase();
    if (value === "bb") return "boll";
    if (value === "ma" || value === "ema") return "ma_pack";
    if (value === "vol") return "volume";
    if (value === "ich" || value === "ichimoku_cloud" || value === "일목구름") return "ichimoku";
    if (value === "stoch" || value === "stochastic" || value === "stocastic" || value === "스토캐스틱") return "stoch";
    if (value === "macdrsi" || value === "macd+rsi" || value === "macd_rsi" || value === "macd_rsi_combo") return "macd";
    if (["fvg", "fairvaluegap", "fair_value_gap", "gap", "ict", "imbalance", "불균형", "페어밸류갭", "갭전략"].includes(value)) return "fvg";
    if (["ma_cross", "macross", "cross", "goldencross", "golden_cross", "deathcross", "death_cross", "이평선크로스", "골든크로스", "데드크로스", "112224"].includes(value)) return "ma_cross";
    // 과거 버전 저장값은 복원하지 않습니다. 요청에 따라 투자자 수급과 HH/LL 계열은 지표 목록에서 제거합니다.
    if (["investor", "investor_flow", "investorflow", "수급", "투자자수급", "hhll", "hh_ll", "hh-ll", "higherhigh", "higher_high", "lowerlow", "lower_low", "marketstructure", "market_structure", "구조", "구조전략", "고점저점", "추세전환", "total", "total_strategy", "토탈", "토탈전략", "터틀", "turtle"].includes(value)) return "";
    return value || "ma_pack";
  }

  function getMeta(type) {
    const fixedType = fixType(type);
    return catalog.find(function (item) { return item.type === fixedType; }) || catalog[0];
  }

  function isBottomPaneIndicator(type) {
    return ["volume", "rsi", "macd", "stoch"].includes(String(type || ""));
  }

  function getIndicatorPaneKey(indicator) {
    if (!indicator || !isBottomPaneIndicator(indicator.type)) return "";
    return String(indicator.type || "").toLowerCase() + ":" + String(indicator.id || "default").toLowerCase();
  }

  function getPaneBaseTypeFromKey(paneKey) {
    return String(paneKey || "").toLowerCase().split(":")[0];
  }

  function getVisibleIndicatorByPaneKey(paneKey) {
    const key = String(paneKey || "").toLowerCase();
    return indicators.find(function (item) {
      return item && item.visible !== false && getIndicatorPaneKey(item) === key;
    }) || null;
  }

  function isCatalogIndicatorType(type) {
    const fixed = fixType(type);
    return catalog.some(function (item) { return item.type === fixed; });
  }

  function readFavoriteTypes() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITE_KEY));
      if (Array.isArray(saved)) {
        const filtered = saved.map(fixType).filter(function (type) { return type && isCatalogIndicatorType(type); });
        if (filtered.length) return Array.from(new Set(filtered));
      }
    } catch (e) {}
    return ["volume", "macd", "ma_cross"];
  }

  function saveFavoriteTypes() {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(Array.from(new Set(favoriteTypes.map(fixType).filter(isCatalogIndicatorType)))));
  }

  let insightIndicatorNotifyTimer = null;

  function notifyInsightIndicatorsChanged() {
    if (!IS_INSIGHT_EMBED) return;
    clearTimeout(insightIndicatorNotifyTimer);
    insightIndicatorNotifyTimer = setTimeout(function () {
      try {
        const payload = {
          type: "bitgak:insight-indicators-changed",
          code: app && app.dataset ? app.dataset.code || "" : "",
          indicators: getPlainIndicators(),
        };
        if (window.parent && window.parent !== window) window.parent.postMessage(payload, "*");
      } catch (e) {}
    }, 40);
  }

  function forceInsightIndicatorRebuildAndNotify() {
    rebuildAll();
    renderRightList();
    notifyInsightIndicatorsChanged();
    scheduleChartRelayout();
  }

  function scheduleChartRelayout() {
    const preservedRange = api && api.getVisibleLogicalRangeSafe ? api.getVisibleLogicalRangeSafe() : null;

    const run = function () {
      try { if (api.syncPaneTimeScales) api.syncPaneTimeScales(); } catch (e) {}
      try { if (api.refreshPaneLabels) api.refreshPaneLabels(); } catch (e) {}
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
      try {
        if (preservedRange && api.setVisibleLogicalRangeSafe) api.setVisibleLogicalRangeSafe(preservedRange);
      } catch (e) {}
      try {
        if (api.forceDrawingRelayout) api.forceDrawingRelayout();
        else if (api.refreshDrawingLayer) api.refreshDrawingLayer();
      } catch (e) {}
      try { normalizePaneLabelDom(); } catch (e) {}
    };

    requestAnimationFrame(run);
    [40, 120, 260, 520].forEach(function (delay) {
      setTimeout(run, delay);
    });
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
      visible: normalizeBool(raw.visible ?? raw.enabled, true),
      period: clampNumber(raw.period, 1, 2000, fallback.period),
      width: clampNumber(raw.width, 1, 6, fallback.width),
      source,
      method,
      color: raw.color || fallback.color,
    };
  }

  function normalizeBool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    return true;
  }

  function normalizeColor(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }


  function normalizeIndicator(raw) {
    if (!raw) return null;

    const legacyId = raw.id || raw.uid;
    const originalType = raw.type || legacyId;
    const type = fixType(originalType);
    if (!isCatalogIndicatorType(type)) return null;
    const meta = getMeta(type);
    const settings = raw.settings || {};

    if (type === "ma_pack") {
      let lines = Array.isArray(raw.lines) ? raw.lines : null;
      if (!lines && Array.isArray(settings.lines)) {
        lines = settings.lines.map(function (line) {
          return {
            id: line.id,
            visible: normalizeBool(line.visible ?? line.enabled, true),
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
          visible: normalizeBool(raw.visible ?? raw.enabled, true),
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
        visible: normalizeBool(raw.visible ?? raw.enabled, true),
        lines: fixedLines.slice(0, 10),
        series: [],
      };
    }

    const base = {
      id: raw.id || raw.uid || makeId(type),
      type,
      visible: normalizeBool(raw.visible ?? raw.enabled, true),
      source: raw.source || settings.source || (type === "volume" ? "volume" : "close"),
      color: normalizeColor(raw.color || settings.color, meta.color),
      width: clampNumber(raw.width || settings.width || 2, 1, 6, type === "boll" ? 1 : 2),
      period: clampNumber(raw.period || settings.period || meta.defaultPeriod || 20, 1, 2000, meta.defaultPeriod || 20),
      fast: clampNumber(raw.fast || settings.fast || 12, 1, 500, 12),
      slow: clampNumber(raw.slow || settings.slow || 26, 1, 800, 26),
      signal: clampNumber(raw.signal || settings.signal || 9, 1, 500, 9),
      series: [],
    };


    if (type === "fvg") {
      return Object.assign(base, {
        type: "fvg",
        source: "price",
        timeframe: normalizeHHLLTimeframe(raw.timeframe || settings.timeframe || "current"),
        minGapPct: clampNumber(raw.minGapPct || settings.minGapPct || 0.3, 0, 50, 0.3),
        maxZones: clampNumber(raw.maxZones || settings.maxZones || 30, 1, 300, 30),
        statusFilter: ["open", "all", "filled"].includes(String(raw.statusFilter || settings.statusFilter || "open")) ? String(raw.statusFilter || settings.statusFilter || "open") : "open",
        extendBars: clampNumber(raw.extendBars || settings.extendBars || 80, 5, 1000, 80),
        showBullish: normalizeBool(raw.showBullish ?? settings.showBullish, true),
        showBearish: normalizeBool(raw.showBearish ?? settings.showBearish, true),
        showLabels: normalizeBool(raw.showLabels ?? settings.showLabels, true),
        showRetestSignals: normalizeBool(raw.showRetestSignals ?? settings.showRetestSignals, true),
        bullColor: normalizeColor(raw.bullColor || settings.bullColor, "rgba(20, 184, 166, 0.24)"),
        bearColor: normalizeColor(raw.bearColor || settings.bearColor, "rgba(239, 68, 68, 0.24)"),
        bullBorderColor: normalizeColor(raw.bullBorderColor || settings.bullBorderColor, "#14b8a6"),
        bearBorderColor: normalizeColor(raw.bearBorderColor || settings.bearBorderColor, "#ef4444"),
        buyColor: normalizeColor(raw.buyColor || settings.buyColor, "#16a34a"),
        sellColor: normalizeColor(raw.sellColor || settings.sellColor, "#ef4444"),
      });
    }

    if (type === "ma_cross") {
      const fast = clampNumber(raw.fastPeriod || raw.fast || settings.fastPeriod || settings.fast || 112, 1, 2000, 112);
      const slow = clampNumber(raw.slowPeriod || raw.slow || settings.slowPeriod || settings.slow || 224, 2, 3000, 224);
      return Object.assign(base, {
        type: "ma_cross",
        source: raw.source || settings.source || "close",
        timeframe: normalizeHHLLTimeframe(raw.timeframe || settings.timeframe || "current"),
        fastPeriod: fast,
        slowPeriod: slow <= fast ? fast + 1 : slow,
        method: METHOD_OPTIONS.some(function (x) { return x.value === String(raw.method || settings.method || "sma").toLowerCase(); }) ? String(raw.method || settings.method || "sma").toLowerCase() : "sma",
        maxSignals: clampNumber(raw.maxSignals || settings.maxSignals || 80, 5, 1000, 80),
        showLines: normalizeBool(raw.showLines ?? settings.showLines, true),
        showSignals: normalizeBool(raw.showSignals ?? settings.showSignals, true),
        showLastState: normalizeBool(raw.showLastState ?? settings.showLastState, true),
        fastColor: normalizeColor(raw.fastColor || settings.fastColor, "#3b82f6"),
        slowColor: normalizeColor(raw.slowColor || settings.slowColor, "#f97316"),
        buyColor: normalizeColor(raw.buyColor || settings.buyColor, "#16a34a"),
        sellColor: normalizeColor(raw.sellColor || settings.sellColor, "#ef4444"),
      });
    }

    if (type === "boll") {
      return Object.assign(base, {
        upperColor: normalizeColor(raw.upperColor || settings.upperColor, "#ef4444"),
        middleColor: normalizeColor(raw.middleColor || settings.middleColor, "#3b82f6"),
        lowerColor: normalizeColor(raw.lowerColor || settings.lowerColor, "#14b8a6"),
      });
    }

    if (type === "rsi") {
      return Object.assign(base, {
        period: clampNumber(raw.period || settings.period || 14, 1, 300, 14),
        maPeriod: clampNumber(raw.maPeriod || settings.maPeriod || raw.signal || settings.signal || 14, 1, 300, 14),
        upper: clampNumber(raw.upper || settings.upper || 70, 1, 100, 70),
        middle: clampNumber(raw.middle || settings.middle || 50, 0, 100, 50),
        lower: clampNumber(raw.lower || settings.lower || 30, 0, 99, 30),
        maColor: normalizeColor(raw.maColor || settings.maColor, "#facc15"),
        upperColor: normalizeColor(raw.upperColor || settings.upperColor, "rgba(148, 163, 184, 0.78)"),
        middleColor: normalizeColor(raw.middleColor || settings.middleColor, "rgba(148, 163, 184, 0.48)"),
        lowerColor: normalizeColor(raw.lowerColor || settings.lowerColor, "rgba(148, 163, 184, 0.78)"),
        showRsi: normalizeBool(raw.showRsi ?? settings.showRsi, true),
        showRsiMa: normalizeBool(raw.showRsiMa ?? settings.showRsiMa, true),
        showUpper: normalizeBool(raw.showUpper ?? settings.showUpper, true),
        showMiddle: normalizeBool(raw.showMiddle ?? settings.showMiddle, true),
        showLower: normalizeBool(raw.showLower ?? settings.showLower, true),
      });
    }

    if (type === "stoch") {
      return Object.assign(base, {
        period: clampNumber(raw.period || raw.kPeriod || settings.period || settings.kPeriod || 14, 1, 300, 14),
        kSmoothing: clampNumber(raw.kSmoothing || settings.kSmoothing || 1, 1, 100, 1),
        dSmoothing: clampNumber(raw.dSmoothing || settings.dSmoothing || 3, 1, 100, 3),
        upper: clampNumber(raw.upper || settings.upper || 80, 1, 100, 80),
        middle: clampNumber(raw.middle || settings.middle || 50, 0, 100, 50),
        lower: clampNumber(raw.lower || settings.lower || 20, 0, 99, 20),
        color: normalizeColor(raw.color || raw.kColor || settings.color || settings.kColor, "#3b82f6"),
        dColor: normalizeColor(raw.dColor || settings.dColor, "#fb923c"),
        upperColor: normalizeColor(raw.upperColor || settings.upperColor, "rgba(100, 116, 139, 0.78)"),
        middleColor: normalizeColor(raw.middleColor || settings.middleColor, "rgba(100, 116, 139, 0.42)"),
        lowerColor: normalizeColor(raw.lowerColor || settings.lowerColor, "rgba(100, 116, 139, 0.78)"),
        backgroundColor: normalizeColor(raw.backgroundColor || settings.backgroundColor, "rgba(59, 130, 246, 0.12)"),
        showK: normalizeBool(raw.showK ?? settings.showK, true),
        showD: normalizeBool(raw.showD ?? settings.showD, true),
        showUpper: normalizeBool(raw.showUpper ?? settings.showUpper, true),
        showMiddle: normalizeBool(raw.showMiddle ?? settings.showMiddle, true),
        showLower: normalizeBool(raw.showLower ?? settings.showLower, true),
        showBackground: normalizeBool(raw.showBackground ?? settings.showBackground, true),
      });
    }

    if (type === "macd") {
      return Object.assign(base, {
        color: normalizeColor(raw.color || settings.color, "#22c55e"),
        rsiPeriod: clampNumber(raw.rsiPeriod || settings.rsiPeriod || 14, 1, 300, 14),
        rsiColor: normalizeColor(raw.rsiColor || settings.rsiColor, "#a78bfa"),
        signalColor: normalizeColor(raw.signalColor || settings.signalColor, "#fb923c"),
        histUpColor: normalizeColor(raw.histUpColor || settings.histUpColor, "rgba(20, 184, 166, 0.64)"),
        histDownColor: normalizeColor(raw.histDownColor || settings.histDownColor, "rgba(248, 113, 113, 0.64)"),
        levelColor: normalizeColor(raw.levelColor || settings.levelColor || raw.zeroColor || settings.zeroColor, "rgba(148, 163, 184, 0.62)"),
        showHistogram: normalizeBool(raw.showHistogram ?? settings.showHistogram, true),
        showMacd: normalizeBool(raw.showMacd ?? settings.showMacd, true),
        showSignal: normalizeBool(raw.showSignal ?? settings.showSignal, true),
        showRsi: normalizeBool(raw.showRsi ?? settings.showRsi, true),
        showLevels: normalizeBool(raw.showLevels ?? settings.showLevels ?? raw.showZero ?? settings.showZero, true),
      });
    }

    if (type === "ichimoku") {
      return Object.assign(base, {
        conversion: clampNumber(raw.conversion || settings.conversion || 9, 1, 300, 9),
        base: clampNumber(raw.base || settings.base || 26, 1, 500, 26),
        spanB: clampNumber(raw.spanB || settings.spanB || 52, 1, 800, 52),
        displacement: clampNumber(raw.displacement || settings.displacement || 26, 0, 300, 26),
        conversionColor: normalizeColor(raw.conversionColor || settings.conversionColor, "#2563eb"),
        baseColor: normalizeColor(raw.baseColor || settings.baseColor, "#dc2626"),
        spanAColor: normalizeColor(raw.spanAColor || settings.spanAColor, "#22c55e"),
        spanBColor: normalizeColor(raw.spanBColor || settings.spanBColor, "#f87171"),
        laggingColor: normalizeColor(raw.laggingColor || settings.laggingColor, "#16a34a"),
        cloudUpColor: normalizeColor(raw.cloudUpColor || settings.cloudUpColor, "rgba(37, 99, 235, 0.18)"),
        cloudDownColor: normalizeColor(raw.cloudDownColor || settings.cloudDownColor, "rgba(239, 68, 68, 0.18)"),
        showConversion: normalizeBool(raw.showConversion ?? settings.showConversion, true),
        showBase: normalizeBool(raw.showBase ?? settings.showBase, true),
        showSpanA: normalizeBool(raw.showSpanA ?? settings.showSpanA, true),
        showSpanB: normalizeBool(raw.showSpanB ?? settings.showSpanB, true),
        showLagging: normalizeBool(raw.showLagging ?? settings.showLagging, true),
        showCloudFill: normalizeBool(raw.showCloudFill ?? settings.showCloudFill, true),
      });
    }


    return base;
  }

  function readStoredIndicators() {
    // v7부터 stock_detail 지표는 서버 저장만 사용한다.
    // localStorage의 과거 지표가 서버 화면에 섞이면 종목 이동/상세글 표시에서
    // 이전 지표가 다시 살아나는 문제가 생기므로 초기값은 항상 빈 배열로 둔다.
    return [];
  }

  function loadIndicators() {
    indicators = readStoredIndicators().map(normalizeIndicator).filter(Boolean);
  }

  function saveIndicators() {
    if (IS_INSIGHT_EMBED) {
      notifyInsightIndicatorsChanged();
      return;
    }

    // 서버 저장만 수행한다. 404/비로그인/권한 없음이면 저장하지 않는다.
    // 기존 localStorage key에는 더 이상 쓰지 않는다.
    scheduleServerIndicatorSave();
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

  function calcRSI(rows, period, source) {
    const result = [];
    if (!period || rows.length <= period) return result;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const prev = getSourceValue(rows[i - 1], source || "close");
      const curr = getSourceValue(rows[i], source || "close");
      if (prev === null || curr === null) return result;
      const diff = curr - prev;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: rows[period].time, value: Math.round((100 - 100 / (1 + firstRs)) * 100) / 100 });

    for (let i = period + 1; i < rows.length; i++) {
      const prev = getSourceValue(rows[i - 1], source || "close");
      const curr = getSourceValue(rows[i], source || "close");
      if (prev === null || curr === null) continue;
      const diff = curr - prev;
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

  function calcStochastic(rows, kPeriod, kSmoothing, dSmoothing, source) {
    const rawK = [];
    const period = Math.max(1, Number(kPeriod || 14));
    const smoothK = Math.max(1, Number(kSmoothing || 1));
    const smoothD = Math.max(1, Number(dSmoothing || 3));

    if (!Array.isArray(rows) || rows.length < period) return { k: [], d: [] };

    for (let i = 0; i < rows.length; i++) {
      if (i < period - 1) continue;

      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      let valid = true;

      for (let j = i - period + 1; j <= i; j++) {
        const high = Number(rows[j] && rows[j].high);
        const low = Number(rows[j] && rows[j].low);
        if (!Number.isFinite(high) || !Number.isFinite(low)) {
          valid = false;
          break;
        }
        highestHigh = Math.max(highestHigh, high);
        lowestLow = Math.min(lowestLow, low);
      }

      const closeValue = getSourceValue(rows[i], source || "close");
      if (!valid || closeValue === null || !Number.isFinite(highestHigh) || !Number.isFinite(lowestLow)) continue;

      const range = highestHigh - lowestLow;
      const value = range === 0 ? 50 : ((closeValue - lowestLow) / range) * 100;
      rawK.push({ time: rows[i].time, value: Math.round(value * 100) / 100 });
    }

    const k = smoothK <= 1 ? rawK : calcSeriesMA(rawK, smoothK);
    const d = calcSeriesMA(k, smoothD);
    return { k, d };
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

  function calcMACD(rows, fastPeriod, slowPeriod, signalPeriod, source, asPercent) {
    const fast = calcEMA(rows, fastPeriod || 12, source || "close");
    const slow = calcEMA(rows, slowPeriod || 26, source || "close");
    const slowMap = new Map(slow.map(function (x) { return [String(x.time), x.value]; }));
    const rowMap = new Map((rows || []).map(function (row) { return [String(row.time), row]; }));
    const macd = [];

    fast.forEach(function (x) {
      const slowValue = slowMap.get(String(x.time));
      if (slowValue === undefined) return;
      let value = x.value - slowValue;
      if (asPercent) {
        const row = rowMap.get(String(x.time));
        const baseValue = getSourceValue(row, source || "close") || Number(row && row.close) || 0;
        if (baseValue) value = (value / baseValue) * 100;
      }
      macd.push({ time: x.time, value: Math.round(value * 10000) / 10000 });
    });

    const signal = calcSeriesEMA(macd, signalPeriod || 9);
    const signalMap = new Map(signal.map(function (x) { return [String(x.time), x.value]; }));
    const histogram = [];

    macd.forEach(function (x) {
      const signalValue = signalMap.get(String(x.time));
      if (signalValue === undefined) return;
      const value = Math.round((x.value - signalValue) * 10000) / 10000;
      histogram.push({ time: x.time, value: value });
    });

    return { macd, signal, histogram };
  }

  function colorizeHistogram(data, upColor, downColor) {
    return (data || []).map(function (item) {
      return {
        time: item.time,
        value: item.value,
        color: Number(item.value) >= 0 ? upColor : downColor,
      };
    });
  }

  function donchianMid(rows, index, period) {
    if (index < period - 1) return null;
    let high = -Infinity;
    let low = Infinity;
    for (let i = index - period + 1; i <= index; i++) {
      const h = Number(rows[i] && rows[i].high);
      const l = Number(rows[i] && rows[i].low);
      if (!Number.isFinite(h) || !Number.isFinite(l)) return null;
      high = Math.max(high, h);
      low = Math.min(low, l);
    }
    return Math.round(((high + low) / 2) * 100) / 100;
  }

  function calcIchimoku(rows, conversionPeriod, basePeriod, spanBPeriod, displacement) {
    const conversion = [];
    const base = [];
    const spanA = [];
    const spanB = [];
    const lagging = [];
    const convMap = new Map();
    const baseMap = new Map();
    const shift = Math.max(0, Number(displacement || 26));

    for (let i = 0; i < rows.length; i++) {
      const convValue = donchianMid(rows, i, conversionPeriod || 9);
      const baseValue = donchianMid(rows, i, basePeriod || 26);
      const spanBValue = donchianMid(rows, i, spanBPeriod || 52);

      if (convValue !== null) {
        conversion.push({ time: rows[i].time, value: convValue });
        convMap.set(i, convValue);
      }
      if (baseValue !== null) {
        base.push({ time: rows[i].time, value: baseValue });
        baseMap.set(i, baseValue);
      }
      if (convValue !== null && baseValue !== null && rows[i + shift]) {
        spanA.push({ time: rows[i + shift].time, value: Math.round(((convValue + baseValue) / 2) * 100) / 100 });
      }
      if (spanBValue !== null && rows[i + shift]) {
        spanB.push({ time: rows[i + shift].time, value: spanBValue });
      }
      if (i >= shift) {
        const close = Number(rows[i].close);
        if (Number.isFinite(close)) lagging.push({ time: rows[i - shift].time, value: close });
      }
    }

    return { conversion, base, spanA, spanB, lagging };
  }

  function clearSeries(indicator) {
    if (!indicator) return;
    delete indicator.__legendData;
    if (!indicator.series) return;
    indicator.series.forEach(function (series) {
      try {
        if (series && series.__bitgakOverlay && typeof series.remove === "function") series.remove();
        else api.removeSeries(series);
      } catch (e) {}
    });
    indicator.series = [];
  }

  function addLine(color, width, extraOptions) {
    const options = Object.assign({
      color,
      lineWidth: clampNumber(width, 1, 6, 2),
      priceLineVisible: false,
      lastValueVisible: false,
    }, extraOptions || {});
    return api.addLineSeries(options);
  }

  function getPaneScaleMargins(paneType) {
    const type = getPaneBaseTypeFromKey(paneType);

    // 트레이딩뷰처럼 보조지표명/값이 들어갈 상단 여백을 확보하고,
    // 실제 선/막대는 그 아래 영역에 압축해서 그린다.
    if (type === "volume") return { top: 0.18, bottom: 0.02 };
    if (type === "macd") return { top: 0.24, bottom: 0.08 };
    if (type === "rsi") return { top: 0.22, bottom: 0.08 };
    if (type === "stoch") return { top: 0.22, bottom: 0.08 };
    return { top: 0.18, bottom: 0.08 };
  }

  function applyPaneScaleMargins(series, paneType) {
    if (!series || !series.priceScale) return series;

    try {
      series.priceScale().applyOptions({
        scaleMargins: getPaneScaleMargins(paneType),
      });
    } catch (e) {}

    return series;
  }

  function oscillatorAutoscaleInfo() {
    return function () {
      return {
        priceRange: {
          minValue: 0,
          maxValue: 100,
        },
      };
    };
  }

  function oscillatorScaleOptions() {
    return {
      autoscaleInfoProvider: oscillatorAutoscaleInfo(),
      priceScaleId: "right",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    };
  }

  function forceOscillatorPaneRange(seriesList, minValue, maxValue) {
    const list = Array.isArray(seriesList) ? seriesList.filter(Boolean) : [];
    if (!list.length) return;

    const min = Number.isFinite(Number(minValue)) ? Number(minValue) : 0;
    const max = Number.isFinite(Number(maxValue)) ? Number(maxValue) : 100;

    function apply() {
      list.forEach(function (series) {
        if (!series || typeof series.priceScale !== "function") return;
        try {
          const ps = series.priceScale();
          if (!ps) return;
          if (typeof ps.applyOptions === "function") {
            ps.applyOptions({
              autoScale: false,
              scaleMargins: { top: 0.16, bottom: 0.08 },
            });
          }
          if (typeof ps.setVisibleRange === "function") {
            ps.setVisibleRange({ from: min, to: max });
          }
        } catch (e) {}
      });
    }

    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
    setTimeout(apply, 180);
  }

  function addPaneLine(paneType, color, width, extraOptions) {
    const options = Object.assign({
      color,
      lineWidth: clampNumber(width, 1, 6, 2),
      priceLineVisible: false,
      lastValueVisible: false,
    }, extraOptions || {});

    const series = api.addPaneLineSeries ? api.addPaneLineSeries(paneType, options) : api.addLineSeries(options);
    return applyPaneScaleMargins(series, paneType);
  }

  function addPaneHistogram(paneType, extraOptions) {
    const options = Object.assign({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, extraOptions || {});

    const series = api.addPaneHistogramSeries ? api.addPaneHistogramSeries(paneType, options) : api.addHistogramSeries(options);
    return applyPaneScaleMargins(series, paneType);
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


  function chartDateKeyFromRow(row) {
    const raw = String((row && (row.display_time || row.date || row.datetime || row.time)) || "");
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : raw;
  }

  function buildChartDateToTimeMap() {
    const map = new Map();
    const rows = api.getRows ? api.getRows() : [];
    (rows || []).forEach(function (row) {
      const key = chartDateKeyFromRow(row);
      if (key && !map.has(key)) map.set(key, row.time);
    });
    return map;
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

  function formatLegendNumber(value, precision) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const p = Number.isFinite(Number(precision)) ? Number(precision) : 2;
    return n.toFixed(p).replace(/\.?0+$/, "");
  }

  function legendEscape(value) {
    return String(value === null || value === undefined ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function legendSpan(value, className, color) {
    const style = color ? ' style="color:' + legendEscape(color) + ';"' : "";
    return '<span class="bv-pane-legend-value ' + legendEscape(className || "") + '"' + style + '>' + legendEscape(value) + '</span>';
  }

  function legendLabel(value) {
    return '<span class="bv-pane-legend-name">' + legendEscape(value) + '</span>';
  }

  function timeKeyOf(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      if (value.year && value.month && value.day) {
        return [value.year, String(value.month).padStart(2, "0"), String(value.day).padStart(2, "0")].join("-");
      }
      try { return JSON.stringify(value); } catch (e) { return String(value); }
    }
    return String(value);
  }

  function buildValueMap(data) {
    const map = new Map();
    (data || []).forEach(function (item) {
      if (!item || item.time === undefined) return;
      map.set(timeKeyOf(item.time), item.value);
    });
    return map;
  }

  function legendValueFromData(data, time) {
    if (!Array.isArray(data) || !data.length) return null;

    const key = timeKeyOf(time);
    if (key) {
      for (let i = data.length - 1; i >= 0; i--) {
        if (timeKeyOf(data[i].time) === key) return data[i].value;
      }
    }

    return data[data.length - 1] ? data[data.length - 1].value : null;
  }

  function getLegendTargetTime(time) {
    if (time !== undefined && time !== null) return time;
    const rows = api.getRows ? api.getRows() : [];
    return rows && rows.length ? rows[rows.length - 1].time : null;
  }

  function getVisibleIndicatorByType(type) {
    return indicators.find(function (item) {
      return item && item.visible !== false && item.type === type;
    });
  }

  function buildIndicatorLegendText(type, time) {
    const indicator = getVisibleIndicatorByPaneKey(type) || getVisibleIndicatorByType(type);
    if (!indicator || !indicator.__legendData) return null;

    const baseType = indicator.type;
    const data = indicator.__legendData;
    const sourceLabel = optionLabel(SOURCE_OPTIONS, indicator.source || "close");

    if (baseType === "volume") {
      const value = legendValueFromData(data.volume, time);
      const text = "거래량 " + formatCompactNumber(value);
      return {
        text,
        html: legendLabel("거래량") + " " + legendSpan(formatCompactNumber(value), "legend-volume-value", indicator.color || "#64748b"),
        color: indicator.color || "#64748b",
      };
    }

    if (baseType === "rsi") {
      const rsiValue = legendValueFromData(data.rsi, time);
      const maValue = legendValueFromData(data.ma, time);
      const rsiColor = indicator.color || "#8b5cf6";
      const maColor = indicator.maColor || "#facc15";
      const text = "RSI " + (indicator.period || 14) + " " + sourceLabel + "  " + formatLegendNumber(rsiValue, 2) + "  " + formatLegendNumber(maValue, 2);

      return {
        text,
        html: legendLabel("RSI " + (indicator.period || 14) + " " + sourceLabel) +
          " " + legendSpan(formatLegendNumber(rsiValue, 2), "legend-rsi-value", rsiColor) +
          " " + legendSpan(formatLegendNumber(maValue, 2), "legend-rsi-ma-value", maColor),
        color: rsiColor,
      };
    }

    if (baseType === "macd") {
      const macdValue = legendValueFromData(data.macd, time);
      const signalValue = legendValueFromData(data.signal, time);
      const histValue = legendValueFromData(data.histogram, time);
      const rsiValue = legendValueFromData(data.rsi, time);

      const macdColor = indicator.color || "#22c55e";
      const signalColor = indicator.signalColor || "#fb923c";
      const histColor = Number(histValue) >= 0
        ? (indicator.histUpColor || "rgba(20, 184, 166, 0.9)")
        : (indicator.histDownColor || "rgba(248, 113, 113, 0.95)");
      const rsiColor = indicator.rsiColor || "#a78bfa";

      const text = "MACD+RSI " + (indicator.fast || 12) + " " + (indicator.slow || 26) + " " + (indicator.signal || 9) +
        "  " + formatLegendNumber(macdValue, 2) + "  " + formatLegendNumber(signalValue, 2) + "  " + formatLegendNumber(histValue, 2) + "  RSI " + formatLegendNumber(rsiValue, 2);

      return {
        text,
        html: legendLabel("MACD+RSI " + (indicator.fast || 12) + " " + (indicator.slow || 26) + " " + (indicator.signal || 9)) +
          " " + legendSpan(formatLegendNumber(macdValue, 2), "legend-macd-value", macdColor) +
          " " + legendSpan(formatLegendNumber(signalValue, 2), "legend-signal-value", signalColor) +
          " " + legendSpan(formatLegendNumber(histValue, 2), "legend-hist-value", histColor) +
          " " + legendLabel("RSI") +
          " " + legendSpan(formatLegendNumber(rsiValue, 2), "legend-macd-rsi-value", rsiColor),
        color: macdColor,
      };
    }

    if (baseType === "stoch") {
      const kValue = legendValueFromData(data.k, time);
      const dValue = legendValueFromData(data.d, time);
      const kColor = indicator.color || "#3b82f6";
      const dColor = indicator.dColor || "#fb923c";
      const text = "Stoch " + (indicator.period || 14) + " " + (indicator.kSmoothing || 1) + " " + (indicator.dSmoothing || 3) +
        "  " + formatLegendNumber(kValue, 2) + "  " + formatLegendNumber(dValue, 2);

      return {
        text,
        html: legendLabel("Stoch " + (indicator.period || 14) + " " + (indicator.kSmoothing || 1) + " " + (indicator.dSmoothing || 3)) +
          " " + legendSpan(formatLegendNumber(kValue, 2), "legend-stoch-k-value", kColor) +
          " " + legendSpan(formatLegendNumber(dValue, 2), "legend-stoch-d-value", dColor),
        color: kColor,
      };
    }


    return null;
  }

  function updatePaneLegendValues(time) {
    const targetTime = getLegendTargetTime(time);
    const activePaneTypes = getActiveBottomPaneTypes();

    activePaneTypes.forEach(function (paneType) {
      const legend = buildIndicatorLegendText(paneType, targetTime);
      if (!legend) return;
      adaptivePaneLabels[paneType] = { text: legend.text, html: legend.html, color: legend.color };
      try {
        if (api.setPaneLabel) api.setPaneLabel(paneType, legend.text, legend.color);
      } catch (e) {}
    });

    clearAdaptivePaneLabels(activePaneTypes);

    try {
      if (api.refreshPaneLabels) api.refreshPaneLabels();
    } catch (e) {}

    normalizePaneLabelDom();
  }

  function startPaneLegendCrosshairSync() {
    if (api.chart && typeof api.chart.subscribeCrosshairMove === "function") {
      api.chart.subscribeCrosshairMove(function (param) {
        if (param && param.time) updatePaneLegendValues(param.time);
        else updatePaneLegendValues();
      });
    }

    const root = getPossibleChartRoot();
    if (root) {
      ["pointermove", "pointerdown", "pointerup", "wheel"].forEach(function (name) {
        root.addEventListener(name, function () {
          requestAnimationFrame(normalizePaneLabelDom);
        }, { passive: true });
      });
    }
  }

  const adaptivePaneLabels = {};
  const paneBandEls = new Map();
  let paneLabelRefreshRaf = null;
  let paneLabelResizeObserver = null;

  function setAdaptivePaneLabel(paneType, text, color) {
    const fixedType = String(paneType || "").toLowerCase();
    if (!fixedType) return;

    adaptivePaneLabels[fixedType] = {
      text: text || fixedType.toUpperCase(),
      color: color || "#64748b",
    };

    try {
      if (api.setPaneLabel) api.setPaneLabel(fixedType, adaptivePaneLabels[fixedType].text, adaptivePaneLabels[fixedType].color);
    } catch (e) {}

    schedulePaneLabelRefresh();
  }

  function getPossibleChartRoot() {
    if (typeof api.getChartContainer === "function") return api.getChartContainer();
    if (api.chartContainer) return api.chartContainer;
    if (api.container) return api.container;
    return document.querySelector("#chartWrap, #chartContainer, #chart-container, #tvChart, #chart, .chart-wrap, .chart-container, .bitgak-chart, .tv-lightweight-charts");
  }

  function getPaneRectsFromCanvasDom() {
    const root = document.getElementById("tvChart") || getPossibleChartRoot();
    const wrap = getPossibleChartRoot() || document.getElementById("chartWrap") || root;

    if (!root || !wrap) return [];

    const canvases = Array.from(root.querySelectorAll("canvas"));
    const rects = canvases.map(function (canvas) {
      const rect = canvas.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    }).filter(function (rect) {
      // 가격축/작은 오버레이 캔버스는 제외하고 실제 차트 영역만 사용한다.
      return rect.width > 160 && rect.height > 24;
    });

    const groups = [];

    rects.forEach(function (rect) {
      const topKey = Math.round(rect.top);
      let group = groups.find(function (item) {
        return Math.abs(item.topKey - topKey) <= 3;
      });

      if (!group) {
        group = {
          topKey: topKey,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
        };
        groups.push(group);
        return;
      }

      // 같은 pane의 중복 캔버스가 있으면 더 넓은 차트 영역을 기준으로 삼는다.
      if (rect.width > group.width) {
        group.left = rect.left;
        group.width = rect.width;
      }

      group.top = Math.min(group.top, rect.top);
      group.height = Math.max(group.height, rect.height);
      group.bottom = Math.max(group.bottom, rect.bottom);
    });

    return groups.sort(function (a, b) {
      return a.top - b.top;
    });
  }

  function getFallbackPaneLabelRect(type, index, activeTypes) {
    const root = getPossibleChartRoot() || document.getElementById("chartWrap") || document.body;
    const rootRect = root.getBoundingClientRect();
    const chartHeight = Math.max(360, (document.getElementById("tvChart") || root).clientHeight || root.clientHeight || 520);

    const preferred = activeTypes.map(function (paneType) {
      const baseType = getPaneBaseTypeFromKey(paneType);
      if (baseType === "volume") return 118;
      if (baseType === "rsi") return 158;
      if (baseType === "macd") return 172;
      if (baseType === "stoch") return 158;
      return 150;
    });

    const rawSubHeight = preferred.reduce(function (sum, value) { return sum + value; }, 0);
    const maxSubHeight = Math.min(620, Math.max(0, chartHeight - 240));
    const ratio = rawSubHeight > maxSubHeight && rawSubHeight > 0 ? maxSubHeight / rawSubHeight : 1;
    const paneHeights = preferred.map(function (value) {
      return Math.max(96, Math.floor(value * ratio));
    });

    const subHeight = paneHeights.reduce(function (sum, value) { return sum + value; }, 0);
    const mainHeight = Math.max(230, chartHeight - subHeight);

    let top = mainHeight;
    for (let i = 0; i < index; i++) top += paneHeights[i] || 120;

    return {
      top: rootRect.top + top,
      left: rootRect.left,
      height: paneHeights[index] || 120,
      width: rootRect.width,
    };
  }

  function getOverlayRootForBands() {
    const wrap = getPossibleChartRoot() || document.getElementById("chartWrap") || document.body;
    let overlay = document.getElementById("chartIndicatorOverlay");

    if (!overlay && wrap) {
      overlay = wrap.querySelector(".chart-indicator-overlay");
    }

    if (!overlay && wrap) {
      overlay = document.createElement("div");
      overlay.id = "chartIndicatorOverlay";
      overlay.className = "chart-indicator-overlay";
      wrap.appendChild(overlay);
    }

    return overlay || wrap;
  }

  function getPanePlotRectFromPaneRect(paneRect, paneType) {
    const margins = getPaneScaleMargins(paneType);
    const topMargin = paneRect.height * (margins.top || 0);
    const bottomMargin = paneRect.height * (margins.bottom || 0);
    const plotHeight = Math.max(10, paneRect.height - topMargin - bottomMargin);

    return {
      top: paneRect.top + topMargin,
      left: paneRect.left,
      width: paneRect.width,
      height: plotHeight,
      bottom: paneRect.top + topMargin + plotHeight,
    };
  }

  function oscillatorY(plotRect, value) {
    const v = Math.max(0, Math.min(100, Number(value || 0)));
    return plotRect.top + ((100 - v) / 100) * plotRect.height;
  }

  function updatePaneBandFills(activeTypes, paneRects, rootRect) {
    const overlay = getOverlayRootForBands();
    if (!overlay || !rootRect) return;

    const activeSet = new Set(activeTypes || []);

    paneBandEls.forEach(function (el, key) {
      if (!activeSet.has(key)) el.style.display = "none";
    });

    (activeTypes || []).forEach(function (paneKey, index) {
      const baseType = getPaneBaseTypeFromKey(paneKey);
      if (baseType !== "stoch") return;

      const stoch = getVisibleIndicatorByPaneKey(paneKey);
      if (!stoch || stoch.visible === false || stoch.showBackground === false) {
        const old = paneBandEls.get(paneKey);
        if (old) old.style.display = "none";
        return;
      }

      const paneRect = paneRects[index + 1] || getFallbackPaneLabelRect(paneKey, index, activeTypes);
      if (!paneRect) return;

      const plotRect = getPanePlotRectFromPaneRect(paneRect, "stoch");
      const upper = Math.max(0, Math.min(100, Number(stoch.upper || 80)));
      const lower = Math.max(0, Math.min(100, Number(stoch.lower || 20)));
      const yTop = oscillatorY(plotRect, Math.max(upper, lower));
      const yBottom = oscillatorY(plotRect, Math.min(upper, lower));

      let el = paneBandEls.get(paneKey);
      if (!el) {
        el = document.createElement("div");
        el.className = "bitgak-pane-band-fill bitgak-pane-band-fill-stoch";
        el.dataset.paneKey = paneKey;
        overlay.appendChild(el);
        paneBandEls.set(paneKey, el);
      }

      const backgroundColor = stoch.backgroundColor || "rgba(59, 130, 246, 0.12)";

      el.style.display = "block";
      el.style.left = Math.round(paneRect.left - rootRect.left) + "px";
      el.style.top = Math.round(yTop - rootRect.top) + "px";
      el.style.width = Math.max(0, Math.round(paneRect.width)) + "px";
      el.style.height = Math.max(2, Math.round(yBottom - yTop)) + "px";
      el.style.background = backgroundColor;
      el.style.borderTop = "1px dashed rgba(96, 165, 250, 0.28)";
      el.style.borderBottom = "1px dashed rgba(96, 165, 250, 0.28)";
    });
  }

  function normalizePaneLabelDom() {
    const root = getPossibleChartRoot() || document.getElementById("chartWrap") || document.body;
    const rootRect = root.getBoundingClientRect();
    const activeTypes = getActiveBottomPaneTypes();
    const activeSet = new Set(activeTypes);
    const paneRects = getPaneRectsFromCanvasDom();

    document.querySelectorAll(".bitgak-pane-label-layer, .bitgak-locked-pane-label").forEach(function (el) {
      el.remove();
    });

    updatePaneBandFills(activeTypes, paneRects, rootRect);

    document.querySelectorAll(".bv-v5-pane-label").forEach(function (el) {
      const paneType = String(el.dataset.paneType || "").toLowerCase();
      if (!paneType || !activeSet.has(paneType)) {
        el.style.setProperty("display", "none", "important");
        return;
      }

      const index = activeTypes.indexOf(paneType);
      // Lightweight Charts DOM의 실제 pane canvas 위치를 최우선 사용한다.
      // 0번은 메인 가격 pane, 보조지표는 1번부터 시작한다.
      const paneRect = paneRects[index + 1] || getFallbackPaneLabelRect(paneType, index, activeTypes);
      const item = adaptivePaneLabels[paneType];

      if (item && item.text) {
        el.dataset.paneLabelText = item.text;
        el.textContent = item.text;
      }
      if (item && item.html) {
        el.innerHTML = item.html;
      }
      if (item && item.color) {
        el.dataset.paneLabelColor = item.color;
        el.style.setProperty("--label-color", item.color);
      }

      el.classList.add("bitgak-safe-pane-label");
      el.style.setProperty("display", "inline-flex", "important");
      el.style.left = Math.max(8, Math.round((paneRect.left - rootRect.left) + 10)) + "px";
      el.style.top = Math.max(8, Math.round((paneRect.top - rootRect.top) + 10)) + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.transform = "none";
      el.style.pointerEvents = "none";
    });
  }

  function clearAdaptivePaneLabels(activeTypes) {
    const activeSet = new Set((activeTypes || []).map(function (type) {
      return String(type || "").toLowerCase();
    }));

    Object.keys(adaptivePaneLabels).forEach(function (type) {
      if (!activeSet.has(type)) delete adaptivePaneLabels[type];
    });

    document.querySelectorAll(".bitgak-pane-label-layer, .bitgak-locked-pane-label").forEach(function (el) {
      el.remove();
    });

    paneBandEls.forEach(function (el, type) {
      if (!activeSet.has(type)) el.style.display = "none";
    });

    document.querySelectorAll(".bv-v5-pane-label").forEach(function (el) {
      const paneType = String(el.dataset.paneType || "").toLowerCase();
      if (!paneType || !activeSet.has(paneType)) {
        el.style.setProperty("display", "none", "important");
        el.classList.remove("bitgak-safe-pane-label");
      }
    });
  }

  function schedulePaneLabelRefresh() {
    if (paneLabelRefreshRaf) cancelAnimationFrame(paneLabelRefreshRaf);

    paneLabelRefreshRaf = requestAnimationFrame(function () {
      paneLabelRefreshRaf = null;

      Object.keys(adaptivePaneLabels).forEach(function (paneType) {
        const item = adaptivePaneLabels[paneType];
        try {
          if (api.setPaneLabel) api.setPaneLabel(paneType, item.text, item.color);
        } catch (e) {}
      });

      if (api.syncPaneTimeScales) {
        try { api.syncPaneTimeScales(); } catch (e) {}
      }

      try {
        if (api.refreshPaneLabels) api.refreshPaneLabels();
      } catch (e) {}

      normalizePaneLabelDom();

      // Lightweight Charts가 pane 높이 조정 후 DOM을 한 번 더 그리는 경우가 있어 실제 canvas 위치 기준으로 후속 보정한다.
      setTimeout(normalizePaneLabelDom, 0);
      setTimeout(normalizePaneLabelDom, 80);
      setTimeout(normalizePaneLabelDom, 220);
    });
  }

  function startPaneLabelResizeSync() {
    if (paneLabelResizeObserver || !window.ResizeObserver) {
      window.addEventListener("resize", schedulePaneLabelRefresh, { passive: true });
      window.addEventListener("orientationchange", schedulePaneLabelRefresh, { passive: true });
      return;
    }

    const root = getPossibleChartRoot() || document.body;
    paneLabelResizeObserver = new ResizeObserver(function () { schedulePaneLabelRefresh(); });

    try { paneLabelResizeObserver.observe(root); } catch (e) {}
    try {
      const tv = document.getElementById("tvChart");
      if (tv) paneLabelResizeObserver.observe(tv);
    } catch (e) {}

    try {
      const wrap = document.getElementById("chartWrap");
      if (wrap && paneLabelResizeObserver) paneLabelResizeObserver.observe(wrap);
    } catch (e) {}

    window.addEventListener("resize", schedulePaneLabelRefresh, { passive: true });
    window.addEventListener("orientationchange", schedulePaneLabelRefresh, { passive: true });
    document.addEventListener("scroll", schedulePaneLabelRefresh, { passive: true, capture: true });
  }


  function getMainChartObject() {
    if (typeof api.getChart === "function") return api.getChart();
    if (typeof api.getMainChart === "function") return api.getMainChart();
    return api.chart || api.mainChart || api.priceChart || null;
  }

  function timeToCoordinate(chart, time) {
    try {
      const ts = chart && chart.timeScale && chart.timeScale();
      if (ts && typeof ts.timeToCoordinate === "function") return ts.timeToCoordinate(time);
    } catch (e) {}
    try {
      if (api.timeScale && typeof api.timeScale.timeToCoordinate === "function") return api.timeScale.timeToCoordinate(time);
    } catch (e) {}
    return null;
  }

  function getMainChartContainer() {
    const root = getPossibleChartRoot();
    if (!root) return null;
    const tv = root.classList && root.classList.contains("tv-lightweight-charts") ? root : root.querySelector && root.querySelector(".tv-lightweight-charts");
    return tv || root;
  }

  function createIchimokuCloudOverlay(spanA, spanB, coordinateSeries, upColor, downColor) {
    const chart = getMainChartObject() || (api.timeScale ? { timeScale: function () { return api.timeScale; } } : null);
    const container = getMainChartContainer();
    if (!chart || !container || !coordinateSeries || typeof coordinateSeries.priceToCoordinate !== "function") return null;

    const computed = window.getComputedStyle(container);
    if (computed.position === "static") container.style.position = "relative";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("bitgak-ichimoku-cloud-fill");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "3";
    container.appendChild(svg);

    const spanBMap = new Map((spanB || []).map(function (item) { return [String(item.time), item.value]; }));
    const pairs = (spanA || []).map(function (a) {
      const bValue = spanBMap.get(String(a.time));
      if (bValue === undefined) return null;
      return { time: a.time, a: Number(a.value), b: Number(bValue) };
    }).filter(function (item) {
      return item && Number.isFinite(item.a) && Number.isFinite(item.b);
    });

    function buildPath(points) {
      if (points.length < 2) return "";
      const top = points.map(function (p) { return p.x + "," + p.yA; }).join(" L");
      const bottom = points.slice().reverse().map(function (p) { return p.x + "," + p.yB; }).join(" L");
      return "M" + top + " L" + bottom + " Z";
    }

    function render() {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
      svg.setAttribute("width", String(rect.width));
      svg.setAttribute("height", String(rect.height));
      svg.innerHTML = "";

      let current = [];
      let currentBull = null;
      function flush() {
        if (current.length >= 2) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", buildPath(current));
          path.setAttribute("fill", currentBull ? upColor : downColor);
          path.setAttribute("stroke", "none");
          svg.appendChild(path);
        }
        current = [];
        currentBull = null;
      }

      pairs.forEach(function (item) {
        const x = timeToCoordinate(chart, item.time);
        const yA = coordinateSeries.priceToCoordinate(item.a);
        const yB = coordinateSeries.priceToCoordinate(item.b);
        if (x === null || yA === null || yB === null || !Number.isFinite(x) || !Number.isFinite(yA) || !Number.isFinite(yB)) {
          flush();
          return;
        }
        const bull = item.a >= item.b;
        const point = { x: Math.round(x * 100) / 100, yA: Math.round(yA * 100) / 100, yB: Math.round(yB * 100) / 100 };
        if (currentBull === null) currentBull = bull;
        if (currentBull !== bull) {
          if (current.length) current.push(point);
          flush();
          currentBull = bull;
          current.push(point);
        } else {
          current.push(point);
        }
      });
      flush();
    }

    const schedule = function () { requestAnimationFrame(render); };
    schedule();

    let unsubscribe = null;
    try {
      const ts = chart.timeScale && chart.timeScale();
      if (ts && typeof ts.subscribeVisibleLogicalRangeChange === "function") {
        ts.subscribeVisibleLogicalRangeChange(schedule);
        unsubscribe = function () { try { ts.unsubscribeVisibleLogicalRangeChange(schedule); } catch (e) {} };
      } else if (ts && typeof ts.subscribeVisibleTimeRangeChange === "function") {
        ts.subscribeVisibleTimeRangeChange(schedule);
        unsubscribe = function () { try { ts.unsubscribeVisibleTimeRangeChange(schedule); } catch (e) {} };
      }
    } catch (e) {}

    const ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    try { if (ro) ro.observe(container); } catch (e) {}
    window.addEventListener("resize", schedule, { passive: true });

    return {
      __bitgakOverlay: true,
      remove: function () {
        try { if (unsubscribe) unsubscribe(); } catch (e) {}
        try { if (ro) ro.disconnect(); } catch (e) {}
        window.removeEventListener("resize", schedule);
        svg.remove();
      },
      update: schedule,
    };
  }



  function normalizeHHLLTimeframe(value) {
    const raw = String(value || "current").trim().toLowerCase();
    const map = {
      "chart": "current", "현재": "current", "현재차트": "current", "current": "current",
      "4h": "4h", "240": "4h", "4시간": "4h", "4시간봉": "4h",
      "d": "1d", "1d": "1d", "day": "1d", "daily": "1d", "일": "1d", "일봉": "1d",
      "w": "1w", "1w": "1w", "week": "1w", "weekly": "1w", "주": "1w", "주봉": "1w",
      "m": "1mo", "1m": "1mo", "1mo": "1mo", "month": "1mo", "monthly": "1mo", "월": "1mo", "월봉": "1mo"
    };
    return map[raw] || "current";
  }

  function normalizeHHLLSignalMode(value) {
    const raw = String(value || "pullback").trim().toLowerCase();
    if (["break", "breakout", "돌파", "돌파확인", "structure"].includes(raw)) return "breakout";
    if (["both", "all", "둘다", "전체"].includes(raw)) return "both";
    return "pullback";
  }

  function normalizeTotalStrategyMode(value) {
    const raw = String(value || "total").trim().toLowerCase();
    if (["ma", "ma_cross", "cross", "golden", "golden_cross", "골든", "골든크로스"].includes(raw)) return "ma_cross";
    if (["turtle", "터틀", "donchian", "breakout"].includes(raw)) return "turtle";
    if (["structure", "hhll", "hh_ll", "구조", "구조만"].includes(raw)) return "structure";
    return "total";
  }

  function totalStrategyModeLabel(value) {
    const found = TOTAL_STRATEGY_MODE_OPTIONS.find(function (item) { return item.value === normalizeTotalStrategyMode(value); });
    return found ? found.label.split(" · ")[0] : "토탈 기본";
  }

  function hhllTimeframeLabel(value) {
    const found = HHLL_TIMEFRAME_OPTIONS.find(function (item) { return item.value === normalizeHHLLTimeframe(value); });
    return found ? found.label.replace(" 기준", "") : "현재 차트";
  }

  function hhllSignalModeLabel(value) {
    const found = HHLL_SIGNAL_MODE_OPTIONS.find(function (item) { return item.value === normalizeHHLLSignalMode(value); });
    return found ? found.label.split(" · ")[0] : "눌림 확인형";
  }

  function hhllLabelColor(label, indicator) {
    if (label === "HH" || label === "LH") return indicator.highColor || "#38bdf8";
    if (label === "HL" || label === "LL") return indicator.lowColor || "#facc15";
    return indicator.neutralColor || "#64748b";
  }

  function hhllRowDateKey(row) {
    return chartDateKeyFromRow(row);
  }

  function getCurrentChartDateEntries() {
    const rows = api.getRows ? api.getRows() : [];
    return (rows || []).map(function (row, index) {
      return {
        index,
        date: hhllRowDateKey(row),
        time: row.time,
        row,
      };
    }).filter(function (item) { return item.date; });
  }

  function alignHHLLTimeToCurrentChart(row) {
    const dateKey = hhllRowDateKey(row);
    if (!dateKey) return row.time;

    const entries = getCurrentChartDateEntries();
    if (!entries.length) return row.time || dateKey;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].date === dateKey) return entries[i].time;
    }

    // 주봉/월봉 신호 날짜가 현재 차트의 휴장일·월말과 정확히 맞지 않을 수 있어 가장 가까운 이전 봉에 붙인다.
    let candidate = null;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].date <= dateKey) candidate = entries[i];
      else break;
    }
    return candidate ? candidate.time : (row.time || dateKey);
  }

  function alignHHLLStructureToCurrentChart(structure) {
    if (!structure) return structure;

    function alignItem(item) {
      if (!item) return item;
      const row = item.row || {};
      const alignedTime = alignHHLLTimeToCurrentChart(row);
      return Object.assign({}, item, { time: alignedTime });
    }

    const pivots = (structure.pivots || []).map(alignItem);
    const signals = (structure.signals || []).map(alignItem);
    const lastSignal = signals.length ? signals[signals.length - 1] : null;
    return Object.assign({}, structure, { pivots, signals, lastSignal });
  }

  function normalizeHHLLRowsFromPayload(data) {
    const rawRows = Array.isArray(data && data.rows) ? data.rows : [];
    return rawRows.map(function (row) {
      const time = row.time || row.datetime || row.date || row.display_time;
      const display = row.display_time || row.datetime || row.date || row.time || "";
      return {
        time: time,
        display_time: display,
        date: String(display || time || "").slice(0, 10),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0),
      };
    }).filter(function (row) {
      return row.time !== undefined && row.time !== null && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close);
    });
  }

  function hhllFetchUrl(interval) {
    const url = new URL(CHART_API_URL, window.location.origin);
    url.searchParams.set("code", CURRENT_STOCK_CODE);
    url.searchParams.set("symbol", CURRENT_STOCK_CODE);
    url.searchParams.set("interval", interval);
    url.searchParams.set("display_interval", interval);
    url.searchParams.set("resolution", interval);
    url.searchParams.set("range", interval === "4h" ? "120d" : "all");
    url.searchParams.set("timeframe", interval === "4h" ? "intraday" : "daily");
    return url.toString();
  }

  async function fetchHHLLRows(indicator) {
    const timeframe = normalizeHHLLTimeframe(indicator.timeframe || "1d");
    if (timeframe === "current") return api.getRows ? api.getRows() : [];

    const url = hhllFetchUrl(timeframe);
    if (indicator.__hhllRowsPayload && indicator.__hhllRowsCacheKey === url) {
      return indicator.__hhllRowsPayload;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error((data && data.message) || "HH/LL 기준 차트 데이터를 불러오지 못했습니다.");
    const rows = normalizeHHLLRowsFromPayload(data);
    indicator.__hhllRowsCacheKey = url;
    indicator.__hhllRowsPayload = rows;
    return rows;
  }

  function calculateHHLLStructure(rows, indicator) {
    rows = Array.isArray(rows) ? rows : [];
    const left = Math.max(1, Number(indicator.period || 4));
    const right = Math.max(1, Number(indicator.rightBars || 3));
    const maxItems = Math.max(20, Number(indicator.maxSignals || 90));
    const signalMode = normalizeHHLLSignalMode(indicator.signalMode || "pullback");
    const strategyMode = normalizeTotalStrategyMode(indicator.strategyMode || "total");
    const repeatSignals = normalizeBool(indicator.repeatSignals, false);
    const useMAFilter = normalizeBool(indicator.useMAFilter, true);
    const useStructureFilter = normalizeBool(indicator.useStructureFilter, true);
    const useTurtleExit = normalizeBool(indicator.useTurtleExit, true);
    const fastPeriod = Math.max(5, Number(indicator.maFast || 112));
    const slowPeriod = Math.max(fastPeriod + 1, Number(indicator.maSlow || 224));
    const turtleEntry = Math.max(5, Number(indicator.turtleEntry || 20));
    const turtleExit = Math.max(2, Number(indicator.turtleExit || 10));
    const maxExtensionPct = Math.max(0, Number(indicator.maxExtensionPct || 15));
    const pivots = [];

    if (rows.length < left + right + 3) {
      return { pivots: [], signals: [], state: "NEUTRAL", lastSignal: null };
    }

    function finiteHigh(row) {
      const v = Number(row && row.high);
      return Number.isFinite(v) ? v : null;
    }
    function finiteLow(row) {
      const v = Number(row && row.low);
      return Number.isFinite(v) ? v : null;
    }
    function finiteClose(row) {
      const v = Number(row && row.close);
      return Number.isFinite(v) ? v : null;
    }

    function smaAt(index, period) {
      if (index < period - 1) return null;
      let sum = 0;
      for (let i = index - period + 1; i <= index; i++) {
        const close = finiteClose(rows[i]);
        if (close === null) return null;
        sum += close;
      }
      return sum / period;
    }

    const maFast = rows.map(function (_, index) { return smaAt(index, fastPeriod); });
    const maSlow = rows.map(function (_, index) { return smaAt(index, slowPeriod); });

    function highestHighBefore(index, lookback) {
      if (index < lookback) return null;
      let value = -Infinity;
      for (let i = index - lookback; i < index; i++) {
        const h = finiteHigh(rows[i]);
        if (h === null) return null;
        value = Math.max(value, h);
      }
      return value === -Infinity ? null : value;
    }

    function lowestLowBefore(index, lookback) {
      if (index < lookback) return null;
      let value = Infinity;
      for (let i = index - lookback; i < index; i++) {
        const l = finiteLow(rows[i]);
        if (l === null) return null;
        value = Math.min(value, l);
      }
      return value === Infinity ? null : value;
    }

    for (let i = left; i < rows.length - right; i++) {
      const h = finiteHigh(rows[i]);
      const l = finiteLow(rows[i]);
      if (h === null || l === null) continue;

      let isHigh = true;
      let isLow = true;

      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        const otherHigh = finiteHigh(rows[j]);
        const otherLow = finiteLow(rows[j]);
        if (otherHigh !== null && otherHigh >= h) isHigh = false;
        if (otherLow !== null && otherLow <= l) isLow = false;
        if (!isHigh && !isLow) break;
      }

      if (isHigh) pivots.push({ kind: "high", index: i, time: rows[i].time, price: h, row: rows[i] });
      if (isLow) pivots.push({ kind: "low", index: i, time: rows[i].time, price: l, row: rows[i] });
    }

    pivots.sort(function (a, b) {
      if (a.index !== b.index) return a.index - b.index;
      return a.kind === "low" ? -1 : 1;
    });

    let prevHigh = null;
    let prevLow = null;
    let lastHighLabel = "";
    let lastLowLabel = "";
    let structureState = "NEUTRAL";
    const pivotsByIndex = new Map();

    pivots.forEach(function (pivot) {
      if (pivot.kind === "high") {
        pivot.label = prevHigh === null ? "H" : (pivot.price > prevHigh.price ? "HH" : "LH");
        prevHigh = pivot;
        lastHighLabel = pivot.label;
      } else {
        pivot.label = prevLow === null ? "L" : (pivot.price > prevLow.price ? "HL" : "LL");
        prevLow = pivot;
        lastLowLabel = pivot.label;
      }

      pivot.structureSignal = "";
      if (pivot.kind === "low" && pivot.label === "HL" && lastHighLabel === "HH") {
        structureState = "BULL";
        pivot.structureSignal = "BUY_PULLBACK";
      } else if (pivot.kind === "high" && pivot.label === "HH" && lastLowLabel === "HL") {
        if (structureState !== "BULL") structureState = "BULL_OBSERVE";
        pivot.structureSignal = "BUY_BREAKOUT";
      } else if (pivot.kind === "high" && pivot.label === "LH" && lastLowLabel === "LL") {
        structureState = "BEAR";
        pivot.structureSignal = "SELL_PULLBACK";
      } else if (pivot.kind === "low" && pivot.label === "LL" && lastHighLabel === "LH") {
        if (structureState !== "BEAR") structureState = "BEAR_OBSERVE";
        pivot.structureSignal = "SELL_BREAKOUT";
      }

      if (!pivotsByIndex.has(pivot.index)) pivotsByIndex.set(pivot.index, []);
      pivotsByIndex.get(pivot.index).push(pivot);
    });

    const signals = [];
    let liveStructureState = "NEUTRAL";
    let lastSignalType = "";

    function maTrendAt(index) {
      const fast = maFast[index];
      const slow = maSlow[index];
      const prevFast = maFast[index - 1];
      const prevSlow = maSlow[index - 1];
      const close = finiteClose(rows[index]);
      const maReady = Number.isFinite(fast) && Number.isFinite(slow);
      const maBull = maReady ? fast > slow : true;
      const maBear = maReady ? fast < slow : false;
      const goldenCross = maReady && Number.isFinite(prevFast) && Number.isFinite(prevSlow) && prevFast <= prevSlow && fast > slow;
      const deathCross = maReady && Number.isFinite(prevFast) && Number.isFinite(prevSlow) && prevFast >= prevSlow && fast < slow;
      const extensionPct = maReady && close !== null && fast ? ((close - fast) / fast) * 100 : 0;
      const overExtended = maReady && close !== null && maxExtensionPct > 0 ? extensionPct > maxExtensionPct : false;
      const aboveFast = !maReady || close === null ? true : close >= fast;
      const belowFast = maReady && close !== null ? close < fast : false;
      return { fast, slow, maReady, maBull, maBear, goldenCross, deathCross, extensionPct, overExtended, aboveFast, belowFast };
    }

    function turtleAt(index) {
      const close = finiteClose(rows[index]);
      const highBreak = highestHighBefore(index, turtleEntry);
      const lowExit = lowestLowBefore(index, turtleExit);
      return {
        entry: close !== null && highBreak !== null && close > highBreak,
        exit: close !== null && lowExit !== null && close < lowExit,
      };
    }

    function canPush(type) {
      return repeatSignals || lastSignalType !== type;
    }

    function pushSignal(type, index, pivot, reason) {
      if (!rows[index] || !canPush(type)) return;
      lastSignalType = type;
      const isBuy = type === "BUY";
      const row = rows[index];
      signals.push({
        type,
        index,
        time: pivot ? pivot.time : row.time,
        price: pivot ? pivot.price : (isBuy ? Number(row.low || row.close) : Number(row.high || row.close)),
        pivot: pivot || null,
        row: pivot ? pivot.row : row,
        mode: strategyMode,
        reason: reason || "",
      });
    }

    for (let i = 1; i < rows.length; i++) {
      const pivotEvents = pivotsByIndex.get(i) || [];
      pivotEvents.forEach(function (pivot) {
        if (pivot.structureSignal === "BUY_PULLBACK") liveStructureState = "BULL";
        else if (pivot.structureSignal === "BUY_BREAKOUT" && liveStructureState !== "BULL") liveStructureState = "BULL_OBSERVE";
        else if (pivot.structureSignal === "SELL_PULLBACK") liveStructureState = "BEAR";
        else if (pivot.structureSignal === "SELL_BREAKOUT" && liveStructureState !== "BEAR") liveStructureState = "BEAR_OBSERVE";
      });

      const trend = maTrendAt(i);
      const turtle = turtleAt(i);
      const bullStruct = !useStructureFilter || liveStructureState === "BULL" || liveStructureState === "BULL_OBSERVE";
      const bearStruct = liveStructureState === "BEAR" || liveStructureState === "BEAR_OBSERVE";
      const maBullOk = !useMAFilter || trend.maBull;
      const maBearOk = useMAFilter && trend.maBear;
      const buyAllowed = maBullOk && bullStruct && trend.aboveFast && !trend.overExtended;

      const pullbackBuyPivot = pivotEvents.find(function (p) { return p.structureSignal === "BUY_PULLBACK"; }) || null;
      const breakoutBuyPivot = pivotEvents.find(function (p) { return p.structureSignal === "BUY_BREAKOUT"; }) || null;
      const pullbackSellPivot = pivotEvents.find(function (p) { return p.structureSignal === "SELL_PULLBACK"; }) || null;
      const breakoutSellPivot = pivotEvents.find(function (p) { return p.structureSignal === "SELL_BREAKOUT"; }) || null;

      if (strategyMode === "ma_cross") {
        if (trend.goldenCross && !trend.overExtended && (!useStructureFilter || !bearStruct)) pushSignal("BUY", i, null, fastPeriod + "/" + slowPeriod + " 골든크로스");
        if (trend.deathCross || (useTurtleExit && turtle.exit)) pushSignal("SELL", i, null, trend.deathCross ? fastPeriod + "/" + slowPeriod + " 데드크로스" : "터틀 이탈");
        continue;
      }

      if (strategyMode === "turtle") {
        if (turtle.entry && maBullOk && !trend.overExtended) pushSignal("BUY", i, null, "터틀 " + turtleEntry + "봉 돌파");
        if (turtle.exit || maBearOk) pushSignal("SELL", i, null, turtle.exit ? "터틀 " + turtleExit + "봉 이탈" : "장기 이평 약세");
        continue;
      }

      if (strategyMode === "structure") {
        if ((signalMode === "pullback" || signalMode === "both") && pullbackBuyPivot && !trend.overExtended) pushSignal("BUY", i, pullbackBuyPivot, "HH 이후 HL 확인");
        if ((signalMode === "breakout" || signalMode === "both") && breakoutBuyPivot && !trend.overExtended) pushSignal("BUY", i, breakoutBuyPivot, "HL 이후 HH 돌파");
        if ((signalMode === "pullback" || signalMode === "both") && pullbackSellPivot) pushSignal("SELL", i, pullbackSellPivot, "LL 이후 LH 확인");
        if ((signalMode === "breakout" || signalMode === "both") && breakoutSellPivot) pushSignal("SELL", i, breakoutSellPivot, "LH 이후 LL 이탈");
        continue;
      }

      // 토탈 기본: 고점 추격을 막기 위해 112/224 상승추세 + 구조 확인 + 112선 대비 과열 제한을 통과해야 BUY를 표시한다.
      // 터틀은 기본적으로 매수 추격보다 리스크 관리(이탈 SELL)에 더 강하게 사용한다.
      if (trend.deathCross || (useTurtleExit && turtle.exit) || (bearStruct && (pullbackSellPivot || breakoutSellPivot)) || (lastSignalType === "BUY" && trend.belowFast && useTurtleExit)) {
        pushSignal("SELL", i, pullbackSellPivot || breakoutSellPivot || null, trend.deathCross ? fastPeriod + "/" + slowPeriod + " 데드크로스" : (turtle.exit ? "터틀 이탈" : "약세 구조/112선 이탈"));
        continue;
      }

      if (buyAllowed && pullbackBuyPivot) {
        pushSignal("BUY", i, pullbackBuyPivot, "112/224 상승 + HH 이후 HL 눌림");
        continue;
      }

      if (buyAllowed && trend.goldenCross) {
        pushSignal("BUY", i, null, fastPeriod + "/" + slowPeriod + " 골든크로스");
        continue;
      }

      if (buyAllowed && turtle.entry && liveStructureState === "BULL") {
        pushSignal("BUY", i, null, "터틀 돌파 + 상승 구조");
        continue;
      }
    }

    const filteredPivots = pivots.filter(function (p) { return ["HH", "HL", "LH", "LL"].includes(p.label); }).slice(-maxItems);
    const filteredSignals = signals.slice(-Math.max(10, Math.floor(maxItems / 2)));
    const lastSignal = filteredSignals.length ? filteredSignals[filteredSignals.length - 1] : null;
    const finalState = lastSignal ? (lastSignal.type === "BUY" ? "BULL" : "BEAR") : liveStructureState;

    return {
      pivots: filteredPivots,
      signals: filteredSignals,
      state: finalState,
      lastSignal,
      basisLabel: hhllTimeframeLabel(indicator.timeframe || "1d"),
      signalModeLabel: totalStrategyModeLabel(strategyMode),
      maFast: fastPeriod,
      maSlow: slowPeriod,
      turtleEntry,
      turtleExit,
      maxExtensionPct,
    };
  }

  function createHHLLOverlay(indicator, structure) {
    const wrap = (typeof api.getChartContainer === "function" ? api.getChartContainer() : null) || document.getElementById("chartWrap") || document.getElementById("tvChart");
    const chart = api.chart || (typeof api.getChart === "function" ? api.getChart() : null);
    const candle = api.candleSeries || api.mainSeries || null;
    if (!wrap || !chart || !candle || !chart.timeScale || !candle.priceToCoordinate) return null;

    const computed = window.getComputedStyle(wrap);
    if (computed.position === "static") wrap.style.position = "relative";

    const layer = document.createElement("div");
    layer.className = "bitgak-hhll-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "12";
    layer.style.overflow = "hidden";
    wrap.appendChild(layer);

    function markerHtml(text, color, x, y, isSignal, signalType) {
      const el = document.createElement("div");
      el.className = isSignal ? "bitgak-hhll-signal bitgak-hhll-signal-" + String(signalType || "").toLowerCase() : "bitgak-hhll-marker";
      el.textContent = text;
      el.style.position = "absolute";
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      el.style.transform = "translate(-50%, -50%)";
      el.style.minWidth = isSignal ? "42px" : "28px";
      el.style.height = isSignal ? "22px" : "20px";
      el.style.padding = isSignal ? "0 8px" : "0 6px";
      el.style.borderRadius = isSignal ? "999px" : "8px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = isSignal ? "11px" : "10px";
      el.style.fontWeight = "1000";
      el.style.letterSpacing = "-0.02em";
      el.style.color = "#ffffff";
      el.style.background = color;
      el.style.boxShadow = "0 8px 20px rgba(15,23,42,.22), 0 0 0 1px rgba(255,255,255,.52) inset";
      layer.appendChild(el);
    }

    function stateBadge(text, color) {
      const el = document.createElement("div");
      el.className = "bitgak-hhll-state";
      el.textContent = text;
      el.style.position = "absolute";
      el.style.right = "12px";
      el.style.top = "12px";
      el.style.height = "28px";
      el.style.padding = "0 12px";
      el.style.borderRadius = "999px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "12px";
      el.style.fontWeight = "1000";
      el.style.color = "#ffffff";
      el.style.background = color;
      el.style.boxShadow = "0 12px 24px rgba(15,23,42,.24)";
      layer.appendChild(el);
    }

    function render() {
      layer.innerHTML = "";
      const timeScale = chart.timeScale();
      const pivots = (structure && structure.pivots) || [];
      const signals = (structure && structure.signals) || [];

      if (indicator.showStructure !== false) {
        pivots.forEach(function (pivot) {
          const x = timeScale.timeToCoordinate(pivot.time);
          const y0 = candle.priceToCoordinate(pivot.price);
          if (x === null || y0 === null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y0))) return;
          const isHigh = pivot.kind === "high";
          const y = Number(y0) + (isHigh ? -18 : 18);
          markerHtml(pivot.label, hhllLabelColor(pivot.label, indicator), x, y, false, "");
        });
      }

      if (indicator.showSignals !== false) {
        signals.forEach(function (signal) {
          const x = timeScale.timeToCoordinate(signal.time);
          const y0 = candle.priceToCoordinate(signal.price);
          if (x === null || y0 === null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y0))) return;
          const isBuy = signal.type === "BUY";
          const y = Number(y0) + (isBuy ? 26 : -26);
          markerHtml(signal.type, isBuy ? (indicator.buyColor || "#16a34a") : (indicator.sellColor || "#ef4444"), x, y, true, signal.type);
        });
      }

      if (indicator.showLastState !== false) {
        const last = structure && structure.lastSignal;
        const state = structure && structure.state;
        if (last) {
          stateBadge("TOTAL " + last.type + " · " + (structure.basisLabel || "현재") + (last.reason ? " · " + last.reason : ""), last.type === "BUY" ? (indicator.buyColor || "#16a34a") : (indicator.sellColor || "#ef4444"));
        } else if (state && state !== "NEUTRAL") {
          stateBadge("TOTAL " + (state === "BULL" ? "BUY" : "SELL") + " · " + (structure.basisLabel || "현재"), state === "BULL" ? (indicator.buyColor || "#16a34a") : (indicator.sellColor || "#ef4444"));
        } else {
          stateBadge("TOTAL 관찰 · " + (structure.basisLabel || "현재"), indicator.neutralColor || "#64748b");
        }
      }
    }

    const schedule = function () { requestAnimationFrame(render); };
    schedule();

    let unsub = null;
    try {
      const ts = chart.timeScale();
      if (ts && typeof ts.subscribeVisibleLogicalRangeChange === "function") {
        ts.subscribeVisibleLogicalRangeChange(schedule);
        unsub = function () { try { ts.unsubscribeVisibleLogicalRangeChange(schedule); } catch (e) {} };
      } else if (ts && typeof ts.subscribeVisibleTimeRangeChange === "function") {
        ts.subscribeVisibleTimeRangeChange(schedule);
        unsub = function () { try { ts.unsubscribeVisibleTimeRangeChange(schedule); } catch (e) {} };
      }
    } catch (e) {}

    const ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    try { if (ro) ro.observe(wrap); } catch (e) {}
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("scroll", schedule, { passive: true, capture: true });

    return {
      __bitgakOverlay: true,
      update: schedule,
      remove: function () {
        try { if (unsub) unsub(); } catch (e) {}
        try { if (ro) ro.disconnect(); } catch (e) {}
        window.removeEventListener("resize", schedule);
        document.removeEventListener("scroll", schedule, true);
        try { layer.remove(); } catch (e) {}
      },
    };
  }


  function normalizeBasisTimeframe(value) {
    return normalizeHHLLTimeframe(value || "current");
  }

  async function fetchBasisRows(indicator) {
    const timeframe = normalizeBasisTimeframe(indicator.timeframe || "current");
    if (timeframe === "current") return api.getRows ? api.getRows() : [];

    const url = hhllFetchUrl(timeframe);
    if (indicator.__basisRowsPayload && indicator.__basisRowsCacheKey === url) return indicator.__basisRowsPayload;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error((data && data.message) || "기준 차트 데이터를 불러오지 못했습니다.");
    const rows = normalizeHHLLRowsFromPayload(data);
    indicator.__basisRowsCacheKey = url;
    indicator.__basisRowsPayload = rows;
    return rows;
  }

  function findCurrentRowIndexByTime(time) {
    const rows = api.getRows ? api.getRows() : [];
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].time) === String(time)) return i;
    }
    return -1;
  }

  function alignTimeToCurrentChartByRow(row) {
    return alignHHLLTimeToCurrentChart(row || {});
  }

  function alignBasisItem(item) {
    if (!item) return item;
    const row = item.row || { time: item.time, display_time: item.display_time, date: item.date };
    return Object.assign({}, item, { time: alignTimeToCurrentChartByRow(row) });
  }

  function calculateFVGZones(rows, indicator) {
    rows = Array.isArray(rows) ? rows : [];
    const minGapPct = Math.max(0, Number(indicator.minGapPct || 0));
    const maxZones = Math.max(1, Number(indicator.maxZones || 30));
    const extendBars = Math.max(5, Number(indicator.extendBars || 80));
    const statusFilter = String(indicator.statusFilter || "open");
    const zones = [];
    const signals = [];

    function finite(row, key) {
      const v = Number(row && row[key]);
      return Number.isFinite(v) ? v : null;
    }

    for (let i = 2; i < rows.length; i++) {
      const a = rows[i - 2];
      const c = rows[i];
      const mid = rows[i - 1];
      const aHigh = finite(a, "high");
      const aLow = finite(a, "low");
      const cHigh = finite(c, "high");
      const cLow = finite(c, "low");
      const baseClose = Math.abs(finite(mid, "close") || finite(c, "close") || 0);
      if (aHigh === null || aLow === null || cHigh === null || cLow === null || !baseClose) continue;

      let zone = null;
      if (cLow > aHigh && indicator.showBullish !== false) {
        const low = aHigh;
        const high = cLow;
        const pct = ((high - low) / baseClose) * 100;
        if (pct >= minGapPct) zone = { type: "bull", low, high, startIndex: i - 2, formIndex: i, endIndex: Math.min(rows.length - 1, i + extendBars), row: c, time: c.time, gapPct: pct, filled: false, fillIndex: null, retestIndex: null };
      } else if (cHigh < aLow && indicator.showBearish !== false) {
        const low = cHigh;
        const high = aLow;
        const pct = ((high - low) / baseClose) * 100;
        if (pct >= minGapPct) zone = { type: "bear", low, high, startIndex: i - 2, formIndex: i, endIndex: Math.min(rows.length - 1, i + extendBars), row: c, time: c.time, gapPct: pct, filled: false, fillIndex: null, retestIndex: null };
      }

      if (!zone) continue;

      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j];
        const low = finite(r, "low");
        const high = finite(r, "high");
        const close = finite(r, "close");
        const open = finite(r, "open");
        if (low === null || high === null || close === null || open === null) continue;

        if (zone.type === "bull") {
          if (!zone.retestIndex && low <= zone.high && high >= zone.low && close > open) {
            zone.retestIndex = j;
            signals.push({ type: "BUY", price: close, time: r.time, row: r, reason: "Bullish FVG retest" });
          }
          if (low <= zone.low) { zone.filled = true; zone.fillIndex = j; zone.endIndex = j; break; }
        } else {
          if (!zone.retestIndex && high >= zone.low && low <= zone.high && close < open) {
            zone.retestIndex = j;
            signals.push({ type: "SELL", price: close, time: r.time, row: r, reason: "Bearish FVG retest" });
          }
          if (high >= zone.high) { zone.filled = true; zone.fillIndex = j; zone.endIndex = j; break; }
        }
      }

      if (statusFilter === "open" && zone.filled) continue;
      if (statusFilter === "filled" && !zone.filled) continue;
      zones.push(zone);
    }

    const clipped = zones.slice(-maxZones);
    const firstIndex = clipped.length ? Math.min.apply(null, clipped.map(function (z) { return z.startIndex; })) : 0;
    const visibleSignals = signals.filter(function (sig) {
      const idx = rows.indexOf(sig.row);
      return idx >= firstIndex;
    }).slice(-maxZones);

    return { zones: clipped, signals: visibleSignals, basisLabel: hhllTimeframeLabel(indicator.timeframe || "current") };
  }

  function createFVGOverlay(indicator, structure) {
    const wrap = (typeof api.getChartContainer === "function" ? api.getChartContainer() : null) || document.getElementById("chartWrap") || document.getElementById("tvChart");
    const chart = api.chart || (typeof api.getChart === "function" ? api.getChart() : null);
    const candle = api.candleSeries || api.mainSeries || null;
    const rows = api.getRows ? api.getRows() : [];
    if (!wrap || !chart || !candle || !chart.timeScale || !candle.priceToCoordinate) return null;

    const computed = window.getComputedStyle(wrap);
    if (computed.position === "static") wrap.style.position = "relative";

    const layer = document.createElement("div");
    layer.className = "bitgak-fvg-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "11";
    layer.style.overflow = "hidden";
    wrap.appendChild(layer);

    function timeAtIndex(index) {
      const r = rows[Math.max(0, Math.min(rows.length - 1, Number(index) || 0))];
      return r ? r.time : null;
    }

    function addSignal(text, color, x, y) {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.position = "absolute";
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      el.style.transform = "translate(-50%, -50%)";
      el.style.height = "22px";
      el.style.padding = "0 8px";
      el.style.borderRadius = "999px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "11px";
      el.style.fontWeight = "1000";
      el.style.color = "#fff";
      el.style.background = color;
      el.style.boxShadow = "0 10px 24px rgba(15,23,42,.22)";
      layer.appendChild(el);
    }

    function render() {
      layer.innerHTML = "";
      const ts = chart.timeScale();
      ((structure && structure.zones) || []).forEach(function (zone) {
        const t1 = timeAtIndex(zone.startIndex) || zone.time;
        const t2 = timeAtIndex(zone.endIndex) || (rows.length ? rows[rows.length - 1].time : zone.time);
        const x1 = ts.timeToCoordinate(t1);
        const x2 = ts.timeToCoordinate(t2);
        const yHigh = candle.priceToCoordinate(zone.high);
        const yLow = candle.priceToCoordinate(zone.low);
        if (x1 === null || x2 === null || yHigh === null || yLow === null) return;
        const left = Math.min(Number(x1), Number(x2));
        const width = Math.max(4, Math.abs(Number(x2) - Number(x1)));
        const top = Math.min(Number(yHigh), Number(yLow));
        const height = Math.max(2, Math.abs(Number(yLow) - Number(yHigh)));
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.left = Math.round(left) + "px";
        box.style.top = Math.round(top) + "px";
        box.style.width = Math.round(width) + "px";
        box.style.height = Math.round(height) + "px";
        box.style.borderRadius = "6px";
        box.style.background = zone.type === "bull" ? (indicator.bullColor || "rgba(20,184,166,.24)") : (indicator.bearColor || "rgba(239,68,68,.24)");
        box.style.border = "1px solid " + (zone.type === "bull" ? (indicator.bullBorderColor || "#14b8a6") : (indicator.bearBorderColor || "#ef4444"));
        box.style.opacity = zone.filled ? "0.55" : "1";
        layer.appendChild(box);
        if (indicator.showLabels !== false) {
          const label = document.createElement("div");
          label.textContent = (zone.type === "bull" ? "Bull FVG" : "Bear FVG") + " " + (zone.gapPct ? zone.gapPct.toFixed(1) + "%" : "");
          label.style.position = "absolute";
          label.style.left = Math.round(left + 6) + "px";
          label.style.top = Math.round(top + 4) + "px";
          label.style.fontSize = "10px";
          label.style.fontWeight = "900";
          label.style.color = zone.type === "bull" ? (indicator.bullBorderColor || "#14b8a6") : (indicator.bearBorderColor || "#ef4444");
          label.style.background = "rgba(255,255,255,.72)";
          label.style.borderRadius = "999px";
          label.style.padding = "2px 6px";
          layer.appendChild(label);
        }
      });

      if (indicator.showRetestSignals !== false) {
        ((structure && structure.signals) || []).forEach(function (signal) {
          const x = ts.timeToCoordinate(signal.time);
          const y0 = candle.priceToCoordinate(signal.price);
          if (x === null || y0 === null) return;
          const isBuy = signal.type === "BUY";
          addSignal(isBuy ? "FVG BUY" : "FVG SELL", isBuy ? (indicator.buyColor || "#16a34a") : (indicator.sellColor || "#ef4444"), Number(x), Number(y0) + (isBuy ? 28 : -28));
        });
      }
    }

    const schedule = function () { requestAnimationFrame(render); };
    schedule();
    let unsub = null;
    try { const ts = chart.timeScale(); if (ts && typeof ts.subscribeVisibleLogicalRangeChange === "function") { ts.subscribeVisibleLogicalRangeChange(schedule); unsub = function () { try { ts.unsubscribeVisibleLogicalRangeChange(schedule); } catch (e) {} }; } } catch (e) {}
    const ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    try { if (ro) ro.observe(wrap); } catch (e) {}
    window.addEventListener("resize", schedule, { passive: true });
    return { __bitgakOverlay: true, update: schedule, remove: function () { try { if (unsub) unsub(); } catch (e) {} try { if (ro) ro.disconnect(); } catch (e) {} window.removeEventListener("resize", schedule); try { layer.remove(); } catch (e) {} } };
  }

  function calculateMACrossSignals(rows, indicator) {
    rows = Array.isArray(rows) ? rows : [];
    const fastPeriod = Math.max(1, Number(indicator.fastPeriod || 112));
    const slowPeriod = Math.max(fastPeriod + 1, Number(indicator.slowPeriod || 224));
    const method = String(indicator.method || "sma").toLowerCase();
    const source = indicator.source || "close";
    const fastData = method === "ema" ? calcEMA(rows, fastPeriod, source) : calcMA(rows, fastPeriod, source);
    const slowData = method === "ema" ? calcEMA(rows, slowPeriod, source) : calcMA(rows, slowPeriod, source);
    const fastMap = buildValueMap(fastData);
    const slowMap = buildValueMap(slowData);
    const signals = [];
    let prevDiff = null;
    for (let i = 0; i < rows.length; i++) {
      const key = timeKeyOf(rows[i].time);
      const f = fastMap.get(key);
      const sl = slowMap.get(key);
      if (!Number.isFinite(Number(f)) || !Number.isFinite(Number(sl))) continue;
      const diff = Number(f) - Number(sl);
      if (prevDiff !== null && prevDiff <= 0 && diff > 0) signals.push({ type: "BUY", time: rows[i].time, price: Number(rows[i].close), row: rows[i], reason: fastPeriod + "/" + slowPeriod + " 골든크로스" });
      if (prevDiff !== null && prevDiff >= 0 && diff < 0) signals.push({ type: "SELL", time: rows[i].time, price: Number(rows[i].close), row: rows[i], reason: fastPeriod + "/" + slowPeriod + " 데드크로스" });
      prevDiff = diff;
    }
    const maxSignals = Math.max(5, Number(indicator.maxSignals || 80));
    return { fastData, slowData, signals: signals.slice(-maxSignals), lastSignal: signals.length ? signals[signals.length - 1] : null, basisLabel: hhllTimeframeLabel(indicator.timeframe || "current"), fastPeriod, slowPeriod, method };
  }

  function createMACrossOverlay(indicator, structure) {
    const wrap = (typeof api.getChartContainer === "function" ? api.getChartContainer() : null) || document.getElementById("chartWrap") || document.getElementById("tvChart");
    const chart = api.chart || (typeof api.getChart === "function" ? api.getChart() : null);
    const candle = api.candleSeries || api.mainSeries || null;
    if (!wrap || !chart || !candle || !chart.timeScale || !candle.priceToCoordinate) return null;
    const computed = window.getComputedStyle(wrap);
    if (computed.position === "static") wrap.style.position = "relative";
    const layer = document.createElement("div");
    layer.className = "bitgak-ma-cross-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "12";
    layer.style.overflow = "hidden";
    wrap.appendChild(layer);

    function addBadge(text, color, x, y) {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.position = "absolute";
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      el.style.transform = "translate(-50%, -50%)";
      el.style.height = "22px";
      el.style.padding = "0 8px";
      el.style.borderRadius = "999px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "11px";
      el.style.fontWeight = "1000";
      el.style.color = "#fff";
      el.style.background = color;
      el.style.boxShadow = "0 10px 24px rgba(15,23,42,.24)";
      layer.appendChild(el);
    }
    function stateBadge() {
      if (indicator.showLastState === false) return;
      const last = structure && structure.lastSignal;
      const el = document.createElement("div");
      el.textContent = last ? ("CROSS " + last.type + " · " + (structure.basisLabel || "현재")) : "CROSS 관찰 · " + (structure.basisLabel || "현재");
      el.style.position = "absolute";
      el.style.right = "12px";
      el.style.top = "46px";
      el.style.height = "28px";
      el.style.padding = "0 12px";
      el.style.borderRadius = "999px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "12px";
      el.style.fontWeight = "1000";
      el.style.color = "#fff";
      el.style.background = last && last.type === "BUY" ? (indicator.buyColor || "#16a34a") : (last && last.type === "SELL" ? (indicator.sellColor || "#ef4444") : "#64748b");
      el.style.boxShadow = "0 12px 24px rgba(15,23,42,.24)";
      layer.appendChild(el);
    }
    function render() {
      layer.innerHTML = "";
      const ts = chart.timeScale();
      if (indicator.showSignals !== false) {
        ((structure && structure.signals) || []).forEach(function (signal) {
          const x = ts.timeToCoordinate(signal.time);
          const y0 = candle.priceToCoordinate(signal.price);
          if (x === null || y0 === null) return;
          const isBuy = signal.type === "BUY";
          addBadge(isBuy ? "BUY" : "SELL", isBuy ? (indicator.buyColor || "#16a34a") : (indicator.sellColor || "#ef4444"), Number(x), Number(y0) + (isBuy ? 30 : -30));
        });
      }
      stateBadge();
    }
    const schedule = function () { requestAnimationFrame(render); };
    schedule();
    let unsub = null;
    try { const ts = chart.timeScale(); if (ts && typeof ts.subscribeVisibleLogicalRangeChange === "function") { ts.subscribeVisibleLogicalRangeChange(schedule); unsub = function () { try { ts.unsubscribeVisibleLogicalRangeChange(schedule); } catch (e) {} }; } } catch (e) {}
    const ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    try { if (ro) ro.observe(wrap); } catch (e) {}
    window.addEventListener("resize", schedule, { passive: true });
    return { __bitgakOverlay: true, update: schedule, remove: function () { try { if (unsub) unsub(); } catch (e) {} try { if (ro) ro.disconnect(); } catch (e) {} window.removeEventListener("resize", schedule); try { layer.remove(); } catch (e) {} } };
  }

  function rebuildOne(indicator) {
    const rows = api.getRows();
    clearSeries(indicator);

    if (!indicator.visible) {
      if (indicator.type === "volume") api.setVolumeVisible(false);
      return;
    }

    if (indicator.type === "fvg") {
      const token = (indicator.__basisRequestToken || 0) + 1;
      indicator.__basisRequestToken = token;
      fetchBasisRows(indicator).then(function (basisRows) {
        if (!indicator.visible || indicator.__basisRequestToken !== token) return;
        clearSeries(indicator);
        const structure = calculateFVGZones(basisRows, indicator);
        if (normalizeBasisTimeframe(indicator.timeframe || "current") !== "current") {
          const currentRows = api.getRows ? api.getRows() : [];
          structure.zones = structure.zones.map(function (zone) {
            const startTime = alignTimeToCurrentChartByRow(basisRows[zone.startIndex] || zone.row);
            const endTime = alignTimeToCurrentChartByRow(basisRows[zone.endIndex] || zone.row);
            const rawStartIndex = findCurrentRowIndexByTime(startTime);
            const rawEndIndex = findCurrentRowIndexByTime(endTime);
            const startIndex = rawStartIndex < 0 ? 0 : rawStartIndex;
            const endIndex = rawEndIndex < 0 ? Math.max(startIndex, currentRows.length - 1) : Math.max(startIndex, rawEndIndex);
            return Object.assign({}, zone, { startIndex: startIndex, endIndex: endIndex, time: startTime });
          });
          structure.signals = structure.signals.map(alignBasisItem);
        }
        const overlay = createFVGOverlay(indicator, structure);
        indicator.__legendData = { zoneCount: structure.zones.length, signalCount: structure.signals.length, basisLabel: structure.basisLabel };
        indicator.series = overlay ? [overlay] : [];
        scheduleChartRelayout();
      }).catch(function (error) {
        indicator.__legendData = { error: String(error && error.message || error || "") };
        try { console.warn("Bitgak FVG indicator failed:", error); } catch (e) {}
      });
      return;
    }

    if (indicator.type === "ma_cross") {
      const token = (indicator.__basisRequestToken || 0) + 1;
      indicator.__basisRequestToken = token;
      fetchBasisRows(indicator).then(function (basisRows) {
        if (!indicator.visible || indicator.__basisRequestToken !== token) return;
        clearSeries(indicator);
        let structure = calculateMACrossSignals(basisRows, indicator);
        const created = [];
        if (normalizeBasisTimeframe(indicator.timeframe || "current") === "current" && indicator.showLines !== false) {
          const fastLine = addLine(indicator.fastColor || "#3b82f6", indicator.width || 2);
          const slowLine = addLine(indicator.slowColor || "#f97316", indicator.width || 2);
          fastLine.setData(structure.fastData);
          slowLine.setData(structure.slowData);
          created.push(fastLine, slowLine);
        } else {
          structure.signals = structure.signals.map(alignBasisItem);
          structure.lastSignal = structure.lastSignal ? alignBasisItem(structure.lastSignal) : null;
        }
        const overlay = createMACrossOverlay(indicator, structure);
        if (overlay) created.push(overlay);
        indicator.__legendData = { lastSignal: structure.lastSignal, signalCount: structure.signals.length, basisLabel: structure.basisLabel };
        indicator.series = created;
        scheduleChartRelayout();
      }).catch(function (error) {
        indicator.__legendData = { error: String(error && error.message || error || "") };
        try { console.warn("Bitgak MA Cross indicator failed:", error); } catch (e) {}
      });
      return;
    }

    if (indicator.type === "volume") {
      const paneKey = getIndicatorPaneKey(indicator);
      api.setVolumeVisible(false);
      if (api.ensureIndicatorPane) api.ensureIndicatorPane(paneKey, "거래량");
      const series = addPaneHistogram(paneKey, {
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const data = rowsToVolumeData(rows);
      series.setData(data);
      indicator.__legendData = { volume: data };
      setAdaptivePaneLabel(paneKey, "거래량", indicator.color || "#64748b");
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

    if (indicator.type === "ichimoku") {
      const data = calcIchimoku(
        rows,
        Number(indicator.conversion || 9),
        Number(indicator.base || 26),
        Number(indicator.spanB || 52),
        Number(indicator.displacement || 26)
      );
      const created = [];

      if (indicator.showCloudFill !== false && data.spanA.length && data.spanB.length) {
        const cloudCoordinateSeries = addLine("rgba(0,0,0,0)", 1, {
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        cloudCoordinateSeries.setData(data.spanA);
        created.push(cloudCoordinateSeries);
        const cloudOverlay = createIchimokuCloudOverlay(
          data.spanA,
          data.spanB,
          cloudCoordinateSeries,
          indicator.cloudUpColor || "rgba(37, 99, 235, 0.18)",
          indicator.cloudDownColor || "rgba(239, 68, 68, 0.18)"
        );
        if (cloudOverlay) created.push(cloudOverlay);
      }

      if (indicator.showConversion !== false) {
        const s = addLine(indicator.conversionColor || "#2563eb", indicator.width || 2);
        s.setData(data.conversion);
        created.push(s);
      }
      if (indicator.showBase !== false) {
        const s = addLine(indicator.baseColor || "#dc2626", indicator.width || 2);
        s.setData(data.base);
        created.push(s);
      }
      if (indicator.showSpanA !== false) {
        const s = addLine(indicator.spanAColor || "#22c55e", 1, { lineStyle: 0 });
        s.setData(data.spanA);
        created.push(s);
      }
      if (indicator.showSpanB !== false) {
        const s = addLine(indicator.spanBColor || "#f87171", 1, { lineStyle: 0 });
        s.setData(data.spanB);
        created.push(s);
      }
      if (indicator.showLagging !== false) {
        const s = addLine(indicator.laggingColor || "#16a34a", 1);
        s.setData(data.lagging);
        created.push(s);
      }
      indicator.series = created;
      return;
    }

    if (indicator.type === "rsi") {
      const paneKey = getIndicatorPaneKey(indicator);
      if (api.ensureIndicatorPane) api.ensureIndicatorPane(paneKey, "RSI");
      const created = [];
      const rsiData = calcRSI(rows, Number(indicator.period || 14), indicator.source || "close");
      let rsiMaData = [];

      if (indicator.showRsi !== false) {
        const rsiSeries = addPaneLine(paneKey, indicator.color || "#8b5cf6", indicator.width || 2, oscillatorScaleOptions());
        rsiSeries.setData(rsiData);
        created.push(rsiSeries);
      }

      if (indicator.showRsiMa !== false) {
        const maData = calcSeriesMA(rsiData, Number(indicator.maPeriod || 14));
        rsiMaData = maData;
        const maSeries = addPaneLine(paneKey, indicator.maColor || "#facc15", 1, oscillatorScaleOptions());
        maSeries.setData(maData);
        created.push(maSeries);
      }

      if (indicator.showUpper !== false) {
        const upperLine = addPaneLine(paneKey, indicator.upperColor || "rgba(148, 163, 184, 0.78)", 1, Object.assign({
          lineStyle: 2,
        }, oscillatorScaleOptions()));
        upperLine.setData(buildConstantLine(rows, Number(indicator.upper || 70)));
        created.push(upperLine);
      }
      if (indicator.showMiddle !== false) {
        const middleLine = addPaneLine(paneKey, indicator.middleColor || "rgba(148, 163, 184, 0.48)", 1, Object.assign({
          lineStyle: 2,
        }, oscillatorScaleOptions()));
        middleLine.setData(buildConstantLine(rows, Number(indicator.middle || 50)));
        created.push(middleLine);
      }
      if (indicator.showLower !== false) {
        const lowerLine = addPaneLine(paneKey, indicator.lowerColor || "rgba(148, 163, 184, 0.78)", 1, Object.assign({
          lineStyle: 2,
        }, oscillatorScaleOptions()));
        lowerLine.setData(buildConstantLine(rows, Number(indicator.lower || 30)));
        created.push(lowerLine);
      }

      indicator.__legendData = { rsi: rsiData, ma: rsiMaData };
      setAdaptivePaneLabel(paneKey, "RSI", indicator.color || "#8b5cf6");
      indicator.series = created;
      forceOscillatorPaneRange(created, 0, 100);
      return;
    }

    if (indicator.type === "stoch") {
      const paneKey = getIndicatorPaneKey(indicator);
      if (api.ensureIndicatorPane) api.ensureIndicatorPane(paneKey, "Stoch");
      const created = [];
      const data = calcStochastic(
        rows,
        Number(indicator.period || 14),
        Number(indicator.kSmoothing || 1),
        Number(indicator.dSmoothing || 3),
        indicator.source || "close"
      );

      // Stoch 배경 밴드는 series가 아니라 DOM overlay로 그린다.
      // Histogram series로 배경을 만들면 RSI 등 다른 보조지표 추가 시 autoscale/pane 재배치에 따라 위로 밀리는 문제가 생긴다.
      // 실제 위치 보정은 normalizePaneLabelDom() -> updatePaneBandFills()에서 처리한다.

      if (indicator.showK !== false) {
        const kLine = addPaneLine(paneKey, indicator.color || "#3b82f6", indicator.width || 2, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: oscillatorAutoscaleInfo(),
        });
        kLine.setData(data.k);
        created.push(kLine);
      }

      if (indicator.showD !== false) {
        const dLine = addPaneLine(paneKey, indicator.dColor || "#fb923c", 2, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: oscillatorAutoscaleInfo(),
        });
        dLine.setData(data.d);
        created.push(dLine);
      }

      if (indicator.showUpper !== false) {
        const upperLine = addPaneLine(paneKey, indicator.upperColor || "rgba(100, 116, 139, 0.78)", 1, {
          lineStyle: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: oscillatorAutoscaleInfo(),
        });
        upperLine.setData(buildConstantLine(rows, Number(indicator.upper || 80)));
        created.push(upperLine);
      }

      if (indicator.showMiddle !== false) {
        const middleLine = addPaneLine(paneKey, indicator.middleColor || "rgba(100, 116, 139, 0.42)", 1, {
          lineStyle: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: oscillatorAutoscaleInfo(),
        });
        middleLine.setData(buildConstantLine(rows, Number(indicator.middle || 50)));
        created.push(middleLine);
      }

      if (indicator.showLower !== false) {
        const lowerLine = addPaneLine(paneKey, indicator.lowerColor || "rgba(100, 116, 139, 0.78)", 1, {
          lineStyle: 2,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: oscillatorAutoscaleInfo(),
        });
        lowerLine.setData(buildConstantLine(rows, Number(indicator.lower || 20)));
        created.push(lowerLine);
      }

      indicator.__legendData = { k: data.k, d: data.d };
      setAdaptivePaneLabel(paneKey, "Stoch", indicator.color || "#3b82f6");
      indicator.series = created;
      forceOscillatorPaneRange(created, 0, 100);
      return;
    }

    if (indicator.type === "macd") {
      const paneKey = getIndicatorPaneKey(indicator);
      if (api.ensureIndicatorPane) api.ensureIndicatorPane(paneKey, "MACD+RSI");
      const created = [];
      const data = calcMACD(
        rows,
        Number(indicator.fast || 12),
        Number(indicator.slow || 26),
        Number(indicator.signal || 9),
        indicator.source || "close",
        true
      );
      const rsiData = calcRSI(rows, Number(indicator.rsiPeriod || 14), indicator.source || "close").map(function (x) {
        return { time: x.time, value: Math.round((x.value - 50) * 100) / 100 };
      });

      if (indicator.showHistogram !== false) {
        const histogram = addPaneHistogram(paneKey, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          base: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        histogram.setData(colorizeHistogram(data.histogram, indicator.histUpColor || "rgba(20, 184, 166, 0.64)", indicator.histDownColor || "rgba(248, 113, 113, 0.64)"));
        created.push(histogram);
      }
      if (indicator.showMacd !== false) {
        const macdLine = addPaneLine(paneKey, indicator.color || "#22c55e", indicator.width || 2, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        macdLine.setData(data.macd);
        created.push(macdLine);
      }
      if (indicator.showSignal !== false) {
        const signalLine = addPaneLine(paneKey, indicator.signalColor || "#fb923c", 2, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        signalLine.setData(data.signal);
        created.push(signalLine);
      }
      if (indicator.showRsi !== false) {
        const rsiLine = addPaneLine(paneKey, indicator.rsiColor || "#a78bfa", 2, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        rsiLine.setData(rsiData);
        created.push(rsiLine);
      }
      if (indicator.showLevels !== false) {
        [-20, 0, 20].forEach(function (level) {
          const line = addPaneLine(paneKey, indicator.levelColor || "rgba(148, 163, 184, 0.62)", 1, {
            lineStyle: level === 0 ? 2 : 3,
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          });
          line.setData(buildConstantLine(rows, level));
          created.push(line);
        });
      }
      indicator.__legendData = { macd: data.macd, signal: data.signal, histogram: data.histogram, rsi: rsiData };
      setAdaptivePaneLabel(paneKey, "MACD+RSI", indicator.color || "#22c55e");
      indicator.series = created;
      return;
    }
  }

  function getActiveBottomPaneTypes() {
    return indicators.filter(function (indicator) {
      return indicator && indicator.visible !== false && isBottomPaneIndicator(indicator.type);
    }).map(function (indicator) {
      return getIndicatorPaneKey(indicator);
    }).filter(Boolean);
  }

  function rebuildAll() {
    const activePaneTypes = getActiveBottomPaneTypes();

    // 보조지표를 새로 구성하기 전에 기존 series를 먼저 제거한다.
    // 거래량 pane이 남아있는 상태에서 RSI/Stoch를 추가하면 일부 브라우저에서 이전 volume 축이
    // RSI pane에 남아 0~100 축이 깨지는 문제가 생긴다.
    indicators.forEach(function (indicator) {
      clearSeries(indicator);
      if (indicator && indicator.type === "volume") api.setVolumeVisible(false);
    });

    clearAdaptivePaneLabels(activePaneTypes);

    if (api.configureIndicatorPanes) api.configureIndicatorPanes(activePaneTypes);
    api.setVolumeVisible(false);

    if (!activePaneTypes.length) {
      try {
        if (api.syncPaneTimeScales) api.syncPaneTimeScales();
      } catch (e) {}
      clearAdaptivePaneLabels([]);
    }

    indicators.forEach(rebuildOne);
    renderRightList();

    if (api.syncPaneTimeScales) api.syncPaneTimeScales();
    clearAdaptivePaneLabels(getActiveBottomPaneTypes());
    updatePaneLegendValues();
    schedulePaneLabelRefresh();

    // LightweightCharts v5는 보조창을 재구성한 직후 첫 프레임에서 이전 price scale이 남는 경우가 있다.
    // 특히 거래량 표시 후 RSI/Stoch를 켤 때 축이 거래량 범위로 잡히지 않도록 한 프레임 뒤 다시 동기화한다.
    requestAnimationFrame(function () {
      try { if (api.syncPaneTimeScales) api.syncPaneTimeScales(); } catch (e) {}
      updatePaneLegendValues();
      schedulePaneLabelRefresh();
    });

    scheduleChartRelayout();
  }

  function buildIndicatorRowsHtml(emptyMessage) {
    if (!indicators.length) {
      return `<div class="indicator-empty">${escapeHtml(emptyMessage || "아직 추가된 지표가 없습니다. [지표검색]으로 필요한 지표를 먼저 추가하세요.")}</div>`;
    }

    function rowHtml(indicator) {
      const meta = getMeta(indicator.type);
      const visibleLine = indicator.type === "ma_pack"
        ? (indicator.lines || []).find(function (line) { return line.visible; })
        : null;
      const color = indicator.type === "ma_pack" ? ((visibleLine && visibleLine.color) || meta.color) : (indicator.color || meta.color);

      return `
        <div class="indicator-row ${indicator.visible ? "" : "off"}" data-indicator-row="${escapeHtml(indicator.id)}" data-indicator-type="${escapeHtml(indicator.type)}" title="더블클릭하면 설정창이 열립니다.">
          <div class="indicator-row-main">
            <div class="indicator-row-title">
              <span class="indicator-color-dot" style="background:${escapeHtml(color)}; box-shadow:0 0 10px ${escapeHtml(color)}66;"></span>
              <strong>${escapeHtml(meta.name)}</strong>
            </div>
          </div>
          <div class="indicator-row-actions">
            <button class="indicator-eye-btn ${indicator.visible ? "" : "off"}" type="button" data-toggle-indicator-visible="${escapeHtml(indicator.id)}" title="차트 표시/숨김" aria-label="${indicator.visible ? "지표 숨김" : "지표 표시"}">${eyeIcon(indicator.visible)}</button>
            <button class="indicator-edit-btn" type="button" data-edit-indicator="${escapeHtml(indicator.id)}" title="지표 속성" aria-label="지표 속성">${editIcon()}</button>
            <button class="indicator-trash-btn" type="button" data-remove-indicator="${escapeHtml(indicator.id)}" title="지표 삭제" aria-label="지표 삭제">${trashIcon()}</button>
          </div>
        </div>
      `;
    }

    const sorted = indicators.slice().sort(function (a, b) {
      const aw = a.type === "ma_pack" ? 0 : 1;
      const bw = b.type === "ma_pack" ? 0 : 1;
      return aw - bw;
    });

    return sorted.map(rowHtml).join("");
  }

  function renderRightList() {
    const total = indicators.length;
    const visibleTotal = indicators.filter(function (item) { return item && item.visible !== false; }).length;
    if (countEl) countEl.textContent = String(total);
    if (mobileCountEl) mobileCountEl.textContent = String(total);
    if (mobileBadgeEl) {
      mobileBadgeEl.textContent = String(total);
      mobileBadgeEl.classList.toggle("is-empty", total === 0);
    }

    const bar = document.querySelector(".chart-active-indicator-bar");
    if (bar) {
      bar.classList.toggle("has-indicators", total > 0);
      bar.classList.toggle("has-visible-indicators", visibleTotal > 0);
      bar.dataset.indicatorCount = String(total);
      bar.dataset.visibleIndicatorCount = String(visibleTotal);
    }

    if (rightList) {
      rightList.innerHTML = buildIndicatorRowsHtml("아직 추가된 지표가 없습니다. [지표검색]으로 필요한 지표를 먼저 추가하세요.");
    }

    if (mobileList) {
      mobileList.innerHTML = buildIndicatorRowsHtml("아직 추가된 지표가 없습니다. [지표검색]으로 필요한 지표를 먼저 추가하세요.");
    }
  }

  function openMobileIndicatorModal() {
    if (!mobileModal) return;
    renderRightList();
    mobileModal.classList.add("open", "is-open");
    mobileModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("mobile-indicator-modal-open");
  }

  function closeMobileIndicatorModal() {
    if (!mobileModal) return;
    mobileModal.classList.remove("open", "is-open");
    mobileModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mobile-indicator-modal-open");
  }

  function handleIndicatorListClick(event) {
    if (!event || event.__bitgakIndicatorHandled) return;

    const toggleBtn = event.target.closest("[data-toggle-indicator-visible]");
    if (toggleBtn) {
      event.__bitgakIndicatorHandled = true;
      event.preventDefault();
      event.stopPropagation();
      toggleIndicatorVisible(toggleBtn.dataset.toggleIndicatorVisible);
      return;
    }

    const removeBtn = event.target.closest("[data-remove-indicator]");
    if (removeBtn) {
      event.__bitgakIndicatorHandled = true;
      event.preventDefault();
      event.stopPropagation();
      removeIndicator(removeBtn.dataset.removeIndicator);
      return;
    }

    const editBtn = event.target.closest("[data-edit-indicator]");
    if (editBtn) {
      event.__bitgakIndicatorHandled = true;
      event.preventDefault();
      event.stopPropagation();
      closeMobileIndicatorModal();
      openSettings(editBtn.dataset.editIndicator);
    }
  }

  function handleIndicatorListDblClick(event) {
    const row = event.target.closest("[data-indicator-row]");
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    closeMobileIndicatorModal();
    openSettings(row.dataset.indicatorRow);
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
      catalogEl.innerHTML = '<div class="indicator-empty">검색 결과가 없습니다. 예: 이동평균, EMA, RSI, MACD, FVG, 골든크로스</div>';
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
    const input = row ? (row.querySelector('[data-ma-field="color"]') || row.querySelector("[data-color-value]") || row.querySelector("#settingColor")) : null;
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

  function checkboxFieldHtml(id, label, checked) {
    return `
      <label class="indicator-check-row">
        <input id="${escapeHtml(id)}" type="checkbox" ${checked ? "checked" : ""}>
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </label>`;
  }

  function colorFieldHtml(id, label, value) {
    const color = value || "#111827";
    return `
      <div class="indicator-setting-field indicator-color-cell">
        <label>${escapeHtml(label)}</label>
        <button class="indicator-color-button" type="button" data-color-target="single" style="--selected-color:${escapeHtml(color)};" title="${escapeHtml(label)} 색상 선택"></button>
        <input id="${escapeHtml(id)}" data-color-value type="hidden" value="${escapeHtml(color)}">
      </div>`;
  }

  function numberFieldHtml(id, label, value, min, max) {
    return `<div class="indicator-setting-field"><label>${escapeHtml(label)}</label><input id="${escapeHtml(id)}" type="number" min="${escapeHtml(min || 1)}" max="${escapeHtml(max || 9999)}" value="${escapeHtml(value)}"></div>`;
  }

  function selectFieldHtml(id, label, value, options) {
    return `<div class="indicator-setting-field"><label>${escapeHtml(label)}</label>${customSelectHtml({ id: id, value: String(value), options: options })}</div>`;
  }

  function sectionHtml(title, body) {
    return `<section class="indicator-setting-section"><div class="indicator-setting-section-title">${escapeHtml(title)}</div>${body}</section>`;
  }

  function renderSettings(indicator) {
    const meta = getMeta(indicator.type);
    if (settingsTitle) settingsTitle.textContent = `${meta.name} 설정`;
    if (activeSettingsEl) activeSettingsEl.dataset.mode = indicator.type === "ma_pack" ? "ma" : "single";
    if (indicator.type === "ma_pack") { renderMaSettings(indicator); return; }


    if (indicator.type === "fvg") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          ${selectFieldHtml("settingVisible", "표시 여부", String(indicator.visible !== false), VISIBLE_OPTIONS)}
          ${selectFieldHtml("settingTimeframe", "기준 봉", normalizeBasisTimeframe(indicator.timeframe || "current"), STRATEGY_TIMEFRAME_OPTIONS)}
          ${selectFieldHtml("settingStatusFilter", "갭 상태", indicator.statusFilter || "open", FVG_STATUS_OPTIONS)}
          ${numberFieldHtml("settingMinGapPct", "최소 갭 크기(%)", indicator.minGapPct || 0.3, 0, 50)}
          ${numberFieldHtml("settingMaxZones", "최대 표시 개수", indicator.maxZones || 30, 1, 300)}
          ${numberFieldHtml("settingExtendBars", "오른쪽 연장 봉수", indicator.extendBars || 80, 5, 1000)}
        </div>
        ${sectionHtml("표시 항목", `<div class="indicator-toggle-grid">
          ${checkboxFieldHtml("settingShowBullish", "상승 FVG", indicator.showBullish !== false)}
          ${checkboxFieldHtml("settingShowBearish", "하락 FVG", indicator.showBearish !== false)}
          ${checkboxFieldHtml("settingShowLabels", "FVG 라벨", indicator.showLabels !== false)}
          ${checkboxFieldHtml("settingShowRetestSignals", "리테스트 BUY/SELL", indicator.showRetestSignals !== false)}
        </div>`)}
        ${sectionHtml("색상", `<div class="indicator-setting-grid indicator-color-grid">
          ${colorFieldHtml("settingBullBorderColor", "상승 FVG 선", indicator.bullBorderColor || "#14b8a6")}
          ${colorFieldHtml("settingBearBorderColor", "하락 FVG 선", indicator.bearBorderColor || "#ef4444")}
          ${colorFieldHtml("settingBuyColor", "BUY", indicator.buyColor || "#16a34a")}
          ${colorFieldHtml("settingSellColor", "SELL", indicator.sellColor || "#ef4444")}
        </div>`)}
      `;
      return;
    }

    if (indicator.type === "ma_cross") {
      activeSettingsEl.innerHTML = `
        <div class="indicator-setting-grid">
          ${selectFieldHtml("settingVisible", "표시 여부", String(indicator.visible !== false), VISIBLE_OPTIONS)}
          ${selectFieldHtml("settingTimeframe", "전략 기준 봉", normalizeBasisTimeframe(indicator.timeframe || "current"), STRATEGY_TIMEFRAME_OPTIONS)}
          ${selectFieldHtml("settingMethod", "계산 방식", indicator.method || "sma", METHOD_OPTIONS)}
          ${selectFieldHtml("settingSource", "기준가격", indicator.source || "close", SOURCE_OPTIONS)}
          ${numberFieldHtml("settingFastPeriod", "빠른 이평선", indicator.fastPeriod || 112, 1, 2000)}
          ${numberFieldHtml("settingSlowPeriod", "느린 이평선", indicator.slowPeriod || 224, 2, 3000)}
          ${numberFieldHtml("settingMaxSignals", "최대 신호 개수", indicator.maxSignals || 80, 5, 1000)}
          ${selectFieldHtml("settingWidth", "선 굵기", String(indicator.width || 2), WIDTH_OPTIONS)}
        </div>
        ${sectionHtml("표시 항목", `<div class="indicator-toggle-grid">
          ${checkboxFieldHtml("settingShowLines", "이평선 표시", indicator.showLines !== false)}
          ${checkboxFieldHtml("settingShowSignals", "BUY/SELL 신호", indicator.showSignals !== false)}
          ${checkboxFieldHtml("settingShowLastState", "우측 상태 배지", indicator.showLastState !== false)}
        </div>`)}
        ${sectionHtml("색상", `<div class="indicator-setting-grid indicator-color-grid">
          ${colorFieldHtml("settingFastColor", "빠른선", indicator.fastColor || "#3b82f6")}
          ${colorFieldHtml("settingSlowColor", "느린선", indicator.slowColor || "#f97316")}
          ${colorFieldHtml("settingBuyColor", "BUY", indicator.buyColor || "#16a34a")}
          ${colorFieldHtml("settingSellColor", "SELL", indicator.sellColor || "#ef4444")}
        </div>`)}
      `;
      return;
    }

    activeSettingsEl.innerHTML = `
      <div class="indicator-setting-grid">
        ${selectFieldHtml("settingVisible", "표시 여부", String(indicator.visible !== false), VISIBLE_OPTIONS)}
        ${numberFieldHtml("settingPeriod", "기간", indicator.period || meta.defaultPeriod || 20, 1, 500)}
        ${selectFieldHtml("settingSource", "기준가격", indicator.source || "close", SOURCE_OPTIONS)}
        ${selectFieldHtml("settingWidth", "선 굵기", String(indicator.width || 2), WIDTH_OPTIONS)}
        ${colorFieldHtml("settingColor", "색상", indicator.color || meta.color)}
      </div>`;
  }

  function createDefaultIndicator(fixedType) {
    const meta = getMeta(fixedType);
    const base = {
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

    if (fixedType === "ma_pack") {
      return {
        id: makeId("ma_pack"),
        type: "ma_pack",
        visible: true,
        lines: cloneDefaultMaLines(),
        series: [],
      };
    }

    if (fixedType === "fvg") {
      return Object.assign(base, {
        type: "fvg",
        source: "price",
        timeframe: "current",
        minGapPct: 0.3,
        maxZones: 30,
        statusFilter: "open",
        extendBars: 80,
        showBullish: true,
        showBearish: true,
        showLabels: true,
        showRetestSignals: true,
        bullColor: "rgba(20, 184, 166, 0.24)",
        bearColor: "rgba(239, 68, 68, 0.24)",
        bullBorderColor: "#14b8a6",
        bearBorderColor: "#ef4444",
        buyColor: "#16a34a",
        sellColor: "#ef4444",
      });
    }

    if (fixedType === "ma_cross") {
      return Object.assign(base, {
        type: "ma_cross",
        source: "close",
        timeframe: "current",
        method: "sma",
        fastPeriod: 112,
        slowPeriod: 224,
        maxSignals: 80,
        showLines: true,
        showSignals: true,
        showLastState: true,
        fastColor: "#3b82f6",
        slowColor: "#f97316",
        buyColor: "#16a34a",
        sellColor: "#ef4444",
      });
    }
    if (fixedType === "rsi") {
      return Object.assign(base, {
        period: 14,
        maPeriod: 14,
        upper: 70,
        middle: 50,
        lower: 30,
        maColor: "#facc15",
        upperColor: "rgba(148, 163, 184, 0.78)",
        middleColor: "rgba(148, 163, 184, 0.48)",
        lowerColor: "rgba(148, 163, 184, 0.78)",
        showRsi: true,
        showRsiMa: true,
        showUpper: true,
        showMiddle: true,
        showLower: true,
      });
    }
    if (fixedType === "stoch") {
      return Object.assign(base, {
        period: 14,
        kSmoothing: 1,
        dSmoothing: 3,
        source: "close",
        color: "#3b82f6",
        dColor: "#fb923c",
        upper: 80,
        middle: 50,
        lower: 20,
        upperColor: "rgba(100, 116, 139, 0.78)",
        middleColor: "rgba(100, 116, 139, 0.42)",
        lowerColor: "rgba(100, 116, 139, 0.78)",
        backgroundColor: "rgba(59, 130, 246, 0.12)",
        showK: true,
        showD: true,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        showBackground: true,
      });
    }
    if (fixedType === "macd") {
      return Object.assign(base, {
        color: "#22c55e",
        rsiPeriod: 14,
        rsiColor: "#a78bfa",
        signalColor: "#fb923c",
        histUpColor: "rgba(20, 184, 166, 0.64)",
        histDownColor: "rgba(248, 113, 113, 0.64)",
        levelColor: "rgba(148, 163, 184, 0.62)",
        showHistogram: true,
        showMacd: true,
        showSignal: true,
        showRsi: true,
        showLevels: true,
      });
    }
    if (fixedType === "ichimoku") {
      return Object.assign(base, {
        conversion: 9,
        base: 26,
        spanB: 52,
        displacement: 26,
        conversionColor: "#2563eb",
        baseColor: "#dc2626",
        spanAColor: "#22c55e",
        spanBColor: "#f87171",
        laggingColor: "#16a34a",
        cloudUpColor: "rgba(37, 99, 235, 0.18)",
        cloudDownColor: "rgba(239, 68, 68, 0.18)",
        showConversion: true,
        showBase: true,
        showSpanA: true,
        showSpanB: true,
        showLagging: true,
        showCloudFill: true,
      });
    }
    if (fixedType === "boll") {
      return Object.assign(base, {
        upperColor: "#ef4444",
        middleColor: "#3b82f6",
        lowerColor: "#14b8a6",
      });
    }
    return base;
  }

  function addIndicator(type) {
    const fixedType = fixType(type);

    if (fixedType === "ma_pack") {
      const existing = indicators.find(function (item) { return item.type === "ma_pack"; });
      if (existing) {
        existing.visible = true;
        saveIndicators();
        rebuildAll();
        scheduleChartRelayout();
        closeModal();
        return;
      }
    }

    const indicator = createDefaultIndicator(fixedType);

    if (fixedType === "volume") {
      const exists = indicators.find(function (item) { return item.type === "volume"; });
      if (exists) exists.visible = true;
      else indicators.push(indicator);
    } else {
      indicators.push(indicator);
    }

    saveIndicators();
    rebuildAll();
    scheduleChartRelayout();
    closeModal();
  }

  function toggleIndicatorVisible(id) {
    const indicator = indicators.find(function (item) { return item.id === id; });
    if (!indicator) return;
    indicator.visible = !normalizeBool(indicator.visible, true);
    saveIndicators();
    forceInsightIndicatorRebuildAndNotify();
  }

  function removeIndicator(id) {
    const indicator = indicators.find(function (item) { return item.id === id; });
    if (indicator) {
      clearSeries(indicator);
      if (indicator.type === "volume") api.setVolumeVisible(false);
    }
    indicators = indicators.filter(function (item) { return item.id !== id; });
    saveIndicators();
    forceInsightIndicatorRebuildAndNotify();
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

  function getSettingValue(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  }

  function getSettingNumber(id, fallback, min, max) {
    return clampNumber(getSettingValue(id, fallback), min || 0, max || 999999, fallback);
  }

  function getSettingChecked(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return !!el.checked;
  }

  function applySettings() {
    const indicator = indicators.find(function (item) { return item.id === editingId; });
    if (!indicator) return;
    const meta = getMeta(indicator.type);
    if (indicator.type === "ma_pack") {
      applyMaSettings(indicator);
      saveIndicators();
      rebuildAll();
      scheduleChartRelayout();
      closeModal();
      return;
    }

    const visibleEl = document.getElementById("settingVisible");
    if (visibleEl) indicator.visible = visibleEl.value === "true";


    if (indicator.type === "fvg") {
      indicator.timeframe = normalizeBasisTimeframe(getSettingValue("settingTimeframe", indicator.timeframe || "current"));
      indicator.statusFilter = getSettingValue("settingStatusFilter", indicator.statusFilter || "open");
      indicator.minGapPct = getSettingNumber("settingMinGapPct", indicator.minGapPct || 0.3, 0, 50);
      indicator.maxZones = getSettingNumber("settingMaxZones", indicator.maxZones || 30, 1, 300);
      indicator.extendBars = getSettingNumber("settingExtendBars", indicator.extendBars || 80, 5, 1000);
      indicator.showBullish = getSettingChecked("settingShowBullish", indicator.showBullish !== false);
      indicator.showBearish = getSettingChecked("settingShowBearish", indicator.showBearish !== false);
      indicator.showLabels = getSettingChecked("settingShowLabels", indicator.showLabels !== false);
      indicator.showRetestSignals = getSettingChecked("settingShowRetestSignals", indicator.showRetestSignals !== false);
      indicator.bullBorderColor = getSettingValue("settingBullBorderColor", indicator.bullBorderColor || "#14b8a6");
      indicator.bearBorderColor = getSettingValue("settingBearBorderColor", indicator.bearBorderColor || "#ef4444");
      indicator.buyColor = getSettingValue("settingBuyColor", indicator.buyColor || "#16a34a");
      indicator.sellColor = getSettingValue("settingSellColor", indicator.sellColor || "#ef4444");
      indicator.bullColor = indicator.bullColor || "rgba(20, 184, 166, 0.24)";
      indicator.bearColor = indicator.bearColor || "rgba(239, 68, 68, 0.24)";
      delete indicator.__basisRowsPayload;
      delete indicator.__basisRowsCacheKey;
    }

    if (indicator.type === "ma_cross") {
      indicator.timeframe = normalizeBasisTimeframe(getSettingValue("settingTimeframe", indicator.timeframe || "current"));
      indicator.method = getSettingValue("settingMethod", indicator.method || "sma") || "sma";
      indicator.source = getSettingValue("settingSource", indicator.source || "close") || "close";
      indicator.fastPeriod = getSettingNumber("settingFastPeriod", indicator.fastPeriod || 112, 1, 2000);
      indicator.slowPeriod = getSettingNumber("settingSlowPeriod", indicator.slowPeriod || 224, 2, 3000);
      if (indicator.slowPeriod <= indicator.fastPeriod) indicator.slowPeriod = indicator.fastPeriod + 1;
      indicator.maxSignals = getSettingNumber("settingMaxSignals", indicator.maxSignals || 80, 5, 1000);
      indicator.width = getSettingNumber("settingWidth", indicator.width || 2, 1, 6);
      indicator.showLines = getSettingChecked("settingShowLines", indicator.showLines !== false);
      indicator.showSignals = getSettingChecked("settingShowSignals", indicator.showSignals !== false);
      indicator.showLastState = getSettingChecked("settingShowLastState", indicator.showLastState !== false);
      indicator.fastColor = getSettingValue("settingFastColor", indicator.fastColor || "#3b82f6");
      indicator.slowColor = getSettingValue("settingSlowColor", indicator.slowColor || "#f97316");
      indicator.buyColor = getSettingValue("settingBuyColor", indicator.buyColor || "#16a34a");
      indicator.sellColor = getSettingValue("settingSellColor", indicator.sellColor || "#ef4444");
      delete indicator.__basisRowsPayload;
      delete indicator.__basisRowsCacheKey;
    }

    if (indicator.type === "boll") {
      indicator.upperColor = getSettingValue("settingUpperColor", indicator.upperColor || "#ef4444");
      indicator.middleColor = getSettingValue("settingMiddleColor", indicator.middleColor || "#3b82f6");
      indicator.lowerColor = getSettingValue("settingLowerColor", indicator.lowerColor || "#14b8a6");
    }

    saveIndicators();
    rebuildAll();
    scheduleChartRelayout();
    closeModal();
  }

  function getCustomSelectMenu(wrap) {
    if (!wrap) return null;
    return wrap.__bvMenu || wrap.querySelector("[data-bv-select-menu]");
  }

  function positionCustomSelectMenu(wrap) {
    const menu = getCustomSelectMenu(wrap);
    const btn = wrap ? wrap.querySelector("[data-bv-select-btn]") : null;
    if (!menu || !btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 7;
    const viewportGap = 12;
    const desiredWidth = Math.max(rect.width, 180);
    const maxHeight = Math.min(310, window.innerHeight - viewportGap * 2);
    let top = rect.bottom + gap;
    if (top + maxHeight > window.innerHeight - viewportGap) {
      top = Math.max(viewportGap, rect.top - gap - maxHeight);
    }
    let left = Math.min(window.innerWidth - desiredWidth - viewportGap, Math.max(viewportGap, rect.left));
    menu.style.width = desiredWidth + "px";
    menu.style.maxHeight = maxHeight + "px";
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function openCustomSelect(wrap) {
    if (!wrap) return;
    const menu = getCustomSelectMenu(wrap);
    if (!menu) return;
    closeAllCustomSelects(wrap);
    wrap.__bvMenu = menu;
    menu.__bvOwner = wrap;
    if (menu.parentNode !== document.body) document.body.appendChild(menu);
    wrap.classList.add("open");
    menu.classList.add("open", "bv-select-menu-portal");
    positionCustomSelectMenu(wrap);
  }

  function closeCustomSelect(wrap) {
    if (!wrap) return;
    const menu = getCustomSelectMenu(wrap);
    wrap.classList.remove("open");
    if (menu) {
      menu.classList.remove("open", "bv-select-menu-portal");
      menu.removeAttribute("style");
      if (menu.parentNode === document.body) wrap.appendChild(menu);
    }
  }

  function closeAllCustomSelects(except) {
    document.querySelectorAll(".bv-select.open").forEach(function (el) {
      if (except && el === except) return;
      closeCustomSelect(el);
    });
    document.querySelectorAll(".bv-select-menu-portal.open").forEach(function (menu) {
      const owner = menu.__bvOwner;
      if (except && owner === except) return;
      if (owner) closeCustomSelect(owner);
      else menu.remove();
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
      if (open) closeCustomSelect(wrap);
      else openCustomSelect(wrap);
      return;
    }

    const option = event.target.closest("[data-bv-select-option]");
    if (option) {
      event.preventDefault();
      event.stopPropagation();
      const menu = option.closest("[data-bv-select-menu]");
      const wrap = (menu && menu.__bvOwner) || option.closest("[data-bv-select]");
      if (!wrap) return;
      const input = wrap.querySelector("input[type='hidden']");
      const label = wrap.querySelector(".bv-select-label");
      if (input) input.value = option.dataset.value || "";
      if (label) label.textContent = option.textContent.trim();
      const currentMenu = getCustomSelectMenu(wrap);
      if (currentMenu) {
        currentMenu.querySelectorAll("[data-bv-select-option]").forEach(function (node) {
          node.classList.toggle("active", node === option);
        });
      }
      closeCustomSelect(wrap);
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

  rightList && rightList.addEventListener("click", handleIndicatorListClick);
  rightList && rightList.addEventListener("dblclick", handleIndicatorListDblClick);
  mobileList && mobileList.addEventListener("click", handleIndicatorListClick);
  mobileList && mobileList.addEventListener("dblclick", handleIndicatorListDblClick);

  // iframe/srcdoc 환경에서는 rightList가 다시 그려지는 타이밍에 직접 바인딩이 끊긴 것처럼
  // 보일 수 있어 문서 레벨에서도 한 번 더 위임 처리한다.
  document.addEventListener("click", function (event) {
    if (!event.target.closest("#rightIndicatorList, #mobileIndicatorList")) return;
    handleIndicatorListClick(event);
  }, true);

  document.addEventListener("dblclick", function (event) {
    if (!event.target.closest("#rightIndicatorList, #mobileIndicatorList")) return;
    handleIndicatorListDblClick(event);
  }, true);

  openMobileBtn && openMobileBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    openMobileIndicatorModal();
  });

  mobileAddBtn && mobileAddBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    closeMobileIndicatorModal();
    openSearch(quickSearchInput ? quickSearchInput.value : "");
  });

  document.querySelectorAll("[data-close-mobile-indicators]").forEach(function (btn) {
    btn.addEventListener("click", closeMobileIndicatorModal);
  });

  mobileModal && mobileModal.addEventListener("click", function (event) {
    if (event.target === mobileModal) closeMobileIndicatorModal();
  });

  applyBtn && applyBtn.addEventListener("click", applySettings);
  document.querySelectorAll("[data-close-indicator]").forEach(function (btn) { btn.addEventListener("click", closeModal); });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-bv-select-btn]") || event.target.closest("[data-bv-select-option]")) {
      handleCustomSelectClick(event);
      return;
    }
    closeAllCustomSelects();
    if (modal.classList.contains("open") && panel && !panel.contains(event.target) && !event.target.closest(".indicator-color-palette") && !event.target.closest(".bv-select-menu-portal") && !openTopBtn?.contains(event.target) && !openSideBtn?.contains(event.target) && !openMobileBtn?.contains(event.target) && !quickSearchBtn?.contains(event.target)) {
      closeModal();
    }
    if (!event.target.closest(".indicator-color-palette") && !event.target.closest("[data-color-target]")) closeColorPalette();
  });

  window.addEventListener("resize", function () {
    document.querySelectorAll(".bv-select.open").forEach(positionCustomSelectMenu);
  });

  document.addEventListener("scroll", function () {
    document.querySelectorAll(".bv-select.open").forEach(positionCustomSelectMenu);
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeAllCustomSelects();
      closeColorPalette();
      closeModal();
      closeMobileIndicatorModal();
    }
  });

  document.addEventListener("bitgak:chart-data-loaded", rebuildAll);

  function getPlainIndicators() {
    return indicators.map(function (item) {
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
      const copy = { ...item };
      delete copy.series;
      delete copy.__legendData;
      delete copy.__hhllRowsPayload;
      delete copy.__hhllRowsCacheKey;
      delete copy.__hhllRequestToken;
      delete copy.__basisRowsPayload;
      delete copy.__basisRowsCacheKey;
      delete copy.__basisRequestToken;
      return copy;
    });
  }

  function setIndicatorsFromSnapshot(list) {
    indicators = (Array.isArray(list) ? list : []).map(normalizeIndicator).filter(Boolean);
    saveIndicators();
    rebuildAll();
    renderCatalog();
    renderFavoritePanel();
    renderRightList();
    schedulePaneLabelRefresh();
  }

  window.BitgakIndicators = {
    getIndicators: getPlainIndicators,
    setIndicators: setIndicatorsFromSnapshot,
    clear: function () { setIndicatorsFromSnapshot([]); },
    removeIndicator: removeIndicator,
    toggleIndicatorVisible: toggleIndicatorVisible,
  };

  document.addEventListener("bitgak:apply-insight-indicators", function (event) {
    const detail = event.detail || {};
    setIndicatorsFromSnapshot(detail.indicators || []);
  });


  window.BitgakClearIndicatorPaneLabels = function () {
    clearAdaptivePaneLabels([]);
    try {
      if (api.configureIndicatorPanes) api.configureIndicatorPanes([]);
      if (api.syncPaneTimeScales) api.syncPaneTimeScales();
    } catch (e) {}
  };

  loadIndicators();
  fetchServerIndicators();
  startPaneLabelResizeSync();
  startPaneLegendCrosshairSync();
  ensureCatalogLayout();
  renderCatalog();
  renderFavoritePanel();
  renderRightList();
  schedulePaneLabelRefresh();
})();
