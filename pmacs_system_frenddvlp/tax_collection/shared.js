// Shared Firebase configuration and common functions
// This module is used by both tax_collection.js and dashboard.js

// Firebase configuration (can be moved to backend in production)
const firebaseConfig = {
    apiKey: "AIzaSyA0zUwFQHAG0jMLGoTwKHzntCoyksX4dnw",
    authDomain: "pmacs-0001.firebaseapp.com",
    projectId: "pmacs-0001",
    storageBucket: "pmacs-0001.firebasestorage.app",
    messagingSenderId: "73881840540",
    appId: "1:73881840540:web:d8194aec335cbfcf527659",
    measurementId: "G-5LGY80N96Q",
};

// Tax rate table
const taxRates = {
    Meat: "P35",
    Vegetables: "P25",
    Fish: "P25",
    "Dry Goods": "P15",
    Default: "AMOUNT",
};

// Export for use in other modules
export { firebaseConfig, taxRates };
