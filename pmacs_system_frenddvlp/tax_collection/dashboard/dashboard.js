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