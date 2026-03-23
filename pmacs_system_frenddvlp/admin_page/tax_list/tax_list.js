import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- SUPABASE INITIALIZATION ---
const SUPABASE_URL = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    databaseURL: "https://pmacs-0001-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
};
const rtdb = getDatabase(initializeApp(firebaseConfig));

// --- NOTIFICATION HELPER ---
// Writes to BOTH Firebase (seen by all roles) and Supabase (admin history)
async function saveNotification(collectionFeeId, message, notifType) {
    try {
        const now = Date.now();
        const typeMap = { addition: 'success', update: 'info', deletion: 'error' };
        const fbType  = typeMap[notifType] || 'info';

        // 1. Write to Firebase — visible to admin, collectors, vendors
        await push(ref(rtdb, 'notifications'), {
            title:     `Tax Fee ${notifType.charAt(0).toUpperCase() + notifType.slice(1)}`,
            message,
            type:      fbType,
            read:      false,
            createdAt: now,
        });

        // 2. Write to Supabase — admin notification history
        await supabase.from('notification').insert([{
            collection_fee_id: collectionFeeId,
            message,
            is_read:   false,
            notif_type: notifType,
            notif_at:  new Date(now).toISOString(),
        }]);
    } catch (e) {
        console.warn('Failed to save notification:', e.message);
    }
}

// --- GLOBAL STATE ---
let collectionFees = [];
let currentEditingId = null;
let taxToDeleteId = null;

// Extract the first numeric value from a range string like "₱4.75 to ₱20" or "200"
function parseFirstNumber(str) {
    if (!str) return null;
    const nums = String(str).match(/\d+(\.\d+)?/g);
    return nums ? parseFloat(nums[0]) : null;
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTaxes();
    updateCurrentDate();


    // Attach form submit event listener
    const form = document.getElementById('taxForm');
    if (form) {
        form.addEventListener('submit', handleTaxSubmit);
    }
});


// --- DATE FORMATTING ---
function updateCurrentDate() {
    const options = { year: "numeric", month: "long", day: "numeric" };
    const dateElement = document.getElementById("currentDate");
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
    }
}


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
        amountRange = `₱${amount}`;
    } else {
        const min = document.getElementById('rangeMin').value;
        const max = document.getElementById('rangeMax').value;
        amountRange = `₱${min} to ₱${max}`;
    }


    const payload = {
        area: area,
        product_services: productServices,
        amount_range: amountRange,
        'quantified?': isQuantified
    };


    try {
        if (currentEditingId) {
            // Get the OLD amount before updating so we can detect increase/decrease
            const oldFee = collectionFees.find(f => f.collection_fee_id === currentEditingId);
            const oldAmount = oldFee ? parseFirstNumber(oldFee.amount_range) : null;
            const newAmount = parseFirstNumber(amountRange);

            const { error } = await supabase
                .from('collection_fees')
                .update(payload)
                .eq('collection_fee_id', currentEditingId);

            if (error) throw error;
            showNotification("Tax updated successfully.");

            // Build direction-aware notification message
            let changeMsg = '';
            let notifType = 'update';
            if (oldAmount !== null && newAmount !== null && oldAmount !== newAmount) {
                if (newAmount > oldAmount) {
                    changeMsg = ` 📈 INCREASED from ₱${oldFee.amount_range} → ₱${amountRange}`;
                    notifType = 'warning'; // amber — affects vendors
                } else {
                    changeMsg = ` 📉 DECREASED from ₱${oldFee.amount_range} → ₱${amountRange}`;
                    notifType = 'success'; // green — good news
                }
            } else {
                changeMsg = ` — updated to ₱${amountRange}`;
            }

            await saveNotification(
                currentEditingId,
                `Tax fee for ${productServices} (${area})${changeMsg}`,
                notifType
            );
        } else {
            const { error } = await supabase
                .from('collection_fees')
                .insert([payload]);


            if (error) throw error;
            showNotification("New tax added successfully.");
            // Save to Supabase notification table
            const { data: newFee } = await supabase.from('collection_fees').select('collection_fee_id').eq('product_services', productServices).eq('area', area).single();
            if (newFee) await saveNotification(newFee.collection_fee_id, `New tax fee added: ${productServices} (${area}) — ₱${amountRange}`, 'addition');
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

        // Get fee details before it's fully gone from local state
        const deletedFee = collectionFees.find(f => f.collection_fee_id === taxToDeleteId);
        if (deletedFee) {
            await saveNotification(taxToDeleteId, `Tax fee removed: ${deletedFee.product_services} (${deletedFee.area}) — was ₱${deletedFee.amount_range}`, 'deletion');
        }

        showNotification("Tax deleted successfully.");
        closeDeleteConfirm();
        fetchTaxes();
    } catch (error) {
        console.error("Error deleting tax:", error);
        showNotification("Failed to delete tax.", "error");
    }
};




