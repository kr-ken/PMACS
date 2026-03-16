import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
    measurementId: "G-5LGY80N96Q",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── IMPORTANT: Change this to match the collection your tax page writes to ──
// Open Firebase Console → Firestore → check the exact collection name
const COLLECTION_NAME = "vendor_realtime"; // ← verify this matches your Firestore

const realtimeCollection = collection(db, COLLECTION_NAME);

// Pie chart circumference for r=40: 2 * PI * 40
const CIRCUMFERENCE = 2 * Math.PI * 40; // ≈ 251.33

// --- UI LOGIC: DATE ---
const dateElement = document.getElementById("currentDate");
if (dateElement) {
    const options = { year: "numeric", month: "long", day: "numeric" };
    dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

// Initialize pie charts to 0 so they don't show a broken arc on load
function initPieChart(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
        el.style.strokeDashoffset = "0";
    }
}
initPieChart("pie-collected");
initPieChart("pie-attendance");

// Real-time listener for the dashboard
onSnapshot(realtimeCollection, (snapshot) => {
    // Debug: log how many docs were received
    console.log(`[Dashboard] Snapshot received: ${snapshot.docs.length} documents from "${COLLECTION_NAME}"`);

    if (snapshot.docs.length === 0) {
        console.warn(`[Dashboard] No documents found in "${COLLECTION_NAME}". ` +
            `Check the collection name in Firestore Console.`);
    }

    let totalCollected = 0;
    let totalToCollect = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let presentCount = 0;
    let absentCount = 0;
    let totalAbsentDues = 0;

    const totalVendors = snapshot.docs.length;

    snapshot.docs.forEach(doc => {
        const data = doc.data();

        // Debug: log each document's relevant fields
        console.log(`[Doc ${doc.id}]`, {
            is_present: data.is_present,
            has_paid: data.has_paid,
            amount_paid: data.amount_paid,
            tax_reference: data.tax_reference,
        });

        // 1. Attendance stats
        if (data.is_present) {
            presentCount++;
        } else {
            absentCount++;
            const refPrice = parseRefPrice(data.tax_reference);
            totalAbsentDues += refPrice;
        }

        // 2. Collection stats
        if (data.has_paid) {
            totalCollected += parseFloat(data.amount_paid) || 0;
            paidCount++;
        } else {
            // Only present + unpaid vendors count as "to collect"
            if (data.is_present) {
                totalToCollect += parseRefPrice(data.tax_reference);
                unpaidCount++;
            }
        }
    });

    updateUI(totalCollected, totalToCollect, paidCount, unpaidCount,
             presentCount, absentCount, totalAbsentDues, totalVendors);

}, (error) => {
    // This fires if Firestore rules block access or the collection doesn't exist
    console.error("[Dashboard] Firestore onSnapshot error:", error.code, error.message);
});

// Helper: extract numeric value from strings like "P4.75 to P20" → returns first number
function parseRefPrice(rangeStr) {
    if (!rangeStr || rangeStr === "N/A") return 0;
    const numbers = rangeStr.match(/\d+(\.\d+)?/g);
    if (!numbers) return 0;
    return parseFloat(numbers[0]);
}

function updatePie(elementId, percent) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const filled = (percent / 100) * CIRCUMFERENCE;
    el.style.strokeDasharray = `${filled} ${CIRCUMFERENCE}`;
}

function updateUI(totalCollected, totalToCollect, paidCount, unpaidCount,
                  presentCount, absentCount, totalAbsentDues, totalVendors) {

    // ── Revenue Card ──
    const totalPotential = totalCollected + totalToCollect;
    const collectedPercent = totalPotential > 0
        ? (totalCollected / totalPotential) * 100
        : 0;

    setText("stat-total-money", `₱${totalCollected.toFixed(2)}`);
    setText("legend-paid",      `₱${totalCollected.toFixed(2)}`);
    setText("legend-unpaid",    `₱${totalToCollect.toFixed(2)}`);
    updatePie("pie-collected", collectedPercent);

    // ── Pending / Collected counts ──
    setText("stat-pending",   unpaidCount);
    setText("stat-collected", paidCount);

    // ── Attendance Card ──
    const attendancePercent = totalVendors > 0
        ? Math.round((presentCount / totalVendors) * 100)
        : 0;

    setText("stat-attendance",  `${attendancePercent}%`);
    setText("legend-present",   presentCount);
    setText("legend-absent",    `${absentCount} (₱${totalAbsentDues.toFixed(2)} Dues)`);
    updatePie("pie-attendance", attendancePercent);
}

// Small helper to safely set textContent
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}