// Page transitions with smooth fade effect - no white flash
(function() {
    const DURATION = 150; // ms, faster transition
    
    function isSameOriginLink(a) {
        try {
            const url = new URL(a.href, location.href);
            return url.origin === location.origin;
        } catch (e) {
            return false;
        }
    }
    
    function attachLinkHandlers() {
        document.querySelectorAll('a[href]').forEach((a) => {
            // Skip if target is not _self
            if (a.target && a.target !== '' && a.target !== '_self') return;
            
            // Skip external links
            if (!isSameOriginLink(a)) return;
            
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            
            // Skip if already attached
            if (a.dataset.transitionAttached === 'true') return;
            
            // Don't attach if it has data-no-transition attribute
            if (a.hasAttribute('data-no-transition')) {
                a.dataset.transitionAttached = 'true';
                return;
            }
            
            a.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Immediate fade out - no white flash
                document.body.style.transition = `opacity ${DURATION}ms ease-in`;
                document.body.style.opacity = '0';
                
                // Navigate after transition completes
                setTimeout(() => {
                    window.location.href = a.href;
                }, DURATION);
            });
            
            a.dataset.transitionAttached = 'true';
        });
    }
    
    // Restore opacity when page loads
    window.addEventListener('load', () => {
        document.body.style.transition = `opacity ${DURATION}ms ease-out`;
        document.body.style.opacity = '1';
    });
    
    // Handle pageshow event (back/forward navigation)
    window.addEventListener('pageshow', () => {
        document.body.style.transition = `opacity ${DURATION}ms ease-out`;
        document.body.style.opacity = '1';
    });
    
    // Initial setup - ensure body has proper transition
    document.body.style.transition = `opacity ${DURATION}ms ease-out`;
    document.body.style.opacity = '1';
    
    // Initial attachment
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.style.transition = `opacity ${DURATION}ms ease-out`;
            attachLinkHandlers();
        });
    } else {
        attachLinkHandlers();
    }
    
    // Handle dynamically added links
    const observer = new MutationObserver(() => attachLinkHandlers());
    observer.observe(document.body, { childList: true, subtree: true });
})();
