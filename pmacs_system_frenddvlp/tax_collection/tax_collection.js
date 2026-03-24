import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
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

const rtdb     = getDatabase(initializeApp(firebaseConfig));
const supabase = createClient(supabaseUrl, supabaseKey);

let allVendors      = [];
let taxFeesLookup   = {};
let cachedAmounts   = {};
let currentOfficial = null;
const today         = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
async function init() {
    updateDateDisplay();
    requireAuth();
    await Promise.all([loadCollectorInfo(), loadTaxRates()]);
    await fetchVendors();
    await Promise.all([loadCachedAmounts(), loadFirebaseState()]);
    renderVendors();
}

function updateDateDisplay() {
    const el = document.getElementById("currentDate");
    if (el) el.textContent = new Date()
        .toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })
        .toUpperCase();
}

function requireAuth() {
    const role = sessionStorage.getItem('pmacs_role');
    if (!role || role !== 'collector') window.location.href = '../login_page/login.html';
}

// ══════════════════════════════════════════
// COLLECTOR INFO
// ══════════════════════════════════════════
async function loadCollectorInfo() {
    const id = sessionStorage.getItem('pmacs_id');
    if (!id) return;
    const { data } = await supabase
        .from('officials_details')
        .select('officials_id, officials_name')
        .eq('officials_id', parseInt(id))
        .single();
    const name = data?.officials_name || sessionStorage.getItem('pmacs_name') || 'Unknown';
    currentOfficial = { officials_id: parseInt(id), officials_name: name };
    const el = document.getElementById('collectorNameText');
    if (el) el.textContent = name;
}

window.handleLogout = () => { sessionStorage.clear(); window.location.href = '../login_page/login.html'; };

// ══════════════════════════════════════════
// TAX RATES
// ══════════════════════════════════════════
async function loadTaxRates() {
    const { data, error } = await supabase
        .from('collection_fees')
        .select('area, product_services, amount_range, collection_fee_id, "quantified?"');
    if (error) { console.error('loadTaxRates:', error.message); return; }
    (data || []).forEach(f => {
        const e = { range: f.amount_range, id: f.collection_fee_id, quantified: f['quantified?'] };
        taxFeesLookup[f.product_services] = e;
        if (f.area) taxFeesLookup[`${f.area}:${f.product_services}`] = e;
    });
}

function getFee(vendor) {
    const areaKey = `${vendor.vendor_stall_area}:${vendor.product_services}`;
    if (taxFeesLookup[areaKey]) return taxFeesLookup[areaKey];
    if (taxFeesLookup[vendor.product_services]) return taxFeesLookup[vendor.product_services];

    const words = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const vendorWords = words(vendor.product_services);
    let bestEntry = null, bestScore = 0;
    for (const [key, entry] of Object.entries(taxFeesLookup)) {
        if (key.includes(':')) continue;
        const keyWords = words(key);
        let matches = 0;
        for (const vw of vendorWords) {
            if (keyWords.some(kw => kw.startsWith(vw.slice(0,4)) || vw.startsWith(kw.slice(0,4)))) matches++;
        }
        const score = matches / Math.max(vendorWords.length, keyWords.length);
        if (score > bestScore) { bestScore = score; bestEntry = entry; }
    }
    if (bestScore >= 0.5) return bestEntry;
    return {};
}

// ══════════════════════════════════════════
// FETCH VENDORS
// ══════════════════════════════════════════
async function fetchVendors() {
    const tbody = document.getElementById("vendor-list");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:20px;'>Loading vendors...</td></tr>";
    const { data, error } = await supabase
        .from('vendor_details')
        .select('vendor_id, vendor_name, vendor_stall_name, vendor_stall_number, vendor_stall_area, product_services')
        .order('vendor_stall_area', { ascending: true });
    if (error) {
        tbody.innerHTML = `<tr><td colspan='5' style='text-align:center;color:red;'>Failed: ${error.message}</td></tr>`;
        return;
    }
    allVendors = (data || []).map(v => ({ ...v, isPresent: false, hasPaid: false, paidAmount: 0 }));
}

