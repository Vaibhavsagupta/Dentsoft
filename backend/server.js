const path = require('path');
const fs = require('fs');

// Support loading .env from binary directory or current working directory
const localEnvPath = path.join(__dirname, '.env');
const cwdEnvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
} else if (fs.existsSync(cwdEnvPath)) {
  require('dotenv').config({ path: cwdEnvPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'SDL_ENTERPRISE_JWT_KEY_SECURE_2026';
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:Sohar1dental2lab3@db.iegjermyuyuznlmoczow.supabase.co:5432/postgres";
console.log('🔗 [Database Connection] Target URL:', dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'NOT SET');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});

// --- FAST IN-MEMORY API RESPONSE CACHE ---
const apiCache = new Map();
function getCache(key) {
  const item = apiCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    apiCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs = 10000) {
  apiCache.set(key, { data, expiry: Date.now() + ttlMs });
}

function clearCachePattern(prefix) {
  for (const k of apiCache.keys()) {
    if (!prefix || k.includes(prefix)) apiCache.delete(k);
  }
}
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 5000;

const multer = require('multer');
const { seedAllExcelData } = require('./excel_seeder');
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check probes
app.get('/healthz', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/healthz', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- ENTERPRISE AUTHENTICATION & AUTHORIZATION MIDDLEWARES ---
function authenticateToken(req, res, next) {
  // Allow health checks, login, and all non-API static page requests
  if (req.path === '/api/auth/login' || req.path === '/healthz' || req.path === '/api/healthz' || !req.path.startsWith('/api/')) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }
  next();
}

app.use(authenticateToken);

// Disable HTTP caching so changes show up immediately on mobile and web browsers
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

const zlib = require('zlib');
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const oldSend = res.send;
  res.send = function (body) {
    if (!body) {
      return oldSend.call(res, body);
    }
    
    const contentType = res.getHeader('Content-Type') || '';
    const isCompressible = contentType.includes('json') || contentType.includes('text') || typeof body === 'object' || typeof body === 'string';
    
    if (isCompressible) {
      res.setHeader('Content-Encoding', 'gzip');
      let buf;
      if (Buffer.isBuffer(body)) {
        buf = body;
      } else if (typeof body === 'string') {
        buf = Buffer.from(body);
      } else {
        buf = Buffer.from(JSON.stringify(body));
      }
      
      zlib.gzip(buf, (err, compressed) => {
        if (err) {
          res.removeHeader('Content-Encoding');
          oldSend.call(res, body);
        } else {
          res.setHeader('Content-Length', compressed.length);
          oldSend.call(res, compressed);
        }
      });
    } else {
      oldSend.call(res, body);
    }
  };
  next();
});

// Serve Frontend Static Assets & Web Application
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

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

// --- SERIAL SEQUENCE HELPERS ---
async function getNextSerialForType(typeKey, dbMaxNum = 0, fallbackDefault = 1) {
  const keysToTry = [`serial_start_${typeKey}`, `serial_start_${typeKey}_no`].filter(Boolean);
  let configuredStart = null;
  
  for (const k of keysToTry) {
    const s = await prisma.systemSetting.findUnique({ where: { key: k } });
    if (s && s.value !== null && s.value !== undefined) {
      let val = s.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch(e) { val = parseInt(val); }
      }
      val = parseInt(val);
      if (!isNaN(val) && val > 0) {
        configuredStart = val;
        break;
      }
    }
  }

  let prefix = '';
  const serialsSetting = await prisma.systemSetting.findUnique({ where: { key: 'serials' } });
  if (serialsSetting && serialsSetting.value) {
    try {
      const serialsData = typeof serialsSetting.value === 'object' ? serialsSetting.value : JSON.parse(serialsSetting.value);
      if (serialsData[typeKey] && serialsData[typeKey].prefix) {
        prefix = serialsData[typeKey].prefix;
      }
    } catch(e) {}
  }

  let nextNum;
  if (configuredStart !== null) {
    nextNum = configuredStart;
  } else {
    nextNum = dbMaxNum > 0 ? dbMaxNum + 1 : fallbackDefault;
  }

  const formatted = prefix ? `${prefix}${nextNum}` : String(nextNum);
  return { nextNum, formatted };
}

async function incrementSerialStartNumber(typeKey, usedNum) {
  const nextVal = usedNum + 1;
  const key = `serial_start_${typeKey}`;
  await prisma.systemSetting.upsert({
    where: { key: key },
    update: { value: JSON.stringify(nextVal) },
    create: { key: key, value: JSON.stringify(nextVal) }
  });
}

const SEQUENCE_CONFIG = {
  order: { seqName: 'sdl_order_seq', table: 'Order', col: 'orderNumber', defaultStart: 1000 },
  invoice: { seqName: 'sdl_invoice_seq', table: 'Invoice', col: 'invoiceNumber', defaultStart: 1000 },
  receipt: { seqName: 'sdl_receipt_seq', table: 'Receipt', col: 'receiptNumber', defaultStart: 1000 },
  adjustment: { seqName: 'sdl_adjustment_seq', table: 'Adjustment', col: 'adjustmentNumber', defaultStart: 1 },
  creditAdj: { seqName: 'sdl_adjustment_seq', table: 'Adjustment', col: 'adjustmentNumber', defaultStart: 1 },
  debitAdj: { seqName: 'sdl_adjustment_seq', table: 'Adjustment', col: 'adjustmentNumber', defaultStart: 1 },
  journalVoucher: { seqName: 'sdl_adjustment_seq', table: 'Adjustment', col: 'adjustmentNumber', defaultStart: 1 },
  shipment: { seqName: 'sdl_shipment_seq', table: 'ShipmentNote', col: 'noteNumber', defaultStart: 1000 },
  expense: { seqName: 'sdl_expense_seq', table: 'Expense', col: 'voucherNo', defaultStart: 1000 },
  clientCode: { seqName: 'sdl_client_code_seq', table: 'Client', col: 'code', defaultStart: 100 },
  model: { seqName: 'sdl_model_seq', table: null, col: null, defaultStart: 48784 }
};

const initializedSequences = new Set();

async function ensureSequenceInitialized(typeKey, customStart = null) {
  const conf = SEQUENCE_CONFIG[typeKey] || { seqName: `sdl_${typeKey}_seq`, defaultStart: 1000 };
  const seqName = conf.seqName;
  let startNum = customStart;
  if (!startNum) {
    try {
      const s = await prisma.systemSetting.findUnique({ where: { key: `serial_start_${typeKey}` } });
      if (s && s.value !== null && s.value !== undefined) {
        let val = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
        val = parseInt(val);
        if (!isNaN(val) && val > 0) startNum = val;
      }
    } catch(e) {}
  }
  if (!startNum) startNum = conf.defaultStart || 1;

  if (!initializedSequences.has(seqName)) {
    try {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${seqName}" START WITH ${startNum} INCREMENT BY 1;`);
      
      // Auto-sync with table max value
      if (conf.table && conf.col) {
        try {
          const maxRows = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("${conf.col}", '\\D', '', 'g'), '')::bigint) as max_val FROM "${conf.table}";`);
          const maxVal = maxRows && maxRows[0] && maxRows[0].max_val ? Number(maxRows[0].max_val) : 0;
          if (maxVal > 0) {
            await prisma.$executeRawUnsafe(`SELECT setval('"${seqName}"', ${maxVal}, true);`);
          }
        } catch (syncErr) {
          console.warn(`[Sequence Sync] Warning syncing ${seqName}:`, syncErr.message);
        }
      }
      initializedSequences.add(seqName);
    } catch (e) {
      console.warn(`[Sequence Init] Note on sequence ${seqName}:`, e.message);
    }
  }
  return { conf, seqName, startNum };
}

async function formatSequenceValue(typeKey, num) {
  let prefix = '';
  try {
    const serialsSetting = await prisma.systemSetting.findUnique({ where: { key: 'serials' } });
    if (serialsSetting && serialsSetting.value) {
      const serialsData = typeof serialsSetting.value === 'object' ? serialsSetting.value : JSON.parse(serialsSetting.value);
      if (serialsData[typeKey] && serialsData[typeKey].prefix) {
        prefix = serialsData[typeKey].prefix;
      }
    }
  } catch (e) {}

  let formatted = prefix ? `${prefix}${num}` : (typeKey === 'clientCode' || typeKey === 'receipt' || typeKey === 'adjustment' || typeKey === 'creditAdj' || typeKey === 'debitAdj' || typeKey === 'journalVoucher' ? String(num).padStart(5, '0') : String(num));
  return formatted;
}

// PEEK next sequence number without advancing sequence in DB
async function peekNextAtomicSequence(typeKey, customStart = null) {
  const { conf, seqName, startNum } = await ensureSequenceInitialized(typeKey, customStart);
  try {
    let tableMax = 0;
    if (conf.table && conf.col) {
      try {
        const maxRows = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("${conf.col}", '\\D', '', 'g'), '')::bigint) as max_val FROM "${conf.table}";`);
        tableMax = maxRows && maxRows[0] && maxRows[0].max_val ? Number(maxRows[0].max_val) : 0;
      } catch (e) {}
    }

    let seqVal = 0;
    try {
      const seqRows = await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM "${seqName}";`);
      if (seqRows && seqRows[0]) {
        seqVal = Number(seqRows[0].last_value);
        if (!seqRows[0].is_called) {
          seqVal = seqVal - 1;
        }
      }
    } catch (e) {}

    let nextNum;
    if (tableMax > 0 || seqVal > 0) {
      nextNum = Math.max(tableMax + 1, seqVal + 1);
    } else {
      nextNum = startNum;
    }

    const formatted = await formatSequenceValue(typeKey, nextNum);
    return { nextNum, formatted };
  } catch (err) {
    console.error(`[Atomic Sequence Peek] Fallback for ${seqName}:`, err.message);
    return getNextSerialForType(typeKey, 0, startNum);
  }
}

// ATOMIC INCREMENT & CLAIM (only call on actual entity save/creation)
async function getNextAtomicSequence(typeKey, customStart = null) {
  const { conf, seqName, startNum } = await ensureSequenceInitialized(typeKey, customStart);

  try {
    if (conf.table && conf.col) {
      try {
        const maxRows = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("${conf.col}", '\\D', '', 'g'), '')::bigint) as max_val FROM "${conf.table}";`);
        const maxVal = maxRows && maxRows[0] && maxRows[0].max_val ? Number(maxRows[0].max_val) : 0;
        const seqRows = await prisma.$queryRawUnsafe(`SELECT last_value FROM "${seqName}";`);
        const currentLast = seqRows && seqRows[0] ? Number(seqRows[0].last_value) : 0;
        if (maxVal > currentLast) {
          await prisma.$executeRawUnsafe(`SELECT setval('"${seqName}"', ${maxVal}, true);`);
        }
      } catch (e) {}
    }

    const result = await prisma.$queryRawUnsafe(`SELECT nextval('"${seqName}"') as val;`);
    let nextVal = Number(result[0].val);

    const formatted = await formatSequenceValue(typeKey, nextVal);
    return { nextNum: nextVal, formatted };
  } catch (err) {
    console.error(`[Atomic Sequence] Fallback for ${seqName}:`, err.message);
    return getNextSerialForType(typeKey, 0, startNum);
  }
}

async function syncSequenceWithNumber(typeKey, usedNumber) {
  try {
    const num = parseInt(String(usedNumber).replace(/\D/g, ''));
    if (!isNaN(num) && num > 0) {
      const conf = SEQUENCE_CONFIG[typeKey];
      if (conf && conf.seqName) {
        await ensureSequenceInitialized(typeKey);
        const seqRows = await prisma.$queryRawUnsafe(`SELECT last_value FROM "${conf.seqName}";`);
        const currentLast = seqRows && seqRows[0] ? Number(seqRows[0].last_value) : 0;
        if (num > currentLast) {
          await prisma.$executeRawUnsafe(`SELECT setval('"${conf.seqName}"', ${num}, true);`);
        }
      }
    }
  } catch (e) {
    console.warn(`[Sync Sequence With Number] Error for ${typeKey}:`, e.message);
  }
}

