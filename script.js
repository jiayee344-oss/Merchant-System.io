// ================= 自动扫描所有工作表（含拨号按钮） =================
const SPREADSHEET_ID = '1rwMZAx8IYwU22DvDyovTr0NwoUeV08WF79jrGEEMgFw';

// 状态映射
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
        placeholder: '输入商家名称（关键字）',
        loading: '正在自动发现并扫描所有工作表...',
        noResult: '未找到相关商家，请检查名称',
        errorMsg: '数据加载失败，请检查网络或表格权限',
        status: 'CALL状态',
        fromSheet: '来源工作表',
        phone: '电话',
        dial: '拨打'
    },
    en: {
        title: '📞 Merchant Call Status',
        subtitle: 'Auto-scan all sheets · Click for details',
        searchBtn: '🔍 Search',
        placeholder: 'Enter merchant name (partial match)',
        loading: 'Auto-discovering and scanning all sheets...',
        noResult: 'No matching merchant found',
        errorMsg: 'Failed to load data, check network or sheet permission',
        status: 'Call Status',
        fromSheet: 'Source Sheet',
        phone: 'Phone',
        dial: 'Call'
    }
};

// ========== 1. 获取所有工作表的元数据 ==========
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

// ========== 2. 获取单个工作表的CSV数据 ==========
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

// ========== 3. 加载所有工作表中的商家 ==========
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
                    phone: row[2] || '—'   // 电话从第3列读取（索引2）
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

// ========== 4. UI 渲染：搜索结果列表 ==========
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

// 显示详情模态框（电话行含拨打按钮）
function showDetailModal(merchant) {
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');
    
    const phoneLabel = getText('phone');
    const statusLabel = getText('status');
    const sheetLabel = getText('fromSheet');
    const dialText = getText('dial');
    
    // 处理拨号按钮
    let phoneHtml = '';
    const phoneNumber = merchant.phone;
    if (phoneNumber && phoneNumber !== '—' && phoneNumber.trim() !== '') {
        // 去除空格和特殊字符，只保留数字和+号（国际号码可能带+）
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
        if (cleanNumber) {
            phoneHtml = `
                <span>${escapeHtml(phoneNumber)}</span>
                <button class="dial-btn" onclick="window.location.href='tel:${cleanNumber}'">📞 ${dialText}</button>
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
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// ========== 5. 通用辅助函数 ==========
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

// 页面启动
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
});