// ══════════════════════════════════════════
// PAST TAX from Supabase (past days only)
// ══════════════════════════════════════════
async function loadCachedAmounts() {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase
        .from('tax_dscrpt_summary')
        .select('vendor_id, tax_recorded, collection_date')
        .gte('collection_date', since.toISOString().split('T')[0])
        .neq('collection_date', today)
        .order('collection_date', { ascending: false });
    if (error) { console.error('loadCachedAmounts:', error.message); return; }
    (data || []).forEach(row => {
        if (cachedAmounts[row.vendor_id] === undefined && row.tax_recorded != null)
            cachedAmounts[row.vendor_id] = row.tax_recorded;
    });
}

// ══════════════════════════════════════════
// RESTORE TODAY'S SESSION from Firebase
// Key format: vendor_id_YYYY-MM-DD
// Filter by collection_date field
// ══════════════════════════════════════════
async function loadFirebaseState() {
    try {
        const snap = await get(ref(rtdb, 'vendor_realtime'));
        if (!snap.exists()) return;

        // Build lookup: vendor_id → today's record only
        const todayMap = {};
        snap.forEach(child => {
            const d = child.val();
            if (d.collection_date !== today) return; // skip other days
            todayMap[String(d.vendor_id)] = d;
        });

        allVendors = allVendors.map(v => {
            const fb = todayMap[String(v.vendor_id)];
            if (!fb) return v;
            return { ...v, isPresent: !!fb.is_present, hasPaid: !!fb.has_paid, paidAmount: parseFloat(fb.amount_paid) || 0 };
        });
    } catch (e) { console.error("loadFirebaseState:", e.message); }
}

// ══════════════════════════════════════════
// FIREBASE WRITE
// Key: vendor_id_YYYY-MM-DD → history accumulates per day
// ══════════════════════════════════════════
async function syncToFirebase(vendor) {
    const fee = getFee(vendor);
    const key = `${vendor.vendor_id}_${today}`;
    await set(ref(rtdb, `vendor_realtime/${key}`), {
        vendor_id:        String(vendor.vendor_id),
        vendor_name:      vendor.vendor_name,
        stall_area:       vendor.vendor_stall_area || 'N/A',
        product_services: vendor.product_services,
        tax_reference:    fee.range || 'N/A',
        is_present:       !!vendor.isPresent,
        has_paid:         !!vendor.hasPaid,
        amount_paid:      parseFloat(vendor.paidAmount) || 0,
        timestamp:        Date.now(),
        collection_date:  today,
    });
}

// ══════════════════════════════════════════
// SUPABASE UPSERT (one row per vendor per day)
// ══════════════════════════════════════════
async function upsertToSupabase(vendor, paidAmount) {
    if (!currentOfficial) { console.warn('No collector — skipping upsert'); return; }
    const fee = getFee(vendor);

    if (!fee.id) {
        // No fee found — try updating the existing row's tax_recorded only
        console.warn('upsertToSupabase: no fee id for', vendor.product_services);
        const { error } = await supabase
            .from('tax_dscrpt_summary')
            .update({ tax_recorded: paidAmount, officials_id: currentOfficial.officials_id, officials_name: currentOfficial.officials_name })
            .eq('vendor_id', vendor.vendor_id)
            .eq('collection_date', today);
        if (error) console.error('upsertToSupabase (update fallback):', error.message, error.details);
        else cachedAmounts[vendor.vendor_id] = paidAmount;
        return;
    }

    const { error } = await supabase
        .from('tax_dscrpt_summary')
        .upsert({
            vendor_id:           vendor.vendor_id,
            vendor_name:         vendor.vendor_name,
            vendor_stall_name:   vendor.vendor_stall_name   || vendor.vendor_stall_area || 'N/A',
            vendor_stall_number: vendor.vendor_stall_number || 0,
            area:                vendor.vendor_stall_area   || 'N/A',
            officials_id:        currentOfficial.officials_id,
            officials_name:      currentOfficial.officials_name,
            collection_fee_id:   fee.id,
            product_services:    vendor.product_services,
            amount_range:        fee.range || 'N/A',
            'quantified ?':      fee.quantified || false,
            tax_recorded:        paidAmount,
            collection_date:     today,
        }, { onConflict: 'vendor_id,collection_date' });

    if (error) {
        console.error('upsertToSupabase ERROR:', error.message, '| hint:', error.hint);
    } else {
        cachedAmounts[vendor.vendor_id] = paidAmount;
        console.log(`✓ Supabase: ${vendor.vendor_name} ₱${paidAmount} for ${today}`);
    }
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function renderVendors() {
    const tbody = document.getElementById("vendor-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    const grouped = allVendors.reduce((acc, v) => {
        const area = (v.vendor_stall_area || "UNASSIGNED AREA").toUpperCase();
        if (!acc[area]) acc[area] = [];
        acc[area].push(v);
        return acc;
    }, {});
    for (const [area, vendors] of Object.entries(grouped)) {
        const hdr = document.createElement("tr");
        hdr.className = "area-separator";
        hdr.innerHTML = `<td colspan="5"><i class="fa-solid fa-building"></i> ${area}</td>`;
        tbody.appendChild(hdr);
        vendors.forEach(v => {
            const row = document.createElement("tr");
            row.id = `row-${v.vendor_id}`;
            row.innerHTML = buildRowHTML(v);
            tbody.appendChild(row);
        });
    }
    attachCheckboxListeners();
}

