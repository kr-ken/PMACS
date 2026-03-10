import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let collectionFees = [];
let currentEditingId = null;
let taxToDeleteId = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchTaxes();
    const form = document.getElementById('taxForm');
    if (form) form.addEventListener('submit', handleTaxSubmit);
});

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
        console.error("Error fetching:", error);
    }
}

async function handleTaxSubmit(e) {
    e.preventDefault();
    const area = document.getElementById('area').value;
    const productServices = document.getElementById('productServices').value;
    const rangeType = document.querySelector('input[name="rangeType"]:checked').value;
    const quantified = document.getElementById('quantified').checked;

    let amountRange = '';
    let currentNumericalValue = 0;

    if (rangeType === 'fixed') {
        currentNumericalValue = parseFloat(document.getElementById('amount').value);
        amountRange = currentNumericalValue.toString();
    } else {
        const min = document.getElementById('rangeMin').value;
        const max = document.getElementById('rangeMax').value;
        currentNumericalValue = parseFloat(min); // Use min for trend comparison
        amountRange = `${min} - ${max}`;
    }

    const taxData = {
        area,
        product_services: productServices,
        amount_range: amountRange,
        'quantified?': quantified
    };

    try {
        if (currentEditingId) {
            const oldTax = collectionFees.find(t => t.collection_fee_id === currentEditingId);
            const oldVal = parseFloat(oldTax.amount_range.split('-')[0]);

            const { error } = await supabase.from('collection_fees').update(taxData).eq('collection_fee_id', currentEditingId);
            if (error) throw error;

            showTrendNotification(currentNumericalValue, oldVal, productServices);
        } else {
            const { error } = await supabase.from('collection_fees').insert([taxData]);
            if (error) throw error;
            showNotification("Tax added successfully.");
        }

        closeAddTaxModal();
        fetchTaxes();
    } catch (error) {
        showNotification("Error: " + error.message, "error");
    }
}

function showTrendNotification(newVal, oldVal, name) {
    const modal = document.getElementById('updateNotificationModal');
    const icon = document.getElementById('tax-trend-indicator');
    const text = document.getElementById('tax-trend-text');
    const details = document.getElementById('tax-trend-details');

    if (newVal > oldVal) {
        icon.innerHTML = '<i class="fa-solid fa-angles-up trend-higher"></i>';
        text.textContent = "TAX HIGHER";
        text.className = "trend-higher";
    } else if (newVal < oldVal) {
        icon.innerHTML = '<i class="fa-solid fa-angles-down trend-lower"></i>';
        text.textContent = "TAX LOWER";
        text.className = "trend-lower";
    } else {
        showNotification("Tax updated (No change in amount)");
        return;
    }

    details.innerHTML = `The tax for <strong>${name}</strong> has been updated.<br>Old: ₱${oldVal} → New: ₱${newVal}`;
    modal.classList.remove('hidden');
}

window.closeUpdateNotification = () => document.getElementById('updateNotificationModal').classList.add('hidden');

window.confirmDelete = async function() {
    if (!taxToDeleteId) return;
    try {
        const { error } = await supabase.from('collection_fees').delete().eq('collection_fee_id', taxToDeleteId);
        if (error) throw error;
        showNotification("Tax deleted and all parties notified.");
        closeDeleteConfirm();
        fetchTaxes();
    } catch (error) {
        showNotification("Delete failed", "error");
    }
};

function renderTaxes() {
    const container = document.getElementById('taxListContainer');
    container.innerHTML = '';

    const grouped = collectionFees.reduce((acc, fee) => {
        if (!acc[fee.area]) acc[fee.area] = [];
        acc[fee.area].push(fee);
        return acc;
    }, {});

    for (const [area, fees] of Object.entries(grouped)) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tax-group';
        groupDiv.innerHTML = `<h3><i class="fa-solid fa-building"></i> ${area}</h3>
            <div class="tax-list-header">
                <div>Products / Services</div>
                <div>Amount Range</div>
                <div class="center-col">Quantified</div>
                <div class="center-col">Actions</div>
            </div>`;

        fees.forEach(fee => {
            const item = document.createElement('div');
            item.className = 'tax-item';
            item.innerHTML = `
                <div class="tax-info"><strong style="font-size: 1.1rem; color: var(--dark-text);">${fee.product_services}</strong></div>
                <div class="tax-amount" style="font-size: 1.1rem; color: var(--dark-text); font-weight: 600;">₱${fee.amount_range}</div>
                <div class="center-col" style="font-size: 1.1rem; color: var(--dark-text); font-weight: 600;">${fee['quantified?'] ? 'YES' : 'NO'}</div>
                <div class="center-col">
                    <div class="action-dropdown">
                        <button class="btn-action"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        <div class="dropdown-content">
                            <button onclick="editTax(${fee.collection_fee_id})"><i class="fa-solid fa-pen-to-square"></i> Update</button>
                            <button class="btn-delete" onclick="promptDelete(${fee.collection_fee_id})"><i class="fa-solid fa-trash"></i> Delete</button>
                        </div>
                    </div>
                </div>`;
            groupDiv.appendChild(item);
        });
        container.appendChild(groupDiv);
    }
}

window.openAddTaxModal = function() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Add New Tax';
    document.getElementById('taxForm').reset();
    window.updateRangeFields();
    document.getElementById('addTaxModal').classList.remove('hidden');
};

window.closeAddTaxModal = () => document.getElementById('addTaxModal').classList.add('hidden');

window.editTax = (id) => {
    const tax = collectionFees.find(t => t.collection_fee_id === id);
    if (!tax) return;
    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Update Tax';
    document.getElementById('area').value = tax.area;
    document.getElementById('productServices').value = tax.product_services;
    document.getElementById('quantified').checked = tax['quantified?'];

    if (tax.amount_range.includes('-')) {
        document.querySelector('input[name="rangeType"][value="range"]').checked = true;
        const parts = tax.amount_range.split('-').map(s => s.trim());
        document.getElementById('rangeMin').value = parts[0];
        document.getElementById('rangeMax').value = parts[1];
    } else {
        document.querySelector('input[name="rangeType"][value="fixed"]').checked = true;
        document.getElementById('amount').value = tax.amount_range;
    }
    window.updateRangeFields();
    document.getElementById('addTaxModal').classList.remove('hidden');
};

window.promptDelete = (id) => {
    const tax = collectionFees.find(t => t.collection_fee_id === id);
    taxToDeleteId = id;
    document.getElementById('deleted-tax-details').innerHTML = `<strong>DELETING:</strong> ${tax.product_services} (${tax.area})`;
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
};

window.closeDeleteConfirm = () => document.getElementById('deleteConfirmModal').classList.add('hidden');

window.updateRangeFields = function() {
    const rangeType = document.querySelector('input[name="rangeType"]:checked').value;
    const rangeFields = document.getElementById('rangeFields');
    const amountGroup = document.getElementById('amount-group');
    if (rangeType === 'range') {
        rangeFields.classList.remove('hidden');
        amountGroup.classList.add('hidden');
    } else {
        rangeFields.classList.add('hidden');
        amountGroup.classList.remove('hidden');
    }
};

function showNotification(msg, type='success') {
    const container = document.getElementById('notificationsContainer');
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    container.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}
