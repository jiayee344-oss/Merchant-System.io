// ================= 自动扫描所有工作表（点击拨号 + 复制号码 + 访谈状态） =================
const SPREADSHEET_ID = '1rwMZAx8IYwU22DvDyovTr0NwoUeV08WF79jrGEEMgFw';
const INTERVIEW_SHEET_GID = '1770762674';

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
        loading: '正在自动发现并扫描所有工作表...',
        noResult: '未找到相关商家，请检查名称',
        errorMsg: '数据加载失败，请检查网络或表格权限',
        status: 'CALL状态',
        fromSheet: '来源工作表',
        phone: '电话',
        copy: '复制号码',
        interviewTitle: '📅 访谈时间列表'
    },
    en: {
        title: '📞 Merchant Call Status',
        subtitle: 'Auto-scan all sheets · Click for details',
        searchBtn: '🔍 Search',
        placeholder: 'Enter keyword',
        loading: 'Auto-discovering and scanning all sheets...',
        noResult: 'No matching merchant found',
        errorMsg: 'Failed to load data, check network or sheet permission',
        status: 'Call Status',
        fromSheet: 'Source Sheet',
        phone: 'Phone',
        copy: 'Copy Number',
        interviewTitle: '📅 Interview Schedule'
    }
};

async function getAllSheets() {
    return [
        { name: '工作表1', gid: '0' },
        { name: '工作表2', gid: '1919651570' },
        { name: '工作表3', gid: '1166122120' },
        { name: '工作表4', gid: '2101066600' },
        { name: '工作表5', gid: '777591929' },
        { name: '工作表6', gid: '1592112329' },
        { name: '工作表7', gid: '70200528' },
        { name: '工作表8', gid: '1088951287' },
        { name: '工作表9', gid: '1184046734' },
        { name: '工作表10', gid: '616949018' },
        { name: '工作表11', gid: '1908845895' },
        { name: '工作表12', gid: '1548218210' },
        { name: '工作表13', gid: '416772624' },
        { name: '工作表14', gid: '1640211163' },
        { name: '工作表15', gid: '1320716975' },
        { name: '工作表16', gid: '547116251' }
    ];
}

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

function findColumns(headers) {
    const lowerHeaders = headers.map(h => (h || '').toLowerCase());
    let nameIndex = -1;
    let statusIndex = -1;
    const nameKeywords = ['business', 'name', '商家', 'merchant', 'store', '店铺', '名称', 'business name'];
    const statusKeywords = ['status', 'state', '状态', 'call状态', '跟进状态'];
    
    for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        if (nameIndex === -1 && nameKeywords.some(kw => h.includes(kw))) nameIndex = i;
        if (statusIndex === -1 && statusKeywords.some(kw => h.includes(kw))) statusIndex = i;
    }
    if (nameIndex === -1 && headers.length > 0) nameIndex = 0;
    if (statusIndex === -1 && headers.length > 1) statusIndex = 1;
    return { nameIndex, statusIndex };
}

async function loadAllMerchants() {
    const sheets = await getAllSheets();
    const merchants = [];
    
    for (const sheet of sheets) {
        console.log(`📄 正在扫描工作表: ${sheet.name} (gid=${sheet.gid})`);
        try {
            const csvText = await fetchSheetCSV(sheet.gid);
            const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length < 2) {
                console.warn(`   ⚠️ 该工作表没有数据行`);
                continue;
            }
            
            const headers = parseCSVLine(lines[0]);
            const { nameIndex, statusIndex } = findColumns(headers);
            console.log(`   商家名列索引: ${nameIndex} (${headers[nameIndex] || '未命名列'})`);
            console.log(`   STATUS列索引: ${statusIndex} (${headers[statusIndex] || '未命名列'})`);
            
            let rowCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const row = parseCSVLine(lines[i]);
                if (row.length === 0) continue;
                const merchantName = nameIndex !== -1 && row[nameIndex] ? row[nameIndex].trim() : '';
                if (merchantName === '') continue;
                
                rowCount++;
                let rawStatus = 'NEW';
                if (statusIndex !== -1 && row[statusIndex]) {
                    rawStatus = row[statusIndex].trim().toUpperCase();
                }
                let matchedStatus = 'NEW';
                for (const key of Object.keys(STATUS_CONFIG)) {
                    if (rawStatus.includes(key.toUpperCase()) || rawStatus === key.toUpperCase()) {
                        matchedStatus = key;
                        break;
                    }
                }
                const statusInfo = STATUS_CONFIG[matchedStatus];
                
                merchants.push({
                    name: merchantName,
                    statusText: statusInfo.text,
                    statusType: statusInfo.type,
                    statusDesc: statusInfo.desc,
                    sheetName: sheet.name,
                    phone: row[2] || '—'
                });
            }
            console.log(`   ✅ 成功加载 ${rowCount} 个商家`);
        } catch (err) {
            console.error(`   ❌ 读取失败:`, err);
        }
    }
    
    console.log(`📊 总计加载 ${merchants.length} 个商家`);
    return merchants;
}

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
                <span class="merchant-name-small">${escapeHtml(m.name)}</span>
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

