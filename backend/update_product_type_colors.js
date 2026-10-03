const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const colorDefinitions = [
    { name: 'ACRYLIC', color: '#993366' },
    { name: 'ACRYLIC COMPLETE DENTURE', color: '#ff00ff' },
    { name: 'ACRYLIC FACING', color: '#0000ff' },
    { name: 'BILATERAL DENTURE FRAME', color: '#0000ff' },
    { name: 'BITE RIMS', color: '#ff00ff' },
    { name: 'BITE SPLINT', color: '#3366ff' },
    { name: 'BLEACHING TRAY', color: '#ff6600' },
    { name: 'CEMENT RETAIN PFM', color: '#000080' },
    { name: 'CERAMIC', color: '#000080' },
    { name: 'CERAMIC (crown bridge category)', color: '#ff00ff' },
    { name: 'COLD CURE REPAIR', color: '#993366' },
    { name: 'DUPLICATION OF CASTS', color: '#ff00ff' },
    { name: 'DURACETAL PARTIAL DENTURE', color: '#3366ff' },
    { name: 'DURAFLEX PARTIAL DENTURE', color: '#993366' },
    { name: 'EMAX VENEER', color: '#ff6600' },
    { name: 'FLEXIBLE', color: '#0000ff' },
    { name: 'FLEXIBLE RPD BITE RIM U/L', color: '#3366ff' },
    { name: 'FLEXIBLE RPD REPAIR', color: '#ff6600' },
    { name: 'FULL METAL', color: '#993366' },
    { name: 'FULL PALATAL COVERAGE FRAME', color: '#ff6600' },
    { name: 'HABIT BREAKER', color: '#000080' },
    { name: "HAWLEY'S APPLIANCE", color: '#3366ff' },
    { name: 'HAWLY"S APPLIANCE WITH EXPANSION SCREW', color: '#3366ff' },
    { name: "HAWLEY'S APPLIANCE WITH EXPANSION SCREW", color: '#3366ff' },
    { name: 'HYBRID DENTURE', color: '#ff00ff' },
    { name: 'IN LAY', color: '#666699' },
    { name: 'MATERIALS', color: '#0000ff' },
    { name: 'METAL', color: '#993366' },
    { name: 'METAL TRAIL', color: '#000080' },
    { name: 'MONILITHIUM', color: '#0000ff' },
    { name: 'ORTHO', color: '#ff00ff' },
    { name: 'ORTHO RETRACTER', color: '#0000ff' },
    { name: 'PFM', color: '#993366' },
    { name: 'PFM FACING', color: '#993366' },
    { name: 'SCAN', color: '#000080' },
    { name: 'SOLDERED TPA MOLAR TUBE', color: '#000080' },
    { name: 'SPACE MAINTAINER REPAIR', color: '#993366' },
    { name: 'SPACE MAINTAINER WITH RPD', color: '#993366' },
    { name: 'STUDY MODEL', color: '#ff00ff' },
    { name: 'ZIRCON CORE CUTBACK', color: '#666699' },
    { name: 'ZIRCON REPAIR', color: '#000080' },
    { name: 'ZIRCONIUM', color: '#0000ff' },
    { name: 'SPACE MAINTAINER', color: '#993366' },
    { name: 'COMPLETE DENTURE', color: '#ff00ff' },
    { name: 'RPD', color: '#993366' },
    { name: 'SPECIAL TRAY', color: '#ff00ff' }
];

async function updateColors() {
    console.log('Fetching all existing ProductTypes...');
    const existing = await prisma.productType.findMany();
    console.log(`Found ${existing.length} product types in database.`);

    for (const item of colorDefinitions) {
        // Find existing match case-insensitively
        const match = existing.find(e => e.name.trim().toUpperCase() === item.name.trim().toUpperCase());
        if (match) {
            await prisma.productType.update({
                where: { id: match.id },
                data: { color: item.color }
            });
            console.log(`Updated: ${match.name} -> ${item.color}`);
        } else {
            // Create if missing
            const created = await prisma.productType.create({
                data: {
                    name: item.name,
                    category: item.name.includes('DENTURE') ? 'Prosthetics' : 'Crown & Bridge',
                    color: item.color
                }
            });
            console.log(`Created: ${created.name} -> ${item.color}`);
        }
    }

    const allUpdated = await prisma.productType.findMany({ select: { id: true, name: true, color: true } });
    console.log(`\n--- Final Product Types (${allUpdated.length}) ---`);
}

updateColors().catch(console.error).finally(() => prisma.$disconnect());
