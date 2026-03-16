import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://kbrwqixrbxlmopyxbrnj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticndxaXhyYnhsbW9weXhicm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYzMDEsImV4cCI6MjA4NTc0MjMwMX0.2eaz8RqCAEeBuljppI_ynA0oaYbepER3LdX8oF3iWiA';
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Page routes (relative to login_page/) ──
const ROUTES = {
    vendor:    '../vendor_details_page/vendors_page.html',
    collector: '../tax_collection/tax_collection.html',
    admin:     '../admin_page/admin.html',
};

// ── DOM refs ──
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin      = document.getElementById('btnLogin');
const btnText       = document.getElementById('btnText');
const btnIcon       = document.getElementById('btnIcon');
const btnSpinner    = document.getElementById('btnSpinner');
const errorBanner   = document.getElementById('errorMessage');
const errorText     = document.getElementById('errorText');
const togglePw      = document.getElementById('togglePw');
const toggleIcon    = document.getElementById('toggleIcon');

// ── Password toggle ──
togglePw.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleIcon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

// ── Error helpers ──
function showError(message) {
    errorText.textContent = message;
    errorBanner.style.display = 'flex';
    errorBanner.style.animation = 'none';
    errorBanner.offsetHeight; // reflow to retrigger
    errorBanner.style.animation = 'shake 0.4s ease';
}
function hideError() {
    errorBanner.style.display = 'none';
}

// ── Loading state ──
function setLoading(on) {
    btnLogin.disabled     = on;
    btnText.style.display    = on ? 'none'   : 'inline';
    btnIcon.style.display    = on ? 'none'   : 'inline';
    btnSpinner.style.display = on ? 'inline' : 'none';
}

// ── Save session to sessionStorage so other pages know who's logged in ──
function saveSession(role, id, name) {
    sessionStorage.setItem('pmacs_role',  role);
    sessionStorage.setItem('pmacs_id',    String(id));
    sessionStorage.setItem('pmacs_name',  name);
}

// ── Main login handler ──
async function handleLogin() {
    hideError();

    const username = emailInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        showError('Please enter your username and password.');
        return;
    }

    setLoading(true);

    try {
        console.log('[PMACS Login] Attempting login for username:', username);

        // ── Step 1: Check vendors table first ──
        const { data: vendorLogin, error: vendorErr } = await supabase
            .from('login_details_vendors')
            .select('vendor_id, vendor_username, vendor_confirmedpassword')
            .eq('vendor_username', username)
            .eq('vendor_confirmedpassword', password)
            .maybeSingle();

        console.log('[PMACS Login] Vendor lookup result:', vendorLogin, 'Error:', vendorErr);

        if (vendorErr) throw vendorErr;

        if (vendorLogin) {
            console.log('[PMACS Login] Found as vendor, redirecting...');
            const { data: vendorInfo } = await supabase
                .from('vendor_details')
                .select('vendor_name')
                .eq('vendor_id', vendorLogin.vendor_id)
                .single();

            saveSession('vendor', vendorLogin.vendor_id, vendorInfo?.vendor_name || username);
            window.location.href = ROUTES.vendor;
            return;
        }

        // ── Step 2: Check officials table ──
        // role_code 829 = collector, 23646 = admin
        const { data: officialLogin, error: officialErr } = await supabase
            .from('login_details_officials')
            .select('officials_id, officials_username, officials_confirmedpassword, role_code')
            .eq('officials_username', username)
            .eq('officials_confirmedpassword', password)
            .maybeSingle();

        console.log('[PMACS Login] Official lookup result:', officialLogin, 'Error:', officialErr);

        if (officialErr) throw officialErr;

        if (officialLogin) {
            console.log('[PMACS Login] Found as official, role_code:', officialLogin.role_code);
            // Get name from officials_details
            const { data: officialInfo } = await supabase
                .from('officials_details')
                .select('officials_name')
                .eq('officials_id', officialLogin.officials_id)
                .single();

            const roleCode = Number(officialLogin.role_code);

            if (roleCode === 829) {
                saveSession('collector', officialLogin.officials_id, officialInfo?.officials_name || username);
                window.location.href = ROUTES.collector;
            } else if (roleCode === 23646) {
                saveSession('admin', officialLogin.officials_id, officialInfo?.officials_name || username);
                window.location.href = ROUTES.admin;
            } else {
                setLoading(false);
                showError('Your account does not have an assigned role. Contact your administrator.');
            }
            return;
        }

        // ── Not found in either table ──
        console.log('[PMACS Login] Not found in vendors or officials tables.');
        setLoading(false);
        showError('Incorrect username or password. Please try again.');

    } catch (err) {
        setLoading(false);
        console.error('[PMACS Login] Caught error:', err);
        showError(`Error: ${err.message || 'Something went wrong. Please try again.'}`);
    }
}

// ── Event listeners ──
btnLogin.addEventListener('click', handleLogin);

[emailInput, passwordInput].forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    input.addEventListener('input',   hideError);
});