function buildRowHTML(v) {
    const fee   = getFee(v);
    const range = fee.range || '—';
    const past  = cachedAmounts[v.vendor_id];

    // ── ABSENT ──
    if (!v.isPresent) {
        const pastLabel = (past != null) ? `Last tax: ₱${past}` : 'No past record';
        return `
            <td>
                <div style="font-weight:700;">${v.vendor_name.toUpperCase()}</div>
                <div style="font-size:11px;color:#7f8c8d;">ID: ${v.vendor_id}</div>
            </td>
            <td><div style="font-weight:600;">${v.product_services}</div></td>
            <td class="center-col">
                <input type="checkbox" class="attendance-checkbox" data-id="${v.vendor_id}">
            </td>
            <td class="center-col">
                <input type="number" class="amt-input"
                       id="amt-${v.vendor_id}"
                       value="${past != null ? past : ''}"
                       placeholder="—" disabled
                       style="border:1.5px solid #e0e0e0;background:#f5f5f5;color:#aaa;">
                <div style="font-size:11px;color:#aaa;margin-top:4px;">${pastLabel}</div>
            </td>
            <td class="center-col">
                <span style="font-size:11px;font-weight:700;color:#aaa;letter-spacing:1px;">ABSENT</span>
            </td>`;
    }

    // ── PRESENT ──
    const isPaid    = !!v.hasPaid;
    const isQuant   = !!fee.quantified;
    const prefill   = v.paidAmount > 0 ? v.paidAmount : (past != null ? past : '');
    const nums      = (range || '').replace(/₱/g,'').match(/\d+(\.\d+)?/g);
    const unitPrice = nums ? parseFloat(nums[0]) : 0;

    const taxTd = isQuant && !isPaid ? `
        <td class="center-col" id="tax-cell-${v.vendor_id}">
            <div style="display:flex;flex-direction:column;gap:5px;max-width:220px;margin:0 auto;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <label style="font-size:10px;font-weight:700;color:#7f8c8d;min-width:58px;">UNIT ₱</label>
                    <input type="number" readonly id="unit-${v.vendor_id}" value="${unitPrice}"
                           style="flex:1;padding:6px 8px;border:1.5px solid #e0e0e0;border-radius:6px;
                                  font-size:13px;font-weight:600;background:#f5f5f5;color:#224263;text-align:center;">
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <label style="font-size:10px;font-weight:700;color:#3498db;min-width:58px;">QTY</label>
                    <input type="number" min="0" step="0.01" id="qty-${v.vendor_id}" placeholder="0"
                           oninput="window.calcTotal('${v.vendor_id}')"
                           style="flex:1;padding:6px 8px;border:1.5px solid #3498db;border-radius:6px;
                                  font-size:13px;font-weight:600;color:#224263;text-align:center;outline:none;">
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <label style="font-size:10px;font-weight:700;color:#27ae60;min-width:58px;">TOTAL ₱</label>
                    <input type="number" readonly id="amt-${v.vendor_id}" placeholder="—"
                           style="flex:1;padding:6px 8px;border:2px solid #27ae60;border-radius:6px;
                                  font-size:14px;font-weight:800;color:#27ae60;text-align:center;background:#f0fff4;">
                </div>
                <div style="font-size:10px;color:#aaa;text-align:center;">₱${unitPrice} × qty${past != null ? ` · Last: ₱${past}` : ''}</div>
            </div>
        </td>` :
        `<td class="center-col">
            <input type="number" class="amt-input ${isPaid ? 'paid-border' : ''}"
                   id="amt-${v.vendor_id}" placeholder="${range}" value="${prefill}"
                   oninput="window.validateRange('${v.vendor_id}', '${range}')"
                   ${isPaid ? 'disabled style="border:2.5px solid #3498db;"' : ''}>
            <div style="font-size:11px;color:${isPaid ? '#3498db' : '#7f8c8d'};margin-top:4px;">
                ${isPaid
                    ? `✓ Paid ₱${v.paidAmount}`
                    : `Range: ${range}${past != null ? ` · <span style="color:#3498db;">Last: ₱${past}</span>` : ''}`}
            </div>
        </td>`;

    return `
        <td>
            <div style="font-weight:700;">${v.vendor_name.toUpperCase()}</div>
            <div style="font-size:11px;color:#7f8c8d;">ID: ${v.vendor_id}</div>
        </td>
        <td><div style="font-weight:600;">${v.product_services}${isQuant ? ' <span style="font-size:10px;background:#e3f2fd;color:#1e88e5;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px;">QTY</span>' : ''}</div></td>
        <td class="center-col">
            <input type="checkbox" class="attendance-checkbox" data-id="${v.vendor_id}" checked>
        </td>
        ${taxTd}
        <td class="center-col">
            <div id="action-container-${v.vendor_id}">
                ${isPaid
                    ? `<div class="dots-menu-wrap" style="position:relative;display:inline-block;">
                           <button class="btn-edit-payment" id="dots-btn-${v.vendor_id}"
                                   onclick="window.toggleDotsMenu('${v.vendor_id}')" title="Options">
                               <i class="fa-solid fa-ellipsis"></i>
                           </button>
                           <div id="dots-menu-${v.vendor_id}" style="
                               display:none;position:absolute;right:0;top:110%;
                               background:white;border:1px solid #e2e8f0;border-radius:10px;
                               box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:200;min-width:170px;overflow:hidden;">
                               <button onclick="window.showMissedPayments('${v.vendor_id}')" style="
                                   width:100%;padding:11px 16px;text-align:left;border:none;
                                   background:none;cursor:pointer;font-size:13px;font-weight:600;
                                   color:#224263;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f1f5f9;">
                                   <i class="fa-solid fa-history" style="color:#f39c12;"></i> Missed Payments
                               </button>
                               <button onclick="window.unlockPayment('${v.vendor_id}')" style="
                                   width:100%;padding:11px 16px;text-align:left;border:none;
                                   background:none;cursor:pointer;font-size:13px;font-weight:600;
                                   color:#224263;display:flex;align-items:center;gap:8px;">
                                   <i class="fa-solid fa-pen" style="color:#3498db;"></i> Edit Payment
                               </button>
                           </div>
                       </div>`
                    : `<button class="btn-done" id="done-${v.vendor_id}"
                               onclick="window.markAsPaid('${v.vendor_id}')"
                               ${isQuant ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                           DONE PAYING
                       </button>`}
            </div>
        </td>`;
}

// ══════════════════════════════════════════
// QUANTIFIABLE: unit × qty = total
// ══════════════════════════════════════════
window.calcTotal = (vendorId) => {
    const unit  = parseFloat(document.getElementById(`unit-${vendorId}`)?.value) || 0;
    const qty   = parseFloat(document.getElementById(`qty-${vendorId}`)?.value)  || 0;
    const total = parseFloat((unit * qty).toFixed(2));
    const totalEl = document.getElementById(`amt-${vendorId}`);
    const doneBtn = document.getElementById(`done-${vendorId}`);
    if (totalEl) { totalEl.value = total > 0 ? total : ''; totalEl.style.borderColor = total > 0 ? '#27ae60' : '#e0e0e0'; }
    if (doneBtn) { doneBtn.disabled = total <= 0; doneBtn.style.opacity = total > 0 ? '1' : '0.5'; doneBtn.style.cursor = total > 0 ? 'pointer' : 'not-allowed'; }
};

// ══════════════════════════════════════════
// CHECKBOX LISTENER
// ══════════════════════════════════════════
function attachCheckboxListeners() {
    document.querySelectorAll(".attendance-checkbox").forEach(cb => {
        cb.onchange = async (e) => {
            const id     = String(e.target.dataset.id);
            const vendor = allVendors.find(v => String(v.vendor_id) === id);
            if (!vendor) return;
            vendor.isPresent = e.target.checked;
            if (!vendor.isPresent) { vendor.hasPaid = false; vendor.paidAmount = 0; }
            const row = document.getElementById(`row-${id}`);
            if (row) row.innerHTML = buildRowHTML(vendor);
            attachCheckboxListeners();
            await syncToFirebase(vendor);
        };
    });
}

// ══════════════════════════════════════════
// RANGE VALIDATION
// ══════════════════════════════════════════
window.validateRange = (vendorId, rangeStr) => {
    const input = document.getElementById(`amt-${vendorId}`);
    const btn   = document.getElementById(`done-${vendorId}`);
    if (!input) return;
    const val  = parseFloat(input.value);
    const nums = rangeStr.match(/\d+(\.\d+)?/g);
    if (!nums || isNaN(val)) { input.style.border = "1.5px solid #ddd"; if (btn) { btn.disabled = false; btn.style.opacity = "1"; } return; }
    const min = parseFloat(nums[0]);
    const max = nums[1] ? parseFloat(nums[1]) : min;
    if (val < min || val > max) { input.style.border = "2.5px solid #e74c3c"; if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; } }
    else { input.style.border = "2.5px solid #27ae60"; if (btn) { btn.disabled = false; btn.style.opacity = "1"; } }
};

