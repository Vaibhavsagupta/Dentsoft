const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseDate(dStr) {
    if (!dStr) return null;
    const cleaned = String(dStr).replace(',', ' ').trim();
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
    return null;
}

async function seed() {
    console.log('Starting Labyx Adjustments & Opening Balances Seeding...');

    // 1. Fetch Clients and Invoices
    const clients = await prisma.client.findMany();
    const invoices = await prisma.invoice.findMany({ select: { id: true, invoiceNumber: true, clientId: true } });

    const clientByCode = {};
    clients.forEach(c => {
        if (c.code) clientByCode[c.code.trim()] = c;
    });

    const invoiceByNum = {};
    invoices.forEach(i => {
        if (i.invoiceNumber) invoiceByNum[i.invoiceNumber.trim()] = i;
    });

    // 2. Parse AllClientsOutstandin for Initial Opening Balances
    console.log('\n--- 1. Updating Client Opening Balances ---');
    const wbOutstanding = xlsx.readFile('c:\\Users\\Vaibhav\\Desktop\\sdl\\AllClientsOutstandin-27Sep2026_0317PM.xlsx');
    const sheetOut = wbOutstanding.Sheets[wbOutstanding.SheetNames[0]];
    const rowsOut = xlsx.utils.sheet_to_json(sheetOut, { header: 1 });

    let updatedClientsCount = 0;
    for (let i = 3; i < rowsOut.length; i++) {
        const r = rowsOut[i];
        if (!r || r.length < 2 || !r[0]) continue;
        const code = String(r[1]).trim();
        const op = parseFloat(String(r[2] || 0).replace(/,/g, '')) || 0;

        const c = clientByCode[code];
        if (c) {
            const opVal = Math.abs(op);
            const opType = op < 0 ? 'Cr' : 'Dr';
            await prisma.client.update({
                where: { id: c.id },
                data: {
                    openingBalance: opVal,
                    openingBalanceType: opType
                }
            });
            updatedClientsCount++;
        }
    }
    console.log(`Updated initial opening balances for ${updatedClientsCount} clients.`);

    // 3. Parse ClientwiseCreditAdju for Adjustments
    console.log('\n--- 2. Seeding 383 Credit Adjustments ---');
    const wbClientAdj = xlsx.readFile('c:\\Users\\Vaibhav\\Desktop\\sdl\\ClientwiseCreditAdju-27Sep2026_0316PM.xlsx');
    const sheetClientAdj = wbClientAdj.Sheets[wbClientAdj.SheetNames[0]];
    const rowsClientAdj = xlsx.utils.sheet_to_json(sheetClientAdj, { header: 1 });

    let currentClient = null;
    let currentCode = null;
    const adjustmentsToInsert = [];

    for (let i = 0; i < rowsClientAdj.length; i++) {
        const r = rowsClientAdj[i];
        if (!r || r.length === 0) continue;

        if (r.length === 1 && typeof r[0] === 'string' && r[0].includes('(') && r[0].includes(')')) {
            const lastParenMatch = r[0].match(/^(.*?)\s*\(([^()]+)\)\s*$/);
            if (lastParenMatch) {
                currentClient = lastParenMatch[1].trim();
                currentCode = lastParenMatch[2].trim();
            }
            continue;
        }

        if (r[0] === 'Adjustment Type' || r[0] === 'Client wise Credit Adjustments') continue;

        if (r.length >= 8 && currentCode) {
            const adjType = String(r[0] || 'Discount').trim();
            const adjDateStr = String(r[1] || '').trim();
            const adjNo = String(r[2] || '').trim();
            const invNo = String(r[3] || '').trim();
            const invDateStr = String(r[4] || '').trim();
            const invAmt = parseFloat(String(r[5] || 0).replace(/,/g, '')) || 0;
            const invBal = parseFloat(String(r[6] || 0).replace(/,/g, '')) || 0;
            const adjAmt = parseFloat(String(r[7] || 0).replace(/,/g, '')) || 0;

            if (adjNo && adjAmt > 0) {
                const adjDate = parseDate(adjDateStr);
                const c = clientByCode[currentCode];
                if (!c) {
                    console.warn(`Client not found for code: ${currentCode} (${currentClient})`);
                    continue;
                }

                const inv = invoiceByNum[invNo];

                adjustmentsToInsert.push({
                    adjustmentNumber: adjNo,
                    date: adjDate || new Date(),
                    clientId: c.id,
                    invoiceId: inv ? inv.id : null,
                    type: 'Credit',
                    amount: adjAmt,
                    reason: adjType,
                    notes: invNo ? `Discount on Inv #${invNo}` : 'Credit Adjustment'
                });
            }
        }
    }

    console.log(`Total adjustments parsed: ${adjustmentsToInsert.length}`);

    // Clean old adjustments and insert new ones
    await prisma.adjustment.deleteMany({});
    console.log('Cleared existing Adjustment records.');

    // Batch insert
    let insertedCount = 0;
    for (const adj of adjustmentsToInsert) {
        // Handle duplicate adjustment numbers by appending index if needed, or ensure uniqueness
        try {
            await prisma.adjustment.create({
                data: adj
            });
            insertedCount++;
        } catch (err) {
            // If duplicate adjustmentNumber constraint, make unique
            if (err.code === 'P2002') {
                const uniqueAdjNo = `${adj.adjustmentNumber}-${insertedCount + 1}`;
                await prisma.adjustment.create({
                    data: {
                        ...adj,
                        adjustmentNumber: uniqueAdjNo
                    }
                });
                insertedCount++;
            } else {
                console.error(`Error inserting adjustment ${adj.adjustmentNumber}:`, err.message);
            }
        }
    }

    console.log(`Successfully inserted ${insertedCount} adjustments!`);
    console.log('\nSeeding completed successfully!');
}

seed().catch(e => {
    console.error('Seeding error:', e);
}).finally(() => prisma.$disconnect());
