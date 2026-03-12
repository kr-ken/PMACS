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
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = String(text).toUpperCase();
    return div.innerHTML;
}

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

        allVendors = vendorsRes.data || [];
        allValidities = validityRes.data || [];
        renderVendors(allVendors);
    } catch (error) {
        console.error("Fetch error:", error);
        tableBody.innerHTML = `<tr><td colspan='7' style='text-align:center; color:red;'>Error: ${error.message}</td></tr>`;
    }
}

function renderVendors(vendors) {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (vendors.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='7' class='empty-state'>No vendors registered.</td></tr>";
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
            const validity = allValidities.find(v => Number(v.vendor_id) === Number(vendor.vendor_id));
            let validityHTML = `<span class="validity-info-badge no-data">NO DATA</span>`;

            if (validity) {
                const expiryDate = new Date(validity.valid_until);
                const diffTime = expiryDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                let statusClass = diffDays < 0 ? "expired" : (diffDays <= 30 ? "warning" : "valid");
                let statusText = diffDays < 0 ? "EXPIRED" : (diffDays <= 30 ? "EXPIRING SOON" : "VALID");

                validityHTML = `
                    <div class="validity-info-badge ${statusClass}" onclick="viewValidityDetails(${vendor.vendor_id})">
                        ${statusText} <i class="fa-solid fa-circle-info"></i>
                    </div>
                `;
            }

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${escapeHtml(vendor.vendor_name)}</strong></td>
                <td class="center-col"><div class="info-badge" onclick="viewVendorDetails(${vendor.vendor_id})">INFO</div></td>
                <td class="stall-info-text">
                    <div><span>Name:</span> ${escapeHtml(vendor.vendor_stall_name)}</div>
                    <div><span>No:</span> ${escapeHtml(vendor.vendor_stall_number)}</div>
                    <div><span>Area:</span> ${escapeHtml(vendor.vendor_stall_area)}</div>
                    <div><span>Service:</span> ${escapeHtml(vendor.product_services)}</div>
                </td>
                <td class="center-col"><span class="status-badge ${vendor.vendor_status ? 'active' : 'inactive'}">${vendor.vendor_status ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td class="center-col"><span class="validity-badge ${vendor.vendor_validity ? 'valid' : 'invalid'}">${vendor.vendor_validity ? 'VALID' : 'INVALID'}</span></td>
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

// --- GLOBAL ATTACHMENTS (for onclick handlers) ---
window.viewVendorDetails = (vendorId) => {
    const vendor = allVendors.find(v => Number(v.vendor_id) === Number(vendorId));
    if (!vendor) return;
    const age = calculateAge(vendor.vendor_birthdate);
    const capitalizedGender = capitalizeFirstLetter(vendor.vendor_gender);

    document.getElementById('validityModalTitle').textContent = "Vendor Profile Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid #0369a1;">
            <p style="font-size: 1.5em; color: #0369a1; margin: 0;"><strong>${vendor.vendor_name.toUpperCase()}</strong></p>
            <p style="color: #64748b; margin-top: 5px; font-weight: 600;">VENDOR ID: ${vendor.vendor_id}</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; font-size: 15px;">
            <div>
                <p><strong>Birthdate:</strong> ${vendor.vendor_birthdate || 'N/A'}</p>
                <p><strong>Age Today:</strong> ${age}</p>
                <p><strong>Gender:</strong> ${capitalizedGender}</p>
            </div>
            <div>
                <p><strong>Contact:</strong> ${vendor.vendor_number}</p>
                <p><strong>Email:</strong> ${vendor.vendor_email}</p>
                <p><strong>Address:</strong> ${vendor.vendor_address}</p>
                <p><strong>Stand-in:</strong> ${vendor['vendor_stand-in'] || 'None'}</p>
            </div>
        </div>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.viewValidityDetails = (vendorId) => {
    const validity = allValidities.find(v => Number(v.vendor_id) === Number(vendorId));
    const vendor = allVendors.find(v => Number(v.vendor_id) === Number(vendorId));
    if (!validity || !vendor) return;

    document.getElementById('validityModalTitle').textContent = "Business Permit Details";
    const detailsContainer = document.getElementById('validityDetails');
    detailsContainer.innerHTML = `
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p><strong>Vendor:</strong> ${vendor.vendor_name}</p>
            <p><strong>Stall:</strong> ${vendor.vendor_stall_name} (#${vendor.vendor_stall_number})</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
            <p><strong>Validity ID:</strong> ${validity.validity_id}</p>
            <p><strong>Business ID No:</strong> ${validity['business_id_no.'] || 'N/A'}</p>
            <p><strong>Business TIN:</strong> ${validity.business_tin || 'N/A'}</p>
            <p><strong>Business Permit No:</strong> ${validity.business_permit_no || 'N/A'}</p>
            <p><strong>Date Issued:</strong> ${validity.date_issued}</p>
            <p><strong>Valid Until:</strong> <span style="color: ${new Date(validity.valid_until) < new Date() ? 'red' : 'green'}; font-weight: bold;">${validity.valid_until}</span></p>
        </div>
    `;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.editVendor = async (id) => {
    const vendor = allVendors.find(v => Number(v.vendor_id) === Number(id));
    if (!vendor) return;

    currentStep = 1;
    updateStepperUI();
    document.getElementById('modalTitle').textContent = "Update Vendor Details";
    document.getElementById('submitBtn').textContent = "Update Vendor";
    document.getElementById('vendor_id').value = id;

    // Fill Form
    const fields = {
        'vendor_name': vendor.vendor_name,
        'vendor_gender': vendor.vendor_gender,
        'vendor_birthdate': vendor.vendor_birthdate,
        'vendor_address': vendor.vendor_address,
        'vendor_number': vendor.vendor_number,
        'vendor_email': vendor.vendor_email,
        'vendor_stall_name': vendor.vendor_stall_name,
        'vendor_stall_number': vendor.vendor_stall_number,
        'vendor_stand_in': vendor['vendor_stand-in']
    };

    for (const [key, val] of Object.entries(fields)) {
        const el = document.getElementById(key);
        if (el) el.value = val || "";
    }

    await loadAreas();
    document.getElementById('vendor_stall_area').value = vendor.vendor_stall_area;
    await loadProducts(vendor.vendor_stall_area);
    document.getElementById('product_services').value = vendor.product_services;

    const validity = allValidities.find(v => Number(v.vendor_id) === Number(id));
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

// --- MULTI-STEP FLOW LOGIC ---
function updateStepperUI() {
    document.querySelectorAll('.step-item').forEach(item => {
        const step = parseInt(item.dataset.step);
        item.classList.remove('active', 'completed');
        if (step === currentStep) item.classList.add('active');
        else if (step < currentStep) item.classList.add('completed');
    });

    const progressLine = document.getElementById('stepProgressLine');
    if (progressLine) {
        if (currentStep === 1) progressLine.style.width = '0%';
        else if (currentStep === 2) progressLine.style.width = '50%';
        else if (currentStep === 3) progressLine.style.width = '100%';
    }

    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step${currentStep}`).classList.add('active');

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');

    if (currentStep === 1) {
        prevBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    } else if (currentStep === totalSteps) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
        generateCredentialsPreview();
    } else {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

function validateCurrentStep() {
    const stepDiv = document.getElementById(`step${currentStep}`);
    const requiredInputs = stepDiv.querySelectorAll('input[required], select[required]');
    let isValid = true;

    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            input.style.borderColor = 'red';
            isValid = false;
        } else {
            input.style.borderColor = '';
        }
    });

    if (!isValid) showNotification("Please fill up all required fields.", "error");
    return isValid;
}

function generateCredentialsPreview() {
    const stallName = document.getElementById('vendor_stall_name').value;
    const vendorName = document.getElementById('vendor_name').value;
    const stallNumber = document.getElementById('vendor_stall_number').value;

    const username = stallName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    document.getElementById('generated_username').value = username;

    let lastName = vendorName.includes(',') ? vendorName.split(',')[0].trim() : vendorName.split(' ').pop();
    const password = (lastName + stallNumber).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    document.getElementById('generated_password').value = password;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchVendors();

    const btnAddVendor = document.getElementById('btnAddVendor');
    if (btnAddVendor) {
        btnAddVendor.onclick = async () => {
            currentStep = 1;
            updateStepperUI();
            document.getElementById('modalTitle').textContent = "Add New Vendor";
            document.getElementById('vendor_id').value = "";
            document.getElementById('vendorForm').reset();
            document.getElementById('vendorModal').classList.remove('hidden');
            document.body.classList.add('modal-active');
            await loadAreas();
        };
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (validateCurrentStep()) {
                currentStep++;
                updateStepperUI();
            }
        };
    }

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) {
        prevBtn.onclick = () => {
            currentStep--;
            updateStepperUI();
        };
    }

    const btnRevalidate = document.getElementById('btnRevalidate');
    if (btnRevalidate) {
        btnRevalidate.onclick = () => {
            showNotification("Refreshing data...");
            fetchVendors();
        };
    }

    const searchInput = document.getElementById('vendorSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vendor-list tr:not(.area-separator)').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    }

    // Modal closing handlers
    ['closeVendorModal', 'cancelVendorModal', 'closeValidityModal', 'closeDeleteModal', 'cancelDeleteBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onclick = () => {
                const modal = el.closest('.modal-overlay');
                if (modal) modal.classList.add('hidden');
                document.body.classList.remove('modal-active');
            };
        }
    });

    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = async () => {
            if (!vendorIdToDelete) return;
            try {
                const { error } = await supabase.from('vendor_details').delete().eq('vendor_id', vendorIdToDelete);
                if (error) throw error;
                showNotification("Vendor deleted successfully");
                document.getElementById('deleteConfirmModal').classList.add('hidden');
                fetchVendors();
            } catch (e) {
                showNotification(e.message, "error");
            }
        };
    }
});

const vendorForm = document.getElementById('vendorForm');
if (vendorForm) {
    vendorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(vendorForm);
        const vId = document.getElementById('vendor_id').value;

        const vendorData = {
            vendor_name: formData.get('vendor_name'),
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

        const validityData = {
            'business_id_no.': formData.get('business_id_no'),
            business_tin: formData.get('business_tin'),
            business_permit_no: formData.get('business_permit_no'),
            date_issued: formData.get('date_issued'),
            valid_until: formData.get('valid_until')
        };

        try {
            if (vId) {
                await supabase.from('vendor_details').update(vendorData).eq('vendor_id', vId);
                await supabase.from('vendor_validity').upsert({ vendor_id: vId, ...validityData });
                showNotification("Vendor updated successfully!");
            } else {
                const { data: newVendor, error: vError } = await supabase.from('vendor_details').insert([vendorData]).select();
                if (vError) throw vError;
                const newId = newVendor[0].vendor_id;
                await supabase.from('vendor_validity').insert([{ vendor_id: newId, ...validityData }]);
                await supabase.from('login_details_vendors').insert([{
                    vendor_id: newId,
                    vendor_username: document.getElementById('generated_username').value,
                    vendor_confirmedpassword: document.getElementById('generated_password').value
                }]);
                showNotification("Vendor registered successfully!");
            }
            document.getElementById('vendorModal').classList.add('hidden');
            document.body.classList.remove('modal-active');
            fetchVendors();
        } catch (error) {
            console.error("Operation failed:", error);
            showNotification(error.message, "error");
        }
    });
}

// --- HELPERS ---
async function loadAreas() {
    const { data } = await supabase.from('collection_fees').select('area');
    const uniqueAreas = [...new Set((data || []).map(item => item.area))];
    const select = document.getElementById('vendor_stall_area');
    if (!select) return;
    select.innerHTML = '<option value="">Select Area</option>' + uniqueAreas.map(a => `<option value="${a}">${a.toUpperCase()}</option>`).join('');
}

async function loadProducts(area) {
    const select = document.getElementById('product_services');
    if (!select) return;
    if (!area) { select.disabled = true; return; }
    const { data } = await supabase.from('collection_fees').select('product_services').eq('area', area);
    select.innerHTML = '<option value="">Select Service</option>' + data.map(i => `<option value="${i.product_services}">${i.product_services.toUpperCase()}</option>`).join('');
    select.disabled = false;
}

document.getElementById('vendor_stall_area').onchange = (e) => loadProducts(e.target.value);

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}
