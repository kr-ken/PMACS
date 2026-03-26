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
    window.location.href = "../../login_page/login.html";
};

// ── Init pies ──
function initPie(id) {
    const el = document.getElementById(id);
    if (el) el.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
}
initPie("pie-collected");
initPie("pie-attendance");

// ── Tab switching — Daily only ──
window.switchTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Re-render chart with current today data
    if (window._todayVendors) renderTodayChart(window._todayVendors);
};

// ── RTDB: live today stats ──
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    const todayStr = new Date().toLocaleDateString('en-CA');

    if (!snapshot.exists()) { resetCollectorStats(); return; }

    const vendors = Object.values(snapshot.val()).filter(v => {
        // New format: collection_date field (local date string)
        if (v.collection_date) return v.collection_date === todayStr;
        // Old format fallback: derive local date from timestamp
        if (v.timestamp) {
            const ts = new Date(v.timestamp);
            const local = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}`;
            return local === todayStr;
        }
        return false;
    });
    if (!vendors.length) { resetCollectorStats(); return; }

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
    const collectedPct   = totalPotential > 0 ? (totalCollected / totalPotential) * 100 : 0;
    const attendancePct  = totalVendors   > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;

    window._collectorTodayStats = { totalCollected, totalToCollect, collectedPct, paidCount, unpaidCount, presentCount, absentCount, totalAbsentDues, attendancePct };
    window._todayVendors = vendors; // save for chart re-render

    setText("stat-total-money",      `₱${totalCollected.toFixed(2)}`);
    setText("stat-total-money-pie",  `₱${totalCollected.toFixed(2)}`);
    setText("legend-paid",           `₱${totalCollected.toFixed(2)}`);
    setText("legend-unpaid",         `₱${totalToCollect.toFixed(2)}`);
    updatePie("pie-collected", collectedPct);

    setText("stat-pending",          unpaidCount);
    setText("stat-collected",        paidCount);
    setText("stat-attendance",       `${attendancePct}%`);
    setText("stat-attendance-pie",   `${attendancePct}%`);
    setText("legend-present",        presentCount);
    setText("legend-present-pie",    presentCount);
    setText("legend-absent",         `${absentCount} (₱${totalAbsentDues.toFixed(2)} Dues)`);
    setText("legend-absent-pie",     absentCount);
    updatePie("pie-attendance", attendancePct);
    setText("card-paid-count",       paidCount);
    setText("card-unpaid-count",     unpaidCount);
    updateMiniBar(paidCount, unpaidCount);

    renderTodayChart(vendors);
    loadCollectorDebt();
}, (err) => console.error('[Dashboard] RTDB error:', err.message));

async function loadCollectorDebt() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const { data } = await supabase
        .from('tax_dscrpt_summary')
        .select('tax_recorded')
        .lt('collection_date', todayStr)
        .not('tax_recorded', 'is', null);
    if (!data) return;
    const debtTotal = data.reduce((s, r) => s + (parseFloat(r.tax_recorded) || 0), 0);
    const debtCount = data.length;
    setText('legend-debt',       `₱${debtTotal.toFixed(2)}`);
    setText('legend-debt-count', `${debtCount} cleared`);
    const s = window._collectorTodayStats || {};
    const grand    = (s.totalCollected || 0) + (s.totalToCollect || 0) + debtTotal;
    const todayPct = grand > 0 ? ((s.totalCollected || 0) / grand) * 100 : 0;
    const debtPct  = grand > 0 ? (debtTotal          / grand) * 100 : 0;
    updatePieTwo('pie-collected', 'pie-debt', todayPct, debtPct);
    const total = (s.totalCollected || 0) + debtTotal;
    setText('stat-total-money',     `₱${total.toFixed(2)}`);
    setText('stat-total-money-pie', `₱${total.toFixed(2)}`);
}

function resetCollectorStats() {
    ["stat-total-money","stat-total-money-pie","legend-paid","legend-unpaid","legend-debt"].forEach(id => setText(id, "₱0.00"));
    setText("legend-debt-count", "0 cleared");
    ["stat-pending","stat-collected","card-paid-count","card-unpaid-count","legend-present","legend-present-pie","legend-absent-pie"].forEach(id => setText(id, "0"));
    setText("stat-attendance","0%"); setText("stat-attendance-pie","0%");
    setText("legend-absent","0 (₱0.00 Dues)");
    updatePie("pie-collected",0); updatePie("pie-attendance",0);
    updateMiniBar(0,0);
    window._collectorTodayStats = null;
    loadCollectorDebt();
}

function updatePieTwo(greenId, yellowId, greenPct, yellowPct) {
    const g = document.getElementById(greenId);
    const y = document.getElementById(yellowId);
    if (g) g.style.strokeDasharray  = `${(greenPct/100)*CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    if (y) {
        y.style.strokeDasharray  = `${(yellowPct/100)*CIRCUMFERENCE} ${CIRCUMFERENCE}`;
        y.style.strokeDashoffset = `-${(greenPct/100)*CIRCUMFERENCE}`;
    }
}

// ══════════════════════════════════════════
// TODAY'S CHART — bar chart of paid vendors from Firebase
// Groups paid vendors by building/area, shows ₱ per area
// ══════════════════════════════════════════
function renderTodayChart(vendors) {
    const canvas = document.getElementById('collectionChart');
    if (!canvas) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    // Group paid vendors by area
    const areaMap = {};
    vendors.forEach(v => {
        if (v.is_present && v.has_paid && parseFloat(v.amount_paid) > 0) {
            const area = v.stall_area || 'Unknown';
            areaMap[area] = (areaMap[area] || 0) + parseFloat(v.amount_paid);
        }
    });

    const labels = Object.keys(areaMap);
    const data   = Object.values(areaMap);
    const hasData = data.length > 0 && data.some(v => v > 0);

    const emptyEl = document.getElementById('chartEmpty');

    if (!hasData) {
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const peak = Math.max(...data, 1);
    const rawMax = peak * 1.6;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const niceMax  = Math.ceil(rawMax / magnitude) * magnitude;
    const stepSize = niceMax / 5;

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Collected (₱)',
                data,
                backgroundColor: labels.map(() => 'rgba(39,174,96,0.75)'),
                borderColor:     labels.map(() => '#27ae60'),
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ₱${ctx.parsed.y.toFixed(2)}` }}
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' }, color: '#2c3e50' }},
                y: {
                    beginAtZero: true, max: niceMax,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11 }, color: '#7f8c8d', stepSize, callback: v => `₱${v}` }
                }
            }
        }
    });
}

// ── Init chart on load with empty state ──
function initEmptyChart() {
    const emptyEl = document.getElementById('chartEmpty');
    if (emptyEl) emptyEl.style.display = 'flex';
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
initEmptyChart();