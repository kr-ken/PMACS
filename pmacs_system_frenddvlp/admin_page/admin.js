import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, collection, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
    measurementId: "G-5LGY80N96Q"
};

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';

// Initialize Clients
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseKey);
const vendorsCollection = collection(db, "vendors");

// --- DASHBOARD UPDATES ---
function updateDashboard(docs) {
    let totalRevenue = 0;
    let collectedCount = 0;
    let pendingCount = 0;
    let presentCount = 0;
    const totalVendors = docs.length;

    docs.forEach(doc => {
        const data = doc.data();
        if (data.isPresent) presentCount++;
        if (data.hasPaid) {
            collectedCount++;
            // Assuming tax amount is stored or derived. Using a default for now if not in doc.
            totalRevenue += parseFloat(data.taxAmount || 0);
        } else {
            pendingCount++;
        }
    });

    const attendanceRate = totalVendors > 0 ? Math.round((presentCount / totalVendors) * 100) : 0;

    // Update UI elements
    document.getElementById('stat-total-money').textContent = `₱${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stat-collected').textContent = collectedCount;
    document.getElementById('stat-pending').textContent = pendingCount;
    document.getElementById('stat-attendance').textContent = `${attendanceRate}%`;
}
// --- DATE FORMATTING ---
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

// --- FETCH RECENT ACTIVITY ---
async function fetchRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;

    const { data: notifications, error } = await supabase
        .from('notification')
        .select('*')
        .order('notif_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching activity:", error);
        return;
    }

    activityList.innerHTML = "";
    if (notifications.length === 0) {
        activityList.innerHTML = "<p style='padding: 15px;'>No recent activity.</p>";
        return;
    }

    notifications.forEach(notif => {
        const date = new Date(notif.notif_at).toLocaleString();
        const card = document.createElement('div');
        card.className = `notif-card ${notif.is_read ? '' : 'unread'}`;
        card.innerHTML = `
            <div class="notif-info">
                <h4>${notif.notif_type || 'System Alert'}</h4>
                <p>${notif.message}</p>
                <span class="notif-time">${date}</span>
            </div>
        `;
        activityList.appendChild(card);
    });
}

// --- PAGE INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Smooth page entry
    document.body.classList.add('page-active');

    // Real-time Dashboard listener
    onSnapshot(vendorsCollection, (snapshot) => {
        updateDashboard(snapshot.docs);
    });

    fetchRecentActivity();
});
