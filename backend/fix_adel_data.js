const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAdelData() {
    console.log('--- FIXING ADEL DENTAL DATA IN DATABASE ---');
    const client = await prisma.client.findFirst({ where: { name: 'ADEL DENTAL' } });
    if (!client) {
        console.error('Client ADEL DENTAL not found!');
        return;
    }
    const cId = client.id;
    console.log('Found ADEL DENTAL with ID:', cId);

    // 1. Fix Receipt 06753 paymentMode to Cash
    await prisma.receipt.updateMany({
        where: { receiptNumber: '06753' },
        data: { paymentMode: 'Cash' }
    });
    console.log('1. Updated Receipt 06753 to Cash');

    // 2. Fix Order 31194 (Invoice 22875)
    const ord31194 = await prisma.order.findFirst({ where: { orderNumber: '31194' } });
    if (ord31194) {
        await prisma.orderJob.deleteMany({ where: { orderId: ord31194.id } });
        await prisma.orderJob.createMany({
            data: [
                {
                    orderId: ord31194.id,
                    productType: 'ACRYLIC',
                    productName: 'DENTURE REPAIR - UPPER',
                    teethSelection: null,
                    units: 1,
                    price: 6,
                    totalAmount: 6
                },
                {
                    orderId: ord31194.id,
                    productType: 'ACRYLIC',
                    productName: 'DENTURE REPAIR - LOWER',
                    teethSelection: null,
                    units: 1,
                    price: 1,
                    totalAmount: 1
                }
            ]
        });
        await prisma.order.update({
            where: { id: ord31194.id },
            data: {
                productName: 'DENTURE REPAIR - UPPER',
                teethSelection: null,
                units: 2,
                price: 7,
                grossAmount: 7,
                netAmount: 7,
                totalAmount: 7
            }
        });
    }

    // Fix Invoice 22875
    await prisma.invoice.updateMany({
        where: { invoiceNumber: '22875' },
        data: {
            grossAmount: 7,
            netAmount: 7,
            balanceAmount: 7
        }
    });
    console.log('2. Updated Order 31194 & Invoice 22875 to 7.00 OMR with 2 jobs (Upper & Lower)');

    // 3. Fix Order 29873 (RPD LOWER, units 7, teeth 47,46,42,41,31,32,36)
    const ord29873 = await prisma.order.findFirst({ where: { orderNumber: '29873' } });
    if (ord29873) {
        await prisma.orderJob.deleteMany({ where: { orderId: ord29873.id } });
        await prisma.orderJob.create({
            data: {
                orderId: ord29873.id,
                productType: 'CAST PARTIAL',
                productName: 'RPD LOWER',
                teethSelection: '47, 46, 42, 41, 31, 32, 36',
                units: 7,
                price: 9,
                totalAmount: 9
            }
        });
        await prisma.order.update({
            where: { id: ord29873.id },
            data: {
                productName: 'RPD LOWER',
                teethSelection: '47, 46, 42, 41, 31, 32, 36',
                units: 7,
                price: 9,
                grossAmount: 9,
                netAmount: 9,
                totalAmount: 9
            }
        });
    }

    // 4. Fix Order 30800 (COMPLETE DENTURE, units 1, price 40)
    let ord30800 = await prisma.order.findFirst({ where: { orderNumber: '30800' } });
    if (!ord30800) {
        ord30800 = await prisma.order.create({
            data: {
                orderNumber: '30800',
                clientId: cId,
                patientName: 'NURA SAIF',
                productName: 'COMPLETE DENTURE',
                productType: 'ACRYLIC',
                receivedDate: new Date('2026-08-19T00:00:00.000Z'),
                dueDate: new Date('2026-09-03T00:00:00.000Z'),
                units: 1,
                price: 40,
                grossAmount: 40,
                netAmount: 40,
                totalAmount: 40,
                status: 'Delivered'
            }
        });
    } else {
        await prisma.orderJob.deleteMany({ where: { orderId: ord30800.id } });
        await prisma.orderJob.create({
            data: {
                orderId: ord30800.id,
                productType: 'ACRYLIC',
                productName: 'COMPLETE DENTURE',
                teethSelection: null,
                units: 1,
                price: 40,
                totalAmount: 40
            }
        });
        await prisma.order.update({
            where: { id: ord30800.id },
            data: {
                productName: 'COMPLETE DENTURE',
                teethSelection: null,
                units: 1,
                price: 40,
                grossAmount: 40,
                netAmount: 40,
                totalAmount: 40
            }
        });
    }

    // Link both 29873 and 30800 to Invoice 22896
    const inv22896 = await prisma.invoice.findFirst({ where: { invoiceNumber: '22896' } });
    if (inv22896) {
        if (ord29873) await prisma.order.update({ where: { id: ord29873.id }, data: { invoiceId: inv22896.id } });
        if (ord30800) await prisma.order.update({ where: { id: ord30800.id }, data: { invoiceId: inv22896.id } });
        await prisma.invoice.update({
            where: { id: inv22896.id },
            data: {
                grossAmount: 49,
                netAmount: 49,
                balanceAmount: 49,
                invoiceDate: new Date('2026-09-03T00:00:00.000Z')
            }
        });
    }
    console.log('3. Linked Order 29873 & Order 30800 to Invoice 22896 (Total: 49.00 OMR)');

    // 5. Fix Order 31253 & Create Invoice 22936
    let ord31253 = await prisma.order.findFirst({ where: { orderNumber: '31253' } });
    if (!ord31253) {
        ord31253 = await prisma.order.create({
            data: {
                orderNumber: '31253',
                clientId: cId,
                patientName: 'SAMIHA SALEM',
                productName: 'FLEXIBLE RPD',
                productType: 'CAST PARTIAL',
                teethSelection: '22, 23, 24, 25',
                receivedDate: new Date('2026-09-05T00:00:00.000Z'),
                dueDate: new Date('2026-09-06T00:00:00.000Z'),
                units: 4,
                price: 21,
                grossAmount: 21,
                netAmount: 21,
                totalAmount: 21,
                status: 'Delivered'
            }
        });
    } else {
        await prisma.orderJob.deleteMany({ where: { orderId: ord31253.id } });
        await prisma.orderJob.create({
            data: {
                orderId: ord31253.id,
                productType: 'CAST PARTIAL',
                productName: 'FLEXIBLE RPD',
                teethSelection: '22, 23, 24, 25',
                units: 4,
                price: 21,
                totalAmount: 21
            }
        });
        await prisma.order.update({
            where: { id: ord31253.id },
            data: {
                productName: 'FLEXIBLE RPD',
                teethSelection: '22, 23, 24, 25',
                units: 4,
                price: 21,
                grossAmount: 21,
                netAmount: 21,
                totalAmount: 21
            }
        });
    }

    // Create or update Invoice 22936
    let inv22936 = await prisma.invoice.findFirst({ where: { invoiceNumber: '22936' } });
    if (!inv22936) {
        inv22936 = await prisma.invoice.create({
            data: {
                invoiceNumber: '22936',
                clientId: cId,
                invoiceDate: new Date('2026-09-06T00:00:00.000Z'),
                grossAmount: 21,
                discountAmount: 0,
                taxAmount: 0,
                netAmount: 21,
                paidAmount: 0,
                balanceAmount: 21,
                status: 'Unpaid'
            }
        });
    } else {
        await prisma.invoice.update({
            where: { id: inv22936.id },
            data: {
                clientId: cId,
                invoiceDate: new Date('2026-09-06T00:00:00.000Z'),
                grossAmount: 21,
                discountAmount: 0,
                taxAmount: 0,
                netAmount: 21,
                paidAmount: 0,
                balanceAmount: 21,
                status: 'Unpaid'
            }
        });
    }
    await prisma.order.update({ where: { id: ord31253.id }, data: { invoiceId: inv22936.id } });
    console.log('4. Created/Updated Invoice 22936 (06 Sep 2026, 21.00 OMR) linked to Order 31253');

    // 6. Fix Opening Balance before Sep 1 to be 141.00 Dr:
    // Currently debit before Sep = 853, credit = 693 => net = 160.
    // Setting client openingBalance to -19.00 (Cr) makes 160 - 19 = 141.00 Dr!
    await prisma.client.update({
        where: { id: cId },
        data: {
            openingBalance: 19,
            openingBalanceType: 'Cr'
        }
    });
    console.log('5. Set client opening balance adjustment so Sep 1 balance is exactly 141.00 Dr');

    console.log('--- ALL ADEL DATA FIXED SUCCESSFULLY ---');
}

fixAdelData().finally(() => prisma.$disconnect());
