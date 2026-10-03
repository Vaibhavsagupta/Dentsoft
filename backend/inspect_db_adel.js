const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
    const c = await prisma.client.findFirst({ where: { name: 'ADEL DENTAL' } });
    console.log('Client ADEL DENTAL:', c);
    const ords = await prisma.order.findMany({
        where: { orderNumber: { in: ['31194', '29873', '30800', '31253'] } },
        include: { jobs: true, invoice: true }
    });
    console.log('Orders:', JSON.stringify(ords, null, 2));
    const invs = await prisma.invoice.findMany({
        where: { clientId: c.id },
        include: { orders: { include: { jobs: true } } }
    });
    console.log('Invoices for ADEL:', JSON.stringify(invs, null, 2));
    const recs = await prisma.receipt.findMany({
        where: { clientId: c.id }
    });
    console.log('Receipts for ADEL:', JSON.stringify(recs, null, 2));
}

inspect().finally(() => prisma.$disconnect());
