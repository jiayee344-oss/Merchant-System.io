// ================= 配置 =================
const SPREADSHEET_ID = '1fxqxoCOwSu6eAGpsF7Si5xKA2e9Qvj7X';   // 新表格 ID
const INTERVIEW_SHEET_GID = '1770762674';  // 访谈时间工作表 gid（若新表有对应工作表请更新）

const STATUS_CONFIG = {
    'NEW': { text: '❌ 未CALL', type: 'new', desc: '还没有联系过，需要安排CALL' },
    'PENDING': { text: '⏳ 考虑中', type: 'pending', desc: '客户考虑过，需要再次跟进' },
    'FOLLOW UP': { text: '🔄 跟进中', type: 'followup', desc: '已有CALL，继续跟进' },
    'DONE': { text: '✅ 已完成', type: 'done', desc: '已经CALL过了‼️‼️' },
    'NO RESPONSE': { text: '📞 无回应', type: 'noresponse', desc: '拒绝过，但可以再尝试' }
};

let allMerchants = [];
let currentLang = 'zh';

const translations = {
    zh: {
        title: '📞 商家CALL状态查询',
        subtitle: '自动扫描所有工作表 · 点击商家查看详情',
        searchBtn: '🔍 搜索',
        placeholder: '输入关键字',
        loading: '正在并发加载所有工作表...',
        noResult: '未找到相关商家，请检查名称',
        errorMsg: '数据加载失败，请检查网络或表格权限',
        status: 'CALL状态',
        fromSheet: '来源工作表',
        phone: '电话',
        gmail: 'Gmail',
        location: '地址',
        subIndustry: '细分赛道',
        assignedTo: '负责人',
        copy: '复制',
        call: '呼叫',
        interviewTitle: '📅 访谈时间列表'
    },
    en: {
        title: '📞 Merchant Call Status',
        subtitle: 'Auto-scan all sheets · Click for details',
        searchBtn: '🔍 Search',
        placeholder: 'Enter keyword',
        loading: 'Loading all sheets concurrently...',
        noResult: 'No matching merchant found',
        errorMsg: 'Failed to load data, check network or sheet permission',
        status: 'Call Status',
        fromSheet: 'Source Sheet',
        phone: 'Phone',
        gmail: 'Gmail',
        location: 'Location',
        subIndustry: 'Sub-Industry',
        assignedTo: 'Assigned To',
        copy: 'Copy',
        call: 'Call',
        interviewTitle: '📅 Interview Schedule'
    }
};

// ================= 工作表列表 =================
async function getAllSheets() {
    return [
        { name: '工作表1', gid: '530830879' },
        { name: '工作表2', gid: '1298510436' },
        { name: '工作表3', gid: '1713420374' },
        { name: '工作表4', gid: '1048791622' },
        { name: '工作表5', gid: '1692092159' },
        { name: '工作表6', gid: '1091916158' },
        { name: '工作表7', gid: '1383305679' },
        { name: '工作表8', gid: '786942497' },
        { name: '工作表9', gid: '1306971373' },
        { name: '工作表10', gid: '662330292' },
        { name: '工作表11', gid: '37719134' }
    ];
}

// ================= CSV 解析 =================
async function fetchSheetCSV(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

function parseCSVLine(line) {
    const cells = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuote = !inQuote;
        } else if (ch === ',' && !inQuote) {
            cells.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current.trim());
    return cells.map(cell => {
        if (cell.startsWith('"') && cell.endsWith('"')) return cell.slice(1, -1);
        return cell;
    });
}

