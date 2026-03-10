import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- SUPABASE INITIALIZATION ---
// Replace these with your actual Supabase Project URL and Anon Key
const SUPABASE_URL = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL STATE ---
let collectionFees = [];
let currentEditingId = null;
let taxToDeleteId = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTaxes();

    // Attach form submit event listener
    const form = document.getElementById('taxForm');
    if (form) {
        form.addEventListener('submit', handleTaxSubmit);
    }
});

// --- API OPERATIONS ---

// Fetch taxes from Supabase
async function fetchTaxes() {
    try {
        const { data, error } = await supabase
            .from('collection_fees')
            .select('*')
            .order('area', { ascending: true });

        if (error) throw error;

        collectionFees = data || [];
        renderTaxes();
    } catch (error) {
        console.error("Error fetching taxes:", error);
        showNotification("Failed to load taxes.", "error");
    }
}

// Handle form submission (Create / Update)
async function handleTaxSubmit(e) {
    e.preventDefault();

    const area = document.getElementById('area').value;
    const productServices = document.getElementById('productServices').value;
    const isQuantified = document.getElementById('quantified').checked;
    const rangeType = document.querySelector('input[name="rangeType"]:checked').value;

    let amountRange = '';

    // Format amount_range string based on selection
    if (rangeType === 'fixed') {
        const amount = document.getElementById('amount').value;
        amountRange = amount.toString();
    } else {
        const min = document.getElementById('rangeMin').value;
        const max = document.getElementById('rangeMax').value;
        amountRange = `${min} - ${max}`;
    }

    // Payload matching your Supabase table schema
    const payload = {
        area: area,
        product_services: productServices,
        amount_range: amountRange,
        'quantified?': isQuantified
    };

    try {
        if (currentEditingId) {
            // Update existing record
            const { error } = await supabase
                .from('collection_fees')
                .update(payload)
                .eq('collection_fee_id', currentEditingId);

            if (error) throw error;
            showNotification("Tax updated successfully.");
        } else {
            // Insert new record
            const { error } = await supabase
                .from('collection_fees')
                .insert([payload]);

            if (error) throw error;
            showNotification("New tax added successfully.");
        }

        closeAddTaxModal();
        fetchTaxes(); // Refresh list
    } catch (error) {
        console.error("Error saving tax:", error);
        showNotification("Failed to save tax.", "error");
    }
}

// Delete tax from Supabase
window.confirmDelete = async function() {
    if (!taxToDeleteId) return;

    try {
        const { error } = await supabase
            .from('collection_fees')
            .delete()
            .eq('collection_fee_id', taxToDeleteId);

        if (error) throw error;

        showNotification("Tax deleted successfully.");
        closeDeleteConfirm();
        fetchTaxes(); // Refresh list
    } catch (error) {
        console.error("Error deleting tax:", error);
        showNotification("Failed to delete tax.", "error");
    }
};


// --- DOM MANIPULATION & RENDERING ---

// Render taxes to the DOM, grouped by area
function renderTaxes() {
    const container = document.getElementById('taxListContainer');
    container.innerHTML = ''; // Clear current list

    if (collectionFees.length === 0) {
        container.innerHTML = '<div class="empty-state">No taxes configured yet.</div>';
        return;
    }

    // Group the data by "area"
    const groupedFees = collectionFees.reduce((acc, fee) => {
        if (!acc[fee.area]) acc[fee.area] = [];
        acc[fee.area].push(fee);
        return acc;
    }, {});

    // Create DOM elements for each group
    for (const [area, fees] of Object.entries(groupedFees)) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tax-group'; // Add this to your CSS if needed
        groupDiv.style.marginBottom = '20px';

        // Group Header
        groupDiv.innerHTML = `<h3 style="border-bottom: 2px solid #eee; padding-bottom: 8px;">${area}</h3>`;

        const list = document.createElement('div');
        list.className = 'tax-items-list';

        // Items inside the group
        fees.forEach(fee => {
            const item = document.createElement('div');
            item.className = 'tax-item';
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f0f0f0;';

            item.innerHTML = `
                <div class="tax-info">
                    <strong>${fee.product_services}</strong>
                    <div style="color: #666; font-size: 0.9em;">
                        Amount: <span>${fee.amount_range}</span>
                        | Type: <span>${fee['quantified?'] ? 'Quantified' : 'Standard'}</span>
                    </div>
                </div>
                <div class="tax-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editTax(${fee.collection_fee_id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="promptDelete(${fee.collection_fee_id})">Delete</button>
                </div>
            `;
            list.appendChild(item);
        });

        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    }
}

// Notifications
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    // Inline styles as fallback in case CSS isn't present
    notif.style.cssText = `padding: 10px 15px; margin-bottom: 10px; border-radius: 4px; color: white; background-color: ${type === 'success' ? '#28a745' : '#dc3545'};`;
    notif.textContent = message;

    container.appendChild(notif);

    // Remove notification after 3 seconds
    setTimeout(() => {
        notif.remove();
    }, 3000);
}


// --- MODAL CONTROLS (Attached to window for inline HTML calls) ---

window.openAddTaxModal = function() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Add New Tax';
    document.getElementById('taxForm').reset();
    updateRangeFields(); // Ensure layout resets
    document.getElementById('addTaxModal').classList.remove('hidden');
};

window.closeAddTaxModal = function() {
    document.getElementById('addTaxModal').classList.add('hidden');
    currentEditingId = null;
};

window.editTax = function(id) {
    const tax = collectionFees.find(t => t.collection_fee_id === id);
    if (!tax) return;

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Tax';

    // Populate standard fields
    document.getElementById('area').value = tax.area;
    document.getElementById('productServices').value = tax.product_services;
    document.getElementById('quantified').checked = tax['quantified?'];

    // Handle Amount vs Range logic based on formatting string
    if (tax.amount_range.includes('-')) {
        document.querySelector('input[name="rangeType"][value="range"]').checked = true;
        const [min, max] = tax.amount_range.split('-').map(s => s.trim());
        document.getElementById('rangeMin').value = min;
        document.getElementById('rangeMax').value = max;
    } else {
        document.querySelector('input[name="rangeType"][value="fixed"]').checked = true;
        document.getElementById('amount').value = tax.amount_range;
    }

    window.updateRangeFields();
    document.getElementById('addTaxModal').classList.remove('hidden');
};

window.promptDelete = function(id) {
    taxToDeleteId = id;
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
};

window.closeDeleteConfirm = function() {
    taxToDeleteId = null;
    document.getElementById('deleteConfirmModal').classList.add('hidden');
};

window.updateRangeFields = function() {
    const rangeType = document.querySelector('input[name="rangeType"]:checked').value;
    const rangeFields = document.getElementById('rangeFields');
    const amountInput = document.getElementById('amount');
    const amountGroup = amountInput.closest('.form-group');

    if (rangeType === 'range') {
        rangeFields.classList.remove('hidden');
        amountGroup.classList.add('hidden');

        // Toggle required attributes
        amountInput.required = false;
        document.getElementById('rangeMin').required = true;
        document.getElementById('rangeMax').required = true;
    } else {
        rangeFields.classList.add('hidden');
        amountGroup.classList.remove('hidden');

        // Toggle required attributes
        amountInput.required = true;
        document.getElementById('rangeMin').required = false;
        document.getElementById('rangeMax').required = false;
    }
};
