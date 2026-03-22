import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getDatabase, ref, set, update, get
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    databaseURL: "https://pmacs-0001-default-rtdb.asia-southeast1.firebasedatabase.app", // ← verify in Firebase Console
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
};

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';

const firebaseApp = initializeApp(firebaseConfig);
const rtdb = getDatabase(firebaseApp);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- GLOBAL STATE ---
let allVendors = [];
let taxFeesLookup = {};
let cachedAmounts = {};
let currentOfficial = null; // { officials_id, officials_name }
const today = new Date().toISOString().split('T')[0];

// --- INIT ---
async function init() {
    updateDateDisplay();
    // requireAuth(); // re-enable after testing

    // Run independent fetches in parallel
    await Promise.all([
        loadCollectorInfo(),  // officials_details
        loadTaxRates(),       // collection_fees
    ]);

    // Vendors must load before cache + firebase (they depend on allVendors)
    await fetchVendors();

    // Cache + Firebase state can run in parallel after vendors loaded
    await Promise.all([
        loadCachedAmounts(),
        loadFirebaseState(),
    ]);

    renderVendors();
}

function updateDateDisplay() {
    const options = { year: "numeric", month: "long", day: "numeric" };
    const dateEl = document.getElementById("currentDate");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

// --- AUTH: redirect if no session or wrong role ---
function requireAuth() {
    const role = sessionStorage.getItem('pmacs_role');
    if (!role || role !== 'collector') {
        window.location.href = '/PMACS/login_page/login.html';
    }
}

// --- COLLECTOR: fetch full name from officials_details using officials_id in sessionStorage ---
async function loadCollectorInfo() {
    const id = sessionStorage.getItem('pmacs_id');
    if (!id) return;

    const { data, error } = await supabase
        .from('officials_details')
        .select('officials_id, officials_name')
        .eq('officials_id', parseInt(id))
        .single();

    if (error || !data) {
        console.error('loadCollectorInfo:', error?.message);
        // Fallback to sessionStorage name if query fails
        const fallbackName = sessionStorage.getItem('pmacs_name') || 'Unknown';
        currentOfficial = { officials_id: parseInt(id), officials_name: fallbackName };
        const nameEl = document.getElementById('collectorName');
        if (nameEl) nameEl.textContent = `Collector: ${fallbackName}`;
        return;
    }

    currentOfficial = {
        officials_id:   data.officials_id,
        officials_name: data.officials_name
    };

    const nameEl = document.getElementById('collectorName');
    if (nameEl) nameEl.textContent = `Collector: ${data.officials_name}`;
}

// --- LOGOUT ---
window.handleLogout = () => {
    sessionStorage.clear();
    window.location.href = '/PMACS/login_page/login.html';
};

// --- SUPABASE: READ ONLY ---
async function loadTaxRates() {
    const { data, error } = await supabase
        .from('collection_fees')
        .select('product_services, amount_range, collection_fee_id');
    if (error) { console.error('loadTaxRates:', error.message); return; }
    (data || []).forEach(fee => {
        // Key by product_services alone (fallback)
        taxFeesLookup[fee.product_services] = {
            range: fee.amount_range,
            id: fee.collection_fee_id
        };
        // Key by area:product_services (more specific — preferred)
        if (fee.area) {
            taxFeesLookup[`${fee.area}:${fee.product_services}`] = {
                range: fee.amount_range,
                id: fee.collection_fee_id
            };
        }
    });
}

async function fetchVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:20px;'>Loading vendors...</td></tr>";

    const { data: vendors, error } = await supabase
        .from('vendor_details')
        .select('vendor_id, vendor_name, vendor_stall_area, product_services')
        .order('vendor_stall_area', { ascending: true });

    if (error) {
        console.error("fetchVendors:", error.message);
        tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:red;'>Failed to load vendors.</td></tr>";
        return;
    }

    allVendors = (vendors || []).map(v => ({
        ...v,
        isPresent: false,
        hasPaid: false,
        paidAmount: 0
    }));
}

async function loadCachedAmounts() {
    // Only fetch the most recent payment per vendor (yesterday or earlier)
    // Avoids full table scan — filter to last 30 days max
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('tax_dscrpt_summary')
        .select('vendor_id, tax_recorded, collection_date')
        .gte('collection_date', sinceStr)
        .order('collection_date', { ascending: false });

    if (error) { console.error('loadCachedAmounts:', error.message); return; }

    // Keep only the latest row per vendor
    (data || []).forEach(row => {
        if (cachedAmounts[row.vendor_id] === undefined && row.tax_recorded) {
            cachedAmounts[row.vendor_id] = row.tax_recorded;
        }
    });
}

// --- FIREBASE RTDB: restore today's session ---
async function loadFirebaseState() {
    try {
        const snapshot = await get(ref(rtdb, 'vendor_realtime'));
        if (!snapshot.exists()) return;
        const firebaseMap = snapshot.val();

        allVendors = allVendors.map(v => {
            const fb = firebaseMap[String(v.vendor_id)];
            if (fb) {
                return {
                    ...v,
                    isPresent: !!fb.is_present,
                    hasPaid:   !!fb.has_paid,
                    paidAmount: parseFloat(fb.amount_paid) || 0
                };
            }
            return v;
        });
    } catch (e) {
        console.error("loadFirebaseState:", e.message);
    }
}