// 找到各列索引（按姓名、状态、电话、Gmail、地址、细分赛道、负责人）
function findColumns(headers) {
    const lowerHeaders = headers.map(h => (h || '').toLowerCase());
    const mapping = {
        status: -1,
        businessName: -1,
        phone: -1,
        gmail: -1,
        location: -1,
        subIndustry: -1,
        assignedTo: -1
    };

    // 关键词匹配
    const keywords = {
        status: ['status', 'state', '跟进状态'],
        businessName: ['business', 'name', '商家', 'merchant', 'store', '店铺', '名称'],
        phone: ['phone', '电话', 'tel'],
        gmail: ['gmail', 'email', '邮箱'],
        location: ['location', '地址', 'location'],
        subIndustry: ['sub-industry', 'subindustry', '细分赛道', '行业'],
        assignedTo: ['assigned to', 'assigned', '负责人', '跟进人']
    };

    for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        for (const [key, kws] of Object.entries(keywords)) {
            if (mapping[key] === -1 && kws.some(kw => h.includes(kw))) {
                mapping[key] = i;
            }
        }
    }

    // 备用：如果没找到，按位置猜测（A=0 状态，B=1 名称，C=2 电话，D=3 Gmail，E=4 地址，F=5 赛道，G=6 负责人）
    if (mapping.status === -1 && headers.length > 0) mapping.status = 0;
    if (mapping.businessName === -1 && headers.length > 1) mapping.businessName = 1;
    if (mapping.phone === -1 && headers.length > 2) mapping.phone = 2;
    if (mapping.gmail === -1 && headers.length > 3) mapping.gmail = 3;
    if (mapping.location === -1 && headers.length > 4) mapping.location = 4;
    if (mapping.subIndustry === -1 && headers.length > 5) mapping.subIndustry = 5;
    if (mapping.assignedTo === -1 && headers.length > 6) mapping.assignedTo = 6;

    return mapping;
}

// ================= 加载全部商家 =================
async function loadAllMerchants() {
    const sheets = await getAllSheets();
    const fetchPromises = sheets.map(async (sheet) => {
        try {
            console.log(`📄 并发请求: ${sheet.name} (gid=${sheet.gid})`);
            const csvText = await fetchSheetCSV(sheet.gid);
            const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length < 2) return [];

            const headers = parseCSVLine(lines[0]);
            const cols = findColumns(headers);
            const merchantsFromSheet = [];

            for (let i = 1; i < lines.length; i++) {
                const row = parseCSVLine(lines[i]);
                if (row.length === 0) continue;
                const merchantName = cols.businessName !== -1 && row[cols.businessName] ? row[cols.businessName].trim() : '';
                if (merchantName === '') continue;

                let rawStatus = 'NEW';
                if (cols.status !== -1 && row[cols.status]) {
                    rawStatus = row[cols.status].trim().toUpperCase();
                }
                let matchedStatus = 'NEW';
                for (const key of Object.keys(STATUS_CONFIG)) {
                    if (rawStatus.includes(key.toUpperCase()) || rawStatus === key.toUpperCase()) {
                        matchedStatus = key;
                        break;
                    }
                }
                const statusInfo = STATUS_CONFIG[matchedStatus];

                const phone = cols.phone !== -1 && row[cols.phone] ? row[cols.phone].trim() : '';
                const gmail = cols.gmail !== -1 && row[cols.gmail] ? row[cols.gmail].trim() : '';
                const location = cols.location !== -1 && row[cols.location] ? row[cols.location].trim() : '';
                const subIndustry = cols.subIndustry !== -1 && row[cols.subIndustry] ? row[cols.subIndustry].trim() : '';
                const assignedTo = cols.assignedTo !== -1 && row[cols.assignedTo] ? row[cols.assignedTo].trim() : '';

                merchantsFromSheet.push({
                    name: merchantName,
                    statusText: statusInfo.text,
                    statusType: statusInfo.type,
                    statusDesc: statusInfo.desc,
                    sheetName: sheet.name,
                    phone: phone || '—',
                    gmail: gmail || '—',
                    location: location || '—',
                    subIndustry: subIndustry || '—',
                    assignedTo: assignedTo || '—'
                });
            }
            console.log(`   ✅ ${sheet.name} 加载 ${merchantsFromSheet.length} 个商家`);
            return merchantsFromSheet;
        } catch (err) {
            console.error(`   ❌ 加载 ${sheet.name} 失败:`, err);
            return [];
        }
    });

    const results = await Promise.all(fetchPromises);
    const merchants = results.flat();
    console.log(`📊 总计加载 ${merchants.length} 个商家`);
    return merchants;
}

// ================= 渲染搜索结果 =================
function renderSearchResults(merchants) {
    const resultDiv = document.getElementById('result');
    if (!merchants || merchants.length === 0) {
        resultDiv.innerHTML = `<div class="empty-message">🔍 ${getText('noResult')}</div>`;
        return;
    }
    let html = '';
    for (let i = 0; i < merchants.length; i++) {
        const m = merchants[i];
        html += `
            <div class="result-item status-${m.statusType}" data-index="${i}">
                <div class="merchant-main">
                    <span class="merchant-name-small">${escapeHtml(m.name)}</span>
                    <span class="merchant-meta">${escapeHtml(m.location)} · ${escapeHtml(m.subIndustry)}</span>
                </div>
                <span class="badge-small badge-${m.statusType}">${m.statusText}</span>
            </div>
        `;
    }
    resultDiv.innerHTML = html;
    resultDiv.querySelectorAll('.result-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const idx = parseInt(el.getAttribute('data-index'));
            if (!isNaN(idx) && merchants[idx]) {
                showDetailModal(merchants[idx]);
            }
        });
    });
}

