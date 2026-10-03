/**
 * Universal Excel Export Module (Lab Command System)
 * Exports any HTML table or custom datasets directly to native Excel (.xlsx) files
 * with proper columns, formatting, auto column widths, and sanitized values.
 */

(function () {
    // Ensure XLSX is available (from local xlsx.full.min.js or CDN fallback)
    function ensureXLSX(callback) {
        if (typeof XLSX !== 'undefined') {
            if (callback) callback(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'xlsx.full.min.js';
        script.onload = () => {
            if (callback) callback(true);
        };
        script.onerror = () => {
            // CDN Fallback
            const cdnScript = document.createElement('script');
            cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            cdnScript.onload = () => {
                if (callback) callback(true);
            };
            cdnScript.onerror = () => {
                console.warn('XLSX library failed to load, falling back to Excel CSV.');
                if (callback) callback(false);
            };
            document.head.appendChild(cdnScript);
        };
        document.head.appendChild(script);
    }

    /**
     * Clean cell text by stripping icons, buttons, badge wrappers, and formatting.
     */
    function cleanCellText(cell) {
        if (!cell) return '';

        // If cell has a direct select or input
        const input = cell.querySelector('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
        if (input) {
            return input.value.trim();
        }

        // Clone node to avoid mutating DOM
        const clone = cell.cloneNode(true);

        // Remove non-data elements (checkboxes, radios, icon buttons, cross icons, tooltips)
        clone.querySelectorAll('input[type="checkbox"], input[type="radio"], button, .fa, .fas, .fa-solid, .fa-regular, .tooltip, [data-no-export="true"]').forEach(el => el.remove());

        let text = clone.innerText || clone.textContent || '';
        // Clean linebreaks and multiple spaces
        text = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return text;
    }

    /**
     * Format filename with timestamp or date
     */
    function getCleanFilename(baseName) {
        let name = (baseName || 'Export').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_');
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return `${name}_${dateStr}`;
    }

    /**
     * Parse text to appropriate type (Number or String)
     */
    function parseValue(val) {
        if (typeof val !== 'string') return val;
        val = val.trim();
        if (val === '' || val === '-' || val === 'N/A') return val;

        // Check if numeric currency / amount (e.g. 120.000, 15.50, 450)
        // Avoid treating dates or phone numbers as plain numbers if they have slashes or hyphens
        if (/^-?\d+(\.\d+)?$/.test(val)) {
            const num = parseFloat(val);
            if (!isNaN(num) && isFinite(num)) return num;
        }
        return val;
    }

    /**
     * Main Table Export Function
     */
    function exportTableToExcel(tableElOrSelector, filename = 'Export', options = {}) {
        let table = null;
        if (typeof tableElOrSelector === 'string') {
            table = document.querySelector(tableElOrSelector);
        } else if (tableElOrSelector && tableElOrSelector.nodeType === 1) {
            table = tableElOrSelector;
        }

        if (!table) {
            // Find visible table on page
            table = document.querySelector('#accounts-table, #orders-table, #shipments-table, #reports-table, .legacy-table, table:not([style*="display: none"]):not([style*="display:none"])');
        }

        if (!table) {
            alert('No table found to export.');
            return;
        }

        // 1. Extract Headers
        const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
        if (!headerRow) {
            alert('Table headers not found.');
            return;
        }

        const headerThs = Array.from(headerRow.children);
        const colIndicesToExport = [];
        const headers = [];

        headerThs.forEach((th, idx) => {
            const thText = cleanCellText(th);
            const isCheckbox = th.querySelector('input[type="checkbox"]') || th.dataset.col === 'cb' || th.classList.contains('cb');
            const isActions = th.dataset.col === 'actions' || thText.toLowerCase() === 'actions' || thText.toLowerCase() === 'action' || (!thText && idx === headerThs.length - 1 && th.querySelector('i, a'));

            if (!isCheckbox && !isActions) {
                colIndicesToExport.push(idx);
                headers.push(thText || `Column ${idx + 1}`);
            }
        });

        // 2. Extract Rows
        const tbody = table.querySelector('tbody') || table;
        let trs = Array.from(tbody.querySelectorAll('tr'));

        // Check if any row is checked via checkbox
        const checkedBoxes = tbody.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedBoxes.length > 0) {
            trs = Array.from(checkedBoxes).map(cb => cb.closest('tr')).filter(Boolean);
        }

        // Filter out hidden rows or empty state rows
        trs = trs.filter(tr => {
            if (tr.style.display === 'none' || tr.classList.contains('empty-row') || tr.id === 'empty-row') return false;
            // Check if it has td elements
            return tr.querySelectorAll('td').length > 0;
        });

        if (trs.length === 0) {
            alert('No rows available to export.');
            return;
        }

        const dataRows = [];
        trs.forEach((tr, rowIdx) => {
            const tds = Array.from(tr.children);
            if (tds.length === 0) return;

            const row = [];
            colIndicesToExport.forEach(colIdx => {
                const td = tds[colIdx];
                if (!td) {
                    row.push('');
                    return;
                }
                const rawVal = cleanCellText(td);
                row.push(parseValue(rawVal));
            });
            dataRows.push(row);
        });

        const fullData = [headers, ...dataRows];
        const exportName = getCleanFilename(filename);

        ensureXLSX((hasXlsx) => {
            if (hasXlsx && typeof XLSX !== 'undefined') {
                try {
                    const ws = XLSX.utils.aoa_to_sheet(fullData);

                    // Auto compute column widths
                    const colWidths = headers.map((h, i) => {
                        let maxLen = String(h).length;
                        dataRows.forEach(row => {
                            const valStr = String(row[i] || '');
                            if (valStr.length > maxLen) maxLen = valStr.length;
                        });
                        return { wch: Math.max(maxLen + 3, 10) };
                    });
                    ws['!cols'] = colWidths;

                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

                    XLSX.writeFile(wb, `${exportName}.xlsx`);

                    if (typeof showToast === 'function') {
                        showToast(`Exported ${dataRows.length} rows to ${exportName}.xlsx`, 'success');
                    }
                    return;
                } catch (e) {
                    console.error('XLSX write error, falling back to CSV:', e);
                }
            }

            // Fallback: UTF-8 BOM CSV (Opens natively in Excel)
            let csvContent = '\uFEFF';
            fullData.forEach(row => {
                const line = row.map(val => {
                    let str = String(val === null || val === undefined ? '' : val);
                    str = str.replace(/"/g, '""');
                    return `"${str}"`;
                }).join(',');
                csvContent += line + '\r\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `${exportName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (typeof showToast === 'function') {
                showToast(`Exported ${dataRows.length} rows to ${exportName}.csv`, 'success');
            }
        });
    }

    /**
     * Export custom 2D Array / JSON Dataset to Excel
     */
    function exportDataToExcel(headers, rows, filename = 'Data_Export') {
        const fullData = [headers, ...rows];
        const exportName = getCleanFilename(filename);

        ensureXLSX((hasXlsx) => {
            if (hasXlsx && typeof XLSX !== 'undefined') {
                try {
                    const ws = XLSX.utils.aoa_to_sheet(fullData);
                    const colWidths = headers.map((h, i) => {
                        let maxLen = String(h).length;
                        rows.forEach(r => {
                            const valStr = String(r[i] || '');
                            if (valStr.length > maxLen) maxLen = valStr.length;
                        });
                        return { wch: Math.max(maxLen + 3, 10) };
                    });
                    ws['!cols'] = colWidths;

                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Data");
                    XLSX.writeFile(wb, `${exportName}.xlsx`);

                    if (typeof showToast === 'function') {
                        showToast(`Exported to ${exportName}.xlsx`, 'success');
                    }
                    return;
                } catch (err) {
                    console.error('XLSX export error:', err);
                }
            }

            // Fallback CSV
            let csvContent = '\uFEFF';
            fullData.forEach(row => {
                const line = row.map(val => {
                    let str = String(val === null || val === undefined ? '' : val);
                    str = str.replace(/"/g, '""');
                    return `"${str}"`;
                }).join(',');
                csvContent += line + '\r\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `${exportName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Expose Global functions
    window.exportTableToExcel = exportTableToExcel;
    window.exportDataToExcel = exportDataToExcel;

    // Helper to get active page title or current mode
    function getCurrentContextName() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('accounts')) {
            return (window.currentMode || 'Accounts').toUpperCase();
        } else if (path.includes('orders')) {
            return (window.currentOrderStatusFilter || window.currentFilter || 'Orders').toUpperCase();
        } else if (path.includes('shipments')) {
            return (window.currentMode || 'Shipments').toUpperCase();
        } else if (path.includes('reports')) {
            const titleEl = document.getElementById('modal-report-title-top') || document.getElementById('modal-report-title');
            return titleEl ? titleEl.innerText.trim() : 'Report';
        }
        return document.title.replace(/Lab Command \|?/i, '').trim() || 'Data';
    }

    // Connect standard triggers across the entire application
    window.exportToCSV = function () {
        exportTableToExcel('#orders-table', 'Orders_' + getCurrentContextName());
    };

    window.exportGenerateInvoices = function () {
        exportTableToExcel('#accounts-table', 'Generate_Invoices_' + getCurrentContextName());
    };

    window.exportReportToCSV = function () {
        const reportTable = document.querySelector('#report-viewer-content table, #report-details-table, #reports-table');
        if (reportTable) {
            exportTableToExcel(reportTable, 'Report_' + getCurrentContextName());
        } else {
            exportTableToExcel(null, 'Report_' + getCurrentContextName());
        }
    };

    window.exportReportCSV = function () {
        const reportTable = document.querySelector('#report-details-table, #report-viewer-content table, table');
        exportTableToExcel(reportTable, 'Report_Details_' + getCurrentContextName());
    };

    // Global listener on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        // Preload XLSX
        ensureXLSX();

        // Intercept any click on elements with id/class export
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('#btn-export, #btn-export-generate, .btn-export-excel, button[onclick*="export"], a[onclick*="export"]');
            if (target) {
                // If it's not a PDF or backup download link
                const onclickStr = target.getAttribute('onclick') || '';
                const hrefStr = target.getAttribute('href') || '';
                if (hrefStr.includes('/api/backup') || onclickStr.includes('PDF') || onclickStr.includes('Print')) {
                    return; // Let PDF/Backup handler proceed
                }
                
                // If target has specific handler that was overridden, allow default, else trigger exportTableToExcel
                if (!onclickStr || onclickStr.includes('bulkAction(\'export\')') || onclickStr.includes('exportToCSV') || onclickStr.includes('exportGenerateInvoices')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tableName = getCurrentContextName() + '_Export';
                    exportTableToExcel(null, tableName);
                }
            }
        }, true);
    });

    // Also immediately try preloading XLSX
    ensureXLSX();
})();
