import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURATION ---
const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(supabaseUrl, supabaseKey);

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

// --- VENDOR TABLE (SUPABASE) ---
async function fetchVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px;'>Loading vendors...</td></tr>";

    const { data: vendors, error } = await supabase
        .from('vendor_details')
        .select('*')
        .order('vendor_stall_area', { ascending: true });

    if (error) {
        console.error("Error fetching vendors:", error);
        tableBody.innerHTML = `<tr><td colspan='4' style='text-align:center; color:red;'>Error loading vendors: ${error.message}</td></tr>`;
        return;
    }

    renderVendors(vendors);
}

function renderVendors(vendors) {
    const tableBody = document.getElementById("vendor-list");
    tableBody.innerHTML = "";

    if (!vendors || vendors.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='4' class='empty-state'>No vendors registered yet.</td></tr>";
        return;
    }

    const groupedVendors = vendors.reduce((acc, vendor) => {
        const area = vendor.vendor_stall_area || "UNASSIGNED AREA";
        if (!acc[area]) acc[area] = [];
        acc[area].push(vendor);
        return acc;
    }, {});

    for (const [area, areaVendors] of Object.entries(groupedVendors)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="4"><i class="fa-solid fa-building"></i> ${escapeHtml(area)}</td>`;
        tableBody.appendChild(headerRow);

        areaVendors.forEach(vendor => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${escapeHtml(vendor.vendor_name)}</strong></td>
                <td><strong>${escapeHtml(vendor.product_services)}</strong></td>
                <td class="attendance-cell">
                    <span class="status-badge ${vendor.vendor_status ? 'active' : 'inactive'}">
                        ${vendor.vendor_status ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                </td>
                <td>
                    <div class="tax-cell">
                        <span class="validity-badge ${vendor.vendor_validity ? 'valid' : 'invalid'}">
                            ${vendor.vendor_validity ? 'VALID' : 'INVALID'}
                        </span>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
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

if (btnAddVendor) {
    btnAddVendor.addEventListener('click', async () => {
        vendorModal.classList.remove('hidden');
        document.body.classList.add('modal-active');
        loadAreas();
    });
}

const closeModal = () => {
    vendorModal.classList.add('hidden');
    document.body.classList.remove('modal-active');
    vendorForm.reset();
};

if (closeVendorModal) closeVendorModal.addEventListener('click', closeModal);
if (cancelVendorModal) cancelVendorModal.addEventListener('click', closeModal);

async function loadAreas() {
    const { data, error } = await supabase
        .from('collection_fees')
        .select('area')
        .order('area', { ascending: true });

    if (error) return;

    const uniqueAreas = [...new Set(data.map(item => item.area))];
    areaSelect.innerHTML = '<option value="">Select Area</option>';
    uniqueAreas.forEach(area => {
        const opt = document.createElement('option');
        opt.value = area;
        opt.textContent = area.toUpperCase();
        areaSelect.appendChild(opt);
    });
}

if (areaSelect) {
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

        if (error) return;

        productSelect.innerHTML = '<option value="">Select Service</option>';
        data.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.product_services;
            opt.textContent = item.product_services.toUpperCase();
            productSelect.appendChild(opt);
        });
        productSelect.disabled = false;
    });
}

function updateCredentials() {
    const stallName = stallNameInput.value;
    const vendorName = vendorNameInput.value;
    const stallNumber = stallNumberInput.value;

    const username = stallName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    genUsernameInput.value = username;

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

if (stallNameInput) stallNameInput.addEventListener('input', updateCredentials);
if (vendorNameInput) vendorNameInput.addEventListener('input', updateCredentials);
if (stallNumberInput) stallNumberInput.addEventListener('input', updateCredentials);

if (vendorForm) {
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
            const { data: newVendor, error: vError } = await supabase
                .from('vendor_details')
                .insert([vendorData])
                .select();

            if (vError) throw vError;

            const vendorId = newVendor[0].vendor_id;

            const loginData = {
                vendor_id: vendorId,
                vendor_username: genUsernameInput.value,
                vendor_confirmedpassword: genPasswordInput.value
            };

            const { error: lError } = await supabase
                .from('login_details_vendors')
                .insert([loginData]);

            if (lError) throw lError;

            showNotification("Vendor registered successfully!");
            closeModal();
            fetchVendors();
        } catch (error) {
            console.error("Registration failed:", error);
            showNotification("Failed to register vendor: " + error.message, "error");
        }
    });
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
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

const searchInput = document.getElementById('vendorSearch');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#vendor-list tr:not(.area-separator)');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}

// Initial Load
fetchVendors();