function showDetailModal(merchant) {
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');
    
    const phoneLabel = getText('phone');
    const statusLabel = getText('status');
    const sheetLabel = getText('fromSheet');
    const copyText = getText('copy');
    
    let phoneHtml = '';
    const phoneNumber = merchant.phone;
    if (phoneNumber && phoneNumber !== '—' && phoneNumber.trim() !== '') {
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
        if (cleanNumber) {
            phoneHtml = `
                <a href="tel:${cleanNumber}" style="color: #4f46e5; text-decoration: none; font-weight: 500; border-bottom: 1px dashed #4f46e5;">${escapeHtml(phoneNumber)}</a>
                <button class="dial-btn" data-number="${cleanNumber}">📋 ${copyText}</button>
            `;
        } else {
            phoneHtml = `<span>${escapeHtml(phoneNumber)}</span>`;
        }
    } else {
        phoneHtml = `<span>—</span>`;
    }
    
    modalBody.innerHTML = `
        <div class="detail-card status-${merchant.statusType}">
            <div class="merchant-name-large">${escapeHtml(merchant.name)}</div>
            <div class="info-row">
                <span class="info-label">${statusLabel}:</span>
                <span>${escapeHtml(merchant.statusText)} - ${escapeHtml(merchant.statusDesc)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📎 ${sheetLabel}:</span>
                <span>${escapeHtml(merchant.sheetName)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📞 ${phoneLabel}:</span>
                <div class="phone-with-btn">${phoneHtml}</div>
            </div>
        </div>
    `;
    
    const copyBtn = modalBody.querySelector('.dial-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const number = copyBtn.getAttribute('data-number');
            if (number && number !== '—') {
                navigator.clipboard.writeText(number).then(() => {
                    const originalText = copyBtn.innerText;
                    copyBtn.innerText = '✅ 已复制';
                    setTimeout(() => {
                        copyBtn.innerText = originalText;
                    }, 1500);
                }).catch(err => {
                    console.error('复制失败:', err);
                    alert('复制失败，请手动复制');
                });
            }
        });
    }
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// ========== 访谈时间功能（含STATUS） ==========
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

        let html = `<h3 style="margin-bottom: 16px; text-align: center;">${titleText}</h3>`;
        html += `<div style="display: flex; flex-direction: column; gap: 12px;">`;

        for (const row of rows) {
            // 列索引（从0开始）：
            // 0: STATUS, 1: DATE, 2: TIME, 3: BUSINESS NAME, 4: LOCATION, 5: LEADER, 6: LANGUAGE (可选)
            const statusRaw = (row[0] || '').trim().toUpperCase();
            const date = row[1] || '—';
            const time = row[2] || '—';
            const businessName = row[3] || '—';
            const location = row[4] || '';
            const leader = row[5] || '';
            const language = row[6] || '';

            let statusBadge = '';
            if (statusRaw === 'DONE') {
                statusBadge = '<span style="background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">✅ 已完成</span>';
            } else if (statusRaw === 'NOW') {
                statusBadge = '<span style="background: #fed7aa; color: #9b2c00; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">⏳ 进行中</span>';
            } else if (statusRaw !== '') {
                statusBadge = `<span style="background: #e2e8f0; color: #475569; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">📋 ${escapeHtml(statusRaw)}</span>`;
            } else {
                statusBadge = '<span style="background: #e2e8f0; color: #475569; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">📋 待定</span>';
            }

            let datetime = '';
            if (date !== '—' && time !== '—') datetime = `${date} ${time}`;
            else if (date !== '—') datetime = date;
            else if (time !== '—') datetime = time;

            html += `
                <div style="background: #f8fafc; border-radius: 24px; padding: 16px; border-left: 5px solid #4f46e5;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                        <div style="font-weight: 800; font-size: 1.1rem;">${escapeHtml(businessName)}</div>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 0.85rem; color: #334155;">📅 ${escapeHtml(datetime)}</div>
                    ${location ? `<div style="font-size: 0.85rem; color: #334155;">📍 ${escapeHtml(location)}</div>` : ''}
                    ${leader ? `<div style="font-size: 0.85rem; color: #334155;">👤 ${escapeHtml(leader)}</div>` : ''}
                    ${language ? `<div style="font-size: 0.85rem; color: #334155;">🌐 ${escapeHtml(language)}</div>` : ''}
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

// ========== 通用辅助函数 ==========
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
    if (keyword !== '' && allMerchants.length > 0) {
        searchData();
    } else if (allMerchants.length > 0) {
        document.getElementById('result').innerHTML = `<div class="empty-message">🔍 ${getText('placeholder')}</div>`;
    }
}

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