// Normalize any amount_range string to "₱X to ₱Y" or "₱X"
// Handles: "10 - 150", "4.35-20", ".65", "₱4.75 to ₱20", "200", etc.
function formatRange(str) {
    if (!str) return '—';
    const s = String(str).trim();

    // Already formatted with peso signs — return as-is
    if (s.includes('₱')) return s;

    // Number pattern: optional leading digits, optional decimal  e.g. "4.75" or ".65" or "10"
    const num = '(\\d*\\.?\\d+)';

    // Range: two numbers separated by " - ", "-", " to ", "to"
    const rangeRe = new RegExp(`^${num}\\s*(?:[-–]|\\bto\\b)\\s*${num}$`, 'i');
    const rangeMatch = s.match(rangeRe);
    if (rangeMatch) return `₱${rangeMatch[1]} to ₱${rangeMatch[2]}`;

    // Single number
    const singleRe = new RegExp(`^${num}$`);
    if (singleRe.test(s)) return `₱${s}`;

    // Fallback: prepend peso to each number found
    return s.replace(/(\d*\.?\d+)/g, '₱$1');
}

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
                <th style="text-align: center;">ACTIONS</th>
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
                <td><span style="font-weight: 600; color: var(--primary-color);">${formatRange(fee.amount_range)}</span></td>
                <td>${fee['quantified?'] ? 'Quantified' : 'Standard'}</td>
                <td>
                    <div class="action-btns" style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-icon btn-edit" onclick="editTax(${fee.collection_fee_id})"
                                style="width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: none; font-size: 14px; background-color: #e3f2fd; color: #1e88e5;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="promptDelete(${fee.collection_fee_id})"
                                style="width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: none; font-size: 14px; background-color: #ffebee; color: #e53935;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
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
    resetValidationStyles();
    document.getElementById('modalTitle').textContent = 'Add New Tax';
    document.getElementById('taxForm').reset();
    window.updateRangeFields();
    document.getElementById('addTaxModal').classList.remove('hidden');
};


window.closeAddTaxModal = function() {
    document.getElementById('addTaxModal').classList.add('hidden');
    resetValidationStyles();
    currentEditingId = null;
};


window.editTax = function(id) {
    const tax = collectionFees.find(t => t.collection_fee_id === id);
    if (!tax) return;


    resetValidationStyles();
    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Tax';


    document.getElementById('area').value = tax.area;
    document.getElementById('productServices').value = tax.product_services;
    document.getElementById('quantified').checked = tax['quantified?'];


    // Strip peso signs and normalize for input fields
    const rawRange = tax.amount_range.replace(/₱/g, '').trim();
    if (rawRange.match(/[-–to]+/i)) {
        document.querySelector('input[name="rangeType"][value="range"]').checked = true;
        const parts = rawRange.split(/\s*[-–to]+\s*/i).map(s => s.trim()).filter(Boolean);
        document.getElementById('rangeMin').value = parts[0] || '';
        document.getElementById('rangeMax').value = parts[1] || '';
    } else {
        document.querySelector('input[name="rangeType"][value="fixed"]').checked = true;
        document.getElementById('amount').value = rawRange;
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

function resetValidationStyles() {
    const allInputs = document.querySelectorAll('#taxForm input');
    allInputs.forEach(input => {
        input.style.borderColor = '';
    });
}