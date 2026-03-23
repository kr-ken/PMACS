import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(supabaseUrl, supabaseKey);

let allVendors = [];
let allValidities = [];
let currentStep = 1;
const totalSteps = 3;
let isEditMode = false;
let vendorIdToDelete = null;

// ── Utils ──
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

// ── Fetch ──
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

// ── Render (ORIGINAL — unchanged) ──
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
                const threeMonths = new Date();
                threeMonths.setMonth(threeMonths.getMonth() + 3);
                let statusClass, statusText, statusIcon;
                if (expiryDate < today) {
                    statusClass = 'expired'; statusText = 'EXPIRED'; statusIcon = 'fa-circle-xmark';
                } else if (expiryDate <= threeMonths) {
                    statusClass = 'expiring'; statusText = 'EXPIRING'; statusIcon = 'fa-triangle-exclamation';
                } else {
                    statusClass = 'valid'; statusText = 'VALID'; statusIcon = 'fa-circle-check';
                }
                validityHTML = `
                    <div class="validity-info-badge ${statusClass}" onclick="window.viewValidityDetails('${vendor.vendor_id}')" style="cursor:pointer;" title="Expires: ${validity.valid_until}">
                        <i class="fa-solid ${statusIcon}"></i> ${statusText}
                    </div>`;
            }

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${vendor.vendor_name.toUpperCase()}</strong></td>
                <td class="center-col"><div class="info-badge" onclick="window.viewVendorDetails('${vendor.vendor_id}')" style="cursor:pointer;">INFO</div></td>
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

// ── View Modals (ORIGINAL) ──
window.viewVendorDetails = (vendorId) => {
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    if (!vendor) return;
    const age = calculateAge(vendor.vendor_birthdate);
    document.getElementById('validityModalTitle').textContent = "Vendor Profile Details";
    document.getElementById('validityDetails').innerHTML = `
        <div style="background:linear-gradient(135deg,#f0f7ff,#e8f4fd);padding:20px 24px;border-radius:14px;margin-bottom:24px;border-left:5px solid #2971b9;display:flex;align-items:center;gap:16px;">
            <div style="width:52px;height:52px;background:#2971b9;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-user" style="color:white;font-size:20px;"></i>
            </div>
            <div style="flex:1;">
                <p style="font-size:18px;font-weight:800;color:#1a3a5c;margin:0;">${vendor.vendor_name.toUpperCase()}</p>
                <p style="color:#64748b;font-size:13px;margin-top:3px;">${vendor.vendor_stall_name || ''} • ${vendor.vendor_stall_area || ''}</p>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="background:#2971b9;color:white;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-id-card"></i> ID: ${vendor.vendor_id}
                </div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Birthdate</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor.vendor_birthdate || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;border-left:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Age</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${age} years old</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Gender</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor.vendor_gender || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;border-left:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Contact</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor.vendor_number || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Email</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor.vendor_email || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;border-left:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Stand-in</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor['vendor_stand-in'] || 'None'}</div>
            </div>
            <div style="padding:14px 16px;grid-column:1/-1;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Address</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${vendor.vendor_address || 'N/A'}</div>
            </div>
        </div>`;
    document.getElementById('validityModal').classList.remove('hidden');
};

