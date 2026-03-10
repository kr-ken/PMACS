import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    fetchNotifications();
    const btnMarkAll = document.getElementById('btnMarkAllRead');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', markAllAsRead);
    }
});

async function fetchNotifications() {
    const listContainer = document.getElementById('notification-list');
    if (!listContainer) return;

    const { data: notifications, error } = await supabase
        .from('notification')
        .select('*')
        .order('notif_at', { ascending: false });

    if (error) {
        console.error("Error fetching notifications:", error);
        listContainer.innerHTML = "<p style='text-align: center; color: red;'>Error loading notifications.</p>";
        return;
    }

    listContainer.innerHTML = "";
    if (notifications.length === 0) {
        listContainer.innerHTML = "<p style='text-align: center; padding: 20px;'>No notifications found.</p>";
        return;
    }

    notifications.forEach(notif => {
        const card = document.createElement('div');
        const typeClass = notif.notif_type ? notif.notif_type.toLowerCase() : 'info';
        card.className = `notif-card ${notif.is_read ? '' : 'unread'} ${typeClass}`;

        const date = new Date(notif.notif_at).toLocaleString();

        card.innerHTML = `
            <div class="notif-info">
                <h4>${notif.notif_type || 'System Alert'}</h4>
                <p>${notif.message}</p>
                <span class="notif-time">${date}</span>
            </div>
            ${!notif.is_read ? `<button class="btn-sm btn-secondary" onclick="markAsRead(${notif.notif_id})">Mark as read</button>` : ''}
        `;
        listContainer.appendChild(card);
    });
}

window.markAsRead = async function(id) {
    const { error } = await supabase
        .from('notification')
        .update({ is_read: true })
        .eq('notif_id', id);

    if (!error) fetchNotifications();
};

async function markAllAsRead() {
    const { error } = await supabase
        .from('notification')
        .update({ is_read: true })
        .eq('is_read', false);

    if (!error) fetchNotifications();
}
