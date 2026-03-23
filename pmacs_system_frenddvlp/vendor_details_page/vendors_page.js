import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Session guard ──
const role       = sessionStorage.getItem('pmacs_role');
const vendorId   = sessionStorage.getItem('pmacs_id');
const vendorName = sessionStorage.getItem('pmacs_name');

if (role !== 'vendor' || !vendorId) {
    window.location.href = '../login_page/login.html';
}

window.handleLogout = () => {
    sessionStorage.clear();
    window.location.href = '../login_page/login.html';
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
// LOAD PROFILE
// ══════════════════════════════════════════
async function loadProfile() {
    try {
        const id = parseInt(vendorId, 10);

        const [detailsRes, validityRes] = await Promise.all([
            supabase.from('vendor_details').select('*').eq('vendor_id', id).single(),
            supabase.from('vendor_validity').select('*').eq('vendor_id', id).maybeSingle()
        ]);

        if (detailsRes.error) throw detailsRes.error;

        // Debug: log all keys so we can confirm the stand-in column name
        console.log('[Profile] vendor_details keys:', Object.keys(detailsRes.data));

        renderProfile(detailsRes.data, validityRes.data || null);

    } catch (err) {
        console.error('[Profile] Load failed:', err.message);
        showError('Could not load your profile. Please try again later.');
    }
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function capitalize(str) {
    if (!str) return '—';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function capitalizeWords(str) {
    if (!str) return '—';
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

function getStandIn(v) {
    // Try every possible key variation for the "vendor_stand - in" column.
    // Supabase returns the column name exactly as defined in Postgres.
    // The SQL schema shows: vendor_stand - in  (with spaces around the dash)
    const candidates = [
        'vendor_stand - in',   // exact SQL column name
        'vendor_stand-in',     // no spaces
        'vendor_stand_in',     // underscored
        'vendor_standin',      // no separator
    ];
    for (const key of candidates) {
        if (v[key] !== undefined && v[key] !== null && v[key] !== '') {
            return v[key];
        }
    }
    // Last resort: search for any key containing "stand"
    const standKey = Object.keys(v).find(k => k.toLowerCase().includes('stand'));
    if (standKey && v[standKey]) return v[standKey];

    return 'None assigned';
}

function permitClass(validUntil) {
    if (!validUntil) return 'expired';
    const diff = Math.ceil((new Date(validUntil) - new Date()) / 86400000);
    if (diff <= 0)   return 'expired';
    if (diff <= 90)  return 'expiring';   // 3 months = ~90 days
    return 'valid';
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function showError(msg) {
    const el = document.getElementById('loading-state');
    if (el) el.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c;font-size:30px;"></i>
        <p style="color:#e74c3c;font-size:14px;">${msg}</p>`;
}

// ══════════════════════════════════════════
// RENDER PROFILE
// ══════════════════════════════════════════
function renderProfile(v, permit) {
    // ── Hero ──
    setText('hero-name',       v.vendor_name       || '—');
    setText('hero-vendor-id',  `#${v.vendor_id}`);
    setText('hero-stall-area', v.vendor_stall_area  || '—');
    setText('hero-product',    v.product_services   || '—');

    const accBadge = document.getElementById('badge-account');
    if (accBadge) {
        accBadge.textContent = v.vendor_status ? '✓ ACTIVE' : '✗ INACTIVE';
        accBadge.className   = `hero-badge ${v.vendor_status ? 'active' : 'inactive'}`;
    }

    const permitBadge = document.getElementById('badge-permit');
    if (permitBadge) {
        if (!permit) {
            permitBadge.textContent = '⚠ NO PERMIT';
            permitBadge.className   = 'hero-badge no-permit';
        } else {
            const pc = permitClass(permit.valid_until);
            const labels = { valid:'✓ PERMIT VALID', expiring:'⚠ EXPIRING SOON', expired:'✗ PERMIT EXPIRED' };
            permitBadge.textContent = labels[pc];
            permitBadge.className   = `hero-badge ${pc}`;
        }
    }

    // ── Personal Info ──
    setText('d-name',      v.vendor_name      || '—');
    setText('d-gender',    capitalize(v.vendor_gender));   // ← capitalized
    setText('d-contact',   v.vendor_number    || '—');
    setText('d-email',     v.vendor_email     || 'Not provided');
    setText('d-address',   v.vendor_address   || '—');
    setText('d-birthdate', fmtDate(v.vendor_birthdate));
    setText('d-created',   fmtDate(v.created_at));

    // ── Stall Info ──
    setText('d-stall-name', v.vendor_stall_name   || '—');
    setText('d-stall-no',   v.vendor_stall_number ? `Stall #${v.vendor_stall_number}` : '—');
    setText('d-stall-area', v.vendor_stall_area   || '—');
    setText('d-product',    v.product_services    || '—');
    setText('d-standin',    getStandIn(v));               // ← fixed stand-in lookup

    // Status chips
    const statusEl = document.getElementById('d-status');
    if (statusEl) statusEl.innerHTML = v.vendor_status
        ? `<span class="chip active"><i class="fa-solid fa-circle-check"></i> Active</span>`
        : `<span class="chip inactive"><i class="fa-solid fa-circle-xmark"></i> Inactive</span>`;

    const validEl = document.getElementById('d-validity');
    if (validEl) validEl.innerHTML = v.vendor_validity
        ? `<span class="chip valid"><i class="fa-solid fa-shield-halved"></i> Valid</span>`
        : `<span class="chip invalid"><i class="fa-solid fa-ban"></i> Invalid</span>`;

    // ── Permit ──
    renderPermit(permit);

    document.getElementById('loading-state').style.display   = 'none';
    document.getElementById('profile-content').style.display = 'block';
}

// ══════════════════════════════════════════
// RENDER PERMIT
// ══════════════════════════════════════════
function renderPermit(permit) {
    const noPermitEl    = document.getElementById('no-permit');
    const permitDetails = document.getElementById('permit-details');

    if (!permit) {
        if (noPermitEl)    noPermitEl.style.display    = 'block';
        if (permitDetails) permitDetails.style.display = 'none';
        return;
    }

    if (noPermitEl)    noPermitEl.style.display    = 'none';
    if (permitDetails) permitDetails.style.display = 'block';

    const pc = permitClass(permit.valid_until);

    const bar = document.getElementById('permit-status-bar');
    if (bar) bar.className = `permit-status-bar ${pc}`;

    const iconMap  = { valid:'fa-shield-halved', expiring:'fa-triangle-exclamation', expired:'fa-ban' };
    const iconEl   = document.getElementById('pstatus-icon');
    if (iconEl) iconEl.innerHTML = `<i class="fa-solid ${iconMap[pc]}"></i>`;

    const titles = { valid:'PERMIT VALID', expiring:'EXPIRING SOON', expired:'PERMIT EXPIRED' };
    const subs   = {
        valid:    'Your business permit is active and up to date.',
        expiring: 'Your permit expires within 3 months. Please renew soon.',
        expired:  'Your permit has expired. Contact the administrator.'
    };
    setText('pstatus-title', titles[pc]);
    setText('pstatus-sub',   subs[pc]);

    // Days remaining
    const daysEl = document.getElementById('pstatus-days');
    if (daysEl && permit.valid_until) {
        const diff = Math.ceil((new Date(permit.valid_until) - new Date()) / 86400000);
        daysEl.textContent = diff > 0 ? `${diff} days left` : `${Math.abs(diff)} days ago`;
    }

    // Permit fields — handle both possible key names for business_id_no
    const bizId = permit['business_id_no'] || permit['business_id_no.text'] || '—';
    setText('p-biz-id',    bizId);
    setText('p-tin',       permit.business_tin       || '—');
    setText('p-permit-no', permit.business_permit_no || '—');
    setText('p-issued',    fmtDate(permit.date_issued));
    setText('p-until',     fmtDate(permit.valid_until));

    const statusLabels = { valid:'✓ Valid', expiring:'⚠ Expiring Soon', expired:'✗ Expired' };
    setText('p-status', statusLabels[pc]);
}

// ── Init ──
loadProfile();