// --- FIREBASE RTDB: write single vendor ---
async function syncVendorToRTDB(vendor, extra = {}) {
    const feeEntry = taxFeesLookup[`${vendor.vendor_stall_area}:${vendor.product_services}`] || taxFeesLookup[vendor.product_services] || {};
    await set(ref(rtdb, `vendor_realtime/${vendor.vendor_id}`), {
        vendor_id:        String(vendor.vendor_id),
        vendor_name:      vendor.vendor_name,
        stall_area:       vendor.vendor_stall_area || "N/A",
        product_services: vendor.product_services,
        tax_reference:    feeEntry.range || "N/A",
        is_present:       !!vendor.isPresent,
        has_paid:         !!vendor.hasPaid,
        amount_paid:      parseFloat(vendor.paidAmount) || 0,
        timestamp:        Date.now(),
        ...extra
    });
}

// --- SUPABASE: upsert payment (one row per vendor per day) ---
async function upsertPaymentToSupabase(vendor, paidAmount) {
    if (!currentOfficial) {
        console.warn('No collector info — skipping Supabase upsert');
        return;
    }

    const feeEntry = taxFeesLookup[`${vendor.vendor_stall_area}:${vendor.product_services}`] || taxFeesLookup[vendor.product_services] || {};

    const { error } = await supabase
        .from('tax_dscrpt_summary')
        .upsert({
            vendor_id:          vendor.vendor_id,
            vendor_name:        vendor.vendor_name,
            vendor_stall_name:  vendor.vendor_stall_area || "N/A",
            area:               vendor.vendor_stall_area || "N/A",
            officials_id:       currentOfficial.officials_id,
            officials_name:     currentOfficial.officials_name,
            collection_fee_id:  feeEntry.id || null,
            product_services:   vendor.product_services,
            amount_range:       feeEntry.range || "N/A",
            "quantified ?":     false,
            tax_recorded:       paidAmount,
            collection_date:    today
        }, {
            onConflict: 'vendor_id,collection_date'
        });

    if (error) console.error('upsertPaymentToSupabase:', error.message);
    else cachedAmounts[vendor.vendor_id] = paidAmount;
}

// --- RENDER ---
function renderVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const grouped = allVendors.reduce((acc, vendor) => {
        const area = (vendor.vendor_stall_area || "UNASSIGNED AREA").toUpperCase();
        if (!acc[area]) acc[area] = [];
        acc[area].push(vendor);
        return acc;
    }, {});

    for (const [area, areaVendors] of Object.entries(grouped)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="5"><i class="fa-solid fa-building"></i> ${area}</td>`;
        tableBody.appendChild(headerRow);

        areaVendors.forEach(vendor => {
            const feeEntry  = taxFeesLookup[vendor.product_services] || {};
            const taxRef    = feeEntry.range || "0.00";
            const isPaid    = !!vendor.hasPaid;
            const cached    = cachedAmounts[vendor.vendor_id];
            const prefill   = vendor.paidAmount || cached || '';

            const row = document.createElement("tr");
            row.id = `row-${vendor.vendor_id}`;
            row.innerHTML = `
                <td>
                    <div style="font-weight:700;">${vendor.vendor_name.toUpperCase()}</div>
                    <div style="font-size:11px;color:#7f8c8d;">ID: ${vendor.vendor_id}</div>
                </td>
                <td>
                    <div style="font-weight:600;">${vendor.product_services}</div>
                </td>
                <td class="center-col">
                    <input type="checkbox" class="attendance-checkbox"
                           data-id="${vendor.vendor_id}"
                           ${vendor.isPresent ? "checked" : ""}>
                </td>
                <td class="center-col">
                    <input type="number" class="amt-input ${isPaid ? 'paid-border' : ''}"
                           id="amt-${vendor.vendor_id}"
                           placeholder="${taxRef}"
                           value="${prefill}"
                           oninput="window.validateRange('${vendor.vendor_id}', '${taxRef}')"
                           ${isPaid ? 'disabled style="border:2.5px solid #3498db;"' : ''}>
                    ${cached && !isPaid
                        ? `<div style="font-size:11px;color:#3498db;margin-top:4px;">Last paid: ₱${cached}</div>`
                        : ''}
                </td>
                <td class="center-col">
                    <div id="action-container-${vendor.vendor_id}">
                        ${isPaid
                            ? `<button class="btn-edit-payment" onclick="window.unlockPayment('${vendor.vendor_id}')">
                                   <i class="fa-solid fa-ellipsis"></i>
                               </button>`
                            : `<button class="btn-done" id="done-${vendor.vendor_id}"
                                       onclick="window.markAsPaid('${vendor.vendor_id}')">
                                   DONE PAYING
                               </button>`
                        }
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    attachAttendanceListeners();
}

