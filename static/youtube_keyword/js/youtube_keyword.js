(function () {
  var allRows = [];
  var currentRows = [];
  var currentSortKey = "opportunity";
  var currentSortDirection = "desc";

  function normalizeBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === null || value === undefined) return false;
    var text = String(value).trim().toLowerCase();
    return text === "1" || text === "true" || text === "yes" || text === "y" || text === "on";
  }

  function normalizeNumber(value, fallbackValue) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallbackValue;
  }

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

    var data = Object.assign({}, fallback);

    // 가장 중요한 기준: 실제 Django 로그인 상태를 별도 JSON/폼 data에서 읽는다.
    // ytk_access.is_premium 값이 잘못 true로 내려와도 비로그인 사용자는 절대 검색되지 않게 한다.
    var authScript = document.getElementById("ytkAuthData");
    if (authScript) {
      try {
        var authData = JSON.parse(authScript.textContent || "{}");
        data.is_authenticated = authData.is_authenticated;
        data.is_premium = authData.is_premium;
      } catch (e) {}
    }

    var accessScript = document.getElementById("ytkAccessData");
    if (accessScript) {
      try {
        var serverData = JSON.parse(accessScript.textContent || "{}");
        data.daily_limit = serverData.daily_limit;
        data.used_today = serverData.used_today;
        data.remaining_today = serverData.remaining_today;
        data.pricing_url = serverData.pricing_url || data.pricing_url;
        // 여기서는 is_authenticated / is_premium을 덮어쓰지 않는다.
      } catch (e) {}
    }

    var form = document.getElementById("ytkKeywordSearchForm");
    if (form && form.dataset) {
      if (form.dataset.isAuthenticated !== undefined) data.is_authenticated = form.dataset.isAuthenticated;
      if (form.dataset.isPremium !== undefined) data.is_premium = form.dataset.isPremium;
      if (form.dataset.remaining !== undefined) data.remaining_today = form.dataset.remaining;
      if (form.dataset.dailyLimit !== undefined) data.daily_limit = form.dataset.dailyLimit;
      if (form.dataset.pricingUrl) data.pricing_url = form.dataset.pricingUrl;
    }

    data.is_authenticated = normalizeBool(data.is_authenticated);
    data.is_premium = data.is_authenticated && normalizeBool(data.is_premium);
    data.daily_limit = normalizeNumber(data.daily_limit, fallback.daily_limit);
    data.used_today = normalizeNumber(data.used_today, fallback.used_today);
    data.remaining_today = normalizeNumber(data.remaining_today, fallback.remaining_today);
    data.can_search = data.is_authenticated && (data.is_premium || data.remaining_today > 0);
    data.pricing_url = data.pricing_url || "/stocks/pricing/";
    return data;
  }

  function buildLoginHref() {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    return "/accounts/login/?next=" + next;
  }

  function initYtkAccessModal() {
    var modal = document.querySelector("[data-ytk-modal]");
    if (!modal) return;

    modal.querySelectorAll("[data-ytk-modal-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        modal.hidden = true;
        document.documentElement.classList.remove("ytk-modal-open");
      });
    });

    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        modal.hidden = true;
        document.documentElement.classList.remove("ytk-modal-open");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) {
        modal.hidden = true;
        document.documentElement.classList.remove("ytk-modal-open");
      }
    });
  }

  function setModalText(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value || "";
  }

  function openYtkAccess(kind, options) {
    options = options || {};

    var modal = document.querySelector("[data-ytk-modal]");
    if (!modal) {
      if (kind === "login") {
        alert(options.message || "로그인 후 사용할 수 있습니다.");
        window.location.href = options.href || buildLoginHref();
        return;
      }
      alert(options.message || "프리미엄 전용 또는 무료 사용량 제한 기능입니다.");
      if (options.href) window.location.href = options.href;
      return;
    }

    var defaults = kind === "premium" ? {
      badge: "프리미엄 안내",
      icon: "✨",
      title: "오늘 무료 검색 3회를 모두 사용했습니다",
      message: "프리미엄으로 전환하면 유튜브 키워드 분석, 제목 아이디어, 태그, 엑셀 다운로드를 제한 없이 사용할 수 있습니다.",
      primaryText: "프리미엄 보기",
      href: "/stocks/pricing/",
      points: ["키워드 무제한 검색", "제목·태그 아이디어", "엑셀 다운로드", "구독대비조회수 분석"]
    } : {
      badge: "무료 회원",
      icon: "🔐",
      title: "로그인 후 사용할 수 있습니다",
      message: "검색어 입력과 카테고리 선택은 미리 볼 수 있습니다. 실제 분석 결과 확인은 무료 로그인 후 하루 3회까지 가능합니다.",
      primaryText: "무료 로그인",
      href: buildLoginHref(),
      points: ["예시 결과까지 미리보기", "무료 회원 하루 3회 실제 분석", "결과 확인과 엑셀 다운로드", "프리미엄은 무제한 검색"]
    };

    var data = Object.assign({}, defaults, options);
    var primary = modal.querySelector("[data-ytk-modal-primary]");
    var points = modal.querySelector("[data-ytk-modal-points]");

    setModalText("[data-ytk-modal-badge]", data.badge);
    setModalText("[data-ytk-modal-icon]", data.icon);
    setModalText("[data-ytk-modal-title]", data.title);
    setModalText("[data-ytk-modal-message]", data.message);

    if (primary) {
      primary.textContent = data.primaryText || defaults.primaryText;
      primary.setAttribute("href", data.href || defaults.href);
    }

    if (points) {
      points.innerHTML = "";
      (data.points || defaults.points || []).forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        points.appendChild(li);
      });
    }

    modal.hidden = false;
    document.documentElement.classList.add("ytk-modal-open");
  }

  function initAccessActionLinks() {
    document.querySelectorAll("[data-ytk-open-login]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var access = readPageAccess();

        if (access.is_authenticated) {
          if (!access.is_premium && Number(access.remaining_today || 0) <= 0) {
            openYtkAccess("premium", { href: access.pricing_url || "/stocks/pricing/" });
            return;
          }
          var form = document.getElementById("ytkSearchForm");
          if (form && form.scrollIntoView) {
            form.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          return;
        }

        openYtkAccess("login", {
          href: link.getAttribute("href") || buildLoginHref(),
          title: "무료 로그인 후 실제 분석을 볼 수 있습니다",
          message: "지금 보이는 결과는 미리보기입니다. 검색어와 카테고리를 바꿔 실제 분석 결과를 확인하려면 무료 로그인이 필요합니다.",
          primaryText: "무료 로그인",
          points: ["예시 결과까지 미리보기", "무료 회원 하루 3회 실제 분석", "제목·태그 아이디어 확인", "프리미엄은 무제한 검색"]
        });
      });
    });

    document.querySelectorAll("[data-ytk-open-premium]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var access = readPageAccess();
        if (access.is_premium) return;
        event.preventDefault();
        openYtkAccess("premium", { href: link.getAttribute("href") || "/stocks/pricing/" });
      });
    });
  }

  function getKeywordInputValue() {
    var input = document.getElementById("keyword");
    return input ? String(input.value || "").trim() : "";
  }

  function validateKeywordInput() {
    var keyword = getKeywordInputValue();
    if (!keyword) return { ok: true };

    var compact = keyword.replace(/\s+/g, "");
    var visible = compact.replace(/[\-_.·,，。!！?？~^()\[\]{}:;"'`|\\/]+/g, "");

    if (visible.length < 2) {
      return {
        ok: false,
        title: "검색어를 조금 더 구체적으로 입력해주세요",
        message: "한 글자나 기호만으로는 의미 있는 유튜브 키워드 분석을 만들기 어렵습니다. 예: 삼성전자, 반도체 관련주, 전력망 수혜주처럼 입력해보세요."
      };
    }

    if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(visible)) {
      return {
        ok: false,
        title: "완성된 검색어가 필요합니다",
        message: "초성이나 자음만 입력하면 최근영상·수요도 같은 지표가 왜곡될 수 있습니다. 예: ㅇㄴㄴㄴ 대신 삼성전자, 코스피 전망처럼 입력해주세요."
      };
    }

    if (!/[가-힣a-zA-Z0-9]/.test(visible)) {
      return {
        ok: false,
        title: "분석 가능한 검색어를 입력해주세요",
        message: "한글 단어, 영문, 숫자가 포함된 검색어만 분석할 수 있습니다."
      };
    }

    if (/^(.)\1{3,}$/.test(visible)) {
      return {
        ok: false,
        title: "반복 문자 검색어는 분석할 수 없습니다",
        message: "의미 없는 반복 문자는 유튜브 키워드 지표가 비정상적으로 보일 수 있습니다. 실제 영상 주제에 가까운 검색어를 입력해주세요."
      };
    }

    if (visible.length > 60) {
      return {
        ok: false,
        title: "검색어가 너무 깁니다",
        message: "키워드 분석은 짧은 주제어 기준으로 가장 잘 작동합니다. 60자 이내로 줄여서 입력해주세요."
      };
    }

    return { ok: true };
  }

  function blockWithKeywordMessage(validation) {
    openYtkAccess("login", {
      badge: "검색어 확인",
      icon: "🔎",
      title: validation.title || "검색어를 확인해주세요",
      message: validation.message || "분석 가능한 검색어를 입력해주세요.",
      primaryText: "확인",
      href: "#ytkSearchForm",
      points: ["완성된 단어로 입력", "초성·자음만 입력 금지", "예: 삼성전자, 코스피 전망, 반도체 관련주"]
    });
  }

  function shouldBlockSearch(event) {
    var access = readPageAccess();

    if (!access.is_authenticated) {
      if (event) {
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        event.stopPropagation();
      }
      openYtkAccess("login", {
        badge: "무료 회원",
        icon: "🔐",
        title: "로그인 후 실제 분석을 볼 수 있습니다",
        message: "지금 화면은 예시 결과입니다. 검색어를 입력하거나 카테고리를 바꿔 실제 키워드·제목·태그 결과를 보려면 무료 로그인이 필요합니다.",
        primaryText: "무료 로그인",
        href: buildLoginHref(),
        points: ["예시 결과까지 미리보기", "무료 회원 하루 3회 실제 분석", "제목·태그 아이디어 확인", "프리미엄은 무제한 검색"]
      });
      return true;
    }

    if (!access.is_premium && Number(access.remaining_today || 0) <= 0) {
      if (event) {
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        event.stopPropagation();
      }
      openYtkAccess("premium", {
        badge: "프리미엄",
        icon: "✨",
        title: "오늘 무료 검색 3회를 모두 사용했습니다",
        message: "프리미엄으로 전환하면 유튜브 키워드 분석, 제목 아이디어, 태그, 엑셀 다운로드를 제한 없이 사용할 수 있습니다.",
        primaryText: "프리미엄 보기",
        href: access.pricing_url || "/stocks/pricing/",
        points: ["키워드 무제한 검색", "제목·태그 아이디어", "엑셀 다운로드", "구독대비조회수 분석"]
      });
      return true;
    }

    return false;
  }

  function initSearchAccessGuard() {
    var form = document.getElementById("ytkKeywordSearchForm");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      shouldBlockSearch(event);
    }, true);

    document.addEventListener("submit", function (event) {
      if (event.target && event.target.id === "ytkKeywordSearchForm") {
        shouldBlockSearch(event);
      }
    }, true);

    var submitButton = form.querySelector(".ytk-submit-btn");
    if (submitButton) {
      submitButton.addEventListener("click", function (event) {
        shouldBlockSearch(event);
      }, true);
    }

    document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("#ytkKeywordSearchForm .ytk-submit-btn") : null;
      if (button) {
        shouldBlockSearch(event);
      }
    }, true);
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
    initYtkAccessModal();
    initAccessActionLinks();
    initCustomSelects();
    initSearchAccessGuard();
    initExcelAccessGuard();
    initSorting();

    document.querySelectorAll(".ytk-copy-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        var access = readPageAccess();
        if (!access.is_authenticated) {
          openYtkAccess("login", {
            title: "로그인 후 복사할 수 있습니다",
            message: "키워드, 제목, 태그 복사는 로그인 후 사용할 수 있습니다. 무료 회원은 하루 3회 분석 결과를 확인할 수 있습니다.",
            primaryText: "무료 로그인",
            href: buildLoginHref(),
            points: ["키워드 결과 복사", "제목 아이디어 복사", "태그 복사", "프리미엄은 무제한 분석"]
          });
          return;
        }
        if (!access.is_premium && Number(access.remaining_today || 0) <= 0) {
          openYtkAccess("premium", {
            title: "오늘 무료 검색 3회를 모두 사용했습니다",
            message: "프리미엄으로 전환하면 결과 복사와 키워드 분석을 제한 없이 사용할 수 있습니다.",
            href: access.pricing_url || "/stocks/pricing/"
          });
          return;
        }
        var targetId = button.getAttribute("data-copy-target");
        copyTextById(targetId, button);
      });
    });
  });
})();
