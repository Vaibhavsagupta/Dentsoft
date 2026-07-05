// auth.js - Lightweight frontend authentication check
(function() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_BASE = (window.location.protocol === 'file:' || isLocalhost) ? 'http://localhost:5000/api' : window.location.origin + '/api';

    const publicPages = ['login.html'];
    const pathParts = window.location.pathname.split('/');
    const currentPageName = pathParts[pathParts.length - 1] || 'index.html';

    // Verify authentication status
    if (!publicPages.includes(currentPageName)) {
        const userRole = localStorage.getItem('userRole');
        const username = localStorage.getItem('username');
        if (!userRole || !username) {
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('login.html');
            }
            window.location.replace('login.html');
            return;
        }

        // Additional role authorization
        if (currentPageName === 'settings.html' && window.location.search.includes('category=password') && userRole !== 'admin') {
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('index.html');
            }
            window.location.replace('index.html');
            return;
        }
    } else {
        // If already logged in, redirect away from public page to dashboard
        const userRole = localStorage.getItem('userRole');
        if (userRole) {
            if (typeof window.onAuthRedirect === 'function') {
                window.onAuthRedirect('index.html');
            }
            window.location.replace('index.html');
        }
    }
})();

// Dynamically add Logout button and handle navbar styling on DOM load
document.addEventListener('DOMContentLoaded', () => {
    const publicPages = ['login.html'];
    const pathParts = window.location.pathname.split('/');
    const currentPageName = pathParts[pathParts.length - 1] || 'index.html';

    if (publicPages.includes(currentPageName)) return;

    // Append logout button
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.id = 'logout-btn';
        logoutLink.style.color = '#ef4444'; // Clean red color
        logoutLink.style.fontWeight = 'bold';
        logoutLink.style.marginLeft = '15px'; // matches spacing
        logoutLink.innerHTML = '<i class="fas fa-sign-out-alt" style="margin-right: 4px;"></i>LOGOUT';
        
        logoutLink.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            window.location.replace('login.html');
        };
        
        navLinks.appendChild(logoutLink);
    }
});
