// ======================== 完整版 script.js ========================
// 功能：CALL状态全表扫描 + 访谈第2行起全量展示 + 随机背景 + 双语切换 + 手机9:16卡片

(function() {
    // ---------- 随机背景图配置 ----------
    const bgImages = [
        "images/bg1.jpg",
        "images/bg2.jpg",
        "images/bg3.jpg",
        "images/bg4.jpg",
        "images/bg5.jpg"
    ];

    function setRandomBackground() {
        const randomIndex = Math.floor(Math.random() * bgImages.length);
        const selectedImage = bgImages[randomIndex];
        document.body.style.backgroundImage = `url('${selectedImage}')`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center center";
        document.body.style.backgroundAttachment = "fixed";
        // 半透明深色遮罩，保证白色文字和卡片可读
        document.body.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        document.body.style.backgroundBlendMode = "overlay";
    }

    // ---------- Google Sheets CSV 地址 ----------
    const sheetA_CSV = "https://docs.google.com/spreadsheets/d/1U4ZxsISshl4RLHuJgRwMthmB_ByWoKyv03qJl3f6avQ/export?format=csv";
    const sheetB_CSV = "https://docs.google.com/spreadsheets/d/1wgCgjkq-DQLxOKBOBlZkoIRGW6ArATYA-sAxMRT7Odo/export?format=csv";

    let currentLang = "zh";
    let currentMode = "call";
    let lastSearchKeyword = "";

    let cachedCallSet = null;
    let cachedInterviewList = null;

    // 多语言词库
    const translations = {
        zh: {
            title: "商家查询",
            subtitle: "快速查询商家 CALL 状态 / 访谈安排",
            search: "搜索",
            placeholder: "输入完整商家名字",
            call: "是否 CALL 过",
            interview: "访谈时间",
            called: "⭕ 已CALL",
            notCalled: "✅ 未CALL",
            datetime: "📅 日期 / 时间",
            merchant: "🏪 商家名称",
            address: "📍 地址",
            leader: "👤 负责人",
            language: "🌐 语言",
            phone: "📞 手机号",
            map: "🗺️ 查看地图",
            loading: "加载数据中...",
            noResult: "未找到相关商家",
            noInterview: "暂无访谈安排",
            errorMsg: "数据加载失败，请刷新重试"
        },
        en: {
            title: " Merchant System",
            subtitle: "Call Status & Interview Schedule",
            search: "Search",
            placeholder: "Enter merchant name",
            call: "Call Status",
            interview: "Interview",
            called: "⭕ Called",
            notCalled: "✅Not Called",
            datetime: "📅 Date / Time",
            merchant: "🏪 Merchant",
            address: "📍 Address",
            leader: "👤 Leader",
            language: "🌐 Language",
            phone: "📞 Phone",
            map: "🗺️ Open Map",
            loading: "Loading data...",
            noResult: "No matching merchant",
            noInterview: "No interviews scheduled",
            errorMsg: "Failed to load data, please refresh"
        }
    };

    function getText(key) {
        return translations[currentLang][key] || translations.zh[key];
    }

    // 获取 CSV 并解析为二维数组
    async function fetchCSV(url) {
        try {
            const response = await fetch(url);
            const text = await response.text();
            const rows = [];
            const lines = text.split(/\r?\n/);
            for (let line of lines) {
                if (line.trim() === "") continue;
                const cells = [];
                let inQuote = false;
                let current = "";
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        inQuote = !inQuote;
                    } else if (ch === ',' && !inQuote) {
                        cells.push(current.trim());
                        current = "";
                    } else {
                        current += ch;
                    }
                }
                cells.push(current.trim());
                for (let i = 0; i < cells.length; i++) {
                    let val = cells[i];
                    if (val.startsWith('"') && val.endsWith('"')) {
                        val = val.slice(1, -1);
                    }
                    cells[i] = val;
                }
                rows.push(cells);
            }
            return rows;
        } catch (err) {
            console.error("CSV fetch error:", err);
            return null;
        }
    }

    // 1. CALL 状态：全表所有格子
    async function loadCallSet() {
        if (cachedCallSet !== null) return cachedCallSet;
        const rows = await fetchCSV(sheetA_CSV);
        if (!rows) return new Set();
        const merchantSet = new Set();
        for (const row of rows) {
            for (const cell of row) {
                const val = cell.trim();
                if (val.length > 0) merchantSet.add(val);
            }
        }
        cachedCallSet = merchantSet;
        console.log(`[CALL] 已加载 ${merchantSet.size} 个商家`);
        return cachedCallSet;
    }

    // 2. 访谈列表：第2行起，列索引0日期,1时间,2商家,3地址,4地图链接,5负责人,6语言,7手机
    async function loadInterviewList() {
        if (cachedInterviewList !== null) return cachedInterviewList;
        const rows = await fetchCSV(sheetB_CSV);
        if (!rows || rows.length < 2) return [];
        const dataRows = rows.slice(1);
        console.log(`[访谈] 原始数据行数（不含表头）: ${dataRows.length}`);
        const interviews = [];
        for (let idx = 0; idx < dataRows.length; idx++) {
            const row = dataRows[idx];
            const date = row[0] || "";
            const time = row[1] || "";
            const merchant = row[2] || "";
            const address = row[3] || "";
            const mapLink = row[4] || "";
            const leader = row[5] || "";
            const language = row[6] || "";
            const phone = row[7] || "";
            if (merchant === "") {
                console.warn(`[访谈] 第${idx+2}行商家名为空，仍将显示（占位）`);
            }
            interviews.push({ date, time, merchant: merchant || "（无名商家）", address, mapLink, leader, language, phone });
        }
        console.log(`[访谈] 成功解析 ${interviews.length} 条记录`);
        cachedInterviewList = interviews;
        return cachedInterviewList;
    }

    // 搜索 CALL 状态
    window.searchData = async function() {
        const searchInput = document.getElementById("searchInput");
        let keyword = searchInput.value.trim();
        if (keyword === "") {
            document.getElementById("result").innerHTML = `<div class="empty-message">✨ ${getText("placeholder")}</div>`;
            lastSearchKeyword = "";
            return;
        }
        lastSearchKeyword = keyword;
        document.getElementById("result").innerHTML = `<div class="loader">⏳ ${getText("loading")}</div>`;
        try {
            const callSet = await loadCallSet();
            const keywordLower = keyword.toLowerCase();
            const isCalled = Array.from(callSet).some(name => name.toLowerCase() === keywordLower);
            const badgeClass = isCalled ? "green" : "red";
            const statusText = isCalled ? getText("called") : getText("notCalled");
            const resultHtml = `
                <div class="card">
                    <div class="card-header">
                        <strong>${escapeHtml(keyword)}</strong>
                        <span class="badge ${badgeClass}">${statusText}</span>
                    </div>
                    <div class="info">📌 ${getText("merchant")}: ${escapeHtml(keyword)}</div>
                    <div class="info">📞 ${isCalled ? getText("called") : getText("notCalled")}</div>
                </div>
            `;
            document.getElementById("result").innerHTML = resultHtml;
        } catch (err) {
            console.error(err);
            document.getElementById("result").innerHTML = `<div class="empty-message">⚠️ ${getText("errorMsg")}</div>`;
        }
    };

    // 加载访谈卡片
    async function loadAllInterviews() {
        document.getElementById("result").innerHTML = `<div class="loader">📋 ${getText("loading")}</div>`;
        try {
            const interviews = await loadInterviewList();
            if (!interviews.length) {
                document.getElementById("result").innerHTML = `<div class="empty-message">📭 ${getText("noInterview")}</div>`;
                return;
            }
            let html = "";
            for (const item of interviews) {
                let datetimeStr = "";
                if (item.date && item.time) datetimeStr = `${item.date} ${item.time}`;
                else if (item.date) datetimeStr = item.date;
                else if (item.time) datetimeStr = item.time;
                else datetimeStr = "—";
                
                html += `
                    <div class="card">
                        <div class="datetime-dark">${getText("datetime")}: ${escapeHtml(datetimeStr)}</div>
                        <div class="merchant-name-large">${escapeHtml(item.merchant)}</div>
                        <div class="info">${getText("address")}: ${escapeHtml(item.address) || "—"}</div>
                        <div class="info">${getText("leader")}: ${escapeHtml(item.leader) || "—"}</div>
                        <div class="info">${getText("language")}: ${escapeHtml(item.language) || "—"}</div>
                        <div class="info">${getText("phone")}: ${escapeHtml(item.phone) || "—"}</div>
                        ${item.mapLink ? `<a class="map-btn" href="${escapeHtml(item.mapLink)}" target="_blank" rel="noopener noreferrer">${getText("map")} →</a>` : ""}
                    </div>
                `;
            }
            document.getElementById("result").innerHTML = html;
        } catch (err) {
            console.error(err);
            document.getElementById("result").innerHTML = `<div class="empty-message">❌ ${getText("errorMsg")}</div>`;
        }
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function refreshUILanguage() {
        document.getElementById("title").innerText = translations[currentLang].title;
        document.getElementById("subtitle").innerText = translations[currentLang].subtitle;
        document.getElementById("searchBtn").innerText = translations[currentLang].search;
        document.getElementById("searchInput").placeholder = translations[currentLang].placeholder;
        const modeCallBtn = document.getElementById("modeCallBtn");
        const modeInterviewBtn = document.getElementById("modeInterviewBtn");
        if (modeCallBtn) modeCallBtn.innerText = translations[currentLang].call;
        if (modeInterviewBtn) modeInterviewBtn.innerText = translations[currentLang].interview;

        if (currentMode === "call") {
            if (lastSearchKeyword && lastSearchKeyword.trim() !== "") {
                window.searchData();
            } else {
                const resultDiv = document.getElementById("result");
                if (resultDiv && (!resultDiv.innerHTML || resultDiv.innerHTML.includes("未找到") || resultDiv.innerHTML.includes("No matching"))) {
                    resultDiv.innerHTML = `<div class="empty-message">🔍 ${getText("placeholder")}</div>`;
                }
            }
        } else if (currentMode === "interview") {
            loadAllInterviews();
        }
    }

    function switchMode(mode) {
        currentMode = mode;
        const searchInput = document.getElementById("searchInput");
        const searchBtn = document.getElementById("searchBtn");
        if (mode === "call") {
            searchInput.style.display = "inline-block";
            searchBtn.style.display = "inline-block";
            if (lastSearchKeyword && lastSearchKeyword !== "") {
                window.searchData();
            } else {
                document.getElementById("result").innerHTML = `<div class="empty-message">🔍 ${getText("placeholder")}</div>`;
            }
        } else {
            searchInput.style.display = "none";
            searchBtn.style.display = "none";
            loadAllInterviews();
        }
    }

    function initModeButtons() {
        const callBtn = document.getElementById("modeCallBtn");
        const interviewBtn = document.getElementById("modeInterviewBtn");
        const setActive = (active) => {
            if (active === "call") {
                callBtn.classList.add("active");
                interviewBtn.classList.remove("active");
            } else {
                interviewBtn.classList.add("active");
                callBtn.classList.remove("active");
            }
        };
        callBtn.onclick = () => {
            if (currentMode === "call") return;
            setActive("call");
            switchMode("call");
        };
        interviewBtn.onclick = () => {
            if (currentMode === "interview") return;
            setActive("interview");
            switchMode("interview");
        };
    }

    // 初始化
    document.addEventListener("DOMContentLoaded", async () => {
        // 设置随机背景
        setRandomBackground();

        // 预加载数据
        loadCallSet().catch(e => console.warn);
        loadInterviewList().catch(e => console.warn);
        initModeButtons();

        const langBtn = document.getElementById("langToggle");
        langBtn.addEventListener("click", () => {
            currentLang = currentLang === "zh" ? "en" : "zh";
            langBtn.innerText = currentLang === "zh" ? "EN" : "中文";
            refreshUILanguage();
        });
        langBtn.innerText = "EN";

        currentMode = "call";
        document.getElementById("searchInput").style.display = "inline-block";
        document.getElementById("searchBtn").style.display = "inline-block";
        document.getElementById("result").innerHTML = `<div class="empty-message">🔍 ${getText("placeholder")}</div>`;
        document.getElementById("modeCallBtn").classList.add("active");
        document.getElementById("modeInterviewBtn").classList.remove("active");

        await loadCallSet();
        await loadInterviewList();
    });
})();