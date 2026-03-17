import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getDatabase, ref, push, update, get, onChildAdded, onValue, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    databaseURL: "https://pmacs-0001-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
};

const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);
const notificationsRef = ref(rtdb, 'notifications');

let isInitialLoad = true;
let knownIds = new Set();

// ── Render all notifications ──
function renderNotifications(items) {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-notifications">
                <i class="fa-solid fa-bell-slash"></i>
                <p>No notifications yet</p>
            </div>`;
        return;
    }

    // Sort newest first
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    items.forEach(({ id, data }) => {
        const isRead = data.read === true;
        const timestamp = data.createdAt ? new Date(data.createdAt) : new Date();

        const item = document.createElement('div');
        item.className = `notification-item${isRead ? ' read' : ' unread'}`;
        item.dataset.id = id;
        item.innerHTML = `
            <div class="notification-icon"><i class="fa-solid fa-bell"></i></div>
            <div class="notification-content">
                <h4>${data.title || 'Notification'}</h4>
                <p>${data.message || ''}</p>
                <span class="notification-time">${formatTime(timestamp)}</span>
            </div>
            ${!isRead ? '<span class="unread-dot"></span>' : ''}
        `;
        item.addEventListener('click', () => markAsRead(id, item));
        container.appendChild(item);
    });
}

// ── Mark single as read ──
async function markAsRead(id, itemEl) {
    try {
        await update(ref(rtdb, `notifications/${id}`), { read: true });
        itemEl.classList.replace('unread', 'read');
        itemEl.querySelector('.unread-dot')?.remove();
    } catch (e) {
        console.error('markAsRead error:', e);
    }
}

// ── Mark all as read ──
async function markAllAsRead() {
    try {
        const snapshot = await get(notificationsRef);
        if (!snapshot.exists()) return;
        const updates = {};
        snapshot.forEach(child => {
            if (!child.val().read) updates[`notifications/${child.key}/read`] = true;
        });
        await update(ref(rtdb), updates);
        document.querySelectorAll('.notification-item.unread').forEach(el => {
            el.classList.replace('unread', 'read');
            el.querySelector('.unread-dot')?.remove();
        });
    } catch (e) {
        console.error('markAllAsRead error:', e);
    }
}

// ── Format time ──
function formatTime(date) {
    const diff = Date.now() - date.getTime();
    const min = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

// ── Banner ──
function showBanner(data) {
    const container = document.getElementById('banner-container');
    if (!container) return;
    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `
        <div class="banner-icon"><i class="fa-solid fa-bell"></i></div>
        <div class="banner-body">
            <strong>${data.title || 'Notification'}</strong>
            <p>${data.message || ''}</p>
        </div>
        <button class="banner-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('banner-visible'));
    const timer = setTimeout(() => dismiss(banner), 5000);
    banner.querySelector('.banner-close').addEventListener('click', () => {
        clearTimeout(timer);
        dismiss(banner);
    });
}

function dismiss(banner) {
    banner.classList.replace('banner-visible', 'banner-hiding');
    banner.addEventListener('transitionend', () => banner.remove(), { once: true });
}

// ── Load all + listen for new ──
async function init() {
    // Load existing
    const snapshot = await get(notificationsRef);
    const items = [];
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            knownIds.add(child.key);
            items.push({ id: child.key, data: child.val() });
        });
    }
    renderNotifications(items);

    // Listen for new notifications only
    onChildAdded(notificationsRef, (child) => {
        if (isInitialLoad) return; // skip already-loaded ones
        if (knownIds.has(child.key)) return;
        knownIds.add(child.key);
        showBanner(child.val());

        // Re-fetch and re-render to include the new one
        get(notificationsRef).then(snap => {
            const all = [];
            snap.forEach(c => all.push({ id: c.key, data: c.val() }));
            renderNotifications(all);
        });
    });

    // Full re-render on any change (read status etc)
    onValue(notificationsRef, (snap) => {
        if (isInitialLoad) { isInitialLoad = false; return; }
        const all = [];
        snap.forEach(c => all.push({ id: c.key, data: c.val() }));
        renderNotifications(all);
    });
}

// ── Mark all button ──
document.getElementById('mark-all-read-btn')?.addEventListener('click', markAllAsRead);

// ── Add sample notification ──
async function addSampleNotification() {
    const existing = await get(notificationsRef);
    if (existing.exists()) return; // Don't add if already has notifications
    await push(notificationsRef, {
        title: "Welcome to PMACS",
        message: "With PMACS, everything is just clicks away! Experience a faster, more accurate, and convenient way to track the tax progress—all in one place.",
        type: "info",
        read: false,
        createdAt: Date.now()
    });
}

init();
addSampleNotification();