// ══════════════════════════════════════════
// MARK AS PAID
// ══════════════════════════════════════════
window.markAsPaid = async (vendorId) => {
    const input      = document.getElementById(`amt-${vendorId}`);
    const paidAmount = parseFloat(input?.value) || 0;
    if (paidAmount <= 0) { showNotif("Please enter a valid amount", "error"); return; }
    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (!vendor) return;
    vendor.hasPaid = true; vendor.paidAmount = paidAmount;
    if (input) { input.disabled = true; input.classList.add('paid-border'); input.style.border = "2.5px solid #3498db"; }

    const ac = document.getElementById(`action-container-${vendorId}`);
    if (ac) ac.innerHTML = `
        <div class="dots-menu-wrap" style="position:relative;display:inline-block;">
            <button class="btn-edit-payment" id="dots-btn-${vendorId}"
                    onclick="window.toggleDotsMenu('${vendorId}')" title="Options">
                <i class="fa-solid fa-ellipsis"></i>
            </button>
            <div id="dots-menu-${vendorId}" style="display:none;position:absolute;right:0;top:110%;
                background:white;border:1px solid #e2e8f0;border-radius:10px;
                box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:200;min-width:170px;overflow:hidden;">
                <button onclick="window.showMissedPayments('${vendorId}')" style="width:100%;padding:11px 16px;text-align:left;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#224263;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f1f5f9;">
                    <i class="fa-solid fa-history" style="color:#f39c12;"></i> Missed Payments
                </button>
                <button onclick="window.unlockPayment('${vendorId}')" style="width:100%;padding:11px 16px;text-align:left;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#224263;display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid fa-pen" style="color:#3498db;"></i> Edit Payment
                </button>
            </div>
        </div>`;

    const sub = input?.parentElement?.querySelector('div[style*="font-size:11px"]');
    if (sub) sub.innerHTML = `<span style="color:#3498db;">✓ Paid ₱${paidAmount}</span>`;

    await syncToFirebase(vendor);
    await upsertToSupabase(vendor, paidAmount);
    showNotif(`✓ ₱${paidAmount} recorded for ${vendor.vendor_name}`, "success");
};

