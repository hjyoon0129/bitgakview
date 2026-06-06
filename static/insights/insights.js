(function () {
  "use strict";

  function qs(root, selector) { return root ? root.querySelector(selector) : null; }
  function qsa(root, selector) { return root ? Array.from(root.querySelectorAll(selector)) : []; }
  function normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function onlyCode(value) { return String(value || "").replace(/[^0-9A-Za-z]/g, "").trim(); }
  function safeJsonParse(value, fallback) { try { return JSON.parse(value || ""); } catch (e) { return fallback; } }
  function toJson(value) { try { return JSON.stringify(value || {}, null, 0); } catch (e) { return ""; } }
  function getIntervalLabel(value) {
    var map = { "1h": "1시간", "2h": "2시간", "3h": "3시간", "4h": "4시간", "1d": "일", "1w": "주", "1mo": "월" };
    return map[String(value || "1d")] || String(value || "일");
  }
  function setText(el, text) { if (el) el.textContent = text; }
  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
    el.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function absoluteUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try { return new URL(raw, window.location.origin || window.location.href).toString(); }
    catch (e) { return raw; }
  }

  function getCookie(name) {
    var value = "; " + (document.cookie || "");
    var parts = value.split("; " + name + "=");
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift());
    return "";
  }

  function jsonFetch(url, options) {
    var opts = Object.assign({ method: "GET" }, options || {});
    opts.credentials = "same-origin";
    opts.headers = Object.assign({
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    }, opts.headers || {});
    if (String(opts.method || "GET").toUpperCase() !== "GET") {
      opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
      var csrf = getCookie("csrftoken");
      if (csrf) opts.headers["X-CSRFToken"] = csrf;
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        data = data || {};
        data.__ok = res.ok;
        data.__status = res.status;
        return data;
      });
    });
  }

  var STOCK_SEARCH_CACHE = new Map();
  var STOCK_SEARCH_ABORT = null;

  function getStockSearchApiUrl(form) {
    var explicit = form && (form.dataset.stockSearchApiUrl || form.getAttribute("data-stock-search-api-url"));
    return explicit || "/insights/api/stock-search/";
  }

  function getChartDraftApiUrl(form) {
    return form && (form.dataset.chartDraftUrl || form.getAttribute("data-chart-draft-url")) || "/insights/api/chart-draft/";
  }

  function normalizeDraftPayload(data) {
    data = data || {};
    var draft = data.draft || data;
    return {
      media_type: draft.media_type || draft.mediaType || "chart",
      chart_code: onlyCode(draft.chart_code || draft.code || ""),
      chart_name: String(draft.chart_name || draft.name || "").trim(),
      chart_interval: normalizeIntervalForEmbed(draft.chart_interval || draft.interval || "1d"),
      chart_snapshot: typeof draft.chart_snapshot === "string" ? draft.chart_snapshot : toJson(draft.chart_snapshot || draft.snapshot || {})
    };
  }

  var BITGAK_LOCAL_STOCKS = [
    { code: "KOSPI", name: "코스피 지수", market: "INDEX-KR", aliases: ["코스피", "kospi", "ks11", "종합주가지수", "코스피인덱스", "kospi index"], asset_type: "index" },
    { code: "KOSDAQ", name: "코스닥 지수", market: "INDEX-KR", aliases: ["코스닥", "kosdaq", "kq11", "코스닥인덱스", "kosdaq index"], asset_type: "index" },
    { code: "NASDAQ", name: "나스닥 종합", market: "INDEX-US", aliases: ["나스닥", "나스닥종합", "nasdaq", "ixic", "^ixic", "nasdaq composite"], asset_type: "index" },
    { code: "NASDAQ100", name: "나스닥 100", market: "INDEX-US", aliases: ["나스닥100", "나스닥 100", "nasdaq100", "nasdaq 100", "ndx", "^ndx", "nas100", "us100"], asset_type: "index" },
    { code: "NQF", name: "나스닥 100 E-mini 선물", market: "FUTURE-US", aliases: ["나스닥선물", "나스닥 100 선물", "나스닥100선물", "e-mini", "emini", "nq", "nq=f", "nqf", "nasdaq futures"], asset_type: "future" },
    { code: "SOX", name: "필라델피아 반도체 지수", market: "INDEX-US", aliases: ["필라델피아반도체", "필라델피아 반도체", "반도체지수", "sox", "^sox", "phlx semiconductor"], asset_type: "index" },
    { code: "SP500", name: "S&P 500", market: "INDEX-US", aliases: ["s&p500", "s&p 500", "sp500", "spx", "gspc", "^gspc", "에스앤피", "에센피", "us500"], asset_type: "index" },
    { code: "005930", name: "삼성전자", market: "KOSPI" },
    { code: "000660", name: "SK하이닉스", market: "KOSPI" },
    { code: "066570", name: "LG전자", market: "KOSPI" },
    { code: "005380", name: "현대차", market: "KOSPI" },
    { code: "000270", name: "기아", market: "KOSPI" },
    { code: "035420", name: "NAVER", market: "KOSPI" },
    { code: "035720", name: "카카오", market: "KOSPI" },
    { code: "051910", name: "LG화학", market: "KOSPI" },
    { code: "373220", name: "LG에너지솔루션", market: "KOSPI" },
    { code: "005490", name: "POSCO홀딩스", market: "KOSPI" },
    { code: "207940", name: "삼성바이오로직스", market: "KOSPI" },
    { code: "006400", name: "삼성SDI", market: "KOSPI" },
    { code: "068270", name: "셀트리온", market: "KOSPI" },
    { code: "012330", name: "현대모비스", market: "KOSPI" },
    { code: "028260", name: "삼성물산", market: "KOSPI" },
    { code: "000810", name: "삼성화재", market: "KOSPI" },
    { code: "055550", name: "신한지주", market: "KOSPI" },
    { code: "105560", name: "KB금융", market: "KOSPI" },
    { code: "086790", name: "하나금융지주", market: "KOSPI" },
    { code: "316140", name: "우리금융지주", market: "KOSPI" },
    { code: "017670", name: "SK텔레콤", market: "KOSPI" },
    { code: "030200", name: "KT", market: "KOSPI" },
    { code: "003550", name: "LG", market: "KOSPI" },
    { code: "096770", name: "SK이노베이션", market: "KOSPI" },
    { code: "032830", name: "삼성생명", market: "KOSPI" },
    { code: "034020", name: "두산에너빌리티", market: "KOSPI" },
    { code: "042660", name: "한화오션", market: "KOSPI" },
    { code: "010140", name: "삼성중공업", market: "KOSPI" },
    { code: "009540", name: "HD한국조선해양", market: "KOSPI" },
    { code: "247540", name: "에코프로비엠", market: "KOSDAQ" },
    { code: "086520", name: "에코프로", market: "KOSDAQ" },
    { code: "196170", name: "알테오젠", market: "KOSDAQ" },
    { code: "091990", name: "셀트리온헬스케어", market: "KOSDAQ" }
  ];

  function compactStockText(value) {
    return String(value || "")
      .normalize ? String(value || "").normalize("NFKC").toLowerCase().replace(/엘지/g, "lg").replace(/에스케이/g, "sk").replace(/[\s(){}\[\].,·ㆍ_\-&^=+]/g, "").trim()
      : String(value || "").toLowerCase().replace(/[\s(){}\[\].,·ㆍ_\-&^=+]/g, "").trim();
  }

  function localStockSearchHaystack(item) {
    var values = [item.name, item.code, item.market, item.asset_type];
    if (Array.isArray(item.aliases)) values = values.concat(item.aliases);
    return values.map(compactStockText).filter(Boolean).join(" ");
  }

  function localStockMatchScore(item, query, codeQuery) {
    var q = compactStockText(query);
    var codeQ = compactStockText(codeQuery || query);
    var name = compactStockText(item.name);
    var code = compactStockText(item.code);
    var haystack = localStockSearchHaystack(item);
    var rank = Number(item.search_rank || 0);

    if (!q && !codeQ) return -1;
    if (code && (code === q || code === codeQ)) return 100000 + rank;
    if (name && name === q) return 95000 + rank;
    if (code && codeQ && code.indexOf(codeQ) === 0) return 85000 + rank;
    if (name && (name.indexOf(q) === 0 || q.indexOf(name) === 0)) return 76000 + rank;
    if (haystack && q && haystack.indexOf(q) !== -1) return 62000 + rank;
    if (haystack && codeQ && haystack.indexOf(codeQ) !== -1) return 58000 + rank;
    return -1;
  }

  function localStockMatches(query) {
    var q = compactStockText(query);
    if (!q) return [];
    var codeQ = onlyCode(query);
    return BITGAK_LOCAL_STOCKS.map(function (item, index) {
      return { item: item, index: index, score: localStockMatchScore(item, query, codeQ) };
    }).filter(function (entry) {
      return entry.score >= 0;
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    }).map(function (entry) {
      return entry.item;
    }).slice(0, 12);
  }

  function firstLocalStock(query) {
    var items = localStockMatches(query);
    return items.length ? items[0] : null;
  }

  /* -----------------------------
     Carousel
  ----------------------------- */
  function closestNumber(value, fallback) {
    var parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function initCarousel(root) {
    if (!root || root.dataset.insightReady === "1") return;
    root.dataset.insightReady = "1";

    var track = qs(root, "[data-insight-track]") || qs(root, ".insight-carousel-track") || qs(root, ".bv-insight-track");
    var prev = qs(root, "[data-insight-prev]");
    var next = qs(root, "[data-insight-next]");
    if (!track || !prev || !next) return;

    function getVisibleCards() {
      var first = qs(track, ".insight-card, .bv-insight-card");
      if (!first) return 1;
      var cardWidth = first.getBoundingClientRect().width || 1;
      return Math.max(1, Math.round(track.clientWidth / cardWidth));
    }

    function getStep() {
      var first = qs(track, ".insight-card, .bv-insight-card");
      if (!first) return track.clientWidth;
      var style = window.getComputedStyle(track);
      var gap = closestNumber(style.columnGap || style.gap, 16);
      var cardWidth = first.getBoundingClientRect().width;
      var visible = Math.min(4, getVisibleCards());
      return Math.max(cardWidth + gap, (cardWidth + gap) * visible);
    }

    function updateButtons() {
      var maxLeft = Math.max(0, track.scrollWidth - track.clientWidth - 2);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxLeft;
      prev.setAttribute("aria-disabled", prev.disabled ? "true" : "false");
      next.setAttribute("aria-disabled", next.disabled ? "true" : "false");
    }

    prev.addEventListener("click", function (event) {
      event.preventDefault();
      track.scrollBy({ left: -getStep(), behavior: "smooth" });
      window.setTimeout(updateButtons, 380);
    });
    next.addEventListener("click", function (event) {
      event.preventDefault();
      track.scrollBy({ left: getStep(), behavior: "smooth" });
      window.setTimeout(updateButtons, 380);
    });
    track.addEventListener("scroll", function () { window.requestAnimationFrame(updateButtons); }, { passive: true });
    window.addEventListener("resize", updateButtons, { passive: true });
    updateButtons();
  }

  /* -----------------------------
     Strict list search filter
  ----------------------------- */
  function getCardSearchText(card) {
    if (!card) return "";
    var title = qs(card, "h3") ? qs(card, "h3").textContent : "";
    var summary = qs(card, ".insight-card-summary, .bv-insight-card-body p") ? qs(card, ".insight-card-summary, .bv-insight-card-body p").textContent : "";
    var imageAlt = qs(card, "img") ? qs(card, "img").getAttribute("alt") : "";
    return normalizeText([title, summary, imageAlt].join(" "));
  }

  function initListFilter() {
    var grid = qs(document, ".insight-grid, .bv-insight-grid");
    if (!grid || grid.dataset.insightFilterReady === "1") return;
    grid.dataset.insightFilterReady = "1";
    var cards = qsa(grid, ".insight-card, .bv-insight-card");
    if (!cards.length) return;
    var form = qs(document, ".insight-search-row form, .bv-insight-search-form, form[action*='insights']");
    var input = form ? qs(form, "input[name='q'], input[type='search']") : qs(document, "input[name='q'], input[type='search']");
    var countEl = qs(document, ".insight-count, .bv-insight-count");

    function applyFilter() {
      var query = normalizeText(input ? input.value : new URLSearchParams(window.location.search).get("q"));
      var visibleCount = 0;
      cards.forEach(function (card) {
        var haystack = card.dataset.searchText || getCardSearchText(card);
        card.dataset.searchText = haystack;
        var matched = !query || haystack.indexOf(query) !== -1;
        card.hidden = !matched;
        card.style.display = matched ? "" : "none";
        if (matched) visibleCount += 1;
      });
      if (countEl) countEl.textContent = visibleCount + "개";
      var empty = qs(document, ".insight-empty-box, .bv-insight-empty, [data-insight-empty]");
      if (empty) empty.style.display = visibleCount === 0 ? "block" : "none";
    }
    applyFilter();
    if (input) {
      input.addEventListener("input", applyFilter);
      input.addEventListener("search", applyFilter);
    }
  }

  /* -----------------------------
     Live image editor
  ----------------------------- */
  function ensureHiddenInput(form, name, attrName) {
    var input = qs(form, "[" + attrName + "]") || qs(form, "input[name='" + name + "']");
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = "0";
      input.setAttribute(attrName, "");
      form.appendChild(input);
    }
    return input;
  }

  function findOrCreateFileInput(form) {
    var input = qs(form, "[data-cover-input]") || qs(form, "input[type='file'][name='cover_image']");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.name = "cover_image";
      input.accept = "image/*";
      form.appendChild(input);
    }
    input.type = "file";
    input.name = "cover_image";
    input.accept = input.accept || "image/*";
    input.setAttribute("data-cover-input", "");
    input.classList.add("insight-file-input");
    input.disabled = false;
    return input;
  }

  function initImageEditor(target) {
    var form = target && target.tagName === "FORM" ? target : target.closest("form");
    if (!form || form.dataset.imageEditorReady === "1") return;
    form.dataset.imageEditorReady = "1";

    var fileInput = findOrCreateFileInput(form);
    var removeInput = ensureHiddenInput(form, "remove_cover_image", "data-remove-cover-image");
    var deleteInput = ensureHiddenInput(form, "delete_cover_image", "data-delete-image-input");
    var clearCheckboxes = qsa(form, "input[type='checkbox'][name$='-clear'], input[type='checkbox'][name='cover_image-clear']");
    var selectBtn = qs(form, "[data-image-select], [data-image-pick]");
    var deleteBtn = qs(form, "[data-image-delete], [data-image-remove]");
    var cancelBtn = qs(form, "[data-image-cancel]");
    var preview = qs(form, "[data-image-preview], .insight-preview, .bv-insight-image-preview");
    var previewImg = qs(form, "[data-image-preview-img], [data-preview-img], .insight-preview img, .bv-insight-image-preview img");
    var empty = qs(form, "[data-image-preview-empty], [data-preview-empty], .insight-preview-empty, .bv-insight-image-placeholder");
    var status = qs(form, "[data-image-status], .insight-status-badge, .bv-insight-image-status");
    var help = qs(form, "[data-image-help]");
    var originalSrc = previewImg ? (previewImg.getAttribute("src") || "") : "";
    var originalHelp = help ? help.innerHTML : "";

    function setStatus(text, mode) {
      if (!status) return;
      status.textContent = text || "";
      status.className = "insight-status-badge" + (mode ? " " + mode : "");
    }
    function setPreview(src) {
      var has = !!src;
      if (previewImg) {
        if (src) previewImg.src = src;
        else previewImg.removeAttribute("src");
      }
      if (preview) preview.classList.toggle("has-image", has);
      if (empty) empty.style.display = has ? "none" : "flex";
    }
    function clearFlags() {
      removeInput.value = "0";
      deleteInput.value = "0";
      clearCheckboxes.forEach(function (checkbox) { checkbox.checked = false; });
    }

    if (selectBtn) selectBtn.addEventListener("click", function () { fileInput.click(); });
    if (deleteBtn) deleteBtn.addEventListener("click", function () {
      fileInput.value = "";
      removeInput.value = "1";
      deleteInput.value = "1";
      clearCheckboxes.forEach(function (checkbox) { checkbox.checked = true; });
      setPreview("");
      setStatus("삭제 예정", "danger");
      if (help) help.textContent = "저장하면 대표 이미지가 삭제됩니다.";
    });
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      fileInput.value = "";
      clearFlags();
      setPreview(originalSrc);
      setStatus("취소됨", "");
      if (help) help.innerHTML = originalHelp;
    });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      clearFlags();
      if (!file) {
        setPreview(originalSrc);
        setStatus("", "");
        return;
      }
      var reader = new FileReader();
      reader.onload = function (event) { setPreview(event.target.result); };
      reader.readAsDataURL(file);
      setStatus("새 이미지", "ok");
      if (help) help.textContent = file.name;
    });
  }

  /* -----------------------------
     Stock iframe chart editor
  ----------------------------- */
  var SNAPSHOT_REQUESTS = Object.create(null);

  function buildStockFrameUrl(code, interval, mode) {
    var fixedCode = onlyCode(code);
    if (!fixedCode) return "";
    var query = new URLSearchParams();
    query.set(mode === "viewer" ? "insight_viewer" : "insight_editor", "1");
    query.set("embed", "1");
    if (interval) query.set("interval", interval);
    return "/stocks/" + encodeURIComponent(fixedCode) + "/?" + query.toString();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function escapeScriptJson(value) {
    return JSON.stringify(value || {})
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .split(String.fromCharCode(0x2028)).join("\\u2028")
      .split(String.fromCharCode(0x2029)).join("\\u2029");
  }

  function normalizeIntervalForEmbed(interval) {
    var value = String(interval || "1d").trim();
    if (["1h", "2h", "3h", "4h", "1d", "1w", "1mo"].indexOf(value) >= 0) return value;
    if (value === "일") return "1d";
    if (value === "주") return "1w";
    if (value === "월") return "1mo";
    return "1d";
  }

  function intervalButtonHtml(current, value, label, sub) {
    var active = normalizeIntervalForEmbed(current) === value;
    return '<button class="tv-interval-item ' + (active ? 'active' : '') + '" type="button" data-interval="' + value + '" data-label="' + escapeAttr(label) + '" role="menuitem"><span>' + escapeHtml(label) + '</span><span class="tv-interval-sub">' + escapeHtml(sub || value.toUpperCase()) + '</span></button>';
  }


  function insightFrameIntervalPreserveScript() {
    return `(function(){
      "use strict";
      if (window.__BITGAK_INSIGHT_FRAME_BRIDGE_V11__) return;
      window.__BITGAK_INSIGHT_FRAME_BRIDGE_V11__ = true;

      var finalSaveTimer = null;
      var userDirtyTimer = null;
      var lastStableDrawings = [];
      var intervalSwitchingUntil = 0;

      function norm(value) {
        value = String(value || "1d").trim();
        var map = {
          "일": "1d", "주": "1w", "월": "1mo",
          "D": "1d", "W": "1w", "M": "1mo",
          "1D": "1d", "1W": "1w", "1M": "1mo",
          "day": "1d", "week": "1w", "month": "1mo",
          "Day": "1d", "Week": "1w", "Month": "1mo",
          "60m": "1h", "60M": "1h"
        };
        return map[value] || map[value.toUpperCase && value.toUpperCase()] || value || "1d";
      }

      function clone(value) {
        try { return JSON.parse(JSON.stringify(value || null)); }
        catch (e) { return null; }
      }

      function cloneDrawings(drawings) {
        return clone(Array.isArray(drawings) ? drawings : []) || [];
      }

      function hasDrawings(snapshot) {
        return !!(snapshot && Array.isArray(snapshot.drawings) && snapshot.drawings.length > 0);
      }

      function rememberStableDrawings(drawings) {
        if (Array.isArray(drawings) && drawings.length > 0) {
          lastStableDrawings = cloneDrawings(drawings);
        }
      }

      function isIntervalSwitching() {
        return Date.now() < intervalSwitchingUntil;
      }

      function markIntervalSwitching() {
        intervalSwitchingUntil = Date.now() + 5200;
      }

      function getCoreStateDrawings() {
        try {
          var a = api();
          if (a && a.state && Array.isArray(a.state.drawings)) return a.state.drawings;
          if (a && typeof a.getDrawings === "function") return a.getDrawings() || [];
        } catch (e) {}
        return [];
      }

      function protectIntervalDrawings(snapshot, reason) {
        if (!snapshot || typeof snapshot !== "object") return snapshot;
        if (hasDrawings(snapshot)) {
          rememberStableDrawings(snapshot.drawings);
          return snapshot;
        }

        var stateDrawings = getCoreStateDrawings();
        if (Array.isArray(stateDrawings) && stateDrawings.length > 0) {
          snapshot.drawings = cloneDrawings(stateDrawings);
          rememberStableDrawings(snapshot.drawings);
          return snapshot;
        }

        // 일봉/주봉 전환 중에는 LightweightCharts pane 재배치가 먼저 끝나고
        // SVG 드로잉 복원이 늦게 도착할 수 있다. 이때 빈 drawings snapshot을
        // 부모 hidden input/서버에 저장하면 기존 빗각 드로잉이 사라진다.
        if (isIntervalSwitching() && lastStableDrawings.length > 0) {
          snapshot.drawings = cloneDrawings(lastStableDrawings);
          snapshot.restoredDrawingsDuringIntervalSwitch = true;
          snapshot.restoredDrawingsReason = reason || "interval-switch-protect";
        }
        return snapshot;
      }

      function api() { return window.BitgakChart || null; }
      function app() { return document.querySelector(".bv-app"); }

      function currentInterval() {
        var a = api();
        return norm((a && a.state && a.state.interval) || "1d");
      }

      function getCodeName(snapshot) {
        var a = api();
        var el = app();
        var payload = a && a.state && a.state.payload ? a.state.payload : {};
        var code = (snapshot && snapshot.code) || payload.code || (el && el.dataset && el.dataset.code) || "";
        var name = (snapshot && snapshot.name) || payload.name || (el && el.dataset && el.dataset.name) || code || "";
        return { code: code, name: name };
      }

      function stripViewport(snapshot) {
        if (!snapshot || typeof snapshot !== "object") return snapshot;
        var fixed = Object.assign({}, snapshot);
        delete fixed.visibleLogicalRange;
        delete fixed.logicalRange;
        delete fixed.visibleDateRange;
        delete fixed.mainPriceRange;
        delete fixed.priceRange;
        delete fixed.visiblePriceRange;
        fixed.preserveVisibleRange = false;
        fixed.preservePriceRange = false;
        fixed.resetViewportOnLoad = true;
        fixed.viewportStrippedReason = "insight-frame-bridge-v11";
        return fixed;
      }

      function captureSnapshot(intervalOverride) {
        var a = api();
        var current = currentInterval();
        var snapshot = null;

        try {
          if (a && typeof a.captureInsightSnapshot === "function") {
            snapshot = a.captureInsightSnapshot();
          }
        } catch (e) {}

        if (!snapshot || typeof snapshot !== "object") snapshot = {};

        if (!Array.isArray(snapshot.drawings)) {
          try {
            snapshot.drawings = a && typeof a.getDrawings === "function" ? (a.getDrawings() || []) : [];
          } catch (e) { snapshot.drawings = []; }
        }

        snapshot = protectIntervalDrawings(snapshot, "capture");

        if (!Array.isArray(snapshot.indicators)) {
          try {
            snapshot.indicators = window.BitgakIndicators && typeof window.BitgakIndicators.getIndicators === "function" ? (window.BitgakIndicators.getIndicators() || []) : [];
          } catch (e) { snapshot.indicators = []; }
        }

        var meta = getCodeName(snapshot);
        snapshot.version = snapshot.version || 3;
        snapshot.source = "bitgakview-insight-frame-bridge-v11";
        snapshot.sourceInterval = norm(snapshot.interval || current);
        snapshot.interval = norm(intervalOverride || snapshot.interval || current);
        snapshot.code = snapshot.code || meta.code;
        snapshot.name = snapshot.name || meta.name;
        snapshot.capturedAt = (new Date()).toISOString();
        delete snapshot.thumbnailDataUrl;

        return stripViewport(clone(snapshot) || snapshot);
      }

      function postDirty(reason, snapshot) {
        try {
          var raw = clone(snapshot) || snapshot || captureSnapshot();
          raw = protectIntervalDrawings(raw, reason || "post-dirty");
          var snap = stripViewport(raw);
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: "bitgak:insight-chart-dirty",
              reason: reason || "changed",
              interval: snap && snap.interval,
              code: snap && snap.code,
              snapshot: snap
            }, "*");
          }
        } catch (e) {}
      }

      function closeIntervalDropdownSoon() {
        setTimeout(function () {
          try {
            var dropdown = document.getElementById("intervalDropdown");
            var button = document.getElementById("intervalDropdownBtn");
            if (dropdown) dropdown.classList.remove("open");
            if (button) button.setAttribute("aria-expanded", "false");
          } catch (e) {}
        }, 0);
      }

      function closeIntervalDropdownNow() {
        try {
          var dropdown = document.getElementById("intervalDropdown");
          var button = document.getElementById("intervalDropdownBtn");
          if (dropdown) dropdown.classList.remove("open");
          if (button) button.setAttribute("aria-expanded", "false");
        } catch (e) {}
      }

      function updateCoreSnapshotBeforeInterval(nextInterval) {
        var a = api();
        if (!a || !a.state) return null;
        markIntervalSwitching();

        var current = currentInterval();
        var snapshot = captureSnapshot(current);
        snapshot.sourceInterval = current;
        snapshot.interval = current;
        snapshot = protectIntervalDrawings(snapshot, "before-interval-switch");
        if (hasDrawings(snapshot)) rememberStableDrawings(snapshot.drawings);
        snapshot = stripViewport(snapshot);

        // 중요: 여기서 a.state.insightSnapshotMode / insightSnapshot을 다시 세팅하지 않는다.
        // 일반 차트가 정상인 이유는 interval 변경 시 state.drawings를 메모리 그대로 유지하기 때문이다.
        // 인사이트에서 이 값을 강제로 넣으면 거래량 pane 재배치 + 주봉 로드 타이밍에
        // 예전 daily snapshot이 weekly 차트 위에 다시 적용되어 피보나치 채널이 깨질 수 있다.
        // 그래서 서버 저장용 snapshot만 부모로 보내고, 실제 차트 전환은 core의 기본 로직에 맡긴다.
        try {
          if (a.state) {
            a.state.insightSnapshotMode = false;
            a.state.insightSnapshot = null;
          }
        } catch (e) {}

        var saveSnapshot = clone(snapshot) || snapshot;
        saveSnapshot.interval = norm(nextInterval || current);
        saveSnapshot.sourceInterval = current;
        saveSnapshot = stripViewport(saveSnapshot);
        return saveSnapshot;
      }

      function scheduleFinalSave(reason, nextInterval, delay) {
        clearTimeout(finalSaveTimer);
        finalSaveTimer = setTimeout(function () {
          var snap = captureSnapshot(nextInterval || currentInterval());
          snap = protectIntervalDrawings(snap, reason || "interval-after-switch");
          postDirty(reason || "interval-after-switch", snap);
          setTimeout(function () { intervalSwitchingUntil = 0; }, 900);
        }, delay == null ? 900 : delay);
      }

      function prepareNativeIntervalSwitch(nextInterval, reason) {
        nextInterval = norm(nextInterval || "1d");
        if (!nextInterval) return;
        var saveSnapshot = updateCoreSnapshotBeforeInterval(nextInterval);
        if (saveSnapshot) postDirty((reason || "interval") + "-before", saveSnapshot);
        closeIntervalDropdownSoon();
        scheduleFinalSave((reason || "interval") + "-after", nextInterval, 1200);
      }

      function closestIntervalButton(target) {
        return target && target.closest ? target.closest("[data-interval]") : null;
      }

      document.addEventListener("click", function (event) {
        var button = closestIntervalButton(event.target);
        if (!button) return;
        var next = norm(button.getAttribute("data-interval") || (button.dataset && button.dataset.interval) || "");
        if (!next) return;

        // 여기서는 preventDefault/stopPropagation을 절대 하지 않는다.
        // 실제 일봉/주봉 변경은 메인 차트의 기존 interval handler가 그대로 처리하게 둔다.
        // 인사이트는 변경 직전 최신 드로잉을 core snapshot에 반영하고, 변경 후 서버 저장만 담당한다.
        prepareNativeIntervalSwitch(next, "interval-click");
      }, true);

      document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var button = closestIntervalButton(event.target);
        if (!button) return;
        var next = norm(button.getAttribute("data-interval") || (button.dataset && button.dataset.interval) || "");
        if (!next) return;
        prepareNativeIntervalSwitch(next, "interval-key");
      }, true);

      function triggerNativeIntervalSwitch(nextInterval, reason) {
        nextInterval = norm(nextInterval || "1d");
        var button = document.querySelector('[data-interval="' + nextInterval + '"]');
        if (button) {
          try {
            button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            return true;
          } catch (e) {
            try { button.click(); return true; } catch (ignored) {}
          }
        }

        // 버튼을 못 찾는 비상 상황에서만 core API로 직접 변경한다.
        var a = api();
        if (!a || !a.state) return false;
        prepareNativeIntervalSwitch(nextInterval, reason || "parent-interval");
        try {
          a.state.interval = nextInterval;
          if (typeof a.loadChartData === "function") a.loadChartData();
          return true;
        } catch (e) {
          return false;
        }
      }

      function scheduleUserDirty(reason) {
        clearTimeout(userDirtyTimer);
        userDirtyTimer = setTimeout(function () {
          postDirty(reason || "user-action", captureSnapshot(currentInterval()));
        }, 650);
      }

      document.addEventListener("pointerup", function (event) {
        var target = event.target;
        if (target && target.closest && target.closest("#drawingLayer, .bv-drawing-toolbar, .bv-drawing-settings-modal, .bv-drawing-color-palette")) {
          scheduleUserDirty("drawing-action");
        }
      }, true);

      document.addEventListener("click", function (event) {
        var target = event.target;
        if (target && target.closest && target.closest(".bv-drawing-toolbar, .bv-drawing-settings-modal, .bv-drawing-color-palette, #openIndicatorBtn, #indicatorModal")) {
          scheduleUserDirty("toolbar-action");
        }
      }, true);

      document.addEventListener("change", function (event) {
        var target = event.target;
        if (target && target.closest && target.closest(".bv-drawing-settings-modal, #indicatorModal")) {
          scheduleUserDirty("settings-change");
        }
      }, true);

      document.addEventListener("bitgak:chart-data-loaded", function () {
        closeIntervalDropdownSoon();
        try {
          var a0 = api();
          if (a0 && a0.state) {
            // interval 전환 직후에는 저장 snapshot을 차트에 다시 덮지 않는다.
            // 특히 거래량 pane이 있는 상태에서 재적용되면 메인 pane 높이 계산 전후가 섞여 드로잉이 틀어진다.
            a0.state.insightSnapshotMode = false;
            a0.state.insightSnapshot = null;
          }
        } catch (e) {}
        if (lastStableDrawings.length > 0) intervalSwitchingUntil = Math.max(intervalSwitchingUntil, Date.now() + 1800);
        scheduleFinalSave("data-loaded", currentInterval(), 720);
        [40, 120, 260, 520, 900].forEach(function (delay) {
          setTimeout(function () {
            try {
              var a = api();
              if (a && typeof a.forceDrawingRelayout === "function") a.forceDrawingRelayout();
              else if (a && typeof a.refreshDrawingLayer === "function") a.refreshDrawingLayer();
            } catch (e) {}
          }, delay);
        });
      });

      window.addEventListener("message", function (event) {
        var data = event.data || {};
        if (!data || typeof data !== "object") return;

        if (data.type === "bitgak:apply-insight-snapshot" && data.snapshot) {
          var rawSnapshot = clone(data.snapshot) || data.snapshot;
          if (hasDrawings(rawSnapshot)) rememberStableDrawings(rawSnapshot.drawings);
          var snapshot = stripViewport(rawSnapshot);
          var a = api();
          try {
            if (a && a.state) {
              a.state.insightSnapshotMode = true;
              a.state.insightSnapshot = clone(snapshot) || snapshot;
            }
          } catch (e) {}
          return;
        }

        if (data.type === "bitgak:switch-insight-interval") {
          triggerNativeIntervalSwitch(data.interval || "1d", "parent-interval");
        }
      });

      window.__BITGAK_INSIGHT_FRAME_BRIDGE__ = {
        version: "v11",
        switchInterval: triggerNativeIntervalSwitch,
        capture: function () { return captureSnapshot(currentInterval()); }
      };
    })();`;
  }

  function buildStockFrameSrcdoc(frame, code, name, interval, mode) {
    var fixedCode = onlyCode(code);
    var fixedName = String(name || fixedCode || "").trim();
    var fixedInterval = normalizeIntervalForEmbed(interval || "1d");
    var parentOrigin = window.location.origin || (window.location.protocol + "//" + window.location.host);
    var cssUrl = absoluteUrl(frame && frame.dataset.stockCssUrl ? frame.dataset.stockCssUrl : "/static/stocks/css/bitgak_chart.css");
    var coreUrl = absoluteUrl(frame && frame.dataset.stockCoreUrl ? frame.dataset.stockCoreUrl : "/static/stocks/js/bitgak_chart_core.js");
    var indicatorsUrl = absoluteUrl(frame && frame.dataset.stockIndicatorsUrl ? frame.dataset.stockIndicatorsUrl : "/static/stocks/js/bitgak_indicators.js");
    var lwUrl = absoluteUrl(frame && frame.dataset.stockLwUrl ? frame.dataset.stockLwUrl : "https://unpkg.com/lightweight-charts@5.0.8/dist/lightweight-charts.standalone.production.js");
    var apiUrl = absoluteUrl("/stocks/api/ohlcv/" + encodeURIComponent(fixedCode) + "/");
    var drawingUrl = absoluteUrl("/stocks/api/drawings/" + encodeURIComponent(fixedCode) + "/");
    var drawingSettingsUrl = absoluteUrl("/stocks/api/drawing-tool-settings/");
    var title = fixedName ? fixedName + " · " + fixedCode : fixedCode;
    var accessJson = escapeScriptJson({
      is_authenticated: true,
      is_premium: true,
      plan: "insight_embed",
      indicator_limit: 999,
      watchlist_limit: 999,
      group_limit: 999,
      drawing_limit: 999,
      features: {}
    });
    var intervalLabel = { "1h": "1시간", "2h": "2시간", "3h": "3시간", "4h": "4시간", "1d": "일", "1w": "주", "1mo": "월" }[fixedInterval] || "일";

    return '<!doctype html>' +
      '<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><base href="' + escapeAttr(parentOrigin) + '/">' +
      '<link rel="stylesheet" href="' + escapeAttr(cssUrl) + '">' +
      '<style>' +
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050a14;}' +
      'body.bitgak-chart-body{width:100%;height:100%;overflow:hidden;background:#050a14;}' +
      '.site-header{display:none!important}.site-main{position:fixed!important;inset:0!important;padding:0!important;margin:0!important;max-width:none!important;width:100vw!important;height:100vh!important;overflow:hidden!important;}' +
      '.bv-app{width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;display:grid!important;grid-template-rows:minmax(0,1fr)!important;overflow:hidden!important;background:#050a14!important;}' +
      '.bv-header{display:none!important;}' +
      '.bv-layout,.bv-layout-full{grid-row:1/2!important;height:100%!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;overflow:hidden!important;padding:0!important;}' +
      '.bv-left-panel,.bv-symbol-panel,.bv-drawer-actions,.bv-mobile-watch-actions{display:none!important;}' +
      '.bv-main{height:100%!important;min-height:0!important;padding:0!important;overflow:hidden!important;}' +
      '.chart-card,.chart-card-full{height:100%!important;border-radius:0!important;border:0!important;box-shadow:none!important;}' +
      '.chart-card-top{min-height:52px!important;flex:0 0 52px!important;padding:0 10px!important;gap:8px!important;overflow:visible!important;}' +
      '.chart-title{min-width:110px!important;max-width:220px!important;font-size:12px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}' +
      '.tv-interval-dropdown{z-index:80!important}.bv-drawing-toolbar{margin-left:4px!important;max-width:calc(100vw - 430px);overflow-x:auto;overflow-y:hidden;}' +
      '.insight-embed-indicator-btn{height:32px;padding:0 12px;border:0;border-radius:12px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;font-size:12px;font-weight:1000;white-space:nowrap;}' +
      '.insight-embed-side-store{position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;}' +
      '.insight-embed-indicator-dock{flex:0 0 auto;min-height:42px;padding:6px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #edf2f7;border-bottom:1px solid #e2e8f0;background:#fff;overflow:hidden;}' +
      '.insight-embed-indicator-dock-head{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;min-width:74px;color:#334155;font-size:11px;font-weight:1000;white-space:nowrap;}' +
      '.insight-embed-indicator-dock-head span{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#dbeafe;color:#2563eb;font-size:10px;font-weight:1000;}' +
      '#rightIndicatorList{min-width:0;flex:1 1 auto;display:flex;align-items:center;gap:7px;overflow-x:auto;overflow-y:hidden;padding:0 2px;scrollbar-width:thin;}' +
      '#rightIndicatorList .indicator-empty{height:30px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;background:#f8fafc;border:1px dashed #cbd5e1;color:#64748b;font-size:11px;font-weight:900;white-space:nowrap;}' +
      '#rightIndicatorList .indicator-row{flex:0 0 auto;min-height:30px;height:30px;padding:3px 4px 3px 8px;border-radius:999px;background:#f8fafc;border:1px solid #dbeafe;display:flex;align-items:center;gap:8px;color:#0f172a;box-shadow:none;}' +
      '#rightIndicatorList .indicator-row.off{opacity:.48;background:#f1f5f9;}' +
      '#rightIndicatorList .indicator-row-main{min-width:0;display:flex;align-items:center;}' +
      '#rightIndicatorList .indicator-row-title{display:flex;align-items:center;gap:5px;min-width:0;}' +
      '#rightIndicatorList .indicator-color-dot{width:7px;height:7px;border-radius:999px;flex:0 0 7px;}' +
      '#rightIndicatorList .indicator-row-title strong{font-size:11px;font-weight:1000;color:#0f172a;line-height:1;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#rightIndicatorList .indicator-row-actions{display:inline-flex;align-items:center;gap:3px;}' +
      '#rightIndicatorList .indicator-eye-btn,#rightIndicatorList .indicator-edit-btn,#rightIndicatorList .indicator-trash-btn{width:24px;height:24px;border:0;border-radius:999px;background:transparent;color:#475569;display:inline-flex;align-items:center;justify-content:center;padding:0;}' +
      '#rightIndicatorList .indicator-eye-btn:hover,#rightIndicatorList .indicator-edit-btn:hover{background:#e0f2fe;color:#0369a1;}' +
      '#rightIndicatorList .indicator-trash-btn:hover{background:#fee2e2;color:#dc2626;}' +
      '#rightIndicatorList svg{width:15px;height:15px;display:block;}' +
      '.indicator-search-layout{grid-template-columns:1fr!important}.indicator-panel{width:min(900px,calc(100vw - 28px))!important}.indicator-settings-actions{padding:12px 16px 16px;display:flex;justify-content:flex-end}' +
      '.tool-btn{flex:0 0 auto!important}.chart-top-btn,.chart-mode-text,.chart-credit{display:none!important;}' +
      '.ohlc-info{flex:0 0 30px!important;min-height:30px!important;font-size:11px!important;}' +
      '.chart-wrap,.chart-wrap-v5{flex:1 1 auto!important;min-height:0!important;border-radius:0!important;}' +
      '.tv-chart,.tv-chart-v5{height:100%!important;}' +
      '.drawing-layer{z-index:35!important}.chart-indicator-overlay{z-index:34!important;}' +
      '@media(max-width:760px){.chart-title{display:none!important}.bv-drawing-toolbar{max-width:calc(100vw - 155px);}.chart-card-top{gap:5px!important;padding:0 6px!important;}}' +
      '</style></head>' +
      '<body class="bitgak-chart-body">' +
      '<script id="bitgak-access-data" type="application/json">' + accessJson + '<\/script>' +
      '<section class="bv-app" data-insight-editor="' + (mode === "viewer" ? "0" : "1") + '" data-insight-viewer="' + (mode === "viewer" ? "1" : "0") + '" data-insight-embed="1" data-code="' + escapeAttr(fixedCode) + '" data-name="' + escapeAttr(fixedName) + '" data-market="KRX" data-parent-origin="' + escapeAttr(parentOrigin) + '" data-api-url="' + escapeAttr(apiUrl) + '" data-drawing-api-url="' + escapeAttr(drawingUrl) + '" data-drawing-settings-api-url="' + escapeAttr(drawingSettingsUrl) + '">' +
      '<main class="bv-layout bv-layout-full"><section class="bv-main"><section class="chart-card chart-card-full">' +
      '<div class="chart-card-top"><div id="chartTitle" class="chart-title">' + escapeHtml(title) + '</div>' +
      '<div class="tv-interval-dropdown" id="intervalDropdown"><button id="intervalDropdownBtn" class="tv-interval-btn" type="button" aria-haspopup="true" aria-expanded="false"><span class="tv-interval-icon">⏱</span><span id="currentIntervalText">' + escapeHtml(intervalLabel) + '</span><span class="tv-interval-arrow">▾</span></button>' +
      '<div class="tv-interval-menu" role="menu" aria-label="기간 선택"><div class="tv-interval-section"><span>시간봉</span><em>Yahoo</em></div>' +
      intervalButtonHtml(fixedInterval, "1h", "1시간", "1H") + intervalButtonHtml(fixedInterval, "2h", "2시간", "2H") + intervalButtonHtml(fixedInterval, "3h", "3시간", "3H") + intervalButtonHtml(fixedInterval, "4h", "4시간", "4H") +
      '<div class="tv-interval-section tv-interval-section-sub"><span>일반</span><em>KRX</em></div>' +
      intervalButtonHtml(fixedInterval, "1d", "일", "Day") + intervalButtonHtml(fixedInterval, "1w", "주", "Week") + intervalButtonHtml(fixedInterval, "1mo", "월", "Month") +
      '</div></div>' +
      '<div class="bv-drawing-toolbar" aria-label="차트 그리기 도구"><button class="tool-btn active" type="button" data-tool="cursor" title="커서">＋</button><button class="tool-btn" type="button" data-tool="trend" title="추세선">╱</button><button class="tool-btn" type="button" data-tool="extend" title="연장선">━</button><button class="tool-btn" type="button" data-tool="hline" title="수평선">─</button><button class="tool-btn" type="button" data-tool="vline" title="수직선">│</button><button class="tool-btn" type="button" data-tool="circle" title="원형 표시">○</button><button class="tool-btn" type="button" data-tool="fibo" title="피보나치">⌁</button><button class="tool-btn bv-drawing-continuous-btn" type="button" data-drawing-continuous="1" title="연속 그리기" aria-pressed="false">연속</button><button class="tool-btn" type="button" data-tool="undo" title="마지막 삭제">↶</button><button class="tool-btn" type="button" data-tool="clear" title="전체 삭제">⌂</button></div>' +
      '<button id="openIndicatorBtn" class="insight-embed-indicator-btn" type="button">지표</button>' +
      '<div class="chart-top-spacer"></div></div>' +
      '<div id="ohlcInfo" class="ohlc-info">날짜 -　시가 -　고가 -　저가 -　종가 -　거래량 -</div>' +
      '<div class="insight-embed-indicator-dock" id="insightIndicatorDock"><div class="insight-embed-indicator-dock-head"><strong>적용 지표</strong><span id="activeIndicatorCount">0</span></div><div id="rightIndicatorList"></div></div><div class="insight-embed-side-store"><input id="indicatorQuickSearchInput" type="hidden"><button id="indicatorQuickSearchBtn" type="button"></button></div>' +
      '<div id="chartWrap" class="chart-wrap chart-wrap-v5"><div id="tvChart" class="tv-chart tv-chart-v5"></div><svg id="drawingLayer" class="drawing-layer"></svg><div id="chartIndicatorOverlay" class="chart-indicator-overlay"></div><div id="chartLoading" class="chart-loading">차트 데이터를 불러오는 중입니다...</div></div>' +
      '<div id="indicatorModal" class="indicator-modal" aria-hidden="true"><div class="indicator-panel"><div class="indicator-panel-head"><div><h2 id="indicatorModalTitle">지표 검색</h2><p id="indicatorModalSubtitle">차트에 추가할 지표를 검색하세요.</p></div><button class="modal-close" type="button" data-close-indicator>×</button></div><input id="indicatorSearchInput" class="indicator-search-input" type="search" placeholder="이동평균, 거래량, RSI, MACD 검색"><div class="indicator-search-layout"><div class="indicator-search-results"><div id="indicatorCatalog" class="indicator-catalog"></div></div></div><div id="indicatorSettingsBox" class="indicator-settings-box"><div class="indicator-settings-head"><h3 id="indicatorSettingsTitle">지표 설정</h3><button class="modal-close" type="button" data-close-indicator>×</button></div><div id="activeIndicatorList" class="active-indicator-list"></div><div class="indicator-settings-actions"><button id="applyIndicatorSettings" class="indicator-add-btn" type="button">적용</button></div></div></div></div>' +
      '</section></section></main></section>' +
      '<script src="' + escapeAttr(lwUrl) + '"><\/script><script src="' + escapeAttr(coreUrl) + '"><\/script><script src="' + escapeAttr(indicatorsUrl) + '"><\/script>' +
      '<script>' + insightFrameIntervalPreserveScript() + '<\/script>' +
      '<script>window.addEventListener("load",function(){try{parent.postMessage({type:"bitgak:stock-srcdoc-ready",code:"' + escapeAttr(fixedCode) + '"},"*");}catch(e){}});<\/script>' +
      '</body></html>';
  }

  function parseSnapshot(input) {
    var value = input ? input.value : "";
    var parsed = safeJsonParse(value, null);
    return parsed && typeof parsed === "object" ? parsed : null;
  }

  function snapshotCode(snapshot) {
    return onlyCode(snapshot && snapshot.code ? snapshot.code : "");
  }

  function snapshotMatchesStock(snapshot, code) {
    if (!snapshot || typeof snapshot !== "object") return false;
    var target = onlyCode(code || "");
    var snapCode = snapshotCode(snapshot);
    return !!target && !!snapCode && target === snapCode;
  }


  function stripInsightViewportOnly(snapshot, reason) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    var fixed = Object.assign({}, snapshot);
    if (fixed.interval) fixed.interval = normalizeIntervalForEmbed(fixed.interval);
    if (fixed.sourceInterval) fixed.sourceInterval = normalizeIntervalForEmbed(fixed.sourceInterval);

    // 인사이트 iframe에서는 일봉/주봉 전환 때 기존 logical range가 재사용되면
    // 화면이 2015년대처럼 엉뚱한 구간으로 튀거나 드로잉이 깨져 보일 수 있다.
    // 드로잉 자체의 anchor 값은 건드리지 않고, 화면 범위 정보만 제거한다.
    delete fixed.visibleLogicalRange;
    delete fixed.logicalRange;
    delete fixed.visibleDateRange;
    delete fixed.mainPriceRange;
    delete fixed.priceRange;
    delete fixed.visiblePriceRange;
    fixed.preserveVisibleRange = false;
    fixed.preservePriceRange = false;
    fixed.resetViewportOnLoad = true;
    fixed.viewportStrippedReason = reason || "insight-viewport-only-v8";
    return fixed;
  }

  function cleanSnapshotForStock(code, name, interval) {
    code = onlyCode(code || "");
    name = String(name || code || "").trim();
    return {
      version: 2,
      source: "bitgakview-insight-clean",
      code: code,
      name: name,
      interval: normalizeIntervalForEmbed(interval || "1d"),
      chartUrl: code ? ("/stocks/" + encodeURIComponent(code) + "/?insight_viewer=1&interval=" + encodeURIComponent(interval || "1d")) : "",
      capturedAt: new Date().toISOString(),
      visibleLogicalRange: null,
      drawings: [],
      indicators: []
    };
  }

  function saveChartDefaults(code, name, interval) {
    try {
      localStorage.setItem("bitgak:insight-chart-default:v13", JSON.stringify({ code: code || "", name: name || "", interval: interval || "1d" }));
    } catch (e) {}
  }

  function readChartDefaults() {
    try {
      return JSON.parse(localStorage.getItem("bitgak:insight-chart-default:v13") || "{}");
    } catch (e) {
      return {};
    }
  }

  function postSnapshotToFrame(frame, snapshot) {
    if (!frame || !frame.contentWindow || !snapshot) return;
    var fixed = stripInsightViewportOnly(snapshot, "post-to-frame-v9");
    try {
      frame.contentWindow.postMessage({ type: "bitgak:apply-insight-snapshot", snapshot: fixed }, "*");
    } catch (e) {}
  }

  function requestFrameSnapshot(frame, timeoutMs, options) {
    options = options || {};
    return new Promise(function (resolve) {
      if (!frame || !frame.contentWindow) {
        resolve(null);
        return;
      }
      var requestId = "insight_snapshot_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) return;
        done = true;
        delete SNAPSHOT_REQUESTS[requestId];
        resolve(null);
      }, timeoutMs || 1800);
      SNAPSHOT_REQUESTS[requestId] = function (snapshot) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        delete SNAPSHOT_REQUESTS[requestId];
        resolve(snapshot || null);
      };
      try {
        frame.contentWindow.postMessage({ type: "bitgak:capture-insight-snapshot-request", requestId: requestId, noThumbnail: !!options.noThumbnail }, "*");
      } catch (e) {
        window.clearTimeout(timer);
        delete SNAPSHOT_REQUESTS[requestId];
        resolve(null);
      }
    });
  }


  function dataUrlToFile(dataUrl, filename) {
    try {
      var parts = String(dataUrl || "").split(",");
      if (parts.length < 2 || parts[0].indexOf("data:image") !== 0) return null;
      var mimeMatch = parts[0].match(/data:([^;]+)/);
      var mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      var binary = atob(parts[1]);
      var len = binary.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], filename || "bitgak-chart-capture.jpg", { type: mime });
    } catch (e) {
      return null;
    }
  }

  function setFileInputFromDataUrl(fileInput, dataUrl, filename) {
    var file = dataUrlToFile(dataUrl, filename);
    if (!file || !fileInput || typeof DataTransfer === "undefined") return false;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyChartCaptureToCover(form, snapshot) {
    if (!snapshot || !snapshot.thumbnailDataUrl) return false;
    var input = qs(form, "[data-cover-input]") || qs(form, "input[type='file'][name='cover_image']");
    if (!input) return false;
    var code = onlyCode(snapshot.code || "chart") || "chart";
    var ok = setFileInputFromDataUrl(input, snapshot.thumbnailDataUrl, "bitgak-chart-" + code + ".jpg");
    if (!ok) return false;

    var deleteInput = qs(form, "[data-delete-image-input], [data-delete-cover-image]");
    var removeInput = qs(form, "[data-remove-cover-image]");
    if (deleteInput) deleteInput.value = "0";
    if (removeInput) removeInput.value = "0";

    var preview = qs(form, "[data-image-preview]");
    var img = qs(form, "[data-image-preview-img]");
    var empty = qs(form, "[data-image-preview-empty]");
    var status = qs(form, "[data-image-status]");
    var help = qs(form, "[data-image-help]");
    if (preview) preview.classList.add("has-image");
    if (img) {
      img.src = snapshot.thumbnailDataUrl;
      img.style.display = "block";
    }
    if (empty) empty.style.display = "none";
    if (status) status.textContent = "차트 캡처 저장";
    if (help) help.textContent = "차트 방식으로 저장하면 현재 차트 캡처가 캐러셀 대표 이미지로 자동 등록됩니다.";
    return true;
  }


  function buildChartDraftPayload(form, snapshot) {
    snapshot = snapshot && typeof snapshot === "object" ? snapshot : parseSnapshot(qs(form, "[data-insight-chart-snapshot-input]"));
    var codeInput = qs(form, "[data-insight-chart-code-input]");
    var nameInput = qs(form, "[data-insight-chart-name-input]");
    var intervalInput = qs(form, "[data-insight-chart-interval-input]");
    var apiInput = qs(form, "[data-insight-chart-api-url-input]");
    var mediaInput = qs(form, "[data-insight-media-type]");
    var code = onlyCode((snapshot && snapshot.code) || (codeInput && codeInput.value) || "");
    var name = String((snapshot && snapshot.name) || (nameInput && nameInput.value) || code || "").trim();
    var interval = normalizeIntervalForEmbed((snapshot && snapshot.interval) || (intervalInput && intervalInput.value) || "1d");
    var fixedSnapshot = stripInsightViewportOnly(Object.assign({}, snapshot || {}, { code: code, name: name, interval: interval }), "server-save-v9");
    return {
      media_type: mediaInput ? mediaInput.value || "chart" : "chart",
      chart_code: code,
      chart_name: name,
      chart_interval: interval,
      chart_api_url: (fixedSnapshot.apiUrl || (apiInput && apiInput.value) || ""),
      chart_snapshot: fixedSnapshot
    };
  }

  function saveChartDraftToServerForForm(form, snapshot, options) {
    options = options || {};
    if (!form) return Promise.resolve(null);
    var url = getChartDraftApiUrl(form);
    if (!url) return Promise.resolve(null);
    var state = qs(form, "[data-chart-save-state]");
    if (state && !options.silent) {
      state.textContent = "서버 저장 중";
      state.classList.remove("ok", "warn", "danger");
      state.classList.add("warn");
    }
    return jsonFetch(url, {
      method: "POST",
      body: JSON.stringify(buildChartDraftPayload(form, snapshot))
    }).then(function (data) {
      if (state && !options.silent) {
        state.textContent = data && data.ok ? "서버 저장됨" : "서버 저장 실패";
        state.classList.remove("ok", "warn", "danger");
        state.classList.add(data && data.ok ? "ok" : "danger");
      }
      return data;
    }).catch(function () {
      if (state && !options.silent) {
        state.textContent = "서버 저장 실패";
        state.classList.remove("ok", "warn", "danger");
        state.classList.add("danger");
      }
      return null;
    });
  }

  var CHART_DIRTY_TIMERS = new WeakMap();
  var FRAME_STABLE_DRAWINGS = new WeakMap();
  var FRAME_INTERVAL_SWITCHING_UNTIL = new WeakMap();

  function clonePlain(value) {
    try { return JSON.parse(JSON.stringify(value || null)); }
    catch (e) { return null; }
  }

  function snapshotHasDrawings(snapshot) {
    return !!(snapshot && Array.isArray(snapshot.drawings) && snapshot.drawings.length > 0);
  }

  function rememberFrameStableDrawings(frame, snapshot) {
    if (!frame || !snapshotHasDrawings(snapshot)) return;
    FRAME_STABLE_DRAWINGS.set(frame, clonePlain(snapshot.drawings) || []);
  }

  function markFrameIntervalSwitching(frame) {
    if (!frame) return;
    FRAME_INTERVAL_SWITCHING_UNTIL.set(frame, Date.now() + 6200);
  }

  function isFrameIntervalSwitching(frame) {
    return !!(frame && Date.now() < (FRAME_INTERVAL_SWITCHING_UNTIL.get(frame) || 0));
  }

  function intervalDirtyReason(reason) {
    reason = String(reason || "");
    return reason.indexOf("interval") >= 0 || reason.indexOf("data-loaded") >= 0 || reason.indexOf("restored") >= 0;
  }

  function snapshotLooksLikeManualClear(reason) {
    reason = String(reason || "").toLowerCase();
    return reason.indexOf("clear") >= 0 || reason.indexOf("delete") >= 0 || reason.indexOf("trash") >= 0 || reason.indexOf("remove") >= 0;
  }

  function protectFrameDrawings(frame, snapshot, reason) {
    if (!frame || !snapshot || typeof snapshot !== "object") return snapshot;

    if (snapshotHasDrawings(snapshot)) {
      rememberFrameStableDrawings(frame, snapshot);
      return snapshot;
    }

    if (snapshotLooksLikeManualClear(reason)) return snapshot;

    var stored = FRAME_STABLE_DRAWINGS.get(frame);
    if (!stored || !stored.length) {
      var input = getSnapshotInputForFrame(frame);
      var current = parseSnapshot(input);
      if (snapshotMatchesStock(current, snapshot.code || frame.dataset.currentCode) && snapshotHasDrawings(current)) {
        stored = clonePlain(current.drawings) || [];
        FRAME_STABLE_DRAWINGS.set(frame, stored);
      }
    }

    if (stored && stored.length && (isFrameIntervalSwitching(frame) || intervalDirtyReason(reason))) {
      snapshot = Object.assign({}, snapshot, {
        drawings: clonePlain(stored) || [],
        restoredDrawingsDuringIntervalSwitch: true,
        restoredDrawingsReason: reason || "parent-interval-protect"
      });
    }

    return snapshot;
  }

  function findInsightFrameBySource(source) {
    var frames = qsa(document, "[data-insight-stock-frame], [data-insight-stock-player-frame]");
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].contentWindow && frames[i].contentWindow === source) return frames[i];
    }
    return null;
  }

  function getSnapshotInputForFrame(frame) {
    if (!frame) return null;
    var form = frame.closest("form");
    if (form) return qs(form, "[data-insight-chart-snapshot-input]");
    var root = frame.closest("[data-insight-chart-player]") || document;
    return qs(root, "[data-chart-snapshot-json]");
  }

  function getSnapshotBaseForFrame(frame, fallbackCode) {
    var input = getSnapshotInputForFrame(frame);
    var current = parseSnapshot(input);
    var code = onlyCode(fallbackCode || (frame && frame.dataset.currentCode) || (current && current.code) || "");
    var name = (frame && frame.dataset.currentName) || (current && current.name) || code;
    var interval = (frame && frame.dataset.currentInterval) || (current && current.interval) || "1d";
    if (!current || !snapshotMatchesStock(current, code)) current = cleanSnapshotForStock(code, name, interval);
    current.code = code;
    current.name = current.name || name || code;
    current.interval = current.interval || interval || "1d";
    return current;
  }

  function writeSnapshotForFrame(frame, snapshot) {
    var input = getSnapshotInputForFrame(frame);
    snapshot = protectFrameDrawings(frame, snapshot, "write-hidden");
    var fixed = snapshot && typeof snapshot === "object" ? stripInsightViewportOnly(Object.assign({}, snapshot), "write-hidden-v11") : {};
    rememberFrameStableDrawings(frame, fixed);
    if (input) input.value = toJson(fixed || {});
    if (frame) frame.dataset.userChanged = "1";
  }

  function saveSnapshotForFrame(frame, snapshot, options) {
    options = options || {};
    snapshot = protectFrameDrawings(frame, snapshot, "save-frame");
    var fixedSnapshot = snapshot && typeof snapshot === "object" ? stripInsightViewportOnly(Object.assign({}, snapshot), "save-frame-v11") : snapshot;
    var form = frame && frame.closest("form");
    if (form) return saveChartDraftToServerForForm(form, fixedSnapshot, options);

    // 상세 플레이어는 서버에서 내려준 chart_snapshot을 기준으로 동작한다.
    // 템플릿에서 data-chart-save-url 또는 data-chart-draft-url을 제공하면 해당 URL로 저장한다.
    // 없으면 화면의 hidden snapshot만 갱신하고 원격 저장은 건너뛴다.
    var root = frame ? frame.closest("[data-insight-chart-player]") : null;
    var url = root && (root.dataset.chartSaveUrl || root.dataset.chartDraftUrl || root.dataset.chartSnapshotUrl);
    if (!url) return Promise.resolve(null);
    return jsonFetch(url, {
      method: "POST",
      body: JSON.stringify({ chart_snapshot: fixedSnapshot, snapshot: fixedSnapshot })
    }).catch(function () { return null; });
  }

  window.addEventListener("message", function (event) {
    if (event.origin && event.origin !== window.location.origin && event.origin !== "null") return;
    var data = event.data || {};

    if (data.type === "bitgak:insight-indicators-changed") {
      var indicatorFrame = findInsightFrameBySource(event.source);
      if (!indicatorFrame) return;
      var code = onlyCode(data.code || indicatorFrame.dataset.currentCode || "");
      var base = getSnapshotBaseForFrame(indicatorFrame, code);
      base.indicators = Array.isArray(data.indicators) ? data.indicators : [];
      base.code = code || base.code;
      base.interval = base.interval || indicatorFrame.dataset.currentInterval || "1d";
      writeSnapshotForFrame(indicatorFrame, base);
      saveSnapshotForFrame(indicatorFrame, base, { silent: true });
      return;
    }

    if (data.type === "bitgak:insight-chart-dirty") {
      var dirtyFrame = findInsightFrameBySource(event.source);
      if (!dirtyFrame) return;
      dirtyFrame.dataset.userChanged = "1";

      var incomingSnapshot = data.snapshot && typeof data.snapshot === "object" ? data.snapshot : null;
      var reason = String(data.reason || "");
      if (intervalDirtyReason(reason)) markFrameIntervalSwitching(dirtyFrame);
      if (data.interval) dirtyFrame.dataset.currentInterval = normalizeIntervalForEmbed(data.interval);
      if (incomingSnapshot && snapshotMatchesStock(incomingSnapshot, dirtyFrame.dataset.currentCode || incomingSnapshot.code)) {
        incomingSnapshot = protectFrameDrawings(dirtyFrame, Object.assign({}, incomingSnapshot, {
          interval: normalizeIntervalForEmbed(incomingSnapshot.interval || data.interval || dirtyFrame.dataset.currentInterval || "1d")
        }), reason || "dirty-incoming");
        incomingSnapshot = stripInsightViewportOnly(incomingSnapshot, "dirty-incoming-v11");
        writeSnapshotForFrame(dirtyFrame, incomingSnapshot);
        saveSnapshotForFrame(dirtyFrame, incomingSnapshot, { silent: true });
      }

      clearTimeout(CHART_DIRTY_TIMERS.get(dirtyFrame));
      var wait = reason.indexOf("interval") >= 0 || reason.indexOf("restored") >= 0 ? 1400 : (reason === "data-loaded" ? 1300 : 620);
      var timer = setTimeout(function () {
        requestFrameSnapshot(dirtyFrame, 1700, { noThumbnail: true }).then(function (snapshot) {
          if (!snapshot) return;
          snapshot = protectFrameDrawings(dirtyFrame, snapshot, reason || "dirty-timer");
          writeSnapshotForFrame(dirtyFrame, snapshot);
          saveSnapshotForFrame(dirtyFrame, snapshot, { silent: true });
          if (intervalDirtyReason(reason)) {
            setTimeout(function () { FRAME_INTERVAL_SWITCHING_UNTIL.set(dirtyFrame, 0); }, 1200);
          }
        });
      }, wait);
      CHART_DIRTY_TIMERS.set(dirtyFrame, timer);
      return;
    }

    if (data.type !== "bitgak:insight-snapshot-response") return;
    var requestId = data.requestId;
    if (requestId && SNAPSHOT_REQUESTS[requestId]) SNAPSHOT_REQUESTS[requestId](data.snapshot || null);
  });

  function normalizeSearchResults(data) {
    var raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data.results)) raw = data.results;
    else if (Array.isArray(data.items)) raw = data.items;
    else if (Array.isArray(data.stocks)) raw = data.stocks;
    else if (Array.isArray(data.data)) raw = data.data;
    else if (data && typeof data === "object") {
      Object.keys(data).forEach(function (key) {
        if (Array.isArray(data[key]) && !raw.length) raw = data[key];
      });
    }

    var seen = {};
    return raw.map(function (item) {
      item = item || {};
      if (typeof item === "string") {
        var codeMatch = item.match(/\b\d{5,6}\b/);
        return { code: codeMatch ? codeMatch[0] : "", name: item.replace(/\b\d{5,6}\b/g, "").trim(), market: "KRX" };
      }
      var code = item.code || item.symbol || item.stock_code || item.ticker || item.value || item.id || "";
      var name = item.name || item.stock_name || item.label || item.text || item.title || item.company_name || code;
      var market = item.market || item.market_name || item.exchange || item.type || "KRX";
      if (String(name || "").indexOf(" · ") > -1 && !onlyCode(code)) {
        var parts = String(name).split(" · ");
        name = parts[0].trim();
        code = onlyCode(parts[1] || "");
      }
      return { code: onlyCode(code), name: String(name || "").trim(), market: String(market || "KRX").trim() || "KRX" };
    }).filter(function (item) {
      if (!item.code || seen[item.code]) return false;
      seen[item.code] = true;
      return true;
    });
  }

  function normalizeSearchHtmlResults(html, query) {
    var q = compactStockText(query);
    var seen = {};
    var results = [];
    if (!html) return results;

    var doc = document.implementation.createHTMLDocument("stock-search");
    doc.body.innerHTML = String(html || "");

    function push(code, name, market) {
      code = onlyCode(code);
      name = String(name || code || "").replace(/\s+/g, " ").trim();
      market = String(market || "KRX").replace(/\s+/g, " ").trim() || "KRX";
      if (!code || seen[code]) return;
      var compactName = compactStockText(name);
      if (q && compactName && compactName.indexOf(q) === -1 && q.indexOf(compactName) === -1 && code.indexOf(onlyCode(query)) === -1) {
        // HTML 전체에서 엉뚱한 인기종목이 같이 섞일 수 있어서 검색어와 무관한 항목은 제외한다.
        return;
      }
      seen[code] = true;
      results.push({ code: code, name: name || code, market: market });
    }

    Array.from(doc.querySelectorAll("[data-code], [data-stock-code], [data-symbol]")).forEach(function (el) {
      var code = el.getAttribute("data-code") || el.getAttribute("data-stock-code") || el.getAttribute("data-symbol") || "";
      var name = el.getAttribute("data-name") || el.getAttribute("data-stock-name") || "";
      var market = el.getAttribute("data-market") || "KRX";
      if (!name) {
        var strong = el.querySelector("strong, .name, .stock-name, [data-name]");
        name = strong ? strong.textContent : el.textContent;
      }
      push(code, name, market);
    });

    Array.from(doc.querySelectorAll("a[href], button, li, tr")).forEach(function (el) {
      var href = el.getAttribute ? (el.getAttribute("href") || "") : "";
      var codeMatch = href.match(/\/stocks\/(\d{5,6})\//) || String(el.textContent || "").match(/\b(\d{5,6})\b/);
      if (!codeMatch) return;
      var code = codeMatch[1];
      var text = String(el.textContent || "").replace(/\s+/g, " ").trim();
      var marketMatch = text.match(/\b(KOSPI|KOSDAQ|KONEX|KRX)\b/i);
      var market = marketMatch ? marketMatch[1].toUpperCase() : "KRX";
      var name = text
        .replace(code, " ")
        .replace(/\b(KOSPI|KOSDAQ|KONEX|KRX)\b/ig, " ")
        .replace(/[·|\-:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!name) name = code;
      push(code, name, market);
    });

    return results;
  }

  function mergeStockResults() {
    var seen = {};
    var merged = [];
    Array.prototype.slice.call(arguments).forEach(function (list) {
      (list || []).forEach(function (item) {
        if (!item || !item.code || seen[item.code]) return;
        seen[item.code] = true;
        merged.push({ code: onlyCode(item.code), name: String(item.name || item.code).trim(), market: item.market || "KRX" });
      });
    });
    return merged;
  }

  async function fetchOneStockSearchUrl(url, query) {
    try {
      var res = await fetch(url, {
        headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/html;q=0.9, */*;q=0.8" },
        cache: "no-store"
      });
      if (!res.ok) return [];
      var text = await res.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      if (parsed) return normalizeSearchResults(parsed);
      return normalizeSearchHtmlResults(text, query);
    } catch (e) {
      return [];
    }
  }

  async function fetchFastStockSearch(query, form) {
    var q = String(query || "").trim();
    if (!q) return [];

    var cacheKey = compactStockText(q);
    if (STOCK_SEARCH_CACHE.has(cacheKey)) return STOCK_SEARCH_CACHE.get(cacheKey).slice();

    var local = localStockMatches(q);
    var endpoint = getStockSearchApiUrl(form);

    try { if (STOCK_SEARCH_ABORT) STOCK_SEARCH_ABORT.abort(); } catch (e) {}
    STOCK_SEARCH_ABORT = window.AbortController ? new AbortController() : null;

    try {
      var url = new URL(endpoint, window.location.origin || window.location.href);
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "40");
      var res = await fetch(url.toString(), {
        headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" },
        cache: "no-store",
        signal: STOCK_SEARCH_ABORT ? STOCK_SEARCH_ABORT.signal : undefined
      });
      if (!res.ok) throw new Error("search failed");
      var data = await res.json();
      var remote = normalizeSearchResults(data);
      var merged = mergeStockResults(remote, local).slice(0, 40);
      STOCK_SEARCH_CACHE.set(cacheKey, merged);
      return merged.slice();
    } catch (e) {
      if (e && e.name === "AbortError") return [];
      if (/^\d{5,6}$/.test(q)) {
        var exactLocal = firstLocalStock(q);
        return mergeStockResults(exactLocal ? [exactLocal] : [], [{ code: q, name: q, market: "KRX" }], local).slice(0, 40);
      }
      // API 라우팅이 아직 연결되지 않은 로컬 환경에서만 기존 stock 검색 페이지를 1회 fallback으로 사용한다.
      var fallback = await fetchOneStockSearchUrl("/stocks/search/?q=" + encodeURIComponent(q) + "&format=json&lite=1", q);
      return mergeStockResults(fallback, local).slice(0, 40);
    }
  }

  async function fetchStockSearchResults(query, form) {
    return fetchFastStockSearch(query, form);
  }


  async function resolveStockFromQuery(query, form) {
    var q = String(query || "").trim();
    if (!q) return null;
    var local = firstLocalStock(q);
    if (local) return local;
    var items = await fetchStockSearchResults(q, form);
    return items.length ? items[0] : null;
  }

  function initStockSearch(form, applyStock) {
    var input = qs(form, "[data-chart-symbol-search]");
    var panel = qs(form, "[data-chart-search-results]");
    if (!input || !panel) return;
    var timer = null;

    function closePanel() {
      panel.hidden = true;
      panel.innerHTML = "";
    }

    function render(items) {
      if (!items.length) {
        closePanel();
        return;
      }
      panel.innerHTML = items.map(function (item) {
        return '<button type="button" class="insight-chart-search-result" data-code="' + escapeAttr(item.code) + '" data-name="' + escapeAttr(item.name || item.code) + '"><strong>' + escapeHtml(item.name || item.code) + '</strong><span>' + escapeHtml(item.code) + ' · ' + escapeHtml(item.market || "KRX") + '</span></button>';
      }).join("");
      panel.hidden = false;
    }

    async function search() {
      var q = (input.value || "").trim();
      if (q.length < 1) {
        closePanel();
        return;
      }
      var items = await fetchStockSearchResults(q, form);
      render(items);
    }

    input.addEventListener("input", function () {
      // 타이핑 도중 입력값을 종목명으로 강제로 바꾸지 않는다.
      // 검색 결과를 클릭하거나 Enter/차트 열기를 눌렀을 때만 선택값을 확정한다.
      input.dataset.selectedCode = "";
      input.dataset.selectedName = "";
      var ownerForm = input.closest("form");
      if (ownerForm) {
        var hiddenCode = ownerForm.querySelector("[data-insight-chart-code-input]");
        var hiddenName = ownerForm.querySelector("[data-insight-chart-name-input]");
        if (hiddenCode) hiddenCode.value = "";
        if (hiddenName) hiddenName.value = "";
      }
      clearTimeout(timer);
      timer = setTimeout(search, 80);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      resolveStockFromQuery(input.value, form).then(function (item) {
        if (!item) return;
        applyStock(item.code, item.name, true, true);
        closePanel();
      });
    });

    panel.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-code]");
      if (!btn) return;
      applyStock(btn.dataset.code || "", btn.dataset.name || btn.dataset.code || "", true, true);
      closePanel();
    });

    document.addEventListener("click", function (event) {
      if (!event.target.closest("[data-chart-symbol-search]") && !event.target.closest("[data-chart-search-results]")) closePanel();
    });
  }

  function makeFallbackSnapshot(form) {
    var searchInput = qs(form, "[data-chart-symbol-search]");
    var codeInput = qs(form, "[data-insight-chart-code-input]");
    var nameInput = qs(form, "[data-insight-chart-name-input]");
    var intervalSelect = qs(form, "[data-chart-interval-select]");
    var query = searchInput ? searchInput.value.trim() : "";
    var selectedCode = searchInput ? searchInput.dataset.selectedCode : "";
    var selectedName = searchInput ? searchInput.dataset.selectedName : "";
    var local = firstLocalStock(query);
    var code = onlyCode((codeInput && codeInput.value) || selectedCode || (local && local.code) || (/^\d{5,6}$/.test(query) ? query : ""));
    var name = (nameInput && nameInput.value) || selectedName || (local && local.name) || query || code;
    var interval = intervalSelect ? intervalSelect.value : "1d";
    return {
      version: 2,
      source: "bitgakview-insight-fallback",
      code: code,
      name: name,
      interval: interval || "1d",
      chartUrl: code ? ("/stocks/" + encodeURIComponent(code) + "/?insight_viewer=1&interval=" + encodeURIComponent(interval || "1d")) : "",
      capturedAt: new Date().toISOString(),
      visibleLogicalRange: null,
      drawings: []
    };
  }

  function initMediaEditor(form) {
    if (!form || form.dataset.mediaEditorReady === "1") return;
    form.dataset.mediaEditorReady = "1";

    var mediaInput = qs(form, "[data-insight-media-type]");
    var codeInput = qs(form, "[data-insight-chart-code-input]");
    var nameInput = qs(form, "[data-insight-chart-name-input]");
    var intervalInput = qs(form, "[data-insight-chart-interval-input]");
    var apiInput = qs(form, "[data-insight-chart-api-url-input]");
    var snapshotInput = qs(form, "[data-insight-chart-snapshot-input]");
    var searchInput = qs(form, "[data-chart-symbol-search]");
    var intervalSelect = qs(form, "[data-chart-interval-select]");
    var frame = qs(form, "[data-insight-stock-frame]");
    var frameEmpty = qs(form, "[data-insight-stock-frame-empty]");
    var frameTitle = qs(form, "[data-insight-frame-title]");
    var refreshBtn = qs(form, "[data-chart-refresh]");
    var reloadBtn = qs(form, "[data-chart-frame-reload]");
    var captureBtn = qs(form, "[data-chart-capture-now]");
    var saveState = qs(form, "[data-chart-save-state]");
    var activeMode = mediaInput ? (mediaInput.value || "image") : "image";
    var frameLoaded = false;
    var serverDraftLoaded = false;

    function applyServerDraftToForm(draft) {
      if (!draft) return null;
      var payload = normalizeDraftPayload(draft);
      var snapshot = safeJsonParse(payload.chart_snapshot, null);
      if (!snapshot && payload.chart_snapshot) snapshot = parseSnapshot({ value: payload.chart_snapshot });
      if (payload.chart_code && codeInput) codeInput.value = payload.chart_code;
      if (payload.chart_name && nameInput) nameInput.value = payload.chart_name;
      if (payload.chart_interval && intervalInput) intervalInput.value = payload.chart_interval;
      if (payload.chart_interval && intervalSelect) intervalSelect.value = payload.chart_interval;
      if (snapshotInput && payload.chart_snapshot) snapshotInput.value = payload.chart_snapshot;
      if (searchInput && (payload.chart_name || payload.chart_code)) {
        searchInput.value = payload.chart_name || payload.chart_code;
        searchInput.dataset.selectedCode = payload.chart_code || "";
        searchInput.dataset.selectedName = payload.chart_name || "";
      }
      return snapshot;
    }

    function loadServerDraftOnce() {
      if (serverDraftLoaded) return Promise.resolve(null);
      serverDraftLoaded = true;
      var url = getChartDraftApiUrl(form);
      if (!url) return Promise.resolve(null);
      return jsonFetch(url, { method: "GET" }).then(function (data) {
        if (!data || !data.ok || !data.has_draft) return null;
        return applyServerDraftToForm(data.draft || data);
      }).catch(function () { return null; });
    }

    function setState(text, mode) {
      if (!saveState) return;
      saveState.textContent = text || "";
      saveState.classList.remove("ok", "warn", "danger", "pulse");
      if (mode) saveState.classList.add(mode);
      if (mode === "ok" || mode === "warn") {
        saveState.classList.add("pulse");
        setTimeout(function () { saveState.classList.remove("pulse"); }, 900);
      }
    }

    function getSearchValue() {
      return searchInput ? String(searchInput.value || "").trim() : "";
    }

    function isSearchDirty() {
      if (!searchInput) return false;
      var query = getSearchValue();
      if (!query) return false;
      var selectedCode = String(searchInput.dataset.selectedCode || "").trim();
      var selectedName = String(searchInput.dataset.selectedName || "").trim();
      return query !== selectedCode && query !== selectedName;
    }

    function currentCode() {
      var query = getSearchValue();
      var local = firstLocalStock(query);
      if (isSearchDirty()) {
        return onlyCode((local && local.code) || (/^\d{5,6}$/.test(query) ? query : ""));
      }
      return onlyCode((searchInput && searchInput.dataset.selectedCode) || (codeInput && codeInput.value) || (local && local.code) || (/^\d{5,6}$/.test(query) ? query : ""));
    }

    function currentName() {
      var query = getSearchValue();
      var local = firstLocalStock(query);
      if (isSearchDirty()) {
        return String((local && local.name) || query || currentCode() || "").trim();
      }
      return String((searchInput && searchInput.dataset.selectedName) || (nameInput && nameInput.value) || (local && local.name) || query || currentCode() || "").trim();
    }

    function setMode(mode) {
      activeMode = mode === "chart" ? "chart" : "image";
      if (mediaInput) mediaInput.value = activeMode;
      qsa(form, "[data-media-mode]").forEach(function (btn) {
        var isActive = btn.dataset.mediaMode === activeMode;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      qsa(form, "[data-media-panel]").forEach(function (panel) {
        setHidden(panel, panel.dataset.mediaPanel !== activeMode);
        panel.classList.toggle("active", panel.dataset.mediaPanel === activeMode);
      });
      if (activeMode === "chart") maybeLoadInitialFrame();
    }

    function syncHidden(snapshot) {
      var fallback = makeFallbackSnapshot(form);
      var finalSnapshot = snapshot && typeof snapshot === "object" ? snapshot : fallback;
      var code = onlyCode(finalSnapshot.code || currentCode() || "");
      var name = finalSnapshot.name || currentName() || code;
      var interval = finalSnapshot.interval || (intervalSelect && intervalSelect.value) || "1d";

      if (codeInput) codeInput.value = code;
      if (nameInput) nameInput.value = name;
      if (intervalInput) intervalInput.value = interval;
      if (apiInput) apiInput.value = finalSnapshot.apiUrl || "";
      if (searchInput) {
        searchInput.dataset.selectedCode = code;
        searchInput.dataset.selectedName = name;
      }
      if (snapshotInput) snapshotInput.value = toJson(stripInsightViewportOnly(Object.assign({}, finalSnapshot, { code: code, name: name, interval: interval }), "sync-hidden-v9"));
      saveChartDefaults(code, name, interval);
      setText(frameTitle, name ? name + " · " + code : (code || "차트 미선택"));
      setState("차트상태 저장됨", "ok");
    }

    function applyStock(code, name, shouldLoad, fromSearch) {
      code = onlyCode(code || currentCode() || "");
      name = String(name || currentName() || code || "").trim();
      if (codeInput) codeInput.value = code;
      if (nameInput) nameInput.value = name;
      if (intervalInput && intervalSelect) intervalInput.value = intervalSelect.value;
      if (searchInput) {
        searchInput.dataset.selectedCode = code;
        searchInput.dataset.selectedName = name;
        if (fromSearch || !searchInput.value || /^\d{5,6}$/.test(searchInput.value.trim())) searchInput.value = name || code;
      }
      setText(frameTitle, name ? name + " · " + code : (code || "차트 미선택"));
      if (shouldLoad) {
        var previousSnapshot = parseSnapshot(snapshotInput);
        var snapshotForThisStock = snapshotMatchesStock(previousSnapshot, code) ? previousSnapshot : null;
        loadFrame(code, name, intervalSelect ? intervalSelect.value : "1d", snapshotForThisStock);
      }
    }

    async function resolveCurrentStock() {
      var query = getSearchValue();
      if (isSearchDirty() && query) {
        var searched = await resolveStockFromQuery(query, form);
        if (searched) {
          applyStock(searched.code, searched.name, false, true);
          return searched;
        }
      }

      var code = currentCode();
      var name = currentName();
      if (code) {
        applyStock(code, name || code, false, false);
        return { code: code, name: name || code, market: "KRX" };
      }

      var item = await resolveStockFromQuery(query, form);
      if (item) {
        applyStock(item.code, item.name, false, true);
        return item;
      }
      return null;
    }

    function loadFrame(code, name, interval, snapshot) {
      code = onlyCode(code || currentCode() || "");
      name = String(name || currentName() || code || "").trim();
      interval = interval || (intervalSelect ? intervalSelect.value : "1d");
      if (!code || !frame) {
        setState("종목을 먼저 검색하세요", "warn");
        if (frameEmpty) {
          frameEmpty.innerHTML = "차트 대기 중<small>왼쪽 검색창에 삼성전자처럼 종목명을 입력하고 차트 열기를 누르세요.</small>";
          setHidden(frameEmpty, false);
        }
        return;
      }
      var previousFrameCode = onlyCode(frame.dataset.currentCode || "");
      var snapshotForLoadedStock = snapshotMatchesStock(snapshot, code) ? Object.assign({}, snapshot, { interval: interval }) : null;
      if (!snapshotForLoadedStock && previousFrameCode && previousFrameCode !== code && snapshotInput) {
        snapshotInput.value = toJson(cleanSnapshotForStock(code, name, interval));
      }
      if (!snapshotForLoadedStock && snapshotInput && snapshotCode(parseSnapshot(snapshotInput)) && snapshotCode(parseSnapshot(snapshotInput)) !== code) {
        snapshotInput.value = toJson(cleanSnapshotForStock(code, name, interval));
      }
      applyStock(code, name, false, true);
      frameLoaded = false;
      frame.dataset.currentCode = code;
      frame.dataset.currentInterval = interval;
      frame.dataset.currentName = name;
      setHidden(frameEmpty, true);
      setState("차트 불러오는 중", "warn");
      saveChartDefaults(code, name, interval);

      frame.onload = function () {
        frameLoaded = true;
        setState("차트 편집 가능", "ok");
        var storedSnapshot = parseSnapshot(snapshotInput);
        var snap = snapshotForLoadedStock || (snapshotMatchesStock(storedSnapshot, code) ? storedSnapshot : null);
        if (snap && (snap.drawings || snap.visibleLogicalRange || snap.interval || snap.indicators)) {
          [320, 950].forEach(function (delay) {
            setTimeout(function () {
              if (frame.dataset.userChanged === "1") return;
              postSnapshotToFrame(frame, snap);
            }, delay);
          });
        } else if (interval && interval !== "1d") {
          setTimeout(function () { postSnapshotToFrame(frame, { code: code, name: name, interval: interval, drawings: [], indicators: [] }); }, 320);
        } else {
          setTimeout(function () { postSnapshotToFrame(frame, { code: code, name: name, interval: interval || "1d", drawings: [], indicators: [] }); }, 320);
        }
      };
      // /stocks/ 페이지를 iframe으로 직접 열면 X-Frame-Options 때문에 차단될 수 있다.
      // 그래서 같은 stock 차트 DOM과 스크립트를 srcdoc 안에 구성해서 본문 위에서 그대로 실행한다.
      frame.removeAttribute("src");
      frame.srcdoc = buildStockFrameSrcdoc(frame, code, name, interval, "editor");
    }

    async function maybeLoadInitialFrame() {
      if (!frame || frame.dataset.currentCode || frame.srcdoc) return;
      var serverSnapshot = await loadServerDraftOnce();
      var snapshot = serverSnapshot || parseSnapshot(snapshotInput);
      var defaults = readChartDefaults();
      var code = onlyCode((snapshot && snapshot.code) || (codeInput && codeInput.value) || (searchInput && searchInput.dataset.selectedCode) || defaults.code || "");
      var name = (snapshot && snapshot.name) || (nameInput && nameInput.value) || (searchInput && (searchInput.dataset.selectedName || searchInput.value)) || defaults.name || code;
      var interval = (intervalSelect && intervalSelect.value) || (snapshot && snapshot.interval) || defaults.interval || "1d";
      if (searchInput && !searchInput.value && name) searchInput.value = name;
      if (intervalSelect && interval) intervalSelect.value = interval;
      if (code) loadFrame(code, name, interval, snapshotMatchesStock(snapshot, code) ? snapshot : null);
    }

    async function captureAndStore(showMessage) {
      if (activeMode !== "chart") return null;
      if (showMessage) setState("차트상태 저장 중", "warn");
      if (!currentCode()) await resolveCurrentStock();
      var snapshot = frameLoaded ? await requestFrameSnapshot(frame, 2200, { noThumbnail: false }) : null;
      if (!snapshot) snapshot = makeFallbackSnapshot(form);
      syncHidden(snapshot);
      applyChartCaptureToCover(form, snapshot);
      await saveChartDraftToServerForForm(form, snapshot, { silent: !showMessage });
      return snapshot;
    }

    async function openCurrentChart(snapshot) {
      setState("종목 검색 중", "warn");
      var item = await resolveCurrentStock();
      if (!item || !item.code) {
        setState("검색 결과 없음", "danger");
        if (frameEmpty) {
          frameEmpty.innerHTML = "검색 결과 없음<small>종목명을 다시 입력해 주세요. 예: 삼성전자</small>";
          setHidden(frameEmpty, false);
        }
        return;
      }
      var candidateSnapshot = snapshot || parseSnapshot(snapshotInput);
      loadFrame(item.code, item.name, intervalSelect ? intervalSelect.value : "1d", snapshotMatchesStock(candidateSnapshot, item.code) ? candidateSnapshot : null);
    }

    qsa(form, "[data-media-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () { setMode(btn.dataset.mediaMode || "image"); });
    });

    if (refreshBtn) refreshBtn.addEventListener("click", function () {
      var snap = parseSnapshot(snapshotInput);
      openCurrentChart(snapshotMatchesStock(snap, currentCode()) ? snap : null);
    });
    if (reloadBtn) reloadBtn.addEventListener("click", function () {
      var snap = parseSnapshot(snapshotInput);
      openCurrentChart(snapshotMatchesStock(snap, currentCode()) ? snap : null);
    });
    if (captureBtn) captureBtn.addEventListener("click", function () { captureAndStore(true); });

    if (intervalSelect) intervalSelect.addEventListener("change", function () {
      var nextInterval = normalizeIntervalForEmbed(intervalSelect.value || "1d");
      if (intervalInput) intervalInput.value = nextInterval;
      if (!frame || !currentCode()) return;

      if (frameLoaded && frame.contentWindow) {
        setState("차트 기간 변경 중", "warn");
        try {
          frame.contentWindow.postMessage({ type: "bitgak:switch-insight-interval", interval: nextInterval }, "*");
          return;
        } catch (e) {}
      }

      var snap = parseSnapshot(snapshotInput);
      if (snapshotMatchesStock(snap, currentCode())) snap = Object.assign({}, snap, { interval: nextInterval });
      loadFrame(currentCode(), currentName(), nextInterval, snapshotMatchesStock(snap, currentCode()) ? snap : null);
    });

    initStockSearch(form, applyStock);

    form.addEventListener("submit", function (event) {
      if (form.dataset.chartSubmitReady === "1") return;
      if ((mediaInput ? mediaInput.value : activeMode) !== "chart") return;
      event.preventDefault();
      captureAndStore(true).then(function () {
        form.dataset.chartSubmitReady = "1";
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      });
    });

    setMode(activeMode);
  }

  function initChartPlayers() {
    qsa(document, "[data-insight-chart-player]").forEach(function (root) {
      if (root.dataset.playerReady === "1") return;
      root.dataset.playerReady = "1";
      var frame = qs(root, "[data-insight-stock-player-frame]");
      var empty = qs(root, "[data-insight-stock-frame-empty]");
      var snapshotInput = qs(root, "[data-chart-snapshot-json]");
      var snapshot = parseSnapshot(snapshotInput);
      var code = onlyCode((snapshot && snapshot.code) || root.dataset.chartCode || "");
      var interval = (snapshot && snapshot.interval) || root.dataset.chartInterval || "1d";
      if (!frame || !code) {
        if (empty) {
          empty.innerHTML = "차트 없음<small>저장된 종목코드를 찾지 못했습니다.</small>";
          setHidden(empty, false);
        }
        return;
      }
      frame.onload = function () {
        setHidden(empty, true);
        frame.dataset.userChanged = "";
        if (snapshot) {
          [320, 950, 1600].forEach(function (delay) {
            setTimeout(function () {
              // 사용자가 하이드/삭제/수정한 뒤에는 초기 서버 스냅샷을 다시 덮어쓰지 않는다.
              if (frame.dataset.userChanged === "1") return;
              postSnapshotToFrame(frame, snapshot);
            }, delay);
          });
        }
      };
      frame.removeAttribute("src");
      frame.srcdoc = buildStockFrameSrcdoc(frame, code, (snapshot && snapshot.name) || root.dataset.chartName || code, interval, "viewer");
    });
  }

  function initCardsClick() {
    qsa(document, "[data-insight-card]").forEach(function (card) {
      if (card.dataset.cardReady === "1") return;
      card.dataset.cardReady = "1";
      card.addEventListener("click", function (event) {
        if (event.target.closest("a, button")) return;
        var url = card.dataset.cardUrl;
        if (url) window.location.href = url;
      });
    });
  }

  function init() {
    qsa(document, "[data-insight-carousel]").forEach(initCarousel);
    initListFilter();
    initCardsClick();
    qsa(document, "[data-insight-image-editor]").forEach(initImageEditor);
    qsa(document, "[data-insight-media-editor]").forEach(initMediaEditor);
    initChartPlayers();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
