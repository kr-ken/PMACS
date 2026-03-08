import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";


import {


    getFirestore, collection, getDocs, addDoc, updateDoc, doc, onSnapshot,


} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";


// Import Supabase


import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";






// --- CONFIGURATION FROM YOUR KEYS ---


const firebaseConfig = {


    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",


    authDomain: "pmacs-0001.firebaseapp.com",


    projectId: "pmacs-0001",


    storageBucket: "pmacs-0001.firebasestorage.app",


    messagingSenderId: "73881840540",


    appId: "1:73881840540:web:d8194aec335cbfcf527659",


    measurementId: "G-5LGY80N96Q"


};






const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';


const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';






// Initialize Clients


const app = initializeApp(firebaseConfig);


const db = getFirestore(app);


const supabase = createClient(supabaseUrl, supabaseKey);


const vendorsCollection = collection(db, "vendors");






// Tax Rates Fallback (for vendor table)


const taxRates = { "Meat": 20, "Vegetables": 10, "Dry Goods": 50, "Fish": 15, "Default": 10 };






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






// --- VENDOR TABLE (FIREBASE) ---


function renderVendors(docs) {


    const tableBody = document.getElementById("vendor-list");


    if (!tableBody) return;


    tableBody.innerHTML = "";






    const groupedVendors = {};


    docs.forEach((vendorDoc) => {


        const vendor = vendorDoc.data();


        const area = vendor.vendor_stall_area || "UNASSIGNED AREA";


        if (!groupedVendors[area]) groupedVendors[area] = [];


        groupedVendors[area].push({ id: vendorDoc.id, ...vendor });


    });






    for (const [area, vendors] of Object.entries(groupedVendors)) {


        const headerRow = document.createElement("tr");


        headerRow.className = "area-separator";


        headerRow.innerHTML = `<td colspan="4"><i class="fa-solid fa-building"></i> ${escapeHtml(area)}</td>`;


        tableBody.appendChild(headerRow);






        vendors.forEach(vendor => {


            const taxAmount = taxRates[vendor.stallType] || taxRates.Default;


            const row = document.createElement("tr");


            row.innerHTML = `


<td><strong>${escapeHtml(vendor.name)}</strong></td>


<td><strong>${escapeHtml(vendor.stallType)}</strong></td>


<td class="attendance-cell">


<input type="checkbox" class="custom-checkbox" data-id="${vendor.id}" data-field="isPresent" ${vendor.isPresent ? "checked" : ""}>


</td>


<td>


<div class="tax-cell">


<div class="tax-pill">₱${taxAmount}</div>


<input type="checkbox" class="custom-checkbox" data-id="${vendor.id}" data-field="hasPaid" ${vendor.hasPaid ? "checked" : ""}>


</div>


</td>


`;


            tableBody.appendChild(row);


        });


    }


    attachCheckboxListeners();


}






async function updateRecord(id, field, value, checkboxElement) {


    const vendorRef = doc(db, "vendors", id);


    try {


        await updateDoc(vendorRef, { [field]: value });


    } catch (e) {


        console.error("Update failed:", e);


        if (checkboxElement) checkboxElement.checked = !value;


    }


}






function attachCheckboxListeners() {


    document.querySelectorAll(".custom-checkbox").forEach((cb) => {


        if (cb.dataset.listenerAttached) return;


        cb.addEventListener("change", async (e) => {


            await updateRecord(e.target.dataset.id, e.target.dataset.field, e.target.checked, e.target);


        });


        cb.dataset.listenerAttached = "true";


    });


}






// --- TAX LIST MODAL (SUPABASE) ---


const openBtn = document.getElementById('openTaxList');


const closeBtn = document.getElementById('closeTaxList');


const modal = document.getElementById('taxModalOverlay');






if (openBtn) {


    openBtn.addEventListener('click', () => {


        document.body.classList.add('modal-active');


        modal.style.display = 'flex';


        loadCollectionFees();


    });


}






if (closeBtn) {


    closeBtn.addEventListener('click', () => {


        document.body.classList.remove('modal-active');


        modal.style.display = 'none';


    });


}






async function loadCollectionFees() {


    const tableBody = document.getElementById('tax-fee-list');


    tableBody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding:20px;'>Loading...</td></tr>";






    const { data: fees, error } = await supabase


        .from('collection_fees')


        .select('*')


        .order('area', { ascending: true });






    if (error) {


        tableBody.innerHTML = "<tr><td colspan='3'>Error: " + error.message + "</td></tr>";


        return;


    }






    tableBody.innerHTML = "";


    let lastArea = "";


    fees.forEach(fee => {


        if (fee.area !== lastArea) {


            lastArea = fee.area;


            const sep = document.createElement('tr');


            sep.className = "area-separator";


            sep.innerHTML = `<td colspan="3"><i class="fa-solid fa-location-dot"></i> ${fee.area.toUpperCase()}</td>`;


            tableBody.appendChild(sep);


        }


        const row = document.createElement('tr');


        row.innerHTML = `


<td style="padding-left: 25px;">${fee.product_services}</td>


<td style="font-weight: bold; color: #2971b9;">${fee.amount_range}</td>


<td class="center-col">${fee['quantified?'] === 'true' || fee['quantified?'] === true ? '<i class="fa-solid fa-circle-check" style="color:#27ae60"></i>' : '-'}</td>


`;


        tableBody.appendChild(row);


    });


}






// Start Listeners


onSnapshot(vendorsCollection, (snapshot) => renderVendors(snapshot.docs));
// Initialize
seedDatabase();


