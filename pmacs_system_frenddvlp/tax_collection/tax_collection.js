import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    doc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { firebaseConfig, taxRates } from "./shared.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const vendorsCollection = collection(db, "vendors");

// Date header (if present)
const options = { year: "numeric", month: "long", day: "numeric" };
const dateElement = document.getElementById("currentDate");
if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString("en-US", options).toUpperCase();
}

// HTML escape function to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(text).toUpperCase();
    return div.innerHTML;
}

// Seed the DB with sample vendors only once (checked via localStorage)
async function seedDatabase() {
    const seedKey = "pmacs_db_seeded";
    if (localStorage.getItem(seedKey)) return; // Already seeded
    
    try {
        const snapshot = await getDocs(vendorsCollection);
        if (snapshot.empty) {
            const samples = [
                { name: "Juan Dela Cruz", stallType: "Meat", isPresent: true, hasPaid: true },
                { name: "Maria Clara", stallType: "Vegetables", isPresent: true, hasPaid: false },
                { name: "Sisa Santos", stallType: "Dry Goods", isPresent: false, hasPaid: false },
                { name: "Crisostomo Ibarra", stallType: "Fish", isPresent: true, hasPaid: true },
            ];

            for (const s of samples) {
                await addDoc(vendorsCollection, s);
            }
            localStorage.setItem(seedKey, "true");
        }
    } catch (e) {
        console.error("Error seeding database:", e);
    }
}

// Render vendor rows into the table
function renderVendors(docs) {
    const tableBody = document.getElementById("vendor-list");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    // Show empty state if no vendors
    if (docs.length === 0) {
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

    docs.forEach((vendorDoc) => {
        const vendor = vendorDoc.data();
        const id = vendorDoc.id;
        const taxAmount = taxRates[vendor.stallType] || taxRates.Default;

        const row = document.createElement("tr");
        // Use escapeHtml to prevent XSS
        row.innerHTML = `
            <td><strong>${escapeHtml(vendor.name)}</strong></td>
            <td><strong>${escapeHtml(vendor.stallType)}</strong></td>
            <td class="attendance-cell">
                <input type="checkbox" class="custom-checkbox" data-id="${id}" data-field="isPresent" ${vendor.isPresent ? "checked" : ""}>
            </td>
            <td>
                <div class="tax-cell">
                    <div class="tax-pill">${taxAmount}</div>
                    <input type="checkbox" class="custom-checkbox" data-id="${id}" data-field="hasPaid" ${vendor.hasPaid ? "checked" : ""}>
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });

    attachCheckboxListeners();
}

// Attach change listeners to checkboxes and update Firestore
function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll(".custom-checkbox");
    checkboxes.forEach((cb) => {
        // Avoid attaching multiple listeners
        if (cb.dataset.listenerAttached) return;
        cb.addEventListener("change", async (e) => {
            const target = e.target;
            const id = target.getAttribute("data-id");
            const field = target.getAttribute("data-field");
            const value = target.checked;

            await updateRecord(id, field, value, target);
        });
        cb.dataset.listenerAttached = "true";
    });
}

// Update a vendor record in Firestore, reverting the checkbox on failure
async function updateRecord(id, field, value, checkboxElement) {
    const vendorRef = doc(db, "vendors", id);
    try {
        await updateDoc(vendorRef, { [field]: value });
    } catch (e) {
        console.error("Error updating record:", e);
        if (checkboxElement) checkboxElement.checked = !value;
        alert("Could not save changes. Please try again.");
    }
}

// Real-time listener
onSnapshot(vendorsCollection, (snapshot) => {
    renderVendors(snapshot.docs);
});

// Initialize
seedDatabase();
