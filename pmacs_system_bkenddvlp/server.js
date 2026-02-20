/**
 * PMACS System Backend Server
 * Connects both Supabase and Firebase
 * 
 * Data Flow:
 * - Supabase: Vendor personal info (name, stall_type)
 * - Firebase: Tax collection and attendance for graphs
 */

require('dotenv').config({ path: __dirname + '/.env.local' });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SUPABASE CONFIGURATION (Personal Info)
// ============================================
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase connected:', supabaseUrl);

// ============================================
// FIREBASE CONFIGURATION (Tax & Attendance)
// ============================================
const firebaseServiceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID || 'pmacs-0001',
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || 'your_private_key_id',
    private_key: process.env.FIREBASE_PRIVATE_KEY || 'your_private_key',
    client_email: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk@pmacs-0001.iam.gserviceaccount.com',
    client_id: process.env.FIREBASE_CLIENT_ID || 'your_client_id',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || 'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk%40pmacs-0001.iam.gserviceaccount.com'
};

// Initialize Firebase Admin
let firebaseInitialized = false;
try {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseServiceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'pmacs-0001.firebasestorage.app'
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
}

// Initialize Firestore
let db = null;
if (firebaseInitialized) {
    try {
        db = getFirestore();
        console.log('✅ Firebase Firestore initialized');
    } catch (error) {
        console.error('❌ Firebase Firestore initialization error:', error.message);
    }
}

// Firebase references
const firebaseAuth = admin.auth();
const firebaseStorage = admin.storage();

// ============================================
// API ROUTES
// ============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'PMACS Backend Server is running',
        services: {
            supabase: supabaseUrl ? 'connected' : 'disconnected',
            firebase: firebaseInitialized ? 'connected' : 'disconnected',
            firestore: db ? 'connected' : 'disconnected'
        }
    });
});

// ============================================
// COMBINED VENDORS ENDPOINT
// Merges Supabase (personal info) + Firebase (attendance/tax)
// ============================================
app.get('/api/vendors/combined', async (req, res) => {
    try {
        // Get vendor personal info from Supabase
        const { data: vendorData, error: supabaseError } = await supabase
            .from('vendors')
            .select('*');
        
        if (supabaseError) throw supabaseError;

        // Get attendance/tax data from Firebase Firestore
        let firebaseData = [];
        if (db) {
            const vendorsRef = db.collection('vendors');
            const snapshot = await vendorsRef.get();
            firebaseData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }

        // Merge data: Supabase personal info + Firebase attendance/tax
        const combinedData = vendorData.map(vendor => {
            const firebaseRecord = firebaseData.find(f => f.name === vendor.name) || {};
            return {
                id: vendor.id,
                name: vendor.name,
                stall_type: vendor.stall_type,
                // From Firebase - attendance and tax
                isPresent: firebaseRecord.isPresent || false,
                hasPaid: firebaseRecord.hasPaid || false,
                taxAmount: firebaseRecord.taxAmount || getTaxAmount(vendor.stall_type)
            };
        });

        res.json({ data: combinedData });
    } catch (error) {
        console.error('Error fetching combined vendors:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to get tax amount based on stall type
function getTaxAmount(stallType) {
    const taxRates = {
        'Meat': 'P35',
        'Vegetables': 'P25',
        'Fish': 'P25',
        'Dry Goods': 'P15'
    };
    return taxRates[stallType] || 'P0';
}

// Update vendor attendance in Firebase
app.put('/api/vendors/:name/attendance', async (req, res) => {
    try {
        const { name } = req.params;
        const { isPresent, hasPaid } = req.body;

        if (!db) {
            return res.status(503).json({ error: 'Firebase not available' });
        }

        const vendorRef = db.collection('vendors').doc(name);
        await vendorRef.set({
            name: name,
            isPresent: isPresent,
            hasPaid: hasPaid,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        res.json({ success: true, message: 'Attendance updated in Firebase' });
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SUPABASE API ENDPOINTS (Personal Info)
// ============================================

// Get all vendors from Supabase
app.get('/api/vendors', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .select('*');
        
        if (error) throw error;
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new vendor to Supabase
app.post('/api/vendors', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .insert(req.body);
        
        if (error) throw error;
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update vendor in Supabase
app.put('/api/vendors/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .update(req.body)
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete vendor from Supabase
app.delete('/api/vendors/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Vendor deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// FIREBASE FIRESTORE ENDPOINTS (Tax & Attendance)
// ============================================

// Get attendance records from Firebase
app.get('/api/attendance', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Firebase not available' });
        }

        const snapshot = await db.collection('vendors').get();
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update attendance in Firebase
app.post('/api/attendance', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Firebase not available' });
        }

        const { name, isPresent, hasPaid, stallType } = req.body;
        
        await db.collection('vendors').doc(name).set({
            name,
            isPresent: isPresent || false,
            hasPaid: hasPaid || false,
            stallType,
            taxAmount: getTaxAmount(stallType),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tax collection data for graphs
app.get('/api/tax-summary', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Firebase not available' });
        }

        const snapshot = await db.collection('vendors').get();
        const vendors = snapshot.docs.map(doc => doc.data());

        const summary = {
            totalVendors: vendors.length,
            presentToday: vendors.filter(v => v.isPresent).length,
            paidToday: vendors.filter(v => v.hasPaid).length,
            collectedAmount: vendors
                .filter(v => v.hasPaid)
                .reduce((sum, v) => sum + parseTaxAmount(v.taxAmount), 0)
        };

        res.json({ data: summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper to parse tax amount
function parseTaxAmount(amount) {
    if (!amount) return 0;
    const match = amount.match(/P(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// ============================================
// FIREBASE AUTH ENDPOINTS
// ============================================

app.post('/api/firebase/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({ error: 'ID token is required' });
        }

        const decodedToken = await firebaseAuth.verifyIdToken(idToken);
        res.json({ 
            success: true, 
            user: {
                uid: decodedToken.uid,
                email: decodedToken.email,
                emailVerified: decodedToken.email_verified,
                displayName: decodedToken.name
            }
        });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

app.post('/api/firebase/create-custom-token', async (req, res) => {
    try {
        const { uid, additionalClaims } = req.body;
        
        if (!uid) {
            return res.status(400).json({ error: 'UID is required' });
        }

        const customToken = await firebaseAuth.createCustomToken(uid, additionalClaims);
        res.json({ token: customToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 PMACS Backend Server running on port ${PORT}`);
    console.log(`📊 Supabase (Personal Info): ${supabaseUrl}`);
    console.log(`🔥 Firebase (Tax & Attendance): pmacs-0001`);
    console.log(`📋 Combined endpoint: GET /api/vendors/combined`);
});

module.exports = app;
