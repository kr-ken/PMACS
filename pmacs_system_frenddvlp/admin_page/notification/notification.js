import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    databaseURL: "https://pmacs-0001-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
};
const rtdb = getDatabase(initializeApp(firebaseConfig));
const notifRef = ref(rtdb, 'notifications');

const iconMap = { info:'fa-info-circle', success:'fa-check-circle', warning:'fa-triangle-exclamation', error:'fa-circle-xmark', update:'fa-pen', addition:'fa-plus', deletion:'fa-trash' };
const colorMap = { info:'#2971b9', success:'#27ae60', warning:'#f39c12', error:'#e74c3c', update:'#3498db', addition:'#27ae60', deletion:'#e74c3c' };

function formatTime(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7)  return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
}

function renderNotifications(items) {
    const list = document.getElementById('notification-list');
    if (!list) return;
    list.innerHTML = '';

    if (!items.length) {
        list.innerHTML = "<p style='text-align:center;padding:20px;color:#7f8c8d;'>No notifications yet.</p>";
        return;
    }

    items.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));

    items.forEach(({ id, data }) => {
        const isRead = !!data.read;
        const type   = data.type || 'info';
        const icon   = iconMap[type]  || 'fa-bell';
        const color  = colorMap[type] || '#2971b9';

        const card = document.createElement('div');
        card.className = `notif-card ${isRead ? '' : 'unread'}`;
        card.style.cssText = `
            display:flex; align-items:flex-start; gap:14px; padding:16px;
            border-radius:10px; background:${isRead ? '#f8fafc' : '#f0f7ff'};
            border-left:4px solid ${isRead ? '#cbd5e1' : color};
            margin-bottom:10px; transition:0.3s; cursor:pointer;
        `;
        card.innerHTML = `
            <div style="width:40px;height:40px;border-radius:50%;background:${color}22;
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid ${icon}" style="color:${color};font-size:16px;"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:700;font-size:14px;color:#224263;margin-bottom:3px;">
                    ${data.title || 'Notification'}
                    ${!isRead ? '<span style="display:inline-block;width:8px;height:8px;background:#2971b9;border-radius:50%;margin-left:6px;vertical-align:middle;"></span>' : ''}
                </div>
                <div style="font-size:13px;color:#7f8c8d;line-height:1.5;">${data.message || ''}</div>
                <div style="font-size:11px;color:#95a5a6;margin-top:4px;">${formatTime(data.createdAt)}</div>
            </div>
            ${!isRead ? `<button onclick="window.markRead('${id}', this)" style="background:none;border:1.5px solid #bdc3c7;color:#7f8c8d;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;">Mark read</button>` : ''}
        `;
        if (!isRead) card.addEventListener('click', () => window.markRead(id, null));
        list.appendChild(card);
    });
}

// Real-time listener
onValue(notifRef, snap => {
    const items = [];
    if (snap.exists()) snap.forEach(c => items.push({ id: c.key, data: c.val() }));
    renderNotifications(items);
});

window.markRead = async (id, btn) => {
    await update(ref(rtdb, `notifications/${id}`), { read: true });
    if (btn) btn.closest('.notif-card') && btn.closest('.notif-card').classList.replace('unread','read');
};

async function markAllAsRead() {
    const snap = await get(notifRef);
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(c => { if (!c.val().read) updates[`notifications/${c.key}/read`] = true; });
    if (Object.keys(updates).length) await update(ref(rtdb), updates);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnMarkAllRead')?.addEventListener('click', markAllAsRead);
});