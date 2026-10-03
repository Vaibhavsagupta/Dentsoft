/**
 * Universal Global DatePicker for SDL Lab Software
 * Automatically provides calendar picker for all date inputs across the application.
 */

(function() {
    let activeInput = null;
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let selectedDate = new Date();

    // Create Calendar Popup DOM
    function createCalendarDOM() {
        if (document.getElementById('global-datepicker-popup')) return;

        const style = document.createElement('style');
        style.textContent = `
            #global-datepicker-popup {
                position: absolute;
                display: none;
                background: #ffffff;
                border: 1px solid #707070;
                box-shadow: 0 4px 15px rgba(0,0,0,0.25);
                z-index: 10000000;
                font-family: Arial, Helvetica, sans-serif;
                width: 220px;
                padding: 6px;
                border-radius: 3px;
                user-select: none;
            }
            .gdp-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
                background: #f0f0f0;
                padding: 3px 4px;
                border-bottom: 1px solid #ccc;
            }
            .gdp-nav-btn {
                background: #fff;
                border: 1px solid #707070;
                cursor: pointer;
                padding: 1px 5px;
                font-size: 11px;
                font-weight: bold;
                color: #000066;
                border-radius: 2px;
            }
            .gdp-nav-btn:hover {
                background: #e0e0e0;
            }
            .gdp-selectors {
                display: flex;
                gap: 3px;
            }
            .gdp-select {
                font-size: 11px;
                font-family: Arial, sans-serif;
                border: 1px solid #707070;
                background: #fff;
                padding: 1px 2px;
                height: 20px;
            }
            .gdp-weekdays {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                text-align: center;
                font-size: 10.5px;
                font-weight: bold;
                color: #000066;
                margin-bottom: 3px;
                border-bottom: 1px solid #eee;
                padding-bottom: 2px;
            }
            .gdp-grid {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 1px;
                text-align: center;
                font-size: 11px;
            }
            .gdp-day {
                padding: 3px 0;
                cursor: pointer;
                border-radius: 2px;
                color: #000;
            }
            .gdp-day:hover {
                background: #dbeafe;
                color: #0056b3;
            }
            .gdp-day.other-month {
                color: #aaa;
            }
            .gdp-day.today {
                font-weight: bold;
                border: 1px solid #0056b3;
            }
            .gdp-day.selected {
                background: #000066;
                color: #fff;
                font-weight: bold;
            }
            .gdp-footer {
                display: flex;
                justify-content: space-between;
                margin-top: 5px;
                padding-top: 4px;
                border-top: 1px solid #eee;
            }
            .gdp-footer-btn {
                background: #fff;
                border: 1px solid #707070;
                padding: 1px 6px;
                font-size: 10.5px;
                cursor: pointer;
                color: #000066;
                border-radius: 2px;
            }
            .gdp-footer-btn:hover {
                background: #f0f0f0;
            }
            .date-input-with-icon {
                position: relative;
                display: inline-flex;
                align-items: center;
            }
            .date-input-icon {
                position: absolute;
                right: 5px;
                color: #000066;
                cursor: pointer;
                font-size: 13px;
                pointer-events: auto;
            }
        `;
        document.head.appendChild(style);

        const popup = document.createElement('div');
        popup.id = 'global-datepicker-popup';
        popup.innerHTML = `
            <div class="gdp-header">
                <button type="button" class="gdp-nav-btn" id="gdp-btn-prev">&lt;</button>
                <div class="gdp-selectors">
                    <select class="gdp-select no-searchable" id="gdp-select-month">
                        <option value="0">Jan</option>
                        <option value="1">Feb</option>
                        <option value="2">Mar</option>
                        <option value="3">Apr</option>
                        <option value="4">May</option>
                        <option value="5">Jun</option>
                        <option value="6">Jul</option>
                        <option value="7">Aug</option>
                        <option value="8">Sep</option>
                        <option value="9">Oct</option>
                        <option value="10">Nov</option>
                        <option value="11">Dec</option>
                    </select>
                    <select class="gdp-select no-searchable" id="gdp-select-year"></select>
                </div>
                <button type="button" class="gdp-nav-btn" id="gdp-btn-next">&gt;</button>
            </div>
            <div class="gdp-weekdays">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div class="gdp-grid" id="gdp-days-grid"></div>
            <div class="gdp-footer">
                <button type="button" class="gdp-footer-btn" id="gdp-btn-today">Today</button>
                <button type="button" class="gdp-footer-btn" id="gdp-btn-clear">Clear</button>
                <button type="button" class="gdp-footer-btn" id="gdp-btn-close">Close</button>
            </div>
        `;
        document.body.appendChild(popup);

        // Populate Years
        const yearSelect = document.getElementById('gdp-select-year');
        const startY = 1990;
        const endY = new Date().getFullYear() + 15;
        for (let y = startY; y <= endY; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }

        // Event handlers
        document.getElementById('gdp-btn-prev').addEventListener('click', (e) => {
            e.stopPropagation();
            changeMonth(-1);
        });
        document.getElementById('gdp-btn-next').addEventListener('click', (e) => {
            e.stopPropagation();
            changeMonth(1);
        });
        document.getElementById('gdp-select-month').addEventListener('change', (e) => {
            e.stopPropagation();
            currentMonth = parseInt(e.target.value);
            renderCalendarGrid();
        });
        document.getElementById('gdp-select-year').addEventListener('change', (e) => {
            e.stopPropagation();
            currentYear = parseInt(e.target.value);
            renderCalendarGrid();
        });
        document.getElementById('gdp-btn-today').addEventListener('click', (e) => {
            e.stopPropagation();
            selectDate(new Date());
        });
        document.getElementById('gdp-btn-clear').addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeInput) {
                activeInput.value = '';
                triggerEvents(activeInput);
            }
            closeCalendar();
        });
        document.getElementById('gdp-btn-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeCalendar();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== activeInput && !e.target.classList.contains('date-input-icon') && !e.target.classList.contains('fa-calendar-days')) {
                closeCalendar();
            }
        });
    }

    function changeMonth(delta) {
        currentMonth += delta;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        } else if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendarGrid();
    }

    function renderCalendarGrid() {
        const monthSelect = document.getElementById('gdp-select-month');
        const yearSelect = document.getElementById('gdp-select-year');
        if (monthSelect) monthSelect.value = currentMonth;
        if (yearSelect) yearSelect.value = currentYear;

        const grid = document.getElementById('gdp-days-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
        const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        const today = new Date();

        // Prev month days
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const cell = document.createElement('div');
            cell.className = 'gdp-day other-month';
            cell.textContent = dayNum;
            const targetDate = new Date(currentYear, currentMonth - 1, dayNum);
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(targetDate);
            });
            grid.appendChild(cell);
        }

        // Current month days
        for (let day = 1; day <= daysInCurrentMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'gdp-day';
            cell.textContent = day;

            const isToday = (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day);
            if (isToday) cell.classList.add('today');

            if (selectedDate && selectedDate.getFullYear() === currentYear && selectedDate.getMonth() === currentMonth && selectedDate.getDate() === day) {
                cell.classList.add('selected');
            }

            const targetDate = new Date(currentYear, currentMonth, day);
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(targetDate);
            });
            grid.appendChild(cell);
        }

        // Next month filler
        const totalCells = firstDayIndex + daysInCurrentMonth;
        const nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
        for (let day = 1; day <= nextDays; day++) {
            const cell = document.createElement('div');
            cell.className = 'gdp-day other-month';
            cell.textContent = day;
            const targetDate = new Date(currentYear, currentMonth + 1, day);
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(targetDate);
            });
            grid.appendChild(cell);
        }
    }

    function parseDateString(str) {
        if (!str || !str.trim()) return new Date();
        const s = str.trim();
        if (s.includes('/')) {
            const parts = s.split('/');
            if (parts.length === 3) {
                let p1 = parseInt(parts[0], 10);
                let p2 = parseInt(parts[1], 10);
                let p3 = parseInt(parts[2], 10);
                if (p3 < 100) p3 += 2000;
                
                // Standard Lab format is DD/MM/YY (e.g. 01/09/26 = 1st Sep 2026)
                if (p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
                    return new Date(p3, p2 - 1, p1);
                } else if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
                    return new Date(p3, p1 - 1, p2);
                }
            }
        } else if (s.includes('-')) {
            const parts = s.split('-');
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                }
            }
        }
        const parsed = new Date(s);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    function formatDateForInput(input, date) {
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const y = date.getFullYear();

        const placeholder = (input.getAttribute('placeholder') || '').toUpperCase();
        const id = (input.id || '').toLowerCase();
        const type = input.getAttribute('type');

        if (type === 'date') {
            const mm = String(m).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            return `${y}-${mm}-${dd}`;
        }

        if (placeholder.includes('M/D/Y') || id.includes('filter-date-val') || id.includes('tb-date')) {
            return `${m}/${d}/${y}`;
        }

        // Default standard format for order/pickup/due dates is DD/MM/YY
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const yy = String(y).slice(-2);
        return `${dd}/${mm}/${yy}`;
    }

    function selectDate(date) {
        if (!activeInput) return;
        selectedDate = new Date(date);
        activeInput.value = formatDateForInput(activeInput, date);
        triggerEvents(activeInput);
        closeCalendar();
    }

    function triggerEvents(input) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof applyDateFilter === 'function' && input.id === 'filter-date-val') {
            const rangeSelect = document.getElementById('date-range-select');
            if (rangeSelect && rangeSelect.value !== 'User Specified') {
                rangeSelect.value = 'User Specified';
            }
            applyDateFilter();
        }
    }

    function openCalendar(e, input) {
        if (e) e.stopPropagation();
        createCalendarDOM();
        activeInput = input;

        const val = input.value || input.textContent || '';
        const parsed = parseDateString(val);
        selectedDate = parsed;
        currentMonth = parsed.getMonth();
        currentYear = parsed.getFullYear();

        renderCalendarGrid();

        const popup = document.getElementById('global-datepicker-popup');
        const rect = input.getBoundingClientRect();
        
        let top = rect.bottom + window.scrollY + 2;
        let left = rect.left + window.scrollX;

        // Ensure popup doesn't render off-screen
        if (left + 230 > window.innerWidth) {
            left = window.innerWidth - 235;
        }

        popup.style.top = top + 'px';
        popup.style.left = left + 'px';
        popup.style.display = 'block';
    }

    function closeCalendar() {
        const popup = document.getElementById('global-datepicker-popup');
        if (popup) popup.style.display = 'none';
        activeInput = null;
    }

    // --- Classic Native-style TimePicker Component ---
    let activeTimeInput = null;

    function createTimePickerDOM() {
        if (document.getElementById('global-timepicker-popup')) return;

        const style = document.createElement('style');
        style.textContent = `
            #global-timepicker-popup {
                position: absolute;
                display: none;
                background: #ffffff;
                border: 1px solid #767676;
                box-shadow: 0 4px 14px rgba(0,0,0,0.25);
                z-index: 9999999;
                font-family: Arial, Helvetica, sans-serif;
                width: 90px;
                padding: 2px;
                user-select: none;
                box-sizing: border-box;
            }
            .gtp-top-display {
                display: flex;
                gap: 2px;
                margin-bottom: 2px;
            }
            .gtp-sel-box {
                flex: 1;
                background: #0078d7;
                color: #ffffff;
                font-size: 13.5px;
                font-weight: bold;
                text-align: center;
                padding: 4px 0;
                border: 1.5px solid #000;
                cursor: pointer;
                box-sizing: border-box;
            }
            .gtp-cols {
                display: flex;
                gap: 2px;
                height: 185px;
            }
            .gtp-list {
                flex: 1;
                overflow-y: auto;
                border: none;
                background: #fff;
                padding: 0;
                scrollbar-width: thin;
            }
            .gtp-list::-webkit-scrollbar {
                width: 4px;
            }
            .gtp-list::-webkit-scrollbar-thumb {
                background: #bbb;
            }
            .gtp-item {
                font-size: 13px;
                text-align: center;
                padding: 3px 0;
                cursor: pointer;
                color: #000;
                font-family: Arial, sans-serif;
            }
            .gtp-item:hover {
                background: #e5f1fb;
            }
            .gtp-item.selected {
                background: #d0e6ff;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);

        const popup = document.createElement('div');
        popup.id = 'global-timepicker-popup';
        popup.innerHTML = `
            <div class="gtp-top-display">
                <div class="gtp-sel-box" id="gtp-sel-hour">00</div>
                <div class="gtp-sel-box" id="gtp-sel-min">00</div>
            </div>
            <div class="gtp-cols">
                <div class="gtp-list" id="gtp-hours-list"></div>
                <div class="gtp-list" id="gtp-mins-list"></div>
            </div>
        `;
        document.body.appendChild(popup);

        // Close on outside click
        document.addEventListener('click', (e) => {
            const timePopup = document.getElementById('global-timepicker-popup');
            if (!timePopup || timePopup.style.display === 'none') return;
            if (timePopup.contains(e.target)) return;
            if (activeTimeInput && (activeTimeInput === e.target || activeTimeInput.contains(e.target))) return;
            if (e.target.closest && e.target.closest('.fa-clock')) return;
            closeTimePicker();
        });
    }

    function openTimePicker(e, input) {
        if (e) e.stopPropagation();
        createTimePickerDOM();
        activeTimeInput = input;

        let curVal = (input.value || input.textContent || '').trim();
        let curH = '12';
        let curM = '00';
        if (/^\d{1,2}:\d{2}$/.test(curVal)) {
            const parts = curVal.split(':');
            curH = parts[0].padStart(2, '0');
            curM = parts[1].padStart(2, '0');
        } else {
            const now = new Date();
            curH = String(now.getHours()).padStart(2, '0');
            curM = String(now.getMinutes()).padStart(2, '0');
        }

        renderTimePickerLists(curH, curM);

        const popup = document.getElementById('global-timepicker-popup');
        const rect = input.getBoundingClientRect();
        
        let top = rect.bottom + window.scrollY + 1;
        let left = rect.left + window.scrollX;

        if (left + 95 > window.innerWidth) {
            left = window.innerWidth - 100;
        }

        popup.style.top = top + 'px';
        popup.style.left = left + 'px';
        popup.style.display = 'block';

        // Scroll into view
        setTimeout(() => {
            const selH = document.querySelector('#gtp-hours-list .gtp-item.selected');
            const selM = document.querySelector('#gtp-mins-list .gtp-item.selected');
            if (selH) selH.scrollIntoView({ block: 'center' });
            if (selM) selM.scrollIntoView({ block: 'center' });
        }, 10);
    }

    function renderTimePickerLists(selectedH, selectedM) {
        const hoursList = document.getElementById('gtp-hours-list');
        const minsList = document.getElementById('gtp-mins-list');
        const selHBox = document.getElementById('gtp-sel-hour');
        const selMBox = document.getElementById('gtp-sel-min');

        if (selHBox) selHBox.textContent = selectedH;
        if (selMBox) selMBox.textContent = selectedM;

        if (!hoursList || !minsList) return;

        hoursList.innerHTML = '';
        for (let i = 0; i < 24; i++) {
            const hStr = String(i).padStart(2, '0');
            const item = document.createElement('div');
            item.className = 'gtp-item' + (hStr === selectedH ? ' selected' : '');
            item.textContent = hStr;
            item.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('#gtp-hours-list .gtp-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                if (selHBox) selHBox.textContent = hStr;
                updateActiveTimeValue();
            };
            hoursList.appendChild(item);
        }

        minsList.innerHTML = '';
        for (let i = 0; i < 60; i++) {
            const mStr = String(i).padStart(2, '0');
            const item = document.createElement('div');
            item.className = 'gtp-item' + (mStr === selectedM ? ' selected' : '');
            item.textContent = mStr;
            item.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('#gtp-mins-list .gtp-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                if (selMBox) selMBox.textContent = mStr;
                updateActiveTimeValue();
            };
            minsList.appendChild(item);
        }
    }

    function updateActiveTimeValue() {
        if (!activeTimeInput) return;
        const selHBox = document.getElementById('gtp-sel-hour');
        const selMBox = document.getElementById('gtp-sel-min');
        const h = selHBox ? selHBox.textContent : '12';
        const m = selMBox ? selMBox.textContent : '00';
        const timeVal = `${h}:${m}`;
        
        if (activeTimeInput.tagName === 'INPUT') {
            activeTimeInput.value = timeVal;
            activeTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
            activeTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            activeTimeInput.textContent = timeVal;
        }
    }

    function closeTimePicker() {
        const popup = document.getElementById('global-timepicker-popup');
        if (popup) popup.style.display = 'none';
        activeTimeInput = null;
    }

    window.closeClassicTimePicker = closeTimePicker;
    window.openClassicTimePicker = openTimePicker;
    window.setTimePickerNow = function() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        if (activeTimeInput) {
            if (activeTimeInput.tagName === 'INPUT') {
                activeTimeInput.value = `${h}:${m}`;
                activeTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
                activeTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                activeTimeInput.textContent = `${h}:${m}`;
            }
        }
        closeTimePicker();
    };

    // Auto-bind to all inputs on DOM load
    function initAutoBinding() {
        createCalendarDOM();
        createTimePickerDOM();

        // 1. Bind to filter-date-val and text date inputs
        document.querySelectorAll('input[type="text"], input[type="date"], input.filter-date-input, input.tryin-date-input').forEach(input => {
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
            const cls = (input.className || '').toLowerCase();

            const isDateInput = input.type === 'date' || 
                               placeholder.includes('date') || 
                               placeholder.includes('m/d/yyyy') || 
                               placeholder.includes('dd/mm') || 
                               id.includes('date') || 
                               id.includes('duedate') || 
                               cls.includes('date');

            if (isDateInput && !input.dataset.gdpBound) {
                input.dataset.gdpBound = 'true';
                input.addEventListener('click', (e) => openCalendar(e, input));

                // Restrict typing to digits, slashes, hyphens only
                input.addEventListener('keydown', (e) => {
                    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
                    if (e.ctrlKey || e.metaKey) return;
                    if (!/[\d\/\-]/.test(e.key)) {
                        e.preventDefault();
                    }
                });

                input.addEventListener('input', (e) => {
                    const cleaned = input.value.replace(/[^\d\/\-]/g, '');
                    if (cleaned !== input.value) {
                        input.value = cleaned;
                    }
                });
            }
        });

        // 2. Bind to clock icons to open adjacent time input
        document.querySelectorAll('.fa-clock').forEach(icon => {
            if (!icon.dataset.gtpBound) {
                icon.dataset.gtpBound = 'true';
                icon.style.cursor = 'pointer';
                icon.addEventListener('click', (e) => {
                    const parent = icon.parentElement;
                    if (parent) {
                        const timeInput = parent.querySelector('input[data-time="true"], input[value*=":"]') || parent.querySelectorAll('input')[1] || parent.querySelector('input');
                        if (timeInput) {
                            openTimePicker(e, timeInput);
                        }
                    }
                });
            }
        });
    }

    // Expose globally
    window.openGlobalDatePicker = openCalendar;
    window.openClassicDatePicker = openCalendar;
    window.openFilterDatePicker = (e, input) => openCalendar(e, input || document.getElementById('filter-date-val'));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoBinding);
    } else {
        initAutoBinding();
    }
})();
