(function () {
  var allRows = [];
  var currentRows = [];
  var currentSortKey = "opportunity";
  var currentSortDirection = "desc";

  function readPageAccess() {
    var fallback = {
      is_authenticated: false,
      is_premium: false,
      daily_limit: 3,
      used_today: 0,
      remaining_today: 0,
      can_search: false,
      pricing_url: "/stocks/pricing/"
    };

    var script = document.getElementById("ytkAccessData");
    if (script) {
      try {
        return Object.assign({}, fallback, JSON.parse(script.textContent || "{}"));
      } catch (e) {}
    }

    var globalAccess = window.BITGAK_ACCESS || {};
    return Object.assign({}, fallback, {
      is_authenticated: !!globalAccess.is_authenticated,
      is_premium: !!globalAccess.is_premium,
      can_search: !!globalAccess.is_premium,
      pricing_url: "/stocks/pricing/"
    });
  }

  function openYtkAccess(kind, options) {
    options = options || {};

    if (window.BitgakAccessLock && typeof window.BitgakAccessLock.open === "function") {
      window.BitgakAccessLock.open(kind, options);
      return;
    }

    // bitgak_access_guard.js가 로드되지 않은 상황에서도 페이지가 깨지지 않도록 안전 fallback만 둔다.
    if (kind === "login") {
      alert(options.message || "로그인 후 사용할 수 있습니다.");
      var next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = options.href || ("/accounts/login/?next=" + next);
      return;
    }

    alert(options.message || "프리미엄 전용 또는 무료 사용량 제한 기능입니다.");
    if (options.href) {
      window.location.href = options.href;
    }
  }

  function initSearchAccessGuard() {
    var form = document.getElementById("ytkKeywordSearchForm");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      var access = readPageAccess();

      if (!access.is_authenticated) {
        event.preventDefault();
        openYtkAccess("login", {
          badge: "무료 회원",
          icon: "🔐",
          title: "로그인 후 사용할 수 있습니다",
          message: "유튜브 키워드 분석기는 로그인 후 사용할 수 있습니다. 무료 회원은 하루 3회까지 검색할 수 있습니다.",
          primaryText: "무료 로그인",
          points: ["유튜브 키워드 검색 가능", "무료 회원 하루 3회", "엑셀 다운로드는 로그인 필요", "프리미엄은 무제한 검색"]
        });
        return false;
      }

      if (!access.is_premium && Number(access.remaining_today || 0) <= 0) {
        event.preventDefault();
        openYtkAccess("premium", {
          badge: "프리미엄",
          icon: "✨",
          title: "오늘 무료 검색 3회를 모두 사용했습니다",
          message: "프리미엄으로 전환하면 유튜브 키워드 분석, 제목 아이디어, 태그, 엑셀 다운로드를 제한 없이 사용할 수 있습니다.",
          primaryText: "프리미엄 보기",
          href: access.pricing_url || "/stocks/pricing/",
          points: ["키워드 무제한 검색", "제목·태그 아이디어", "엑셀 다운로드", "구독대비조회수 분석"]
        });
        return false;
      }
    });
  }

  function initExcelAccessGuard() {
    var excel = document.getElementById("ytkExcelDownloadBtn");
    if (!excel) return;

    excel.addEventListener("click", function (event) {
      var access = readPageAccess();
      if (!access.is_authenticated) {
        event.preventDefault();
        openYtkAccess("login", {
          badge: "무료 회원",
          icon: "🔐",
          title: "로그인 후 다운로드할 수 있습니다",
          message: "엑셀 다운로드는 로그인 후 사용할 수 있습니다. 무료 회원은 하루 3회 검색 결과를 다운로드할 수 있습니다.",
          primaryText: "무료 로그인",
          points: ["검색 결과 엑셀 저장", "후킹형·검색형·분석형 탭", "태그 탭 분리", "프리미엄은 무제한 다운로드"]
        });
      }
    });
  }

  function closeAllSelects(except) {
    document.querySelectorAll("[data-ytk-select]").forEach(function (select) {
      if (select !== except) {
        select.classList.remove("open");
        var btn = select.querySelector(".ytk-select-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initCustomSelects() {
    document.querySelectorAll("[data-ytk-select]").forEach(function (select) {
      var input = select.querySelector("input[type='hidden']");
      var button = select.querySelector(".ytk-select-btn");
      var label = button ? button.querySelector("span") : null;
      var options = select.querySelectorAll(".ytk-select-menu button");

      if (!input || !button || !label) return;

      button.addEventListener("click", function (event) {
        event.stopPropagation();
        var willOpen = !select.classList.contains("open");
        closeAllSelects(select);
        select.classList.toggle("open", willOpen);
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      options.forEach(function (option) {
        option.addEventListener("click", function () {
          var value = option.getAttribute("data-value") || "";
          var text = option.getAttribute("data-label") || option.textContent.trim();
          input.value = value;
          label.textContent = text;
          options.forEach(function (item) { item.classList.remove("selected"); });
          option.classList.add("selected");
          select.classList.remove("open");
          button.setAttribute("aria-expanded", "false");
        });
      });
    });

    document.addEventListener("click", function () {
      closeAllSelects(null);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAllSelects(null);
    });
  }

  function copyTextById(targetId, button) {
    var target = document.getElementById(targetId);
    if (!target) return;

    var text = target.value || target.textContent || "";
    text = text.trim();
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showCopied(button);
      }).catch(function () {
        fallbackCopy(target, button);
      });
    } else {
      fallbackCopy(target, button);
    }
  }

  function fallbackCopy(target, button) {
    target.style.position = "fixed";
    target.style.left = "0";
    target.style.top = "0";
    target.style.opacity = "0";
    target.focus();
    target.select();

    try {
      document.execCommand("copy");
      showCopied(button);
    } catch (e) {
      alert("복사에 실패했습니다. 직접 선택해서 복사해주세요.");
    }

    target.style.position = "fixed";
    target.style.left = "-9999px";
    target.style.top = "-9999px";
  }

  function showCopied(button) {
    if (!button) return;

    var oldText = button.textContent;
    button.textContent = "복사완료";
    button.disabled = true;

    setTimeout(function () {
      button.textContent = oldText;
      button.disabled = false;
    }, 1100);
  }

  function readRowsData() {
    var script = document.getElementById("ytkRowsData");
    if (!script) return [];

    try {
      var rows = JSON.parse(script.textContent || "[]");
      rows.forEach(function (row, index) {
        row.__originalIndex = index;
      });
      return rows;
    } catch (e) {
      return [];
    }
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberValue(row, key) {
    var value = Number(row[key]);
    return Number.isFinite(value) ? value : 0;
  }

  function defaultDirectionFor(key) {
    return key === "competition" ? "asc" : "desc";
  }

  function sortRows(key, direction) {
    currentSortKey = key;
    currentSortDirection = direction;

    currentRows = allRows.slice().sort(function (a, b) {
      var av = numberValue(a, key);
      var bv = numberValue(b, key);

      if (av === bv) {
        var ao = numberValue(a, "opportunity");
        var bo = numberValue(b, "opportunity");
        if (ao !== bo) return bo - ao;
        var as = numberValue(a, "view_velocity_score");
        var bs = numberValue(b, "view_velocity_score");
        if (as !== bs) return bs - as;
        var ad = numberValue(a, "demand");
        var bd = numberValue(b, "demand");
        if (ad !== bd) return bd - ad;
        return String(a.keyword || "").localeCompare(String(b.keyword || ""), "ko");
      }

      return direction === "asc" ? av - bv : bv - av;
    });
  }

  function updateExcelDownloadLink() {
    var link = document.getElementById("ytkExcelDownloadBtn");
    if (!link) return;

    var baseUrl = link.getAttribute("data-base-url") || link.getAttribute("href").split("?")[0];
    var params = new URLSearchParams();
    params.set("keyword", link.getAttribute("data-keyword") || "");
    params.set("search_type", link.getAttribute("data-search-type") || "shorts");
    params.set("category", link.getAttribute("data-category") || "stock");
    params.set("sort_key", currentSortKey || "opportunity");
    params.set("sort_dir", currentSortDirection || "desc");
    link.setAttribute("href", baseUrl + "?" + params.toString());
  }

  function updateSortButtons() {
    document.querySelectorAll(".ytk-sort-btn").forEach(function (button) {
      var key = button.getAttribute("data-sort-key");
      var active = key === currentSortKey;
      button.classList.toggle("active", active);
      button.classList.toggle("asc", active && currentSortDirection === "asc");
      button.classList.toggle("desc", active && currentSortDirection === "desc");
      if (active) {
        button.setAttribute("aria-sort", currentSortDirection === "asc" ? "ascending" : "descending");
      } else {
        button.removeAttribute("aria-sort");
        button.classList.remove("asc");
        button.classList.remove("desc");
      }
    });
  }

  function speedClass(row) {
    return "speed-" + (row.view_velocity_rank || 1);
  }

  function renderRows(selectedOriginalIndex) {
    var tbody = document.getElementById("ytkKeywordTbody");
    if (!tbody || !currentRows.length) return;

    if (selectedOriginalIndex === undefined || selectedOriginalIndex === null) {
      selectedOriginalIndex = currentRows[0].__originalIndex;
    }

    var html = "";
    currentRows.forEach(function (row) {
      var active = Number(row.__originalIndex) === Number(selectedOriginalIndex);
      html += '<tr class="ytk-keyword-row' + (active ? ' active' : '') + '" data-original-index="' + row.__originalIndex + '">';
      html += '<td class="ytk-keyword-cell"><strong>' + escapeHtml(row.keyword) + '</strong><span>조회속도 ' + escapeHtml(row.view_velocity_label) + ' · 수요 ' + escapeHtml(row.demand) + '</span></td>';
      html += '<td>' + escapeHtml(row.estimated_views_display) + '</td>';
      html += '<td>' + escapeHtml(row.top_avg_views_display) + '</td>';
      html += '<td>' + escapeHtml(row.recent_videos) + '개</td>';
      html += '<td><span class="ytk-speed-pill ' + speedClass(row) + '">' + escapeHtml(row.view_velocity_label) + '</span></td>';
      html += '<td>' + escapeHtml(row.subscriber_view_ratio_display || "-") + '</td>';
      html += '<td><span class="ytk-algorithm-pill signal-' + escapeHtml(row.algorithm_signal_rank || 1) + '">' + escapeHtml(row.algorithm_signal_label || "-") + '</span></td>';
      html += '<td>' + escapeHtml(row.demand) + '</td>';
      html += '<td>' + escapeHtml(row.competition) + '</td>';
      html += '<td><strong>' + escapeHtml(row.opportunity) + '</strong></td>';
      html += '</tr>';
    });

    tbody.innerHTML = html;
    bindRowClicks();
    updateKeywordCopyText();
  }

  function updateKeywordCopyText() {
    var copy = document.getElementById("keywordTableText");
    if (!copy) return;

    copy.value = currentRows.map(function (row) {
      return [
        row.keyword,
        "예상조회 " + row.estimated_views_display,
        "조회속도 " + row.view_velocity_label,
        "구독대비조회수 " + (row.subscriber_view_ratio_display || "-"),
        "알고리즘 " + (row.algorithm_signal_label || "-"),
        "수요 " + row.demand,
        "경쟁 " + row.competition,
        "기회 " + row.opportunity
      ].join(" | ");
    }).join("\n");
  }

  function renderTitleGroups(row) {
    var wrap = document.getElementById("ytkTitleGroups");
    var copy = document.getElementById("titleText");
    if (!wrap || !row) return;

    var html = "";
    var copyLines = [];

    (row.title_groups || []).forEach(function (group) {
      html += '<div class="ytk-title-group">';
      html += '<h3>' + escapeHtml(group.name) + '</h3>';
      html += '<ol>';
      (group.items || []).forEach(function (title) {
        html += '<li>' + escapeHtml(title) + '</li>';
        copyLines.push(title);
      });
      html += '</ol></div>';
    });

    wrap.innerHTML = html;
    if (copy) copy.value = copyLines.join("\n");
  }

  function renderTagGroups(row) {
    var wrap = document.getElementById("ytkTagGroups");
    var copy = document.getElementById("tagText");
    if (!wrap || !row) return;

    var html = "";
    var copyTags = [];

    (row.tag_groups || []).forEach(function (group) {
      html += '<div class="ytk-tag-group">';
      html += '<h3>' + escapeHtml(group.name) + '</h3>';
      html += '<div class="ytk-tags">';
      (group.items || []).forEach(function (tag) {
        html += '<span>#' + escapeHtml(tag) + '</span>';
        copyTags.push(tag);
      });
      html += '</div></div>';
    });

    wrap.innerHTML = html;
    if (copy) copy.value = copyTags.join(", ");
  }

  function selectRowByOriginalIndex(originalIndex) {
    var row = allRows.find(function (item) {
      return Number(item.__originalIndex) === Number(originalIndex);
    });
    if (!row) return;

    document.querySelectorAll(".ytk-keyword-row").forEach(function (el) {
      el.classList.toggle("active", Number(el.getAttribute("data-original-index")) === Number(originalIndex));
    });

    var selectedKeyword = document.getElementById("ytkSelectedKeyword");
    var selectedMeta = document.getElementById("ytkSelectedMeta");

    if (selectedKeyword) selectedKeyword.textContent = row.keyword || "";
    if (selectedMeta) {
      selectedMeta.textContent = "예상조회 " + (row.estimated_views_display || "-")
        + " · 조회속도 " + (row.view_velocity_label || "-")
        + " · 구독대비조회수 " + (row.subscriber_view_ratio_display || "-")
        + " · 알고리즘 " + (row.algorithm_signal_label || "-")
        + " · 수요 " + (row.demand || "-")
        + " · 경쟁 " + (row.competition || "-")
        + " · 기회 " + (row.opportunity || "-");
    }

    renderTitleGroups(row);
    renderTagGroups(row);
  }

  function bindRowClicks() {
    document.querySelectorAll(".ytk-keyword-row").forEach(function (el) {
      el.addEventListener("click", function () {
        selectRowByOriginalIndex(el.getAttribute("data-original-index"));
      });
    });
  }

  function initSorting() {
    allRows = readRowsData();
    if (!allRows.length) return;

    sortRows("opportunity", "desc");
    renderRows(currentRows[0].__originalIndex);
    updateSortButtons();
    updateExcelDownloadLink();
    selectRowByOriginalIndex(currentRows[0].__originalIndex);

    document.querySelectorAll(".ytk-sort-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-sort-key");
        if (!key) return;

        var nextDirection;
        if (currentSortKey === key) {
          nextDirection = currentSortDirection === "desc" ? "asc" : "desc";
        } else {
          nextDirection = defaultDirectionFor(key);
        }

        sortRows(key, nextDirection);
        renderRows(currentRows[0].__originalIndex);
        updateSortButtons();
        updateExcelDownloadLink();
        selectRowByOriginalIndex(currentRows[0].__originalIndex);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initCustomSelects();
    initSearchAccessGuard();
    initExcelAccessGuard();
    initSorting();

    document.querySelectorAll(".ytk-copy-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        var targetId = button.getAttribute("data-copy-target");
        copyTextById(targetId, button);
      });
    });
  });
})();
