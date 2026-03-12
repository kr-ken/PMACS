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

// Age Calculation Helper
function calculateAge(birthdate) {
    if (!birthdate) return "N/A";
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// Capitalization Helper
function capitalizeFirstLetter(string) {
    if (!string) return "N/A";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

let allVendors = [];
let allValidities = [];

// --- VENDOR TABLE (SUPABASE) ---
async function fetchVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='7' style='text-align:center; padding:20px;'>Loading vendors...</td></tr>";

    try {
        const [vendorsRes, validityRes] = await Promise.all([
            supabase.from('vendor_details').select('*').order('vendor_stall_area', { ascending: true }),
            supabase.from('vendor_validity').select('*')
        ]);

        if (vendorsRes.error) throw vendorsRes.error;

        allVendors = vendorsRes.data || [];
        allValidities = validityRes.data || [];

        renderVendors(allVendors);
    } catch (error) {
        console.error("Error fetching data:", error);
        tableBody.innerHTML = `<tr><td colspan='7' style='text-align:center; color:red;'>Error loading vendors: ${error.message}</td></tr>`;
    }
}

function renderVendors(vendors) {
    const tableBody = document.getElementById("vendor-list");
    tableBody.innerHTML = "";

    if (!vendors || vendors.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='7' class='empty-state'>No vendors registered yet.</td></tr>";
        return;
    }

    const groupedVendors = vendors.reduce((acc, vendor) => {
        const area = (vendor.vendor_stall_area || "UNASSIGNED AREA").toUpperCase();
        if (!acc[area]) acc[area] = [];
        acc[area].push(vendor);
        return acc;
    }, {});

    const today = new Date();

    for (const [area, areaVendors] of Object.entries(groupedVendors)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="7"><i class="fa-solid fa-building"></i> ${escapeHtml(area)}</td>`;
        tableBody.appendChild(headerRow);

        areaVendors.forEach(vendor => {
            const validity = allValidities.find(v => v.vendor_id === vendor.vendor_id);
            let validityHTML = `<span class="validity-info-badge no-data">NO DATA<span class="tooltip">No validity record found.</span></span>`;

            if (validity) {
                const expiryDate = new Date(validity.valid_until);
                const diffTime = expiryDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                let statusClass = diffDays < 0 ? "expired" : (diffDays <= 30 ? "warning" : "valid");
                let statusText = diffDays < 0 ? "EXPIRED" : (diffDays <= 30 ? "EXPIRING SOON" : "VALID");

                validityHTML = `
                    <div class="validity-info-badge ${statusClass}" onclick="viewValidityDetails(${vendor.vendor_id})">
                        ${statusText} <i class="fa-solid fa-circle-info"></i>
                        <span class="tooltip">Valid Until: ${validity.valid_until}<br>Click for details</span>
                    </div>
                `;
            }

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${escapeHtml(vendor.vendor_name)}</strong></td>
                <td class="center-col">
                    <div class="info-badge" onclick="viewVendorDetails(${vendor.vendor_id})">
                        INFO <i class="fa-solid fa-circle-info"></i>
                        <span class="tooltip">
                            View full profile and contact details.
                        </span>
                    </div>
                </td>
                <td class="stall-info-text">
                    <div><span>Stall Name:</span> ${escapeHtml(vendor.vendor_stall_name)}</div>
                    <div><span>Stall No:</span> ${escapeHtml(vendor.vendor_stall_number)}</div>
                    <div><span>Area:</span> ${escapeHtml(vendor.vendor_stall_area)}</div>
                    <div><span>Service:</span> ${escapeHtml(vendor.product_services)}</div>
                </td>
                <td class="attendance-cell center-col">
                    <span class="status-badge ${vendor.vendor_status ? 'active' : 'inactive'}">
                        ${vendor.vendor_status ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                </td>
                <td class="center-col">
                    <span class="validity-badge ${vendor.vendor_validity ? 'valid' : 'invalid'}">
                        ${vendor.vendor_validity ? 'VALID' : 'INVALID'}
                    </span>
                </td>
                <td class="center-col">${validityHTML}</td>
                <td class="center-col">
                    <div class="action-btns">
                        <button class="btn-icon btn-edit" onclick="editVendor(${vendor.vendor_id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon btn-delete" onclick="deleteVendor(${vendor.vendor_id}, '${vendor.vendor_name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
}

// Full Profile Details
window.viewVendorDetails = (vendorId) => {
    const vendor = allVendors.find(v => v.vendor_id === vendorId);
    if (!vendor) return;

    const age = calculateAge(vendor.vendor_birthdate);
    const capitalizedGender = capitalizeFirstLetter(vendor.vendor_gender);

    document.getElementById('validityModalTitle').textContent = "Vendor Profile Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid #0369a1; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <p style="font-size: 1.5em; color: #0369a1; margin: 0;"><strong>${vendor.vendor_name.toUpperCase()}</strong></p>
            <p style="color: #64748b; margin-top: 5px; font-weight: 600;">VENDOR ID: ${vendor.vendor_id}</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; font-size: 15px; background: #fff; padding: 10px;">
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <p><strong><i class="fa-solid fa-cake-candles" style="width: 20px; color: #0369a1;"></i> Birthdate:</strong> <span style="font-size: 1.1em; font-weight: 600;">${vendor.vendor_birthdate || 'N/A'}</span></p>
                <p><strong><i class="fa-solid fa-user-clock" style="width: 20px; color: #0369a1;"></i> Age:</strong> <span style="font-size: 1.2em; font-weight: 600;">${age} Years Old</span></p>
                <p><strong><i class="fa-solid fa-venus-mars" style="width: 20px; color: #0369a1;"></i> Gender:</strong> ${capitalizedGender}</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <p><strong><i class="fa-solid fa-phone" style="width: 20px; color: #0369a1;"></i> Contact:</strong> ${vendor.vendor_number}</p>
                <p><strong><i class="fa-solid fa-envelope" style="width: 20px; color: #0369a1;"></i> Email:</strong> ${vendor.vendor_email}</p>
                <p><strong><i class="fa-solid fa-location-dot" style="width: 20px; color: #0369a1;"></i> Address:</strong> ${vendor.vendor_address}</p>
                <p><strong><i class="fa-solid fa-user-tie" style="width: 20px; color: #0369a1;"></i> Stand-in:</strong> ${vendor['vendor_stand-in'] || 'None'}</p>
            </div>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; font-size: 14px; text-align: center;">
            <p><strong>Registered Since:</strong> ${new Date(vendor.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.viewValidityDetails = (vendorId) => {
    const validity = allValidities.find(v => v.vendor_id === vendorId);
    const vendor = allVendors.find(v => v.vendor_id === vendorId);
    if (!validity || !vendor) return;

    document.getElementById('validityModalTitle').textContent = "Business Permit Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <p><strong>Vendor:</strong> ${vendor.vendor_name}</p>
        <p><strong>Permit No:</strong> ${validity.business_permit_no || 'N/A'}</p>
        <p><strong>TIN:</strong> ${validity.business_tin || 'N/A'}</p>
        <p><strong>Valid Until:</strong> ${validity.valid_until}</p>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.editVendor = async (id) => {
    const vendor = allVendors.find(v => v.vendor_id === id);
    if (!vendor) return;

    const vendorForm = document.getElementById('vendorForm');
    vendorForm.reset();
    document.getElementById('modalTitle').textContent = "Update Vendor Details";
    document.getElementById('submitBtn').textContent = "Update Vendor";
    document.getElementById('vendor_id').value = id;
    document.getElementById('credentialsSection').classList.add('hidden');

    document.getElementById('vendor_name').value = vendor.vendor_name;
    document.getElementById('vendor_gender').value = vendor.vendor_gender;
    document.getElementById('vendor_birthdate').value = vendor.vendor_birthdate;
    document.getElementById('vendor_address').value = vendor.vendor_address;
    document.getElementById('vendor_number').value = vendor.vendor_number;
    document.getElementById('vendor_email').value = vendor.vendor_email;
    document.getElementById('vendor_stand_in').value = vendor['vendor_stand-in'] || "";
    document.getElementById('vendor_stall_name').value = vendor.vendor_stall_name;
    document.getElementById('vendor_stall_number').value = vendor.vendor_stall_number;

    await loadAreas();
    document.getElementById('vendor_stall_area').value = vendor.vendor_stall_area;
    await loadProducts(vendor.vendor_stall_area);
    document.getElementById('product_services').value = vendor.product_services;

    document.getElementById('vendor_status').checked = vendor.vendor_status;
    document.getElementById('vendor_validity').checked = vendor.vendor_validity;

    document.getElementById('vendorModal').classList.remove('hidden');
    document.body.classList.add('modal-active');
};

let vendorIdToDelete = null;
window.deleteVendor = (id, name) => {
    vendorIdToDelete = id;
    document.getElementById('deleteVendorName').textContent = name.toUpperCase();
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
};

// Form Submission
const vendorForm = document.getElementById('vendorForm');
if (vendorForm) {
    vendorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(vendorForm);
        const vId = document.getElementById('vendor_id').value;

        const vendorData = {
            vendor_name: formData.get('vendor_name'),
            vendor_status: document.getElementById('vendor_status').checked,
            vendor_validity: document.getElementById('vendor_validity').checked,
            vendor_number: formData.get('vendor_number'),
            vendor_email: formData.get('vendor_email'),
            vendor_stall_number: parseInt(formData.get('vendor_stall_number')) || 0,
            product_services: formData.get('product_services'),
            'vendor_stand-in': formData.get('vendor_stand_in'),
            vendor_gender: formData.get('vendor_gender'),
            vendor_stall_name: formData.get('vendor_stall_name'),
            vendor_stall_area: formData.get('vendor_stall_area'),
            vendor_birthdate: formData.get('vendor_birthdate'),
            vendor_address: formData.get('vendor_address')
        };

        try {
            if (vId) {
                // UPDATE MODE
                const { error } = await supabase
                    .from('vendor_details')
                    .update(vendorData)
                    .eq('vendor_id', Number(vId));
                if (error) throw error;
                showNotification("Vendor updated successfully!");
            } else {
                // CREATE MODE
                const { data: newVendor, error: vError } = await supabase.from('vendor_details').insert([vendorData]).select();
                if (vError) throw vError;

                const loginData = {
                    vendor_id: newVendor[0].vendor_id,
                    vendor_username: document.getElementById('generated_username').value,
                    vendor_confirmedpassword: document.getElementById('generated_password').value
                };
                await supabase.from('login_details_vendors').insert([loginData]);
                showNotification("Vendor registered successfully!");
            }
            document.getElementById('vendorModal').classList.add('hidden');
            document.body.classList.remove('modal-active');
            fetchVendors();
        } catch (error) {
            console.error("Operation failed:", error);
            showNotification("Operation failed: " + error.message, "error");
        }
    });
}

// Modal closing logic
const closeModal = () => {
    document.getElementById('vendorModal').classList.add('hidden');
    document.body.classList.remove('modal-active');
};
document.getElementById('closeVendorModal').onclick = closeModal;
document.getElementById('cancelVendorModal').onclick = closeModal;

// Validity Modal closing logic
const closeValidityModal = () => {
    document.getElementById('validityModal').classList.add('hidden');
};
document.getElementById('closeValidityModal').onclick = closeValidityModal;
document.getElementById('closeValidityBtn').onclick = closeValidityModal;

// Delete Modal closing logic
const closeDeleteModal = () => {
    document.getElementById('deleteConfirmModal').classList.add('hidden');
};
document.getElementById('closeDeleteModal').onclick = closeDeleteModal;
document.getElementById('cancelDeleteBtn').onclick = closeDeleteModal;

// Helper to load areas/products
async function loadAreas() {
    const { data } = await supabase.from('collection_fees').select('area');
    const uniqueAreas = [...new Set((data || []).map(item => item.area))];
    const select = document.getElementById('vendor_stall_area');
    if (!select) return;
    select.innerHTML = '<option value="">Select Area</option>';
    uniqueAreas.forEach(area => {
        if (!area) return;
        const opt = document.createElement('option');
        opt.value = area;
        opt.textContent = area.toUpperCase();
        select.appendChild(opt);
    });
}

async function loadProducts(area) {
    const select = document.getElementById('product_services');
    if (!select) return;
    if (!area) { select.disabled = true; return; }
    const { data } = await supabase.from('collection_fees').select('product_services').eq('area', area);
    select.innerHTML = '<option value="">Select Service</option>';
    (data || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.product_services;
        opt.textContent = item.product_services.toUpperCase();
        select.appendChild(opt);
    });
    select.disabled = false;
}

const areaSelect = document.getElementById('vendor_stall_area');
if (areaSelect) {
    areaSelect.onchange = (e) => loadProducts(e.target.value);
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

fetchVendors();
