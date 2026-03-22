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

// ── Auth ──
function requireAuth() {
    const role = sessionStorage.getItem('pmacs_role');
    if (!role || role !== 'collector') {
        window.location.href = '../../login_page/login.html';
    }
}

// ── Logout ──
window.handleLogout = () => {
    sessionStorage.clear();
    window.location.href = '../../login_page/login.html';
};

// ── UI Helpers ──
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updatePie(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.strokeDasharray = `${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
}

function parseRefPrice(rangeStr) {
    if (!rangeStr || rangeStr === "N/A") return 0;
    const nums = rangeStr.match(/\d+(\.\d+)?/g);
    return nums ? parseFloat(nums[0]) : 0;
}

// ── Live Stats ──
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    if (!snapshot.exists()) return;
    const vendors = Object.values(snapshot.val());

    let totalCollected = 0, totalToCollect = 0;
    let presentCount = 0, totalVendors = vendors.length;

    vendors.forEach(v => {
        if (v.is_present) {
            presentCount++;
            if (v.has_paid) totalCollected += parseFloat(v.amount_paid) || 0;
            else totalToCollect += parseRefPrice(v.tax_reference);
        }
    });

    const totalPotential = totalCollected + totalToCollect;
    const collectedPct = totalPotential > 0 ? (totalCollected / totalPotential) * 100 : 0;
    const attendancePct = totalVendors > 0 ? (presentCount / totalVendors) * 100 : 0;

    setText('stat-total-money', `₱${totalCollected.toFixed(2)}`);
    setText('stat-attendance', `${Math.round(attendancePct)}%`);
    updatePie('pie-collected', collectedPct);
    setText('pie-collected-label', `${Math.round(collectedPct)}%`);
    updatePie('pie-attendance', attendancePct);
    setText('pie-attendance-label', `${Math.round(attendancePct)}%`);
});

requireAuth();