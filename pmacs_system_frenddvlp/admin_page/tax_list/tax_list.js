import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';


// --- SUPABASE INITIALIZATION ---
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


async function handleTaxSubmit(e) {
    e.preventDefault();


    const area = document.getElementById('area').value;
    const productServices = document.getElementById('productServices').value;
    const isQuantified = document.getElementById('quantified').checked;
    const rangeType = document.querySelector('input[name="rangeType"]:checked').value;


    let amountRange = '';


    if (rangeType === 'fixed') {
        const amount = document.getElementById('amount').value;
        amountRange = amount.toString();
    } else {
        const min = document.getElementById('rangeMin').value;
        const max = document.getElementById('rangeMax').value;
        amountRange = `${min} - ${max}`;
    }


    const payload = {
        area: area,
        product_services: productServices,
        amount_range: amountRange,
        'quantified?': isQuantified
    };


    try {
        if (currentEditingId) {
            const { error } = await supabase
                .from('collection_fees')
                .update(payload)
                .eq('collection_fee_id', currentEditingId);


            if (error) throw error;
            showNotification("Tax updated successfully.");
        } else {
            const { error } = await supabase
                .from('collection_fees')
                .insert([payload]);


            if (error) throw error;
            showNotification("New tax added successfully.");
        }


        closeAddTaxModal();
        fetchTaxes();
    } catch (error) {
        console.error("Error saving tax:", error);
        showNotification("Failed to save tax.", "error");
    }
}


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
        fetchTaxes();
    } catch (error) {
        console.error("Error deleting tax:", error);
        showNotification("Failed to delete tax.", "error");
    }
};




// --- DOM MANIPULATION & RENDERING ---


function renderTaxes() {
    const container = document.getElementById('taxListContainer');
    if (!container) return;
    container.innerHTML = '';


    if (collectionFees.length === 0) {
        container.innerHTML = '<div class="empty-state">No taxes configured yet.</div>';
        return;
    }


    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';


    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>PRODUCT / SERVICE</th>
                <th>AMOUNT RANGE</th>
                <th>TYPE</th>
                <th style="text-align: right;">ACTIONS</th>
            </tr>
        </thead>
        <tbody id="taxTableBody"></tbody>
    `;


    const tbody = table.querySelector('#taxTableBody');


    const groupedFees = collectionFees.reduce((acc, fee) => {
        if (!acc[fee.area]) acc[fee.area] = [];
        acc[fee.area].push(fee);
        return acc;
    }, {});


    for (const [area, fees] of Object.entries(groupedFees)) {
        const headerRow = document.createElement('tr');
        headerRow.className = 'area-separator';
        headerRow.innerHTML = `<td colspan="4"><i class="fa-solid fa-location-dot"></i> ${area.toUpperCase()}</td>`;
        tbody.appendChild(headerRow);


        fees.forEach(fee => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${fee.product_services}</strong></td>
                <td><span style="font-weight: 600; color: var(--primary-color);">${fee.amount_range}</span></td>
                <td>${fee['quantified?'] ? 'Quantified' : 'Standard'}</td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="editTax(${fee.collection_fee_id})">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="promptDelete(${fee.collection_fee_id})" style="margin-left: 5px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }


    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
}


function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;


    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;


    container.appendChild(notif);


    setTimeout(() => {
        notif.remove();
    }, 3000);
}




// --- MODAL CONTROLS ---


window.openAddTaxModal = function() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Add New Tax';
    document.getElementById('taxForm').reset();
    window.updateRangeFields();
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


    document.getElementById('area').value = tax.area;
    document.getElementById('productServices').value = tax.product_services;
    document.getElementById('quantified').checked = tax['quantified?'];


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
    const amountGroup = document.getElementById('amount-group');


    if (rangeType === 'range') {
        rangeFields.classList.remove('hidden');
        amountGroup.classList.add('hidden');
        document.getElementById('amount').required = false;
        document.getElementById('rangeMin').required = true;
        document.getElementById('rangeMax').required = true;
    } else {
        rangeFields.classList.add('hidden');
        amountGroup.classList.remove('hidden');
        document.getElementById('amount').required = true;
        document.getElementById('rangeMin').required = false;
        document.getElementById('rangeMax').required = false;
    }
};
