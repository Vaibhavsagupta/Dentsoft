const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const cId = 5733;
    const client = await prisma.client.findUnique({ where: { id: cId } });
    const invs = await prisma.invoice.findMany({ where: { clientId: cId }, include: { orders: { include: { jobs: true } } } });
    const recs = await prisma.receipt.findMany({ where: { clientId: cId } });

    let opening = client.openingBalance || 0;
    if (client.openingBalanceType && client.openingBalanceType.toLowerCase() === 'cr') opening = -opening;

    invs.forEach(i => {
        const dStr = i.invoiceDate.toISOString().slice(0, 10);
        if (dStr < '2026-09-01') opening += i.netAmount;
    });
    recs.forEach(r => {
        const dStr = r.receiptDate.toISOString().slice(0, 10);
        if (dStr < '2026-09-01') opening -= r.amount;
    });

    console.log('Opening Balance as of 01 Sep 2026:', opening, opening > 0 ? 'Dr' : 'Cr');

    let running = opening;
    const txs = [];
    invs.forEach(i => {
        const dStr = i.invoiceDate.toISOString().slice(0, 10);
        if (dStr >= '2026-09-01' && dStr <= '2026-09-19') {
            txs.push({ date: i.invoiceDate, type: 'Invoice', ref: i.invoiceNumber, debit: i.netAmount, credit: 0, obj: i });
        }
    });
    recs.forEach(r => {
        const dStr = r.receiptDate.toISOString().slice(0, 10);
        if (dStr >= '2026-09-01' && dStr <= '2026-09-19') {
            const mode = r.paymentMode || 'Cash';
            txs.push({ date: r.receiptDate, type: mode.startsWith('Pay') ? mode : 'Payment (' + mode + ')', ref: r.receiptNumber, debit: 0, credit: r.amount, obj: r });
        }
    });
    txs.sort((a,b) => a.date - b.date);

    console.log('\n--- SEPTEMBER TRANSACTIONS ---');
    txs.forEach(t => {
        running = running + t.debit - t.credit;
        console.log(`${t.date.toISOString().slice(0, 10)} | ${t.ref} | ${t.type} | Debit: ${t.debit.toFixed(2)} | Credit: ${t.credit.toFixed(2)} | Balance: ${running.toFixed(2)} Dr`);
        if (t.obj.orders) {
            t.obj.orders.forEach(o => {
                console.log(`   Order #${o.orderNumber} | Date: ${o.receivedDate ? o.receivedDate.toISOString().slice(0, 10) : '-'} | Teeth: ${o.teethSelection} | Product: ${o.productName} | Units: ${o.units}`);
                if (o.jobs && o.jobs.length > 0) {
                    o.jobs.forEach(j => {
                        console.log(`      Job: ${j.productName} | Teeth: ${j.teethSelection} | Units: ${j.units} | Price: ${j.price}`);
                    });
                }
            });
        }
    });
}

check().finally(() => prisma.$disconnect());