// --- EXPENSES ---
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
    res.json(expenses);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/expenses/next-number', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('expense');
    const nextNumber = String(serialResult.nextNum).padStart(5, '0');
    res.json({ nextNumber });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const data = { ...req.body };
    data.amount = Number(data.amount);
    data.date = toDate(data.date) || new Date();
    
    if (!data.voucherNo) {
      const serialResult = await getNextAtomicSequence('expense');
      data.voucherNo = String(serialResult.nextNum).padStart(5, '0');
    } else {
      const clean = String(data.voucherNo).replace(/[^0-9]/g, '');
      if (clean) data.voucherNo = clean.padStart(5, '0');
    }

    const expense = await prisma.expense.create({ data });
    res.status(201).json(expense);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = { ...req.body };
    if (data.amount !== undefined) data.amount = Number(data.amount);
    if (data.date) data.date = toDate(data.date);
    delete data.id;

    const updated = await prisma.expense.update({
      where: { id },
      data
    });
    res.json(updated);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.expense.delete({ where: { id } });
    res.json({ success: true, message: 'Expense deleted' });
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
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/logo.jpeg'));
});
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
    where: { clientId: Number(clientId), NOT: { status: 'Cancelled' } },
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
    const totalPaidFromReceipts = Math.max(inv.paidFromReceipts + inv.adjCredit - inv.adjDebit, 0);
    // Find database invoice record to preserve manually updated paidAmount if no receipt overrides it
    const existingDbInv = invoices.find(i => i.id === inv.id);
    const manualPaid = existingDbInv ? (existingDbInv.paidAmount || 0) : 0;
    const finalPaid = Math.max(totalPaidFromReceipts, inv.paidFromReceipts > 0 ? totalPaidFromReceipts : manualPaid);
    const balance = Math.max(0, Math.round((inv.netAmount - finalPaid) * 1000) / 1000);
    let status = 'Unpaid';
    if (balance <= 0 && inv.netAmount > 0) {
      status = 'Paid';
    } else if (finalPaid > 0) {
      status = 'Partially Paid';
    }
    
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        paidAmount: toMoney(finalPaid),
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
    const { search, simple, include_relations, withDetails, page, limit, take, skip, paginate } = req.query;
    const isRelations = include_relations === 'true' || withDetails === 'true';

    if (!search && !page && !limit && !skip) {
      const cacheKey = isRelations ? 'clients_relations' : (simple === 'true' ? 'clients_simple' : 'clients_fast');
      const cached = getCache(cacheKey);
      if (cached) return res.json(cached);
    }

    let where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { cellPhone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const total = await prisma.client.count({ where });
    let queryOptions = { where, orderBy: { name: 'asc' } };

    let pageVal = Math.max(Number(page) || 1, 1);
    let takeVal = limit === 'all' ? null : (Number(limit || take) || (page || paginate === 'true' ? 50 : null));
    let skipVal = skip !== undefined ? Number(skip) : (takeVal ? (pageVal - 1) * takeVal : null);

    if (takeVal) queryOptions.take = takeVal;
    if (skipVal !== null && skipVal !== undefined) queryOptions.skip = skipVal;

    let clients;
    if (isRelations) {
      queryOptions.include = { 
        orders: { select: { id: true, status: true, totalAmount: true, netAmount: true, orderNumber: true, receivedDate: true, createdAt: true } },
        invoices: { select: { id: true, invoiceNumber: true, invoiceDate: true, netAmount: true, paidAmount: true, balanceAmount: true, status: true } },
        receipts: { select: { id: true, receiptNumber: true, amount: true } },
        shipmentNotes: { select: { id: true, noteNumber: true, status: true } },
        adjustments: { select: { id: true, amount: true } }
      };
      clients = await prisma.client.findMany(queryOptions);
      if (!search && !page && !limit && !skip) setCache('clients_relations', clients, 15000);
    } else if (simple === 'true') {
      queryOptions.select = {
        id: true,
        name: true,
        code: true,
        doctorName: true,
        phone: true,
        cellPhone: true,
        city: true,
        area: true,
        route: true,
        email: true,
        priceBand: true,
        billTo: true,
        address: true,
        openingBalance: true,
        openingBalanceType: true,
        createdAt: true
      };
      clients = await prisma.client.findMany(queryOptions);
      if (!search && !page && !limit && !skip) setCache('clients_simple', clients, 30000);
    } else {
      clients = await prisma.client.findMany(queryOptions);
      if (!search && !page && !limit && !skip) setCache('clients_fast', clients, 30000);
    }

    const totalPages = takeVal ? Math.ceil(total / takeVal) : 1;
    res.set({
      'X-Total-Count': String(total),
      'X-Page': String(pageVal),
      'X-Total-Pages': String(totalPages),
      'X-Limit': String(takeVal || total)
    });

    if (paginate === 'true') {
      return res.json({
        data: clients,
        pagination: {
          total,
          page: pageVal,
          limit: takeVal || total,
          totalPages
        }
      });
    }

    res.json(clients);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/clients/next-code', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('clientCode');
    res.json({ nextCode: serialResult.formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getUniqueClientCode(requestedCode) {
  let code = requestedCode ? String(requestedCode).trim() : '';

  if (code) {
    const existing = await prisma.client.findFirst({ where: { code } });
    if (!existing) {
      return code;
    }
  }

  const serialResult = await getNextAtomicSequence('clientCode');
  let candidateCode = serialResult.formatted;

  const exists = await prisma.client.findFirst({ where: { code: candidateCode } });
  if (exists) {
    const retryResult = await getNextAtomicSequence('clientCode');
    candidateCode = retryResult.formatted;
  }

  return candidateCode;
}

const VALID_CLIENT_FIELDS = new Set([
  'code',
  'salutation',
  'name',
  'contactPerson',
  'doctorName',
  'regNum',
  'workingHours',
  'salesManager',
  'email',
  'phone',
  'phone2',
  'cellPhone',
  'cellPhone2',
  'city',
  'area',
  'pinCode',
  'address',
  'address2',
  'deliveryMethod',
  'route',
  'priceBand',
  'taxId',
  'creditLimit',
  'paymentTermsDays',
  'openingBalance',
  'openingBalanceType',
  'categories',
  'defaultDeliveryAgent',
  'collectionCentre',
  'regularVisits',
  'taxExemption',
  'isDentalLab',
  'billTo',
  'trn',
  'discountPercentage',
  'priceListCategory',
  'status',
  'notes',
  'advanceBalance'
]);

function sanitizeClientInput(input) {
  const data = { ...input };

  // Map frontend field aliases to Prisma schema fields
  if (data.regNo !== undefined && data.regNum === undefined) {
    data.regNum = data.regNo;
  }
  if (data.cell2 !== undefined && data.cellPhone2 === undefined) {
    data.cellPhone2 = data.cell2;
  }
  if (data.deliveryAgent !== undefined && data.defaultDeliveryAgent === undefined) {
    data.defaultDeliveryAgent = data.deliveryAgent;
  }
  if (data.paymentTerms !== undefined && data.paymentTermsDays === undefined) {
    data.paymentTermsDays = data.paymentTerms;
  }
  if (data.pincode !== undefined && data.pinCode === undefined) {
    data.pinCode = data.pincode;
  }
  if (data.inactive !== undefined && data.status === undefined) {
    data.status = data.inactive ? 'Inactive' : 'Active';
  }

  // Type conversions
  if (data.discountPercentage !== undefined) data.discountPercentage = toNum(data.discountPercentage) || 0;
  if (data.creditLimit !== undefined) data.creditLimit = toNum(data.creditLimit) || 0;
  if (data.openingBalance !== undefined) data.openingBalance = toNum(data.openingBalance) || 0;
  if (data.paymentTermsDays !== undefined) data.paymentTermsDays = parseInt(data.paymentTermsDays, 10) || 0;
  if (data.advanceBalance !== undefined) data.advanceBalance = toNum(data.advanceBalance) || 0;
  if (data.taxExemption !== undefined) data.taxExemption = Boolean(data.taxExemption);
  if (data.isDentalLab !== undefined) data.isDentalLab = Boolean(data.isDentalLab);

  // String cleans
  if (data.name !== undefined) data.name = String(data.name).trim();
  if (data.code !== undefined && data.code !== null) {
    const trimmed = String(data.code).trim();
    data.code = trimmed || null;
  }

  // Filter out any key not in VALID_CLIENT_FIELDS
  const sanitized = {};
  for (const key of Object.keys(data)) {
    if (VALID_CLIENT_FIELDS.has(key) && data[key] !== undefined) {
      sanitized[key] = data[key];
    }
  }

  return sanitized;
}

app.post('/api/clients', async (req, res) => {
  try {
    clearCachePattern('clients');
    const sanitizedData = sanitizeClientInput(req.body);

    if (!sanitizedData.name || !String(sanitizedData.name).trim()) {
      return res.status(400).json({ error: 'Client Name is required' });
    }

    // Auto-generate or resolve unique client code
    sanitizedData.code = await getUniqueClientCode(sanitizedData.code);
    
    let client;
    let attempts = 0;
    while (attempts < 5) {
      attempts++;
      try {
        client = await prisma.client.create({ data: sanitizedData });
        break;
      } catch (createErr) {
        if (createErr.code === 'P2002' || (createErr.message && (createErr.message.includes('code') || createErr.message.includes('Unique constraint')))) {
          console.warn(`Client code collision for '${sanitizedData.code}', generating fallback code (Attempt ${attempts})...`);
          const count = await prisma.client.count();
          const randSuffix = Math.floor(1000 + Math.random() * 9000);
          sanitizedData.code = `CL-${count + attempts}-${randSuffix}`;
        } else {
          throw createErr;
        }
      }
    }
    res.status(201).json(client);
  } catch (error) { 
    console.error("Error creating client:", error);
    res.status(400).json({ error: error.message || 'Failed to create client' }); 
  }
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
        receipts: true,
        adjustments: true
      }
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    clearCachePattern('clients');
    const id = Number(req.params.id);
    const sanitizedData = sanitizeClientInput(req.body);

    if (sanitizedData.code !== undefined && sanitizedData.code !== null && String(sanitizedData.code).trim()) {
      const targetCode = String(sanitizedData.code).trim();
      const existing = await prisma.client.findFirst({
        where: { code: targetCode, NOT: { id } }
      });
      if (existing) {
        return res.status(400).json({ error: `Client Code '${targetCode}' is already assigned to ${existing.name}. Please use a different code.` });
      }
      sanitizedData.code = targetCode;
    }

    const client = await prisma.client.update({
      where: { id },
      data: sanitizedData
    });
    res.json(client);
  } catch (error) { 
    console.error("Error updating client:", error);
    res.status(500).json({ error: error.message || 'Failed to update client' }); 
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  const clientId = Number(req.params.id);
  if (!clientId || isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Get all orders, shipment notes, invoices of this client
      const clientOrders = await tx.order.findMany({
        where: { clientId },
        select: { id: true }
      });
      const orderIds = clientOrders.map(o => o.id);

      const clientShipmentNotes = await tx.shipmentNote.findMany({
        where: { clientId },
        select: { id: true }
      });
      const shipmentNoteIds = clientShipmentNotes.map(s => s.id);

      const clientInvoices = await tx.invoice.findMany({
        where: { clientId },
        select: { id: true }
      });
      const invoiceIds = clientInvoices.map(i => i.id);

      // Unlink any orders referencing this client's shipment notes or invoices
      if (shipmentNoteIds.length > 0) {
        await tx.order.updateMany({
          where: { shipmentNoteId: { in: shipmentNoteIds } },
          data: { shipmentNoteId: null }
        });
      }
      if (invoiceIds.length > 0) {
        await tx.order.updateMany({
          where: { invoiceId: { in: invoiceIds } },
          data: { invoiceId: null }
        });
      }

      // 2. Delete order-level dependents
      if (orderIds.length > 0) {
        await tx.warranty.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.pickupReturn.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.media.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.orderJob.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }

      // 3. Delete adjustments (linked to client or client's invoices)
      if (invoiceIds.length > 0) {
        await tx.adjustment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      }
      await tx.adjustment.deleteMany({ where: { clientId } });

      // 4. Delete receipts
      await tx.receipt.deleteMany({ where: { clientId } });

      // 5. Delete shipment notes
      if (shipmentNoteIds.length > 0) {
        await tx.shipmentNote.deleteMany({ where: { id: { in: shipmentNoteIds } } });
      }
      await tx.shipmentNote.deleteMany({ where: { clientId } });

      // 6. Delete invoices
      if (invoiceIds.length > 0) {
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }
      await tx.invoice.deleteMany({ where: { clientId } });

      // 7. Delete pickup requests
      await tx.pickupRequest.deleteMany({ where: { clientId } });

      // 8. Delete client
      await tx.client.delete({ where: { id: clientId } });
    });

    clearCachePattern('clients');
    res.status(200).json({ message: 'Client and all associated records deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: error.message || 'Failed to delete client' });
  }
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
    console.log("GET /api/orders params:", req.query);
    const { status, search, clientSearch, clientId, invoiceStatus, invoiceId, shippingStatus, dateFrom, dateTo } = req.query;
    let where = { AND: [] };
    
    if (status && status !== 'all' && status !== 'Ignore') {
      if (status === 'overdue') {
        where.AND.push({ dueDate: { lt: new Date() } });
        where.AND.push({ status: { notIn: ['Delivered', 'Cancelled'] } });
      } else if (status === 'repeat') {
        where.AND.push({
          OR: [
            { orderType: { in: ['Repeat', 'Repair'] } },
            { productName: { contains: 'repair', mode: 'insensitive' } },
            { productName: { contains: 'repeat', mode: 'insensitive' } },
            { jobs: { some: { OR: [{ productName: { contains: 'repair', mode: 'insensitive' } }, { productName: { contains: 'repeat', mode: 'insensitive' } }] } } }
          ]
        });
      } else if (status === 'not_delivered' || status === 'Not Delivered') {
        where.AND.push({ status: { notIn: ['Delivered', 'Cancelled'] } });
      } else if (status === 'On Hold' || status === 'Hold') {
        where.AND.push({ status: { in: ['Hold', 'On Hold'] } });
      } else if (status === 'In Production') {
        where.AND.push({ status: { in: ['In Production', 'New', 'Hold', 'Try In'] } });
      } else {
        where.AND.push({ status: status });
      }
    }

    if (shippingStatus && shippingStatus !== 'Ignore') {
      where.AND.push({ shippingStatus: shippingStatus });
    }

    if (invoiceStatus && invoiceStatus !== 'Ignore') {
      if (invoiceStatus === 'Invoiced') {
        where.AND.push({ invoiceId: { not: null } });
      } else if (invoiceStatus === 'Pending' || invoiceStatus === 'Uninvoiced' || invoiceStatus === 'Not Invoiced' || invoiceStatus === 'not_invoiced') {
        where.AND.push({ invoiceId: null });
      } else if (invoiceStatus === 'Paid') {
        where.AND.push({ invoice: { status: 'Paid' } });
      } else if (invoiceStatus === 'Unpaid') {
        where.AND.push({ invoice: { status: { in: ['Unpaid', 'Partially Paid'] } } });
      } else {
        where.AND.push({ invoice: { status: invoiceStatus } });
      }
    }

function parseLocalDateStart(dateStr) {
  if (!dateStr) return undefined;
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseLocalDateEnd(dateStr) {
  if (!dateStr) return undefined;
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999));
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}

    if (dateFrom || dateTo) {
      let dateFilter = {};
      const startDate = parseLocalDateStart(dateFrom);
      const endDate = parseLocalDateEnd(dateTo);
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      
      let dateField = req.query.dateField || 'receivedDate';
      if (dateField === 'dateIn') {
        dateField = 'receivedDate';
      }
      if (dateField === 'invoiceDate') {
        where.AND.push({ invoice: { invoiceDate: dateFilter } });
      } else {
        where.AND.push({ [dateField]: dateFilter });
      }
    }

    if (clientId) {
      where.AND.push({ clientId: Number(clientId) });
    }
    if (invoiceId) {
      where.AND.push({ invoiceId: Number(invoiceId) });
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

    const { department, assignedTo, technician, workType, category, productType, product } = req.query;
    if (department && department !== 'Any' && department !== '') {
      where.AND.push({ department });
    }
    const tech = assignedTo || technician;
    if (tech && tech !== 'Any' && tech !== '') {
      where.AND.push({ technician: tech });
    }
    if (workType && workType !== 'All' && workType !== 'Any' && workType !== '') {
      where.AND.push({
        OR: [
          { orderType: { contains: workType, mode: 'insensitive' } },
          { productType: { contains: workType, mode: 'insensitive' } },
          { productName: { contains: workType, mode: 'insensitive' } },
          { jobs: { some: { OR: [{ productType: { contains: workType, mode: 'insensitive' } }, { productName: { contains: workType, mode: 'insensitive' } }] } } }
        ]
      });
    }
    if (category && category !== 'Any' && category !== '') {
      where.AND.push({
        OR: [
          { category: category },
          { jobs: { some: { material: category } } }
        ]
      });
    }
    if (productType && productType !== 'Any' && productType !== '') {
      where.AND.push({
        OR: [
          { productType: productType },
          { jobs: { some: { productType: productType } } }
        ]
      });
    }
    if (product && product !== 'Any' && product !== '') {
      where.AND.push({
        OR: [
          { productName: { contains: product } },
          { jobs: { some: { productName: { contains: product } } } }
        ]
      });
    }

    const { limit, page, take, skip, paginate, withReturns } = req.query;
    const finalWhere = where.AND.length > 0 ? where : {};
    const total = await prisma.order.count({ where: finalWhere });

    const includeRelations = {
      client: {
        select: { id: true, name: true, code: true, cellPhone: true, phone: true, city: true, doctorName: true }
      },
      jobs: {
        select: { id: true, productName: true, productType: true, material: true, teethSelection: true, shade1: true, shade2: true, shade3: true, units: true, price: true, totalAmount: true }
      },
      invoice: {
        select: { id: true, invoiceNumber: true, invoiceDate: true, netAmount: true, status: true }
      },
      shipmentNote: {
        select: { id: true, noteNumber: true, status: true, deliveryMode: true, noteDate: true, createdAt: true, updatedAt: true }
      }
    };

    if (withReturns === 'true') {
      includeRelations.pickupReturns = {
        select: { id: true, itemType: true, status: true, pickupDate: true, receivedDate: true },
        orderBy: { id: 'desc' }
      };
    }

    const queryOptions = {
      where: finalWhere,
      include: includeRelations,
      orderBy: { id: 'desc' }
    };

    let pageVal = Math.max(Number(page) || 1, 1);
    let takeVal;
    if (limit || take) {
      if (limit !== 'all') {
        takeVal = Math.min(Number(limit || take) || 500, 5000);
      } else {
        // If limit is 'all' and there are no filters at all on 26k+ records, cap at 1000 to keep responses fast
        if (where.AND.length === 0) {
          takeVal = 1000;
        } else {
          takeVal = null;
        }
      }
    } else {
      takeVal = 500;
    }

    if (takeVal) {
      const skipVal = skip !== undefined ? Number(skip) : (pageVal - 1) * takeVal;
      queryOptions.take = takeVal;
      queryOptions.skip = skipVal;
    }

    const orders = await prisma.order.findMany(queryOptions);

    const totalPages = takeVal ? Math.ceil(total / takeVal) : 1;
    res.set({
      'X-Total-Count': String(total),
      'X-Page': String(pageVal),
      'X-Total-Pages': String(totalPages),
      'X-Limit': String(takeVal || total)
    });

    if (paginate === 'true') {
      return res.json({
        data: orders,
        pagination: {
          total,
          page: pageVal,
          limit: takeVal || total,
          totalPages
        }
      });
    }

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/next-number', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('order');
    const modelResult = await peekNextAtomicSequence('model');
    res.json({ 
      orderNumber: serialResult.formatted, 
      nextNumber: serialResult.nextNum,
      modelNumber: modelResult.formatted,
      nextModelNumber: modelResult.nextNum
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const data = { ...req.body };
    data.clientId = Number(data.clientId);

    // Duplicate submission guard (e.g. double click within 3 seconds)
    if (data.clientId) {
      const recentDuplicate = await prisma.order.findFirst({
        where: {
          clientId: data.clientId,
          patientName: data.patientName || '',
          createdAt: {
            gte: new Date(Date.now() - 3000)
          }
        },
        include: { jobs: true }
      });
      if (recentDuplicate) {
        return res.status(200).json(recentDuplicate);
      }
    }
    
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

    if (!cleanData.orderNumber) {
      const serialResult = await getNextAtomicSequence('order');
      cleanData.orderNumber = serialResult.formatted;
    } else {
      const existing = await prisma.order.findFirst({ where: { orderNumber: String(cleanData.orderNumber) } });
      if (existing) {
        const serialResult = await getNextAtomicSequence('order');
        cleanData.orderNumber = serialResult.formatted;
      } else {
        await syncSequenceWithNumber('order', cleanData.orderNumber);
      }
    }

    if (!cleanData.modelNumber) {
      const modelSerialResult = await getNextAtomicSequence('model');
      cleanData.modelNumber = modelSerialResult.formatted;
    } else {
      await syncSequenceWithNumber('model', cleanData.modelNumber);
    }

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
          price: toMoney(job.price) || toMoney(job.slab1Rate) || 0,
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
      cleanData.price = toNum(firstJob.price) || toNum(firstJob.slab1Rate) || toNum(firstJob.rate) || 0;
    } else if (cleanData.productName) {
      const uRate = toNum(req.body.unitRate) || toNum(cleanData.slab1Rate) || toNum(cleanData.price) || 0;
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
           if (pCharge > 0) {
             await prisma.product.updateMany({
               where: { name: j.productName },
               data: { charge: pCharge }
             });
           }
        }
      }
    } else if (cleanData.productName && (req.body.unitRate !== undefined || cleanData.price !== undefined)) {
       const pCharge = req.body.unitRate !== undefined ? Number(req.body.unitRate) : Number(cleanData.price);
       if (pCharge > 0) {
         await prisma.product.updateMany({
           where: { name: cleanData.productName },
           data: { charge: pCharge }
         });
       }
    }

    res.status(201).json(order);
  } catch (error) { 
    console.error("Create order error:", error);
    res.status(500).json({ error: error.message }); 
  }
});
// Orders Summary (Aggregated by Client)
app.get('/api/orders/summary', async (req, res) => {
  const { startDate, endDate, clientId } = req.query;
  try {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }

    const where = {};
    if (clientId) {
      where.id = Number(clientId);
    }

    const ordersWhere = Object.keys(dateFilter).length > 0 ? { receivedDate: dateFilter } : {};

    const clients = await prisma.client.findMany({
      where,
      include: {
        orders: {
          where: ordersWhere
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

    const filteredSummary = clientId ? summary : summary.filter(s => s.num > 0);

    res.json(filteredSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Shipments Summary (Aggregated by Client)
app.get('/api/shipments/summary', async (req, res) => {
  const { startDate, endDate, clientId } = req.query;
  try {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }

    const where = {};
    if (clientId) {
      where.id = Number(clientId);
    }

    const notesWhere = Object.keys(dateFilter).length > 0 ? { noteDate: dateFilter } : {};

    const clients = await prisma.client.findMany({
      where,
      include: {
        shipmentNotes: {
          where: notesWhere,
          include: {
            orders: true
          }
        }
      }
    });

    const summary = clients.map(client => {
      let totalValue = 0;
      client.shipmentNotes.forEach(note => {
        note.orders.forEach(order => {
          totalValue += (order.netAmount || order.totalAmount || 0);
        });
      });
      return {
        id: client.id,
        name: client.name,
        code: client.code,
        phone: client.phone,
        cellPhone: client.cellPhone,
        city: client.city,
        email: client.email,
        value: totalValue.toFixed(2),
        num: client.shipmentNotes.length
      };
    });

    const filteredSummary = clientId ? summary : summary.filter(s => s.num > 0);

    res.json(filteredSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Invoices Summary (Aggregated by Client for Bills Tab)
app.get('/api/invoices/summary', async (req, res) => {
  const { startDate, endDate, clientId } = req.query;
  try {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }

    const where = {};
    if (clientId) {
      where.id = Number(clientId);
    }

    const invoicesWhere = Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {};

    const clients = await prisma.client.findMany({
      where,
      include: {
        invoices: {
          where: invoicesWhere
        }
      }
    });

    const summary = clients.map(client => {
      const totalValue = client.invoices.reduce((sum, inv) => sum + (inv.netAmount || 0), 0);
      return {
        id: client.id,
        name: client.name,
        code: client.code,
        phone: client.phone,
        cellPhone: client.cellPhone,
        city: client.city,
        email: client.email,
        value: totalValue.toFixed(2),
        num: client.invoices.length
      };
    });

    const filteredSummary = clientId ? summary : summary.filter(s => s.num > 0);
    res.json(filteredSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Receipts / Collections Summary (Aggregated by Client for Collections Tab)
app.get('/api/receipts/summary', async (req, res) => {
  const { startDate, endDate, clientId } = req.query;
  try {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }

    const where = {};
    if (clientId) {
      where.id = Number(clientId);
    }

    const receiptsWhere = Object.keys(dateFilter).length > 0 ? { receiptDate: dateFilter } : {};

    const clients = await prisma.client.findMany({
      where,
      include: {
        receipts: {
          where: receiptsWhere
        }
      }
    });

    const summary = clients.map(client => {
      const totalValue = client.receipts.reduce((sum, rec) => sum + (rec.amount || 0), 0);
      return {
        id: client.id,
        name: client.name,
        code: client.code,
        phone: client.phone,
        cellPhone: client.cellPhone,
        city: client.city,
        email: client.email,
        value: totalValue.toFixed(2),
        num: client.receipts.length
      };
    });

    const filteredSummary = clientId ? summary : summary.filter(s => s.num > 0);
    res.json(filteredSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    let order = null;
    const numId = Number(rawId);
    if (!isNaN(numId)) {
      order = await prisma.order.findUnique({
        where: { id: numId },
        include: { client: true, invoice: true, shipmentNote: true, jobs: true }
      });
    }
    if (!order) {
      order = await prisma.order.findFirst({
        where: { orderNumber: String(rawId) },
        include: { client: true, invoice: true, shipmentNote: true, jobs: true }
      });
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    let existingOrder = null;
    const numId = Number(rawId);
    if (!isNaN(numId)) {
      existingOrder = await prisma.order.findUnique({
        where: { id: numId },
        include: { jobs: true }
      });
    }
    if (!existingOrder) {
      existingOrder = await prisma.order.findFirst({
        where: { orderNumber: String(rawId) },
        include: { jobs: true }
      });
    }
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
            price: toMoney(j.price) || toMoney(j.slab1Rate) || toNum(j.rate) || 0,
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
          cleanData.price = toNum(firstJob.price) || toNum(firstJob.slab1Rate) || toNum(firstJob.rate) || 0;
      }

      // Recalculate netAmount and totalAmount based on jobs
      const jobsTotal = req.body.jobs.reduce((sum, j) => sum + (toMoney(j.totalAmount) || toNum(j.total) || (toNum(j.units) || 1) * (toMoney(j.price) || toMoney(j.slab1Rate) || toNum(j.rate) || 0)), 0);
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
        price: toNum(req.body.unitRate) || toNum(cleanData.slab1Rate) || finalPrice || 0,
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

// --- ORDER LOGS ---
const ORDER_LOGS_FILE = path.join(__dirname, 'data', 'order_logs.json');

function getStoredOrderLogs() {
  try {
    if (!fs.existsSync(ORDER_LOGS_FILE)) {
      const dir = path.dirname(ORDER_LOGS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ORDER_LOGS_FILE, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(ORDER_LOGS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Error reading order logs file:', err);
    return {};
  }
}

function saveStoredOrderLogs(logs) {
  try {
    const dir = path.dirname(ORDER_LOGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORDER_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing order logs file:', err);
  }
}

app.get('/api/orders/:id/logs', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const allStored = getStoredOrderLogs();
    let logs = allStored[orderId] || [];

    if (logs.length === 0) {
      const baseLogs = [];
      if (order.status === 'Hold' || order.status === 'On Hold' || order.holdFrom) {
        baseLogs.push({
          action: 'Status Changed',
          info: 'Hold',
          on: order.holdFrom || order.receivedDate || new Date(),
          loggedBy: 'sohardentallab'
        });
      }
      baseLogs.push({
        action: 'Status Changed',
        info: (order.status === 'Hold' || order.status === 'On Hold') ? 'New' : (order.status || 'New'),
        on: order.receivedDate || order.createdAt || new Date(),
        loggedBy: 'sohardentallab'
      });
      logs = baseLogs;
      allStored[orderId] = logs;
      saveStoredOrderLogs(allStored);
    }

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/:id/logs', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { action, info, loggedBy, on } = req.body;
    if (!action) return res.status(400).json({ error: 'Action is required' });

    const allStored = getStoredOrderLogs();
    const logs = allStored[orderId] || [];

    const newLog = {
      action: action,
      info: info || '',
      on: on || new Date().toISOString(),
      loggedBy: loggedBy || 'sohardentallab'
    };

    logs.push(newLog);
    allStored[orderId] = logs;
    saveStoredOrderLogs(allStored);

    res.json({ success: true, log: newLog, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SHIPMENT NOTES (Defined below to avoid duplicates) ---

// --- DELIVERY PLANS ---
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
      include: { driver: true, shipmentNotes: true },
      orderBy: { planDate: 'desc' }
    });
    res.json(plans);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/delivery-plans', async (req, res) => {
  try {
    const { shipmentNoteIds, route, driverId, planDate, status, ...rest } = req.body;
    const data = { ...rest, route: route || '', status: status || 'Scheduled' };
    if (driverId) data.driverId = Number(driverId);
    data.planDate = toDate(planDate) || new Date();
    
    const plan = await prisma.deliveryPlan.create({
      data: {
        ...data,
        shipmentNotes: { connect: (shipmentNoteIds || []).map(id => ({ id: Number(id) })) }
      },
      include: { driver: true, shipmentNotes: true }
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

    // Calculate Due Today
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const todayEnd = new Date();
    todayEnd.setHours(23,59,59,999);

    const dueToday = await prisma.order.count({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: ['Delivered', 'Cancelled'] }
      }
    });

    const pending = await prisma.order.count({
      where: {
        status: { notIn: ['Delivered', 'Cancelled'] }
      }
    });

    res.json({
      ...stats,
      deliveryStatus: { dueToday, pending }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- INVOICES ---
app.get('/api/invoices', async (req, res) => {
  try {
    const { status, search, clientId, dateFrom, dateTo, page, limit, take, skip, paginate } = req.query;
    let where = {};

    if (status) {
      if (status === 'Unpaid') {
        where.status = { in: ['Unpaid', 'Partial', 'Partially Paid', 'Awaiting to Paid'] };
      } else if (status === 'Paid') {
        where.status = 'Paid';
      } else if (status === 'Partially Paid' || status === 'Partial') {
        where.status = { in: ['Partially Paid', 'Partial'] };
      } else if (status === 'Cancelled') {
        where.status = 'Cancelled';
      } else {
        where.status = status;
      }
    } else {
      where.NOT = { status: 'Cancelled' };
    }
    if (clientId) where.clientId = Number(clientId);
    if (search) {
      const searchFilter = {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { client: { code: { contains: search, mode: 'insensitive' } } },
          { client: { cellPhone: { contains: search, mode: 'insensitive' } } },
          { client: { email: { contains: search, mode: 'insensitive' } } }
        ]
      };
      where = { AND: [where, searchFilter] };
    }

    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = parseLocalDateStart(dateFrom);
      if (dateTo) where.invoiceDate.lte = parseLocalDateEnd(dateTo);
    }

    const total = await prisma.invoice.count({ where });

    let pageVal = Math.max(Number(page) || 1, 1);
    let takeVal = limit === 'all' ? null : (Number(limit || take) || (page || paginate === 'true' ? 50 : null));
    let skipVal = skip !== undefined ? Number(skip) : (takeVal ? (pageVal - 1) * takeVal : null);

    const includeOrders = req.query.includeOrders !== 'false';
    const queryOptions = { 
      where,
      select: {
        id: true,
        invoiceNumber: true,
        clientId: true,
        invoiceDate: true,
        dueDate: true,
        grossAmount: true,
        taxAmount: true,
        discountAmount: true,
        netAmount: true,
        paidAmount: true,
        balanceAmount: true,
        status: true,
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            route: true,
            salesManager: true,
            taxId: true,
            trn: true,
            cellPhone: true
          }
        },
        ...(includeOrders ? {
          orders: {
            select: {
              id: true,
              orderNumber: true,
              patientName: true,
              doctorName: true,
              teethSelection: true,
              productType: true,
              productName: true,
              receivedDate: true,
              dueDate: true,
              units: true,
              price: true,
              grossAmount: true,
              taxAmount: true,
              discountAmount: true,
              netAmount: true,
              modelNumber: true,
              subDoctor: true,
              notes: true,
              technician: true,
              status: true,
              jobs: {
                select: {
                  id: true,
                  productType: true,
                  productName: true,
                  material: true,
                  teethSelection: true,
                  shade1: true,
                  units: true,
                  price: true,
                  totalAmount: true
                }
              }
            }
          }
        } : {})
      },
      orderBy: { invoiceDate: 'desc' }
    };

    if (takeVal) queryOptions.take = takeVal;
    if (skipVal !== null && skipVal !== undefined) queryOptions.skip = skipVal;

    const invoices = await prisma.invoice.findMany(queryOptions);

    const totalPages = takeVal ? Math.ceil(total / takeVal) : 1;
    res.set({
      'X-Total-Count': String(total),
      'X-Page': String(pageVal),
      'X-Total-Pages': String(totalPages),
      'X-Limit': String(takeVal || total)
    });

    if (paginate === 'true') {
      return res.json({
        data: invoices,
        pagination: {
          total,
          page: pageVal,
          limit: takeVal || total,
          totalPages
        }
      });
    }

    res.json(invoices);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

async function generateUniqueInvoiceNumber() {
  const seq = await peekNextAtomicSequence('invoice');
  return seq.formatted;
}

app.get('/api/next-invoice-number', async (req, res) => {
  try {
    const num = await generateUniqueInvoiceNumber();
    res.json({ invoiceNumber: num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    
    // Verify that the clientId actually exists in the database
    const clientExists = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!clientExists) {
      return res.status(400).json({ error: `Client ID ${data.clientId} does not exist. Please refresh and try again.` });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          clientId: data.clientId,
          invoiceNumber: data.invoiceNumber.toString(),
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          grossAmount: data.grossAmount,
          discountAmount: data.discountAmount,
          taxAmount: data.taxAmount,
          netAmount: data.netAmount,
          paidAmount: data.paidAmount,
          balanceAmount: data.balanceAmount,
          status: data.status || 'Unpaid',
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
    const idParam = req.params.id;
    const { mode } = req.query;

    if (mode === 'html') {
      return res.redirect(`/invoice.html?id=${idParam}&download=true`);
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: isNaN(Number(idParam)) ? -1 : Number(idParam) },
          { invoiceNumber: idParam }
        ]
      },
      include: {
        client: true,
        orders: { include: { jobs: true } },
        adjustments: true
      }
    });

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (!invoice.orders || invoice.orders.length === 0) {
      invoice.orders = await prisma.order.findMany({
        where: { invoiceId: invoice.id },
        include: { jobs: true }
      });
    }

    const pythonScript = path.join(__dirname, '..', 'generate_invoice.py');
    if (fs.existsSync(pythonScript)) {
      const tempJson = path.join(__dirname, 'uploads', `inv_${invoice.id}_${Date.now()}.json`);
      const tempPdf = path.join(__dirname, 'uploads', `inv_${invoice.id}_${Date.now()}.pdf`);

      fs.writeFileSync(tempJson, JSON.stringify(invoice, null, 2), 'utf8');

      const { exec } = require('child_process');
      exec(`python "${pythonScript}" "${tempJson}" "${tempPdf}"`, (err) => {
        if (!err && fs.existsSync(tempPdf)) {
          res.download(tempPdf, `Invoice_${invoice.invoiceNumber || invoice.id}.pdf`, () => {
            try { if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson); } catch (e) {}
            try { if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf); } catch (e) {}
          });
        } else {
          try { if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson); } catch (e) {}
          res.redirect(`/invoice.html?id=${idParam}&download=true`);
        }
      });
    } else {
      res.redirect(`/invoice.html?id=${idParam}&download=true`);
    }
  } catch (error) { 
    console.error("PDF Generation Error:", error);
    res.redirect(`/invoice.html?id=${req.params.id}&download=true`);
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
    const invId = Number(req.params.id);
    const existingInv = await prisma.invoice.findUnique({ where: { id: invId } });
    if (!existingInv) return res.status(404).json({ error: 'Invoice not found' });

    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.invoiceDate) data.invoiceDate = toDate(data.invoiceDate);
    if (data.dueDate) data.dueDate = toDate(data.dueDate);

    const netAmount = data.netAmount !== undefined ? toNum(data.netAmount) : existingInv.netAmount;
    const paidAmount = data.paidAmount !== undefined ? toNum(data.paidAmount) : existingInv.paidAmount;
    const balanceAmount = Math.max(0, Math.round((netAmount - paidAmount) * 1000) / 1000);

    data.netAmount = netAmount;
    data.paidAmount = paidAmount;
    data.balanceAmount = balanceAmount;

    if (!data.status || data.status === 'Unpaid' || data.status === 'Partially Paid' || data.status === 'Paid') {
      if (balanceAmount <= 0 && netAmount > 0) data.status = 'Paid';
      else if (paidAmount > 0) data.status = 'Partially Paid';
      else data.status = 'Unpaid';
    }

    if (data.invoiceNumber) {
      const invStr = data.invoiceNumber.toString().trim();
      if (!invStr) {
        return res.status(400).json({ error: 'Invoice number cannot be empty.' });
      }
      const existing = await prisma.invoice.findFirst({
        where: {
          invoiceNumber: invStr,
          id: { not: invId }
        }
      });
      if (existing) {
        return res.status(400).json({ error: 'Invoice number already exists. Please choose a unique one.' });
      }
      data.invoiceNumber = invStr;
    }

    const invoice = await prisma.invoice.update({
      where: { id: invId },
      data
    });
    await recalculateClientBalances(invoice.clientId);
    const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invId } });
    res.json(updatedInvoice || invoice);
  } catch (error) { 
    console.error("PUT invoice error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const invId = Number(req.params.id);
    const invoice = await prisma.invoice.findUnique({ where: { id: invId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    
    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { invoiceId: invId },
        data: { invoiceId: null }
      });
      
      await tx.invoice.update({
        where: { id: invId },
        data: {
          status: 'Cancelled',
          paidAmount: 0,
          balanceAmount: 0
        }
      });
      
      await recalculateClientBalances(invoice.clientId, tx);
    });
    
    res.json({ message: 'Invoice cancelled successfully' });
  } catch (error) { 
    console.error("DELETE invoice error:", error);
    res.status(500).json({ error: error.message }); 
  }
});

// --- RECEIPTS ---
app.get('/api/receipts', async (req, res) => {
  try {
    const { status, search, clientId, dateFrom, dateTo } = req.query;
    let where = {};
    if (status === 'Cancelled') {
      where.status = { equals: 'Cancelled', mode: 'insensitive' };
    } else {
      where.status = { not: 'Cancelled' };
    }

    if (clientId) where.clientId = Number(clientId);

    if (dateFrom || dateTo) {
      const dateCond = {};
      if (dateFrom) dateCond.gte = parseLocalDateStart(dateFrom);
      if (dateTo) dateCond.lte = parseLocalDateEnd(dateTo);

      if (status === 'Cancelled') {
        where.OR = [
          { receiptDate: dateCond },
          { cancelledOn: dateCond }
        ];
      } else {
        where.receiptDate = dateCond;
      }
    }

    if (search) {
      const searchFilter = {
        OR: [
          { receiptNumber: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { client: { code: { contains: search, mode: 'insensitive' } } },
          { client: { cellPhone: { contains: search, mode: 'insensitive' } } },
          { client: { email: { contains: search, mode: 'insensitive' } } }
        ]
      };
      where = { AND: [where, searchFilter] };
    }

    const takeVal = (req.query.limit === 'all' || !req.query.limit) ? undefined : Number(req.query.limit || req.query.take);
    const receipts = await prisma.receipt.findMany({ 
      where,
      take: takeVal,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            route: true,
            salesManager: true,
            city: true,
            cellPhone: true,
            phone: true
          }
        }
      },
      orderBy: { receiptDate: 'desc' }
    });

    const mapped = receipts.map(r => ({
      ...r,
      status: r.status || 'Active'
    }));
    res.json(mapped);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/receipts/next-number', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('receipt');
    res.json({ receiptNumber: serialResult.formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/receipts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: { client: true }
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ ...receipt, status: receipt.status || 'Active' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/receipts', async (req, res) => {
  try {
    clearCachePattern('receipts');
    clearCachePattern('clients');
    const body = req.body;
    const clientId = Number(body.clientId);
    const amount = toNum(body.amount) || 0;
    const appliedAmount = toNum(body.appliedAmount) || 0;
    const creditAmount = amount - appliedAmount;
    const receiptDate = toDate(body.receiptDate) || new Date();
    const chequeDate = toDate(body.chequeDate);
    const isAdvance = !!body.isAdvance;
    
    let requestedNumber = body.receiptNumber ? String(body.receiptNumber).trim() : '';
    let receiptNumber = requestedNumber;

    if (receiptNumber) {
      const existing = await prisma.receipt.findUnique({ where: { receiptNumber } });
      if (existing) {
        const serialResult = await getNextAtomicSequence('receipt');
        receiptNumber = serialResult.formatted;
      } else {
        await syncSequenceWithNumber('receipt', receiptNumber);
      }
    } else {
      const serialResult = await getNextAtomicSequence('receipt');
      receiptNumber = serialResult.formatted;
    }

    const paymentMode = body.paymentMode;
    const chequeNumber = body.chequeNumber;
    const notes = body.notes;
    const reference = body.reference;

    let receipt;
    let attempts = 0;
    while (attempts < 5) {
      attempts++;
      try {
        receipt = await prisma.$transaction(async (tx) => {
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
              reference,
              status: 'Active'
            }
          });

          // Also update applied invoices atomically if applications provided
          if (Array.isArray(body.applications) && body.applications.length > 0) {
            for (const app of body.applications) {
              const invId = Number(app.invoiceId);
              const appAmt = toNum(app.amount) || 0;
              if (invId && appAmt > 0) {
                const inv = await tx.invoice.findUnique({ where: { id: invId } });
                if (inv) {
                  const newPaid = (toNum(inv.paidAmount) || 0) + appAmt;
                  const newBalance = Math.max(0, (toNum(inv.netAmount) || 0) - newPaid);
                  const newStatus = newBalance <= 0.001 ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Unpaid');
                  await tx.invoice.update({
                    where: { id: invId },
                    data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus }
                  });
                }
              }
            }
          }

          await recalculateClientBalances(clientId, tx);
          return created;
        });
        break;
      } catch (createErr) {
        if (createErr.code === 'P2002' || (createErr.message && (createErr.message.includes('receiptNumber') || createErr.message.includes('Unique constraint')))) {
          const serialResult = await getNextAtomicSequence('receipt');
          receiptNumber = serialResult.formatted;
        } else {
          throw createErr;
        }
      }
    }

    res.status(201).json(receipt);
  } catch (error) { 
    console.error("Error creating receipt:", error);
    res.status(500).json({ error: error.message || 'Failed to save receipt' }); 
  }
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
      await tx.receipt.update({
        where: { id },
        data: {
          status: 'Cancelled',
          cancelledOn: new Date(),
          appliedAmount: 0,
          creditAmount: 0
        }
      });
      await recalculateClientBalances(receipt.clientId, tx);
    });
    res.json({ message: 'Payment cancelled successfully' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- ADJUSTMENTS ---
app.get('/api/adjustments', async (req, res) => {
  try {
    const { dateFrom, dateTo, clientId, type, search } = req.query;
    let where = {};

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = parseLocalDateStart(dateFrom);
      if (dateTo) where.date.lte = parseLocalDateEnd(dateTo);
    }

    if (clientId) {
      where.clientId = Number(clientId);
    }

    if (type) {
      where.type = { equals: type, mode: 'insensitive' };
    }

    if (search) {
      const searchFilter = {
        OR: [
          { adjustmentNumber: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { notes: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } }
        ]
      };
      where = { AND: [where, searchFilter] };
    }

    const items = await prisma.adjustment.findMany({ 
      where,
      select: {
        id: true,
        adjustmentNumber: true,
        date: true,
        type: true,
        amount: true,
        reason: true,
        notes: true,
        invoiceId: true,
        clientId: true,
        client: {
          select: {
            name: true,
            code: true,
            city: true,
            route: true,
            salesManager: true,
            taxId: true,
            trn: true,
            cellPhone: true
          }
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            grossAmount: true,
            taxAmount: true,
            netAmount: true,
            balanceAmount: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });
    res.json(items);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/next-adjustment-number', async (req, res) => {
  try {
    const type = req.query.type || 'adjustment';
    const key = (type.toLowerCase() === 'credit') ? 'creditAdj' : (type.toLowerCase() === 'debit' ? 'debitAdj' : (type.toLowerCase() === 'journal' ? 'journalVoucher' : 'adjustment'));
    const result = await peekNextAtomicSequence(key);
    let formatted = result.formatted;
    if (/^\d+$/.test(formatted)) {
      formatted = formatted.padStart(5, '0');
    }
    res.json({ adjustmentNumber: formatted, nextNum: result.nextNum });
  } catch (err) {
    res.json({ adjustmentNumber: '00012' });
  }
});

app.post('/api/adjustments', async (req, res) => {
  try {
    const body = req.body;
    const clientId = Number(body.clientId);
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }
    const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;
    const amount = toNum(body.amount) || 0;
    const date = toDate(body.date || body.adjustmentDate) || new Date();
    const type = body.type || 'Credit';
    const reason = body.reason ? String(body.reason) : null;
    const notes = body.notes ? String(body.notes) : null;
    let adjustmentNumber = body.adjustmentNumber ? String(body.adjustmentNumber).trim() : '';

    if (!adjustmentNumber) {
      const key = (type.toLowerCase() === 'credit') ? 'creditAdj' : (type.toLowerCase() === 'debit' ? 'debitAdj' : (type.toLowerCase() === 'journal' ? 'journalVoucher' : 'adjustment'));
      const result = await getNextAtomicSequence(key);
      let formatted = result.formatted;
      if (/^\d+$/.test(formatted)) {
        formatted = formatted.padStart(5, '0');
      }
      adjustmentNumber = formatted;
    }

    const data = {
      adjustmentNumber,
      date,
      clientId,
      invoiceId,
      type,
      amount,
      reason,
      notes
    };
    
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.adjustment.create({ data });
      await recalculateClientBalances(created.clientId, tx);
      return created;
    });
    res.status(201).json(item);
  } catch (error) { 
    console.error("POST adjustment error:", error);
    res.status(500).json({ error: error.message }); 
  }
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
app.get('/api/pickups/next-number', async (req, res) => {
  try {
    const lastPickup = await prisma.pickupRequest.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true }
    });
    const nextId = (lastPickup?.id || 0) + 1;
    const formatted = String(nextId).padStart(5, '0');
    res.json({ nextId, nextNumber: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    
    // Filter schema keys to prevent Prisma validation error
    const allowedKeys = ['clientId', 'patientName', 'productType', 'doctorName', 'requestDate', 'pickupDate', 'status', 'notes'];
    const filteredData = {};
    allowedKeys.forEach(k => {
      if (data[k] !== undefined) filteredData[k] = data[k];
    });

    const pickup = await prisma.pickupRequest.create({ data: filteredData });
    res.status(201).json(pickup);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/pickups/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.clientId) data.clientId = Number(data.clientId);
    if (data.requestDate) data.requestDate = toDate(data.requestDate);
    if (data.pickupDate) data.pickupDate = toDate(data.pickupDate);
    
    // Filter schema keys
    const allowedKeys = ['clientId', 'patientName', 'productType', 'doctorName', 'requestDate', 'pickupDate', 'status', 'notes'];
    const filteredData = {};
    allowedKeys.forEach(k => {
      if (data[k] !== undefined) filteredData[k] = data[k];
    });

    const pickup = await prisma.pickupRequest.update({
      where: { id: Number(req.params.id) },
      data: filteredData
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
app.get('/api/shipment-notes/next-number', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('shipment');
    res.json({ shipmentNumber: serialResult.formatted, nextNumber: serialResult.formatted });
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
    const { limit, page, take, skip } = req.query;
    const queryOptions = {
      where,
      select: {
        id: true,
        noteNumber: true,
        noteDate: true,
        type: true,
        status: true,
        deliveryMode: true,
        notes: true,
        deliveryPlanId: true,
        deliveryPlan: {
          select: {
            id: true,
            planDate: true,
            route: true
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            area: true,
            cellPhone: true,
            email: true
          }
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            patientName: true,
            modelNumber: true,
            productName: true,
            productType: true,
            totalAmount: true,
            netAmount: true,
            status: true
          }
        }
      },
      orderBy: { id: 'desc' }
    };

    if (limit || take) {
      const takeVal = Math.min(Number(limit || take) || 100, 1000);
      const pageVal = Math.max(Number(page) || 1, 1);
      const skipVal = skip !== undefined ? Number(skip) : (pageVal - 1) * takeVal;
      queryOptions.take = takeVal;
      queryOptions.skip = skipVal;
    }

    const notes = await prisma.shipmentNote.findMany(queryOptions);
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
    if (!note) return res.status(404).json({ error: 'Shipment note not found' });
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/shipment-notes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { deliveryPlanId, status, deliveryMode, notes } = req.body;
    const data = {};
    if (deliveryPlanId !== undefined) data.deliveryPlanId = deliveryPlanId ? Number(deliveryPlanId) : null;
    if (status !== undefined) data.status = status;
    if (deliveryMode !== undefined) data.deliveryMode = deliveryMode;
    if (notes !== undefined) data.notes = notes;
    const note = await prisma.shipmentNote.update({
      where: { id },
      data,
      include: { client: true, orders: true }
    });
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/shipment-notes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
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
      const serialResult = await getNextAtomicSequence('shipment');
      finalNoteNumber = serialResult.formatted;
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

app.post('/api/orders/bulk-update', async (req, res) => {
  try {
    const { orderIds, status, department, assignedTech } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'No orderIds provided' });
    }
    const data = {};
    if (status !== undefined) data.status = status;
    if (department !== undefined) data.department = department;
    if (assignedTech !== undefined) {
      data.technician = assignedTech ? String(assignedTech) : null;
    }

    await prisma.order.updateMany({
      where: { id: { in: orderIds.map(Number) } },
      data
    });

    res.json({ success: true, count: orderIds.length });
  } catch (error) {
    console.error('Error in /api/orders/bulk-update:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- DASHBOARD ---
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { date } = req.query;
    let today, tomorrow;

    if (date) {
      const startUTC = new Date(date + 'T00:00:00.000Z');
      const startLocal = parseLocalDateStart(date);
      today = (startUTC && !isNaN(startUTC.getTime())) ? (startUTC < startLocal ? startUTC : startLocal) : startLocal;

      const endUTC = new Date(date + 'T23:59:59.999Z');
      const endLocal = parseLocalDateEnd(date);
      const maxEnd = (endUTC && !isNaN(endUTC.getTime())) ? (endUTC > endLocal ? endUTC : endLocal) : endLocal;
      tomorrow = new Date(maxEnd.getTime() + 1000);
    } else {
      const now = new Date();
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const tomorrowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const tomorrowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

      today = todayLocal < todayUTC ? todayLocal : todayUTC;
      tomorrow = tomorrowLocal > tomorrowUTC ? tomorrowLocal : tomorrowUTC;
    }

    const [
      newClients, newOrders, deliveries, invoiced, collection, expenses,
      newW, productionW, completeW, holdW, tryinW, deliveredW, repeatW,
      pendingTryIns, pendingOnHold, overdueInvoices,
      finalDeliveriesPendingToday, finalDeliveriesExpectedToday, tryInDeliveriesToday,
      tryInsDispatchedToday, tryInsReturnedToday,
      totalClients, clientsWithOrdersGroup, uninvoicedCount
    ] = await Promise.all([
      prisma.client.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { OR: [{ receivedDate: { gte: today, lt: tomorrow } }, { createdAt: { gte: today, lt: tomorrow } }] } }),
      prisma.shipmentNote.count({ where: { noteDate: { gte: today, lt: tomorrow } } }),
      prisma.invoice.aggregate({ where: { invoiceDate: { gte: today, lt: tomorrow } }, _sum: { netAmount: true } }),
      prisma.receipt.aggregate({ where: { receiptDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { date: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      
      prisma.order.count({ where: { status: 'New' } }),
      prisma.order.count({ where: { status: { in: ['In Production', 'New', 'Hold', 'Try In'] } } }),
      prisma.order.count({ where: { status: 'Complete' } }),
      prisma.order.count({ where: { status: { in: ['Hold', 'On Hold'] } } }),
      prisma.order.count({ where: { status: 'Try In' } }),
      prisma.order.count({ where: { status: 'Delivered' } }),
      prisma.order.count({ where: { orderType: { in: ['Repeat', 'Repair'] } } }),
      
      prisma.order.count({
        where: {
          status: 'Try In',
          OR: [
            { trialDate: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
            { trialDate: null, updatedAt: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
          ]
        }
      }),
      prisma.order.count({
        where: {
          status: { in: ['Hold', 'On Hold'] },
          OR: [
            { holdFrom: { lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } },
            { holdFrom: null, updatedAt: { lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } }
          ]
        }
      }),
      prisma.invoice.count({ where: { status: { in: ['Unpaid', 'Partial'] } } }),

      // Today's Deliveries
      prisma.order.count({ where: { dueDate: { gte: today, lt: tomorrow }, status: { notIn: ['Delivered', 'Cancelled'] } } }),
      prisma.order.count({ where: { dueDate: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { trialDate: { gte: today, lt: tomorrow }, status: { notIn: ['Delivered', 'Cancelled'] } } }),

      // Try-ins Today
      prisma.order.count({ where: { status: 'Try In', updatedAt: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { status: { not: 'Try In' }, updatedAt: { gte: today, lt: tomorrow }, trialDate: { lte: today } } }),
      
      prisma.client.count(),
      prisma.order.groupBy({ by: ['clientId'] }),
      prisma.order.count({ where: { status: 'Delivered', invoiceId: null } })
    ]);

    const overdueCount = await prisma.order.count({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ['Delivered', 'Cancelled'] }
      }
    });

    const t30ForNoOrders = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const clientsWithRecentOrdersGroup = await prisma.order.groupBy({
      by: ['clientId'],
      where: {
        receivedDate: { gte: t30ForNoOrders }
      }
    });
    const noOrdersCount = totalClients - clientsWithRecentOrdersGroup.length;

    // Calculate lesserOrdersCount (< 60% of past order value when comparing last 30 days with prior 30 days)
    const nowForLesser = new Date();
    const t30 = new Date(nowForLesser.getTime() - 30 * 24 * 60 * 60 * 1000);
    const t60 = new Date(nowForLesser.getTime() - 60 * 24 * 60 * 60 * 1000);

    const clientOrdersForLesser = await prisma.order.findMany({
      where: { receivedDate: { gte: t60 } },
      select: { clientId: true, receivedDate: true, createdAt: true }
    });

    const clientInvoicesForLesser = await prisma.invoice.findMany({
      where: { invoiceDate: { gte: t60 } },
      select: { clientId: true, invoiceDate: true, netAmount: true, grossAmount: true }
    });

    const clientAgg = {};
    for (const ord of clientOrdersForLesser) {
      if (!ord.clientId) continue;
      if (!clientAgg[ord.clientId]) clientAgg[ord.clientId] = { priorCount: 0, priorVal: 0, lastCount: 0, lastVal: 0 };
      const d = ord.receivedDate || ord.createdAt;
      if (d >= t30) {
        clientAgg[ord.clientId].lastCount++;
      } else {
        clientAgg[ord.clientId].priorCount++;
      }
    }

    for (const inv of clientInvoicesForLesser) {
      if (!inv.clientId) continue;
      if (!clientAgg[inv.clientId]) clientAgg[inv.clientId] = { priorCount: 0, priorVal: 0, lastCount: 0, lastVal: 0 };
      const d = inv.invoiceDate;
      const amt = inv.netAmount || inv.grossAmount || 0;
      if (d >= t30) {
        clientAgg[inv.clientId].lastVal += amt;
      } else {
        clientAgg[inv.clientId].priorVal += amt;
      }
    }

    let lesserOrdersCount = 0;
    for (const cId in clientAgg) {
      const c = clientAgg[cId];
      if (c.priorCount > 0 && (c.priorVal > 0 ? (c.lastVal < 0.6 * c.priorVal) : (c.lastCount < c.priorCount))) {
        lesserOrdersCount++;
      }
    }

    // Calculate dueSchedule based on actual active order due dates in DB
    const activeDueGroups = await prisma.order.groupBy({
      by: ['dueDate'],
      where: {
        status: { notIn: ['Delivered', 'Cancelled'] },
        dueDate: { not: null }
      },
      _count: { id: true },
      orderBy: { dueDate: 'desc' },
      take: 7
    });

    const dueSchedule = activeDueGroups
      .filter(g => g.dueDate)
      .map(g => {
        const d = new Date(g.dueDate);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return {
          dateStr: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          isoDate: `${y}-${m}-${day}`,
          count: g._count.id
        };
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
        tryInToday: tryInDeliveriesToday,
        uninvoiced: uninvoicedCount
      },
      alerts: {
        pendingTryIns,
        pendingOnHold,
        overdueInvoices,
        lesserOrders: lesserOrdersCount,
        noOrders: noOrdersCount
      },
      dueSchedule
    });

  } catch (error) { 
    console.error('Error in /api/dashboard/stats:', error);
    res.status(500).json({ error: error.message }); 
  }
});

app.get('/api/dashboard/calendar', async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { dueDate: { gte: start, lte: end } },
          { trialDate: { gte: start, lte: end } },
          { finishDate: { gte: start, lte: end } }
        ]
      },
      select: {
        id: true,
        orderNumber: true,
        patientName: true,
        dueDate: true,
        trialDate: true,
        finishDate: true,
        status: true,
        client: { select: { name: true } }
      }
    });

    const events = [];
    for (const o of orders) {
      const clientName = o.client ? o.client.name : 'Unknown';
      if (o.dueDate) {
        const dStr = o.dueDate.toISOString().split('T')[0];
        events.push({
          date: dStr,
          type: 'due',
          title: `Order #${o.orderNumber || o.id} - ${o.patientName || 'Patient'} (Due)`,
          client: clientName
        });
      }
      if (o.trialDate) {
        const dStr = o.trialDate.toISOString().split('T')[0];
        events.push({
          date: dStr,
          type: 'trial',
          title: `Order #${o.orderNumber || o.id} - ${o.patientName || 'Patient'} (Trial)`,
          client: clientName
        });
      }
      if (o.finishDate) {
        const dStr = o.finishDate.toISOString().split('T')[0];
        events.push({
          date: dStr,
          type: 'delivery',
          title: `Order #${o.orderNumber || o.id} - ${o.patientName || 'Patient'} (Finish)`,
          client: clientName
        });
      }
    }

    res.json(events);
  } catch (error) {
    console.error('Error fetching dashboard calendar:', error);
    res.json([]);
  }
});


// --- CALENDAR ---
app.get('/api/calendar/stats', async (req, res) => {
  try {
    const { month, year, criteria, summary } = req.query;
    const m = Number(month);
    const y = Number(year);
    const dateField = criteria === 'Due Date' ? 'dueDate' : 
                      criteria === 'Order Date' ? 'receivedDate' : 
                      criteria === 'Date In' ? 'receivedDate' : 'updatedAt';

    // Extend range by 7 days before and after to cover visible month edge days
    const startDate = new Date(y, m, 1);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(y, m + 1, 1);
    endDate.setDate(endDate.getDate() + 7);

    const orders = await prisma.order.findMany({
      where: {
        [dateField]: { gte: startDate, lt: endDate }
      },
      select: { [dateField]: true, status: true, units: true }
    });

    const stats = {};
    orders.forEach(o => {
      if (!o[dateField]) return;
      const d = new Date(o[dateField]);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!stats[dateKey]) stats[dateKey] = {};
      const countInc = (summary === 'Products') ? (o.units || 1) : 1;
      let st = o.status || 'New';
      if (st === 'On Hold') st = 'Hold';
      stats[dateKey][st] = (stats[dateKey][st] || 0) + countInc;
      stats[dateKey]['Total'] = (stats[dateKey]['Total'] || 0) + countInc;
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

    const parts = date.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);

      const start = new Date(year, month, day, 0, 0, 0, 0);
      const end = new Date(year, month, day, 23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          [dateField]: { gte: start, lte: end }
        },
        include: { client: true }
      });
      res.json(orders);
    } else {
      res.json([]);
    }
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

app.put('/api/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const data = { ...body };
    if (data.stock !== undefined) data.stock = toNum(data.stock);
    if (data.minStock !== undefined) data.minStock = toNum(data.minStock);
    if (data.reorderLevel !== undefined) data.minStock = toNum(data.reorderLevel);
    if (data.purchaseRate !== undefined) data.purchaseRate = toNum(data.purchaseRate);
    if (data.retailPrice !== undefined) data.retailPrice = toNum(data.retailPrice);
    if (data.taxPercent !== undefined) data.taxPercent = toNum(data.taxPercent);
    delete data.reorderLevel;
    delete data.inventoryTransactions;

    const material = await prisma.material.update({
      where: { id },
      data
    });
    res.json(material);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.material.delete({ where: { id } });
    res.status(204).send();
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- INVENTORY TRANSACTIONS (PostgreSQL & Prisma ORM) ---
const TRANSACTIONS_FILE = path.join(__dirname, 'inventory_transactions.json');

async function ensureInventoryTransactionsMigrated() {
  try {
    const count = await prisma.inventoryTransaction.count();
    if (count === 0 && fs.existsSync(TRANSACTIONS_FILE)) {
      const raw = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        console.log(`[Migration] Migrating ${items.length} inventory transactions from JSON to PostgreSQL...`);
        for (const item of items) {
          const mat = await prisma.material.findUnique({ where: { id: Number(item.materialId) } });
          if (mat) {
            await prisma.inventoryTransaction.create({
              data: {
                docNumber: item.docNumber || null,
                type: item.type || 'Inward',
                materialId: mat.id,
                materialName: item.materialName || mat.name,
                quantity: Number(item.quantity) || 0,
                date: item.date ? new Date(item.date) : new Date(),
                supplier: item.supplier || null,
                notes: item.notes || null,
                createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
              }
            });
          }
        }
        console.log(`[Migration] Successfully migrated inventory transactions to PostgreSQL.`);
      }
    }
  } catch (e) {
    console.warn('[Migration] Error migrating inventory transactions:', e.message);
  }
}

app.get('/api/inventory/transactions/next-number', async (req, res) => {
  try {
    const { type } = req.query;
    const where = type ? { type } : {};
    const count = await prisma.inventoryTransaction.count({ where });
    const nextNum = (count + 1).toString().padStart(5, '0');
    res.json({ nextNumber: nextNum });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory/transactions', async (req, res) => {
  try {
    const { type, search, materialId } = req.query;
    const where = {};
    if (materialId) {
      where.materialId = Number(materialId);
    }
    if (type && type !== 'All') {
      where.type = type;
    }
    if (search) {
      where.OR = [
        { docNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }
    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: { material: true },
      orderBy: { date: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/transactions', async (req, res) => {
  try {
    const { type, materialId, quantity, date, supplier, docNumber, notes } = req.body;
    if (!materialId || !quantity) {
      return res.status(400).json({ error: 'Material ID and quantity are required' });
    }

    const matId = Number(materialId);
    const qty = Number(quantity);
    const updateQty = type === 'Inward' ? qty : -qty;

    const result = await prisma.$transaction(async (tx) => {
      const material = await tx.material.findUnique({ where: { id: matId } });
      if (!material) {
        throw new Error('Material not found');
      }

      const txRecord = await tx.inventoryTransaction.create({
        data: {
          type: type || 'Inward',
          materialId: matId,
          materialName: material.name,
          quantity: qty,
          date: date ? new Date(date) : new Date(),
          supplier: supplier || null,
          docNumber: docNumber || null,
          notes: notes || null
        },
        include: { material: true }
      });

      await tx.material.update({
        where: { id: matId },
        data: { stock: { increment: updateQty } }
      });

      return txRecord;
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.inventoryTransaction.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const rollbackQty = existing.type === 'Inward' ? -existing.quantity : existing.quantity;
    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransaction.delete({ where: { id } });
      if (existing.materialId) {
        await tx.material.update({
          where: { id: existing.materialId },
          data: { stock: { increment: rollbackQty } }
        });
      }
    });
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- BACKUP & EXPORT (ADMIN ONLY) ---
app.get('/api/backup/system', requireAdmin, async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { notIn: SENSITIVE_SETTING_KEYS } }
    });
    const lookups = await prisma.settingLookup.findMany();
    const dropdowns = await prisma.dropdownOption.findMany();
    const data = {
      system: 'Sohar Dental Lab',
      exportedAt: new Date().toISOString(),
      settings,
      lookups,
      dropdowns
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=SoharDental_ConfigBackup_${Date.now()}.json`);
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate configuration backup' });
  }
});

app.get('/api/backup/data', requireAdmin, async (req, res) => {
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
    res.setHeader('Content-Disposition', `attachment; filename=SoharDental_DataExport_${Date.now()}.json`);
    res.send(JSON.stringify(data, null, 2));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/backup/orders-csv', requireAdmin, async (req, res) => {
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

// --- EXCEL DATA SEED & FULL RE-IMPORT ---
app.post('/api/settings/seed-excel', memoryUpload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded. Please upload all 5 Excel files.' });
    }

    const findFile = (patterns) => {
      return files.find(f => {
        const fName = (f.originalname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const fieldN = (f.fieldname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return patterns.some(p => {
          const pat = p.toLowerCase().replace(/[^a-z0-9]/g, '');
          return fName.includes(pat) || fieldN.includes(pat);
        });
      });
    };

    const clientsFile = findFile(['Clients', 'client']);
    const clientBillsFile = findFile(['ClientBills', 'clientbill', 'bills', 'invoices']);
    const ordersFile = findFile(['Orders', 'order']);
    const clientPaymentsFile = findFile(['ClientPayments', 'clientpayment', 'payments', 'receipts']);
    const expensesFile = findFile(['Expenses', 'expense']);

    const missing = [];
    if (!clientsFile) missing.push('Clients.xls');
    if (!clientBillsFile) missing.push('ClientBills.xls');
    if (!ordersFile) missing.push('Orders.xls');
    if (!clientPaymentsFile) missing.push('ClientPayments.xls');
    if (!expensesFile) missing.push('Expenses.xls');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required Excel files: ${missing.join(', ')}. Please make sure all 5 Excel files are selected.`
      });
    }

    const filesMap = {
      clients: clientsFile.buffer,
      clientBills: clientBillsFile.buffer,
      orders: ordersFile.buffer,
      clientPayments: clientPaymentsFile.buffer,
      expenses: expensesFile.buffer
    };

    const seedMode = req.body && req.body.seedMode === 'merge' ? 'merge' : 'purge';

    console.log(`[Seed Excel] Starting import from 5 uploaded files [Mode: ${seedMode}]...`);
    const stats = await seedAllExcelData(filesMap, prisma, console.log, seedMode);

    // Invalidate in-memory response caches
    clearCachePattern();

    // Auto-sync model sequences
    await backfillMissingModelNumbers();

    res.json({
      success: true,
      message: seedMode === 'merge' 
        ? 'Database successfully merged with 5 Excel files! (Manual entries preserved)' 
        : 'Database successfully purged and re-seeded with all 5 Excel files!',
      seedMode,
      stats
    });
  } catch (error) {
    console.error('[Seed Excel Error]:', error);
    res.status(500).json({
      error: 'Failed to seed Excel data: ' + (error.message || error)
    });
  }
});

// --- Payment & Financial APIs ---

// Get Next Receipt Number
app.get('/api/receipts/next-number', async (req, res) => {
  try {
    const serialResult = await peekNextAtomicSequence('receipt');
    res.json({ receiptNumber: serialResult.formatted, nextNumber: serialResult.formatted });
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
    
    let balance = client.openingBalance || 0;
    if (client.openingBalanceType === 'Cr') {
      balance = -balance;
    }
    
    const invoicesTotal = await prisma.invoice.aggregate({
      where: { clientId },
      _sum: { netAmount: true }
    });
    const uninvoicedOrders = await prisma.order.findMany({
      where: {
        clientId,
        invoiceId: null,
        status: { not: 'Cancelled' }
      },
      select: {
        totalAmount: true,
        netAmount: true,
        price: true
      }
    });
    const uninvoicedOrdersSum = uninvoicedOrders.reduce((sum, o) => {
      return sum + (o.netAmount || o.totalAmount || o.price || 0);
    }, 0);

    const receiptsTotal = await prisma.receipt.aggregate({
      where: { clientId },
      _sum: { amount: true }
    });
    const adjustments = await prisma.adjustment.findMany({
      where: { clientId }
    });
    
    balance += (invoicesTotal._sum.netAmount || 0);
    balance += uninvoicedOrdersSum;
    balance -= (receiptsTotal._sum.amount || 0);
    
    adjustments.forEach(a => {
      if (a.type === 'Credit') {
        balance -= (a.amount || 0);
      } else if (a.type === 'Debit') {
        balance += (a.amount || 0);
      }
    });
    
    res.json({
      balance: balance.toFixed(3),
      lastInvoice: client.invoices[0],
      lastPayment: client.receipts[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const SENSITIVE_SETTING_KEYS = [
  'admin_password',
  'admin_password_hash',
  'user_password_hash',
  'jwt_secret',
  'db_url'
];

// --- SYSTEM SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: { notIn: SENSITIVE_SETTING_KEYS }
      }
    });
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
    if (SENSITIVE_SETTING_KEYS.includes(req.params.key)) {
      return res.status(403).json({ error: 'Access to this setting is restricted' });
    }
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
    if (SENSITIVE_SETTING_KEYS.includes(key)) {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required to update sensitive settings' });
      }
    }
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue }
    });

    if (key.startsWith('serial_start_')) {
      const typeKey = key.replace('serial_start_', '');
      const conf = SEQUENCE_CONFIG[typeKey];
      if (conf && conf.seqName) {
        const numVal = parseInt(value);
        if (!isNaN(numVal) && numVal > 0) {
          try {
            await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${conf.seqName}" START WITH ${numVal} INCREMENT BY 1;`);
            await prisma.$executeRawUnsafe(`SELECT setval('"${conf.seqName}"', ${numVal - 1}, false);`);
          } catch(seqErr) {
            console.warn(`[Sequence Reset Warning] ${conf.seqName}:`, seqErr.message);
          }
        }
      }
    }

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

    let role = null;
    let targetUsername = null;

    if (username === 'sohardentallab') {
      const userHashSetting = await prisma.systemSetting.findUnique({ where: { key: 'user_password_hash' } });
      let isMatch = false;
      if (userHashSetting && userHashSetting.value) {
        isMatch = await bcrypt.compare(password, userHashSetting.value);
      } else {
        if (password === 'sohardentallab') {
          isMatch = true;
          const newHash = await bcrypt.hash('sohardentallab', 10);
          await prisma.systemSetting.upsert({
            where: { key: 'user_password_hash' },
            update: { value: newHash },
            create: { key: 'user_password_hash', value: newHash }
          });
        }
      }
      if (isMatch) {
        role = 'user';
        targetUsername = 'sohardentallab';
      }
    } else if (username === 'soharadmin') {
      const adminHashSetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_password_hash' } });
      let isMatch = false;
      if (adminHashSetting && adminHashSetting.value) {
        isMatch = await bcrypt.compare(password, adminHashSetting.value);
      } else {
        const legacySetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_password' } });
        const dbPassword = legacySetting ? legacySetting.value : 'soharadmin';
        if (password === dbPassword) {
          isMatch = true;
          const newHash = await bcrypt.hash(password, 10);
          await prisma.systemSetting.upsert({
            where: { key: 'admin_password_hash' },
            update: { value: newHash },
            create: { key: 'admin_password_hash', value: newHash }
          });
        }
      }
      if (isMatch) {
        role = 'admin';
        targetUsername = 'soharadmin';
      }
    }

    if (!role) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ username: targetUsername, role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role, username: targetUsername });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication service failure' });
  }
});

app.post('/api/admin/update-password', requireAdmin, async (req, res) => {
  try {
    const { currentPwd, newPwd } = req.body;
    if (!currentPwd || !newPwd) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPwd.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    const adminHashSetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_password_hash' } });
    let isMatch = false;
    if (adminHashSetting && adminHashSetting.value) {
      isMatch = await bcrypt.compare(currentPwd, adminHashSetting.value);
    } else {
      const legacySetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_password' } });
      const dbPassword = legacySetting ? legacySetting.value : 'soharadmin';
      isMatch = (currentPwd === dbPassword);
    }

    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPwd, 10);
    await prisma.systemSetting.upsert({
      where: { key: 'admin_password_hash' },
      update: { value: newHash },
      create: { key: 'admin_password_hash', value: newHash }
    });

    try {
      await prisma.systemSetting.delete({ where: { key: 'admin_password' } });
    } catch (e) {}

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
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

app.get('/api/client-product-rate', async (req, res) => {
  try {
    const { clientId, productName } = req.query;
    if (!productName) return res.json({ rate: null });

    const pNameUpper = productName.trim().toUpperCase();

    // 1. Check if client has a specific price band or custom price for this product
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: Number(clientId) },
        select: { id: true, priceBand: true }
      });

      if (client) {
        // Find product
        const prod = await prisma.product.findFirst({
          where: { name: { equals: productName.trim() } }
        });

        if (prod && prod.priceBands && client.priceBand) {
          try {
            const bands = typeof prod.priceBands === 'string' ? JSON.parse(prod.priceBands) : prod.priceBands;
            if (bands && bands[client.priceBand] !== undefined && bands[client.priceBand] !== null) {
              return res.json({ rate: Number(bands[client.priceBand]), source: 'priceBand' });
            }
          } catch(e) {}
        }

        // Check client's recent order job for this product
        const lastJob = await prisma.orderJob.findFirst({
          where: {
            order: { clientId: Number(clientId) },
            productName: { equals: productName.trim() },
            price: { gt: 0 }
          },
          orderBy: { id: 'desc' }
        });

        if (lastJob && lastJob.price) {
          const unitRate = lastJob.price / (lastJob.units || 1);
          return res.json({ rate: Math.round(unitRate * 1000) / 1000, source: 'clientHistory' });
        }

        if (prod && prod.charge && prod.charge > 0) {
          return res.json({ rate: prod.charge, source: 'product' });
        }
      }
    }

    // Default product rate
    const prod = await prisma.product.findFirst({
      where: { name: { equals: productName.trim() } }
    });

    if (prod && prod.charge !== undefined && prod.charge !== null) {
      return res.json({ rate: prod.charge, source: 'product' });
    }

    return res.json({ rate: 0, source: 'default' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PRODUCTS CRUD ---
app.get('/api/products', async (req, res) => {
  try {
    const { search, type, category } = req.query;
    const where = {};
    if (type && type !== 'All Product Types' && type !== 'All' && type !== 'Any') {
      where.type = { equals: type, mode: 'insensitive' };
    }
    if (category && category !== 'Any') {
      where.category = { equals: category, mode: 'insensitive' };
    }
    
    let dbProducts = await prisma.product.findMany({ 
      where,
      orderBy: { name: 'asc' }
    });

    // Create a comprehensive map of all products
    const productMap = new Map();
    dbProducts.forEach(p => {
      const trimmed = (p.name || '').trim();
      if (trimmed && trimmed !== 'N/A' && trimmed !== 'NULL') {
        productMap.set(trimmed.toUpperCase(), {
          id: p.id,
          name: trimmed.toUpperCase(),
          code: p.code || '',
          type: p.type || 'General',
          category: p.category || '',
          charge: p.charge || 0,
          warranty: p.warranty !== undefined && p.warranty !== null ? p.warranty : 0,
          completionPeriod: p.completionPeriod !== undefined && p.completionPeriod !== null ? p.completionPeriod : 0,
          unitSelection: p.unitSelection || 'Teeth',
          useSlabPricing: Boolean(p.useSlabPricing),
          priceBands: p.priceBands || null,
          notes: p.notes || '',
          inactive: Boolean(p.inactive)
        });
      }
    });

    // Also fetch distinct products from order jobs if no specific type/category filter was passed or if matched
    if (!type && !category) {
      try {
        const jobProducts = await prisma.orderJob.findMany({
          select: { productName: true, productType: true },
          distinct: ['productName']
        });
        jobProducts.forEach(j => {
          if (j.productName) {
            j.productName.split(',').forEach(subName => {
              const cleaned = subName.trim();
              if (cleaned && cleaned !== 'N/A' && cleaned !== 'NULL' && cleaned.length > 1 && !productMap.has(cleaned.toUpperCase())) {
                productMap.set(cleaned.toUpperCase(), {
                  id: `job_${cleaned.toUpperCase()}`,
                  name: cleaned.toUpperCase(),
                  code: '',
                  type: j.productType || 'General',
                  category: '',
                  charge: 0,
                  unitSelection: 'Teeth'
                });
              }
            });
          }
        });

        const orderProducts = await prisma.order.findMany({
          select: { productName: true, productType: true },
          distinct: ['productName']
        });
        orderProducts.forEach(o => {
          if (o.productName) {
            o.productName.split(',').forEach(subName => {
              const cleaned = subName.trim();
              if (cleaned && cleaned !== 'N/A' && cleaned !== 'NULL' && cleaned.length > 1 && !productMap.has(cleaned.toUpperCase())) {
                productMap.set(cleaned.toUpperCase(), {
                  id: `ord_${cleaned.toUpperCase()}`,
                  name: cleaned.toUpperCase(),
                  code: '',
                  type: o.productType || 'General',
                  category: '',
                  charge: 0,
                  unitSelection: 'Teeth'
                });
              }
            });
          }
        });
      } catch (subErr) {
        console.warn('Error fetching distinct job/order products:', subErr);
      }
    }

    let products = Array.from(productMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
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

app.post('/api/products/bulk-charges', async (req, res) => {
  try {
    const { priceBand, items, category } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const isStandard = (!priceBand || priceBand === 'Standard Charge' || priceBand === 'Standard');

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const standardChargeVal = item.charge !== undefined && item.charge !== null && item.charge !== '' ? (parseFloat(item.charge) || 0) : 0;
        const bandChargeVal = item.bandCharge !== undefined && item.bandCharge !== null && item.bandCharge !== '' && !isNaN(Number(item.bandCharge)) ? Number(item.bandCharge) : null;
        const codeVal = item.code !== undefined ? (item.code || null) : undefined;

        let product = null;
        if (item.id && !isNaN(Number(item.id))) {
          product = await tx.product.findUnique({ where: { id: Number(item.id) } });
        }
        if (!product && item.name) {
          product = await tx.product.findFirst({
            where: { name: { equals: item.name, mode: 'insensitive' } }
          });
        }

        if (product) {
          const updateData = {};
          if (codeVal !== undefined) updateData.code = codeVal;

          if (isStandard) {
            updateData.charge = standardChargeVal;
          } else {
            let bands = {};
            if (product.priceBands) {
              try {
                bands = typeof product.priceBands === 'string' ? JSON.parse(product.priceBands) : product.priceBands;
              } catch (e) {
                bands = {};
              }
            }
            if (bandChargeVal !== null) {
              bands[priceBand] = bandChargeVal;
            } else {
              delete bands[priceBand];
            }
            updateData.priceBands = JSON.stringify(bands);
          }

          await tx.product.update({
            where: { id: product.id },
            data: updateData
          });
        } else if (item.name) {
          const createData = {
            name: item.name,
            code: item.code || null,
            type: item.type || category || 'General',
            charge: standardChargeVal
          };
          if (!isStandard && bandChargeVal !== null) {
            const bands = { [priceBand]: bandChargeVal };
            createData.priceBands = JSON.stringify(bands);
          }
          await tx.product.create({ data: createData });
        }
      }
    });

    clearCachePattern('products');
    res.json({ success: true, message: 'Charges updated successfully' });
  } catch (error) {
    console.error('Error in bulk-charges:', error);
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

// --- DROPDOWN MANAGER CRUD ---
app.get('/api/dropdowns', async (req, res) => {
  try {
    const { activeOnly, dropdownKey } = req.query;
    const cacheKey = `dropdowns_${activeOnly || 'all'}_${dropdownKey || 'all'}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

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
    setCache(cacheKey, options);
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dropdowns', async (req, res) => {
  try {
    clearCachePattern('dropdowns');
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
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'ASAP', optionValue: 'ASAP', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Expedite Service', optionValue: 'Expedite Service', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Normal', optionValue: 'Normal', sortOrder: 3 },
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Urgent', optionValue: 'Urgent', sortOrder: 4 },
        { page: 'Order', dropdownKey: 'order_priority', dropdownLabel: 'Order Priority', optionLabel: 'Very Urgent', optionValue: 'Very Urgent', sortOrder: 5 },

        // hold_reason
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Design not clear', optionValue: 'Design not clear', sortOrder: 1 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Doctors Confirmation', optionValue: 'Doctors Confirmation', sortOrder: 2 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Improper Impression', optionValue: 'Improper Impression', sortOrder: 3 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Payment Pending', optionValue: 'Payment Pending', sortOrder: 4 },
        { page: 'Order', dropdownKey: 'hold_reason', dropdownLabel: 'Hold Reason', optionLabel: 'Work Order Incomplete', optionValue: 'Work Order Incomplete', sortOrder: 5 },

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
        { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Goods Inward', optionValue: 'Goods Inward', sortOrder: 2 },
        { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Opening Stock', optionValue: 'Opening Stock', sortOrder: 3 },

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

async function backfillMissingModelNumbers() {
  try {
    const countResult = await prisma.$queryRaw`SELECT COUNT(*)::int as cnt FROM "Order" WHERE "modelNumber" IS NULL OR "modelNumber" = '';`;
    const cnt = countResult && countResult[0] ? countResult[0].cnt : 0;

    if (cnt > 0) {
      console.log(`[Backfill] Found ${cnt} orders without model number. Performing fast batch auto-assignment...`);
      const serialResult = await getNextAtomicSequence('model');
      let startVal = serialResult.nextNum;

      await prisma.$executeRawUnsafe(`
        WITH numbered AS (
          SELECT id, (${startVal} + ROW_NUMBER() OVER (ORDER BY id ASC) - 1)::text as generated_model
          FROM "Order"
          WHERE "modelNumber" IS NULL OR "modelNumber" = ''
        )
        UPDATE "Order"
        SET "modelNumber" = numbered.generated_model
        FROM numbered
        WHERE "Order".id = numbered.id;
      `);

      const maxRows = await prisma.$queryRawUnsafe(`SELECT MAX(NULLIF(regexp_replace("modelNumber", '\\D', '', 'g'), '')::bigint) as max_val FROM "Order";`);
      const maxVal = maxRows && maxRows[0] && maxRows[0].max_val ? Number(maxRows[0].max_val) : (startVal + cnt);
      await prisma.$executeRawUnsafe(`SELECT setval('"sdl_model_seq"', ${maxVal}, true);`);

      console.log(`[Backfill] Successfully auto-assigned ${cnt} model numbers in batch (sequence set to ${maxVal})!`);
    }
  } catch (err) {
    console.error('[Backfill Error]', err.message);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Server is successfully running on port ${PORT}`);
  console.log('Keep this window open to maintain server connection.');
  await ensureMaterialsSeeded();
  await ensureDropdownsSeeded();
  await ensureInventoryTransactionsMigrated();
  await backfillMissingModelNumbers();
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use. Please close the other application or restart your computer.`);
  } else {
    console.error('Server failed to start:', err);
  }
});
