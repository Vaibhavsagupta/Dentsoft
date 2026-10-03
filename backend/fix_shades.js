const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isNoShadeProduct(pName, pType) {
  const u = ((pName || '') + ' ' + (pType || '')).toUpperCase();
  if (
    u.includes('CROWN') ||
    u.includes('BRIDGE') ||
    u.includes('PFM') ||
    u.includes('ZIRCON') ||
    u.includes('CERAMIC') ||
    u.includes('EMAX') ||
    u.includes('E-MAX') ||
    u.includes('VENEER') ||
    u.includes('INLAY') ||
    u.includes('ONLAY') ||
    u.includes('JACKET')
  ) {
    return false;
  }
  return (
    u.includes('RPD') ||
    u.includes('DENTURE') ||
    u.includes('BITE RIM') ||
    u.includes('SPECIAL TRAY') ||
    u.includes('TRAY') ||
    u.includes('NIGHT GUARD') ||
    u.includes('GUARD') ||
    u.includes('SPLINT') ||
    u.includes('RETAINER') ||
    u.includes('TWIN BLOCK') ||
    u.includes('ORTHO') ||
    u.includes('MODEL') ||
    u.includes('REPAIR') ||
    u.includes('ACRYLIC') ||
    u.includes('CAST PARTIAL') ||
    u.includes('BLEACHING') ||
    u.includes('EXPANSION')
  );
}

async function run() {
  const shadePalette = ['A1', 'A2', 'A3', 'A3.5', 'B1', 'B2', 'C1', 'C2', 'D2', '1M1', '2M2', '3M2', '0M1', 'BL2'];
  const jobs = await prisma.orderJob.findMany({
    select: { id: true, productName: true, productType: true, shade1: true, shade2: true, shade3: true, orderId: true }
  });

  console.log(`Processing ${jobs.length} jobs with fast batching...`);

  const nullIds = [];
  const paletteUpdates = {};
  shadePalette.forEach(s => paletteUpdates[s] = []);

  for (const j of jobs) {
    const prodName = j.productName || '';
    const prodType = j.productType || '';

    if (isNoShadeProduct(prodName, prodType)) {
      nullIds.push(j.id);
    } else {
      if (j.shade1 === 'A2' && !j.shade2 && !j.shade3) {
        const seed = (j.id * 13 + (j.orderId || 0) * 7) % shadePalette.length;
        const assignedShade = shadePalette[seed];
        paletteUpdates[assignedShade].push(j.id);
      }
    }
  }

  // 1. Set shade1 = null for non-shade products
  console.log(`Clearing shade for ${nullIds.length} non-shade jobs in chunks...`);
  for (let i = 0; i < nullIds.length; i += 500) {
    const chunk = nullIds.slice(i, i + 500);
    await prisma.orderJob.updateMany({
      where: { id: { in: chunk } },
      data: { shade1: null, shade2: null, shade3: null }
    });
  }

  // 2. Set realistic shades for crown/bridge jobs
  for (const shade of shadePalette) {
    const ids = paletteUpdates[shade];
    if (ids.length > 0) {
      console.log(`Updating ${ids.length} jobs to shade '${shade}'...`);
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await prisma.orderJob.updateMany({
          where: { id: { in: chunk } },
          data: { shade1: shade }
        });
      }
    }
  }

  console.log('Successfully completed batch update!');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
