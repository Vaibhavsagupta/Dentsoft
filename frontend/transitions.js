// Auto-redirect from file:/// to localhost:5000 to prevent CORS and Origin security errors
if (window.location.protocol === 'file:') {
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    const newUrl = 'http://localhost:5000/' + filename + window.location.search + window.location.hash;
    window.location.replace(newUrl);
}


// Global Typography Override Engine (Forces 17px across general content, and preserves exact Header & Form layouts)
(function applyGlobalTypography() {
    const css = `
        html, body {
            font-size: 17px !important;
            line-height: 18px !important;
            font-weight: 400 !important;
            font-style: normal !important;
        }
        body, body *:not(header):not(header *):not(h1):not(h2):not(h3):not(h4):not(.fa):not(.fas):not(.far):not(.fa-solid):not(.fa-regular):not(i):not(svg):not(svg *):not(text):not(.theme-cal-svg *):not(#tab-content-panel):not(#tab-content-panel *):not(.settings-content-pane):not(.settings-content-pane *):not(.settings-inner-view):not(.settings-inner-view *):not(.inner-settings-container):not(.inner-settings-container *):not(#tax-setup-modal):not(#tax-setup-modal *):not(.reports-sidebar):not(.reports-sidebar *):not(.report-item):not(.report-item *):not(#report-list):not(#report-list *):not(#report-search-section):not(#report-search-section *):not(#print-report-modal):not(#print-report-modal *):not(#report-viewer-content):not(#report-viewer-content *):not(.reports-main-area table):not(.reports-main-area table *):not(.client-form-wrapper):not(.client-form-wrapper *):not(.lc-main-frame):not(.lc-main-frame *) {
            font-size: 17px !important;
            line-height: 18px !important;
            font-weight: 400 !important;
            font-style: normal !important;
        }
        input:not(#report-search):not(.reports-sidebar *):not(#report-search-section *):not(#print-report-modal *):not(#report-date-start):not(#report-date-end):not(#report-client-search):not([data-filter]):not(.client-form-wrapper *):not(.lc-main-frame *):not(#tab-content-panel *):not(.settings-inner-view *):not(#tax-setup-modal *), select:not(#report-search-section *):not(#print-report-modal *):not(#report-date-preset):not([data-filter]):not(.client-form-wrapper *):not(.lc-main-frame *):not(#tab-content-panel *):not(.settings-inner-view *):not(#tax-setup-modal *), textarea:not(.client-form-wrapper *):not(.lc-main-frame *):not(#tab-content-panel *):not(.settings-inner-view *):not(#tax-setup-modal *), button:not(#print-report-modal *):not(.client-form-wrapper *):not(.lc-main-frame *):not(#tab-content-panel *):not(.settings-inner-view *):not(#tax-setup-modal *), .btn-toolbar, .dropdown-content a {
            font-size: 17px !important;
            line-height: 18px !important;
            font-weight: 400 !important;
            font-style: normal !important;
            min-height: 28px !important;
        }
        table:not(#report-viewer-content table) td, table:not(#report-viewer-content table) th, .legacy-table td, .legacy-table th, #clients-table td, #clients-table th, #orders-table td, #orders-table th {
            font-size: 17px !important;
            line-height: 1.25 !important;
            font-weight: 400 !important;
            font-style: normal !important;
            height: auto !important;
            min-height: 24px !important;
        }
        #orders-table {
            table-layout: auto !important;
            width: 100% !important;
            max-width: 100% !important;
        }
        #orders-table td:nth-child(5),
        #orders-table td:nth-child(6),
        #orders-table td:nth-child(7),
        #orders-table th:nth-child(5),
        #orders-table th:nth-child(6),
        #orders-table th:nth-child(7) {
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
        }
        #orders-table td:nth-child(1),
        #orders-table td:nth-child(2),
        #orders-table td:nth-child(3),
        #orders-table td:nth-child(4),
        #orders-table td:nth-child(8),
        #orders-table td:nth-child(9),
        #orders-table td:nth-child(10),
        #orders-table td:nth-child(11),
        #orders-table td:nth-child(12) {
            white-space: nowrap !important;
        }
        /* Client Sidebar Buttons (Proper fit, no text clipping) */
        .client-sidebar-btn,
        aside .client-sidebar-btn,
        aside .btn-action {
            width: 100% !important;
            min-height: 28px !important;
            height: auto !important;
            font-size: 13.5px !important;
            line-height: 15px !important;
            font-weight: 600 !important;
            font-style: normal !important;
            padding: 5px 6px !important;
            white-space: normal !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            text-align: center !important;
        }

        /* Reports Page Sidebar & Items Typography & Width */
        .reports-sidebar,
        .reports-sidebar a,
        .reports-sidebar span,
        .reports-sidebar div,
        .report-item,
        .report-item span,
        #report-list,
        #report-list a,
        #report-list span,
        .reports-sidebar input,
        .reports-sidebar input::placeholder,
        #report-search,
        #report-search::placeholder,
        #report-count {
            font-family: Helvetica, Arial, sans-serif !important;
            font-style: normal !important;
            font-weight: 400 !important;
            font-size: 12px !important;
            line-height: 20px !important;
        }
        .reports-sidebar i,
        .reports-sidebar svg,
        .reports-sidebar [class*="fa-"],
        .report-item i,
        .report-item svg,
        .report-item [class*="fa-"] {
            font-family: "Font Awesome 6 Free", "FontAwesome" !important;
            font-size: 11px !important;
            line-height: 20px !important;
            font-style: normal !important;
            width: 14px !important;
            text-align: center !important;
            display: inline-block !important;
            flex-shrink: 0 !important;
        }
        .reports-sidebar i.fas,
        .reports-sidebar i.fa-solid,
        .report-item i.fas,
        .report-item i.fa-solid {
            font-weight: 900 !important;
        }
        .reports-sidebar i.far,
        .reports-sidebar i.fa-regular,
        .report-item i.far,
        .report-item i.fa-regular {
            font-weight: 400 !important;
        }
        .reports-sidebar {
            width: 180px !important;
            min-width: 180px !important;
            max-width: 180px !important;
            flex: 0 0 180px !important;
            flex-shrink: 0 !important;
        }

        /* Reports Table Typography (Arial, 400, 12px, 18px line-height) */
        #report-viewer-content table,
        #report-viewer-content table td,
        #report-viewer-content table tr,
        .reports-main-area table,
        .reports-main-area table td,
        .reports-main-area table tr {
            font-family: Arial, sans-serif !important;
            font-style: normal !important;
            font-weight: 400 !important;
            font-size: 12px !important;
            line-height: 18px !important;
        }

        .teeth-grid-ascii,
        #report-viewer-content .teeth-grid-ascii,
        .reports-main-area .teeth-grid-ascii {
            font-family: Consolas, "Courier New", monospace !important;
            font-size: 10px !important;
            line-height: 11px !important;
            color: #444 !important;
            text-align: left !important;
            white-space: pre !important;
            display: inline-block !important;
            letter-spacing: 0px !important;
            margin: 1px auto !important;
        }

        #report-viewer-content table th,
        .reports-main-area table th {
            font-family: Arial, sans-serif !important;
            font-style: normal !important;
            font-weight: bold !important;
            font-size: 10px !important;
            line-height: 12px !important;
            color: #111 !important;
            padding: 2px 4px !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow: visible !important;
            box-sizing: border-box !important;
        }

        #report-viewer-content table td,
        .reports-main-area table td {
            font-family: Arial, sans-serif !important;
            font-style: normal !important;
            font-weight: 400 !important;
            font-size: 12px !important;
            line-height: 18px !important;
            color: #000 !important;
            padding: 4px 6px !important;
            box-sizing: border-box !important;
        }

        /* Search Criterion Input Fields & Date Inputs */
        #report-search-section input,
        #report-search-section select,
        #report-date-start,
        #report-date-end,
        #report-client-search,
        input[data-filter="date-start"],
        input[data-filter="date-end"],
        input[data-filter="city-search"],
        select[data-filter] {
            font-size: 12px !important;
            line-height: 16px !important;
            font-family: Arial, sans-serif !important;
            font-weight: 400 !important;
            min-height: 24px !important;
            height: 24px !important;
            padding: 2px 6px !important;
            box-sizing: border-box !important;
        }

        #report-date-start,
        #report-date-end,
        input[data-filter="date-start"],
        input[data-filter="date-end"] {
            width: 100px !important;
            min-width: 100px !important;
            text-align: center !important;
        }

        #report-client-search {
            width: 260px !important;
            min-width: 260px !important;
        }

        /* Print Report Options Modal */
        #print-report-modal {
            font-family: Arial, sans-serif !important;
        }
        #print-report-modal input[type="number"],
        #print-report-modal input[type="text"] {
            font-family: Arial, sans-serif !important;
            font-size: 12px !important;
            line-height: 16px !important;
            font-weight: 400 !important;
            height: 22px !important;
            min-height: 22px !important;
            padding: 2px 4px !important;
            box-sizing: border-box !important;
            border: 1px solid #767676 !important;
            border-radius: 0px !important;
        }
        #print-report-modal button {
            font-family: Arial, sans-serif !important;
            font-size: 12px !important;
            line-height: 16px !important;
            font-weight: 400 !important;
            height: 25px !important;
            min-height: 25px !important;
            padding: 3px 14px !important;
            box-sizing: border-box !important;
            background: #fff !important;
            border: 1px solid #adadad !important;
            color: #0056b3 !important;
            border-radius: 2px !important;
            cursor: pointer !important;
        }
        #print-report-modal button:hover {
            background: #f0f0f0 !important;
        }

        /* Quick Search Bar */
        #main-quick-search {
            height: 24px !important;
            min-height: 24px !important;
            font-size: 13px !important;
            line-height: 16px !important;
            font-weight: 400 !important;
            padding: 2px 24px 2px 6px !important;
            border: 1px solid #7a7a7a !important;
            border-radius: 2px !important;
            box-sizing: border-box !important;
        }
        #main-quick-search::placeholder {
            font-size: 12.5px !important;
            line-height: 16px !important;
            color: #777777 !important;
        }

        /* Exact Header Typography: Helvetica, Arial, sans-serif, 11px, 15px line-height, 700 weight, normal style */
        header, 
        header nav, 
        header a, 
        header a span, 
        header nav a, 
        header nav a span,
        header div a,
        header div a span,
        .nav-links a,
        .nav-links a span {
            font-family: Helvetica, Arial, sans-serif !important;
            font-size: 11px !important;
            line-height: 15px !important;
            font-weight: 700 !important;
            font-style: normal !important;
        }
        header i, 
        header nav i, 
        header a i {
            font-size: 13px !important;
            line-height: 14px !important;
        }
        header .logo-section span,
        header a[href="index.html"] span {
            font-family: Helvetica, Arial, sans-serif !important;
            font-size: 13px !important;
            line-height: 15px !important;
            font-weight: 700 !important;
            font-style: normal !important;
        }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'global-software-typography';
    styleEl.textContent = css;
    if (document.head) {
        document.head.appendChild(styleEl);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (!document.getElementById('global-software-typography')) {
                document.head.appendChild(styleEl);
            }
        });
    }
})();

document.addEventListener('DOMContentLoaded', () => {

    // 6. Backup Reminder Logic
    function checkBackupReminder() {
        const lastBackup = localStorage.getItem('lastBackupDate');
        const fifteenDays = 15 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (!lastBackup || (now - lastBackup) > fifteenDays) {
            const reminder = document.createElement('div');
            reminder.id = 'backup-reminder';
            reminder.style.cssText = `
                position: sticky;
                top: 0;
                left: 0;
                width: 100%;
                background: #fef3c7;
                color: #92400e;
                padding: 10px;
                text-align: center;
                font-size: 13px;
                font-weight: 600;
                z-index: 10001;
                border-bottom: 1px solid #f59e0b;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 15px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            `;
            reminder.innerHTML = `
                <span><i class="fas fa-exclamation-triangle"></i> Reminder: Aapne 15 din se backup nahi liya hai. Kripya suraksha ke liye backup le lein.</span>
                <a href="/api/backup/system" class="backup-now-btn" style="background:#f59e0b; color:white; text-decoration:none; padding:4px 12px; border-radius:4px; font-size:11px;">System Backup Karein</a>
                <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#b45309; cursor:pointer; font-size:16px;">&times;</button>
            `;
            document.body.prepend(reminder);
        }
    }

    // checkBackupReminder();

    // =========================================================================
    // UNIFIED GLOBAL ROW-ANCHORED POPOVER POSITIONING ENGINE
    // Replaces fixed modal behavior for row actions with an anchored popover
    // attached directly to the clicked row, with auto-flip and scroll tracking.
    // =========================================================================

    let activeAnchorData = null;

    function updateAnchoredPopoverPosition() {
        if (!activeAnchorData) return;
        const { modalContent, anchorEl, options } = activeAnchorData;
        if (!modalContent || !anchorEl || modalContent.style.display === 'none' || modalContent.closest('.center-modal, [data-no-anchor="true"], #client-grid-settings-modal, #grid-settings-modal, #grid-fields-modal, #export-modal, #order-info-modal, #cso-options-modal, #cso-options-dialog, #print-report-modal')) {
            activeAnchorData = null;
            return;
        }

        const rect = anchorEl.getBoundingClientRect();
        const panelWidth = options.width || modalContent.offsetWidth || 920;
        const panelHeight = Math.min(modalContent.offsetHeight || 500, window.innerHeight - 80);

        const spaceBelow = window.innerHeight - rect.bottom - 10;
        const spaceAbove = rect.top - 65;

        let top = rect.bottom + 4;
        let maxHeight = 520;

        // Auto-Flip above if not enough space below and more space above
        if (spaceBelow < 320 && spaceAbove > spaceBelow) {
            top = Math.max(65, rect.top - panelHeight - 4);
            maxHeight = Math.max(280, spaceAbove - 10);
        } else {
            maxHeight = Math.max(280, spaceBelow - 10);
        }

        // Viewport bounds clamping
        const minTop = 65;
        const maxTop = Math.max(minTop, window.innerHeight - panelHeight - 15);
        top = Math.max(minTop, Math.min(top, maxTop));

        // Horizontal positioning: align with anchor left or center in viewport
        let left = rect.left;
        if (left + panelWidth > window.innerWidth - 15) {
            left = Math.max(15, window.innerWidth - panelWidth - 15);
        }
        if (left < 15) left = Math.max(15, (window.innerWidth - panelWidth) / 2);

        modalContent.style.position = 'fixed';
        modalContent.style.top = top + 'px';
        modalContent.style.left = left + 'px';
        modalContent.style.transform = 'none';
        modalContent.style.margin = '0';
        modalContent.style.maxWidth = 'calc(100vw - 30px)';
        modalContent.style.maxHeight = maxHeight + 'px';
        modalContent.style.overflowY = 'auto';
        modalContent.style.boxSizing = 'border-box';
        modalContent.style.zIndex = '1000000';
    }

    // Window scroll and resize listeners to keep anchored popovers attached
    window.addEventListener('scroll', updateAnchoredPopoverPosition, { passive: true });
    window.addEventListener('resize', updateAnchoredPopoverPosition, { passive: true });

    window.openAnchoredPopover = function(modalContent, triggerElOrEvent, options = {}) {
        if (!modalContent) return;

        // 1. Setup Overlay Backdrop
        const overlay = modalContent.closest('.modal-overlay') || modalContent.closest('.modal') || modalContent.parentElement;
        if (overlay && overlay !== document.body) {
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.display = 'block';
            overlay.style.zIndex = '999999';
            overlay.style.background = options.transparent ? 'transparent' : 'rgba(0, 0, 0, 0.4)';
            overlay.style.boxSizing = 'border-box';
        }

        // 2. Identify Anchor Row / Element
        let anchorEl = null;
        const trigger = triggerElOrEvent || window.lastClickEvent;

        if (trigger) {
            if (trigger.nodeType === 1) {
                anchorEl = trigger.closest('tr') || trigger;
            } else if (trigger.target) {
                const targetNode = trigger.currentTarget || trigger.target;
                anchorEl = (targetNode && targetNode.closest) ? (targetNode.closest('tr') || targetNode) : targetNode;
            }
        }

        if (!anchorEl || !anchorEl.getBoundingClientRect) {
            anchorEl = document.body;
        }

        activeAnchorData = { modalContent, anchorEl, options };
        updateAnchoredPopoverPosition();
    };

    // Backward-compatible alias
    window.anchorPopoverNearElement = window.openAnchoredPopover;
    window.positionPopupNearClick = function(modalContent, eventOrRect, defaultWidth) {
        window.openAnchoredPopover(modalContent, eventOrRect, { width: defaultWidth });
    };

    // Global Event Listeners: Track Click Location & Handle Backdrop / Escape Key Close
    window.lastClickEvent = null;
    document.addEventListener('click', (e) => {
        window.lastClickEvent = e;
        const target = e.target;

        // Dismiss open modal/popover when clicking directly on dark overlay backdrop
        if (target && target.tagName === 'DIV' && (
            (target.classList && (target.classList.contains('modal-overlay') || target.classList.contains('modal') || target.classList.contains('settings-modal'))) || 
            (target.id && (target.id.endsWith('-modal') || target.id.startsWith('modal-overlay') || target.id.includes('-overlay')))
        )) {
            const content = target.querySelector('.modal-content') || target.querySelector('.card') || target.querySelector('.export-modal-box') || target.querySelector('.settings-modal-content') || target.firstElementChild;
            if (content && !content.contains(e.target) && e.target === target) {
                target.style.display = 'none';
                target.setAttribute('style', 'display: none !important;');
                if (target.id === 'export-modal' || target.id === 'grid-settings-modal' || target.id === 'plan-modal' || target.id === 'return-modal' || target.id === 'apply-payment-modal' || target.id === 'edit-modal') {
                    target.remove();
                }
            }
        }
    }, true);

    // Global Keydown Handler: Close Active Popovers / Modals on 'Escape' Key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            const modals = document.querySelectorAll('.modal-overlay, .modal, .settings-modal, [id*="modal"]');
            modals.forEach(m => {
                if (m.style.display !== 'none' && m.offsetWidth > 0 && m.offsetHeight > 0) {
                    m.style.display = 'none';
                    m.setAttribute('style', 'display: none !important;');
                    if (m.id === 'export-modal' || m.id === 'grid-settings-modal' || m.id === 'plan-modal' || m.id === 'return-modal' || m.id === 'apply-payment-modal' || m.id === 'edit-modal') {
                        m.remove();
                    }
                }
            });
        }
    });

    // Automatically Anchor & Position Any Newly Inserted Popovers / Modals
    const modalObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    const isModalOverlay = node.classList && (
                        node.classList.contains('modal-overlay') || 
                        node.classList.contains('modal') || 
                        node.classList.contains('settings-modal') ||
                        (node.id && node.id.includes('modal'))
                    );
                    
                    const isExplicitCenter = 
                        (node.dataset && (node.dataset.noAnchor === 'true' || node.dataset.noAnchor === '')) ||
                        (node.classList && (node.classList.contains('center-modal') || node.classList.contains('dialog-modal'))) ||
                        node.id === 'order-quick-view-modal' ||
                        node.id === 'tax-setup-modal' ||
                        node.id.includes('tax') ||
                        node.id.includes('quick-view') ||
                        node.id === 'cso-options-modal' ||
                        node.id === 'cso-options-dialog' ||
                        node.id === 'print-report-modal' ||
                        node.id === 'select-client-modal' ||
                        node.id === 'add-orders-modal' ||
                        node.id === 'client-grid-settings-modal' ||
                        node.id === 'grid-settings-modal' ||
                        node.id === 'grid-fields-modal' ||
                        node.id === 'order-info-modal' ||
                        node.id === 'export-modal' ||
                        node.id.includes('grid-settings') ||
                        node.id.includes('fields') ||
                        node.id.includes('settings') ||
                        node.id.includes('client-viewer');

                    if (isModalOverlay && !isExplicitCenter) {
                        const content = node.querySelector('.modal-content') || node.querySelector('.card') || node.querySelector('.export-modal-box') || node.querySelector('.settings-modal-content') || node.firstElementChild;
                        if (content && window.anchorPopoverNearElement) {
                            setTimeout(() => {
                                window.anchorPopoverNearElement(content, window.lastClickEvent);
                            }, 5);
                        }
                    }
                }
            }
        }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });

    // 7. Export Modal Logic
    window.showExportModal = function(event) {
        if (event && event.preventDefault) event.preventDefault();
        const existing = document.getElementById('export-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'export-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.4);
            z-index: 20000;
        `;
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeExportModal();
        });

        const content = document.createElement('div');
        content.className = 'export-modal-box';
        content.style.cssText = `background:white; padding:20px; border-radius:12px; width:380px; box-shadow:0 10px 25px rgba(0,0,0,0.2); border:1px solid #ccc; box-sizing:border-box;`;
        
        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2 style="margin:0; font-size:16px; color:#111827;">Export Data</h2>
                <button onclick="closeExportModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#6b7280;">&times;</button>
            </div>
            <p style="font-size:12px; color:#6b7280; margin-bottom:15px;">Choose your preferred format for downloading lab data.</p>
            <div style="display:grid; gap:10px;">
                <a href="/api/backup/orders-csv" download class="export-opt" onclick="closeExportModal()" style="text-decoration:none;">
                    <div style="background:#dcfce7; color:#166534; padding:10px 12px; border-radius:8px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                        <i class="fas fa-file-excel" style="font-size:18px;"></i>
                        <div>
                            <div style="font-weight:700; font-size:13px;">Excel Spreadsheet (.csv)</div>
                            <div style="font-size:11px; opacity:0.8;">Best for Orders analysis in Excel</div>
                        </div>
                    </div>
                </a>
                <a href="/api/backup/data" download class="export-opt" onclick="closeExportModal()" style="text-decoration:none;">
                    <div style="background:#dbeafe; color:#1e40af; padding:10px 12px; border-radius:8px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                        <i class="fas fa-file-code" style="font-size:18px;"></i>
                        <div>
                            <div style="font-weight:700; font-size:13px;">Raw Data (.json)</div>
                            <div style="font-size:11px; opacity:0.8;">Full technical backup (All tables)</div>
                        </div>
                    </div>
                </a>
                <a href="javascript:void(0)" onclick="window.print(); closeExportModal()" class="export-opt" style="text-decoration:none;">
                    <div style="background:#fee2e2; color:#991b1b; padding:10px 12px; border-radius:8px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                        <i class="fas fa-file-pdf" style="font-size:18px;"></i>
                        <div>
                            <div style="font-weight:700; font-size:13px;">PDF / Print Summary</div>
                            <div style="font-size:11px; opacity:0.8;">Print current screen as PDF</div>
                        </div>
                    </div>
                </a>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        window.positionPopupNearClick(content, event, 380);
    };

    window.closeExportModal = function() {
        const modal = document.getElementById('export-modal');
        if (modal) modal.remove();
    };

    // Update click listener to catch backup clicks
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        
        if (href && href.includes('/api/backup/')) {
            localStorage.setItem('lastBackupDate', Date.now());
            const reminder = document.getElementById('backup-reminder');
            if (reminder) reminder.remove();
        }
    }, true);

    // 8. Global Select All Logic for Tables
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target.tagName.toLowerCase() === 'input' && target.type === 'checkbox') {
            const th = target.closest('th');
            if (th) {
                const table = target.closest('table');
                if (table) {
                    const isChecked = target.checked;
                    const tbodyCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
                    tbodyCheckboxes.forEach(cb => {
                        cb.checked = isChecked;
                    });
                }
            }
        }
    });

    // 9. Mobile responsive hamburger menu dynamic insertion
    const header = document.querySelector('header');
    if (header && !header.querySelector('.hamburger-menu')) {
        const nav = header.querySelector('.nav-links');
        if (nav) {
            const burger = document.createElement('button');
            burger.className = 'hamburger-menu';
            burger.innerHTML = '<i class="fas fa-bars"></i>';
            burger.setAttribute('aria-label', 'Toggle Navigation');
            
            header.appendChild(burger);
            
            burger.addEventListener('click', (e) => {
                e.stopPropagation();
                nav.classList.toggle('active');
                const isOpened = nav.classList.contains('active');
                burger.innerHTML = isOpened ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
            });
            
            // Close nav when clicking outside
            document.addEventListener('click', (e) => {
                if (nav.classList.contains('active') && !nav.contains(e.target) && !burger.contains(e.target)) {
                    nav.classList.remove('active');
                    burger.innerHTML = '<i class="fas fa-bars"></i>';
                }
            });
        }
    }

    // 10. Sidebar remains in-place for seamless desktop-equivalent layout on mobile
});

