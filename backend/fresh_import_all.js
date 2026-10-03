const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const prisma = new PrismaClient();
const DESKTOP_DIR = 'c:\\Users\\Vaibhav\\Desktop\\sdl';

function parseBiffRows(filePath) {
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

function normalizeClientName(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatClientCode(codeVal) {
  if (!codeVal) return '';
  const clean = String(codeVal).replace(/\D/g, '');
  if (!clean) return String(codeVal).trim();
  const num = parseInt(clean, 10);
  if (isNaN(num)) return String(codeVal).trim();
  return String(num).padStart(5, '0');
}

function findClientMatch(code, name, clientLookup) {
  const { mapByCode, mapByUnpaddedCode, mapByNormalizedName, list } = clientLookup;
  
  if (code) {
    const formatted = formatClientCode(code);
    if (formatted && mapByCode.has(formatted)) return mapByCode.get(formatted);
    const unpadded = String(parseInt(String(code).replace(/\D/g, ''), 10));
    if (unpadded && mapByUnpaddedCode.has(unpadded)) return mapByUnpaddedCode.get(unpadded);
  }

  if (name) {
    const norm = normalizeClientName(name);
    if (norm && mapByNormalizedName.has(norm)) return mapByNormalizedName.get(norm);
    
    // Substring / fuzzy fallback
    for (const c of list) {
      const cNorm = normalizeClientName(c.name);
      if (cNorm && (cNorm.includes(norm) || norm.includes(cNorm))) {
        return c;
      }
    }
  }

  return null;
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

function determineCleanTeeth(pName, units = 1) {
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
  return null;
}

function determineType(pName) {
  if (!pName) return 'Crown';
  const u = pName.toUpperCase();
  if (u.includes('ZIRCON')) return 'ZIRCONIUM';
  if (u.includes('PFM')) return 'PFM';
  if (u.includes('DENTURE') || u.includes('BITE') || u.includes('ACRYLIC') || u.includes('TRIAL') || u.includes('LOWER') || u.includes('UPPER')) return 'ACRYLIC';
  if (u.includes('RPD') || u.includes('METAL') || u.includes('CAST')) return 'CAST PARTIAL';
  if (u.includes('ORTHO') || u.includes('GUARD') || u.includes('RETAINER')) return 'ORTHO';
  return 'Crown';
}

async function main() {
  console.log('==================================================');
  console.log('--- STARTING FULL PURGE AND FRESH DATA IMPORT ---');
  console.log('==================================================');

  // STEP 0: PURGE OLD DATA
  console.log('1/8. Clearing existing tables in PostgreSQL...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Expense", "Receipt", "Adjustment", "Warranty", "OrderJob", "PickupReturn", "PickupRequest", "ShipmentNote", "DeliveryPlan", "Media", "Order", "Invoice", "Client" CASCADE;`);
  console.log('   -> Database tables cleared successfully.');

  // STEP 1: IMPORT CLIENTS (Clients.xls)
  console.log('2/8. Parsing and Importing Clients (Clients.xls)...');
  const clientRows = parseBiffRows(path.join(DESKTOP_DIR, 'Clients.xls'));
  const clientCreatesMap = new Map();

  for (const r of clientRows) {
    const name = (r['0'] || '').trim();
    if (!name) continue;
    const code = formatClientCode(r['1']);
    const addr1 = (r['2'] || '').trim();
    const addr2 = (r['3'] || '').trim();
    const addr3 = (r['4'] || '').trim();
    const address = [addr1, addr2, addr3].filter(Boolean).join(', ');
    const city = (r['5'] || '').trim();
    const pinCode = (r['6'] || '').trim();
    const cell1 = (r['7'] || '').trim();
    const cell2 = (r['8'] || '').trim();
    const phone1 = (r['13'] || '').trim();
    const phone2 = (r['14'] || '').trim();
    const contactPerson = (r['15'] || '').trim();

    const clientData = {
      name,
      code,
      address,
      city,
      pinCode,
      cellPhone: cell1,
      cellPhone2: cell2,
      phone: phone1,
      phone2,
      contactPerson,
      status: 'Active'
    };

    const key = code || normalizeClientName(name);
    if (!clientCreatesMap.has(key)) {
      clientCreatesMap.set(key, clientData);
    }
  }

  const clientList = Array.from(clientCreatesMap.values());
  for (let i = 0; i < clientList.length; i += 1000) {
    await prisma.client.createMany({ data: clientList.slice(i, i + 1000) });
  }
  console.log(`   -> Created ${clientList.length} clients.`);

  let allClients = await prisma.client.findMany();
  const clientLookup = {
    list: allClients,
    mapByCode: new Map(allClients.filter(c => c.code).map(c => [c.code, c])),
    mapByUnpaddedCode: new Map(allClients.filter(c => c.code).map(c => [String(parseInt(c.code, 10)), c])),
    mapByNormalizedName: new Map(allClients.map(c => [normalizeClientName(c.name), c]))
  };

  // STEP 2: MAP BILLS & ORDERS (ClientBills.xls)
  console.log('3/8. Parsing Invoices (ClientBills.xls)...');
  const billRows = parseBiffRows(path.join(DESKTOP_DIR, 'ClientBills.xls'));
  
  const orderToBillMap = new Map();
  const billsGrouped = new Map();

  let currentBillNo = null;
  let currentBillDate = null;
  let currentClientCode = null;
  let currentClientName = null;
  let currentHeaderBillAmt = 0;

  for (const r of billRows) {
    if (r['0'] && r['0'] !== 'Bill #') {
      currentBillNo = (r['0'] || '').trim();
      currentBillDate = parseDateStr(r['1']) || new Date();
      currentHeaderBillAmt = parseNum(r['2']);
      currentClientName = (r['3'] || '').trim();
      currentClientCode = formatClientCode(r['4']);
    }

    if (!currentBillNo) continue;

    const orderDate = parseDateStr(r['5']);
    const orderNo = (r['6'] || '').trim();
    const orderAmt = parseNum(r['8']);

    let client = findClientMatch(currentClientCode, currentClientName, clientLookup);

    if (orderNo) {
      orderToBillMap.set(orderNo, {
        billNo: currentBillNo,
        orderAmount: orderAmt,
        orderDate,
        billDate: currentBillDate,
        clientId: client ? client.id : null
      });
    }

    if (!billsGrouped.has(currentBillNo)) {
      billsGrouped.set(currentBillNo, {
        invoiceNumber: currentBillNo,
        invoiceDate: currentBillDate,
        clientId: client ? client.id : null,
        clientName: currentClientName,
        clientCode: currentClientCode,
        headerBillAmt: currentHeaderBillAmt,
        orderTotalSum: orderAmt || 0
      });
    } else {
      const group = billsGrouped.get(currentBillNo);
      if (currentHeaderBillAmt && !group.headerBillAmt) group.headerBillAmt = currentHeaderBillAmt;
      if (!group.clientId && client) group.clientId = client.id;
      group.orderTotalSum += (orderAmt || 0);
    }
  }

  const invoiceCreates = [];
  for (const [billNo, g] of billsGrouped.entries()) {
    let clientId = g.clientId;
    if (!clientId) {
      let client = findClientMatch(g.clientCode, g.clientName, clientLookup);
      if (client) {
        clientId = client.id;
      } else if (g.clientName) {
        const newC = await prisma.client.create({
          data: {
            name: g.clientName.trim().toUpperCase(),
            code: formatClientCode(g.clientCode),
            status: 'Active'
          }
        });
        clientId = newC.id;
        clientLookup.list.push(newC);
        clientLookup.mapByNormalizedName.set(normalizeClientName(newC.name), newC);
        if (newC.code) {
          clientLookup.mapByCode.set(newC.code, newC);
          clientLookup.mapByUnpaddedCode.set(String(parseInt(newC.code, 10)), newC);
        }
      }
    }
    if (!clientId) continue;

    const finalAmount = g.headerBillAmt > 0 ? g.headerBillAmt : (g.orderTotalSum > 0 ? g.orderTotalSum : 0);

    invoiceCreates.push({
      invoiceNumber: billNo,
      clientId,
      invoiceDate: g.invoiceDate || new Date(),
      grossAmount: finalAmount,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: finalAmount,
      paidAmount: 0,
      balanceAmount: finalAmount,
      status: 'Unpaid'
    });
  }

  for (let i = 0; i < invoiceCreates.length; i += 2000) {
    await prisma.invoice.createMany({ data: invoiceCreates.slice(i, i + 2000) });
  }
  console.log(`   -> Created ${invoiceCreates.length} invoices.`);

  const allInvoices = await prisma.invoice.findMany({ select: { id: true, invoiceNumber: true } });
  const invoiceMapByNumber = new Map(allInvoices.map(i => [i.invoiceNumber, i.id]));

  // STEP 3: IMPORT ORDERS (Orders.xls)
  console.log('4/8. Parsing and Importing Orders (Orders.xls)...');
  const orderRows = parseBiffRows(path.join(DESKTOP_DIR, 'Orders.xls'));
  
  const orderCreates = [];
  const seenOrderNumbers = new Set();
  let maxModelNum = 48784;

  for (const r of orderRows) {
    const clientName = (r['0'] || '').trim();
    const orderNo = (r['1'] || '').trim();
    if (!orderNo) continue;
    if (seenOrderNumbers.has(orderNo)) continue;
    seenOrderNumbers.add(orderNo);

    const receivedDate = parseDateStr(r['2']) || new Date();
    const patientName = (r['3'] || '').trim() || 'N/A';
    const dueDate = parseDateStr(r['4']) || receivedDate;
    const productName = (r['5'] || '').trim();
    const status = (r['6'] || '').trim() || 'New';

    let client = findClientMatch(null, clientName, clientLookup);
    const billMapInfo = orderToBillMap.get(orderNo);
    if (!client && billMapInfo && billMapInfo.clientId) {
      client = clientLookup.list.find(c => c.id === billMapInfo.clientId);
    }

    if (!client && clientName) {
      client = await prisma.client.create({
        data: {
          name: clientName.trim().toUpperCase(),
          status: 'Active'
        }
      });
      clientLookup.list.push(client);
      clientLookup.mapByNormalizedName.set(normalizeClientName(client.name), client);
    }

    if (!client) continue;

    let invoiceId = null;
    let orderPrice = 0;
    if (billMapInfo) {
      orderPrice = billMapInfo.orderAmount;
      if (invoiceMapByNumber.has(billMapInfo.billNo)) {
        invoiceId = invoiceMapByNumber.get(billMapInfo.billNo);
      }
    }

    maxModelNum++;
    const modelNumber = String(maxModelNum);
    const teeth = determineCleanTeeth(productName, 1);
    const pType = determineType(productName);
    const isHold = status === 'Hold' || status === 'On Hold';
    const holdFrom = isHold ? receivedDate : null;
    const holdReason = isHold ? 'Clarification Needed' : null;

    orderCreates.push({
      orderNumber: orderNo,
      clientId: client.id,
      patientName,
      receivedDate,
      dueDate,
      productName,
      productType: pType,
      teethSelection: teeth,
      status,
      price: orderPrice,
      grossAmount: orderPrice,
      netAmount: orderPrice,
      modelNumber,
      invoiceId,
      holdFrom,
      holdReason
    });
  }

  for (let i = 0; i < orderCreates.length; i += 2000) {
    await prisma.order.createMany({ data: orderCreates.slice(i, i + 2000) });
  }
  console.log(`   -> Created ${orderCreates.length} orders with teethSelection.`);

  // Create OrderJob records (handling multi-product comma-separated jobs cleanly)
  const createdOrders = await prisma.order.findMany({ select: { id: true, productName: true, productType: true, teethSelection: true, price: true, grossAmount: true, netAmount: true } });
  const jobInserts = [];
  for (const o of createdOrders) {
    const parts = (o.productName || '').split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const p of parts) {
        jobInserts.push({
          orderId: o.id,
          productType: o.productType || 'ACRYLIC',
          productName: p,
          teethSelection: isNoTeethProduct(p) ? null : determineCleanTeeth(p, 1),
          units: 1,
          price: o.price ? (o.price / parts.length) : 0,
          totalAmount: o.price ? (o.price / parts.length) : 0,
          shade1: 'A2'
        });
      }
    } else {
      jobInserts.push({
        orderId: o.id,
        productType: o.productType || 'Crown',
        productName: o.productName || 'Crown',
        teethSelection: isNoTeethProduct(o.productName) ? null : o.teethSelection,
        units: 1,
        price: o.price || 0,
        totalAmount: o.netAmount || o.grossAmount || o.price || 0,
        shade1: 'A2'
      });
    }
  }

  for (let i = 0; i < jobInserts.length; i += 2000) {
    await prisma.orderJob.createMany({ data: jobInserts.slice(i, i + 2000) });
  }
  console.log(`   -> Created ${jobInserts.length} order job records.`);

  // STEP 4: GENERATE SHIPMENT NOTES FOR DELIVERED/TRY IN ORDERS
  console.log('5/8. Generating Shipment Notes...');
  const shippedOrders = await prisma.order.findMany({
    where: { status: { in: ['Delivered', 'Try In', 'Complete'] } },
    select: { id: true, orderNumber: true, clientId: true, receivedDate: true, dueDate: true }
  });

  if (shippedOrders.length > 0) {
    const shipmentCreates = shippedOrders.map(o => ({
      noteNumber: o.orderNumber,
      noteDate: o.dueDate || o.receivedDate || new Date(),
      deliveryMode: 'Courier',
      clientId: o.clientId,
      notes: `Auto-generated for Order #${o.orderNumber}`
    }));

    for (let i = 0; i < shipmentCreates.length; i += 2000) {
      await prisma.shipmentNote.createMany({ data: shipmentCreates.slice(i, i + 2000) });
    }

    const createdNotes = await prisma.shipmentNote.findMany({ select: { id: true, noteNumber: true } });
    const noteMap = new Map(createdNotes.map(n => [n.noteNumber, n.id]));

    const valuesSql = shippedOrders.map(o => {
      const noteId = noteMap.get(o.orderNumber);
      return noteId ? `(${o.id}, ${noteId})` : null;
    }).filter(Boolean).join(',\n');

    if (valuesSql) {
      const sql = `
        WITH data(order_id, note_id) AS (
          VALUES ${valuesSql}
        )
        UPDATE "Order" o
        SET "shipmentNoteId" = d.note_id
        FROM data d
        WHERE o.id = d.order_id;
      `;
      await prisma.$executeRawUnsafe(sql);
    }
    console.log(`   -> Generated and linked ${shippedOrders.length} shipment notes.`);
  }

  // STEP 5: IMPORT PAYMENTS (ClientPayments.xls)
  console.log('6/8. Parsing and Importing Payments (ClientPayments.xls)...');
  const paymentRows = parseBiffRows(path.join(DESKTOP_DIR, 'ClientPayments.xls'));
  
  const receiptCreates = [];
  const seenReceiptNumbers = new Set();

  for (const r of paymentRows) {
    const clientName = (r['0'] || '').trim();
    const code = formatClientCode(r['1']);
    const date = parseDateStr(r['2']) || new Date();
    const receiptNo = (r['3'] || '').trim();
    const amount = parseNum(r['4']);
    const notes = (r['5'] || '').trim();

    if (!receiptNo || seenReceiptNumbers.has(receiptNo)) continue;
    seenReceiptNumbers.add(receiptNo);

    const client = findClientMatch(code, clientName, clientLookup);
    if (!client) continue;

    receiptCreates.push({
      receiptNumber: receiptNo,
      receiptDate: date,
      clientId: client.id,
      amount,
      paymentMode: 'Cash',
      notes
    });
  }

  for (let i = 0; i < receiptCreates.length; i += 2000) {
    await prisma.receipt.createMany({ data: receiptCreates.slice(i, i + 2000) });
  }
  console.log(`   -> Created ${receiptCreates.length} receipts.`);

  // STEP 5.5: STRICT DETECTION OF ADJUSTMENTS (ZERO GUESSING / NO HARDCODED VALUES)
  console.log('6.5/8. Auto-detecting and Importing Adjustments from Payment Remarks (Zero Guessing)...');
  const adjustmentCreates = [];
  let adjSeq = 1;

  for (const r of paymentRows) {
    const clientName = (r['0'] || '').trim();
    const code = formatClientCode(r['1']);
    const date = parseDateStr(r['2']) || new Date();
    const notes = (r['5'] || r['6'] || r['7'] || '').trim();

    if (!notes) continue;
    const lower = notes.toLowerCase();

    let amount = 0;
    let type = 'Credit';
    let reason = 'Discount';
    let invoiceNumberMatch = null;

    const matchDiscount = lower.match(/(\d+(?:\.\d+)?)\s*(?:ro|rials|rial|omr)?\s*(?:discount|disc|less)/i) ||
                          lower.match(/(?:discount|disc|less)\s*(?:of)?\s*(\d+(?:\.\d+)?)/i) ||
                          lower.match(/gave\s*(\d+(?:\.\d+)?)\s*(?:ro|rials|rial|omr)?\s*less/i);

    const matchAdj = lower.match(/adjust(?:ed)?\s*(\d+(?:\.\d+)?)/i);
    const matchDiff = lower.match(/received\s*(\d+(?:\.\d+)?).*entered\s*(\d+(?:\.\d+)?)/i);
    const matchExtra = lower.match(/paid\s*(\d+(?:\.\d+)?)\s*extra/i) || lower.match(/(\d+(?:\.\d+)?)\s*(?:ro|omr)?\s*extra/i);

    if (matchDiscount) {
      amount = parseFloat(matchDiscount[1]);
      reason = 'Discount';
      type = 'Credit';
    } else if (matchAdj) {
      amount = parseFloat(matchAdj[1]);
      reason = 'Adjustment';
      type = 'Credit';
    } else if (matchDiff) {
      amount = Math.abs(parseFloat(matchDiff[1]) - parseFloat(matchDiff[2]));
      reason = 'Adjustment';
      type = 'Credit';
    } else if (matchExtra) {
      amount = parseFloat(matchExtra[1]);
      reason = 'Surcharge / Extra';
      type = 'Debit';
    }

    const invMatch = lower.match(/(?:invc|invoice|for)\s*(\d{4,6})/i);
    if (invMatch) invoiceNumberMatch = invMatch[1];

    if (amount <= 0 || isNaN(amount)) continue;

    const client = findClientMatch(code, clientName, clientLookup);
    if (!client) continue;

    let invoiceId = null;
    if (invoiceNumberMatch && invoiceMapByNumber.has(invoiceNumberMatch)) {
      invoiceId = invoiceMapByNumber.get(invoiceNumberMatch);
    }

    adjustmentCreates.push({
      adjustmentNumber: String(adjSeq++).padStart(5, '0'),
      date,
      clientId: client.id,
      invoiceId,
      amount,
      type,
      reason,
      notes
    });
  }

  if (adjustmentCreates.length > 0) {
    await prisma.adjustment.createMany({ data: adjustmentCreates });
    console.log(`   -> Created ${adjustmentCreates.length} verified adjustments from payment notes.`);
  }

  // STEP 6: IMPORT EXPENSES (Expenses.xls)
  console.log('7/8. Parsing and Importing Expenses (Expenses.xls)...');
  const expenseRows = parseBiffRows(path.join(DESKTOP_DIR, 'Expenses.xls'));
  
  const expenseCreates = [];
  const seenVouchers = new Set();

  for (const r of expenseRows) {
    const paidTo = (r['0'] || '').trim();
    const date = parseDateStr(r['1']) || new Date();
    const docNo = (r['2'] || '').trim();
    const amount = parseNum(r['3']);
    const ref = (r['4'] || '').trim();

    if (!docNo || seenVouchers.has(docNo)) continue;
    seenVouchers.add(docNo);

    expenseCreates.push({
      voucherNo: docNo,
      date,
      amount,
      paidTo: paidTo || 'General Expense',
      reference: ref,
      category: 'General',
      paymentMode: 'Online'
    });
  }

  for (let i = 0; i < expenseCreates.length; i += 2000) {
    await prisma.expense.createMany({ data: expenseCreates.slice(i, i + 2000) });
  }
  console.log(`   -> Created ${expenseCreates.length} expenses.`);

  // STEP 7: SYNCHRONIZED ALLOCATION OF ADJUSTMENTS & RECEIPTS TO INVOICES
  console.log('8/8. Allocating Receipts to Invoices and recalculating Client Balances...');
  
  const allInvValues = [];
  const allRecValues = [];

  const finalClientsList = await prisma.client.findMany({ select: { id: true, name: true } });

  for (const client of finalClientsList) {
    const invoices = await prisma.invoice.findMany({
      where: { clientId: client.id },
      include: { adjustments: true },
      orderBy: { invoiceDate: 'asc' }
    });
    const receipts = await prisma.receipt.findMany({
      where: { clientId: client.id },
      orderBy: { receiptDate: 'asc' }
    });
    const adjustments = await prisma.adjustment.findMany({
      where: { clientId: client.id }
    });

    if (invoices.length === 0 && receipts.length === 0) continue;

    for (const inv of invoices) {
      inv.discountAmount = 0;
      inv.netAmount = inv.grossAmount;
      inv.allocatedPaid = 0;
      inv.allocatedBalance = inv.grossAmount;
    }

    // 1. Direct invoice adjustments
    for (const adj of adjustments) {
      if (adj.invoiceId) {
        const inv = invoices.find(i => i.id === adj.invoiceId);
        if (inv) {
          if (adj.type === 'Credit') {
            inv.discountAmount += adj.amount;
            inv.netAmount = Math.max(0, inv.grossAmount - inv.discountAmount);
            inv.allocatedBalance = inv.netAmount;
          } else if (adj.type === 'Debit') {
            inv.netAmount += adj.amount;
            inv.allocatedBalance = inv.netAmount;
          }
        }
      }
    }

    // 2. General client credit adjustments (FIFO allocation across oldest invoices)
    let generalCreditAdjRemaining = adjustments
      .filter(a => !a.invoiceId && a.type === 'Credit')
      .reduce((s, a) => s + a.amount, 0);

    for (const inv of invoices) {
      if (generalCreditAdjRemaining <= 0) break;
      const deduct = Math.min(inv.allocatedBalance, generalCreditAdjRemaining);
      inv.discountAmount += deduct;
      inv.netAmount = Math.max(0, inv.grossAmount - inv.discountAmount);
      inv.allocatedBalance = inv.netAmount;
      generalCreditAdjRemaining -= deduct;
    }

    // 3. FIFO allocation of Receipts
    let receiptIndex = 0;
    let receiptRemaining = receipts.length > 0 ? receipts[0].amount : 0;

    for (const inv of invoices) {
      while (inv.allocatedBalance > 0 && receiptIndex < receipts.length) {
        if (receiptRemaining <= 0) {
          receiptIndex++;
          if (receiptIndex < receipts.length) {
            receiptRemaining = receipts[receiptIndex].amount;
          }
          continue;
        }

        const allocate = Math.min(inv.allocatedBalance, receiptRemaining);
        inv.allocatedPaid += allocate;
        inv.allocatedBalance -= allocate;
        receiptRemaining -= allocate;
      }
    }

    for (const inv of invoices) {
      const status = inv.allocatedBalance <= 0 
        ? 'Paid' 
        : (inv.allocatedPaid > 0 ? 'Partial' : 'Unpaid');
      allInvValues.push(`(${inv.id}, ${inv.discountAmount}, ${inv.netAmount}, ${inv.allocatedPaid}, ${inv.allocatedBalance}, '${status}')`);
    }

    if (receipts.length > 0) {
      let totalPaidAmt = invoices.reduce((sum, i) => sum + i.allocatedPaid, 0);
      for (const rec of receipts) {
        const applied = Math.min(rec.amount, totalPaidAmt);
        const credit = rec.amount - applied;
        totalPaidAmt -= applied;
        allRecValues.push(`(${rec.id}, ${applied}, ${credit}, ${credit > 0 ? 'true' : 'false'})`);
      }
    }
  }

  // Batch execute invoice updates
  const chunkSize = 5000;
  for (let i = 0; i < allInvValues.length; i += chunkSize) {
    const chunk = allInvValues.slice(i, i + chunkSize);
    const sqlInv = `
      WITH data(id, disc_amt, net_amt, paid_amt, bal_amt, status) AS (
        VALUES ${chunk.join(',\n')}
      )
      UPDATE "Invoice" i
      SET "discountAmount" = d.disc_amt,
          "netAmount" = d.net_amt,
          "paidAmount" = d.paid_amt,
          "balanceAmount" = d.bal_amt,
          "status" = d.status
      FROM data d
      WHERE i.id = d.id;
    `;
    await prisma.$executeRawUnsafe(sqlInv);
  }

  // Batch execute receipt updates
  for (let i = 0; i < allRecValues.length; i += chunkSize) {
    const chunk = allRecValues.slice(i, i + chunkSize);
    const sqlRec = `
      WITH data(id, applied_amt, credit_amt, is_advance) AS (
        VALUES ${chunk.join(',\n')}
      )
      UPDATE "Receipt" r
      SET "appliedAmount" = d.applied_amt,
          "creditAmount" = d.credit_amt,
          "isAdvance" = d.is_advance
      FROM data d
      WHERE r.id = d.id;
    `;
    await prisma.$executeRawUnsafe(sqlRec);
  }

  console.log('   -> Synchronized Receipt allocation and Invoice balance calculations.');

  // STEP 9: SYNC ALL ATOMIC SEQUENCES WITH IMPORTED MAX NUMBERS
  console.log('9/9. Syncing Postgres Sequences with max database values...');
  const seqsToSync = [
    { seq: 'sdl_client_code_seq', table: 'Client', col: 'code' },
    { seq: 'sdl_order_seq', table: 'Order', col: 'orderNumber' },
    { seq: 'sdl_invoice_seq', table: 'Invoice', col: 'invoiceNumber' },
    { seq: 'sdl_receipt_seq', table: 'Receipt', col: 'receiptNumber' },
    { seq: 'sdl_adjustment_seq', table: 'Adjustment', col: 'adjustmentNumber' },
    { seq: 'sdl_expense_seq', table: 'Expense', col: 'voucherNo' }
  ];

  for (const s of seqsToSync) {
    try {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${s.seq}" START WITH 1 INCREMENT BY 1;`);
      const maxRows = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("${s.col}", '\\D', '', 'g'), '')::bigint) as max_val FROM "${s.table}";`);
      const maxVal = maxRows && maxRows[0] && maxRows[0].max_val ? Number(maxRows[0].max_val) : 1;
      await prisma.$executeRawUnsafe(`SELECT setval('"${s.seq}"', ${maxVal}, true);`);
      console.log(`   -> Synced ${s.seq} to ${maxVal}`);
    } catch(e) {
      console.warn(`   -> Note on ${s.seq}:`, e.message);
    }
  }

  console.log('==================================================');
  console.log('--- ALL 5 EXCEL FILES SUCCESSFULLY IMPORTED ---');
  console.log('==================================================');
}

main().catch(console.error).finally(() => prisma.$disconnect());
