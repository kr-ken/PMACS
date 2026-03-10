import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, collection, getDocs, addDoc, updateDoc, doc, onSnapshot,
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

// Initialize Clients
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseKey);
const vendorsCollection = collection(db, "vendors");

const taxRates = { "Meat": 20, "Vegetables": 10, "Dry Goods": 50, "Fish": 15, "Default": 10 };

// --- UI LOGIC: DATE ---
const options = { year: "numeric", month: "long", day: "numeric" };
const dateElement = document.getElementById("currentDate");
if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = String(text).toUpperCase();
    return div.innerHTML;
}

// --- VENDOR TABLE (FIREBASE) ---
function renderVendors(docs) {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const groupedVendors = {};
    docs.forEach((vendorDoc) => {
        const vendor = vendorDoc.data();
        const area = vendor.vendor_stall_area || "UNASSIGNED AREA";
        if (!groupedVendors[area]) groupedVendors[area] = [];
        groupedVendors[area].push({ id: vendorDoc.id, ...vendor });
    });

    for (const [area, vendors] of Object.entries(groupedVendors)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="4"><i class="fa-solid fa-building"></i> ${escapeHtml(area)}</td>`;
        tableBody.appendChild(headerRow);

        vendors.forEach(vendor => {
            const taxAmount = taxRates[vendor.stallType] || taxRates.Default;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${escapeHtml(vendor.vendor_name)}</strong></td>
                <td><strong>${escapeHtml(vendor.product_services)}</strong></td>
                <td class="attendance-cell">
                    <input type="checkbox" class="custom-checkbox" data-id="${vendor.id}" data-field="isPresent" ${vendor.isPresent ? "checked" : ""}>
                </td>
                <td>
                    <div class="tax-cell">
                        <div class="tax-pill">₱${taxAmount}</div>
                        <input type="checkbox" class="custom-checkbox" data-id="${vendor.id}" data-field="hasPaid" ${vendor.hasPaid ? "checked" : ""}>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
    attachCheckboxListeners();
}

async function updateRecord(id, field, value, checkboxElement) {
    const vendorRef = doc(db, "vendors", id);
    try {
        await updateDoc(vendorRef, { [field]: value });
    } catch (e) {
        console.error("Update failed:", e);
        if (checkboxElement) checkboxElement.checked = !value;
    }
}

function attachCheckboxListeners() {
    document.querySelectorAll(".custom-checkbox").forEach((cb) => {
        if (cb.dataset.listenerAttached) return;
        cb.addEventListener("change", async (e) => {
            await updateRecord(e.target.dataset.id, e.target.dataset.field, e.target.checked, e.target);
        });
        cb.dataset.listenerAttached = "true";
    });
}

// --- ADD VENDOR MODAL LOGIC ---
const vendorModal = document.getElementById('vendorModal');
const btnAddVendor = document.getElementById('btnAddVendor');
const closeVendorModal = document.getElementById('closeVendorModal');
const cancelVendorModal = document.getElementById('cancelVendorModal');
const vendorForm = document.getElementById('vendorForm');

const areaSelect = document.getElementById('vendor_stall_area');
const productSelect = document.getElementById('product_services');

const stallNameInput = document.getElementById('vendor_stall_name');
const stallNumberInput = document.getElementById('vendor_stall_number');
const vendorNameInput = document.getElementById('vendor_name');

const genUsernameInput = document.getElementById('generated_username');
const genPasswordInput = document.getElementById('generated_password');

// Open Modal
btnAddVendor.addEventListener('click', async () => {
    vendorModal.classList.remove('hidden');
    document.body.classList.add('modal-active');
    loadAreas();
});

// Close Modal
const closeModal = () => {
    vendorModal.classList.add('hidden');
    document.body.classList.remove('modal-active');
    vendorForm.reset();
};

closeVendorModal.addEventListener('click', closeModal);
cancelVendorModal.addEventListener('click', closeModal);

// Load Areas from collection_fees
async function loadAreas() {
    const { data, error } = await supabase
        .from('collection_fees')
        .select('area')
        .order('area', { ascending: true });

    if (error) {
        console.error("Error loading areas:", error);
        return;
    }

    const uniqueAreas = [...new Set(data.map(item => item.area))];
    areaSelect.innerHTML = '<option value="">Select Area</option>';
    uniqueAreas.forEach(area => {
        const opt = document.createElement('option');
        opt.value = area;
        opt.textContent = area.toUpperCase();
        areaSelect.appendChild(opt);
    });
}

// Load Products based on selected Area
areaSelect.addEventListener('change', async (e) => {
    const selectedArea = e.target.value;
    if (!selectedArea) {
        productSelect.innerHTML = '<option value="">Select Service</option>';
        productSelect.disabled = true;
        return;
    }

    const { data, error } = await supabase
        .from('collection_fees')
        .select('product_services')
        .eq('area', selectedArea)
        .order('product_services', { ascending: true });

    if (error) {
        console.error("Error loading services:", error);
        return;
    }

    productSelect.innerHTML = '<option value="">Select Service</option>';
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.product_services;
        opt.textContent = item.product_services.toUpperCase();
        productSelect.appendChild(opt);
    });
    productSelect.disabled = false;
});

// Automatic Credential Generation
function updateCredentials() {
    const stallName = stallNameInput.value;
    const vendorName = vendorNameInput.value;
    const stallNumber = stallNumberInput.value;

    // Username: Remove all non-alphanumeric, lowercase
    const username = stallName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    genUsernameInput.value = username;

    // Password: Last Name + Stall Number, lowercase
    let lastName = '';
    if (vendorName.includes(',')) {
        lastName = vendorName.split(',')[0].trim();
    } else {
        const parts = vendorName.split(' ');
        lastName = parts[parts.length - 1];
    }
    const password = (lastName + stallNumber).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    genPasswordInput.value = password;
}

stallNameInput.addEventListener('input', updateCredentials);
vendorNameInput.addEventListener('input', updateCredentials);
stallNumberInput.addEventListener('input', updateCredentials);

// Handle Form Submission
vendorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(vendorForm);

    const vendorData = {
        vendor_name: formData.get('vendor_name'),
        vendor_status: document.getElementById('vendor_status').checked,
        vendor_validity: document.getElementById('vendor_validity').checked,
        vendor_number: formData.get('vendor_number'),
        vendor_email: formData.get('vendor_email'),
        vendor_stall_number: parseInt(formData.get('vendor_stall_number')),
        product_services: formData.get('product_services'),
        'vendor_stand-in': formData.get('vendor_stand_in'),
        vendor_gender: formData.get('vendor_gender'),
        vendor_stall_name: formData.get('vendor_stall_name'),
        vendor_stall_area: formData.get('vendor_stall_area'),
        vendor_birthdate: formData.get('vendor_birthdate'),
        vendor_address: formData.get('vendor_address')
    };

    try {
        // 1. Insert into vendor_details
        const { data: newVendor, error: vError } = await supabase
            .from('vendor_details')
            .insert([vendorData])
            .select();

        if (vError) throw vError;

        const vendorId = newVendor[0].vendor_id;

        // 2. Insert into login_details_vendors
        const loginData = {
            vendor_id: vendorId,
            vendor_username: genUsernameInput.value,
            vendor_confirmedpassword: genPasswordInput.value
        };

        const { error: lError } = await supabase
            .from('login_details_vendors')
            .insert([loginData]);

        if (lError) throw lError;

        // 3. Optional: Add to Firebase for real-time tracking (attendance/tax)
        await addDoc(vendorsCollection, {
            ...vendorData,
            isPresent: false,
            hasPaid: false,
            supabase_id: vendorId
        });

        showNotification("Vendor registered successfully!");
        closeModal();
    } catch (error) {
        console.error("Registration failed:", error);
        showNotification("Failed to register vendor: " + error.message, "error");
    }
});

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.5s';
        setTimeout(() => notif.remove(), 500);
    }, 3000);
}

// Initial Load
onSnapshot(vendorsCollection, (snapshot) => renderVendors(snapshot.docs));
