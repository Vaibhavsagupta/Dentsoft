// auth.js - Lightweight frontend authentication check & API Bearer token interceptor
(function() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_BASE = (window.location.protocol === 'file:' || isLocalhost) ? 'http://localhost:5000/api' : window.location.origin + '/api';

    const publicPages = ['login.html'];
    const pathParts = window.location.pathname.split('/');
    const currentPageName = pathParts[pathParts.length - 1] || 'index.html';

    function getAuthToken() {
        return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    }

    function getUserRole() {
        return sessionStorage.getItem('userRole') || localStorage.getItem('userRole');
    }

    function getUsername() {
        return sessionStorage.getItem('username') || localStorage.getItem('username');
    }

    function clearAuth() {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('username');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('username');
    }

    // Expose helpers globally if needed
    window.getAuthToken = getAuthToken;
    window.getUserRole = getUserRole;
    window.getUsername = getUsername;
    window.clearAuth = clearAuth;

    // Verify authentication status
    const token = getAuthToken();
    const role = getUserRole();
    const user = getUsername();

    if (token && role && user) {
        // Keep both storages synced across tabs
        try {
            sessionStorage.setItem('authToken', token);
            sessionStorage.setItem('userRole', role);
            sessionStorage.setItem('username', user);
            localStorage.setItem('authToken', token);
            localStorage.setItem('userRole', role);
            localStorage.setItem('username', user);
        } catch (e) {}
    }

    if (!publicPages.includes(currentPageName)) {
        // Any protected page on any device/IP: must have a valid active session
        if (!token || !role || !user) {
            clearAuth();
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('login.html');
            }
            window.location.replace('login.html');
            return;
        }

        // Additional role authorization
        if (currentPageName === 'settings.html' && window.location.search.includes('category=password') && role !== 'admin') {
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('index.html');
            }
            window.location.replace('index.html');
            return;
        }
    } else {
        // Redirect away from login if already authenticated on this device
        if (token && role && user) {
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('index.html');
            }
            window.location.replace('index.html');
            return;
        }
    }

    // Global Fetch Interceptor to attach Authorization Bearer token automatically
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init = {}) {
        const activeToken = getAuthToken();
        let url = typeof resource === 'string' ? resource : (resource ? resource.url : '');
        
        // If it is an API call, attach Authorization header if available
        if (activeToken && (url.includes('/api/') || (typeof resource === 'string' && resource.startsWith('/api')))) {
            init = init || {};
            const headers = new Headers(init.headers || {});
            if (!headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${activeToken}`);
            }
            init.headers = headers;
        }

        try {
            const response = await originalFetch.call(this, resource, init);
            // If API returns 401 Unauthorized or 403 Forbidden with token error, redirect to login
            if ((response.status === 401 || response.status === 403) && !publicPages.includes(currentPageName)) {
                const clone = response.clone();
                try {
                    const errData = await clone.json();
                    if (errData && errData.error && (errData.error.includes('token') || errData.error.includes('Access Denied') || errData.error.includes('Forbidden') || errData.error.includes('expired') || errData.error.includes('unauthorized'))) {
                        clearAuth();
                        window.location.replace('login.html');
                    }
                } catch (e) {}
            }
            return response;
        } catch (err) {
            throw err;
        }
    };
})();

window.logout = function() {
    if (typeof window.clearAuth === 'function') {
        window.clearAuth();
    } else {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('username');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('username');
    }
    window.location.replace('login.html');
};

window.toggleHeaderLabDropdown = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('header-lab-dropdown-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
};

document.addEventListener('click', () => {
    const menu = document.getElementById('header-lab-dropdown-menu');
    if (menu) menu.style.display = 'none';
});