// --- ATTENDANCE ---
function attachAttendanceListeners() {
    document.querySelectorAll(".attendance-checkbox").forEach(cb => {
        cb.onchange = async (e) => {
            const id      = String(e.target.dataset.id);
            const checked = e.target.checked;
            const vendor  = allVendors.find(v => String(v.vendor_id) === id);
            if (!vendor) return;
            vendor.isPresent = checked;
            await update(ref(rtdb, `vendor_realtime/${id}`), {
                is_present: checked,
                timestamp:  Date.now()
            });
        };
    });
}

// --- RANGE VALIDATION ---
window.validateRange = (vendorId, rangeStr) => {
    const input = document.getElementById(`amt-${vendorId}`);
    const btn   = document.getElementById(`done-${vendorId}`);
    if (!input) return;

    const val     = parseFloat(input.value);
    const numbers = rangeStr.match(/\d+(\.\d+)?/g);

    if (!numbers || isNaN(val)) {
        input.style.border = "1.5px solid #ddd";
        if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
        return;
    }

    const min = parseFloat(numbers[0]);
    const max = numbers[1] ? parseFloat(numbers[1]) : min;

    if (val < min || val > max) {
        input.style.border = "2.5px solid #e74c3c";
        if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; }
    } else {
        input.style.border = "2.5px solid #27ae60";
        if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
};

// --- PAYMENT ---
window.markAsPaid = async (vendorId) => {
    const amtInput  = document.getElementById(`amt-${vendorId}`);
    const paidAmount = parseFloat(amtInput.value) || 0;

    if (paidAmount <= 0) {
        showNotification("Please enter a valid amount", "error");
        return;
    }

    amtInput.disabled = true;
    amtInput.classList.add('paid-border');
    document.getElementById(`action-container-${vendorId}`).innerHTML =
        `<button class="btn-edit-payment" onclick="window.unlockPayment('${vendorId}')">
             <i class="fa-solid fa-ellipsis"></i>
         </button>`;

    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (vendor) {
        vendor.hasPaid    = true;
        vendor.paidAmount = paidAmount;
        await syncVendorToRTDB(vendor);
        await upsertPaymentToSupabase(vendor, paidAmount);
    }

    showNotification("Payment recorded!", "success");
};

window.unlockPayment = async (vendorId) => {
    const amtInput = document.getElementById(`amt-${vendorId}`);
    amtInput.disabled = false;
    amtInput.classList.remove('paid-border');
    amtInput.style.border = "2px solid #ddd";

    document.getElementById(`action-container-${vendorId}`).innerHTML =
        `<button class="btn-done" id="done-${vendorId}" onclick="window.markAsPaid('${vendorId}')">
             DONE PAYING
         </button>`;

    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    if (vendor) {
        vendor.hasPaid    = false;
        vendor.paidAmount = 0;
        await update(ref(rtdb, `vendor_realtime/${vendorId}`), {
            has_paid:   false,
            amount_paid: 0,
            timestamp:  Date.now()
        });
    }

    const feeEntry = taxFeesLookup[`${vendor?.vendor_stall_area}:${vendor?.product_services}`] || taxFeesLookup[vendor?.product_services] || {};
    window.validateRange(vendorId, feeEntry.range || "0.00");
};

// --- FINISH & UPLOAD ---
window.finishAndUpload = async () => {
    const unpaid = allVendors.filter(v => v.isPresent && !v.hasPaid);
    if (unpaid.length > 0) {
        document.getElementById('confirmMessage').textContent =
            `${unpaid.length} present vendor${unpaid.length > 1 ? 's have' : ' has'} not paid yet.`;
        document.getElementById('confirmModalOverlay').style.display = 'flex';
    } else {
        await executeUpload();
    }
};

window.confirmUpload = async (proceed) => {
    document.getElementById('confirmModalOverlay').style.display = 'none';
    if (proceed) await executeUpload();
};

async function executeUpload() {
    showNotification("Uploading records...", "info");
    let count = 0;
    for (const vendor of allVendors) {
        await syncVendorToRTDB(vendor);
        if (vendor.hasPaid && vendor.paidAmount > 0) {
            await upsertPaymentToSupabase(vendor, vendor.paidAmount);
        }
        count++;
    }
    showNotification(`✓ ${count} records uploaded!`, "success");
}

// --- TAX LIST MODAL ---
window.openTaxList = () => {
    document.getElementById('taxModalOverlay').style.display = 'flex';
    loadModalFees();
};
window.closeTaxList = () => {
    document.getElementById('taxModalOverlay').style.display = 'none';
};

async function loadModalFees() {
    const body = document.getElementById('tax-fee-list');
    body.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Loading...</td></tr>";
    const { data } = await supabase.from('collection_fees').select('*').order('area', { ascending: true });
    if (!data) return;
    body.innerHTML = "";
    data.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.product_services}</td>
            <td style="font-weight:700;">${f.amount_range}</td>
            <td class="center-col">${f['quantified?'] ? '✅' : '-'}</td>
        `;
        body.appendChild(tr);
    });
}

// --- NOTIFICATIONS (toast) ---
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// --- SEARCH ---
document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
});

init();