// ================= 详情模态框 =================
function showDetailModal(merchant) {
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');

    const labels = {
        status: getText('status'),
        sheet: getText('fromSheet'),
        phone: getText('phone'),
        gmail: getText('gmail'),
        location: getText('location'),
        subIndustry: getText('subIndustry'),
        assignedTo: getText('assignedTo'),
        copy: getText('copy'),
        call: getText('call')
    };

    const phoneNumber = merchant.phone;
    let phoneHtml = '';
    if (phoneNumber && phoneNumber !== '—') {
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
        phoneHtml = cleanNumber ? `
            <span style="font-weight:500;">${escapeHtml(phoneNumber)}</span>
            <div class="phone-buttons">
                <button class="call-btn" data-number="${cleanNumber}">📞 ${labels.call}</button>
                <button class="copy-btn" data-number="${cleanNumber}">📋 ${labels.copy}</button>
            </div>
        ` : `<span>${escapeHtml(phoneNumber)}</span>`;
    } else {
        phoneHtml = '<span>—</span>';
    }

    modalBody.innerHTML = `
        <div class="detail-card status-${merchant.statusType}">
            <div class="merchant-name-large">${escapeHtml(merchant.name)}</div>
            <div class="info-row">
                <span class="info-label">${labels.status}:</span>
                <span>${escapeHtml(merchant.statusText)} - ${escapeHtml(merchant.statusDesc)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📎 ${labels.sheet}:</span>
                <span>${escapeHtml(merchant.sheetName)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📞 ${labels.phone}:</span>
                ${phoneHtml}
            </div>
            <div class="info-row">
                <span class="info-label">📧 ${labels.gmail}:</span>
                <span>${escapeHtml(merchant.gmail)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📍 ${labels.location}:</span>
                <span>${escapeHtml(merchant.location)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🏷️ ${labels.subIndustry}:</span>
                <span>${escapeHtml(merchant.subIndustry)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">👤 ${labels.assignedTo}:</span>
                <span>${escapeHtml(merchant.assignedTo)}</span>
            </div>
        </div>
    `;

    // 绑定电话按钮事件
    const callBtn = modalBody.querySelector('.call-btn');
    if (callBtn) {
        callBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const number = callBtn.getAttribute('data-number');
            if (number) window.location.href = `tel:${number}`;
        });
    }
    const copyBtn = modalBody.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const number = copyBtn.getAttribute('data-number');
            if (number) {
                navigator.clipboard.writeText(number).then(() => {
                    const originalText = copyBtn.innerText;
                    copyBtn.innerText = '✅ 已复制';
                    setTimeout(() => { copyBtn.innerText = originalText; }, 1500);
                }).catch(() => alert('复制失败，请手动复制'));
            }
        });
    }

    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// ================= 访谈时间 =================
async function fetchInterviewData() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${INTERVIEW_SHEET_GID}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length === 0) continue;
        if (row.every(cell => !cell || cell.trim() === '')) continue;
        rows.push(row);
    }
    return rows;
}

