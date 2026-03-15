import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
    measurementId: "G-5LGY80N96Q"
};

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- GLOBAL STATE ---
let allVendors = [];
let taxFeesLookup = {};

// --- INITIALIZATION ---
async function init() {
    updateDateDisplay();
    await loadTaxRates();
    await fetchVendors();
}

function updateDateDisplay() {
    const options = { year: "numeric", month: "long", day: "numeric" };
    const dateEl = document.getElementById("currentDate");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

async function loadTaxRates() {
    const { data, error } = await supabase.from('collection_fees').select('product_services, amount_range');
    if (!error && data) {
        data.forEach(fee => {
            taxFeesLookup[fee.product_services] = fee.amount_range;
        });
    }
}

async function fetchVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Loading vendors...</td></tr>";

    const { data: vendors, error } = await supabase
        .from('vendor_details')
        .select('*')
        .order('vendor_stall_area', { ascending: true });

    if (error) {
        console.error("Error loading vendors:", error);
        return;
    }

    allVendors = vendors || [];
    renderVendors();
}

function renderVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const groupedVendors = allVendors.reduce((acc, vendor) => {
        const area = (vendor.vendor_stall_area || "UNASSIGNED AREA").toUpperCase();
        if (!acc[area]) acc[area] = [];
        acc[area].push(vendor);
        return acc;
    }, {});

    for (const [area, areaVendors] of Object.entries(groupedVendors)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="5"><i class="fa-solid fa-building"></i> ${area}</td>`;
        tableBody.appendChild(headerRow);

        areaVendors.forEach(vendor => {
            const taxRef = taxFeesLookup[vendor.product_services] || "0.00";
            const isPaid = !!vendor.hasPaid;

            const row = document.createElement("tr");
            row.id = `row-${vendor.vendor_id}`;
            row.innerHTML = `
                <td>
                    <div style="font-weight: 700;">${vendor.vendor_name.toUpperCase()}</div>
                    <div style="font-size: 11px; color: #7f8c8d;">ID: ${vendor.vendor_id}</div>
                </td>
                <td>
                    <div style="font-weight: 600;">${vendor.product_services}</div>
                </td>
                <td class="center-col">
                    <input type="checkbox" class="attendance-checkbox" data-id="${vendor.vendor_id}" ${vendor.isPresent ? "checked" : ""}>
                </td>
                <td class="center-col">
                    <input type="number" class="amt-input" id="amt-${vendor.vendor_id}"
                           placeholder="${taxRef}"
                           value="${vendor.paidAmount || ''}"
                           oninput="window.validateRange('${vendor.vendor_id}', '${taxRef}')"
                           ${isPaid ? 'disabled' : ''}>
                </td>
                <td class="center-col">
                    <div id="action-container-${vendor.vendor_id}">
                        ${isPaid ?
                            `<button class="btn-edit-payment" onclick="window.unlockPayment('${vendor.vendor_id}')"><i class="fa-solid fa-ellipsis"></i></button>` :
                            `<button class="btn-done" id="done-${vendor.vendor_id}" onclick="window.markAsPaid('${vendor.vendor_id}')">DONE PAYING</button>`
                        }
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
    attachAttendanceListeners();
}

// --- RANGE VALIDATION ---
window.validateRange = (vendorId, rangeStr) => {
    const input = document.getElementById(`amt-${vendorId}`);
    const btn = document.getElementById(`done-${vendorId}`);
    if (!input) return;
    const val = parseFloat(input.value);

    const numbers = rangeStr.match(/\d+(\.\d+)?/g);

    if (!numbers || isNaN(val)) {
        input.style.border = "1.5px solid #ddd";
        if (btn) btn.disabled = false;
        return;
    }

    const min = parseFloat(numbers[0]);
    const max = numbers[1] ? parseFloat(numbers[1]) : min;

    if (val < min || val > max) {
        input.style.border = "2.5px solid #e74c3c";
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
        }
    } else {
        input.style.border = "2.5px solid #27ae60";
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    }
};

