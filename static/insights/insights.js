(function () {
  "use strict";

  /* =========================================================
     Bitgak Insights JS
     - carousel 4-card paging
     - live image preview/delete
     - client-side strict search filtering for /insights/?q=
     Static path: static/insights/insights.js
     ========================================================= */

  function qs(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function qsa(root, selector) {
    return root ? Array.from(root.querySelectorAll(selector)) : [];
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function closestNumber(value, fallback) {
    var parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /* -----------------------------
     Carousel
  ----------------------------- */
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

    track.addEventListener("scroll", function () {
      window.requestAnimationFrame(updateButtons);
    }, { passive: true });

    window.addEventListener("resize", updateButtons, { passive: true });
    updateButtons();
  }

  /* -----------------------------
     Strict list search filter
     Server search가 넓게 잡아도 카드 제목/요약 기준으로 한 번 더 걸러줌.
  ----------------------------- */
  function getCardSearchText(card) {
    if (!card) return "";

    var title = qs(card, "h3") ? qs(card, "h3").textContent : "";
    var summary = qs(card, ".insight-card-summary, .bv-insight-card-body p")
      ? qs(card, ".insight-card-summary, .bv-insight-card-body p").textContent
      : "";
    var imageAlt = qs(card, "img") ? qs(card, "img").getAttribute("alt") : "";

    // 날짜, 버튼, 배지까지 전체 textContent로 검색하면 관련 없는 글까지 섞일 수 있어서
    // 제목/요약/이미지 alt만 검색 대상으로 제한한다.
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
      if (empty) {
        empty.style.display = visibleCount === 0 ? "block" : "none";
      }
    }

    // /insights/?q=삼성 으로 들어온 직후 바로 한 번 더 필터링
    applyFilter();

    if (input) {
      input.addEventListener("input", applyFilter);
      input.addEventListener("search", applyFilter);
    }

    // submit은 막지 않는다. 서버 검색도 그대로 쓰되, 로딩 후 JS가 다시 좁혀준다.
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

    // 예전 코드와 새 코드 둘 다 대응
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
    var help = qs(form, "[data-image-help], .insight-help, .bv-insight-image-meta");

    if (!fileInput || !selectBtn || !preview) return;

    if (!previewImg) {
      previewImg = document.createElement("img");
      previewImg.setAttribute("data-image-preview-img", "");
      preview.prepend(previewImg);
    }

    var originalSrc = preview.dataset.initialUrl || previewImg.getAttribute("src") || "";
    var originalHasImage = Boolean(originalSrc);
    var originalHelp = help ? help.textContent.trim() : "";
    var hasNewFile = false;
    var isDeletePending = false;

    function setHiddenDelete(value) {
      removeInput.value = value ? "1" : "0";
      deleteInput.value = value ? "1" : "0";
      clearCheckboxes.forEach(function (box) {
        box.checked = Boolean(value);
      });
    }

    function setStatus(text, danger) {
      if (!status) return;
      status.textContent = text || "";
      status.style.display = text ? "inline-flex" : "none";
      status.classList.toggle("show", Boolean(text));
      status.classList.toggle("danger", Boolean(danger));
    }

    function setHelp(text) {
      if (help) help.textContent = text || "";
    }

    function showImage(src) {
      preview.classList.remove("is-delete-pending");
      if (!src) {
        previewImg.removeAttribute("src");
        preview.classList.remove("has-image");
        if (empty) empty.style.display = "block";
        return;
      }
      previewImg.src = src;
      preview.classList.add("has-image");
      if (empty) empty.style.display = "none";
    }

    function showEmpty(message) {
      previewImg.removeAttribute("src");
      preview.classList.remove("has-image");
      if (empty) {
        empty.style.display = "block";
        empty.innerHTML = message || "이미지 없음<small>차트 캡처, 썸네일, 분석 이미지를 올려보세요.</small>";
      }
    }

    function updateButtons() {
      if (deleteBtn) deleteBtn.disabled = isDeletePending || !(originalHasImage || hasNewFile);
      if (cancelBtn) cancelBtn.disabled = !(hasNewFile || isDeletePending);
    }

    function resetToOriginal() {
      try { fileInput.value = ""; } catch (e) {}
      hasNewFile = false;
      isDeletePending = false;
      setHiddenDelete(false);

      if (originalHasImage) {
        showImage(originalSrc);
        setStatus("현재 적용 중", false);
        setHelp(originalHelp || "기존 이미지가 유지됩니다.");
      } else {
        showEmpty("이미지 없음<small>차트 캡처, 썸네일, 분석 이미지를 올려보세요.</small>");
        setStatus("", false);
        setHelp(originalHelp || "이미지 없이도 글은 등록됩니다.");
      }
      updateButtons();
    }

    function previewFile(file) {
      if (!file) return;

      if (!file.type || !file.type.startsWith("image/")) {
        setStatus("이미지 파일만 가능", true);
        setHelp("JPG, PNG, WEBP 같은 이미지 파일을 선택해주세요.");
        updateButtons();
        return;
      }

      var reader = new FileReader();
      reader.onload = function (event) {
        hasNewFile = true;
        isDeletePending = false;
        setHiddenDelete(false);
        showImage(event.target.result);
        setStatus("새 이미지 선택됨", false);
        setHelp("저장하면 이 이미지로 교체됩니다: " + file.name);
        updateButtons();
      };
      reader.onerror = function () {
        hasNewFile = true;
        isDeletePending = false;
        setHiddenDelete(false);
        showEmpty("미리보기 불가<small>저장하면 선택한 파일이 업로드됩니다.</small>");
        setStatus("새 이미지 선택됨", false);
        setHelp("미리보기는 어렵지만 저장하면 업로드됩니다: " + file.name);
        updateButtons();
      };
      reader.readAsDataURL(file);
    }

    selectBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      // 같은 파일을 다시 선택해도 change 이벤트가 뜨도록 초기화
      try { fileInput.value = ""; } catch (e) {}
      fileInput.click();
    });

    fileInput.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) previewFile(file);
    });

    if (deleteBtn) {
      deleteBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        try { fileInput.value = ""; } catch (e) {}
        hasNewFile = false;
        isDeletePending = true;
        setHiddenDelete(true);
        preview.classList.add("is-delete-pending");
        showEmpty("삭제 예정<small>수정하기/등록하기를 누르면 이미지가 제거됩니다.</small>");
        setStatus("삭제 예정", true);
        setHelp("저장하면 대표 이미지가 삭제됩니다. 취소하려면 선택/삭제 취소를 누르세요.");
        updateButtons();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        resetToOriginal();
      });
    }

    form.addEventListener("submit", function () {
      setHiddenDelete(isDeletePending);
    });

    resetToOriginal();
  }

  function init() {
    qsa(document, "[data-insight-carousel], .bv-insight-strip, .insight-carousel").forEach(initCarousel);
    initListFilter();
    qsa(document, "[data-insight-image-editor], [data-insight-form], .insight-form-card, .bv-insight-form-wrap").forEach(initImageEditor);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