window.viewValidityDetails = (vendorId) => {
    const validity = allValidities.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(vendorId).trim());
    if (!validity) return;

    const expiryDate = new Date(validity.valid_until);
    const now = new Date();
    const threeMonths = new Date(); threeMonths.setMonth(threeMonths.getMonth() + 3);
    const isExpired = expiryDate < now;
    const isExpiring = !isExpired && expiryDate <= threeMonths;
    const statusColor = isExpired ? '#e74c3c' : isExpiring ? '#f39c12' : '#27ae60';
    const statusText = isExpired ? 'EXPIRED' : isExpiring ? 'EXPIRING SOON' : 'VALID';
    const statusIcon = isExpired ? 'fa-circle-xmark' : isExpiring ? 'fa-triangle-exclamation' : 'fa-circle-check';
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const daysLabel = isExpired ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days remaining`;

    document.getElementById('validityModalTitle').textContent = "Business Permit Details";
    document.getElementById('validityDetails').innerHTML = `
        <div style="background:linear-gradient(135deg,#fff8f0,#fff3e8);padding:20px 24px;border-radius:14px;margin-bottom:24px;border-left:5px solid ${statusColor};display:flex;align-items:center;gap:16px;">
            <div style="width:52px;height:52px;background:${statusColor};border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-receipt" style="color:white;font-size:20px;"></i>
            </div>
            <div style="flex:1;">
                <p style="font-size:18px;font-weight:800;color:#1a3a5c;margin:0;">${vendor ? vendor.vendor_name.toUpperCase() : 'PERMIT INFO'}</p>
                <p style="color:#64748b;font-size:13px;margin-top:3px;">${vendor ? vendor.vendor_stall_name + ' (#' + vendor.vendor_stall_number + ')' : ''}</p>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="background:${statusColor};color:white;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fa-solid ${statusIcon}"></i> ${statusText}
                </div>
                <div style="font-size:12px;color:#95a5a6;margin-top:5px;">${daysLabel}</div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Business ID No.</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${validity['business_id_no'] || validity['business_id_no.'] || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;border-left:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Business TIN</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${validity.business_tin || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Permit No.</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${validity.business_permit_no || 'N/A'}</div>
            </div>
            <div style="padding:14px 16px;border-bottom:1px solid #f0f2f5;border-left:1px solid #f0f2f5;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Date Issued</div>
                <div style="font-size:14px;font-weight:600;color:#2c3e50;">${validity.date_issued}</div>
            </div>
            <div style="padding:14px 16px;grid-column:1/-1;">
                <div style="font-size:11px;font-weight:700;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Valid Until</div>
                <div style="font-size:18px;font-weight:800;color:${statusColor};">${validity.valid_until}</div>
            </div>
        </div>`;
    document.getElementById('validityModal').classList.remove('hidden');
};

// ── Refresh ──
window.refreshVendorData = () => {
    showNotification("Refreshing data...");
    fetchVendors();
};

// ── Revalidate — 2-phase ──
window.revalidateVendorPermits = () => {
    document.getElementById('revalidate-phase1').style.display = 'block';
    document.getElementById('revalidate-phase2').style.display = 'none';
    document.getElementById('revalidate-vendor-id').value = '';
    document.getElementById('revalidate-error').textContent = '';
    document.getElementById('revalidateModal').classList.remove('hidden');
};

window.searchVendorForRevalidate = async () => {
    const vid = document.getElementById('revalidate-vendor-id').value.trim();
    const errEl = document.getElementById('revalidate-error');
    if (!vid) { errEl.textContent = 'Please enter a Vendor ID.'; return; }
    const vendor = allVendors.find(v => String(v.vendor_id) === String(vid));
    if (!vendor) { errEl.textContent = `No vendor found with ID: ${vid}`; return; }
    errEl.textContent = '';
    document.getElementById('revalidate-vendor-name').textContent = vendor.vendor_name;
    document.getElementById('revalidate-vendor-area').textContent = `${vendor.vendor_stall_area} • ${vendor.product_services}`;
    const validity = allValidities.find(v => String(v.vendor_id) === String(vid));
    document.getElementById('revalidate-current-expiry').textContent = validity ? validity.valid_until : 'No record';
    document.getElementById('revalidate-vid-hidden').value = vid;
    document.getElementById('revalidate-business-id').value = validity?.business_id_no || validity?.['business_id_no.'] || '';
    document.getElementById('revalidate-tin').value = validity?.business_tin || '';
    document.getElementById('revalidate-permit-no').value = validity?.business_permit_no || '';
    document.getElementById('revalidate-date-issued').value = '';
    document.getElementById('revalidate-valid-until').value = '';
    document.getElementById('revalidate-phase1').style.display = 'none';
    document.getElementById('revalidate-phase2').style.display = 'block';
};

window.submitRevalidation = async () => {
    const vid = document.getElementById('revalidate-vid-hidden').value;
    const dateIssued = document.getElementById('revalidate-date-issued').value;
    const validUntil = document.getElementById('revalidate-valid-until').value;
    if (!dateIssued || !validUntil) { showNotification('Please fill in the new permit dates.', 'error'); return; }
    try {
        const isValid = new Date(validUntil) >= new Date();
        const validityData = {
            vendor_id: parseInt(vid),
            'business_id_no.': document.getElementById('revalidate-business-id').value,
            business_tin: document.getElementById('revalidate-tin').value,
            business_permit_no: document.getElementById('revalidate-permit-no').value,
            date_issued: dateIssued,
            valid_until: validUntil
        };
        const existing = allValidities.find(v => String(v.vendor_id) === String(vid));
        if (existing) {
            await supabase.from('vendor_validity').update(validityData).eq('vendor_id', vid);
        } else {
            await supabase.from('vendor_validity').insert([validityData]);
        }
        await supabase.from('vendor_details').update({ vendor_validity: isValid }).eq('vendor_id', vid);
        showNotification(`Permit renewed! Status: ${isValid ? 'VALID' : 'EXPIRED'}`, isValid ? 'success' : 'error');
        document.getElementById('revalidateModal').classList.add('hidden');
        fetchVendors();
    } catch (e) {
        showNotification('Revalidation failed: ' + e.message, 'error');
    }
};

// ── Edit Vendor (ORIGINAL + validity load) ──
window.editVendor = async (id) => {
    const vendor = allVendors.find(v => String(v.vendor_id).trim() === String(id).trim());
    if (!vendor) return;
    isEditMode = true;
    resetValidationStyles();
    currentStep = 1;
    updateStepperUI();
    document.getElementById('modalTitle').textContent = "Update Vendor Details";
    document.getElementById('vendor_id').value = id;
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
        document.getElementById('business_id_no').value = validity['business_id_no.'] || validity['business_id_no'] || "";
        document.getElementById('business_tin').value = validity.business_tin || "";
        document.getElementById('business_permit_no').value = validity.business_permit_no || "";
        document.getElementById('date_issued').value = validity.date_issued || "";
        document.getElementById('valid_until').value = validity.valid_until || "";
    }
    document.getElementById('vendorModal').classList.remove('hidden');
    document.body.classList.add('modal-active');
};

// ── Delete Vendor — with large name ──
window.deleteVendor = (id, name) => {
    vendorIdToDelete = id;
    const parts = name.split(',').map(p => p.trim());
    const lastName = parts[0] || name;
    const firstName = parts[1] || '';
    const nameEl = document.getElementById('deleteVendorName');
    if (nameEl) {
        nameEl.innerHTML = firstName
            ? `<span style="display:block;font-size:22px;font-weight:800;color:#e74c3c;letter-spacing:1px;">${firstName.toUpperCase()}</span>
               <span style="display:block;font-size:22px;font-weight:800;color:#e74c3c;letter-spacing:1px;">${lastName.toUpperCase()}</span>`
            : `<span style="display:block;font-size:22px;font-weight:800;color:#e74c3c;letter-spacing:1px;">${lastName.toUpperCase()}</span>`;
    }
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
};

// ── Form Submit ──
async function submitVendorForm() {
    const id        = document.getElementById('vendor_id').value;
    const today     = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const submitBtn = document.getElementById('submitBtn');
    const errBox    = document.getElementById('form-submit-error');

    // Clear previous error
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

    function showFormError(msg) {
        if (errBox) { errBox.textContent = '⚠ ' + msg; errBox.style.display = 'block'; }
        showNotification(msg, 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Finish & Register'; }
    }

    // ── vendor_details payload ──
    const vendorData = {
        vendor_name:           document.getElementById('vendor_name').value.trim(),
        vendor_gender:         document.getElementById('vendor_gender').value,
        vendor_birthdate:      document.getElementById('vendor_birthdate').value,
        vendor_address:        document.getElementById('vendor_address').value.trim(),
        vendor_number:         document.getElementById('vendor_number').value.trim(),
        vendor_email:          document.getElementById('vendor_email').value.trim() || null,
        vendor_stall_name:     document.getElementById('vendor_stall_name').value.trim(),
        vendor_stall_number:   parseInt(document.getElementById('vendor_stall_number').value) || 0,
        vendor_stall_area:     document.getElementById('vendor_stall_area').value,
        product_services:      document.getElementById('product_services').value,
        vendor_status:         true,
        vendor_validity:       false,
        // Postgres "timestamp without time zone" — use local ISO without timezone offset
        created_at: new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0],
        // NOTE: 'vendor_stand - in' omitted — PostgREST cannot handle column names with spaces.
        // Update it separately via raw SQL if needed.
    };

    // Validate required fields before hitting Supabase
    const requiredFields = ['vendor_name','vendor_gender','vendor_birthdate','vendor_address',
                            'vendor_number','vendor_stall_name','vendor_stall_number',
                            'vendor_stall_area','product_services'];
    for (const f of requiredFields) {
        if (!vendorData[f] && vendorData[f] !== 0) {
            return showFormError(`Missing required field: ${f.replace(/_/g,' ')}`);
        }
    }

    // ── vendor_validity payload ──
    const validUntilVal = document.getElementById('valid_until').value;
    const validityData  = {
        'business_id_no.': document.getElementById('business_id_no').value.trim(),
        business_tin:       document.getElementById('business_tin').value.trim(),
        business_permit_no: document.getElementById('business_permit_no').value.trim(),
        date_issued:        document.getElementById('date_issued').value,
        valid_until:        validUntilVal,
    };
    vendorData.vendor_validity = !!(validUntilVal && new Date(validUntilVal) >= new Date());

    const username = document.getElementById('generated_username').value.trim();
    const password = document.getElementById('generated_password').value.trim();

    console.log('[Register] vendorData:', vendorData);
    console.log('[Register] validityData:', validityData);
    console.log('[Register] credentials:', { username, password });

    try {
        if (isEditMode && id) {
            const { error: vErr } = await supabase
                .from('vendor_details').update(vendorData).eq('vendor_id', id);
            if (vErr) throw new Error(`vendor_details: ${vErr.message}`);

            const existing = allValidities.find(v => String(v.vendor_id) === String(id));
            if (existing) {
                const { error: pErr } = await supabase
                    .from('vendor_validity').update({ ...validityData, vendor_id: parseInt(id) }).eq('vendor_id', id);
                if (pErr) throw new Error(`vendor_validity: ${pErr.message}`);
            } else {
                const { error: pErr } = await supabase
                    .from('vendor_validity').insert([{ ...validityData, vendor_id: parseInt(id) }]);
                if (pErr) throw new Error(`vendor_validity: ${pErr.message}`);
            }
            showNotification('Vendor updated successfully!');

        } else {
            // Step 1: vendor_details
            const { data: newVendor, error: vErr } = await supabase
                .from('vendor_details').insert([vendorData]).select('vendor_id').single();
            if (vErr) throw new Error(`vendor_details: ${vErr.message}`);
            const newId = newVendor.vendor_id;
            console.log('[Register] vendor_id created:', newId);

            // Step 2: vendor_validity
            const { error: pErr } = await supabase
                .from('vendor_validity').insert([{ ...validityData, vendor_id: newId }]);
            if (pErr) {
                // Rollback: delete the vendor we just created
                await supabase.from('vendor_details').delete().eq('vendor_id', newId);
                throw new Error(`vendor_validity: ${pErr.message}`);
            }

            // Step 3: login_details_vendors
            if (!username || !password) throw new Error('Credentials not generated — go back to Step 3.');
            const { error: lErr } = await supabase
                .from('login_details_vendors').insert([{
                    vendor_id:                newId,
                    vendor_username:          username,
                    vendor_confirmedpassword: password,
                }]);
            if (lErr) {
                // Rollback both
                await supabase.from('vendor_validity').delete().eq('vendor_id', newId);
                await supabase.from('vendor_details').delete().eq('vendor_id', newId);
                throw new Error(`login_details: ${lErr.message}`);
            }

            // Step 4: seed tax_dscrpt_summary (tax_recorded = null = not yet paid)
            // Get collection_fee_id by looking up area + product_services
            const { data: feeRow } = await supabase
                .from('collection_fees')
                .select('collection_fee_id, amount_range, "quantified ?"')
                .eq('area', vendorData.vendor_stall_area)
                .eq('product_services', vendorData.product_services)
                .maybeSingle();

            const officialsId   = parseInt(sessionStorage.getItem('pmacs_id')) || 0;
            const officialsName = sessionStorage.getItem('pmacs_name') || 'Admin';

            if (feeRow && officialsId) {
                const { error: tErr } = await supabase
                    .from('tax_dscrpt_summary')
                    .insert([{
                        vendor_id:           newId,
                        vendor_name:         vendorData.vendor_name,
                        vendor_stall_name:   vendorData.vendor_stall_name,
                        vendor_stall_number: vendorData.vendor_stall_number,
                        area:                vendorData.vendor_stall_area,
                        officials_id:        officialsId,
                        officials_name:      officialsName,
                        collection_fee_id:   feeRow.collection_fee_id,
                        product_services:    vendorData.product_services,
                        amount_range:        feeRow.amount_range,
                        'quantified ?':      feeRow['quantified ?'] ?? false,
                        tax_recorded:        null,   // not yet paid
                        collection_date:     today,  // today's date
                    }]);
                if (tErr) console.warn('tax_dscrpt_summary seed skipped:', tErr.message);
                else console.log('[Register] tax_dscrpt_summary seeded for vendor', newId);
            } else {
                console.warn('[Register] tax_dscrpt_summary skipped — no fee row found or no officials_id');
            }

            showNotification(`✓ Registered! Username: ${username} | ID: ${newId}`);
        }

        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Finish & Register'; }
        document.getElementById('vendorModal').classList.add('hidden');
        document.body.classList.remove('modal-active');
        fetchVendors();

    } catch (e) {
        console.error('[submitVendorForm]', e.message);
        showFormError(e.message);
    }
}

function generateCredentials() {
    // Name format: "First Name Middle Name Last Name"
    // Last word = last name
    const name      = document.getElementById('vendor_name')?.value?.trim() || '';
    const words     = name.split(/\s+/).filter(Boolean);
    const lastName  = (words[words.length - 1] || 'vendor').toLowerCase();

    // Username = stall name with all non-alphanumeric removed, lowercase
    const stallName = document.getElementById('vendor_stall_name')?.value?.trim() || '';
    const username  = stallName.toLowerCase().replace(/[^a-z0-9]/g, '') || lastName;

    // Password = lastname + stall number
    const stallNumber = document.getElementById('vendor_stall_number')?.value?.trim() || '0';
    const password    = `${lastName}${stallNumber}`;

    const userEl = document.getElementById('generated_username');
    const passEl = document.getElementById('generated_password');
    if (userEl) userEl.value = username;
    if (passEl) passEl.value = password;
}

function validateStep(step) {
    let valid = true;
    document.querySelectorAll(`#step${step} [required]`).forEach(f => {
        if (!f.value.trim()) { f.style.borderColor = '#e74c3c'; valid = false; }
        else f.style.borderColor = '';
    });
    if (!valid) showNotification('Please fill in all required fields.', 'error');
    return valid;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    fetchVendors();

    const dateEl = document.getElementById("currentDate");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }).toUpperCase();

    // Add Vendor button
    document.getElementById('btnAddVendor').onclick = () => {
        isEditMode = false;
        currentStep = 1;
        document.getElementById('modalTitle').textContent = 'Add New Vendor';
        document.getElementById('vendorForm').reset();
        document.getElementById('vendor_id').value = '';
        const ps = document.getElementById('product_services');
        if (ps) ps.disabled = true;
        loadAreas();
        updateStepperUI();
        resetValidationStyles();
        document.getElementById('vendorModal').classList.remove('hidden');
        document.body.classList.add('modal-active');
    };

    // Close modals
    document.getElementById('closeVendorModal').onclick = () => {
        document.getElementById('vendorModal').classList.add('hidden');
        document.body.classList.remove('modal-active');
        resetValidationStyles();
    };
    document.getElementById('closeValidityModal').onclick = () => document.getElementById('validityModal').classList.add('hidden');
    document.getElementById('closeDeleteModal').onclick = () => document.getElementById('deleteConfirmModal').classList.add('hidden');
    document.getElementById('cancelDeleteBtn').onclick  = () => document.getElementById('deleteConfirmModal').classList.add('hidden');

    // Close revalidate modal
    const closeReval = document.getElementById('closeRevalidateModal');
    if (closeReval) closeReval.onclick = () => document.getElementById('revalidateModal').classList.add('hidden');

    // Confirm delete
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        if (!vendorIdToDelete) return;
        const { error } = await supabase.from('vendor_details').delete().eq('vendor_id', vendorIdToDelete);
        if (!error) {
            showNotification("Vendor deleted successfully");
            document.getElementById('deleteConfirmModal').classList.add('hidden');
            fetchVendors();
        } else showNotification(error.message, "error");
    };

    // Stepper
    document.getElementById('nextBtn').onclick = () => {
        if (!validateStep(currentStep)) return;
        if (currentStep === totalSteps - 1) generateCredentials();
        currentStep++;
        updateStepperUI();
    };
    document.getElementById('prevBtn').onclick = () => { currentStep--; updateStepperUI(); };

    // Form submit
    document.getElementById('vendorForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitVendorForm();
    });

    // Area change
    const areaSelect = document.getElementById('vendor_stall_area');
    if (areaSelect) areaSelect.onchange = (e) => loadProducts(e.target.value);

    // Search
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
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    if (prevBtn) prevBtn.classList.toggle('hidden', currentStep === 1);
    if (nextBtn) nextBtn.classList.toggle('hidden', currentStep === totalSteps);
    if (submitBtn) submitBtn.classList.toggle('hidden', currentStep !== totalSteps);
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
    setTimeout(() => n.remove(), 3500);
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
    select.innerHTML = '<option value="">Select Service</option>' + (data || []).map(i => `<option value="${i.product_services}">${i.product_services.toUpperCase()}</option>`).join('');
    select.disabled = false;
}