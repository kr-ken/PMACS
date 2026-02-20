// SUPABASE CONNECTION
const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'sb_publishable_PxrnBI8FOtKXlLVE4bbq5Q_5htw8yeP';

let supabase;
document.addEventListener('DOMContentLoaded', function() {
    try {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log('✅ Supabase connected successfully');
    } catch (e) {
        console.error('❌ Failed to create Supabase client:', e.message);
    }
});
