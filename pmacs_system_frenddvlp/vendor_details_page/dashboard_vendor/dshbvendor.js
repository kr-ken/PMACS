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

const app     = initializeApp(firebaseConfig);
const rtdb    = getDatabase(app);
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Session guard ──
const role       = sessionStorage.getItem('pmacs_role');
const vendorId   = sessionStorage.getItem('pmacs_id');
const vendorName = sessionStorage.getItem('pmacs_name');

if (role !== 'vendor' || !vendorId) {
    window.location.href = '../../login_page/login.html';
}

window.handleLogout = () => {
    sessionStorage.clear();
    window.location.href = '../../login_page/login.html';
};

// ── Date ──
const dateEl = document.getElementById('currentDate');
if (dateEl) {
    dateEl.textContent = new Date()
        .toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
        .toUpperCase();
}

// ── Nav name ──
const nameEl = document.getElementById('vendorNameText');
if (nameEl && vendorName) nameEl.textContent = vendorName;

// ══════════════════════════════════════════
// SUPABASE — Vendor profile (stall info panel)
// ══════════════════════════════════════════
async function loadVendorProfile() {
    const id = parseInt(vendorId, 10);
    const { data, error } = await supabase
        .from('vendor_details')
        .select('*')
        .eq('vendor_id', id)
        .single();

    if (error || !data) { console.error('[Dashboard] Profile error:', error?.message); return; }

    setText('info-name',       data.vendor_name          || '—');
    setText('info-stall-name', data.vendor_stall_name    || '—');
    setText('info-stall-no',   data.vendor_stall_number  ? `Stall #${data.vendor_stall_number}` : '—');
    setText('info-stall-area', data.vendor_stall_area    || '—');
    setText('info-product',    data.product_services     || '—');
    setText('info-contact',    data.vendor_number        || '—');
}

// ══════════════════════════════════════════
// FIREBASE — Live today's status card
// ══════════════════════════════════════════
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    if (!snapshot.exists()) { setTodayStatus(null); return; }
    const all    = Object.values(snapshot.val());
    const myRec  = all.find(v => String(v.vendor_id) === String(vendorId));
    setTodayStatus(myRec || null);
});

function setTodayStatus(r) {
    const attCard = document.getElementById('card-attendance');
    const payCard = document.getElementById('card-payment');

    if (!r) {
        setText('stat-attendance', 'NO DATA');
        setText('stat-attendance-sub', 'Not yet recorded for today');
        setText('stat-payment', 'NO DATA');
        setText('stat-payment-sub', 'No payment record today');
        setText('stat-tax-ref', '—');
        setText('stat-stall-info', 'Stall info unavailable');
        return;
    }

    // Attendance
    const attEl = document.getElementById('stat-attendance');
    if (attEl) {
        attEl.textContent = r.is_present ? 'PRESENT' : 'ABSENT';
        attEl.className   = `stat-value ${r.is_present ? 'green' : 'red'}`;
    }
    setText('stat-attendance-sub', r.is_present
        ? `Marked present at ${fmtTs(r.timestamp)}`
        : 'Not marked present today');
    if (attCard) attCard.className = `stat-card ${r.is_present ? 'present' : 'absent'}`;

    // Payment
    const payEl = document.getElementById('stat-payment');
    if (payEl) {
        payEl.textContent = r.has_paid ? 'PAID' : 'UNPAID';
        payEl.className   = `stat-value ${r.has_paid ? 'green' : 'orange'}`;
    }
    setText('stat-payment-sub', r.has_paid
        ? `Amount paid: ₱${r.amount_paid || 0}`
        : 'Payment not yet recorded');
    if (payCard) payCard.className = `stat-card ${r.has_paid ? 'paid' : 'unpaid'}`;

    // Tax ref
    setText('stat-tax-ref',    r.tax_reference  || '—');
    setText('stat-stall-info', `${r.stall_area || '—'} · ${r.product_services || '—'}`);
}

