import supabase from './supabase/config/supabaseClient.js';

try {
    if (supabase) {
        console.log('✅ Supabase client loaded successfully');
    }
} catch (e) {
    console.error('❌ Failed to access Supabase client:', e.message);
}