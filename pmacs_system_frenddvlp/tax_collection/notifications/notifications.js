// Notifications functionality for PMACS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    doc,
    query,
    orderBy,
    limit,
    onSnapshot,
    writeBatch
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

// Track whether this is the first snapshot load (to avoid banners on initial page load)
let isInitialLoad = true;
let knownIds = new Set();

// Render notifications list
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

    docs.forEach(docSnap => {
        const notification = docSnap.data();
        const timestamp = notification.createdAt ? notification.createdAt.toDate() : new Date();
        const isRead = notification.read === true;

        const item = document.createElement('div');
        item.className = `notification-item${isRead ? ' read' : ' unread'}`;
        item.dataset.id = docSnap.id;
        item.innerHTML = `
            <div class="notification-icon">
                <i class="fa-solid fa-bell"></i>
            </div>
            <div class="notification-content">
                <h4>${notification.title || 'Notification'}</h4>
                <p>${notification.message || ''}</p>
                <span class="notification-time">${formatTime(timestamp)}</span>
            </div>
            ${!isRead ? '<span class="unread-dot"></span>' : ''}
        `;

        // Click to mark individual notification as read
        item.addEventListener('click', () => markAsRead(docSnap.id, item));

        container.appendChild(item);
    });
}

// Mark a single notification as read
async function markAsRead(id, itemEl) {
    try {
        await updateDoc(doc(db, "notifications", id), { read: true });
        itemEl.classList.remove('unread');
        itemEl.classList.add('read');
        const dot = itemEl.querySelector('.unread-dot');
        if (dot) dot.remove();
    } catch (e) {
        console.error('Error marking as read:', e);
    }
}

// Mark all notifications as read
async function markAllAsRead() {
    try {
        const snapshot = await getDocs(notificationsCollection);
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => {
            if (!docSnap.data().read) {
                batch.update(doc(db, "notifications", docSnap.id), { read: true });
            }
        });
        await batch.commit();

        // Update UI immediately
        document.querySelectorAll('.notification-item.unread').forEach(el => {
            el.classList.remove('unread');
            el.classList.add('read');
            const dot = el.querySelector('.unread-dot');
            if (dot) dot.remove();
        });
    } catch (e) {
        console.error('Error marking all as read:', e);
    }
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

// Show a bottom-left banner for new notifications
function showBanner(notification) {
    const container = document.getElementById('banner-container');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `
        <div class="banner-icon">
            <i class="fa-solid fa-bell"></i>
        </div>
        <div class="banner-body">
            <strong>${notification.title || 'Notification'}</strong>
            <p>${notification.message || ''}</p>
        </div>
        <button class="banner-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(banner);

    // Trigger slide-in animation
    requestAnimationFrame(() => banner.classList.add('banner-visible'));

    // Auto-dismiss after 5 seconds
    const autoDismiss = setTimeout(() => dismissBanner(banner), 5000);

    // Manual dismiss
    banner.querySelector('.banner-close').addEventListener('click', () => {
        clearTimeout(autoDismiss);
        dismissBanner(banner);
    });
}

function dismissBanner(banner) {
    banner.classList.remove('banner-visible');
    banner.classList.add('banner-hiding');
    banner.addEventListener('transitionend', () => banner.remove(), { once: true });
}

// Load notifications with ordering
async function loadNotifications() {
    try {
        const q = query(notificationsCollection, orderBy('createdAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);

        // Seed known IDs so real-time listener doesn't banner existing ones
        snapshot.docs.forEach(d => knownIds.add(d.id));

        renderNotifications(snapshot.docs);
    } catch (e) {
        console.error('Error loading notifications:', e);
    }
}

// Real-time listener — only banners NEW notifications added after page load
function startRealtimeListener() {
    const q = query(notificationsCollection, orderBy('createdAt', 'desc'), limit(20));

    onSnapshot(q, (snapshot) => {
        if (isInitialLoad) {
            // On first fire, just seed IDs (loadNotifications already rendered)
            snapshot.docs.forEach(d => knownIds.add(d.id));
            isInitialLoad = false;
            return;
        }

        // Re-render the list
        renderNotifications(snapshot.docs);

        // Show banners only for truly new docs
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added' && !knownIds.has(change.doc.id)) {
                knownIds.add(change.doc.id);
                showBanner(change.doc.data());
            }
        });
    });
}

// Wire up mark-all button
document.getElementById('mark-all-read-btn')?.addEventListener('click', markAllAsRead);

// Initialize
loadNotifications().then(() => {
    startRealtimeListener();
});

// Add sample notification for testing
async function addSampleNotification() {
    const sample = {
        title: "Welcome to PMACS",
        message: "With PMACS, everything is just clicks away! Experience a faster, more accurate, and convenient way to track the tax progress—all in one place.",
        type: "info",
        read: false,
        createdAt: new Date()
    };

    try {
        await addDoc(notificationsCollection, sample);
    } catch (e) {
        console.log('Notification add skipped:', e.message);
    }
}

addSampleNotification();