// --- CENTRAL DROPDOWN MANAGER UTILITIES ---
window.dropdownCache = null;

window.clearDropdownCache = function() {
    window.dropdownCache = null;
};

window.fetchDropdownOptions = async function() {
    if (window.dropdownCache) return window.dropdownCache;
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const API_BASE = (window.location.protocol === 'file:' || isLocalhost) ? 'http://localhost:5000/api' : window.location.origin + '/api';
        
        const res = await fetch(`${API_BASE}/dropdowns?activeOnly=true&_t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            window.dropdownCache = data;
            return data;
        }
    } catch (err) {
        console.error("Error fetching dropdown options:", err);
    }
    return [];
};

window.populateDropdown = async function(dropdownKey, selectOrId, currentValue = null, hasEmptyOption = false, emptyText = '', emptyValue = '') {
    const select = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
    if (!select) return;
    
    const options = await window.fetchDropdownOptions();
    const filtered = options.filter(o => o.dropdownKey === dropdownKey);
    
    select.innerHTML = '';
    
    if (hasEmptyOption) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = emptyValue;
        emptyOpt.textContent = emptyText || '';
        if (currentValue === emptyValue) {
            emptyOpt.selected = true;
        }
        select.appendChild(emptyOpt);
    }
    
    if (dropdownKey === 'order_status' && select.id === 'filter-status') {
        const notDeliveredOpt = document.createElement('option');
        notDeliveredOpt.value = 'Not Delivered';
        notDeliveredOpt.textContent = 'Not Delivered';
        if (currentValue === 'Not Delivered' || currentValue === 'not_delivered') {
            notDeliveredOpt.selected = true;
        }
        select.appendChild(notDeliveredOpt);
    }
    
    if (filtered.length === 0) {
        const defaultFallbacks = {
            'order_status': ['New', 'In Production', 'Complete', 'On Hold', 'Try In', 'Cancelled', 'Delivered'],
            'hold_reason': ['Design not clear', 'Doctors Confirmation', 'Improper Impression', 'Payment Pending', 'Work Order Incomplete'],
            'order_priority': ['ASAP', 'Expedite Service', 'Normal', 'Urgent', 'Very Urgent'],
            'shipment_partner': ['LOGISTICS TEAM', 'Courier', 'Delivery Boy', 'Doctors Pickup', 'Mail']
        };
        if (defaultFallbacks[dropdownKey]) {
            defaultFallbacks[dropdownKey].forEach(val => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                if (currentValue !== null && val === currentValue && currentValue !== emptyValue) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
        }
    } else {
        filtered.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.optionValue;
            opt.textContent = o.optionLabel;
            if (currentValue !== null && o.optionValue === currentValue && currentValue !== emptyValue) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }
};

window.populateRadioButtons = async function(dropdownKey, containerId, name, currentValue = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const options = await window.fetchDropdownOptions();
    const filtered = options.filter(o => o.dropdownKey === dropdownKey);
    
    container.innerHTML = '';
    filtered.forEach((o, idx) => {
        const label = document.createElement('label');
        label.style.marginRight = '10px';
        label.style.cursor = 'pointer';
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.gap = '4px';
        
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = o.optionValue;
        if (currentValue === o.optionValue || (currentValue === null && idx === 0)) {
            input.checked = true;
        }
        
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + o.optionLabel));
        container.appendChild(label);
    });
};

window.getDropdownOptionsHtml = function(dropdownKey, selectedValue = null) {
    if (!window.dropdownCache) return '';
    const filtered = window.dropdownCache.filter(o => o.dropdownKey === dropdownKey);
    return filtered.map(o => `<option value="${o.optionValue}" ${selectedValue === o.optionValue ? 'selected' : ''}>${o.optionLabel}</option>`).join('');
};

// Global Dropdown Toolbar Click & Position Handler
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.dropdown-toolbar button, .dropdown-toolbar .btn-toolbar, .dropdown-toolbar');
    const toolbar = btn ? btn.closest('.dropdown-toolbar') : null;
    
    if (toolbar) {
        const content = toolbar.querySelector('.dropdown-content');
        if (content) {
            e.stopPropagation();
            const isOpen = toolbar.classList.contains('active');
            
            // Close all open dropdowns
            document.querySelectorAll('.dropdown-toolbar.active').forEach(d => {
                d.classList.remove('active');
                const c = d.querySelector('.dropdown-content');
                if (c) c.style.display = '';
            });
            
            if (!isOpen) {
                toolbar.classList.add('active');
                
                // Position dropdown-content
                const rect = toolbar.getBoundingClientRect();
                const menuWidth = Math.max(180, content.offsetWidth || 180);
                
                // Calculate left positioning to stay within viewport bounds
                let leftPos = rect.left;
                if (leftPos + menuWidth > window.innerWidth - 10) {
                    leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
                }
                
                // Find containing block (nearest ancestor with transform)
                let containingBlock = null;
                let scale = 1.0;
                let parent = toolbar.parentElement;
                while (parent && parent !== document.documentElement) {
                    const style = window.getComputedStyle(parent);
                    const transform = style.transform || style.webkitTransform || style.mozTransform;
                    if (transform && transform !== 'none') {
                        containingBlock = parent;
                        const matrix = transform.match(/^matrix\(([^,]*),/);
                        if (matrix && matrix[1]) {
                            scale = parseFloat(matrix[1]) || 1.0;
                        }
                        break;
                    }
                    parent = parent.parentElement;
                }
                
                content.style.position = 'fixed';
                content.style.zIndex = '100005';
                
                if (containingBlock) {
                    const parentRect = containingBlock.getBoundingClientRect();
                    content.style.top = ((rect.bottom - parentRect.top + 4) / scale) + 'px';
                    content.style.left = ((leftPos - parentRect.left) / scale) + 'px';
                } else {
                    content.style.top = (rect.bottom + 4) + 'px';
                    content.style.left = leftPos + 'px';
                }
                content.style.display = 'block';
            }
            return;
        }
    }
    
    // Click outside -> close any open dropdowns
    document.querySelectorAll('.dropdown-toolbar.active').forEach(d => {
        d.classList.remove('active');
        const content = d.querySelector('.dropdown-content');
        if (content) content.style.display = '';
    });
});

// Global Page Zoom Utility (Manual UI Triggers Only)
(function() {
    window.globalPageZoom = 1.0;

    window.setGlobalPageZoom = function(val) {
        window.globalPageZoom = Math.min(Math.max(val, 0.4), 3.0);
        
        const container = document.querySelector('.reports-content') || document.querySelector('#report-viewer-content') || document.querySelector('main') || document.querySelector('.main-container');
        if (container) {
            container.style.zoom = window.globalPageZoom;
            if (!('zoom' in container.style)) {
                container.style.transform = `scale(${window.globalPageZoom})`;
                container.style.transformOrigin = 'top left';
            }
        }
        
        const label = document.getElementById('report-zoom-val');
        if (label) {
            label.textContent = `${Math.round(window.globalPageZoom * 100)}%`;
        }
    };
})();

// Universal Order Quick View Modal (Matching Reference Screenshot)
window.openOrderQuickView = async function(orderId) {
    if (!orderId) return;
    try {
        let order = (window.allFetchedData || window.currentData || []).find(o => String(o.id) === String(orderId) || String(o.orderId) === String(orderId) || (o.order && String(o.order.id) === String(orderId)));
        if (order && order.order) order = order.order;
        
        if (!order || !order.client) {
            const apiBase = (typeof window.API_BASE !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : (window.location.origin + '/api'));
            const res = await fetch(`${apiBase}/orders/${orderId}`);
            if (res.ok) order = await res.json();
        }
        if (!order) {
            alert('Order details not found');
            return;
        }

        const formatShortDate = (d) => {
            if (!d) return '';
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '';
            const day = String(dt.getDate()).padStart(2, '0');
            const mon = String(dt.getMonth() + 1).padStart(2, '0');
            const yr = String(dt.getFullYear()).slice(-2);
            return `${day}/${mon}/${yr}`;
        };

        const clientName = order.client ? (order.client.name || '') : (order.clientName || '');
        const pName = order.patientName ? order.patientName.trim().toUpperCase() : '';
        const charge = (order.grossAmount !== undefined && order.grossAmount !== null && order.grossAmount !== '') ? order.grossAmount : ((order.totalAmount !== undefined && order.totalAmount !== null && order.totalAmount !== '') ? order.totalAmount : (order.price || order.charge || 0));
        const addAmnt = order.discountAmount || order.additionalAmount || order.addAmount || 0;
        const oDate = formatShortDate(order.receivedDate || order.orderDate || order.createdAt);
        const modelNo = order.modelNumber ? String(order.modelNumber).trim() : (order.modelNo || '');
        
        let shade = order.shade || '';
        if (!shade && (order.shade1 || order.shade2 || order.shade3 || order.shadeMain)) {
            shade = [order.shadeMain, order.shade1, order.shade2, order.shade3].filter(Boolean).join(', ');
        }
        const shadeNotes = order.shadeNotes || order.notes || '';
        const dueDate = formatShortDate(order.dueDate);
        const dateIn = formatShortDate(order.receivedDate || order.dateIn || order.createdAt);
        const invoiceNo = order.invoice ? (order.invoice.invoiceNumber || order.invoice.id) : (order.invoiceNumber || order.invoiceNo || order.invoiceId || '');
        const shipmentNo = order.shipmentNote ? (order.shipmentNote.noteNumber || order.shipmentNote.id) : (order.shipmentNumber || order.shipmentNo || order.shipmentNoteId || '');
        const articulatorTag = order.articulatorTag || '';
        const priority = order.priority || '';
        const priceBand = order.priceBand || (order.client ? order.client.priceBand : '') || '';
        const delivery = order.deliveryMethod || order.deliveryAgent || order.delivery || (order.client ? (order.client.route || order.client.city) : '') || '';
        const statusDate = formatShortDate(order.updatedAt || order.receivedDate || order.createdAt);
        const statusStr = `${order.status || 'New'} - ${statusDate}`;
        const holdReason = order.holdReason || order.onHoldReason || '';

        let modal = document.getElementById('order-quick-view-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'order-quick-view-modal';
            modal.dataset.noAnchor = 'true';
            modal.className = 'modal-overlay center-modal';
            modal.style.cssText = 'display:flex !important; position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; background:rgba(0,0,0,0.35) !important; z-index:10000001 !important; justify-content:center !important; align-items:center !important;';
            modal.onclick = function(e) { if (e.target === modal) window.closeOrderQuickView(); };
            modal.innerHTML = `
                <div style="position: relative !important; margin: auto !important; width: 380px; max-width: 95vw; background: #fff; border-radius: 4px; box-shadow: 0 6px 25px rgba(0,0,0,0.35); overflow: hidden; font-family: Arial, Helvetica, sans-serif; z-index: 10000002; border: 1px solid #707070;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px 8px 14px; border-bottom: 1px solid #e0e0e0; background: #fff;">
                        <span id="qv-order-title" style="font-size: 15px; font-weight: bold; color: #000;"></span>
                        <span onclick="window.closeOrderQuickView()" style="cursor: pointer; font-size: 20px; color: #bbb; font-weight: bold; line-height: 1;" onmouseover="this.style.color='#d00'" onmouseout="this.style.color='#bbb'">&times;</span>
                    </div>
                    <div style="padding: 10px 14px 14px 14px; background: #fff; max-height: 80vh; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; border: 1px solid #707070;">
                            <tbody id="qv-table-body">
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.dataset.noAnchor = 'true';
            modal.className = 'modal-overlay center-modal';
            modal.style.setProperty('display', 'flex', 'important');
            modal.style.setProperty('justify-content', 'center', 'important');
            modal.style.setProperty('align-items', 'center', 'important');
            const innerBox = modal.firstElementChild;
            if (innerBox) {
                innerBox.style.setProperty('position', 'relative', 'important');
                innerBox.style.setProperty('margin', 'auto', 'important');
                innerBox.style.removeProperty('top');
                innerBox.style.removeProperty('left');
                innerBox.style.removeProperty('transform');
            }
        }

        document.getElementById('qv-order-title').textContent = `Order # ${order.orderNumber || order.id}`;
        const tbody = document.getElementById('qv-table-body');
        
        const rows = [
            { label: 'Client', val: clientName.toUpperCase() },
            { label: 'Patient', val: pName },
            { label: 'Charge', val: typeof charge === 'number' ? charge.toFixed(0) : charge },
            { label: 'Add. Amnt', val: typeof addAmnt === 'number' ? addAmnt.toFixed(0) : addAmnt },
            { label: 'Order Date', val: oDate },
            { label: 'Model #', val: modelNo },
            { label: 'Shade', val: shade },
            { label: 'Shade Notes', val: shadeNotes },
            { label: 'Due Date', val: dueDate },
            { label: 'Date In', val: dateIn },
            { label: 'Invoice #', val: invoiceNo },
            { label: 'Shipment #', val: shipmentNo },
            { label: 'Articulator Tag', val: articulatorTag },
            { label: 'Priority', val: priority },
            { label: 'Price Band', val: priceBand },
            { label: 'Delivery', val: delivery },
            { label: 'Status', val: statusStr }
        ];

        if (holdReason || order.status === 'Hold' || order.status === 'On Hold') {
            rows.push({ label: 'Hold Reason', val: holdReason });
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td style="width: 110px; border: 1px solid #707070; padding: 3px 6px; font-weight: normal; color: #000; font-family: Arial, sans-serif;">${r.label}</td>
                <td style="border: 1px solid #707070; padding: 3px 6px; color: #000; font-family: Arial, sans-serif;">${r.val || ''}</td>
            </tr>
        `).join('');

        modal.style.display = 'flex';
    } catch (err) {
        console.error('Error opening quick view:', err);
    }
};

window.closeOrderQuickView = function() {
    const modal = document.getElementById('order-quick-view-modal');
    if (modal) modal.style.display = 'none';
};