// ══════════════════════════════════════════
// DOTS MENU
// ══════════════════════════════════════════
window.toggleDotsMenu = (vendorId) => {
    document.querySelectorAll('[id^="dots-menu-"]').forEach(m => { if (m.id !== `dots-menu-${vendorId}`) m.style.display = 'none'; });
    const menu = document.getElementById(`dots-menu-${vendorId}`);
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dots-menu-wrap'))
        document.querySelectorAll('[id^="dots-menu-"]').forEach(m => m.style.display = 'none');
});

// ══════════════════════════════════════════
// MISSED PAYMENTS
// ══════════════════════════════════════════
window.showMissedPayments = async (vendorId) => {
    const menuEl = document.getElementById(`dots-menu-${vendorId}`);
    if (menuEl) menuEl.style.display = 'none';
    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (!vendor) return;
    const existing = document.getElementById(`debt-row-${vendorId}`);
    if (existing) { existing.remove(); return; }

    const { data, error } = await supabase
        .from('tax_dscrpt_summary')
        .select('collection_date, tax_recorded, amount_range')
        .eq('vendor_id', parseInt(vendorId))
        .lt('collection_date', today)
        .is('tax_recorded', null)
        .order('collection_date', { ascending: false });

    if (error) { console.error('showMissedPayments:', error.message); return; }
    const row = document.getElementById(`row-${vendorId}`);
    if (!row) return;
    const debtRow = document.createElement('tr');
    debtRow.id = `debt-row-${vendorId}`;

    if (!data || data.length === 0) {
        debtRow.innerHTML = `<td colspan="5" style="background:#f0fdf4;padding:14px 24px;border-left:4px solid #27ae60;">
            <div style="display:flex;align-items:center;gap:8px;color:#27ae60;font-weight:700;font-size:13px;">
                <i class="fa-solid fa-circle-check"></i> No missed payments — all clear!
            </div></td>`;
    } else {
        const fee = getFee(vendor);
        const listItems = data.map(r => {
            const dateLabel = new Date(r.collection_date + 'T00:00:00')
                .toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
            const displayRange = r.amount_range || fee.range || 'N/A';
            return `<div data-debt-date="${r.collection_date}" style="display:flex;flex-direction:column;
                padding:10px 14px;background:white;border-radius:8px;border:1px solid #fed7aa;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <div style="font-weight:700;font-size:13px;color:#224263;">${dateLabel}</div>
                        <div style="font-size:11px;color:#7f8c8d;margin-top:2px;">Tax reference: ${displayRange}</div>
                    </div>
                    <button class="btn-done" style="background:#f39c12;min-width:auto;padding:7px 14px;font-size:11px;"
                            onclick="window.payMissed('${vendorId}','${r.collection_date}','${displayRange}')">
                        PAY DEBT
                    </button>
                </div>
            </div>`;
        }).join('');
        debtRow.innerHTML = `<td colspan="5" style="background:#fff8f0;padding:16px 24px;border-left:4px solid #f39c12;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <i class="fa-solid fa-history" style="color:#f39c12;"></i>
                <span style="font-weight:800;font-size:13px;color:#224263;">MISSED PAYMENTS — ${vendor.vendor_name.toUpperCase()}</span>
                <span style="background:#f39c12;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">${data.length} UNPAID</span>
            </div>${listItems}</td>`;
    }
    row.insertAdjacentElement('afterend', debtRow);
};

