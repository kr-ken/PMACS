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
const realtimeCollection = collection(db, "vendor_realtime");

// --- UI LOGIC: DATE ---
const options = { year: "numeric", month: "long", day: "numeric" };
const dateElement = document.getElementById("currentDate");
if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

// Real-time listener for the dashboard
onSnapshot(realtimeCollection, (snapshot) => {
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

        // 1. Attendance stats
        if (data.is_present) {
            presentCount++;
        } else {
            absentCount++;
            // Automatically compute dues for absent vendors based on tax_reference
            const refPrice = parseRefPrice(data.tax_reference);
            totalAbsentDues += refPrice;
        }

        // 2. Collection stats
        if (data.has_paid) {
            totalCollected += parseFloat(data.amount_paid) || 0;
            paidCount++;
        } else {
            // "To be collected" are those who are present but haven't paid
            if (data.is_present) {
                totalToCollect += parseRefPrice(data.tax_reference);
                unpaidCount++;
            }
        }
    });

    updateUI(totalCollected, totalToCollect, paidCount, unpaidCount, presentCount, absentCount, totalAbsentDues, totalVendors);
});

// Helper to extract a single numeric value from strings like "P4.75 to P20" (takes the minimum/average or specific logic)
function parseRefPrice(rangeStr) {
    if (!rangeStr || rangeStr === "N/A") return 0;
    const numbers = rangeStr.match(/\d+(\.\d+)?/g);
    if (!numbers) return 0;
    // For dues logic, we take the first number (minimum) as the reference
    return parseFloat(numbers[0]);
}

function updateUI(totalCollected, totalToCollect, paidCount, unpaidCount, presentCount, absentCount, totalAbsentDues, totalVendors) {
    // Update Revenue Card
    document.getElementById('stat-total-money').textContent = `₱${totalCollected.toFixed(2)}`;
    document.getElementById('legend-paid').textContent = `₱${totalCollected.toFixed(2)}`;
    document.getElementById('legend-unpaid').textContent = `₱${totalToCollect.toFixed(2)}`;
    
    // Update pie chart for collected vs to-collect
    const totalPotential = totalCollected + totalToCollect;
    const collectedPercent = totalPotential > 0 ? (totalCollected / totalPotential) * 100 : 0;
    const pieCollected = document.getElementById('pie-collected');
    const circumference = 2 * Math.PI * 40;
    if (pieCollected) {
        pieCollected.style.strokeDasharray = `${(collectedPercent / 100) * circumference} ${circumference}`;
    }

    // Update Collected/Pending Count
    const statPending = document.getElementById('stat-pending');
    if (statPending) statPending.textContent = unpaidCount;

    const statCollected = document.getElementById('stat-collected');
    if (statCollected) statCollected.textContent = paidCount;

    // Update Attendance Card
    const attendancePercent = totalVendors > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;
    const statAttendance = document.getElementById('stat-attendance');
    if (statAttendance) statAttendance.textContent = `${attendancePercent}%`;

    const legendPresent = document.getElementById('legend-present');
    if (legendPresent) legendPresent.textContent = presentCount;

    const legendAbsent = document.getElementById('legend-absent');
    if (legendAbsent) legendAbsent.textContent = `${absentCount} (₱${totalAbsentDues.toFixed(2)} Dues)`;
    
    // Update pie chart for attendance
    const pieAttendance = document.getElementById('pie-attendance');
    if (pieAttendance) {
        pieAttendance.style.strokeDasharray = `${(attendancePercent / 100) * circumference} ${circumference}`;
    }
}
