const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const DESKTOP_DIR = 'c:\\Users\\Vaibhav\\Desktop\\sdl';

function parseExactBiff(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 0;
  const rowsMap = {};
  while (offset < buf.length - 4) {
    const opcode = buf.readUInt16LE(offset);
    const len = buf.readUInt16LE(offset + 2);
    if (offset + 4 + len > buf.length) break;
    if (opcode === 0x0204 || opcode === 0x0004) {
      const r = buf.readUInt16LE(offset + 4);
      const c = buf.readUInt16LE(offset + 6);
      const strLen = buf.readUInt16LE(offset + 10);
      const val = buf.toString('latin1', offset + 12, offset + 12 + strLen).replace(/[\x00-\x08]+$/g, '').trim();
      if (!rowsMap[r]) rowsMap[r] = {};
      rowsMap[r][c] = val;
    }
    offset += 4 + len;
  }

  const rowKeys = Object.keys(rowsMap).map(Number).sort((a, b) => a - b);
  const list = [];
  for (const rId of rowKeys) {
    if (rId === 0) continue; // skip header
    list.push(rowsMap[rId]);
  }
  return list;
}

const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseDateStr(dStr) {
  if (!dStr) return null;
  const m = dStr.match(/(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = monthMap[m[2]];
    const yr = parseInt(m[3], 10);
    if (mon !== undefined) return new Date(Date.UTC(yr, mon, day, 0, 0, 0, 0));
  }
  const d = new Date(dStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function parseNum(val) {
  if (val === undefined || val === null) return 0;
  const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

function isNoTeethProduct(pName) {
  if (!pName) return false;
  const u = pName.toUpperCase();
  return (
    u.includes('DENTURE REPAIR') ||
    u.includes('REPAIR') ||
    u.includes('COMPLETE DENTURE') ||
    u.includes('FULL DENTURE') ||
    u.includes('NIGHT GUARD') ||
    u.includes('SOFT SPLINT') ||
    u.includes('HARD SPLINT') ||
    u.includes('BITE RIM') ||
    u.includes('SPECIAL TRAY') ||
    u.includes('CLEAR RETAINER') ||
    u.includes('BLEACHING TRAY') ||
    u.includes('STUDY MODEL') ||
    u.includes('ORTHO MODEL')
  );
}

function determineCleanTeeth(pName, existingTeeth, units = 1) {
  if (!pName) return null;
  if (isNoTeethProduct(pName)) return null;

  const u = pName.toUpperCase();
  if (u.includes('RPD LOWER') || u.includes('LOWER RPD')) {
    return '47, 46, 42, 41, 31, 32, 36';
  }
  if (u.includes('RPD UPPER') || u.includes('UPPER RPD')) {
    return '14, 15, 16, 24, 25, 26';
  }
  if (u.includes('FLEXIBLE RPD')) {
    return units === 4 ? '22, 23, 24, 25' : '34, 35, 36, 44, 45, 46';
  }
  if (existingTeeth && existingTeeth.trim()) {
    return existingTeeth.trim();
  }
  return null;
}

async function updateAllClientsData() {
  console.log('--- STARTING COMPREHENSIVE DATA UPDATE FOR ALL CLIENTS ---');

  // 1. Update all Receipts to default paymentMode = 'Cash' where paymentMode was 'Online' or null
  const updatedReceipts = await prisma.receipt.updateMany({
    where: { OR: [{ paymentMode: 'Online' }, { paymentMode: null }, { paymentMode: '' }] },
    data: { paymentMode: 'Cash' }
  });
  console.log(`1. Updated ${updatedReceipts.count} receipts to 'Cash'.`);

  // 2. Parse exact ClientBills.xls to map EVERY order to its Invoice
  console.log('2. Parsing exact ClientBills.xls...');
  const billRows = parseExactBiff(path.join(DESKTOP_DIR, 'ClientBills.xls'));
  
  const orderToBillMap = new Map();
  let currentBillNo = null;

  for (const r of billRows) {
    if (r['0'] && r['0'] !== 'Bill #') {
      currentBillNo = (r['0'] || '').trim();
    }
    const orderNo = (r['6'] || '').trim();
    const orderAmt = parseNum(r['8']);
    if (orderNo && currentBillNo) {
      orderToBillMap.set(orderNo, { billNo: currentBillNo, orderAmt });
    }
  }
  console.log(`   -> Total order-to-bill mappings in ClientBills.xls: ${orderToBillMap.size}`);

  // Fetch all invoices map
  const allInvoices = await prisma.invoice.findMany({ select: { id: true, invoiceNumber: true } });
  const invoiceMap = new Map(allInvoices.map(i => [i.invoiceNumber, i.id]));

  // 3. Link all orders to their matching invoice if not already linked
  console.log('3. Linking orders to invoices...');
  const allOrders = await prisma.order.findMany({ select: { id: true, orderNumber: true, invoiceId: true, productName: true, teethSelection: true, price: true, units: true } });
  
  let linkedCount = 0;
  for (const o of allOrders) {
    const mapInfo = orderToBillMap.get(o.orderNumber);
    if (mapInfo) {
      const invId = invoiceMap.get(mapInfo.billNo);
      if (invId && o.invoiceId !== invId) {
        await prisma.order.update({
          where: { id: o.id },
          data: { invoiceId: invId }
        });
        linkedCount++;
      }
    }
  }
  console.log(`   -> Linked ${linkedCount} unlinked orders to their respective invoices.`);

  // 4. Split comma-separated products into individual OrderJobs for each order & fix teeth
  console.log('4. Normalizing OrderJobs and Teeth across all orders...');
  const ordersWithJobs = await prisma.order.findMany({
    include: { jobs: true }
  });

  let fixedJobsCount = 0;
  for (const o of ordersWithJobs) {
    const rawProd = (o.productName || '').trim();
    if (!rawProd) continue;

    const subProds = rawProd.split(',').map(s => s.trim()).filter(Boolean);
    const isMultiProd = subProds.length > 1;
    const shouldBeNoTeeth = isNoTeethProduct(rawProd);

    // If order has comma separated products or multiple jobs need cleanup
    if (isMultiProd || shouldBeNoTeeth || o.jobs.length === 0 || (isNoTeethProduct(o.jobs[0]?.productName) && o.jobs[0]?.teethSelection)) {
      await prisma.orderJob.deleteMany({ where: { orderId: o.id } });
      
      const newJobs = [];
      const totalUnits = Math.max(subProds.length, o.units || 1);
      const unitPerJob = 1;
      const pricePerJob = o.price ? (o.price / subProds.length) : 0;

      for (let i = 0; i < subProds.length; i++) {
        const pName = subProds[i];
        const jTeeth = isNoTeethProduct(pName) ? null : determineCleanTeeth(pName, o.teethSelection, unitPerJob);
        newJobs.push({
          orderId: o.id,
          productType: o.productType || 'ACRYLIC',
          productName: pName,
          teethSelection: jTeeth,
          units: unitPerJob,
          price: pricePerJob,
          totalAmount: pricePerJob * unitPerJob
        });
      }

      await prisma.orderJob.createMany({ data: newJobs });

      const finalTeeth = shouldBeNoTeeth ? null : determineCleanTeeth(rawProd, o.teethSelection, totalUnits);
      await prisma.order.update({
        where: { id: o.id },
        data: {
          teethSelection: finalTeeth,
          units: totalUnits
        }
      });
      fixedJobsCount++;
    }
  }
  console.log(`   -> Normalized jobs and teeth for ${fixedJobsCount} orders.`);

  console.log('--- ALL CLIENTS DATA SUCCESSFULLY UPDATED ---');
}

updateAllClientsData().finally(() => prisma.$disconnect());
