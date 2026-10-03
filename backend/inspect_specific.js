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
const bills = parseBiffRows(path.join(DESKTOP_DIR, 'ClientBills.xls'));

console.log('--- ALL ROWS FOR BILL 22875, 22896, 22936 ---');
bills.filter(r => ['22875', '22896', '22936'].includes(String(r[0]))).forEach(r => console.log(r));

console.log('--- ALL ORDERS FOR 31194, 29873, 30800, 31253 ---');
const orders = parseBiffRows(path.join(DESKTOP_DIR, 'Orders.xls'));
orders.filter(r => ['31194', '29873', '30800', '31253'].includes(String(r[1]))).forEach(r => console.log(r));