// ══════════════════════════════════════════
// TRANSACTION HISTORY
// Today = Firebase (live), All/Past = Supabase
// ══════════════════════════════════════════
let allTxns = [];
let supabaseTxns = [];

// Load today's records from Firebase
onValue(ref(rtdb, 'vendor_realtime'), (snapshot) => {
    if (!snapshot.exists()) { allTxns = []; }
    else {
        const todayStr = new Date().toLocaleDateString('en-CA');
        allTxns = Object.values(snapshot.val())
            .filter(v => String(v.vendor_id) === String(vendorId)
                      && v.timestamp
                      && new Date(v.timestamp).toLocaleDateString('en-CA') === todayStr)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    loadSupabaseTxns(); // also load historical
});

async function loadSupabaseTxns() {
    const { data } = await supabase
        .from('tax_dscrpt_summary')
        .select('*')
        .eq('vendor_id', parseInt(vendorId))
        .not('tax_recorded', 'is', null)
        .order('collection_date', { ascending: false });

    supabaseTxns = (data || []).map(r => ({
        _source:         'supabase',
        vendor_id:       r.vendor_id,
        vendor_name:     r.vendor_name,
        timestamp:       new Date(r.collection_date + 'T08:00:00').getTime(),
        collection_date: r.collection_date,
        stall_area:      r.area,
        product_services:r.product_services,
        tax_reference:   r.amount_range,
        has_paid:        true,
        is_present:      true,
        amount_paid:     r.tax_recorded,
        officials_name:  r.officials_name,
    }));

    window.filterTransactions();
}

window.filterTransactions = function () {
    const val = document.getElementById('txn-filter')?.value || 'all';

    let records;
    if (val === 'today') {
        records = allTxns;
    } else {
        // Merge Firebase today + Supabase history, deduplicate by date
        const todayStr = new Date().toLocaleDateString('en-CA');
        const supabaseExcludeToday = supabaseTxns.filter(r => r.collection_date !== todayStr);
        records = [...allTxns, ...supabaseExcludeToday]
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    if (val === 'paid')   records = records.filter(v => v.has_paid);
    if (val === 'unpaid') records = records.filter(v => v.is_present && !v.has_paid);
    if (val === 'absent') records = records.filter(v => !v.is_present);

    renderTxns(records);
};

function renderTxns(records) {
    const tbody = document.getElementById('txn-list');
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-inbox"></i> No transaction records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map((r, i) => {
        const d       = r.timestamp ? new Date(r.timestamp) : null;
        const dateStr = d ? d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
        const timeStr = d ? d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : '';

        const attBadge = r.is_present
            ? `<span class="badge present"><i class="fa-solid fa-circle-check"></i> Present</span>`
            : `<span class="badge absent"><i class="fa-solid fa-circle-xmark"></i> Absent</span>`;

        const payBadge = !r.is_present
            ? `<span class="badge absent">—</span>`
            : r.has_paid
                ? `<span class="badge paid"><i class="fa-solid fa-check"></i> Paid</span>`
                : `<span class="badge unpaid"><i class="fa-solid fa-clock"></i> Unpaid</span>`;

        return `<tr>
            <td>
                <div class="txn-date-main">${dateStr}</div>
                <div class="txn-date-time">${timeStr}</div>
            </td>
            <td>${r.stall_area || '—'}</td>
            <td>${r.product_services || '—'}</td>
            <td>${r.tax_reference || '—'}</td>
            <td>${r.has_paid ? `₱${r.amount_paid || 0}` : '—'}</td>
            <td>${attBadge}</td>
            <td>${payBadge}</td>
            <td><button class="btn-ticket" onclick="openTicket(${i})"><i class="fa-solid fa-ticket"></i> TICKET</button></td>
        </tr>`;
    }).join('');

    window._txnRecords = records;
}

