(function () {
    function shouldMakeSearchable(select) {
        if (!select) return false;
        if (select.tagName !== 'SELECT') return false;
        if (select.classList.contains('no-searchable')) return false;
        if (select.id && select.id.startsWith('serial-gen-')) return false;
        if (select.id === 'modal-technician-select' || select.id === 'modal-client-select') return false;
        if (select.closest('#eo-technician-note-modal') || select.closest('#eo-client-note-modal')) return false;

        // Skip settings boxes, column customizers, and data-table header sorting
        if (
            select.closest('#client-grid-settings-modal') ||
            select.closest('#grid-settings-modal') ||
            select.closest('#grid-fields-modal') ||
            select.closest('.settings-section-box') ||
            select.closest('#accounts-grid-settings-box') ||
            select.closest('#shipments-grid-settings-box') ||
            select.closest('.grid-display-settings') ||
            select.closest('.data-table') ||
            select.classList.contains('tb-select')
        ) {
            return false;
        }

        const id = (select.id || '').toLowerCase();
        const name = (select.name || '').toLowerCase();
        const filter = (select.getAttribute('data-filter') || '').toLowerCase();
        const className = (select.className || '').toLowerCase();

        // Skip non-client / non-supplier options and dates
        if (
            id.startsWith('opt-') ||
            id.startsWith('ord-') ||
            id.startsWith('shp-') ||
            id.startsWith('inv-') ||
            id.startsWith('rec-') ||
            (id.startsWith('exp-') && !id.includes('paid')) ||
            id.includes('date') ||
            id.includes('range') ||
            id.includes('preset') ||
            id.includes('sort') ||
            id.includes('add-field') ||
            id.includes('status') ||
            id.includes('technician') ||
            name.includes('status') ||
            filter.includes('status')
        ) {
            return false;
        }

        // Target client / doctor / supplier / paid_to selectors and explicit searchable-select
        const isClientRelated =
            select.classList.contains('searchable-select') ||
            className.includes('searchable-select') ||
            id === 'p-client' ||
            id === 'filter-client' ||
            id === 'client-select' ||
            id === 'clientid' ||
            id === 'client_id' ||
            id === 'search-client-select' ||
            id === 'new-pickup-client' ||
            id === 'pickup-filter-client' ||
            id.includes('client') ||
            name === 'clientid' ||
            name === 'client_id' ||
            name.includes('client') ||
            id.includes('paid-to') ||
            id.includes('paid_to') ||
            name.includes('paid-to') ||
            name.includes('paid_to') ||
            id.includes('supplier-select') ||
            id.includes('supplier');

        return isClientRelated;
    }

    // Universal Searchable Select Enhancer
    function makeSearchable(select) {
        if (!select) return;
        if (select.classList.contains('no-searchable')) return;
        if (select.id === 'modal-technician-select' || select.id === 'modal-client-select') return;
        if (select.closest('#eo-technician-note-modal') || select.closest('#eo-client-note-modal')) return;
        if (!shouldMakeSearchable(select)) return;
        if (select.dataset.searchableInitialized) {
            if (typeof select._searchableSync === 'function') {
                select._searchableSync();
            }
            return;
        }
        select.dataset.searchableInitialized = 'true';

        // Detect Form vs Toolbar style
        const isFormStyle =
            select.id === 'p-client' ||
            select.classList.contains('searchable-form-select') ||
            select.closest('.card') ||
            select.closest('form') ||
            select.closest('#payment-modal') ||
            select.closest('#expense-modal') ||
            select.closest('.modal-content') ||
            (select.style && select.style.padding && select.style.padding.includes('8px'));

        // Create wrapper element
        const wrapper = document.createElement('div');
        wrapper.className = 'searchable-select-container';
        wrapper.style.position = 'relative';
        wrapper.style.display = isFormStyle ? 'block' : 'inline-block';

        const origWidth = select.style.width || select.getAttribute('width');
        if (select.id === 'filter-client') {
            wrapper.style.width = '386px';
            wrapper.style.maxWidth = '100%';
        } else if (origWidth) {
            wrapper.style.width = origWidth;
        } else if (isFormStyle) {
            wrapper.style.width = '100%';
        } else if (select.offsetWidth) {
            wrapper.style.width = select.offsetWidth + 'px';
        } else {
            wrapper.style.width = '100%';
        }

        // Insert wrapper before select
        if (select.parentNode) {
            select.parentNode.insertBefore(wrapper, select);
            wrapper.appendChild(select);
        }

        // Hide original select
        select.style.display = 'none';

        // Create custom control box
        const control = document.createElement('div');
        control.className = 'searchable-select-control';
        control.tabIndex = 0;
        control.style.background = '#ffffff';
        control.style.boxSizing = 'border-box';
        control.style.cursor = 'pointer';
        control.style.display = 'flex';
        control.style.alignItems = 'center';
        control.style.justifyContent = 'space-between';
        control.style.userSelect = 'none';
        control.style.overflow = 'hidden';

        if (isFormStyle) {
            control.style.border = '1px solid #d1d5db';
            control.style.borderRadius = '4px';
            control.style.padding = '8px 12px';
            control.style.minHeight = '38px';
            control.style.fontSize = '13.5px';
            control.style.fontFamily = 'inherit';
            control.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        } else {
            control.style.border = '1px solid #707070';
            control.style.borderRadius = '2px';
            control.style.padding = '2px 6px';
            control.style.height = select.style.height || '22px';
            control.style.fontSize = select.style.fontSize || '12px';
            control.style.fontFamily = 'Arial, sans-serif';
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'searchable-select-label';
        labelSpan.style.overflow = 'hidden';
        labelSpan.style.textOverflow = 'ellipsis';
        labelSpan.style.whiteSpace = 'nowrap';
        labelSpan.style.color = '#333';
        labelSpan.style.fontWeight = '500';

        const arrowSpan = document.createElement('span');
        arrowSpan.innerHTML = '&#9660;';
        arrowSpan.style.fontSize = isFormStyle ? '10px' : '9px';
        arrowSpan.style.marginLeft = '8px';
        arrowSpan.style.color = '#64748b';
        arrowSpan.style.flexShrink = '0';

        control.appendChild(labelSpan);
        control.appendChild(arrowSpan);
        wrapper.appendChild(control);

        // Create Dropdown Menu
        const menu = document.createElement('div');
        menu.className = 'searchable-select-menu';
        menu.style.display = 'none';
        menu.style.position = 'absolute';
        menu.style.top = isFormStyle ? 'calc(100% + 4px)' : '100%';
        menu.style.left = '0';
        menu.style.width = '100%';
        menu.style.minWidth = isFormStyle ? '100%' : '260px';
        menu.style.maxHeight = '320px';
        menu.style.background = '#ffffff';
        menu.style.border = '1px solid #cbd5e1';
        menu.style.borderRadius = isFormStyle ? '6px' : '2px';
        menu.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.08)';
        menu.style.zIndex = '1000002';
        menu.style.boxSizing = 'border-box';
        menu.style.overflow = 'hidden';

        // Sticky Search Box at top
        const searchBox = document.createElement('div');
        searchBox.style.padding = isFormStyle ? '8px' : '4px';
        searchBox.style.background = '#f8fafc';
        searchBox.style.borderBottom = '1px solid #e2e8f0';
        searchBox.style.position = 'sticky';
        searchBox.style.top = '0';
        searchBox.style.zIndex = '10';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = isFormStyle ? '🔍 Search client name or code...' : '🔍 Type to search...';
        searchInput.style.width = '100%';
        searchInput.style.padding = isFormStyle ? '7px 10px' : '4px 6px';
        searchInput.style.border = '1.5px solid #3b82f6';
        searchInput.style.borderRadius = isFormStyle ? '4px' : '2px';
        searchInput.style.fontSize = isFormStyle ? '13px' : '12px';
        searchInput.style.fontFamily = isFormStyle ? 'inherit' : 'Arial, sans-serif';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.outline = 'none';
        searchInput.style.background = '#ffffff';

        searchBox.appendChild(searchInput);
        menu.appendChild(searchBox);

        // Options List Container
        const list = document.createElement('div');
        list.className = 'searchable-select-list';
        list.style.maxHeight = isFormStyle ? '240px' : '200px';
        list.style.overflowY = 'auto';
        menu.appendChild(list);

        // No results placeholder
        const noResults = document.createElement('div');
        noResults.style.display = 'none';
        noResults.style.padding = '12px';
        noResults.style.textAlign = 'center';
        noResults.style.color = '#94a3b8';
        noResults.style.fontSize = '12.5px';
        noResults.textContent = 'No matching clients found';
        list.appendChild(noResults);

        wrapper.appendChild(menu);

        let activeHighlightedIndex = -1;

        function syncFromSelect() {
            list.innerHTML = '';
            list.appendChild(noResults);
            noResults.style.display = 'none';

            const selectedOpt = select.options[select.selectedIndex];
            labelSpan.textContent = selectedOpt ? selectedOpt.text : '-- Select Client --';
            if (!select.value) {
                labelSpan.style.color = '#64748b';
            } else {
                labelSpan.style.color = '#111827';
            }

            Array.from(select.options).forEach((opt) => {
                const item = document.createElement('div');
                item.className = 'searchable-select-item';
                item.textContent = opt.text;
                item.dataset.value = opt.value;
                item.style.padding = isFormStyle ? '7px 12px' : '4px 8px';
                item.style.fontSize = isFormStyle ? '13px' : '12px';
                item.style.fontFamily = isFormStyle ? 'inherit' : 'Arial, sans-serif';
                item.style.cursor = 'pointer';
                item.style.whiteSpace = 'nowrap';
                item.style.overflow = 'hidden';
                item.style.textOverflow = 'ellipsis';
                item.style.borderBottom = '1px solid #f8fafc';

                if (opt.selected) {
                    item.style.background = '#2563eb';
                    item.style.color = '#ffffff';
                    item.style.fontWeight = '600';
                }

                item.addEventListener('mouseenter', () => {
                    if (!opt.selected) {
                        item.style.background = '#eff6ff';
                        item.style.color = '#1d4ed8';
                    }
                });
                item.addEventListener('mouseleave', () => {
                    if (!opt.selected) {
                        item.style.background = '#ffffff';
                        item.style.color = '#111827';
                    }
                });

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    labelSpan.textContent = opt.text;
                    labelSpan.style.color = opt.value ? '#111827' : '#64748b';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    closeMenu();
                });

                list.appendChild(item);
            });
        }

        // Live Search Filter
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const items = list.querySelectorAll('.searchable-select-item');
            let visibleCount = 0;
            items.forEach(item => {
                const txt = item.textContent.toLowerCase();
                const matches = txt.includes(query);
                item.style.display = matches ? 'block' : 'none';
                if (matches) visibleCount++;
            });
            noResults.style.display = visibleCount === 0 ? 'block' : 'none';
            activeHighlightedIndex = -1;
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const visibleItems = Array.from(list.querySelectorAll('.searchable-select-item')).filter(i => i.style.display !== 'none');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (visibleItems.length > 0) {
                    activeHighlightedIndex = (activeHighlightedIndex + 1) % visibleItems.length;
                    updateHighlight(visibleItems);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (visibleItems.length > 0) {
                    activeHighlightedIndex = (activeHighlightedIndex - 1 + visibleItems.length) % visibleItems.length;
                    updateHighlight(visibleItems);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeHighlightedIndex >= 0 && visibleItems[activeHighlightedIndex]) {
                    visibleItems[activeHighlightedIndex].click();
                } else if (visibleItems.length === 1) {
                    visibleItems[0].click();
                }
            } else if (e.key === 'Escape') {
                closeMenu();
            }
        });

        function updateHighlight(visibleItems) {
            visibleItems.forEach((item, idx) => {
                if (idx === activeHighlightedIndex) {
                    item.style.background = '#3b82f6';
                    item.style.color = '#ffffff';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    const isSelected = item.dataset.value === select.value;
                    item.style.background = isSelected ? '#2563eb' : '#ffffff';
                    item.style.color = isSelected ? '#ffffff' : '#111827';
                }
            });
        }

        function openMenu() {
            document.querySelectorAll('.searchable-select-menu').forEach(m => m.style.display = 'none');
            syncFromSelect();
            menu.style.display = 'block';
            searchInput.value = '';
            const items = list.querySelectorAll('.searchable-select-item');
            items.forEach(i => i.style.display = 'block');
            noResults.style.display = 'none';
            activeHighlightedIndex = -1;
            setTimeout(() => {
                searchInput.focus();
            }, 50);
        }

        function closeMenu() {
            menu.style.display = 'none';
        }

        control.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.style.display === 'block') closeMenu();
            else openMenu();
        });

        control.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                openMenu();
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) closeMenu();
        });

        const observer = new MutationObserver(() => {
            syncFromSelect();
        });
        observer.observe(select, { childList: true, subtree: true });

        select.addEventListener('change', syncFromSelect);
        select._searchableSync = syncFromSelect;
        syncFromSelect();
    }

    window.EXPENSE_PAID_TO_OPTIONS = [
        "ABHIJITH SALARY",
        "AL FARSI",
        "AL MAZROUI",
        "AL MAZROUI MEDICAL",
        "AL SALA",
        "AL SAWARI PHARMA & MEDICAL",
        "AL SHAMIL LAB",
        "ALIF",
        "ALIF MEDICAL SUPPLIERS",
        "ALNA SALARY",
        "ANISH SALARY",
        "ASAINAR SALARY",
        "AUDITING",
        "AZZAN AL BADI",
        "Bank Ac",
        "BANK CHARGES",
        "BIJU NIZWA SALARY",
        "Cash",
        "CELEBERATIONS",
        "CHINA",
        "CLEANER SALARY",
        "COCHIN DENTAL EQUIPS",
        "COURIER",
        "CUSTOMS & CLEARANCE",
        "DENTAL MATERIALS LOCAL PURCHASING",
        "DENTROM",
        "DRINKING WATER",
        "ELECTRIC BILL MONTHLY",
        "ELECTRICAL ITEMS",
        "EMJAY ENTERPRISES",
        "ENTERTAINMENT",
        "FASTCO COURIER",
        "FEDEX",
        "FIRST AID PRODUCTS",
        "FITNESS",
        "FLIGHT TICKET",
        "FURNITURE-S",
        "GIFT",
        "GOVT LICENCES",
        "GOVTTAX",
        "GSM BILL PAYMENT",
        "GYPSUM",
        "HI DENT",
        "HIDENT",
        "HOSPILAND",
        "HOSPILAND HEALTHCARE",
        "HOTEL BILLOENTAL CONFERENCE",
        "IN-HOUSE",
        "INDIA",
        "JITHU SALARY",
        "KAFALAT",
        "LAB EQUIPMENT PURCHASING",
        "LAB EQUIPMENT REPAIR",
        "LAB MACHINARY PARTS",
        "LAB MAINTENANCE",
        "LAB MATERIALS",
        "LPG GAS",
        "MARKETING",
        "MEDICAL",
        "MEDICINE",
        "MISCELLANEOUS",
        "OFFICE SUPPLIES",
        "OMANI STAFF SALARY",
        "OXYGEN AND ACETYLENE",
        "PAKISTAN",
        "PARCEL",
        "PARKING & FINES",
        "PARTNERS EXPENSE",
        "PETROL",
        "PETROL PAJERO",
        "PLUMBER PAYMENT",
        "PRINTING",
        "PRO EXPENSES",
        "RAMESH SALARY (RAVI)",
        "REFRESHMENT",
        "RENEWALS",
        "RENT FOR LAB",
        "RENT FOR STAFF ACCOMODATION",
        "RENT FOR VARGHESE ACCOMODATION",
        "SAFETY TOOLS",
        "Sample Dental Supplier",
        "SHAMS AL JEEL",
        "SPORTS ACTIVITIES",
        "STAFF INSURANCE",
        "STAFF OVER TIME",
        "STAFF PERSONAL EXPENSE",
        "STAFF SPORTS & ENTERTAINMENT",
        "STAFF TRAINING",
        "STAFF VISA",
        "STATIONERY",
        "STELLA SALARY",
        "SUHULZAKUIT",
        "SUNIL SALARY",
        "TAWAZON MEDICAL SUPPLIES",
        "TAX PAYMENTS",
        "TELEPHONE BILL",
        "THE UNITED DENTAL SUPPLY CO.",
        "TRASPORTATION",
        "TRAVEL & VISA",
        "TRAVEL LOUNGE",
        "VARUGHESE SALARY",
        "VEHICLE",
        "VEHICLE FINE",
        "VEHICLE LOAN",
        "VEHICLE MAINTENANCE",
        "VEHICLE MAINTENANCE VARUGHESE",
        "WATER BILLS MONTHLY",
        "WIFI",
        "WORK DONE ABROAD"
    ];

    window.makeSelectSearchable = makeSearchable;

    let isInitializing = false;
    let observerTimeout = null;
    let bodyObserver = null;

    window.initSearchableSelects = function () {
        if (isInitializing) return;

        const uninitialized = Array.from(document.querySelectorAll('select')).filter(s => !s.dataset.searchableInitialized);
        if (uninitialized.length === 0) return;

        isInitializing = true;
        if (bodyObserver) bodyObserver.disconnect();

        try {
            uninitialized.forEach(select => {
                if (shouldMakeSearchable(select)) {
                    makeSearchable(select);
                } else {
                    select.dataset.searchableInitialized = 'true';
                }
            });
        } finally {
            isInitializing = false;
            if (bodyObserver) {
                bodyObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        bodyObserver = new MutationObserver(() => {
            if (observerTimeout) clearTimeout(observerTimeout);
            observerTimeout = setTimeout(() => {
                window.initSearchableSelects();
            }, 100);
        });

        window.initSearchableSelects();
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    });

    window.openUniversalDatePicker = function(targetInputOrId, presetSelectOrId, onSelectCallback) {
        const targetInput = typeof targetInputOrId === 'string' ? document.getElementById(targetInputOrId) : targetInputOrId;
        if (!targetInput) return;

        if (typeof window.openGlobalDatePicker === 'function') {
            window.openGlobalDatePicker(window.event, targetInput);
            return;
        }

        if (typeof window.openClassicDatePicker === 'function') {
            window.openClassicDatePicker(window.event, targetInput);
            return;
        }
    };
})();
