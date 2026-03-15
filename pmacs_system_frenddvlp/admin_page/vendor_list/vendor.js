import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURATION ---
const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- GLOBAL STATE ---
let allVendors = [];
let allValidities = [];
let currentStep = 1;
const totalSteps = 3;

// --- UTILS ---
function calculateAge(birthdate) {
    if (!birthdate) return "N/A";
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function capitalizeFirstLetter(string) {
    if (!string) return "N/A";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

// --- FETCH DATA ---
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
        if (validityRes.error) throw validityRes.error;

        allVendors = vendorsRes.data || [];
        allValidities = validityRes.data || [];

        renderVendors();
    } catch (error) {
        console.error("Fetch error:", error);
        tableBody.innerHTML = `<tr><td colspan='7' style='text-align:center; color:red;'>Error: ${error.message}</td></tr>`;
    }
}

function renderVendors() {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (allVendors.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='7' class='empty-state'>No vendors registered.</td></tr>";
        return;
    }

    const groupedVendors = allVendors.reduce((acc, vendor) => {
        const area = (vendor.vendor_stall_area || "UNASSIGNED AREA").toUpperCase();
        if (!acc[area]) acc[area] = [];
        acc[area].push(vendor);
        return acc;
    }, {});

    const today = new Date();

    for (const [area, areaVendors] of Object.entries(groupedVendors)) {
        const headerRow = document.createElement("tr");
        headerRow.className = "area-separator";
        headerRow.innerHTML = `<td colspan="7"><i class="fa-solid fa-building"></i> ${area}</td>`;
        tableBody.appendChild(headerRow);

        areaVendors.forEach(vendor => {
            const validity = allValidities.find(v => String(v.vendor_id).trim() === String(vendor.vendor_id).trim());
            let validityHTML = `<span class="validity-info-badge no-data">NO DATA</span>`;

            if (validity) {
                const expiryDate = new Date(validity.valid_until);
                const isExpired = expiryDate < today;
                const statusClass = isExpired ? "expired" : "valid";
                const statusText = isExpired ? "EXPIRED" : "VALID";

                validityHTML = `
                    <div class="validity-info-badge ${statusClass}" onclick="window.viewValidityDetails('${vendor.vendor_id}')" style="cursor: pointer;">
                        ${statusText} <i class="fa-solid fa-circle-info"></i>
                    </div>
                `;
            }

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${vendor.vendor_name.toUpperCase()}</strong></td>
                <td class="center-col"><div class="info-badge" onclick="window.viewVendorDetails('${vendor.vendor_id}')" style="cursor: pointer;">INFO</div></td>
                <td class="stall-info-text">
                    <div><span>Name:</span> ${vendor.vendor_stall_name}</div>
                    <div><span>No:</span> ${vendor.vendor_stall_number}</div>
                    <div><span>Service:</span> ${vendor.product_services}</div>
                    <div><span>Area:</span> ${vendor.vendor_stall_area}</div>
                </td>
                <td class="center-col"><span class="status-badge ${vendor.vendor_status ? 'active' : 'inactive'}">${vendor.vendor_status ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td class="center-col"><span class="validity-badge ${vendor.vendor_validity ? 'valid' : 'invalid'}">${vendor.vendor_validity ? 'VALID' : 'INVALID'}</span></td>
                <td class="center-col">${validityHTML}</td>
                <td class="center-col">
                    <div class="action-btns">
                        <button class="btn-icon btn-edit" onclick="window.editVendor('${vendor.vendor_id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon btn-delete" onclick="window.deleteVendor('${vendor.vendor_id}', '${vendor.vendor_name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
}

// --- GLOBAL ATTACHMENTS ---
window.viewVendorDetails = (vendorId) => {
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    if (!vendor) return;
    const age = calculateAge(vendor.vendor_birthdate);

    document.getElementById('validityModalTitle').textContent = "Vendor Profile Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid #0369a1;">
            <p style="font-size: 1.5em; color: #0369a1; margin: 0;"><strong>${vendor.vendor_name.toUpperCase()}</strong></p>
            <p style="color: #64748b; margin-top: 5px; font-weight: 600;">VENDOR ID: ${vendor.vendor_id}</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 15px;">
            <div>
                <p><strong>Birthdate:</strong> ${vendor.vendor_birthdate || 'N/A'}</p>
                <p><strong>Age:</strong> ${age}</p>
                <p><strong>Gender:</strong> ${vendor.vendor_gender}</p>
            </div>
            <div>
                <p><strong>Contact:</strong> ${vendor.vendor_number}</p>
                <p><strong>Email:</strong> ${vendor.vendor_email || 'N/A'}</p>
                <p><strong>Address:</strong> ${vendor.vendor_address}</p>
                <p><strong>Stand-in:</strong> ${vendor['vendor_stand-in'] || 'None'}</p>
            </div>
        </div>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.viewValidityDetails = (vendorId) => {
    const validity = allValidities.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    if (!validity) return;

    document.getElementById('validityModalTitle').textContent = "Business Permit Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <div style="background: #fff1f0; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid var(--accent-color);">
            <p style="font-size: 1.5em; color: var(--accent-color); margin: 0;"><strong>${vendor ? vendor.vendor_name.toUpperCase() : 'PERMIT INFO'}</strong></p>
            <p style="color: #64748b; margin-top: 5px; font-weight: 600;">STALL: ${vendor ? vendor.vendor_stall_name : 'N/A'} (#${vendor ? vendor.vendor_stall_number : 'N/A'})</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 14px;">
            <div>
                <p><strong>Validity ID:</strong> ${validity.validity_id}</p>
                <p><strong>Vendor ID:</strong> ${validity.vendor_id}</p>
                <p><strong>Business ID No:</strong> ${validity['business_id_no.'] || 'N/A'}</p>
            </div>
            <div>
                <p><strong>Business TIN:</strong> ${validity.business_tin || 'N/A'}</p>
                <p><strong>Permit No:</strong> ${validity.business_permit_no || 'N/A'}</p>
                <p><strong>Date Issued:</strong> ${validity.date_issued}</p>
                <p><strong>Valid Until:</strong> <span style="color: ${new Date(validity.valid_until) < new Date() ? 'red' : 'green'}; font-weight: bold;">${validity.valid_until}</span></p>
            </div>
        </div>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.refreshVendorData = () => {
    showNotification("Refreshing data...");
    fetchVendors();
};

window.revalidateVendorPermits = async () => {
    showNotification("Validating permit expiry...", "info");
    try {
        const { data: validities, error } = await supabase.from('vendor_validity').select('*');
        if (error) throw error;
        const today = new Date();
        for (const permit of validities) {
            const isValid = new Date(permit.valid_until) >= today;
            await supabase.from('vendor_details').update({ vendor_validity: isValid }).eq('vendor_id', permit.vendor_id);
        }
        showNotification("Permits re-validated!", "success");
        fetchVendors();
    } catch (e) {
        showNotification("Revalidation failed", "error");
    }
};

window.editVendor = async (id) => {
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(id).trim());
    if (!vendor) return;
    resetValidationStyles();
    currentStep = 1;
    updateStepperUI();
    document.getElementById('modalTitle').textContent = "Update Vendor Details";
    document.getElementById('vendor_id').value = id;

    // Populate form
    document.getElementById('vendor_name').value = vendor.vendor_name;
    document.getElementById('vendor_gender').value = vendor.vendor_gender;
    document.getElementById('vendor_birthdate').value = vendor.vendor_birthdate;
    document.getElementById('vendor_address').value = vendor.vendor_address;
    document.getElementById('vendor_number').value = vendor.vendor_number;
    document.getElementById('vendor_email').value = vendor.vendor_email || "";
    document.getElementById('vendor_stall_name').value = vendor.vendor_stall_name;
    document.getElementById('vendor_stall_number').value = vendor.vendor_stall_number;
    document.getElementById('vendor_stand_in').value = vendor['vendor_stand-in'] || "";

    await loadAreas();
    document.getElementById('vendor_stall_area').value = vendor.vendor_stall_area;
    await loadProducts(vendor.vendor_stall_area);
    document.getElementById('product_services').value = vendor.product_services;

    const validity = allValidities.find(v => String(v.vendor_id).trim() === String(id).trim());
    if (validity) {
        document.getElementById('business_id_no').value = validity['business_id_no.'] || "";
        document.getElementById('business_tin').value = validity.business_tin || "";
        document.getElementById('business_permit_no').value = validity.business_permit_no || "";
        document.getElementById('date_issued').value = validity.date_issued || "";
        document.getElementById('valid_until').value = validity.valid_until || "";
    }

    document.getElementById('vendorModal').classList.remove('hidden');
    document.body.classList.add('modal-active');
};

let vendorIdToDelete = null;
window.deleteVendor = (id, name) => {
    vendorIdToDelete = id;
    document.getElementById('deleteVendorName').textContent = name.toUpperCase();
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchVendors();

    const options = { year: "numeric", month: "long", day: "numeric" };
    const dateEl = document.getElementById("currentDate");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();

    // Close buttons
    document.getElementById('closeVendorModal').onclick = () => {
        document.getElementById('vendorModal').classList.add('hidden');
        document.body.classList.remove('modal-active');
        resetValidationStyles();
    };

    document.getElementById('closeValidityModal').onclick = () => {
        document.getElementById('validityModal').classList.add('hidden');
    };

    document.getElementById('closeDeleteModal').onclick = document.getElementById('cancelDeleteBtn').onclick = () => {
        document.getElementById('deleteConfirmModal').classList.add('hidden');
    };

    document.getElementById('confirmDeleteBtn').onclick = async () => {
        if (!vendorIdToDelete) return;
        const { error } = await supabase.from('vendor_details').delete().eq('vendor_id', vendorIdToDelete);
        if (!error) {
            showNotification("Vendor deleted successfully");
            document.getElementById('deleteConfirmModal').classList.add('hidden');
            fetchVendors();
        } else showNotification(error.message, "error");
    };

    // Search Input
    const searchInput = document.getElementById('vendorSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    }
});

function updateStepperUI() {
    document.querySelectorAll('.step-item').forEach(item => {
        const step = parseInt(item.dataset.step);
        item.classList.toggle('active', step === currentStep);
        item.classList.toggle('completed', step < currentStep);
    });
    document.querySelectorAll('.form-step').forEach(step => step.classList.toggle('active', step.id === `step${currentStep}`));
}

function resetValidationStyles() {
    document.querySelectorAll('#vendorForm input, #vendorForm select').forEach(i => i.style.borderColor = '');
}

function showNotification(msg, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    container.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

async function loadAreas() {
    const { data } = await supabase.from('collection_fees').select('area');
    const uniqueAreas = [...new Set((data || []).map(item => item.area))];
    const select = document.getElementById('vendor_stall_area');
    if (select) select.innerHTML = '<option value="">Select Area</option>' + uniqueAreas.map(a => `<option value="${a}">${a.toUpperCase()}</option>`).join('');
}

async function loadProducts(area) {
    const select = document.getElementById('product_services');
    if (!select) return;
    if (!area) { select.disabled = true; return; }
    const { data } = await supabase.from('collection_fees').select('product_services').eq('area', area);
    select.innerHTML = '<option value="">Select Service</option>' + data.map(i => `<option value="${i.product_services}">${i.product_services.toUpperCase()}</option>`).join('');
    select.disabled = false;
}

const areaSelect = document.getElementById('vendor_stall_area');
if (areaSelect) areaSelect.onchange = (e) => loadProducts(e.target.value);
