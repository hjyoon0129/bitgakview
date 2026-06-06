(function () {
    const root = document.getElementById("stockTerminal");
    if (!root) return;

    const stockCode = root.dataset.code;
    const stockName = root.dataset.name;
    const apiUrl = root.dataset.apiUrl;

    const chartWrap = document.getElementById("chartWrap");
    const chartContainer = document.getElementById("customStockChart");
    const drawLayer = document.getElementById("drawLayer");

    const loadingBox = document.getElementById("chartLoading");
    const errorBox = document.getElementById("chartError");

    const headlinePriceEl = document.getElementById("headlinePrice");
    const headlineChangeEl = document.getElementById("headlineChange");
    const dataSourceText = document.getElementById("dataSourceText");

    const ohlcDateEl = document.getElementById("ohlcDate");
    const ohlcOpenEl = document.getElementById("ohlcOpen");
    const ohlcHighEl = document.getElementById("ohlcHigh");
    const ohlcLowEl = document.getElementById("ohlcLow");
    const ohlcCloseEl = document.getElementById("ohlcClose");
    const ohlcVolEl = document.getElementById("ohlcVol");
    const drawHint = document.getElementById("drawHint");

    const indicatorModal = document.getElementById("indicatorModal");
    const indicatorSearchInput = document.getElementById("indicatorSearchInput");
    const indicatorCatalogEl = document.getElementById("indicatorCatalog");
    const activeIndicatorListEl = document.getElementById("activeIndicatorList");
    const activeIndicatorStrip = document.getElementById("activeIndicatorStrip");

    let chart = null;
    let candleSeries = null;
    let lineSeries = null;
    let areaSeries = null;
    let volumeSeries = null;

    const state = {
        interval: "1d",
        range: "6m",
        chartType: "candle",
        payload: null,
        rows: [],
        activeTool: "cursor",
        pendingPoint: null,
        pendingTool: null,
        previewPoint: null,
        drawings: [],
        indicators: [
            {
                id: "ma20",
                type: "ma",
                name: "MA 20",
                period: 20,
                source: "close",
                visible: true,
                default: true,
                series: [],
            },
            {
                id: "ma60",
                type: "ma",
                name: "MA 60",
                period: 60,
                source: "close",
                visible: true,
                default: true,
                series: [],
            },
            {
                id: "ma120",
                type: "ma",
                name: "MA 120",
                period: 120,
                source: "close",
                visible: true,
                default: true,
                series: [],
            },
            {
                id: "volume",
                type: "volume",
                name: "Volume",
                period: 0,
                source: "volume",
                visible: true,
                default: true,
                series: [],
            },
        ],
    };

    const indicatorCatalog = [
        {
            type: "ma",
            name: "Moving Average",
            shortName: "MA",
            defaultPeriod: 20,
            desc: "단순 이동평균선입니다. 20, 60, 120일선처럼 추세 확인에 사용합니다.",
            keywords: "ma moving average sma 이동평균 이평선",
        },
        {
            type: "ema",
            name: "Exponential Moving Average",
            shortName: "EMA",
            defaultPeriod: 20,
            desc: "최근 가격에 더 높은 가중치를 주는 지수 이동평균선입니다.",
            keywords: "ema exponential moving average 지수이동평균",
        },
        {
            type: "boll",
            name: "Bollinger Bands",
            shortName: "BOLL",
            defaultPeriod: 20,
            desc: "중심선과 상단/하단 밴드로 변동성 구간을 확인합니다.",
            keywords: "boll bollinger bands 볼린저 밴드",
        },
        {
            type: "volume",
            name: "Volume",
            shortName: "VOL",
            defaultPeriod: 0,
            desc: "거래량 막대입니다.",
            keywords: "volume vol 거래량",
        },
    ];

    function formatNumber(value) {
        if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
            return "-";
        }

        return Number(value).toLocaleString("ko-KR");
    }

    function showLoading(show) {
        loadingBox.style.display = show ? "grid" : "none";
    }

    function showError(show, message) {
        errorBox.style.display = show ? "grid" : "none";

        if (message) {
            errorBox.textContent = message;
        }
    }

    function makeId(prefix) {
        return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    }

    function createChart() {
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                background: { type: "solid", color: "#ffffff" },
                textColor: "#334155",
                fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            },
            grid: {
                vertLines: { color: "#eef2f7" },
                horzLines: { color: "#eef2f7" },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: "#e2e8f0",
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.24,
                },
            },
            timeScale: {
                borderColor: "#e2e8f0",
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 10,
                barSpacing: 8,
                minBarSpacing: 3,
            },
            handleScroll: true,
            handleScale: true,
            localization: {
                locale: "ko-KR",
                priceFormatter: price => formatNumber(price),
            },
        });

        candleSeries = chart.addCandlestickSeries({
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            priceLineColor: "#ef4444",
            priceLineStyle: 2,
            priceFormat: {
                type: "price",
                precision: 0,
                minMove: 1,
            },
        });

        lineSeries = chart.addLineSeries({
            color: "#2563eb",
            lineWidth: 2,
            visible: false,
            priceFormat: {
                type: "price",
                precision: 0,
                minMove: 1,
            },
        });

        areaSeries = chart.addAreaSeries({
            lineColor: "#2563eb",
            topColor: "rgba(37, 99, 235, 0.28)",
            bottomColor: "rgba(37, 99, 235, 0.02)",
            lineWidth: 2,
            visible: false,
            priceFormat: {
                type: "price",
                precision: 0,
                minMove: 1,
            },
        });

        volumeSeries = chart.addHistogramSeries({
            priceScaleId: "volume",
            priceFormat: {
                type: "volume",
            },
        });

        chart.priceScale("volume").applyOptions({
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
            borderColor: "#e2e8f0",
        });

        chart.subscribeCrosshairMove(param => {
            if (!param || !param.time) return;

            const candle = param.seriesData.get(candleSeries) ||
                param.seriesData.get(lineSeries) ||
                param.seriesData.get(areaSeries);

            const row = findRowByTime(param.time);

            if (!row && !candle) return;

            if (row) {
                updateOHLC(row);
                return;
            }

            ohlcDateEl.textContent = normalizeTimeForDisplay(param.time);
            ohlcOpenEl.textContent = "-";
            ohlcHighEl.textContent = "-";
            ohlcLowEl.textContent = "-";
            ohlcCloseEl.textContent = formatNumber(candle.value || candle.close);
            ohlcVolEl.textContent = "-";
        });

        chart.timeScale().subscribeVisibleTimeRangeChange(() => {
            renderDrawings();
        });

        updateChartSize();
    }

    function updateChartSize() {
        if (!chart) return;

        const width = chartContainer.clientWidth;
        const height = chartContainer.clientHeight;

        chart.applyOptions({
            width,
            height,
        });

        drawLayer.setAttribute("width", width);
        drawLayer.setAttribute("height", height);

        renderDrawings();
    }

    const resizeObserver = new ResizeObserver(updateChartSize);
    resizeObserver.observe(chartContainer);

    function getCloseLineData(rows) {
        return rows.map(row => ({
            time: row.time,
            value: Number(row.close),
        }));
    }

    function applyChartType() {
        if (!chart || !state.rows.length) return;

        candleSeries.applyOptions({ visible: state.chartType === "candle" });
        lineSeries.applyOptions({ visible: state.chartType === "line" });
        areaSeries.applyOptions({ visible: state.chartType === "area" });

        candleSeries.setData(state.chartType === "candle" ? state.payload.ohlc : state.payload.ohlc);
        lineSeries.setData(getCloseLineData(state.rows));
        areaSeries.setData(getCloseLineData(state.rows));
    }

    function getFetchUrl() {
        const url = new URL(apiUrl, window.location.origin);
        url.searchParams.set("code", stockCode);
        url.searchParams.set("symbol", stockCode);
        url.searchParams.set("interval", state.interval);
        url.searchParams.set("range", state.range);
        return url.toString();
    }

    async function loadChartData() {
        showLoading(true);
        showError(false);

        try {
            const response = await fetch(getFetchUrl(), {
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                throw new Error(data.message || "차트 데이터를 불러오지 못했습니다.");
            }

            state.payload = data;
            state.rows = data.rows || [];

            if (!chart) {
                createChart();
            }

            candleSeries.setData(data.ohlc || []);
            lineSeries.setData(getCloseLineData(state.rows));
            areaSeries.setData(getCloseLineData(state.rows));
            volumeSeries.setData(data.volume || []);

            applyChartType();
            rebuildAllIndicators();
            updateHeadline(data);
            updateOHLC(state.rows[state.rows.length - 1]);

            if (dataSourceText) {
                dataSourceText.textContent = `데이터: ${data.source || "-"}`;
            }

            document.getElementById("bottomStatus").textContent =
                data.intraday
                    ? "분봉/시간봉: 외부 제공처의 최근 범위 데이터"
                    : "일/주/월봉: 장기 히스토리 데이터";

            const defaultVisibleBars = Number(data.default_visible_bars || data.initial_visible_bars || 0);
            if (defaultVisibleBars > 0 && state.rows.length > defaultVisibleBars) {
                try {
                    chart.timeScale().setVisibleLogicalRange({
                        from: Math.max(0, state.rows.length - defaultVisibleBars),
                        to: state.rows.length + 8,
                    });
                } catch (e) {
                    chart.timeScale().fitContent();
                }
            } else {
                chart.timeScale().fitContent();
            }
            renderDrawings();

            showLoading(false);
        } catch (error) {
            console.error(error);
            showLoading(false);
            showError(true, error.message || "차트 데이터를 불러오지 못했습니다.");
        }
    }

    function updateHeadline(data) {
        const current = data.current || {};
        const price = Number(current.price || 0);
        const change = Number(current.change || 0);
        const rate = Number(current.change_rate || 0);

        const marketText = String(data.market || root.dataset.market || "").toUpperCase();
        const unit = data.price_unit || data.priceUnit || (/^(KOSPI|KOSDAQ|KONEX|KRX)$/.test(marketText) ? "원" : "pt");
        const unitText = unit ? (unit === "원" ? unit : " " + unit) : "";
        headlinePriceEl.textContent = formatNumber(price) + unitText;

        const sign = change > 0 ? "+" : "";
        headlineChangeEl.textContent = `${sign}${formatNumber(change)} (${sign}${rate}%)`;

        headlineChangeEl.classList.remove("up", "down", "flat");

        if (change > 0) {
            headlineChangeEl.classList.add("up");
        } else if (change < 0) {
            headlineChangeEl.classList.add("down");
        } else {
            headlineChangeEl.classList.add("flat");
        }
    }

    function updateOHLC(row) {
        if (!row) return;

        ohlcDateEl.textContent = row.display_time || normalizeTimeForDisplay(row.time);
        ohlcOpenEl.textContent = formatNumber(row.open);
        ohlcHighEl.textContent = formatNumber(row.high);
        ohlcLowEl.textContent = formatNumber(row.low);
        ohlcCloseEl.textContent = formatNumber(row.close);
        ohlcVolEl.textContent = formatNumber(row.volume);
    }

    function normalizeTimeForDisplay(time) {
        if (!time) return "-";

        if (typeof time === "number") {
            const dt = new Date(time * 1000);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, "0");
            const d = String(dt.getDate()).padStart(2, "0");
            const hh = String(dt.getHours()).padStart(2, "0");
            const mm = String(dt.getMinutes()).padStart(2, "0");
            return `${y}-${m}-${d} ${hh}:${mm}`;
        }

        if (typeof time === "string") {
            return time;
        }

        if (typeof time === "object" && time.year && time.month && time.day) {
            const y = String(time.year);
            const m = String(time.month).padStart(2, "0");
            const d = String(time.day).padStart(2, "0");
            return `${y}-${m}-${d}`;
        }

        return String(time);
    }

    function normalizeChartTime(time) {
        if (!time) return null;

        if (typeof time === "number") {
            return time;
        }

        if (typeof time === "string") {
            return time;
        }

        if (typeof time === "object" && time.year && time.month && time.day) {
            const y = String(time.year);
            const m = String(time.month).padStart(2, "0");
            const d = String(time.day).padStart(2, "0");
            return `${y}-${m}-${d}`;
        }

        return time;
    }

    function sameTime(a, b) {
        return String(normalizeChartTime(a)) === String(normalizeChartTime(b));
    }

    function findRowByTime(time) {
        const target = normalizeChartTime(time);
        return state.rows.find(row => sameTime(row.time, target));
    }

    function setActiveButtons(selector, activeButton) {
        document.querySelectorAll(selector).forEach(btn => {
            btn.classList.toggle("active", btn === activeButton);
        });
    }

    document.querySelectorAll(".interval-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const interval = btn.dataset.interval;
            if (!interval || interval === state.interval) return;

            state.interval = interval;
            setActiveButtons(".interval-btn", btn);
            state.drawings = [];
            cancelPendingDrawing();
            loadChartData();
        });
    });

    document.querySelectorAll(".range-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const range = btn.dataset.range;
            if (!range || range === state.range) return;

            state.range = range;
            setActiveButtons(".range-btn", btn);
            state.drawings = [];
            cancelPendingDrawing();
            loadChartData();
        });
    });

    document.querySelectorAll(".chart-type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.dataset.chartType;
            if (!type || type === state.chartType) return;

            state.chartType = type;
            setActiveButtons(".chart-type-btn", btn);
            applyChartType();
        });
    });

    document.getElementById("copyCodeBtn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(stockCode);
            const btn = document.getElementById("copyCodeBtn");
            const oldText = btn.textContent;
            btn.textContent = "복사됨";
            setTimeout(() => {
                btn.textContent = oldText;
            }, 1200);
        } catch (e) {
            alert(stockCode);
        }
    });

    function addLineIndicatorSeries(color, width) {
        return chart.addLineSeries({
            color,
            lineWidth: width || 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
    }

    function clearIndicatorSeries(indicator) {
        if (!indicator.series) return;

        indicator.series.forEach(s => {
            try {
                chart.removeSeries(s);
            } catch (e) {}
        });

        indicator.series = [];
    }

    function getSourceValue(row, source) {
        if (!row) return null;
        return Number(row[source || "close"]);
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
                if (Number.isNaN(value)) {
                    valid = false;
                    break;
                }
                sum += value;
            }

            if (!valid) continue;

            result.push({
                time: rows[i].time,
                value: Math.round((sum / period) * 100) / 100,
            });
        }

        return result;
    }

    function calcEMA(rows, period, source) {
        const result = [];

        if (!period || period < 1 || rows.length < period) return result;

        const multiplier = 2 / (period + 1);

        let sum = 0;

        for (let i = 0; i < period; i++) {
            sum += getSourceValue(rows[i], source);
        }

        let ema = sum / period;

        result.push({
            time: rows[period - 1].time,
            value: Math.round(ema * 100) / 100,
        });

        for (let i = period; i < rows.length; i++) {
            const price = getSourceValue(rows[i], source);
            ema = (price - ema) * multiplier + ema;

            result.push({
                time: rows[i].time,
                value: Math.round(ema * 100) / 100,
            });
        }

        return result;
    }

    function calcBoll(rows, period, source) {
        const upper = [];
        const middle = [];
        const lower = [];

        if (!period || period < 2) {
            return { upper, middle, lower };
        }

        for (let i = 0; i < rows.length; i++) {
            if (i < period - 1) continue;

            const values = [];

            for (let j = i - period + 1; j <= i; j++) {
                values.push(getSourceValue(rows[j], source));
            }

            const mean = values.reduce((a, b) => a + b, 0) / period;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
            const std = Math.sqrt(variance);

            const time = rows[i].time;

            upper.push({
                time,
                value: Math.round((mean + std * 2) * 100) / 100,
            });

            middle.push({
                time,
                value: Math.round(mean * 100) / 100,
            });

            lower.push({
                time,
                value: Math.round((mean - std * 2) * 100) / 100,
            });
        }

        return { upper, middle, lower };
    }

    function rebuildIndicator(indicator) {
        if (!chart) return;

        clearIndicatorSeries(indicator);

        if (!indicator.visible) {
            return;
        }

        if (indicator.type === "volume") {
            volumeSeries.applyOptions({ visible: true });
            return;
        }

        if (indicator.type === "ma") {
            const series = addLineIndicatorSeries("#111827", 2);
            series.setData(calcMA(state.rows, Number(indicator.period || 20), indicator.source));
            indicator.series = [series];
            return;
        }

        if (indicator.type === "ema") {
            const series = addLineIndicatorSeries("#7c3aed", 2);
            series.setData(calcEMA(state.rows, Number(indicator.period || 20), indicator.source));
            indicator.series = [series];
            return;
        }

        if (indicator.type === "boll") {
            const upSeries = addLineIndicatorSeries("#0284c7", 1);
            const midSeries = addLineIndicatorSeries("#64748b", 1);
            const lowSeries = addLineIndicatorSeries("#0284c7", 1);

            const data = calcBoll(state.rows, Number(indicator.period || 20), indicator.source);

            upSeries.setData(data.upper);
            midSeries.setData(data.middle);
            lowSeries.setData(data.lower);

            indicator.series = [upSeries, midSeries, lowSeries];
        }
    }

    function rebuildAllIndicators() {
        if (!chart) return;

        state.indicators.forEach(indicator => {
            if (indicator.type === "volume") {
                volumeSeries.applyOptions({ visible: indicator.visible });
            } else {
                rebuildIndicator(indicator);
            }
        });

        renderActiveIndicatorStrip();
        renderActiveIndicatorSettings();
    }

    function toggleDefaultIndicator(key) {
        const map = {
            volume: "volume",
            ma20: "ma20",
            ma60: "ma60",
            ma120: "ma120",
        };

        const id = map[key];
        const indicator = state.indicators.find(item => item.id === id);

        if (!indicator) return;

        indicator.visible = !indicator.visible;

        if (indicator.type === "volume") {
            volumeSeries.applyOptions({ visible: indicator.visible });
        } else {
            rebuildIndicator(indicator);
        }

        renderActiveIndicatorStrip();
        renderActiveIndicatorSettings();
    }

    activeIndicatorStrip.addEventListener("click", event => {
        const btn = event.target.closest("[data-default-indicator]");
        if (!btn) return;
        toggleDefaultIndicator(btn.dataset.defaultIndicator);
    });

    function renderActiveIndicatorStrip() {
        const defaultIds = ["volume", "ma20", "ma60", "ma120"];

        activeIndicatorStrip.innerHTML = "";

        state.indicators.forEach(indicator => {
            const btn = document.createElement("button");
            btn.className = "indicator-pill" + (indicator.visible ? " active" : "");

            if (defaultIds.includes(indicator.id)) {
                btn.dataset.defaultIndicator = indicator.id;
            } else {
                btn.dataset.dynamicIndicator = indicator.id;
            }

            btn.type = "button";
            btn.textContent = `${indicator.name}${indicator.period ? " " + indicator.period : ""}`;
            activeIndicatorStrip.appendChild(btn);
        });
    }

    activeIndicatorStrip.addEventListener("click", event => {
        const dynamicBtn = event.target.closest("[data-dynamic-indicator]");
        if (!dynamicBtn) return;

        const indicator = state.indicators.find(item => item.id === dynamicBtn.dataset.dynamicIndicator);
        if (!indicator) return;

        indicator.visible = !indicator.visible;
        rebuildIndicator(indicator);
        renderActiveIndicatorStrip();
        renderActiveIndicatorSettings();
    });

    function renderIndicatorCatalog() {
        const q = (indicatorSearchInput.value || "").trim().toLowerCase();

        indicatorCatalogEl.innerHTML = "";

        const filtered = indicatorCatalog.filter(item => {
            if (!q) return true;

            return (
                item.name.toLowerCase().includes(q) ||
                item.shortName.toLowerCase().includes(q) ||
                item.desc.toLowerCase().includes(q) ||
                item.keywords.toLowerCase().includes(q)
            );
        });

        filtered.forEach(item => {
            const row = document.createElement("div");
            row.className = "indicator-catalog-item";

            row.innerHTML = `
                <div>
                    <div class="indicator-catalog-title">${item.name} <span class="badge">${item.shortName}</span></div>
                    <div class="indicator-catalog-desc">${item.desc}</div>
                </div>
                <button class="indicator-add-btn" type="button" data-add-indicator="${item.type}">추가</button>
            `;

            indicatorCatalogEl.appendChild(row);
        });
    }

    function addIndicator(type) {
        const meta = indicatorCatalog.find(item => item.type === type);
        if (!meta) return;

        if (type === "volume") {
            let vol = state.indicators.find(item => item.type === "volume");

            if (!vol) {
                vol = {
                    id: "volume",
                    type: "volume",
                    name: "Volume",
                    period: 0,
                    source: "volume",
                    visible: true,
                    series: [],
                };

                state.indicators.push(vol);
            }

            vol.visible = true;
            rebuildAllIndicators();
            return;
        }

        const indicator = {
            id: makeId(type),
            type,
            name: meta.shortName,
            period: meta.defaultPeriod,
            source: "close",
            visible: true,
            series: [],
        };

        state.indicators.push(indicator);
        rebuildIndicator(indicator);
        renderActiveIndicatorStrip();
        renderActiveIndicatorSettings();
    }

    indicatorCatalogEl.addEventListener("click", event => {
        const btn = event.target.closest("[data-add-indicator]");
        if (!btn) return;

        addIndicator(btn.dataset.addIndicator);
    });

    indicatorSearchInput.addEventListener("input", renderIndicatorCatalog);

    function renderActiveIndicatorSettings() {
        activeIndicatorListEl.innerHTML = "";

        state.indicators.forEach(indicator => {
            const row = document.createElement("div");
            row.className = "active-indicator-row";
            row.dataset.indicatorId = indicator.id;

            const periodDisabled = indicator.type === "volume" ? "disabled" : "";
            const removeDisabled = indicator.default ? "" : "";

            row.innerHTML = `
                <div class="active-indicator-name">
                    <label>
                        <input type="checkbox" data-field="visible" ${indicator.visible ? "checked" : ""}>
                        ${indicator.name}
                    </label>
                </div>

                <input data-field="period" type="number" min="1" max="500" value="${indicator.period || 0}" ${periodDisabled}>

                <select data-field="source" ${periodDisabled}>
                    <option value="close" ${indicator.source === "close" ? "selected" : ""}>종가</option>
                    <option value="open" ${indicator.source === "open" ? "selected" : ""}>시가</option>
                    <option value="high" ${indicator.source === "high" ? "selected" : ""}>고가</option>
                    <option value="low" ${indicator.source === "low" ? "selected" : ""}>저가</option>
                </select>

                <button class="indicator-remove-btn" type="button" data-remove-indicator="${indicator.id}" ${removeDisabled}>×</button>
            `;

            activeIndicatorListEl.appendChild(row);
        });
    }

    activeIndicatorListEl.addEventListener("click", event => {
        const btn = event.target.closest("[data-remove-indicator]");
        if (!btn) return;

        const id = btn.dataset.removeIndicator;
        const indicator = state.indicators.find(item => item.id === id);

        if (indicator && indicator.default) {
            indicator.visible = false;
            rebuildAllIndicators();
            return;
        }

        if (indicator) {
            clearIndicatorSeries(indicator);
        }

        state.indicators = state.indicators.filter(item => item.id !== id);
        rebuildAllIndicators();
    });

    document.getElementById("applyIndicatorSettings").addEventListener("click", () => {
        document.querySelectorAll(".active-indicator-row").forEach(row => {
            const indicator = state.indicators.find(item => item.id === row.dataset.indicatorId);
            if (!indicator) return;

            const visibleEl = row.querySelector('[data-field="visible"]');
            const periodEl = row.querySelector('[data-field="period"]');
            const sourceEl = row.querySelector('[data-field="source"]');

            indicator.visible = visibleEl.checked;

            if (indicator.type !== "volume") {
                indicator.period = Math.max(1, Number(periodEl.value || indicator.period || 20));
                indicator.source = sourceEl.value || "close";
            }
        });

        rebuildAllIndicators();
    });

    function openIndicatorModal() {
        indicatorModal.classList.add("open");
        indicatorModal.setAttribute("aria-hidden", "false");
        renderIndicatorCatalog();
        renderActiveIndicatorSettings();
        setTimeout(() => indicatorSearchInput.focus(), 30);
    }

    function closeIndicatorModal() {
        indicatorModal.classList.remove("open");
        indicatorModal.setAttribute("aria-hidden", "true");
    }

    document.getElementById("openIndicatorBtn").addEventListener("click", openIndicatorModal);
    document.getElementById("openIndicatorBtn2").addEventListener("click", openIndicatorModal);

    document.querySelectorAll("[data-close-indicator]").forEach(el => {
        el.addEventListener("click", closeIndicatorModal);
    });

    function setTool(tool) {
        if (tool === "undo") {
            state.drawings.pop();
            cancelPendingDrawing();
            renderDrawings();
            return;
        }

        if (tool === "clear") {
            state.drawings = [];
            cancelPendingDrawing();
            renderDrawings();
            return;
        }

        state.activeTool = tool;
        cancelPendingDrawing();

        document.querySelectorAll("[data-tool]").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.tool === tool);
        });

        const drawingMode = tool !== "cursor";
        chartWrap.classList.toggle("drawing-mode", drawingMode);

        if (chart) {
            chart.applyOptions({
                handleScroll: !drawingMode,
                handleScale: !drawingMode,
            });
        }

        if (tool === "cursor") {
            drawHint.textContent = "커서 모드";
        } else if (tool === "hline") {
            drawHint.textContent = "수평선: 차트에서 한 번 클릭";
        } else if (tool === "vline") {
            drawHint.textContent = "수직선: 차트에서 한 번 클릭";
        } else {
            drawHint.textContent = "첫 번째 클릭으로 시작, 두 번째 클릭으로 확정";
        }

        renderDrawings();
    }

    document.querySelectorAll("[data-tool]").forEach(btn => {
        btn.addEventListener("click", () => {
            setTool(btn.dataset.tool);
        });
    });

    function cancelPendingDrawing() {
        state.pendingPoint = null;
        state.pendingTool = null;
        state.previewPoint = null;
    }

    function localPoint(event) {
        const rect = drawLayer.getBoundingClientRect();

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    }

    function pointToValue(point) {
        if (!chart || !candleSeries) return null;

        const time = normalizeChartTime(chart.timeScale().coordinateToTime(point.x));
        const price = candleSeries.coordinateToPrice(point.y);

        if (!time || price === null || price === undefined) {
            return null;
        }

        return {
            time,
            price: Number(price),
        };
    }

    function valueToPoint(value) {
        if (!chart || !candleSeries || !value) return null;

        const x = chart.timeScale().timeToCoordinate(value.time);
        const y = candleSeries.priceToCoordinate(value.price);

        if (x === null || x === undefined || y === null || y === undefined) {
            return null;
        }

        return { x, y };
    }

    function svg(tag, attrs) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);

        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                el.setAttribute(key, value);
            }
        });

        return el;
    }

    function clearSvg() {
        while (drawLayer.firstChild) {
            drawLayer.removeChild(drawLayer.firstChild);
        }
    }

    function drawLine(p1, p2, option) {
        option = option || {};

        drawLayer.appendChild(svg("line", {
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: option.stroke || "#2563eb",
            "stroke-width": option.width || 2,
            "stroke-dasharray": option.dash || "",
            "stroke-linecap": "round",
        }));
    }

    function drawText(text, x, y, option) {
        option = option || {};

        const el = svg("text", {
            x,
            y,
            fill: option.fill || "#2563eb",
            "font-size": option.size || 11,
            "font-weight": "900",
            "dominant-baseline": "middle",
        });

        el.textContent = text;
        drawLayer.appendChild(el);
    }

    function renderTrend(drawing) {
        const p1 = valueToPoint(drawing.start);
        const p2 = valueToPoint(drawing.end);

        if (!p1 || !p2) return;

        drawLine(p1, p2, {
            stroke: "#2563eb",
            width: 2,
        });
    }

    function renderExtend(drawing) {
        const p1 = valueToPoint(drawing.start);
        const p2 = valueToPoint(drawing.end);

        if (!p1 || !p2) return;

        const width = drawLayer.clientWidth || chartContainer.clientWidth;

        if (Math.abs(p2.x - p1.x) < 1) {
            drawLine(
                { x: p1.x, y: 0 },
                { x: p1.x, y: drawLayer.clientHeight || chartContainer.clientHeight },
                { stroke: "#7c3aed", width: 2 }
            );
            return;
        }

        const slope = (p2.y - p1.y) / (p2.x - p1.x);

        drawLine(
            { x: 0, y: p1.y + slope * (0 - p1.x) },
            { x: width, y: p1.y + slope * (width - p1.x) },
            { stroke: "#7c3aed", width: 2 }
        );
    }

    function renderHline(drawing) {
        const p = valueToPoint(drawing.start);
        if (!p) return;

        drawLine(
            { x: 0, y: p.y },
            { x: drawLayer.clientWidth || chartContainer.clientWidth, y: p.y },
            { stroke: "#ef4444", width: 1.5, dash: "4 4" }
        );

        drawText(formatNumber(Math.round(drawing.start.price)), 8, p.y - 10, {
            fill: "#ef4444",
        });
    }

    function renderVline(drawing) {
        const p = valueToPoint(drawing.start);
        if (!p) return;

        drawLine(
            { x: p.x, y: 0 },
            { x: p.x, y: drawLayer.clientHeight || chartContainer.clientHeight },
            { stroke: "#64748b", width: 1.5, dash: "4 4" }
        );

        drawText(normalizeTimeForDisplay(drawing.start.time), p.x + 6, 16, {
            fill: "#64748b",
        });
    }

    function renderFibo(drawing) {
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

        levels.forEach(level => {
            const offset = dy * level.value;

            const a = {
                x: p1.x,
                y: p1.y + offset,
            };

            const b = {
                x: p1.x + dx,
                y: p1.y + offset + dy,
            };

            drawLine(a, b, {
                stroke: level.value === 0 || level.value === 1 ? "#0f766e" : "#14b8a6",
                width: level.value === 0 || level.value === 1 ? 2 : 1.2,
                dash: level.value === 0 || level.value === 1 ? "" : "3 3",
            });

            drawText(level.label, b.x + 6, b.y, {
                fill: "#0f766e",
            });
        });
    }

    function renderOne(drawing) {
        if (!drawing) return;

        if (drawing.type === "trend") renderTrend(drawing);
        if (drawing.type === "extend") renderExtend(drawing);
        if (drawing.type === "hline") renderHline(drawing);
        if (drawing.type === "vline") renderVline(drawing);
        if (drawing.type === "fibo") renderFibo(drawing);
    }

    function renderDrawings() {
        clearSvg();

        state.drawings.forEach(renderOne);

        if (state.pendingPoint && state.previewPoint && state.pendingTool) {
            renderOne({
                type: state.pendingTool,
                start: state.pendingPoint,
                end: state.previewPoint,
            });
        }
    }

    drawLayer.addEventListener("pointermove", event => {
        if (!state.pendingPoint || !state.pendingTool) return;

        const p = localPoint(event);
        const value = pointToValue(p);

        if (!value) return;

        state.previewPoint = value;
        renderDrawings();
    });

    drawLayer.addEventListener("pointerdown", event => {
        if (state.activeTool === "cursor") return;

        event.preventDefault();

        const p = localPoint(event);
        const value = pointToValue(p);

        if (!value) return;

        if (state.activeTool === "hline" || state.activeTool === "vline") {
            state.drawings.push({
                type: state.activeTool,
                start: value,
            });

            renderDrawings();
            return;
        }

        if (!state.pendingPoint) {
            state.pendingPoint = value;
            state.pendingTool = state.activeTool;
            state.previewPoint = value;
            drawHint.textContent = "두 번째 위치를 클릭하면 확정됩니다.";
            renderDrawings();
            return;
        }

        state.drawings.push({
            type: state.pendingTool,
            start: state.pendingPoint,
            end: value,
        });

        cancelPendingDrawing();
        drawHint.textContent = "첫 번째 클릭으로 시작, 두 번째 클릭으로 확정";
        renderDrawings();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            cancelPendingDrawing();
            renderDrawings();

            if (indicatorModal.classList.contains("open")) {
                closeIndicatorModal();
            }
        }
    });

    loadChartData();
})();