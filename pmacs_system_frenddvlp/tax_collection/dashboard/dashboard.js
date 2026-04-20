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

const firebaseApp = initializeApp(firebaseConfig);
const rtdb = getDatabase(firebaseApp);
const supabase = createClient(supabaseUrl, supabaseKey);

const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
})();

const CIRCUMFERENCE = 2 * Math.PI * 40;
let chartInstance = null;

const dateEl = document.getElementById("currentDate");
if (dateEl) {
    const options = { year: "numeric", month: "long", day: "numeric" };
    dateEl.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

const collectorEl = document.getElementById("collectorName");
if (collectorEl) {
    const name = sessionStorage.getItem('pmacs_name');
    if (name) collectorEl.innerHTML = `<i class="fa-solid fa-user-tie" style="margin-right:6px;"></i>${name}`;
}

window.handleLogout = () => { sessionStorage.clear(); window.location.href = "../../login_page/login.html"; };

function initPie(id) {
    const el = document.getElementById(id);
    if (el) el.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
}
initPie("pie-collected");
initPie("pie-attendance");

// LISTEN TO REALTIME DATABASE
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    if (!snapshot.exists()) { resetCollectorStats(); return; }

    const vendors = [];
    snapshot.forEach(childSnap => {
        const data = childSnap.val();
        // Only collect stats for TODAY
        if (data.collection_date === todayStr) {
            vendors.push(data);
        }
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

    setText("stat-total-money",      `₱${totalCollected.toFixed(2)}`);
    setText("stat-total-money-pie",  `₱${totalCollected.toFixed(2)}`);
    updatePie("pie-collected", collectedPct);

    setText("stat-pending",          unpaidCount);
    setText("stat-collected",        paidCount);
    setText("stat-attendance",       `${attendancePct}%`);
    setText("stat-attendance-pie",   `${attendancePct}%`);
    updatePie("pie-attendance", attendancePct);

    renderTodayChart(vendors);
});

function resetCollectorStats() {
    ["stat-total-money","stat-total-money-pie"].forEach(id => setText(id, "₱0.00"));
    ["stat-pending","stat-collected"].forEach(id => setText(id, "0"));
    setText("stat-attendance","0%");
    updatePie("pie-collected",0); updatePie("pie-attendance",0);
}

function renderTodayChart(vendors) {
    const canvas = document.getElementById('collectionChart');
    if (!canvas) return;
    if (chartInstance) { chartInstance.destroy(); }

    const areaMap = {};
    vendors.forEach(v => {
        if (v.is_present && v.has_paid && parseFloat(v.amount_paid) > 0) {
            const area = v.stall_area || 'Unknown';
            areaMap[area] = (areaMap[area] || 0) + parseFloat(v.amount_paid);
        }
    });

    const labels = Object.keys(areaMap);
    const data   = Object.values(areaMap);

    if (labels.length === 0) return;

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Collected (₱)',
                data,
                backgroundColor: 'rgba(39,174,96,0.75)',
                borderColor: '#27ae60',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
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