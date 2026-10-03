const fs = require('fs');
const path = require('path');

function parseBiffRows(filePath) {
  const buf = fs.readFileSync(filePath);
  const s = buf.toString('latin1');
  const cells = [];
  let pos = 0;
  while (true) {
    const idx = s.indexOf('\x04\x02', pos);
    if (idx === -1) break;
    try {
      const r = s.charCodeAt(idx + 4) | (s.charCodeAt(idx + 5) << 8);
      const c = s.charCodeAt(idx + 6) | (s.charCodeAt(idx + 7) << 8);
      const strLen = s.charCodeAt(idx + 10);
      let val = s.substring(idx + 12, idx + 12 + strLen);
      val = val.replace(/[\x00-\x08]+$/g, '').trim();
      cells.push({ r, c, val });
    } catch (e) {}
    pos = idx + 2;
  }

  const rowsMap = {};
  for (const cell of cells) {
    if (!rowsMap[cell.r]) rowsMap[cell.r] = {};
    rowsMap[cell.r][cell.c] = cell.val;
  }
  const rowKeys = Object.keys(rowsMap).map(Number).sort((a, b) => a - b);
  const list = [];
  for (const rId of rowKeys) {
    list.push(rowsMap[rId]);
  }
  return list;
}

const DESKTOP_DIR = 'c:\\Users\\Vaibhav\\Desktop\\sdl';

console.log('--- CLIENTBILLS.XLS HEADER & ADEL ROWS ---');
const bills = parseBiffRows(path.join(DESKTOP_DIR, 'ClientBills.xls'));
console.log('Header:', bills[0]);
const adelBills = bills.filter(r => Object.values(r).some(v => String(v).includes('ADEL')));
console.log('Adel bills count:', adelBills.length);
adelBills.forEach(r => console.log(r));

console.log('\n--- CLIENTPAYMENTS.XLS HEADER & ADEL ROWS ---');
const payments = parseBiffRows(path.join(DESKTOP_DIR, 'ClientPayments.xls'));
console.log('Header:', payments[0]);
const adelPayments = payments.filter(r => Object.values(r).some(v => String(v).includes('ADEL')));
console.log('Adel payments count:', adelPayments.length);
adelPayments.forEach(r => console.log(r));
