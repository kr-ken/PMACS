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

// ── Admin name ──
const adminNameEl = document.getElementById("adminName");
if (adminNameEl) {
    const name = sessionStorage.getItem('pmacs_name');
    if (name) adminNameEl.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${name}`;
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
    const todayStr = new Date().toLocaleDateString('en-CA');

    if (!snapshot.exists()) { resetStats(); return; }

    const vendors = Object.values(snapshot.val()).filter(v =>
        v.timestamp && new Date(v.timestamp).toLocaleDateString('en-CA') === todayStr
    );

    if (!vendors.length) { resetStats(); return; }

    let totalCollected = 0, totalToCollect = 0;
    let paidCount = 0, unpaidCount = 0;
    let presentCount = 0, absentCount = 0, totalAbsentDues = 0;

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

    const totalVendors   = vendors.length;
    const totalPotential = totalCollected + totalToCollect;
    const collectedPct   = totalPotential > 0 ? (totalCollected / totalPotential) * 100 : 0;
    const attendancePct  = totalVendors   > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;

    window._todayStats = { totalCollected, totalToCollect, collectedPct, paidCount, unpaidCount, presentCount, absentCount, totalAbsentDues, attendancePct };
    renderStats(window._todayStats);
    loadDebtPayments(); // also fetch today's cleared debts from Supabase

}, (err) => console.error('[Admin] RTDB error:', err.message));

// ── Supabase: debt payments cleared today (past dates paid today) ──
async function loadDebtPayments() {
    // Debt payments = Supabase rows with collection_date < today but tax_recorded IS NOT NULL
    // We can't easily know "paid today" without a paid_at timestamp,
    // so we show total cleared debts (non-null past records) as a yellow indicator
    const todayStr = new Date().toLocaleDateString('en-CA');
    const { data } = await supabase
        .from('tax_dscrpt_summary')
        .select('tax_recorded, collection_date')
        .lt('collection_date', todayStr)
        .not('tax_recorded', 'is', null);

    if (!data) return;
    const debtTotal = data.reduce((sum, r) => sum + (parseFloat(r.tax_recorded) || 0), 0);
    const debtCount = data.length;

    setText('legend-debt',       `₱${debtTotal.toFixed(2)}`);
    setText('legend-debt-count', `${debtCount} cleared`);

    // Update pie: add debt as yellow segment on collection rate
    const s = window._todayStats || {};
    const todayCollected = s.totalCollected || 0;
    const todayUnpaid    = s.totalToCollect  || 0;
    const grandTotal     = todayCollected + todayUnpaid + debtTotal;
    const todayPct       = grandTotal > 0 ? (todayCollected / grandTotal) * 100 : 0;
    const debtPct        = grandTotal > 0 ? (debtTotal      / grandTotal) * 100 : 0;
    updatePieThree('pie-collected', 'pie-debt', todayPct, debtPct);

    setText('stat-total-money', `₱${(todayCollected + debtTotal).toFixed(2)}`);
}

function renderStats(s) {
    setText("stat-total-money",    `₱${s.totalCollected.toFixed(2)}`);
    setText("legend-paid",         `₱${s.totalCollected.toFixed(2)}`);
    setText("legend-unpaid",       `₱${s.totalToCollect.toFixed(2)}`);
    setText("pie-collected-label", `${Math.round(s.collectedPct)}%`);
    updatePie("pie-collected", s.collectedPct);
    setText("stat-pending",        s.unpaidCount);
    setText("stat-collected",      s.paidCount);
    setText("card-paid-count",     s.paidCount);
    setText("card-unpaid-count",   s.unpaidCount);
    setText("stat-attendance",     `${s.attendancePct}%`);
    setText("legend-present",      s.presentCount);
    setText("legend-absent",       `${s.absentCount} (₱${s.totalAbsentDues.toFixed(2)} Dues)`);
    setText("pie-attendance-label",`${s.attendancePct}%`);
    setText("legend-present-pie",  s.presentCount);
    setText("legend-absent-pie",   s.absentCount);
    updatePie("pie-attendance", s.attendancePct);
    updateMiniBar(s.paidCount, s.unpaidCount);
}

function resetStats() {
    ["stat-total-money","legend-paid","legend-unpaid"].forEach(id => setText(id, "₱0.00"));
    setText("legend-debt", "₱0.00");
    setText("legend-debt-count", "0 cleared");
    ["stat-pending","stat-collected","card-paid-count","card-unpaid-count",
     "legend-present","legend-absent-pie","legend-present-pie"].forEach(id => setText(id, "0"));
    setText("stat-attendance", "0%");
    setText("pie-collected-label", "0%");
    setText("pie-attendance-label", "0%");
    setText("legend-absent", "0 (₱0.00 Dues)");
    updatePie("pie-collected", 0);
    updatePie("pie-attendance", 0);
    updateMiniBar(0, 0);
    window._todayStats = null;
    loadDebtPayments();
}

// Two-arc pie for collection: green (today paid) + yellow (debt cleared)
function updatePieThree(greenId, yellowId, greenPct, yellowPct) {
    const greenEl  = document.getElementById(greenId);
    const yellowEl = document.getElementById(yellowId);
    if (greenEl)  greenEl.style.strokeDasharray  = `${(greenPct  / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    if (yellowEl) {
        // Yellow arc starts after green arc
        const greenLen = (greenPct / 100) * CIRCUMFERENCE;
        yellowEl.style.strokeDasharray  = `${(yellowPct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
        yellowEl.style.strokeDashoffset = `-${greenLen}`;
    }
}

// ── RTDB: recent activity from Firebase notifications ──
onValue(ref(rtdb, 'notifications'), (snapshot) => {
    const listEl = document.getElementById('recent-activity-list');
    if (!listEl) return;

    if (!snapshot.exists()) {
        listEl.innerHTML = `<div class="notif-card"><div class="notif-info"><p style="color:#7f8c8d;">No recent activity.</p></div></div>`;
        return;
    }

    const items = [];
    snapshot.forEach(c => items.push(c.val()));
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const recent = items.slice(0, 5);

    const colorMap = { info:'#2971b9', success:'#27ae60', warning:'#f39c12', error:'#e74c3c' };
    const iconMap  = { info:'fa-info-circle', success:'fa-check-circle', warning:'fa-triangle-exclamation', error:'fa-circle-xmark' };

    listEl.innerHTML = recent.map(n => {
        const color = colorMap[n.type] || '#2971b9';
        const icon  = iconMap[n.type]  || 'fa-bell';
        const time  = n.createdAt ? new Date(n.createdAt).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }) : '—';
        return `<div class="notif-card ${n.read ? '' : 'unread'}" style="border-left:4px solid ${color};">
            <div class="notif-info">
                <p style="font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid ${icon}" style="color:${color};"></i>
                    ${n.title || 'Notification'}
                </p>
                <p style="color:#7f8c8d;font-size:13px;">${n.message || ''}</p>
                <span style="font-size:11px;color:#95a5a6;">${time}</span>
            </div>
        </div>`;
    }).join('');
});

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
        groupFn = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
        groupFn = (date) => new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const { data, error } = await supabase
        .from('tax_dscrpt_summary')
        .select('collection_date, tax_recorded')
        .gte('collection_date', startDate.toISOString().split('T')[0])
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
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { size: 11 },
                        color: '#7f8c8d',
                        callback: v => `₱${v}`
                    }
                }
            }
        }
    });

    // Show empty state if no data
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