// ══════════════════════════════════════════
// FIREBASE — Notifications
// ══════════════════════════════════════════
onValue(ref(rtdb, 'notifications'), (snapshot) => {
    const list        = document.getElementById('notif-list');
    const unreadBadge = document.getElementById('unread-count');
    if (!list) return;

    if (!snapshot.exists()) {
        list.innerHTML = `<div class="notif-card"><div class="notif-info"><p style="color:#94a3b8;font-size:13px;">No notifications yet.</p></div></div>`;
        return;
    }

    const notifs = Object.values(snapshot.val())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const unread = notifs.filter(n => !n.read).length;
    if (unreadBadge) {
        unreadBadge.style.display = unread > 0 ? 'inline-block' : 'none';
        unreadBadge.textContent   = `${unread} NEW`;
    }

    const iconMap = { info:'fa-info', success:'fa-check', warning:'fa-triangle-exclamation', error:'fa-xmark' };

    list.innerHTML = notifs.map(n => {
        const type = n.type || 'info';
        return `<div class="notif-card ${!n.read ? 'unread' : ''}">
            <div class="notif-icon-wrap ${type}"><i class="fa-solid ${iconMap[type] || 'fa-info'}"></i></div>
            <div class="notif-info">
                <div class="notif-title">${!n.read ? '<span class="notif-dot"></span>' : ''}${n.title || 'Notification'}</div>
                <div class="notif-msg">${n.message || ''}</div>
                <div class="notif-time">${n.createdAt ? fmtTs(n.createdAt) : '—'}</div>
            </div>
        </div>`;
    }).join('');
});

// ══════════════════════════════════════════
// TICKET MODAL
// ══════════════════════════════════════════
window.openTicket = function (idx) {
    const r = (window._txnRecords || [])[idx];
    if (!r) return;

    const d       = r.timestamp ? new Date(r.timestamp) : new Date();
    const dateStr = d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    const statusClass = !r.is_present ? 'absent' : r.has_paid ? 'paid' : 'unpaid';
    const statusLabel = !r.is_present ? 'ABSENT'  : r.has_paid ? 'PAID'  : 'UNPAID';

    document.getElementById('ticket-body').innerHTML = `
        <div class="ticket-field full">
            <span class="ticket-field-label">Vendor Name</span>
            <span class="ticket-field-value">${r.vendor_name || vendorName || '—'}</span>
        </div>
        <div class="ticket-field">
            <span class="ticket-field-label">Vendor ID</span>
            <span class="ticket-field-value">#${r.vendor_id || vendorId}</span>
        </div>
        <div class="ticket-field">
            <span class="ticket-field-label">Stall Area</span>
            <span class="ticket-field-value">${r.stall_area || '—'}</span>
        </div>
        <div class="ticket-field">
            <span class="ticket-field-label">Product / Service</span>
            <span class="ticket-field-value">${r.product_services || '—'}</span>
        </div>
        <div class="ticket-field">
            <span class="ticket-field-label">Tax Reference</span>
            <span class="ticket-field-value">${r.tax_reference || '—'}</span>
        </div>
        <div class="ticket-field">
            <span class="ticket-field-label">Amount Paid</span>
            <span class="ticket-field-value amount">${r.has_paid ? `₱${r.amount_paid || 0}` : '—'}</span>
        </div>
        <div class="ticket-field full">
            <span class="ticket-field-label">Date</span>
            <span class="ticket-field-value">${dateStr}</span>
        </div>
        <div class="ticket-field full">
            <span class="ticket-field-label">Time Recorded</span>
            <span class="ticket-field-value">${timeStr}</span>
        </div>
    `;

    const statusEl = document.getElementById('ticket-status');
    if (statusEl) { statusEl.textContent = statusLabel; statusEl.className = `ticket-status ${statusClass}`; }

    setText('ticket-gen-time',
        new Date().toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }));

    document.getElementById('ticket-modal').style.display = 'flex';
};

window.closeTicketModal = function (e) {
    if (e.target === document.getElementById('ticket-modal')) {
        document.getElementById('ticket-modal').style.display = 'none';
    }
};

window.printTicket = function () { window.print(); };

// ── Helpers ──
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function fmtTs(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' });
}

// ── Init ──
loadVendorProfile();