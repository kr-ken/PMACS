import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
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
const vendorsCollection = collection(db, "vendors");

// Tax rate table
const taxRates = {
    Meat: 35,
    Vegetables: 25,
    Fish: 25,
    "Dry Goods": 15,
    Default: 0,
};

const options = { year: "numeric", month: "long", day: "numeric" };
const dateElement = document.getElementById("currentDate");

if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}


function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = String(text).toUpperCase();
    return div.innerHTML;
}
// Update dashboard stats with pie charts
async function updateDashboardStats() {
    const snapshot = await getDocs(vendorsCollection);
    
    let totalCollected = 0;
    let totalPending = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let presentCount = 0;
    let absentCount = 0;
    const totalVendors = snapshot.docs.length;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const price = taxRates[data.stallType] || taxRates.Default;
        
        // Tax collection calculations
        if (data.hasPaid) {
            totalCollected += price;
            paidCount++;
        } else {
            totalPending += price;
            unpaidCount++;
        }
        
        // Attendance calculations
        if (data.isPresent) {
            presentCount++;
        } else {
            absentCount++;
        }
    });

    // Update Total Collected row
    document.getElementById('stat-total-money').textContent = `P${totalCollected}`;
    document.getElementById('legend-paid').textContent = `P${totalCollected}`;
    document.getElementById('legend-unpaid').textContent = `P${totalPending}`;
    
    // Update pie chart for collected
    const totalTax = totalCollected + totalPending;
    const collectedPercent = totalTax > 0 ? (totalCollected / totalTax) * 100 : 0;
    const pieCollected = document.getElementById('pie-collected');
    const circumference = 2 * Math.PI * 40; // r=40
    pieCollected.style.strokeDasharray = `${(collectedPercent / 100) * circumference} ${circumference}`;
    pieCollected.style.strokeDashoffset = '0';

    // Update Pending Tax row
    document.getElementById('stat-pending').textContent = unpaidCount;
    document.getElementById('stat-collected').textContent = paidCount;

    // Update Attendance Rate row
    const attendancePercent = totalVendors > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;
    document.getElementById('stat-attendance').textContent = `${attendancePercent}%`;
    document.getElementById('legend-present').textContent = presentCount;
    document.getElementById('legend-absent').textContent = absentCount;
    
    // Update pie chart for attendance
    const pieAttendance = document.getElementById('pie-attendance');
    pieAttendance.style.strokeDasharray = `${(attendancePercent / 100) * circumference} ${circumference}`;
    pieAttendance.style.strokeDashoffset = '0';
}

// Initial load
updateDashboardStats();
