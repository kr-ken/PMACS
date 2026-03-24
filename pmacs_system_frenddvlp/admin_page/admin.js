import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    databaseURL: "https://pmacs-0001-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
};

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';

const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);
const supabase = createClient(supabaseUrl, supabaseKey);

const CIRCUMFERENCE = 2 * Math.PI * 40;
let currentTab = 'daily';
let chartInstance = null;

// ── Date display ──
const dateEl = document.getElementById("currentDate");
if (dateEl) {
    const options = { year: "numeric", month: "long", day: "numeric" };
    dateEl.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

// ── Collector name ──
const collectorEl = document.getElementById("collectorName");
if (collectorEl) {
    const name = sessionStorage.getItem('pmacs_name');
    if (name) collectorEl.innerHTML = `<i class="fa-solid fa-user-tie" style="margin-right:6px;"></i>${name}`;
}

// ── Logout ──
window.handleLogout = () => {
    sessionStorage.clear();
    window.location.href = "../login_page/login.html";
};

// ── Init pies ──
function initPie(id) {
    const el = document.getElementById(id);
    if (el) el.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
}
initPie("pie-collected");
initPie("pie-attendance");

// ── Tab switching ──
window.switchTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    loadChartData(tab);
};

// ── RTDB: live today stats ──
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    if (!snapshot.exists()) {
        setText("stat-total-money", "₱0.00");
        setText("legend-paid", "₱0.00");
        setText("legend-unpaid", "₱0.00");
        setText("stat-pending", 0);
        setText("stat-collected", 0);
        setText("stat-attendance", "0%");
        setText("legend-present", 0);
        setText("legend-absent", "0 (₱0.00 Dues)");
        return;
    }

    const vendors = Object.values(snapshot.val());
    let totalCollected = 0, totalToCollect = 0;
    let paidCount = 0, unpaidCount = 0;
    let presentCount = 0, absentCount = 0, totalAbsentDues = 0;
    const totalVendors = vendors.length;

    vendors.forEach(v => {
        if (v.is_present) {
            presentCount++;
            if (v.has_paid) { totalCollected += parseFloat(v.amount_paid) || 0; paidCount++; }
            else { totalToCollect += parseRefPrice(v.tax_reference); unpaidCount++; }
        } else {
            absentCount++;
            totalAbsentDues += parseRefPrice(v.tax_reference);
        }
    });

    const totalPotential = totalCollected + totalToCollect;
    const collectedPct = totalPotential > 0 ? (totalCollected / totalPotential) * 100 : 0;
    const attendancePct = totalVendors > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;

    setText("stat-total-money", `₱${totalCollected.toFixed(2)}`);
    setText("legend-paid",      `₱${totalCollected.toFixed(2)}`);
    setText("legend-unpaid",    `₱${totalToCollect.toFixed(2)}`);
    updatePie("pie-collected", collectedPct);

    setText("stat-pending",   unpaidCount);
    setText("stat-collected", paidCount);
    setText("stat-attendance",  `${attendancePct}%`);
    setText("legend-present",   presentCount);
    setText("legend-absent",    `${absentCount} (₱${totalAbsentDues.toFixed(2)} Dues)`);
    updatePie("pie-attendance", attendancePct);

    // Update vendor paid/unpaid chart card
    setText("card-paid-count",   paidCount);
    setText("card-unpaid-count", unpaidCount);
    updateMiniBar(paidCount, unpaidCount);

}, (err) => console.error('[Dashboard] RTDB error:', err.message));

