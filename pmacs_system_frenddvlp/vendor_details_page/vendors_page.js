// BACKEND API CONNECTION
// This connects to the backend server that merges:
// - Supabase: Vendor personal info (names, stall types)
// - Firebase: Tax collection and attendance for graphs

const API_BASE_URL = 'http://localhost:3000/api';

// Fetch vendors from combined backend endpoint (Supabase + Firebase)
async function fetchVendors() {
    try {
        // Try combined endpoint first (merges Supabase + Firebase)
        const response = await fetch(`${API_BASE_URL}/vendors/combined`);
        if (response.ok) {
            const result = await response.json();
            if (result.data) {
                renderVendorsFromBackend(result.data);
                console.log('✅ Vendors loaded from combined endpoint (Supabase + Firebase)');
                return;
            }
        }
        
        // Fallback: get vendors from Supabase only
        const vendorsRes = await fetch(`${API_BASE_URL}/vendors`);
        const vendorsResult = await vendorsRes.json();
        
        // Get attendance from Firebase
        let attendanceData = {};
        try {
            const attendanceRes = await fetch(`${API_BASE_URL}/attendance`);
            const attendanceResult = await attendanceRes.json();
            if (attendanceResult.data) {
                attendanceResult.data.forEach(v => {
                    attendanceData[v.name] = v;
                });
            }
        } catch (e) {
            console.log('⚠️ Could not fetch attendance from Firebase');
        }
        
        // Merge vendors with attendance data
        const mergedVendors = (vendorsResult.data || []).map(v => ({
            ...v,
            isPresent: attendanceData[v.name]?.isPresent || false,
            hasPaid: attendanceData[v.name]?.hasPaid || false,
            taxAmount: attendanceData[v.name]?.taxAmount || getTaxAmount(v.stall_type)
        }));
        
        renderVendorsFromBackend(mergedVendors);
        console.log('✅ Vendors loaded from Supabase with fallback attendance');
        
    } catch (e) {
        console.error('❌ Failed to fetch vendors:', e.message);
        fallbackSupabase();
    }
}

// Fallback to direct Supabase connection
function fallbackSupabase() {
    const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
    const supabaseKey = 'sb_publishable_PxrnBI8FOtKXlLVE4bbq5Q_5htw8yeP';
    
    try {
        window.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log('⚠️ Using fallback direct Supabase connection');
        loadVendorsDirect();
    } catch (e) {
        console.error('❌ Failed to create Supabase client:', e.message);
    }
}

// Load vendors directly from Supabase (fallback)
async function loadVendorsDirect() {
    const { data, error } = await window.supabase.from('vendors').select('*');
    if (error) {
        console.error('Error loading vendors:', error);
        return;
    }
    renderVendorsFromBackend(data);
}

// Get tax amount based on stall type
function getTaxAmount(stallType) {
    const taxRates = {
        'Meat': 'P35',
        'Vegetables': 'P25',
        'Fish': 'P25',
        'Dry Goods': 'P15'
    };
    return taxRates[stallType] || 'P0';
}

// Render vendors from backend data
function renderVendorsFromBackend(vendors) {
    const tableBody = document.getElementById('vendor-list');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!vendors || vendors.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <p>No vendors found.</p>
                    <p>Click "SEARCH" to refresh or add vendors manually.</p>
                </td>
            </tr>
        `;
        return;
    }

    vendors.forEach(vendor => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${vendor.name || ''}</strong></td>
            <td><strong>${vendor.stall_type || ''}</strong></td>
            <td class="attendance-cell">
                <input type="checkbox" 
                       class="custom-checkbox" 
                       data-name="${vendor.name}" 
                       data-field="isPresent" 
                       ${vendor.isPresent ? 'checked' : ''}
                       onchange="updateAttendance('${vendor.name}', 'isPresent', this.checked)">
            </td>
            <td>
                <div class="tax-cell">
                    <div class="tax-pill">${vendor.taxAmount || vendor.tax_amount || 'P0'}</div>
                    <input type="checkbox" 
                           class="custom-checkbox" 
                           data-name="${vendor.name}" 
                           data-field="hasPaid" 
                           ${vendor.hasPaid ? 'checked' : ''}
                           onchange="updateAttendance('${vendor.name}', 'hasPaid', this.checked)">
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });

    attachCheckboxListeners();
}

// Update attendance in Firebase via backend
async function updateAttendance(name, field, value) {
    try {
        // Get current vendor data
        const response = await fetch(`${API_BASE_URL}/vendors/combined`);
        const result = await response.json();
        const vendor = (result.data || []).find(v => v.name === name);
        
        const updateData = {
            isPresent: field === 'isPresent' ? value : (vendor?.isPresent || false),
            hasPaid: field === 'hasPaid' ? value : (vendor?.hasPaid || false)
        };
        
        // Update in Firebase via backend
        await fetch(`${API_BASE_URL}/vendors/${name}/attendance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        console.log(`✅ Attendance updated: ${name}.${field} = ${value}`);
    } catch (e) {
        console.error('❌ Failed to update attendance:', e.message);
    }
}

// Attach checkbox event listeners
function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.custom-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', async function() {
            const name = this.dataset.name;
            const field = this.dataset.field;
            const value = this.checked;
            
            if (name) {
                await updateAttendance(name, field, value);
            }
        });
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Backend API initialized');
    console.log('📊 Connecting Supabase (personal info) + Firebase (attendance)');
    fetchVendors();
});