function attachAttendanceListeners() {
    document.querySelectorAll(".attendance-checkbox").forEach(cb => {
        cb.onchange = async (e) => {
            const id = e.target.dataset.id;
            const checked = e.target.checked;
            await supabase.from('vendor_details').update({ isPresent: checked }).eq('vendor_id', id);
        };
    });
}

window.markAsPaid = async (vendorId) => {
    const amtInput = document.getElementById(`amt-${vendorId}`);
    const paidAmount = parseFloat(amtInput.value) || 0;

    if (paidAmount <= 0) {
        showNotification("Please enter a valid amount", "error");
        return;
    }

    amtInput.disabled = true;
    amtInput.style.border = "1.5px solid #bdc3c7";
    const container = document.getElementById(`action-container-${vendorId}`);
    container.innerHTML = `<button class="btn-edit-payment" onclick="window.unlockPayment('${vendorId}')"><i class="fa-solid fa-ellipsis"></i></button>`;

    await supabase.from('vendor_details').update({
        hasPaid: true,
        paidAmount: paidAmount
    }).eq('vendor_id', vendorId);

    showNotification("Payment recorded locally");
};

window.unlockPayment = async (vendorId) => {
    const amtInput = document.getElementById(`amt-${vendorId}`);
    amtInput.disabled = false;

    const container = document.getElementById(`action-container-${vendorId}`);
    container.innerHTML = `<button class="btn-done" id="done-${vendorId}" onclick="window.markAsPaid('${vendorId}')">DONE PAYING</button>`;

    await supabase.from('vendor_details').update({ hasPaid: false }).eq('vendor_id', vendorId);

    const vendor = allVendors.find(v => String(v.vendor_id) === String(vendorId));
    window.validateRange(vendorId, taxFeesLookup[vendor.product_services] || "0.00");
};

// --- FINISH & UPLOAD LOGIC ---
window.finishAndUpload = async () => {
    const { data: vendors, error } = await supabase.from('vendor_details').select('*');
    if (error) return;

    const unpaidVendors = vendors.filter(v => !v.hasPaid);

    if (unpaidVendors.length > 0) {
        document.getElementById('confirmMessage').textContent = `${unpaidVendors.length} vendors haven't paid yet.`;
        document.getElementById('confirmModalOverlay').style.display = 'flex';
    } else {
        await executeUpload(vendors);
    }
};

window.confirmUpload = async (proceed) => {
    document.getElementById('confirmModalOverlay').style.display = 'none';
    if (proceed) {
        const { data: vendors } = await supabase.from('vendor_details').select('*');
        await executeUpload(vendors);
    }
};

async function executeUpload(vendors) {
    showNotification("Uploading to Firebase...", "info");
    let count = 0;
    for (const v of vendors) {
        const firebaseData = {
            vendor_id: String(v.vendor_id),
            vendor_name: v.vendor_name,
            stall_area: v.vendor_stall_area || "N/A",
            product_services: v.product_services,
            is_present: !!v.isPresent,
            has_paid: !!v.hasPaid,
            amount_paid: parseFloat(v.paidAmount) || 0,
            tax_reference: taxFeesLookup[v.product_services] || "N/A",
            timestamp: serverTimestamp()
        };
        await setDoc(doc(db, "vendor_realtime", String(v.vendor_id)), firebaseData, { merge: true });
        count++;
    }
    showNotification(`Success! ${count} records uploaded.`, "success");
}

// --- MODAL LOGIC ---
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
        tr.innerHTML = `<td>${f.product_services}</td><td style="font-weight:700;">${f.amount_range}</td><td class="center-col">${f['quantified?'] ? '✅' : '-'}</td>`;
        body.appendChild(tr);
    });
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

const vendorSearch = document.getElementById('vendorSearch');
if (vendorSearch) {
    vendorSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}

init();