// ── Supabase: historical chart data ──
async function loadChartData(tab) {
    const today = new Date();
    let startDate, labels, groupFn;

    if (tab === 'daily') {
        // Last 7 days
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 6);
        labels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
        // Timezone-safe: parse date string directly, not via UTC new Date()
        groupFn = (dateStr) => {
            const [y, m, d] = dateStr.split('-');
            return new Date(+y, +m - 1, +d)
                .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

    } else if (tab === 'weekly') {
        // Last 6 weeks
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 41);
        labels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i * 7);
            labels.push(`Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
        }
        groupFn = (date) => {
            const d = new Date(date);
            const diff = Math.floor((today - d) / (7 * 24 * 60 * 60 * 1000));
            const weekIdx = 5 - Math.min(diff, 5);
            return labels[weekIdx];
        };

    } else {
        // Last 6 months
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 5);
        startDate.setDate(1);
        labels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today);
            d.setMonth(today.getMonth() - i);
            labels.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
        }
        groupFn = (dateStr) => {
            const [y, m, d] = dateStr.split('-');
            return new Date(+y, +m - 1, +d)
                .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        };
    }

    const { data, error } = await supabase
        .from('tax_dscrpt_summary')
        .select('collection_date, tax_recorded')
        .gte('collection_date', startDate.toISOString().split('T')[0])
        .not('tax_recorded', 'is', null)   // only paid records
        .order('collection_date', { ascending: true });

    if (error) { console.error('loadChartData:', error.message); return; }

    // Group by label
    const collected = {};
    labels.forEach(l => collected[l] = 0);
    (data || []).forEach(row => {
        const label = groupFn(row.collection_date);
        if (label in collected) collected[label] += parseFloat(row.tax_recorded) || 0;
    });

    renderChart(labels, labels.map(l => collected[l]));
}

// ── Chart.js area chart ──
function renderChart(labels, data) {
    const canvas = document.getElementById('collectionChart');
    if (!canvas) return;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const hasData = data.some(v => v > 0);

    // Smart Y-axis: peak × 1.6, rounded up to nearest nice interval
    const peak = Math.max(...data, 1);
    const rawMax = peak * 1.6;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const niceMax = Math.ceil(rawMax / magnitude) * magnitude;
    const stepSize = niceMax / 5; // 5 grid lines

    chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Collected (₱)',
                data,
                borderColor: '#27ae60',
                backgroundColor: 'rgba(39,174,96,0.12)',
                pointBackgroundColor: '#27ae60',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₱${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#7f8c8d' }
                },
                y: {
                    beginAtZero: true,
                    max: niceMax,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { size: 11 },
                        color: '#7f8c8d',
                        stepSize,
                        callback: v => `₱${v % 1 === 0 ? v : v.toFixed(2)}`
                    }
                }
            }
        }
    });

    const emptyEl = document.getElementById('chartEmpty');
    if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'flex';
}

// ── Mini bar for paid vs unpaid ──
function updateMiniBar(paid, unpaid) {
    const total = paid + unpaid || 1;
    const paidBar = document.getElementById('bar-paid');
    const unpaidBar = document.getElementById('bar-unpaid');
    if (paidBar)   paidBar.style.width   = `${(paid / total) * 100}%`;
    if (unpaidBar) unpaidBar.style.width = `${(unpaid / total) * 100}%`;
}

function parseRefPrice(rangeStr) {
    if (!rangeStr || rangeStr === "N/A") return 0;
    const nums = rangeStr.match(/\d+(\.\d+)?/g);
    return nums ? parseFloat(nums[0]) : 0;
}

function updatePie(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.strokeDasharray = `${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ── Init ──
loadChartData('daily');

// ══════════════════════════════════════════
// RECEIPT — accounting-style daily receipt
// ══════════════════════════════════════════
window.openReceipt = async () => {
    const modal   = document.getElementById('receiptModal');
    const content = document.getElementById('receiptContent');
    if (!modal || !content) return;
    modal.style.display = 'flex';
    content.innerHTML   = '<p style="text-align:center;color:#94a3b8;">Generating receipt...</p>';

    const todayStr = new Date().toLocaleDateString('en-CA');
    const { data } = await supabase
        .from('tax_dscrpt_summary')
        .select('vendor_name, vendor_stall_name, area, product_services, tax_recorded, officials_name, collection_date')
        .eq('collection_date', todayStr)
        .not('tax_recorded', 'is', null)
        .order('area', { ascending: true });

    const rows  = data || [];
    const total = rows.reduce((s, r) => s + (parseFloat(r.tax_recorded) || 0), 0);
    const now   = new Date().toLocaleString('en-US', { dateStyle:'long', timeStyle:'short' });

    // Group by building/area
    const grouped = {};
    rows.forEach(r => {
        if (!grouped[r.area]) grouped[r.area] = [];
        grouped[r.area].push(r);
    });

    const divider = `<div style="border-top:1px dashed #ccc;margin:8px 0;"></div>`;
    let body = '';
    for (const [area, items] of Object.entries(grouped)) {
        body += `<div style="font-weight:800;color:#224263;font-size:12px;margin:10px 0 4px;
                             letter-spacing:1px;text-transform:uppercase;">── ${area} ──</div>`;
        items.forEach(r => {
            body += `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0;">
                <span>${r.vendor_name} <span style="color:#94a3b8;font-size:10px;">(${r.product_services})</span></span>
                <span style="font-weight:700;color:#27ae60;">₱${parseFloat(r.tax_recorded).toFixed(2)}</span>
            </div>`;
        });
    }

    content.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:18px;font-weight:800;color:#224263;letter-spacing:2px;">PMACS</div>
            <div style="font-size:11px;color:#94a3b8;">PUBLIC MARKET ADMINISTRATION</div>
            <div style="font-size:11px;color:#94a3b8;">COLLECTION SYSTEM</div>
            ${divider}
            <div style="font-size:12px;font-weight:700;color:#224263;">DAILY COLLECTION RECEIPT</div>
            <div style="font-size:11px;color:#7f8c8d;">${now}</div>
        </div>
        ${divider}
        ${body || '<div style="text-align:center;color:#94a3b8;font-size:12px;">No payments recorded today.</div>'}
        ${divider}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;margin-top:8px;">
            <span>TOTAL COLLECTED</span>
            <span style="color:#27ae60;">₱${total.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#7f8c8d;margin-top:4px;">
            <span>Vendors paid</span><span>${rows.length}</span>
        </div>
        ${rows[0] ? `<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Collector: ${rows[0].officials_name}</div>` : ''}
        ${divider}
        <div style="text-align:center;font-size:10px;color:#bdc3c7;margin-top:8px;">
            Generated by PMACS · ${todayStr}
        </div>`;
};

window.printReceipt = () => {
    const content = document.getElementById('receiptContent')?.innerHTML || '';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Receipt</title>
        <style>body{font-family:'Courier New',monospace;padding:20px;max-width:400px;margin:auto;}
        @media print{button{display:none}}</style></head>
        <body>${content}</body></html>`);
    w.document.close();
    w.print();
};

// ══════════════════════════════════════════
// HISTORY MODAL — collection & attendance history per date
// ══════════════════════════════════════════
let _historyData = [];
let _historyMode = 'collection';

window.openHistoryModal = async (mode) => {
    _historyMode = mode;
    const modal = document.getElementById('historyModal');
    const title = document.getElementById('historyModalTitle');
    const header = document.getElementById('historyModalHeader');
    if (!modal) return;

    title.textContent  = mode === 'collection' ? 'COLLECTION HISTORY' : 'ATTENDANCE HISTORY';
    header.style.background = mode === 'collection' ? '#27ae60' : '#2971b9';
    modal.style.display = 'flex';
    document.getElementById('historyDateSearch').value = '';
    document.getElementById('historyList').innerHTML = '<p style="text-align:center;color:#94a3b8;">Loading...</p>';

    // Fetch last 60 days grouped by date
    const start = new Date(); start.setDate(start.getDate() - 60);
    const { data } = await supabase
        .from('tax_dscrpt_summary')
        .select('collection_date, tax_recorded, vendor_id, vendor_name, area, is_present')
        .gte('collection_date', start.toISOString().split('T')[0])
        .order('collection_date', { ascending: false });

    _historyData = data || [];
    window.filterHistory();
};

window.filterHistory = () => {
    const search = document.getElementById('historyDateSearch')?.value;
    const list   = document.getElementById('historyList');
    if (!list) return;

    let rows = _historyData;
    if (search) rows = rows.filter(r => r.collection_date === search);

    // Group by date
    const byDate = {};
    rows.forEach(r => {
        if (!byDate[r.collection_date]) byDate[r.collection_date] = [];
        byDate[r.collection_date].push(r);
    });

    const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a)).slice(0, 30);

    if (!dates.length) {
        list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;">No records found.</p>';
        return;
    }

    list.innerHTML = dates.map(date => {
        const dayRows  = byDate[date];
        const paid     = dayRows.filter(r => r.tax_recorded !== null);
        const total    = paid.reduce((s, r) => s + (parseFloat(r.tax_recorded) || 0), 0);
        const dateLabel = new Date(date + 'T00:00:00')
            .toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

        if (_historyMode === 'collection') {
            // Group paid by area
            const byArea = {};
            paid.forEach(r => { if (!byArea[r.area]) byArea[r.area] = []; byArea[r.area].push(r); });
            const areaRows = Object.entries(byArea).map(([area, items]) =>
                `<div style="margin-top:6px;">
                    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:1px;">${area}</div>
                    ${items.map(r => `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0;">
                        <span style="color:#224263;">${r.vendor_name}</span>
                        <span style="color:#27ae60;font-weight:700;">₱${parseFloat(r.tax_recorded).toFixed(2)}</span>
                    </div>`).join('')}
                </div>`
            ).join('');

            return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-weight:800;color:#224263;font-size:13px;">${dateLabel}</span>
                    <span style="background:#f0fdf4;color:#27ae60;font-weight:800;font-size:13px;padding:3px 10px;border-radius:20px;">₱${total.toFixed(2)}</span>
                </div>
                ${areaRows || '<div style="font-size:12px;color:#94a3b8;">No payments</div>'}
            </div>`;
        } else {
            const present = dayRows.filter(r => r.tax_recorded !== null).length;
            const absent  = dayRows.length - present;
            const pct     = dayRows.length ? Math.round((present / dayRows.length) * 100) : 0;
            return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:800;color:#224263;font-size:13px;">${dateLabel}</span>
                    <span style="background:#eff6ff;color:#2971b9;font-weight:800;font-size:13px;padding:3px 10px;border-radius:20px;">${pct}%</span>
                </div>
                <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;">
                    <span><span style="color:#27ae60;font-weight:700;">●</span> Present: ${present}</span>
                    <span><span style="color:#e74c3c;font-weight:700;">●</span> Absent: ${absent}</span>
                    <span style="color:#94a3b8;">Total: ${dayRows.length}</span>
                </div>
            </div>`;
        }
    }).join('');
};

