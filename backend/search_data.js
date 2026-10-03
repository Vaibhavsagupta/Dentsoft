const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- SEARCHING INVOICES ---');
    const invs = await prisma.invoice.findMany({
        where: {
            invoiceNumber: { in: ['22875', '22896', '22936', '06753', '6753'] }
        },
        include: { client: true, orders: { include: { jobs: true } } }
    });
    console.log('Invoices found:', JSON.stringify(invs, null, 2));

    console.log('--- SEARCHING ORDERS ---');
    const ords = await prisma.order.findMany({
        where: {
            orderNumber: { in: ['31194', '29873', '30800', '31253'] }
        },
        include: { client: true, jobs: true, invoice: true }
    });
    console.log('Orders found:', JSON.stringify(ords, null, 2));

    console.log('--- SEARCHING RECEIPTS ---');
    const recs = await prisma.receipt.findMany({
        where: {
            receiptNumber: { in: ['06753', '6753', '22875', '22896'] }
        },
        include: { client: true }
    });
    console.log('Receipts found:', JSON.stringify(recs, null, 2));

    console.log('--- ALL CLIENTS WITH ADEL ---');
    const clients = await prisma.client.findMany({
        where: { name: { contains: 'ADEL', mode: 'insensitive' } }
    });
    console.log('Clients:', clients);
}

main().catch(console.error).finally(() => prisma.$disconnect());
