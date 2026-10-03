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

console.log('--- CLIENTS.XLS ---');
const clients = parseBiffRows(path.join(DESKTOP_DIR, 'Clients.xls'));
console.log('Header:', clients[0]);
clients.filter(r => Object.values(r).some(v => String(v).includes('ADEL'))).forEach(r => console.log(r));

console.log('\n--- CLIENTBILLS.XLS ---');
const bills = parseBiffRows(path.join(DESKTOP_DIR, 'ClientBills.xls'));
console.log('Header:', bills[0]);
bills.filter(r => Object.values(r).some(v => String(v).includes('ADEL') || String(v) === '22875' || String(v) === '22896' || String(v) === '22936')).forEach(r => console.log(r));

console.log('\n--- CLIENTPAYMENTS.XLS ---');
const payments = parseBiffRows(path.join(DESKTOP_DIR, 'ClientPayments.xls'));
console.log('Header:', payments[0]);
payments.filter(r => Object.values(r).some(v => String(v).includes('ADEL') || String(v) === '06753' || String(v) === '6753')).forEach(r => console.log(r));

console.log('\n--- ORDERS.XLS ---');
const orders = parseBiffRows(path.join(DESKTOP_DIR, 'Orders.xls'));
console.log('Header:', orders[0]);
orders.filter(r => Object.values(r).some(v => String(v).includes('ADEL') || ['31194', '29873', '30800', '31253'].includes(String(v)))).forEach(r => console.log(r));
