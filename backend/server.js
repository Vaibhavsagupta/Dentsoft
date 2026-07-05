const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 5000;

const path = require('path');
const multer = require('multer');
const fs = require('fs');

app.use(cors());
app.use(express.json());

// --- MANUAL MIGRATION REMOVED ---
// Migrations should be done via Prisma.

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// --- EXPENSES ---
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({ orderBy: { id: 'desc' } });
    res.json(expenses);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/expenses/next-number', async (req, res) => {
  try {
    const last = await prisma.expense.findFirst({ orderBy: { id: 'desc' } });
    const count = last ? last.id : 0;
    res.json({ nextNumber: (count + 1).toString().padStart(5, '0') });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const data = { ...req.body };
    data.amount = Number(data.amount);
    data.date = toDate(data.date) || new Date();
    
    const expense = await prisma.expense.create({ data });
    res.status(201).json(expense);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Serve static files securely
app.use((req, res, next) => {
    if (req.path.includes('.env') || req.path.includes('.db') || req.path.includes('backend/')) {
        return res.status(403).send('Forbidden');
    }
    next();
});
app.use(express.static(path.join(__dirname, '..')));
// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Helper for numeric fields
const toNum = (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null);
const toMoney = (val) => (val !== undefined && val !== null && val !== "" ? Math.round(Number(val) * 1000) / 1000 : 0);
const toDate = (val) => (val && val !== "" ? new Date(val) : null);
const parseLocalDateStart = (dateStr) => {
  if (!dateStr || dateStr === "") return null;
  return new Date(dateStr + 'T00:00:00+04:00');
};
const parseLocalDateEnd = (dateStr) => {
  if (!dateStr || dateStr === "") return null;
  return new Date(dateStr + 'T23:59:59.999+04:00');
};

async function recalculateClientBalances(clientId, tx = prisma) {
  if (!clientId) return;
  const invoices = await tx.invoice.findMany({
    where: { clientId: Number(clientId), NOT: { status: 'Cancelled' } },
    orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }]
  });
  
  const adjustments = await tx.adjustment.findMany({
    where: { clientId: Number(clientId) }
  });
  
  const receipts = await tx.receipt.findMany({
    where: { clientId: Number(clientId) },
    orderBy: [{ receiptDate: 'asc' }, { id: 'asc' }]
  });
  
  const invoiceTrak = invoices.map(inv => {
    let remaining = inv.netAmount;
    const invAdjs = adjustments.filter(a => a.invoiceId === inv.id);
    let adjCredit = 0;
    let adjDebit = 0;
    invAdjs.forEach(a => {
      if (a.type === 'Credit') adjCredit += a.amount;
      else if (a.type === 'Debit') adjDebit += a.amount;
    });
    
    remaining = remaining - adjCredit + adjDebit;
    
    return {
      id: inv.id,
      netAmount: inv.netAmount,
      adjCredit,
      adjDebit,
      remaining: Math.max(0, remaining),
      paidFromReceipts: 0
    };
  });
  
  let totalExcess = 0;
  const receiptTrak = receipts.map(r => ({
    id: r.id,
    amount: r.amount,
    remaining: r.amount
  }));
  
  for (const r of receiptTrak) {
    for (const inv of invoiceTrak) {
      if (r.remaining <= 0) break;
      if (inv.remaining <= 0) continue;
      
      const allocated = Math.min(r.remaining, inv.remaining);
      r.remaining -= allocated;
      inv.remaining -= allocated;
      inv.paidFromReceipts += allocated;
    }
    totalExcess += r.remaining;
  }
  
  for (const inv of invoiceTrak) {
    const totalPaid = inv.paidFromReceipts + inv.adjCredit - inv.adjDebit;
    const balance = Math.max(0, inv.netAmount - totalPaid);
    let status = 'Awaiting to Paid';
    if (balance <= 0) {
      status = 'Paid';
    } else if (totalPaid > 0) {
      status = 'Partially Paid';
    }
    
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        paidAmount: toMoney(totalPaid),
        balanceAmount: toMoney(balance),
        status: status
      }
    });
  }
  
  await tx.client.update({
    where: { id: Number(clientId) },
    data: {
      advanceBalance: toMoney(totalExcess)
    }
  });
  
  for (const r of receiptTrak) {
    const applied = r.amount - r.remaining;
    await tx.receipt.update({
      where: { id: r.id },
      data: {
        appliedAmount: toMoney(applied),
        creditAmount: toMoney(r.remaining)
      }
    });
  }
}

