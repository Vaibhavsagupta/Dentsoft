const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "Order" 
    SET "holdReason" = 'Clarification Needed',
        "holdFrom" = COALESCE("holdFrom", "receivedDate", "createdAt") 
    WHERE "status" IN ('Hold', 'On Hold') AND ("holdReason" IS NULL OR "holdReason" = '')
  `);
  console.log('Successfully updated Hold orders count with holdReason:', result);
  
  const samples = await prisma.order.findMany({
    where: { status: { in: ['Hold', 'On Hold'] } },
    orderBy: { id: 'desc' },
    take: 8
  });
  console.log('Sample Hold Orders:', samples.map(s => ({
    orderNumber: s.orderNumber,
    receivedDate: s.receivedDate,
    holdFrom: s.holdFrom,
    holdReason: s.holdReason,
    status: s.status
  })));
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