async function showInterviewModal() {
    const modal = document.getElementById('interviewModal');
    const modalBody = document.getElementById('interviewModalBody');
    const titleText = getText('interviewTitle');
    modalBody.innerHTML = `<div class="loader">⏳ ${getText('loading')}</div>`;
    modal.style.display = 'block';
    try {
        const rows = await fetchInterviewData();
        if (!rows.length) {
            modalBody.innerHTML = `<div class="empty-message">📭 暂无访谈安排</div>`;
            return;
        }
        let html = `<h3 style="margin-bottom: 16px; text-align: center;">${titleText}</h3><div style="display: flex; flex-direction: column; gap: 12px;">`;
        for (const row of rows) {
            const statusRaw = (row[0] || '').trim().toUpperCase();
            const date = row[1] || '—';
            const time = row[2] || '—';
            const businessName = row[3] || '—';
            const location = row[4] || '';
            const leader = row[5] || '';
            const language = row[6] || '';
            let statusBadge = '';
            if (statusRaw === 'DONE') {
                statusBadge = '<span style="background:#d1fae5; color:#065f46; padding:2px 10px; border-radius:20px; font-size:0.7rem;">✅ 已完成</span>';
            } else if (statusRaw === 'NOW') {
                statusBadge = '<span style="background:#fed7aa; color:#9b2c00; padding:2px 10px; border-radius:20px; font-size:0.7rem;">⏳ 进行中</span>';
            } else {
                statusBadge = '<span style="background:#e2e8f0; color:#475569; padding:2px 10px; border-radius:20px; font-size:0.7rem;">📋 待定</span>';
            }
            let datetime = '';
            if (date !== '—' && time !== '—') datetime = `${date} ${time}`;
            else if (date !== '—') datetime = date;
            else if (time !== '—') datetime = time;
            html += `
                <div style="background:#f8fafc; border-radius:24px; padding:16px; border-left:5px solid #4f46e5;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                        <div style="font-weight:800; font-size:1.1rem;">${escapeHtml(businessName)}</div>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.85rem; color:#334155;">📅 ${escapeHtml(datetime)}</div>
                    ${location ? `<div style="font-size:0.85rem; color:#334155;">📍 ${escapeHtml(location)}</div>` : ''}
                    ${leader ? `<div style="font-size:0.85rem; color:#334155;">👤 ${escapeHtml(leader)}</div>` : ''}
                    ${language ? `<div style="font-size:0.85rem; color:#334155;">🌐 ${escapeHtml(language)}</div>` : ''}
                </div>
            `;
        }
        html += `</div>`;
        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<div class="empty-message">❌ ${getText('errorMsg')}</div>`;
    }
}

function closeInterviewModal() {
    document.getElementById('interviewModal').style.display = 'none';
}

// ================= 工具函数 =================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function getText(key) {
    return translations[currentLang][key] || translations.zh[key];
}

async function searchData() {
    const input = document.getElementById('searchInput');
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
        document.getElementById('result').innerHTML = `<div class="empty-message">✨ ${getText('placeholder')}</div>`;
        return;
    }
    if (allMerchants.length === 0) {
        document.getElementById('result').innerHTML = `<div class="loader">⏳ ${getText('loading')}</div>`;
        await initData();
    }
    const filtered = allMerchants.filter(m => m.name.toLowerCase().includes(keyword));
    renderSearchResults(filtered);
}

async function initData() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<div class="loader">⏳ ${getText('loading')}</div>`;
    try {
        allMerchants = await loadAllMerchants();
        if (allMerchants.length === 0) {
            resultDiv.innerHTML = `<div class="empty-message">⚠️ 未找到任何商家数据，请检查表格是否公开分享。</div>`;
        } else {
            resultDiv.innerHTML = `<div class="empty-message">🔍 ${getText('placeholder')}</div>`;
        }
    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `<div class="empty-message">❌ ${getText('errorMsg')}<br><small>${err.message}</small></div>`;
    }
}

function refreshUILanguage() {
    document.getElementById('title').innerText = translations[currentLang].title;
    document.getElementById('subtitle').innerText = translations[currentLang].subtitle;
    document.getElementById('searchBtn').innerHTML = getText('searchBtn');
    document.getElementById('searchInput').placeholder = getText('placeholder');
    const keyword = document.getElementById('searchInput').value.trim();
    if (keyword !== '' && allMerchants.length > 0) searchData();
    else if (allMerchants.length > 0) document.getElementById('result').innerHTML = `<div class="empty-message">🔍 ${getText('placeholder')}</div>`;
}

// ================= 初始化事件 =================
document.addEventListener('DOMContentLoaded', async () => {
    const langBtn = document.getElementById('langToggle');
    langBtn.addEventListener('click', () => {
        currentLang = currentLang === 'zh' ? 'en' : 'zh';
        langBtn.innerText = currentLang === 'zh' ? 'EN' : '中文';
        refreshUILanguage();
    });

    const modal = document.getElementById('detailModal');
    const closeBtn = document.querySelector('.close-btn');
    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    await initData();

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchData();
    });

    const interviewBtn = document.getElementById('interviewBtn');
    if (interviewBtn) interviewBtn.addEventListener('click', showInterviewModal);
    const closeInterviewBtn = document.getElementById('closeInterviewBtn');
    if (closeInterviewBtn) closeInterviewBtn.addEventListener('click', closeInterviewModal);
    window.addEventListener('click', (e) => {
        const interviewModal = document.getElementById('interviewModal');
        if (e.target === interviewModal) closeInterviewModal();
    });
});