// --- CLIENTS ---
app.get('/api/clients', async (req, res) => {
  try {
    const { search } = req.query;
    let where = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { phone: { contains: search } },
        { cellPhone: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const clients = await prisma.client.findMany({ 
      where,
      include: { orders: { include: { shipmentNote: true } }, invoices: true, receipts: true, shipmentNotes: true },
      orderBy: { name: 'asc' }
    });
    res.json(clients);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/clients', async (req, res) => {
  try {
    const data = { ...req.body };
    
    // Auto-generate code if missing
    if (!data.code) {
      const count = await prisma.client.count();
      data.code = (count + 1).toString().padStart(5, '0');
    }

    data.discountPercentage = toNum(data.discountPercentage) || 0;
    data.creditLimit = toNum(data.creditLimit) || 0;
    data.openingBalance = toNum(data.openingBalance) || 0;
    data.paymentTermsDays = toNum(data.paymentTermsDays) || 0;
    data.advanceBalance = toNum(data.advanceBalance) || 0;
    
    const client = await prisma.client.create({ data });
    res.status(201).json(client);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: Number(req.params.id) },
      include: { 
        orders: { include: { shipmentNote: true } }, 
        shipmentNotes: {
          include: { orders: true }
        }, 
        invoices: true, 
        receipts: true 
      }
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.discountPercentage !== undefined) data.discountPercentage = toNum(data.discountPercentage);
    if (data.creditLimit !== undefined) data.creditLimit = toNum(data.creditLimit);
    if (data.advanceBalance !== undefined) data.advanceBalance = toNum(data.advanceBalance);
    const client = await prisma.client.update({ where: { id: Number(req.params.id) }, data });
    res.json(client);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- ORDERS ---

app.get('/api/client-product-rate', async (req, res) => {
  const { clientId, productName } = req.query;
  if (!clientId || !productName) return res.status(400).json({ error: 'Missing parameters' });
  
  try {
    const lastJob = await prisma.orderJob.findFirst({
      where: {
        order: { clientId: Number(clientId) },
        productName: productName
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (lastJob) {
      return res.json({ rate: lastJob.price });
    }
    
    // Fallback to Order model if no job is found (legacy orders)
    const lastOrder = await prisma.order.findFirst({
      where: {
        clientId: Number(clientId),
        productName: productName
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (lastOrder && lastOrder.price) {
      // In old schema, price was unit rate
      return res.json({ rate: lastOrder.price });
    }
    
    res.json({ rate: null });
  } catch (error) {
    console.error('Error fetching client product rate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { status, search, clientSearch, clientId, invoiceStatus, invoiceId, shippingStatus, dateFrom, dateTo } = req.query;
    let where = { AND: [] };
    
    if (status && status !== 'all') {
      if (status === 'overdue') {
        where.AND.push({ dueDate: { lt: new Date() } });
        where.AND.push({ status: { notIn: ['Delivered', 'Cancelled'] } });
      } else if (status === 'repeat') {
        where.AND.push({ orderType: { in: ['Repeat', 'Repair'] } });
      } else {
        where.AND.push({ status: status });
      }
    }

    if (shippingStatus) {
      where.AND.push({ shippingStatus: shippingStatus });
    }

    if (dateFrom || dateTo) {
      let dateFilter = {};
      if (dateFrom) dateFilter.gte = parseLocalDateStart(dateFrom);
      if (dateTo) dateFilter.lte = parseLocalDateEnd(dateTo);
      const dateField = req.query.dateField || 'receivedDate';
      where.AND.push({ [dateField]: dateFilter });
    }

    if (clientId) {
      where.AND.push({ clientId: Number(clientId) });
    }
    if (invoiceId) {
      where.AND.push({ invoiceId: Number(invoiceId) });
    }
    if (invoiceStatus) {
      if (invoiceStatus === 'Pending') {
        where.AND.push({ invoiceId: null });
      } else if (invoiceStatus === 'Invoiced') {
        where.AND.push({ invoiceId: { not: null } });
      }
    }

    if (search) {
      where.AND.push({
        OR: [
          { patientName: { contains: search } },
          { orderNumber: { contains: search } },
          { modelNumber: { contains: search } },
          { id: isNaN(Number(search)) ? undefined : Number(search) }
        ].filter(Boolean)
      });
    }

    if (clientSearch) {
      where.AND.push({
        client: {
          OR: [
            { name: { contains: clientSearch } },
            { code: { contains: clientSearch } },
            { cellPhone: { contains: clientSearch } },
            { email: { contains: clientSearch } }
          ]
        }
      });
    }

    const orders = await prisma.order.findMany({ 
      where,
      include: { client: true, shipmentNote: true, invoice: true, jobs: true },
      orderBy: { id: 'desc' }
    });
    res.json(orders);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const data = { ...req.body };
    data.clientId = Number(data.clientId);
    
    // Extract jobs array if provided
    const jobsData = data.jobs || [];
    delete data.jobs;

    // Map frontend fields to Prisma schema
    if (data.workType !== undefined) {
      data.productType = data.workType;
      delete data.workType;
    } 
    
    if (!data.productType) {
      data.productType = 'General'; // Fallback
    }

    if (data.instructions !== undefined) {
      data.notes = data.instructions;
      delete data.instructions;
    }

    data.age = toNum(data.age);
    data.price = toMoney(data.price) || 0;
    data.discountAmount = toMoney(data.discountAmount) || 0;
    data.taxAmount = toMoney(data.taxAmount) || 0;
    
    let jobsTotal = 0;
    if (jobsData && jobsData.length > 0) {
      jobsTotal = jobsData.reduce((sum, job) => sum + (toMoney(job.totalAmount) || toMoney(job.price) || 0), 0);
    }
    
    const basePrice = (jobsData && jobsData.length > 0) ? 0 : (toMoney(data.price) || 0);
    data.grossAmount = Math.round((basePrice + jobsTotal) * 1000) / 1000;
    data.netAmount = toMoney(req.body.netAmount) || Math.round((data.grossAmount - (data.discountAmount || 0) + (data.taxAmount || 0)) * 1000) / 1000;
    data.totalAmount = data.netAmount;
    
    data.receivedDate = toDate(data.receivedDate) || new Date();
    data.dueDate = toDate(data.dueDate);
    data.trialDate = toDate(data.trialDate);
    data.finishDate = toDate(data.finishDate);
    data.holdFrom = toDate(data.holdFrom);
    data.cancelledOn = toDate(data.cancelledOn);
    
    // Ensure boolean types
    if (data.hasUpperImpression !== undefined) data.hasUpperImpression = !!data.hasUpperImpression;
    if (data.hasLowerImpression !== undefined) data.hasLowerImpression = !!data.hasLowerImpression;
    if (data.hasBite !== undefined) data.hasBite = !!data.hasBite;
    if (data.hasWaxUp !== undefined) data.hasWaxUp = !!data.hasWaxUp;
    if (data.hasOldRestoration !== undefined) data.hasOldRestoration = !!data.hasOldRestoration;
    if (data.hasArticulator !== undefined) data.hasArticulator = !!data.hasArticulator;
    if (data.hasPhotos !== undefined) data.hasPhotos = !!data.hasPhotos;

    // Define allowed fields to prevent Prisma errors
    const allowedFields = [
      'orderNumber', 'orderType', 'clientId', 'doctorName', 'patientName', 'gender', 'age',
      'productType', 'productName', 'material', 'teethSelection', 'shade1', 'shade2', 'shade3',
      'shadeNotes', 'stumpShade', 'priority', 'status', 'receivedDate', 'dueDate', 'trialDate',
      'finishDate', 'hasUpperImpression', 'hasLowerImpression', 'hasBite', 'hasWaxUp',
      'hasOldRestoration', 'hasArticulator', 'hasPhotos', 'notes', 'price', 'discount', 'tax',
      'totalAmount', 'grossAmount', 'discountAmount', 'taxAmount', 'netAmount', 'technician',
      'department', 'modelNumber', 'panTrayNumber', 'deliveryMethod', 'articulatorTag',
      'manufacturer', 'subDoctor', 'dropLocation', 'timeSlot', 'shippingStatus',
      'shipmentNoteId', 'invoiceId', 'slab1Rate', 'slab2Rate', 'slab1Units', 'slab2Units', 'units',
      'holdFrom', 'holdReason', 'cancelledOn', 'cancelledReason'
    ];

    const cleanData = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) cleanData[f] = data[f];
    });

    // Handle nested jobs creation
    if (jobsData.length > 0) {
      cleanData.jobs = {
        create: jobsData.map(job => ({
          productType: job.productType || 'General',
          productName: job.productName,
          material: job.material,
          teethSelection: job.teethSelection,
          shade1: job.shade1,
          shade2: job.shade2,
          shade3: job.shade3,
          shadeNotes: job.shadeNotes,
          stumpShade: job.stumpShade,
          units: toNum(job.units) || 1,
          price: toMoney(job.price) || 0,
          totalAmount: toMoney(job.totalAmount) || 0,
          slab1Rate: toNum(job.slab1Rate),
          slab2Rate: toNum(job.slab2Rate),
          slab1Units: toNum(job.slab1Units),
          slab2Units: toNum(job.slab2Units)
        }))
      };
      // Update the main order fields to match the first job for backward compatibility
      const firstJob = jobsData[0];
      cleanData.productName = firstJob.productName || firstJob.product || null;
      cleanData.productType = firstJob.productType || firstJob.type || 'General';
      cleanData.units = toNum(firstJob.units) || 1;
      cleanData.price = toNum(firstJob.price) || toNum(firstJob.rate) || 0;
    } else if (cleanData.productName) {
      const uRate = toNum(req.body.unitRate) || toNum(cleanData.price) || 0;
      cleanData.jobs = {
        create: [{
          productType: cleanData.productType || 'General',
          productName: cleanData.productName,
          material: cleanData.material,
          teethSelection: cleanData.teethSelection,
          shade1: cleanData.shade1,
          shade2: cleanData.shade2,
          shade3: cleanData.shade3,
          shadeNotes: cleanData.shadeNotes,
          stumpShade: cleanData.stumpShade,
          units: toNum(cleanData.units) || 1,
          price: uRate,
          totalAmount: toNum(cleanData.totalAmount) || 0,
          slab1Rate: toNum(cleanData.slab1Rate),
          slab2Rate: toNum(cleanData.slab2Rate),
          slab1Units: toNum(cleanData.slab1Units),
          slab2Units: toNum(cleanData.slab2Units)
        }]
      };
    }

    const order = await prisma.order.create({ 
      data: cleanData,
      include: { jobs: true }
    });

    // Update Global Product Prices
    if (jobsData && jobsData.length > 0) {
      for (const j of jobsData) {
        if (j.productName && (j.price !== undefined || j.rate !== undefined)) {
           const pCharge = Number(j.price) || Number(j.rate) || 0;
           await prisma.product.updateMany({
             where: { name: j.productName },
             data: { charge: pCharge }
           });
        }
      }
    } else if (cleanData.productName && (req.body.unitRate !== undefined || cleanData.price !== undefined)) {
       const pCharge = req.body.unitRate !== undefined ? Number(req.body.unitRate) : Number(cleanData.price);
       await prisma.product.updateMany({
         where: { name: cleanData.productName },
         data: { charge: pCharge || 0 }
       });
    }

    res.status(201).json(order);
  } catch (error) { 
    console.error("Create order error:", error);
    res.status(500).json({ error: error.message }); 
  }
});
// Orders Summary (Aggregated by Client)
app.get('/api/orders/summary', async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    let start = new Date(startDate);
    let end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const clients = await prisma.client.findMany({
      include: {
        orders: {
          where: {
            receivedDate: {
              gte: start,
              lte: end
            }
          }
        }
      }
    });

    const summary = clients.map(client => {
      const totalValue = client.orders.reduce((sum, order) => sum + (order.netAmount || 0), 0);
      return {
        id: client.id,
        name: client.name,
        code: client.code,
        phone: client.phone,
        cellPhone: client.cellPhone,
        city: client.city,
        email: client.email,
        value: totalValue.toFixed(3),
        num: client.orders.length
      };
    });

    // Filter out clients with no orders in that period to match screenshot behavior
    const filteredSummary = summary.filter(s => s.num > 0);

    res.json(filteredSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      include: { client: true, invoice: true, shipmentNote: true, jobs: true }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const existingOrder = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      include: { jobs: true }
    });
    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });

    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.age) data.age = toNum(data.age);
    if (data.price) data.price = toMoney(data.price);
    if (data.discountAmount) data.discountAmount = toMoney(data.discountAmount);
    if (data.taxAmount) data.taxAmount = toMoney(data.taxAmount);
    if (data.netAmount) data.netAmount = toNum(data.netAmount);
    if (data.totalAmount) data.totalAmount = toNum(data.totalAmount);
    
    if (data.receivedDate !== undefined) data.receivedDate = toDate(data.receivedDate);
    if (data.dueDate !== undefined) data.dueDate = toDate(data.dueDate);
    if (data.trialDate !== undefined) data.trialDate = toDate(data.trialDate);
    if (data.finishDate !== undefined) data.finishDate = toDate(data.finishDate);
    if (data.holdFrom !== undefined) data.holdFrom = toDate(data.holdFrom);
    if (data.cancelledOn !== undefined) data.cancelledOn = toDate(data.cancelledOn);

    // Define allowed fields for update
    const allowedFields = [
      'orderNumber', 'orderType', 'clientId', 'doctorName', 'patientName', 'gender', 'age',
      'productType', 'productName', 'material', 'teethSelection', 'shade1', 'shade2', 'shade3',
      'shadeNotes', 'stumpShade', 'priority', 'status', 'receivedDate', 'dueDate', 'trialDate',
      'finishDate', 'hasUpperImpression', 'hasLowerImpression', 'hasBite', 'hasWaxUp',
      'hasOldRestoration', 'hasArticulator', 'hasPhotos', 'notes', 'price', 'discount', 'tax',
      'totalAmount', 'grossAmount', 'discountAmount', 'taxAmount', 'netAmount', 'technician',
      'department', 'modelNumber', 'panTrayNumber', 'deliveryMethod', 'articulatorTag',
      'manufacturer', 'subDoctor', 'dropLocation', 'timeSlot', 'shippingStatus',
      'shipmentNoteId', 'invoiceId', 'slab1Rate', 'slab2Rate', 'slab1Units', 'slab2Units', 'units',
      'holdFrom', 'holdReason', 'cancelledOn', 'cancelledReason'
    ];

    const cleanData = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) cleanData[f] = data[f];
    });

    if (data.status === 'Complete') {
      cleanData.shippingStatus = 'Pending';
    }

    let updateJobsQuery = {};
    if (req.body.jobs && Array.isArray(req.body.jobs)) {
      updateJobsQuery = {
        jobs: {
          deleteMany: {},
          create: req.body.jobs.map(j => ({
            productName: j.productName || j.product || null,
            productType: j.productType || j.type || 'General',
            teethSelection: j.teethSelection || (Array.isArray(j.teeth) ? j.teeth.join(', ') : j.teeth) || null,
            units: toNum(j.units) || 1,
            price: toMoney(j.price) || toNum(j.rate) || 0,
            totalAmount: toMoney(j.totalAmount) || toNum(j.total) || 0,
            slab1Rate: toNum(j.slab1Rate),
            slab2Rate: toNum(j.slab2Rate),
            slab1Units: toNum(j.slab1Units),
            slab2Units: toNum(j.slab2Units)
          }))
        }
      };
      
      // Update the main order fields to match the first job for backward compatibility
      if (req.body.jobs.length > 0) {
          const firstJob = req.body.jobs[0];
          cleanData.productName = firstJob.productName || firstJob.product || null;
          cleanData.productType = firstJob.productType || firstJob.type || 'General';
          cleanData.units = toNum(firstJob.units) || 1;
          cleanData.price = toNum(firstJob.price) || toNum(firstJob.rate) || 0;
      }

      // Recalculate netAmount and totalAmount based on jobs
      const jobsTotal = req.body.jobs.reduce((sum, j) => sum + (toMoney(j.totalAmount) || toNum(j.total) || (toNum(j.units) || 1) * (toMoney(j.price) || toNum(j.rate) || 0)), 0);
      cleanData.grossAmount = jobsTotal;
      cleanData.netAmount = jobsTotal - (toNum(cleanData.discountAmount) || toMoney(data.discountAmount) || 0) + (toNum(cleanData.taxAmount) || toMoney(data.taxAmount) || 0);
      cleanData.totalAmount = cleanData.netAmount;
    } else {
      // Fallback to totalAmount if price is not explicitly set in the request body
      const finalPrice = cleanData.price !== undefined ? cleanData.price : (cleanData.totalAmount !== undefined ? cleanData.totalAmount : existingOrder.price);
      const finalUnits = cleanData.units !== undefined ? cleanData.units : existingOrder.units;
      const finalDiscount = cleanData.discountAmount !== undefined ? cleanData.discountAmount : existingOrder.discountAmount;
      const finalTax = cleanData.taxAmount !== undefined ? cleanData.taxAmount : existingOrder.taxAmount;

      // Ensure cleanData has the updated price and units so they are persisted in Order table
      cleanData.price = finalPrice;
      cleanData.units = finalUnits;

      if (existingOrder.jobs && existingOrder.jobs.length > 1) {
        // Recalculate using the updated first job (finalPrice) + other unchanged jobs
        const otherJobsTotal = existingOrder.jobs.slice(1).reduce((sum, j) => sum + j.totalAmount, 0);
        const grossAmount = finalPrice + otherJobsTotal;
        cleanData.grossAmount = grossAmount;
        cleanData.netAmount = grossAmount - finalDiscount + finalTax;
        cleanData.totalAmount = cleanData.netAmount;
      } else {
        cleanData.grossAmount = finalPrice;
        cleanData.netAmount = finalPrice - finalDiscount + finalTax;
        cleanData.totalAmount = cleanData.netAmount;
      }
    }

    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { ...cleanData, ...updateJobsQuery }
    });

    // Synchronize first/single job in database if no jobs were provided in request
    if (!req.body.jobs) {
      const finalPrice = cleanData.price !== undefined ? cleanData.price : existingOrder.price;
      const finalUnits = cleanData.units !== undefined ? cleanData.units : existingOrder.units;
      const existingJobs = await prisma.orderJob.findMany({ where: { orderId: Number(req.params.id) } });
      const jobData = {
        productType: cleanData.productType || existingOrder.productType || 'General',
        productName: cleanData.productName !== undefined ? cleanData.productName : existingOrder.productName,
        material: cleanData.material !== undefined ? cleanData.material : existingOrder.material,
        teethSelection: cleanData.teethSelection !== undefined ? cleanData.teethSelection : existingOrder.teethSelection,
        shade1: cleanData.shade1 !== undefined ? cleanData.shade1 : existingOrder.shade1,
        shade2: cleanData.shade2 !== undefined ? cleanData.shade2 : existingOrder.shade2,
        shade3: cleanData.shade3 !== undefined ? cleanData.shade3 : existingOrder.shade3,
        shadeNotes: cleanData.shadeNotes !== undefined ? cleanData.shadeNotes : existingOrder.shadeNotes,
        stumpShade: cleanData.stumpShade !== undefined ? cleanData.stumpShade : existingOrder.stumpShade,
        units: finalUnits,
        price: toNum(req.body.unitRate) || finalPrice || 0,
        totalAmount: finalPrice,
        slab1Rate: cleanData.slab1Rate !== undefined ? cleanData.slab1Rate : existingOrder.slab1Rate,
        slab2Rate: cleanData.slab2Rate !== undefined ? cleanData.slab2Rate : existingOrder.slab2Rate,
        slab1Units: cleanData.slab1Units !== undefined ? cleanData.slab1Units : existingOrder.slab1Units,
        slab2Units: cleanData.slab2Units !== undefined ? cleanData.slab2Units : existingOrder.slab2Units
      };

      if (existingJobs.length > 0) {
        await prisma.orderJob.update({
          where: { id: existingJobs[0].id },
          data: jobData
        });
      } else if (cleanData.productName || existingOrder.productName) {
        await prisma.orderJob.create({
          data: { ...jobData, orderId: Number(req.params.id) }
        });
      }
    }

    // Update Global Product Prices on Edit
    if (req.body.jobs && Array.isArray(req.body.jobs)) {
        for (const j of req.body.jobs) {
          const pName = j.productName || j.product || null;
          if (pName && (j.price !== undefined || j.rate !== undefined)) {
             const pCharge = Number(j.price) || Number(j.rate) || 0;
             await prisma.product.updateMany({
               where: { name: pName },
               data: { charge: pCharge }
             });
          }
        }
    } else if (cleanData.productName && (req.body.unitRate !== undefined || cleanData.price !== undefined)) {
         const pCharge = req.body.unitRate !== undefined ? Number(req.body.unitRate) : Number(cleanData.price);
         await prisma.product.updateMany({
           where: { name: cleanData.productName },
           data: { charge: pCharge || 0 }
         });
    }
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    // First, delete related OrderMedia to avoid foreign key constraints
    await prisma.media.deleteMany({
      where: { orderId: id }
    });
    
    // Delete related OrderJobs to avoid foreign key constraints
    await prisma.orderJob.deleteMany({
      where: { orderId: id }
    });
    
    // Then delete the order
    await prisma.order.delete({
      where: { id: id }
    });
    res.json({ success: true });
  } catch (error) { 
    console.error("Delete order error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

// --- ORDER IMAGES ---
app.post('/api/orders/:id/images', upload.array('files'), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const mediaEntries = files.map(f => ({
      orderId,
      url: `/backend/uploads/${f.filename}`, // Adjust based on your serving path
      filename: f.originalname,
      mimetype: f.mimetype
    }));

    await prisma.media.createMany({ data: mediaEntries });
    res.json({ message: 'Files uploaded successfully', count: files.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/orders/:id/images', async (req, res) => {
  try {
    const media = await prisma.media.findMany({
      where: { orderId: Number(req.params.id) }
    });
    res.json(media);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- SHIPMENT NOTES (Defined below to avoid duplicates) ---

// --- DELIVERY PLANS ---
app.get('/api/delivery-plans', async (req, res) => {
  try {
    const plans = await prisma.deliveryPlan.findMany({ include: { driver: true, shipmentNotes: true } });
    res.json(plans);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/delivery-plans', async (req, res) => {
  try {
    const { shipmentNoteIds, ...rest } = req.body;
    const data = { ...rest };
    if (data.driverId) data.driverId = Number(data.driverId);
    data.planDate = toDate(data.planDate) || new Date();
    
    const plan = await prisma.deliveryPlan.create({
      data: {
        ...data,
        shipmentNotes: { connect: (shipmentNoteIds || []).map(id => ({ id: Number(id) })) }
      }
    });
    
    res.status(201).json(plan);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- OVERVIEW STATS ---
app.get('/api/overview/stats', async (req, res) => {
  try {
    const { date, criteria } = req.query;
    let where = {};
    
    if (date && criteria !== 'Current Status') {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      if (criteria === 'Order Date' || criteria === 'Date In') {
        where.receivedDate = { gte: startOfDay, lte: endOfDay };
      } else if (criteria === 'Due Date') {
        where.dueDate = { gte: startOfDay, lte: endOfDay };
      } else if (criteria === 'Status Date') {
        where.updatedAt = { gte: startOfDay, lte: endOfDay };
      }
    }

    const orders = await prisma.order.findMany({ where, select: { status: true } });
    
    const stats = {
      'New': 0, 'In Production': 0, 'Complete': 0, 'Delivered': 0, 
      'Hold': 0, 'Try In': 0, 'Cancelled': 0
    };
    
    orders.forEach(o => {
      let s = o.status;
      if (s === 'On Hold') s = 'Hold';
      if (stats[s] !== undefined) {
        stats[s]++;
      }
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PICKUP & RETURNS ---
app.get('/api/pickup-returns', async (req, res) => {
  try {
    const items = await prisma.pickupReturn.findMany({ include: { order: { include: { client: true, jobs: true } } } });
    res.json(items);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/pickup-returns', async (req, res) => {
  try {
    const data = { ...req.body };
    data.orderId = Number(data.orderId);
    data.pickupDate = toDate(data.pickupDate);
    const item = await prisma.pickupReturn.create({ data });
    res.status(201).json(item);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- INVOICES ---
app.get('/api/invoices', async (req, res) => {
  try {
    const { status, search, clientId } = req.query;
    let where = {};

    if (status) {
      if (status === 'Unpaid') {
        where.status = { in: ['Unpaid', 'Partial'] };
      } else {
        where.status = status;
      }
    }
    if (clientId) where.clientId = Number(clientId);
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { client: { name: { contains: search } } },
        { client: { code: { contains: search } } },
        { client: { cellPhone: { contains: search } } },
        { client: { email: { contains: search } } }
      ];
    }

    const invoices = await prisma.invoice.findMany({ 
      where,
      include: { client: true, orders: true, adjustments: true },
      orderBy: { invoiceDate: 'desc' }
    });
    res.json(invoices);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

async function generateUniqueInvoiceNumber() {
  const invoices = await prisma.invoice.findMany({
    select: { invoiceNumber: true }
  });
  const existingNums = new Set(
    invoices
      .map(i => parseInt(i.invoiceNumber, 10))
      .filter(num => !isNaN(num) && num >= 1000 && num <= 99999 && /^\d{4,5}$/.test(num.toString()))
  );
  
  let candidate = 1000;
  if (existingNums.size > 0) {
    const maxVal = Math.max(...existingNums);
    if (maxVal < 99999) {
      candidate = maxVal + 1;
    }
  }
  
  if (existingNums.has(candidate) || candidate > 99999) {
    candidate = 1000;
    while (candidate <= 99999 && existingNums.has(candidate)) {
      candidate++;
    }
  }
  
  if (candidate > 99999) {
    throw new Error("No unique 4-5 digit invoice numbers are available!");
  }
  
  return candidate.toString();
}

app.post('/api/invoices', async (req, res) => {
  try {
    const { orderIds, ...rest } = req.body;
    const data = { ...rest };
    
    // If clientId is missing, get it from the first order
    if (!data.clientId && orderIds && orderIds.length > 0) {
      const firstOrder = await prisma.order.findUnique({ where: { id: Number(orderIds[0]) } });
      if (firstOrder) data.clientId = firstOrder.clientId;
    } else {
      data.clientId = Number(data.clientId);
    }

    if (!data.invoiceNumber || data.invoiceNumber.toString().trim() === '') {
      data.invoiceNumber = await generateUniqueInvoiceNumber();
    } else {
      const val = parseInt(data.invoiceNumber, 10);
      if (!/^\d{4,5}$/.test(data.invoiceNumber.toString()) || isNaN(val) || val < 1000 || val > 99999) {
        return res.status(400).json({ error: 'Invoice number must be a 4 to 5 digit number (1000 - 99999).' });
      }
      const existing = await prisma.invoice.findUnique({
        where: { invoiceNumber: data.invoiceNumber.toString() }
      });
      if (existing) {
        return res.status(400).json({ error: 'Invoice number already exists. Please choose a unique one.' });
      }
    }

    let computedGross = 0;
    if (orderIds && orderIds.length > 0) {
      const ordersToInvoice = await prisma.order.findMany({
        where: { id: { in: orderIds.map(id => Number(id)) } }
      });
      computedGross = ordersToInvoice.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    }

    data.grossAmount = toNum(data.grossAmount) || computedGross;
    data.discountAmount = toMoney(data.discountAmount) || 0;
    data.taxAmount = toMoney(data.taxAmount) || 0;
    data.netAmount = toNum(data.netAmount) || (data.grossAmount - data.discountAmount + data.taxAmount);
    data.paidAmount = toNum(data.paidAmount) || 0;
    data.balanceAmount = data.netAmount - data.paidAmount;
    data.invoiceDate = toDate(data.invoiceDate) || new Date();
    data.dueDate = toDate(data.dueDate) || data.invoiceDate;
    
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          ...data
        }
      });
      
      if (orderIds && orderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: orderIds.map(id => Number(id)) } },
          data: { invoiceId: created.id }
        });
      }
      
      await recalculateClientBalances(created.clientId, tx);
      return created;
    });
    
    res.status(201).json(invoice);
  } catch (error) { 
    console.error("Invoice Creation Error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const id = req.params.id;
    res.redirect(`/invoice.html?id=${id}&download=true`);
  } catch (error) { 
    console.error("PDF Redirect Error:", error);
    res.status(500).json({ error: error.message }); 
  }
});


app.get('/api/invoices/:id', async (req, res) => {
  try {
    const idParam = req.params.id;
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: isNaN(Number(idParam)) ? -1 : Number(idParam) },
          { invoiceNumber: idParam }
        ]
      },
      include: { client: true, orders: { include: { jobs: true } }, adjustments: true }
    });
    
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Recovery logic: If orders array is empty, explicitly fetch orders linked to this invoice
    if (!invoice.orders || invoice.orders.length === 0) {
      const recoveredOrders = await prisma.order.findMany({
        where: { invoiceId: invoice.id },
        include: { client: true, jobs: true }
      });
      if (recoveredOrders.length > 0) {
        invoice.orders = recoveredOrders;
      }
    }

    res.json(invoice);
  } catch (error) { 
    console.error("Invoice Fetch Error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.invoiceDate) data.invoiceDate = toDate(data.invoiceDate);
    if (data.dueDate) data.dueDate = toDate(data.dueDate);
    if (data.netAmount) {
      data.netAmount = toNum(data.netAmount);
      data.balanceAmount = data.netAmount - (toNum(data.paidAmount) || 0);
    }

    if (data.invoiceNumber) {
      const val = parseInt(data.invoiceNumber, 10);
      if (!/^\d{4,5}$/.test(data.invoiceNumber.toString()) || isNaN(val) || val < 1000 || val > 99999) {
        return res.status(400).json({ error: 'Invoice number must be a unique 4 to 5 digit number (1000 - 99999).' });
      }
      const existing = await prisma.invoice.findFirst({
        where: {
          invoiceNumber: data.invoiceNumber.toString(),
          id: { not: Number(req.params.id) }
        }
      });
      if (existing) {
        return res.status(400).json({ error: 'Invoice number already exists. Please choose a unique one.' });
      }
    }

    const invoice = await prisma.invoice.update({
      where: { id: Number(req.params.id) },
      data
    });
    await recalculateClientBalances(invoice.clientId);
    res.json(invoice);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- RECEIPTS ---
app.get('/api/receipts', async (req, res) => {
  try {
    const { status, search, clientId } = req.query;
    let where = {};

    if (status) where.status = status;
    if (clientId) where.clientId = Number(clientId);
    if (search) {
      where.OR = [
        { receiptNumber: { contains: search } },
        { client: { name: { contains: search } } },
        { client: { code: { contains: search } } },
        { client: { cellPhone: { contains: search } } },
        { client: { email: { contains: search } } }
      ];
    }

    const receipts = await prisma.receipt.findMany({ 
      where,
      include: { client: true },
      orderBy: { receiptDate: 'desc' }
    });
    res.json(receipts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/receipts/:id', async (req, res) => {
  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id: Number(req.params.id) },
      include: { client: true }
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json(receipt);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/receipts', async (req, res) => {
  try {
    const body = req.body;
    const clientId = Number(body.clientId);
    const amount = toNum(body.amount) || 0;
    const appliedAmount = toNum(body.appliedAmount) || 0;
    const creditAmount = amount - appliedAmount;
    const receiptDate = toDate(body.receiptDate) || new Date();
    const chequeDate = toDate(body.chequeDate);
    const isAdvance = !!body.isAdvance;
    const receiptNumber = body.receiptNumber || ('REC-' + Date.now().toString());
    const paymentMode = body.paymentMode;
    const chequeNumber = body.chequeNumber;
    const notes = body.notes;
    const reference = body.reference;

    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.receipt.create({
        data: {
          receiptNumber,
          receiptDate,
          clientId,
          amount,
          appliedAmount,
          creditAmount,
          paymentMode,
          isAdvance,
          chequeNumber,
          chequeDate,
          notes,
          reference
        }
      });
      await recalculateClientBalances(clientId, tx);
      return created;
    });

    res.status(201).json(receipt);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/receipts/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.receiptDate) data.receiptDate = toDate(data.receiptDate);
    if (data.chequeDate) data.chequeDate = toDate(data.chequeDate);
    if (data.amount) data.amount = toNum(data.amount);
    if (data.appliedAmount) data.appliedAmount = toNum(data.appliedAmount);
    
    const receipt = await prisma.receipt.update({
      where: { id: Number(req.params.id) },
      data
    });
    await recalculateClientBalances(receipt.clientId);
    res.json(receipt);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const receipt = await prisma.receipt.findUnique({ where: { id } });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    
    await prisma.$transaction(async (tx) => {
      await tx.receipt.delete({ where: { id } });
      await recalculateClientBalances(receipt.clientId, tx);
    });
    res.status(204).end();
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- ADJUSTMENTS ---
app.get('/api/adjustments', async (req, res) => {
  try {
    const items = await prisma.adjustment.findMany({ include: { client: true, invoice: true } });
    res.json(items);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/adjustments', async (req, res) => {
  try {
    const data = { ...req.body };
    data.clientId = Number(data.clientId);
    if (data.invoiceId) data.invoiceId = Number(data.invoiceId);
    data.amount = toNum(data.amount);
    data.date = toDate(data.date) || new Date();
    
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.adjustment.create({ data });
      await recalculateClientBalances(created.clientId, tx);
      return created;
    });
    res.status(201).json(item);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/adjustments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const adjustment = await prisma.adjustment.findUnique({ where: { id } });
    if (!adjustment) return res.status(404).json({ error: 'Adjustment not found' });
    
    await prisma.$transaction(async (tx) => {
      await tx.adjustment.delete({ where: { id } });
      await recalculateClientBalances(adjustment.clientId, tx);
    });
    res.status(204).end();
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Duplicate staff, expenses, products, and product-types endpoints removed (defined elsewhere in CRUD section)

// --- PICKUP REQUESTS ---
app.get('/api/pickups', async (req, res) => {
  try {
    const { status, clientId, search } = req.query;
    const where = {};
    if (status && status !== 'Ignore') where.status = status;
    if (clientId) where.clientId = Number(clientId);
    if (search) {
      where.OR = [
        { patientName: { contains: search } },
        { doctorName: { contains: search } }
      ];
    }
    const pickups = await prisma.pickupRequest.findMany({
      where,
      include: { client: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(pickups);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/pickups', async (req, res) => {
  try {
    const data = { ...req.body };
    data.clientId = Number(data.clientId);
    data.requestDate = toDate(data.requestDate) || new Date();
    data.pickupDate = toDate(data.pickupDate);
    const pickup = await prisma.pickupRequest.create({ data });
    res.status(201).json(pickup);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/pickups/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.requestDate) data.requestDate = toDate(data.requestDate);
    if (data.pickupDate) data.pickupDate = toDate(data.pickupDate);
    const pickup = await prisma.pickupRequest.update({
      where: { id: Number(req.params.id) },
      data
    });
    res.json(pickup);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/pickups/:id', async (req, res) => {
  try {
    await prisma.pickupRequest.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- DAY BOOK ---
app.get('/api/day-book', async (req, res) => {
  try {
    const { date } = req.query;
    const searchDate = date ? new Date(date) : new Date();
    
    // Set start and end of the day
    const startOfDay = new Date(searchDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(searchDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [orders, invoices, receipts, expenses] = await Promise.all([
      prisma.order.findMany({
        where: { receivedDate: { gte: startOfDay, lte: endOfDay } },
        include: { client: true }
      }),
      prisma.invoice.findMany({
        where: { invoiceDate: { gte: startOfDay, lte: endOfDay } },
        include: { client: true }
      }),
      prisma.receipt.findMany({
        where: { receiptDate: { gte: startOfDay, lte: endOfDay } },
        include: { client: true }
      }),
      prisma.expense.findMany({
        where: { date: { gte: startOfDay, lte: endOfDay } }
      })
    ]);

    // Combine into a single list
    const entries = [];

    orders.forEach(o => entries.push({
      id: o.id,
      time: o.createdAt,
      type: 'Order',
      number: o.orderNumber || o.id,
      particulars: o.client.name + ' (Patient: ' + o.patientName + ')',
      in: 0,
      out: 0,
      ref: 'Order'
    }));

    invoices.forEach(i => entries.push({
      id: i.id,
      time: i.createdAt,
      type: 'Invoice',
      number: i.invoiceNumber || i.id,
      particulars: i.client.name,
      in: i.netAmount,
      out: 0,
      ref: 'Invoice'
    }));

    receipts.forEach(r => entries.push({
      id: r.id,
      time: r.createdAt,
      type: 'Receipt',
      number: r.receiptNumber || r.id,
      particulars: r.client.name + (r.paymentMode ? ' [' + r.paymentMode + ']' : ''),
      in: r.amount,
      out: 0,
      ref: 'Receipt'
    }));

    expenses.forEach(e => entries.push({
      id: e.id,
      time: e.createdAt,
      type: 'Expense',
      number: e.id,
      particulars: e.category + (e.description ? ': ' + e.description : ''),
      in: 0,
      out: e.amount,
      ref: 'Expense'
    }));

    // Sort by time
    entries.sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json(entries);
  } catch (error) { 
    console.error("Day Book Error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

// --- PICKUP RETURNS (TryIn History) ---
app.get('/api/pickup-returns', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.pickupDate = {};
      if (dateFrom) where.pickupDate.gte = parseLocalDateStart(dateFrom);
      if (dateTo) where.pickupDate.lte = parseLocalDateEnd(dateTo);
    }
    const returns = await prisma.pickupReturn.findMany({
      where,
      include: { order: { include: { client: true, jobs: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(returns);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/pickup-returns', async (req, res) => {
  try {
    const data = { ...req.body };
    data.orderId = Number(data.orderId);
    if (data.pickupDate) data.pickupDate = toDate(data.pickupDate);
    if (data.receivedDate) data.receivedDate = toDate(data.receivedDate);
    const ret = await prisma.pickupReturn.create({ data });
    res.status(201).json(ret);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- SHIPMENT NOTES ---

// Get Next Shipment Note Number
app.get('/api/shipment-notes/next-number', async (req, res) => {
  try {
    const lastNote = await prisma.shipmentNote.findFirst({
      orderBy: { id: 'desc' }
    });
    let nextNum = 1;
    if (lastNote && lastNote.noteNumber) {
      const match = lastNote.noteNumber.match(/\d+$/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
        // Reset or wrap around if exceeding 5 digits (99999)
        if (nextNum > 99999) nextNum = 1;
      }
    }
    const shipmentNumber = 'DN-' + nextNum.toString().padStart(5, '0');
    res.json({ shipmentNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/shipment-notes', async (req, res) => {
  try {
    const { clientId, search, dateFrom, dateTo } = req.query;
    const where = {};
    if (clientId) where.clientId = Number(clientId);
    if (dateFrom || dateTo) {
      where.noteDate = {};
      if (dateFrom) where.noteDate.gte = parseLocalDateStart(dateFrom);
      if (dateTo) where.noteDate.lte = parseLocalDateEnd(dateTo);
    }
    if (search) {
      where.OR = [
        { noteNumber: { contains: search } },
        { client: { name: { contains: search } } },
        { client: { code: { contains: search } } },
        { client: { cellPhone: { contains: search } } },
        { client: { email: { contains: search } } }
      ];
    }
    const notes = await prisma.shipmentNote.findMany({
      where,
      include: { client: true, orders: true, deliveryPlan: true },
      orderBy: { noteDate: 'desc' }
    });
    res.json(notes);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/shipment-notes/:id', async (req, res) => {
  try {
    const note = await prisma.shipmentNote.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        client: true,
        orders: {
          include: {
            invoice: true,
            jobs: true
          }
        }
      }
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});


app.put('/api/shipment-notes/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.noteDate) data.noteDate = toDate(data.noteDate);
    const note = await prisma.shipmentNote.update({
      where: { id: Number(req.params.id) },
      data
    });
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/shipment-notes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    // First, update associated orders to set shipmentNoteId to null
    await prisma.order.updateMany({
      where: { shipmentNoteId: id },
      data: { shipmentNoteId: null, shippingStatus: 'Pending' }
    });

    await prisma.shipmentNote.delete({
      where: { id: id }
    });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/shipment-notes', async (req, res) => {
  try {
    const { clientId, orderIds, noteNumber, noteDate, deliveryMode, notes } = req.body;
    
    if (!clientId || isNaN(Number(clientId))) {
      return res.status(400).json({ error: 'Valid clientId is required' });
    }
    
    let finalNoteNumber = noteNumber;
    if (!finalNoteNumber) {
      const lastNote = await prisma.shipmentNote.findFirst({
        orderBy: { id: 'desc' }
      });
      let nextNum = 19600; // default starting point if no previous notes
      if (lastNote && lastNote.noteNumber) {
        const match = lastNote.noteNumber.match(/\d+$/);
        if (match) nextNum = parseInt(match[0]) + 1;
      }
      finalNoteNumber = nextNum.toString();
    }
    
    const finalNoteDate = noteDate ? new Date(noteDate) : new Date();

    const note = await prisma.shipmentNote.create({
      data: {
        noteNumber: finalNoteNumber,
        noteDate: finalNoteDate,
        deliveryMode: deliveryMode || 'Courier',
        notes: notes || '',
        client: { connect: { id: Number(clientId) } },
        orders: { connect: (orderIds || []).map(id => ({ id: Number(id) })) }
      },
      include: { client: true, orders: true }
    });
    
    // Update status of orders to Delivered and shippingStatus to Dispatched
    if (orderIds && orderIds.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: orderIds.map(id => Number(id)) } },
        data: { 
          status: 'Delivered',
          shippingStatus: 'Dispatched'
        }
      });
    }
    res.status(201).json(note);
  } catch (error) { 
    console.error("Error creating shipment note:", error);
    res.status(500).json({ error: error.message }); 
  }
});

app.get('/api/delivery-plans', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.planDate = {};
      if (dateFrom) where.planDate.gte = parseLocalDateStart(dateFrom);
      if (dateTo) where.planDate.lte = parseLocalDateEnd(dateTo);
    }
    const plans = await prisma.deliveryPlan.findMany({
      where,
      include: { driver: true, shipmentNotes: true }
    });
    res.json(plans);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/delivery-plans', async (req, res) => {
  try {
    const { planDate, route, driverId } = req.body;
    const plan = await prisma.deliveryPlan.create({
      data: {
        planDate: planDate ? new Date(planDate) : new Date(),
        route: route || '',
        driver: { connect: { id: Number(driverId) } },
        status: 'Active'
      }
    });
    res.status(201).json(plan);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- DASHBOARD ---
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      newClients, newOrders, deliveries, invoiced, collection, expenses,
      newW, productionW, completeW, holdW, tryinW, deliveredW, repeatW,
      pendingTryIns, pendingOnHold, overdueInvoices,
      finalDeliveriesPendingToday, finalDeliveriesExpectedToday, tryInDeliveriesToday,
      tryInsDispatchedToday, tryInsReturnedToday
    ] = await Promise.all([
      prisma.client.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { receivedDate: { gte: today, lt: tomorrow } } }),
      prisma.shipmentNote.count({ where: { noteDate: { gte: today, lt: tomorrow } } }),
      prisma.invoice.aggregate({ where: { invoiceDate: { gte: today, lt: tomorrow } }, _sum: { netAmount: true } }),
      prisma.receipt.aggregate({ where: { receiptDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { date: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      
      prisma.order.count({ where: { status: 'New' } }),
      prisma.order.count({ where: { status: 'In Production' } }),
      prisma.order.count({ where: { status: 'Complete' } }),
      prisma.order.count({ where: { status: 'On Hold' } }),
      prisma.order.count({ where: { status: 'Try In' } }),
      prisma.order.count({ where: { status: 'Delivered' } }),
      prisma.order.count({ where: { orderType: { in: ['Repeat', 'Repair'] } } }),
      
      prisma.order.count({ where: { status: 'Try In' } }),
      prisma.order.count({ where: { status: 'On Hold' } }),
      prisma.invoice.count({ where: { status: { in: ['Unpaid', 'Partial'] }, dueDate: { lt: new Date() } } }),

      // Today's Deliveries
      prisma.order.count({ where: { dueDate: { gte: today, lt: tomorrow }, status: { notIn: ['Delivered', 'Cancelled'] } } }),
      prisma.order.count({ where: { dueDate: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { trialDate: { gte: today, lt: tomorrow }, status: { notIn: ['Delivered', 'Cancelled'] } } }),

      // Try-ins Today
      prisma.order.count({ where: { status: 'Try In', updatedAt: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { status: { not: 'Try In' }, updatedAt: { gte: today, lt: tomorrow }, trialDate: { lte: today } } }) // Simple heuristic for returned
    ]);

    const overdueCount = await prisma.order.count({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ['Delivered', 'Cancelled'] }
      }
    });

    res.json({
      performance: {
        newClients,
        newOrders,
        deliveries,
        collection: collection._sum.amount || 0,
        invoiced: invoiced._sum.netAmount || 0,
        expenses: expenses._sum.amount || 0,
        profit: (invoiced._sum.netAmount || 0) - (expenses._sum.amount || 0),
        tryInsDispatched: tryInsDispatchedToday,
        tryInsReturned: tryInsReturnedToday
      },
      workflow: {
        new: newW,
        production: productionW,
        complete: completeW,
        hold: holdW,
        tryin: tryinW,
        delivered: deliveredW,
        repeat: repeatW,
        overdue: overdueCount,
        finalPendingToday: finalDeliveriesPendingToday,
        finalExpectedToday: finalDeliveriesExpectedToday,
        tryInToday: tryInDeliveriesToday
      },
      alerts: {
        pendingTryIns,
        pendingOnHold,
        overdueInvoices
      },
      dueSchedule: [] 
    });


  } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- CALENDAR ---
app.get('/api/calendar/stats', async (req, res) => {
  try {
    const { month, year, criteria } = req.query;
    const dateField = criteria === 'Due Date' ? 'dueDate' : 
                      criteria === 'Order Date' ? 'receivedDate' : 
                      criteria === 'Date In' ? 'receivedDate' : 'updatedAt';

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, Number(month) + 1, 1);

    const orders = await prisma.order.findMany({
      where: {
        [dateField]: { gte: startDate, lt: endDate }
      },
      select: { [dateField]: true, status: true }
    });

    const stats = {};
    orders.forEach(o => {
      if (!o[dateField]) return;
      const d = new Date(o[dateField]);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!stats[dateKey]) stats[dateKey] = {};
      stats[dateKey][o.status] = (stats[dateKey][o.status] || 0) + 1;
      stats[dateKey]['Total'] = (stats[dateKey]['Total'] || 0) + 1;
    });

    res.json(stats);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/calendar/orders', async (req, res) => {
  try {
    const { date, criteria } = req.query;
    const dateField = criteria === 'Due Date' ? 'dueDate' : 
                      criteria === 'Order Date' ? 'receivedDate' : 
                      criteria === 'Date In' ? 'receivedDate' : 'updatedAt';

    const d = new Date(date);
    const dNext = new Date(d);
    dNext.setDate(dNext.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: {
        [dateField]: { gte: d, lt: dNext }
      },
      include: { client: true }
    });
    res.json(orders);
  } catch (error) { res.status(500).json({ error: error.message }); }
});



app.get('/api/dashboard/calendar', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      select: { id: true, receivedDate: true, dueDate: true, patientName: true, status: true, client: { select: { name: true } } }
    });
    const shipments = await prisma.shipmentNote.findMany({
      select: { id: true, noteDate: true, noteNumber: true, client: { select: { name: true } } }
    });

    const events = [];
    orders.forEach(o => {
      if (o.receivedDate) events.push({ type: 'start', date: o.receivedDate, title: `Start: ${o.patientName}`, client: o.client?.name, id: o.id });
      if (o.dueDate) events.push({ type: 'due', date: o.dueDate, title: `Due: ${o.patientName}`, client: o.client?.name, id: o.id });
    });
    shipments.forEach(s => {
      if (s.noteDate) events.push({ type: 'ship', date: s.noteDate, title: `Ship: ${s.noteNumber}`, client: s.client?.name, id: s.id });
    });

    res.json(events);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
// --- MATERIALS / STOCK ---
app.get('/api/materials', async (req, res) => {
  try {
    const { search, category } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search } }
      ];
    }
    if (category && category !== 'All') where.category = category;
    
    let materials = await prisma.material.findMany({ where, orderBy: { name: 'asc' } });
    
    // Auto-seed if empty for demo purposes
    if (materials.length === 0 && !search && category === 'All') {
        const demo = [
            { name: '3D EXPANSION SCREW', category: 'ORTHO', stock: 2, unit: 'pc', minStock: 0 },
            { name: '3D PRINTER FILM', category: 'RESINS', stock: 11, unit: 'pc', minStock: 0 },
            { name: '3D PRINTER TANK', category: 'ZIRCON', stock: 1, unit: 'pc', minStock: 0 },
            { name: 'ACRYLIC POWDER - BLACK 40 GM', category: 'ORTHO', stock: 1, unit: 'Bottle', minStock: 0 },
            { name: 'ALGINATE ALGINPLUS (453 GM)', category: 'ACRYLIC', stock: 0, unit: 'Packet', minStock: 0 },
            { name: 'BASE PASTE TUBE', category: 'CERAMIC', stock: 17, unit: 'Tube', minStock: 0 },
            { name: 'BASE PLATE', category: 'ACRYLIC', stock: 17, unit: 'Box', minStock: 0 },
        ];
        for (const m of demo) await prisma.material.create({ data: m });
        materials = await prisma.material.findMany({ where, orderBy: { name: 'asc' } });
    }
    // Map minStock to reorderLevel for UI parity
    const mapped = materials.map(m => ({ ...m, reorderLevel: m.minStock || 0 }));
    res.json(mapped);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/materials', async (req, res) => {
  try {
    const body = req.body;
    const data = {
      name: body.name,
      category: body.category,
      stock: toNum(body.stock) || 0,
      unit: body.unit || body.stdUnit || 'pc',
      minStock: toNum(body.reorderLevel) || toNum(body.minStock) || 0,
      code: body.code || null,
      version: body.version || null,
      favourite: !!body.favourite,
      purchaseUnit: body.purchaseUnit || null,
      stdUnit: body.stdUnit || null,
      purchaseRate: toNum(body.purchaseRate) || 0,
      retailPrice: toNum(body.retailPrice) || 0,
      taxPercent: toNum(body.taxPercent) || 0
    };
    const material = await prisma.material.create({ data });
    res.status(201).json(material);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- INVENTORY TRANSACTIONS (JSON Fallback) ---
const TRANSACTIONS_FILE = path.join(__dirname, 'inventory_transactions.json');

function getTransactions() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  } catch (e) { return []; }
}

app.get('/api/inventory/transactions/next-number', async (req, res) => {
  try {
    const { type } = req.query;
    const transactions = getTransactions().filter(t => t.type === type);
    const nextNum = (transactions.length + 1).toString().padStart(5, '0');
    res.json({ nextNumber: nextNum });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/inventory/transactions', async (req, res) => {
  try {
    const { type, search } = req.query;
    let transactions = getTransactions();
    
    if (type) transactions = transactions.filter(t => t.type === type);
    if (search) {
      const q = search.toLowerCase();
      transactions = transactions.filter(t => 
        (t.docNumber && t.docNumber.toLowerCase().includes(q)) ||
        (t.supplier && t.supplier.toLowerCase().includes(q)) ||
        (t.materialName && t.materialName.toLowerCase().includes(q))
      );
    }
    
    // Populate material object dynamically from SQLite database
    const materials = await prisma.material.findMany();
    const materialsMap = {};
    materials.forEach(m => { materialsMap[m.id] = m; });
    const populatedTransactions = transactions.map(t => ({
      ...t,
      material: materialsMap[t.materialId] || { name: t.materialName || 'Unknown', unit: 'pc' }
    }));
    
    res.json(populatedTransactions.reverse()); // Newest first
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/inventory/transactions', async (req, res) => {
  try {
    const { type, materialId, quantity, date, supplier, docNumber, notes } = req.body;
    
    const material = await prisma.material.findUnique({ where: { id: Number(materialId) } });
    if (!material) return res.status(404).json({ error: 'Material not found' });

    const newTransaction = {
      id: Date.now(),
      type,
      materialId: Number(materialId),
      materialName: material.name,
      quantity: Number(quantity),
      date: date || new Date().toISOString(),
      supplier,
      docNumber,
      notes,
      createdAt: new Date().toISOString()
    };

    // Save to JSON
    const transactions = getTransactions();
    transactions.push(newTransaction);
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));

    // Update Prisma stock
    const updateQty = type === 'Inward' ? Number(quantity) : -Number(quantity);
    await prisma.material.update({
      where: { id: Number(materialId) },
      data: { stock: { increment: updateQty } }
    });

    res.status(201).json(newTransaction);
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- STAFF / OFFICE ---
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await prisma.staff.findMany();
    res.json(staff);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/staff', async (req, res) => {
  try {
    const data = { ...req.body };
    data.salary = toNum(data.salary) || 0;
    const staff = await prisma.staff.create({ data });
    res.status(201).json(staff);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    await prisma.staff.delete({ where: { id: parseInt(req.params.id) } });
    res.status(204).send();
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- BACKUP & EXPORT ---
app.get('/api/backup/system', (req, res) => {
  const { exec } = require('child_process');
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const backupFile = path.join(tempDir, 'system_backup.zip');
  const dbFile = path.join(__dirname, 'prisma', 'dev.db');
  const envFile = path.join(__dirname, '.env');
  
  const cmd = `powershell -Command "Compress-Archive -Path '${dbFile}', '${envFile}' -DestinationPath '${backupFile}' -Force"`;
  exec(cmd, (error) => {
    if (error) return res.status(500).json({ error: error.message });
    res.download(backupFile, 'SoharDental_SystemBackup.zip');
  });
});

app.get('/api/backup/data', async (req, res) => {
  try {
    const data = {
      clients: await prisma.client.findMany(),
      orders: await prisma.order.findMany(),
      invoices: await prisma.invoice.findMany(),
      receipts: await prisma.receipt.findMany(),
      expenses: await prisma.expense.findMany(),
      staff: await prisma.staff.findMany(),
      materials: await prisma.material.findMany(),
      products: await prisma.product.findMany()
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=SoharDental_DataExport.json');
    res.send(JSON.stringify(data, null, 2));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/backup/orders-csv', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({ include: { client: true } });
    const headers = ['Order #', 'Order Date', 'Client Name', 'Patient Name', 'Product Type', 'Product Name', 'Model #', 'Status', 'Due Date', 'Total Amount', 'Discount', 'Tax', 'Net Amount'];
    const rows = orders.map(o => [
      o.orderNumber || o.id,
      o.receivedDate ? new Date(o.receivedDate).toISOString().split('T')[0] : 'N/A',
      o.client ? `"${o.client.name.replace(/"/g, '""')}"` : 'N/A',
      `"${(o.patientName || '').replace(/"/g, '""')}"`,
      `"${(o.productType || '').replace(/"/g, '""')}"`,
      `"${(o.productName || '').replace(/"/g, '""')}"`,
      `"${(o.modelNumber || '').replace(/"/g, '""')}"`,
      o.status,
      o.dueDate ? new Date(o.dueDate).toISOString().split('T')[0] : 'N/A',
      o.totalAmount || 0,
      o.discountAmount || 0,
      o.taxAmount || 0,
      o.netAmount || 0
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    // Add UTF-8 BOM for Excel
    const BOM = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=SoharDental_Orders_Full.csv');
    res.send(BOM + csvContent);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- Payment & Financial APIs ---

// Get Next Receipt Number
app.get('/api/receipts/next-number', async (req, res) => {
  try {
    const lastReceipt = await prisma.receipt.findFirst({
      orderBy: { id: 'desc' }
    });
    let nextNum = 1;
    if (lastReceipt && lastReceipt.receiptNumber) {
      const match = lastReceipt.receiptNumber.match(/\d+$/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const receiptNumber = 'RCT-' + nextNum.toString().padStart(5, '0');
    res.json({ receiptNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Financial Summary
app.get('/api/clients/:id/financial-summary', async (req, res) => {
  const clientId = parseInt(req.params.id);
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        invoices: { orderBy: { invoiceDate: 'desc' }, take: 1 },
        receipts: { orderBy: { receiptDate: 'desc' }, take: 1 }
      }
    });
    
    // Calculate balance (Simplified: sum of invoices - sum of receipts)
    const invoicesTotal = await prisma.invoice.aggregate({
      where: { clientId },
      _sum: { netAmount: true }
    });
    const receiptsTotal = await prisma.receipt.aggregate({
      where: { clientId },
      _sum: { amount: true }
    });
    
    const balance = (invoicesTotal._sum.netAmount || 0) - (receiptsTotal._sum.amount || 0);
    
    res.json({
      balance: balance.toFixed(3),
      lastInvoice: client.invoices[0],
      lastPayment: client.receipts[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SYSTEM SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const result = {};
    settings.forEach(s => {
      try {
        result[s.key] = JSON.parse(s.value);
      } catch (e) {
        result[s.key] = s.value;
      }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: req.params.key }
    });
    if (!setting) return res.json(null);
    try {
      res.json(JSON.parse(setting.value));
    } catch (e) {
      res.json(setting.value);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue }
    });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- AUTHENTICATION ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username === 'sohardentallab') {
      if (password === 'sohardentallab') {
        return res.json({ role: 'user', username: 'sohardentallab' });
      } else {
        return res.status(401).json({ error: 'Invalid password' });
      }
    } else if (username === 'soharadmin') {
      // Fetch stored admin password from database
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'admin_password' }
      });
      const dbPassword = setting ? setting.value : 'soharadmin'; // Fallback to default
      
      if (password === dbPassword) {
        return res.json({ role: 'admin', username: 'soharadmin' });
      } else {
        return res.status(401).json({ error: 'Invalid password' });
      }
    } else {
      return res.status(401).json({ error: 'Invalid username' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/update-password', async (req, res) => {
  try {
    const { currentPwd, newPwd } = req.body;
    if (!currentPwd || !newPwd) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Fetch stored admin password
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'admin_password' }
    });
    const dbPassword = setting ? setting.value : 'soharadmin';

    if (currentPwd !== dbPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update database
    await prisma.systemSetting.upsert({
      where: { key: 'admin_password' },
      update: { value: newPwd },
      create: { key: 'admin_password', value: newPwd }
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SETTING LOOKUPS ---
app.get('/api/lookups', async (req, res) => {
  try {
    const { type } = req.query;
    const where = type ? { type } : {};
    const lookups = await prisma.settingLookup.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    res.json(lookups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lookups', async (req, res) => {
  try {
    const { type, name, value } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'Type and name are required' });
    const lookup = await prisma.settingLookup.create({
      data: { type, name, value }
    });
    res.status(201).json(lookup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/lookups/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, value } = req.body;
    const lookup = await prisma.settingLookup.update({
      where: { id },
      data: { name, value }
    });
    res.json(lookup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/lookups/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.settingLookup.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- STAFF CRUD ---
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.salary !== undefined) data.salary = toNum(data.salary);
    const staff = await prisma.staff.create({ data });
    res.status(201).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/staff/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body };
    if (data.salary !== undefined) data.salary = toNum(data.salary);
    // Remove relation field if any
    delete data.deliveryPlans;
    const staff = await prisma.staff.update({
      where: { id },
      data
    });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.staff.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PRODUCT TYPES CRUD ---
app.get('/api/product-types', async (req, res) => {
  try {
    const types = await prisma.productType.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-types', async (req, res) => {
  try {
    const data = { ...req.body };
    const type = await prisma.productType.create({ data });
    res.status(201).json(type);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-types/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body };
    const type = await prisma.productType.update({
      where: { id },
      data
    });
    res.json(type);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-types/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.productType.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PRODUCTS CRUD ---
app.get('/api/products', async (req, res) => {
  try {
    const { search, type } = req.query;
    const where = {};
    if (type && type !== 'All Product Types' && type !== 'All') where.type = type;
    
    let products = await prisma.product.findMany({ 
      where,
      orderBy: { name: 'asc' }
    });
    
    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p => p.name && p.name.toLowerCase().includes(s));
    }
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.charge !== undefined) data.charge = toNum(data.charge);
    const product = await prisma.product.create({ data });
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body };
    if (data.charge !== undefined) data.charge = toNum(data.charge);
    const product = await prisma.product.update({
      where: { id },
      data
    });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.product.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- MATERIALS CRUD (INVENTORY ITEMS) ---
app.get('/api/materials', async (req, res) => {
  try {
    const { search, category } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search } }
      ];
    }
    if (category && category !== 'All') where.category = category;
    
    let materials = await prisma.material.findMany({ where, orderBy: { name: 'asc' } });
    
    // Auto-seed if empty for demo purposes
    if (materials.length === 0 && !search && category === 'All') {
        const demo = [
            { name: '3D EXPANSION SCREW', category: 'ORTHO', stock: 2, unit: 'pc', minStock: 0 },
            { name: '3D PRINTER FILM', category: 'RESINS', stock: 11, unit: 'pc', minStock: 0 },
            { name: '3D PRINTER TANK', category: 'ZIRCON', stock: 1, unit: 'pc', minStock: 0 },
            { name: 'ACRYLIC POWDER - BLACK 40 GM', category: 'ORTHO', stock: 1, unit: 'Bottle', minStock: 0 },
            { name: 'ALGINATE ALGINPLUS (453 GM)', category: 'ACRYLIC', stock: 0, unit: 'Packet', minStock: 0 },
            { name: 'BASE PASTE TUBE', category: 'CERAMIC', stock: 17, unit: 'Tube', minStock: 0 },
            { name: 'BASE PLATE', category: 'ACRYLIC', stock: 17, unit: 'Box', minStock: 0 },
        ];
        for (const m of demo) {
          await prisma.material.create({ data: m });
        }
        materials = await prisma.material.findMany({ where, orderBy: { name: 'asc' } });
    }
    // Map minStock to reorderLevel for UI parity
    const mapped = materials.map(m => ({ ...m, reorderLevel: m.minStock || 0 }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/materials', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.stock !== undefined) data.stock = toNum(data.stock);
    if (data.minStock !== undefined) data.minStock = toNum(data.minStock);
    const material = await prisma.material.create({ data });
    res.status(201).json(material);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body };
    if (data.stock !== undefined) data.stock = toNum(data.stock);
    if (data.minStock !== undefined) data.minStock = toNum(data.minStock);
    const material = await prisma.material.update({
      where: { id },
      data
    });
    res.json(material);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.material.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SYSTEM SETTINGS CRUD ---
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const settingsObj = {};
    for (const s of settings) {
      try {
        settingsObj[s.key] = JSON.parse(s.value);
      } catch (e) {
        settingsObj[s.key] = s.value;
      }
    }
    res.json(settingsObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: req.params.key }
    });
    if (!setting) return res.status(404).json({ error: 'Setting not found' });
    try {
      res.json({ key: setting.key, value: JSON.parse(setting.value) });
    } catch (e) {
      res.json({ key: setting.key, value: setting.value });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: valStr },
      create: { key, value: valStr }
    });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SETTING LOOKUPS CRUD ---
app.get('/api/lookups', async (req, res) => {
  try {
    const { type } = req.query;
    const where = type ? { type } : {};
    const lookups = await prisma.settingLookup.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    res.json(lookups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lookups', async (req, res) => {
  try {
    const { type, name, value } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'Missing type or name' });
    const lookup = await prisma.settingLookup.create({
      data: { type, name, value }
    });
    res.status(201).json(lookup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/lookups/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, value } = req.body;
    const lookup = await prisma.settingLookup.update({
      where: { id },
      data: { name, value }
    });
    res.json(lookup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/lookups/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.settingLookup.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- DROPDOWN MANAGER CRUD ---
app.get('/api/dropdowns', async (req, res) => {
  try {
    const { activeOnly, dropdownKey } = req.query;
    const where = {};
    if (activeOnly === 'true') {
      where.active = true;
    }
    if (dropdownKey) {
      where.dropdownKey = dropdownKey;
    }
    const options = await prisma.dropdownOption.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { id: 'asc' }
      ]
    });
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dropdowns', async (req, res) => {
  try {
    const { page, dropdownKey, dropdownLabel, optionLabel, optionValue, sortOrder, active } = req.body;
    if (!page || !dropdownKey || !optionLabel || !optionValue) {
      return res.status(400).json({ error: 'Page, dropdown key, option label, and option value are required' });
    }
    
    // Check duplicate
    const existing = await prisma.dropdownOption.findFirst({
      where: {
        dropdownKey,
        optionLabel: { equals: optionLabel }
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Option already exists in this dropdown' });
    }

    const option = await prisma.dropdownOption.create({
      data: {
        page,
        dropdownKey,
        dropdownLabel: dropdownLabel || dropdownKey,
        optionLabel,
        optionValue,
        sortOrder: Number(sortOrder) || 0,
        active: active !== undefined ? active : true
      }
    });
    res.status(201).json(option);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/dropdowns/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { page, dropdownKey, dropdownLabel, optionLabel, optionValue, sortOrder, active } = req.body;
    if (!optionLabel || !optionValue) {
      return res.status(400).json({ error: 'Option label and option value are required' });
    }

    // Check duplicate excluding self
    const existing = await prisma.dropdownOption.findFirst({
      where: {
        dropdownKey,
        optionLabel: { equals: optionLabel },
        NOT: { id }
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Option already exists in this dropdown' });
    }

    const option = await prisma.dropdownOption.update({
      where: { id },
      data: {
        page,
        dropdownKey,
        dropdownLabel,
        optionLabel,
        optionValue,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
        active: active !== undefined ? active : undefined
      }
    });
    res.json(option);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/dropdowns/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.dropdownOption.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- PICKUPS ---
app.get('/api/pickup-requests', async (req, res) => {
  try {
    const pickups = await prisma.pickupRequest.findMany({
      include: { client: true },
      orderBy: { id: 'desc' }
    });
    res.json(pickups);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/pickup-returns', async (req, res) => {
  try {
    const returns = await prisma.pickupReturn.findMany({
      include: { order: { include: { client: true } } },
      orderBy: { id: 'desc' }
    });
    res.json(returns);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/pickup-returns', async (req, res) => {
  try {
    const { orderId, itemType, status, pickupDate } = req.body;
    const ret = await prisma.pickupReturn.create({
      data: {
        orderId: Number(orderId),
        itemType,
        status,
        pickupDate: pickupDate ? new Date(pickupDate) : null
      }
    });
    res.status(201).json(ret);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/materials', async (req, res) => {
  try {
    const materials = await prisma.material.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Startup Database Auto-Seeder Check for Materials
async function ensureMaterialsSeeded() {
  try {
    const count = await prisma.material.count();
    if (count === 0) {
      console.log("[Seeder] Material table is empty. Auto-seeding 565 materials from user_materials.json...");
      const fs = require('fs');
      const path = require('path');
      const seedFile = path.join(__dirname, 'user_materials.json');
      if (fs.existsSync(seedFile)) {
        const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        for (const item of seedData) {
          await prisma.material.create({
            data: {
              name: item.name,
              category: item.category,
              stock: item.stock,
              unit: item.unit,
              minStock: item.minStock
            }
          });
        }
        console.log(`[Seeder] Successfully seeded ${seedData.length} materials!`);
      } else {
        console.warn(`[Seeder] Seed file not found at ${seedFile}`);
      }
    } else {
      console.log(`[Seeder] Materials table already has ${count} records. Skipping seeder.`);
    }
  } catch (e) {
    console.error("[Seeder] Error during materials startup check:", e.message);
  }
}

async function ensureDropdownsSeeded() {
  try {
    const count = await prisma.dropdownOption.count();
    if (count === 0) {
      console.log("[Seeder] Dropdown Option table is empty. Auto-seeding default options...");
      const defaultDropdowns = [
        // order_status
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'New', optionValue: 'New', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'In Production', optionValue: 'In Production', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'Complete', optionValue: 'Complete', sortOrder: 3 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'On Hold', optionValue: 'On Hold', sortOrder: 4 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'Try In', optionValue: 'Try In', sortOrder: 5 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'Cancelled', optionValue: 'Cancelled', sortOrder: 6 },
        { page: 'Order', dropdownKey: 'order_status', dropdownLabel: 'Order Status', optionLabel: 'Delivered', optionValue: 'Delivered', sortOrder: 7 },

        // order_type (Work Type)
        { page: 'Order', dropdownKey: 'order_type', dropdownLabel: 'Order Type', optionLabel: 'New', optionValue: 'New', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'order_type', dropdownLabel: 'Order Type', optionLabel: 'Repeat', optionValue: 'Repeat', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'order_type', dropdownLabel: 'Order Type', optionLabel: 'Repair', optionValue: 'Repair', sortOrder: 3 },

        // order_priority
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Normal', optionValue: 'Normal', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Urgent', optionValue: 'Urgent', sortOrder: 2 },

        // hold_reason
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Payment Pending', optionValue: 'Payment Pending', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Clarification Needed', optionValue: 'Clarification Needed', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Doctor Unavailable', optionValue: 'Doctor Unavailable', sortOrder: 3 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Impression Issue', optionValue: 'Impression Issue', sortOrder: 4 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Shade Issue', optionValue: 'Shade Issue', sortOrder: 5 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Patient Not Available', optionValue: 'Patient Not Available', sortOrder: 6 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Duplicate Order', optionValue: 'Duplicate Order', sortOrder: 7 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Other', optionValue: 'Other', sortOrder: 8 },

        // shipment_status
        { page: 'Shipment', dropdownKey: 'shipment_status', dropdownLabel: 'Shipment Status', optionLabel: 'Created', optionValue: 'Created', sortOrder: 1 },
        { page: 'Shipment', dropdownKey: 'shipment_status', dropdownLabel: 'Shipment Status', optionLabel: 'Printed', optionValue: 'Printed', sortOrder: 2 },
        { page: 'Shipment', dropdownKey: 'shipment_status', dropdownLabel: 'Shipment Status', optionLabel: 'Dispatched', optionValue: 'Dispatched', sortOrder: 3 },
        { page: 'Shipment', dropdownKey: 'shipment_status', dropdownLabel: 'Shipment Status', optionLabel: 'Delivered', optionValue: 'Delivered', sortOrder: 4 },

        // shipment_partner
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Courier', optionValue: 'Courier', sortOrder: 1 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Self Pickup', optionValue: 'Self Pickup', sortOrder: 2 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Lab Delivery', optionValue: 'Lab Delivery', sortOrder: 3 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'LOGISTICS TEAM', optionValue: 'LOGISTICS TEAM', sortOrder: 4 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Delivery Boy', optionValue: 'Delivery Boy', sortOrder: 5 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Doctors Pickup', optionValue: 'Doctors Pickup', sortOrder: 6 },
        { page: 'Shipment', dropdownKey: 'shipment_partner', dropdownLabel: 'Shipment Partner', optionLabel: 'Mail', optionValue: 'Mail', sortOrder: 7 },

        // return_type
        { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Impression', optionValue: 'Impression', sortOrder: 1 },
        { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Wax Trial', optionValue: 'Wax Trial', sortOrder: 2 },
        { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Metal Frame', optionValue: 'Metal Frame', sortOrder: 3 },
        { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Old Restorations', optionValue: 'Old Restorations', sortOrder: 4 },
        { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Other', optionValue: 'Other', sortOrder: 5 },

        // payment_mode
        { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Cash', optionValue: 'Cash', sortOrder: 1 },
        { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Cheque', optionValue: 'Cheque', sortOrder: 2 },
        { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'UPI', optionValue: 'UPI', sortOrder: 3 },
        { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Bank Transfer', optionValue: 'Bank Transfer', sortOrder: 4 },

        // account_type
        { page: 'Account', dropdownKey: 'account_type', dropdownLabel: 'Account Type', optionLabel: 'Credit', optionValue: 'Credit', sortOrder: 1 },
        { page: 'Account', dropdownKey: 'account_type', dropdownLabel: 'Account Type', optionLabel: 'Debit', optionValue: 'Debit', sortOrder: 2 },

        // expense_category
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Office Supplies', optionValue: 'Office Supplies', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Travel & Fuel', optionValue: 'Travel & Fuel', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Meals', optionValue: 'Meals', sortOrder: 3 },
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Utilities', optionValue: 'Utilities', sortOrder: 4 },
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Maintenance', optionValue: 'Maintenance', sortOrder: 5 },
        { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Other', optionValue: 'Other', sortOrder: 6 },

        // expense_method
        { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Cash', optionValue: 'Cash', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Bank Transfer', optionValue: 'Bank Transfer', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'UPI', optionValue: 'UPI', sortOrder: 3 },
        { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Cheque', optionValue: 'Cheque', sortOrder: 4 },

        // staff_role
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Technician', optionValue: 'Technician', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Manager', optionValue: 'Manager', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Admin', optionValue: 'Admin', sortOrder: 3 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Delivery Boy', optionValue: 'Delivery Boy', sortOrder: 4 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Lab Administrator', optionValue: 'Lab Administrator', sortOrder: 5 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Driver', optionValue: 'Driver', sortOrder: 6 },
        { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Other', optionValue: 'Other', sortOrder: 7 },

        // material_category
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Ceramic', optionValue: 'Ceramic', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Metal', optionValue: 'Metal', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Ortho', optionValue: 'Ortho', sortOrder: 3 },
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Resins', optionValue: 'Resins', sortOrder: 4 },
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Zircon', optionValue: 'Zircon', sortOrder: 5 },
        { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'Acrylic', optionValue: 'Acrylic', sortOrder: 6 },

        // inward_doc_type
        { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Purchase', optionValue: 'Purchase', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Return', optionValue: 'Return', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Opening Balance', optionValue: 'Opening Balance', sortOrder: 3 },

        // outward_doc_type
        { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Consumption', optionValue: 'Consumption', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Issued', optionValue: 'Issued', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Damaged', optionValue: 'Damaged', sortOrder: 3 },

        // product_type
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'PFM', optionValue: 'PFM', sortOrder: 1 },
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Zirconia', optionValue: 'Zirconia', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'E-Max', optionValue: 'E-Max', sortOrder: 3 },
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Denture', optionValue: 'Denture', sortOrder: 4 },
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Implant', optionValue: 'Implant', sortOrder: 5 },
        { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'General', optionValue: 'General', sortOrder: 6 },

        // tryin_type
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Try-In', optionValue: 'Try-In', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Special Tray', optionValue: 'Special Tray', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Metal/Coping Trial', optionValue: 'Metal/Coping Trial', sortOrder: 3 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Record Base', optionValue: 'Record Base', sortOrder: 4 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Setting Trial', optionValue: 'Setting Trial', sortOrder: 5 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Wax Test', optionValue: 'Wax Test', sortOrder: 6 },
        { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Bisque Trial', optionValue: 'Bisque Trial', sortOrder: 7 }
      ];
      for (const item of defaultDropdowns) {
        await prisma.dropdownOption.create({ data: item });
      }
      console.log(`[Seeder] Successfully seeded default dropdown options!`);
    } else {
      console.log(`[Seeder] Dropdown Option table already has ${count} records. Skipping seeder.`);
    }
  } catch (e) {
    console.error("[Seeder] Error during dropdown options startup check:", e.message);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Server is successfully running on port ${PORT}`);
  console.log('Keep this window open to maintain server connection.');
  await ensureMaterialsSeeded();
  await ensureDropdownsSeeded();
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use. Please close the other application or restart your computer.`);
  } else {
    console.error('Server failed to start:', err);
  }
});