// ══════════════════════════════════════════
// RECENT ACTIVITY — enhanced with collection-done detection
// ══════════════════════════════════════════
onValue(ref(rtdb, 'notifications'), (snapshot) => {
    const listEl = document.getElementById('recent-activity-list');
    if (!listEl) return;

    const items = [];
    if (snapshot.exists()) snapshot.forEach(c => items.push(c.val()));
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const recent = items.slice(0, 5);

    const colorMap = { info:'#2971b9', success:'#27ae60', warning:'#f39c12', error:'#e74c3c' };
    const iconMap  = { info:'fa-info-circle', success:'fa-check-circle', warning:'fa-triangle-exclamation', error:'fa-circle-xmark' };

    // Check if today's collection is done (all present vendors paid)
    const todayStr = new Date().toLocaleDateString('en-CA');
    const vendors  = window._todayStats || {};
    const collectionDone = vendors.unpaidCount === 0 && vendors.paidCount > 0;

    let html = '';
    if (collectionDone) {
        html += `<div class="notif-card" style="border-left:4px solid #27ae60;background:#f0fdf4;">
            <div class="notif-info">
                <p style="font-weight:800;color:#27ae60;margin-bottom:3px;display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid fa-circle-check"></i> Collection Complete!
                </p>
                <p style="color:#7f8c8d;font-size:13px;">All present vendors have paid for today.</p>
                <span style="font-size:11px;color:#95a5a6;">${new Date().toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}</span>
            </div>
        </div>`;
    }

    html += recent.map(n => {
        const color = colorMap[n.type] || '#2971b9';
        const icon  = iconMap[n.type]  || 'fa-bell';
        const time  = n.createdAt ? new Date(n.createdAt).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }) : '—';
        return `<div class="notif-card ${n.read ? '' : 'unread'}" style="border-left:4px solid ${color};">
            <div class="notif-info">
                <p style="font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid ${icon}" style="color:${color};"></i>${n.title || 'Notification'}
                </p>
                <p style="color:#7f8c8d;font-size:13px;">${n.message || ''}</p>
                <span style="font-size:11px;color:#95a5a6;">${time}</span>
            </div>
        </div>`;
    }).join('');

    if (!html) html = `<div class="notif-card"><div class="notif-info"><p style="color:#7f8c8d;">No recent activity.</p></div></div>`;
    listEl.innerHTML = html;
});