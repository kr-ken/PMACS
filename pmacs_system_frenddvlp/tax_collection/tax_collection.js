import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
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

const firebaseApp = initializeApp(firebaseConfig);
const rtdb = getDatabase(firebaseApp);
const supabase = createClient(supabaseUrl, supabaseKey);

let allVendors      = [];
let taxFeesLookup   = {};
let cachedAmounts   = {};
let currentOfficial = null;

const today = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
})();

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

// RESTORE FROM REALTIME DATABASE
async function loadFirebaseState() {
    try {
        const snapshot = await get(child(ref(rtdb), `vendor_realtime`));
        if (!snapshot.exists()) return;

        const todayMap = {};
        snapshot.forEach(childSnap => {
            const data = childSnap.val();
            if (data.collection_date === today) {
                todayMap[String(data.vendor_id)] = data;
            }
        });

        allVendors = allVendors.map(v => {
            const fb = todayMap[String(v.vendor_id)];
            if (!fb) return v;
            return { ...v, isPresent: !!fb.is_present, hasPaid: !!fb.has_paid, paidAmount: parseFloat(fb.amount_paid) || 0 };
        });
    } catch (e) { console.error("loadFirebaseState error:", e.message); }
}

// SAVE TO REALTIME DATABASE
async function syncToFirebase(vendor) {
    const fee = getFee(vendor);
    const key = `${vendor.vendor_id}_${today}`; // Unique key so each day is saved separately
    try {
        await set(ref(rtdb, `vendor_realtime/${key}`), {
            vendor_id:        String(vendor.vendor_id),
            vendor_name:      String(vendor.vendor_name || "Unknown"),
            stall_area:       String(vendor.vendor_stall_area || 'N/A'),
            product_services: String(vendor.product_services || 'N/A'),
            tax_reference:    String(fee.range || 'N/A'),
            is_present:       !!vendor.isPresent,
            has_paid:         !!vendor.hasPaid,
            amount_paid:      parseFloat(vendor.paidAmount) || 0,
            timestamp:        Date.now(),
            collection_date:  String(today),
        });
    } catch (e) { console.error(`syncToFirebase failed:`, e.message); }
}

async function upsertToSupabase(vendor, paidAmount) {
    if (!currentOfficial) return;
    const fee = getFee(vendor);
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

    if (error) console.error('upsertToSupabase ERROR:', error.message);
    else cachedAmounts[vendor.vendor_id] = paidAmount;
}

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
                <input type="number" class="amt-input" id="amt-${v.vendor_id}" value="${past != null ? past : ''}" placeholder="—" disabled style="background:#f5f5f5;color:#aaa;">
                <div style="font-size:11px;color:#aaa;margin-top:4px;">${pastLabel}</div>
            </td>
            <td class="center-col"><span style="font-size:11px;font-weight:700;color:#aaa;">ABSENT</span></td>`;
    }

    const isPaid    = !!v.hasPaid;
    const isQuant   = !!fee.quantified;
    const prefill   = v.paidAmount > 0 ? v.paidAmount : (past != null ? past : '');
    const nums      = (range || '').replace(/₱/g,'').match(/\d+(\.\d+)?/g);
    const unitPrice = nums ? parseFloat(nums[0]) : 0;

    const taxTd = isQuant && !isPaid ? `
        <td class="center-col">
            <div style="display:flex;flex-direction:column;gap:5px;max-width:200px;margin:0 auto;">
                <input type="number" readonly id="unit-${v.vendor_id}" value="${unitPrice}" style="text-align:center;background:#f5f5f5;">
                <input type="number" min="0" id="qty-${v.vendor_id}" placeholder="QTY" oninput="window.calcTotal('${v.vendor_id}')" style="text-align:center;">
                <input type="number" readonly id="amt-${v.vendor_id}" placeholder="TOTAL" style="text-align:center;background:#f0fff4;color:#27ae60;font-weight:800;">
            </div>
        </td>` :
        `<td class="center-col">
            <input type="number" class="amt-input ${isPaid ? 'paid-border' : ''}" id="amt-${v.vendor_id}" placeholder="${range}" value="${prefill}" oninput="window.validateRange('${v.vendor_id}', '${range}')" ${isPaid ? 'disabled' : ''}>
            <div style="font-size:11px;color:${isPaid ? '#3498db' : '#7f8c8d'};margin-top:4px;">${isPaid ? `✓ Paid ₱${v.paidAmount}` : `Range: ${range}`}</div>
        </td>`;

    return `
        <td><div style="font-weight:700;">${v.vendor_name.toUpperCase()}</div><div style="font-size:11px;color:#7f8c8d;">ID: ${v.vendor_id}</div></td>
        <td><div style="font-weight:600;">${v.product_services}</div></td>
        <td class="center-col"><input type="checkbox" class="attendance-checkbox" data-id="${v.vendor_id}" checked></td>
        ${taxTd}
        <td class="center-col">
            <div id="action-container-${v.vendor_id}">
                ${isPaid ? `<button class="btn-edit-payment" onclick="window.unlockPayment('${v.vendor_id}')"><i class="fa-solid fa-pen"></i> Edit</button>`
                         : `<button class="btn-done" id="done-${v.vendor_id}" onclick="window.markAsPaid('${v.vendor_id}')">DONE</button>`}
            </div>
        </td>`;
}

window.calcTotal = (id) => {
    const u = parseFloat(document.getElementById(`unit-${id}`)?.value) || 0;
    const q = parseFloat(document.getElementById(`qty-${id}`)?.value) || 0;
    const t = (u * q).toFixed(2);
    const el = document.getElementById(`amt-${id}`);
    if (el) el.value = t > 0 ? t : '';
};

function attachCheckboxListeners() {
    document.querySelectorAll(".attendance-checkbox").forEach(cb => {
        cb.onchange = async (e) => {
            const id = String(e.target.dataset.id);
            const vendor = allVendors.find(v => String(v.vendor_id) === id);
            if (!vendor) return;
            vendor.isPresent = e.target.checked;
            if (!vendor.isPresent) { vendor.hasPaid = false; vendor.paidAmount = 0; }
            renderVendors();
            await syncToFirebase(vendor);
        };
    });
}

window.validateRange = (id, rangeStr) => {
    const input = document.getElementById(`amt-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);
    const nums = rangeStr.match(/\d+(\.\d+)?/g);
    if (!nums || isNaN(val)) return;
    const min = parseFloat(nums[0]), max = nums[1] ? parseFloat(nums[1]) : min;
    input.style.border = (val < min || val > max) ? "2px solid #e74c3c" : "2px solid #27ae60";
};

window.markAsPaid = async (id) => {
    const vendor = allVendors.find(v => String(v.vendor_id) === String(id));
    const amt = parseFloat(document.getElementById(`amt-${id}`)?.value) || 0;
    if (amt <= 0 || !vendor) return;
    vendor.hasPaid = true; vendor.paidAmount = amt;
    await syncToFirebase(vendor);
    await upsertToSupabase(vendor, amt);
    renderVendors();
    showNotif(`Paid ₱${amt}`);
};

window.unlockPayment = async (id) => {
    const v = allVendors.find(vendor => String(vendor.vendor_id) === String(id));
    if (v) { v.hasPaid = false; v.paidAmount = 0; renderVendors(); await syncToFirebase(v); }
};

function showNotif(msg, type = 'success') {
    const c = document.getElementById('notificationsContainer');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
});

init();