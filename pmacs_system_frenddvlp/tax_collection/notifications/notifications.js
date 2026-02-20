// Notifications functionality for PMACS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot
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

// Notifications collection
const notificationsCollection = collection(db, "notifications");

// Render notifications
function renderNotifications(docs) {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    
    container.innerHTML = "";
    
    if (docs.length === 0) {
        container.innerHTML = `
            <div class="empty-notifications">
                <i class="fa-solid fa-bell-slash"></i>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }
    
    docs.forEach(doc => {
        const notification = doc.data();
        const timestamp = notification.createdAt ? notification.createdAt.toDate() : new Date();
        
        const item = document.createElement('div');
        item.className = 'notification-item';
        item.innerHTML = `
            <div class="notification-icon">
                <i class="fa-solid fa-bell"></i>
            </div>
            <div class="notification-content">
                <h4>${notification.title || 'Notification'}</h4>
                <p>${notification.message || ''}</p>
                <span class="notification-time">${formatTime(timestamp)}</span>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// Format timestamp
function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
}

// Load notifications
async function loadNotifications() {
    try {
        const q = query(notificationsCollection, orderBy('createdAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);
        renderNotifications(snapshot.docs);
    } catch (e) {
        console.error('Error loading notifications:', e);
    }
}

// Real-time listener
onSnapshot(notificationsCollection, (snapshot) => {
    renderNotifications(snapshot.docs);
});

// Initialize
loadNotifications();

// Add sample notification for testing
async function addSampleNotification() {
    const sample = {
        title: "Welcome to PMACS",
        message: "With PMACS, everything is just clicks away! Experience a faster, more accurate, and convenient way to track the tax progress—all in one place.",
        type: "info",
        createdAt: new Date()
    };
    
    try {
        await addDoc(notificationsCollection, sample);
    } catch (e) {
        console.log('Notification add skipped:', e.message);
    }
}


addSampleNotification();