// ══════════════════════════════════════════
// PAY MISSED DEBT — inline
// ══════════════════════════════════════════
window.payMissed = async (vendorId, collectionDate, rangeStr) => {
    const inputRowId = `pay-input-${vendorId}-${collectionDate.replace(/-/g,'')}`;
    const existing = document.getElementById(inputRowId);
    if (existing) { existing.remove(); return; }
    document.querySelectorAll(`[id^="pay-input-${vendorId}-"]`).forEach(el => el.remove());

    const nums   = String(rangeStr).replace(/₱/g,'').match(/\d+(\.\d+)?/g);
    const minVal = nums ? parseFloat(nums[0]) : 0;
    const maxVal = nums && nums[1] ? parseFloat(nums[1]) : minVal;

    const debtRow = document.getElementById(`debt-row-${vendorId}`);
    if (!debtRow) return;

    const allEntries = debtRow.querySelectorAll('[data-debt-date]');
    let targetEntry = null;
    allEntries.forEach(el => { if (el.dataset.debtDate === collectionDate) targetEntry = el; });

    const payForm = document.createElement('div');
    payForm.id = inputRowId;
    payForm.style.cssText = `background:#fffbf0;border:1.5px solid #f39c12;border-radius:8px;padding:12px 14px;margin-bottom:8px;`;
    payForm.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#224263;margin-bottom:8px;">
            <span style="color:#f39c12;">₱</span> Enter amount for <strong>${collectionDate}</strong>
            &nbsp;·&nbsp;<span style="color:#7f8c8d;">Range: ${rangeStr}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" id="pay-amt-${vendorId}-${collectionDate.replace(/-/g,'')}"
                   step="0.01" min="${minVal}" max="${maxVal > 0 ? maxVal : ''}"
                   placeholder="${minVal > 0 ? minVal : '0.00'}"
                   style="flex:1;padding:9px 12px;border:1.5px solid #f39c12;border-radius:7px;font-size:14px;font-weight:600;outline:none;">
            <button onclick="window.confirmPayMissed('${vendorId}','${collectionDate}','${rangeStr}')"
                    style="background:#f39c12;color:white;border:none;border-radius:7px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
                <i class="fa-solid fa-check"></i> Confirm
            </button>
            <button onclick="document.getElementById('${inputRowId}').remove()"
                    style="background:#f1f5f9;color:#7f8c8d;border:none;border-radius:7px;padding:9px 12px;font-weight:700;font-size:13px;cursor:pointer;">
                Cancel
            </button>
        </div>
        <div id="pay-amt-err-${vendorId}-${collectionDate.replace(/-/g,'')}"
             style="font-size:11px;color:#e74c3c;margin-top:4px;display:none;"></div>`;

    if (targetEntry) targetEntry.insertAdjacentElement('afterend', payForm);
    else debtRow.querySelector('td').appendChild(payForm);
    document.getElementById(`pay-amt-${vendorId}-${collectionDate.replace(/-/g,'')}`)?.focus();
};

window.confirmPayMissed = async (vendorId, collectionDate, rangeStr) => {
    const key    = `${vendorId}-${collectionDate.replace(/-/g,'')}`;
    const input  = document.getElementById(`pay-amt-${key}`);
    const errEl  = document.getElementById(`pay-amt-err-${key}`);
    if (!input) return;
    const amount = parseFloat(input.value);
    const nums   = String(rangeStr).replace(/₱/g,'').match(/\d+(\.\d+)?/g);
    const minVal = nums ? parseFloat(nums[0]) : 0;
    const maxVal = nums && nums[1] ? parseFloat(nums[1]) : minVal;

    if (!amount || amount <= 0) { if (errEl) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; } input.style.borderColor = '#e74c3c'; return; }
    if (maxVal > 0 && (amount < minVal || amount > maxVal)) { if (errEl) { errEl.textContent = `Amount must be between ₱${minVal} and ₱${maxVal}.`; errEl.style.display = 'block'; } input.style.borderColor = '#e74c3c'; return; }
    if (!currentOfficial) { showNotif('No collector info — please re-login.', 'error'); return; }

    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (!vendor) return;
    const fee = getFee(vendor);

    const { data: existingRow } = await supabase
        .from('tax_dscrpt_summary')
        .select('tax_dscrpt_id')
        .eq('vendor_id', vendor.vendor_id)
        .eq('collection_date', collectionDate)
        .maybeSingle();

    let dbError;
    if (existingRow) {
        const { error } = await supabase
            .from('tax_dscrpt_summary')
            .update({ tax_recorded: amount, officials_id: currentOfficial.officials_id, officials_name: currentOfficial.officials_name, amount_range: rangeStr })
            .eq('tax_dscrpt_id', existingRow.tax_dscrpt_id);
        dbError = error;
    } else {
        const { error } = await supabase
            .from('tax_dscrpt_summary')
            .insert({ vendor_id: vendor.vendor_id, vendor_name: vendor.vendor_name, vendor_stall_name: vendor.vendor_stall_name || vendor.vendor_stall_area || 'N/A', vendor_stall_number: vendor.vendor_stall_number || 0, area: vendor.vendor_stall_area || 'N/A', officials_id: currentOfficial.officials_id, officials_name: currentOfficial.officials_name, collection_fee_id: fee.id, product_services: vendor.product_services, amount_range: rangeStr, 'quantified ?': false, tax_recorded: amount, collection_date: collectionDate });
        dbError = error;
    }

    if (dbError) { console.error('confirmPayMissed:', dbError.message); showNotif('Failed: ' + dbError.message, 'error'); return; }
    showNotif(`✓ Debt ₱${amount} paid for ${collectionDate}`, 'success');
    document.getElementById(`debt-row-${vendorId}`)?.remove();
    window.showMissedPayments(vendorId);
};

// ══════════════════════════════════════════
// UNLOCK PAYMENT
// ══════════════════════════════════════════
window.unlockPayment = async (vendorId) => {
    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (!vendor) return;
    vendor.hasPaid = false; vendor.paidAmount = 0;
    const input = document.getElementById(`amt-${vendorId}`);
    if (input) { input.disabled = false; input.classList.remove('paid-border'); input.style.border = "2px solid #ddd"; }
    const ac = document.getElementById(`action-container-${vendorId}`);
    if (ac) ac.innerHTML = `<button class="btn-done" id="done-${vendorId}" onclick="window.markAsPaid('${vendorId}')">DONE PAYING</button>`;
    await syncToFirebase(vendor);
    window.validateRange(vendorId, getFee(vendor).range || "0.00");
};

// ══════════════════════════════════════════
// FINISH & UPLOAD
// ══════════════════════════════════════════
window.finishAndUpload = async () => {
    const unpaid = allVendors.filter(v => v.isPresent && !v.hasPaid);
    if (unpaid.length > 0) {
        const el = document.getElementById('confirmMessage');
        if (el) el.textContent = `${unpaid.length} present vendor${unpaid.length > 1 ? 's have' : ' has'} not paid yet.`;
        document.getElementById('confirmModalOverlay').style.display = 'flex';
    } else { await executeUpload(); }
};

window.confirmUpload = async (proceed) => {
    document.getElementById('confirmModalOverlay').style.display = 'none';
    if (proceed) await executeUpload();
};

async function executeUpload() {
    showNotif("Uploading records...", "info");
    let uploaded = 0;
    for (const v of allVendors) {
        await syncToFirebase(v);
        if (v.hasPaid && v.paidAmount > 0) { await upsertToSupabase(v, v.paidAmount); uploaded++; }
    }
    showNotif(`✓ ${uploaded} payment${uploaded !== 1 ? 's' : ''} uploaded!`, "success");
}

// ══════════════════════════════════════════
// TAX LIST MODAL
// ══════════════════════════════════════════
window.openTaxList  = () => { document.getElementById('taxModalOverlay').style.display = 'flex'; loadModalFees(); };
window.closeTaxList = () => { document.getElementById('taxModalOverlay').style.display = 'none'; };

async function loadModalFees() {
    const body = document.getElementById('tax-fee-list');
    if (!body) return;
    body.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Loading...</td></tr>";
    const { data } = await supabase.from('collection_fees').select('*').order('area', { ascending: true });
    if (!data) return;
    body.innerHTML = "";
    let lastArea = null;
    data.forEach(f => {
        if (f.area !== lastArea) {
            lastArea = f.area;
            const sep = document.createElement('tr');
            sep.style.cssText = "background:#2971b9;";
            sep.innerHTML = `<td colspan="3" style="color:white;font-weight:800;font-size:12px;letter-spacing:1px;padding:10px 20px;text-transform:uppercase;"><i class="fa-solid fa-building" style="margin-right:8px;"></i>${f.area}</td>`;
            body.appendChild(sep);
        }
        const isQuantified = f['quantified?'] === true || f['quantified ?'] === true;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding-left:28px;">${f.product_services}</td><td style="font-weight:700;">${f.amount_range}</td><td class="center-col">${isQuantified ? '<span style="color:#27ae60;font-weight:700;">✅ YES</span>' : '<span style="color:#95a5a6;">—</span>'}</td>`;
        body.appendChild(tr);
    });
}

// ══════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════
function showNotif(msg, type = 'success') {
    const c = document.getElementById('notificationsContainer');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

// ══════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════
document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
});

init();