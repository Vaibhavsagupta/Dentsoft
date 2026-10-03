const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultLookups = [
  // priorities
  { type: 'priority', name: 'ASAP' },
  { type: 'priority', name: 'Expedite Service' },
  { type: 'priority', name: 'Normal' },
  { type: 'priority', name: 'Urgent' },
  { type: 'priority', name: 'Very Urgent' },
  
  // departments
  { type: 'department', name: 'Acrylic' },
  { type: 'department', name: 'Ceramic' },
  { type: 'department', name: 'Metal' },
  { type: 'department', name: 'Crown & Bridge' },
  { type: 'department', name: 'Orthodontics' },
  
  // enclosures
  { type: 'enclosure', name: 'Abutments' },
  { type: 'enclosure', name: 'Bite' },
  { type: 'enclosure', name: 'CAD CAM Files' },
  { type: 'enclosure', name: 'Facebow Articulator' },
  { type: 'enclosure', name: 'Imp Post' },
  { type: 'enclosure', name: 'Impression Lower' },
  { type: 'enclosure', name: 'Impression Upper' },
  { type: 'enclosure', name: 'Lab Analogue' },
  { type: 'enclosure', name: 'LOWER' },
  { type: 'enclosure', name: 'Model Lower' },
  { type: 'enclosure', name: 'Model Upper' },
  { type: 'enclosure', name: 'Photos' },
  { type: 'enclosure', name: 'RE TRIAL' },
  { type: 'enclosure', name: 'REMARKS' },
  { type: 'enclosure', name: 'UPPER' },
  
  // payment_modes
  { type: 'payment_mode', name: JSON.stringify({ desc: 'Cash', type: 'Cash', relAccount: 'Cash Account', access: 'Hide' }) },
  { type: 'payment_mode', name: JSON.stringify({ desc: 'Cheque', type: 'Cheque', relAccount: 'Bank Account', access: 'Edit' }) },
  { type: 'payment_mode', name: JSON.stringify({ desc: 'NetBanking', type: 'NetBanking', relAccount: 'Bank Account', access: 'Edit' }) },
  
  // tax_options
  { type: 'tax_option', name: JSON.stringify({ desc: 'GST', pct: 12 }) },
  
  // categories
  { type: 'category', name: 'Balance Amount' },
  { type: 'category', name: 'Favorite' },
  { type: 'category', name: 'Price Conscious' },
  { type: 'category', name: 'Regular' },
  { type: 'category', name: 'VIP' },
  
  // price_bands
  { type: 'price_band', name: 'Favorite Clients' },
  { type: 'price_band', name: 'International' },
  { type: 'price_band', name: 'Laboratory' },
  { type: 'price_band', name: 'Out of State' },
  { type: 'price_band', name: 'PFM-7' },
  { type: 'price_band', name: 'Regular' },
  { type: 'price_band', name: 'RPD 3+1' },
  { type: 'price_band', name: 'Sensitive' },
  { type: 'price_band', name: 'ZIRCON 8' },
  
  // hold_reasons
  { type: 'hold_reason', name: 'Design not clear' },
  { type: 'hold_reason', name: 'Doctors Confirmation' },
  { type: 'hold_reason', name: 'Improper Impression' },
  { type: 'hold_reason', name: 'Payment Pending' },
  { type: 'hold_reason', name: 'Work Order Incomplete' },
  
  // time_slots
  { type: 'time_slot', name: 'Afternoon' },
  { type: 'time_slot', name: 'Anytime' },
  { type: 'time_slot', name: 'Evening' },
  { type: 'time_slot', name: 'Morning' },
  
  // credit_adjustment_types
  { type: 'credit_adjustment_type', name: 'Discount' },
  { type: 'credit_adjustment_type', name: 'Bad Debt' },
  { type: 'credit_adjustment_type', name: 'Write-Off' },
  
  // stock_categories
  { type: 'stock_category', name: 'Acrylic Materials' },
  { type: 'stock_category', name: 'Ceramic Materials' },
  { type: 'stock_category', name: 'Metal Alloys' },
  { type: 'stock_category', name: 'Teeth Sets' },
  
  // delivery_methods
  { type: 'delivery_method', name: 'Delivery Boy' },
  { type: 'delivery_method', name: 'Courier Service' },
  { type: 'delivery_method', name: 'Self Pickup' },
  
  // routes
  { type: 'route', name: 'Route A' },
  { type: 'route', name: 'Route B' },
  { type: 'route', name: 'Route C' },
  
  // collection_centres
  { type: 'collection_centre', name: 'Main Office' },
  { type: 'collection_centre', name: 'Sohar Branch' },
  
  // shade_guides
  { type: 'shade_guide', name: 'VITA 3D-MASTER', value: JSON.stringify(["0M1","1M1","1M2","2L1.5","2L2.5","2M1","2M2","2M3","2R1.5","2R2.5","3L1.5","3L2.5","3M1","3M2","3M3","3R1.5","3R2.5","4L1.5","4L2.5","4M1","4M2","4M3","4R1.5","4R2.5","5M1","5M2","5M3"]) },
  { type: 'shade_guide', name: 'Vita Classic', value: JSON.stringify(["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4"]) },
  
  // manufacturer_labs
  { type: 'manufacturer_lab', name: 'Internal Lab' },
  { type: 'manufacturer_lab', name: 'Partner Lab' },

  // expense_heads
  { type: 'expense_head', name: 'ABHIJITH SALARY' },
  { type: 'expense_head', name: 'AL FARSI' },
  { type: 'expense_head', name: 'AL MAZROUI' },
  { type: 'expense_head', name: 'AL MAZROUI MEDICAL' },
  { type: 'expense_head', name: 'AL SALA' },
  { type: 'expense_head', name: 'AL SAWARI PHARMA & MEDICAL' },
  { type: 'expense_head', name: 'AL SHAMIL LAB' },
  { type: 'expense_head', name: 'ALIF' },
  { type: 'expense_head', name: 'ALIF MEDICAL SUPPLIERS' },
  { type: 'expense_head', name: 'ALNA SALARY' },
  { type: 'expense_head', name: 'ANISH SALARY' },
  { type: 'expense_head', name: 'ASAINAR SALARY' },
  { type: 'expense_head', name: 'AUDITING' },
  { type: 'expense_head', name: 'AZZAN AL BADI' },
  { type: 'expense_head', name: 'Bank Ac' },
  { type: 'expense_head', name: 'BANK CHARGES' },
  { type: 'expense_head', name: 'BIJU NIZWA SALARY' },
  { type: 'expense_head', name: 'Cash' },
  { type: 'expense_head', name: 'CELEBERATIONS' },
  { type: 'expense_head', name: 'CHINA' },
  { type: 'expense_head', name: 'CLEANER SALARY' },
  { type: 'expense_head', name: 'COCHIN DENTAL EQUIPS' },
  { type: 'expense_head', name: 'COURIER' },
  { type: 'expense_head', name: 'CUSTOMS & CLEARANCE' },
  { type: 'expense_head', name: 'DENTAL MATERIALS LOCAL PURCHASING' },
  { type: 'expense_head', name: 'DENTROM' },
  { type: 'expense_head', name: 'DRINKING WATER' },
  { type: 'expense_head', name: 'ELECTRIC BILL MONTHLY' },
  { type: 'expense_head', name: 'ELECTRICAL ITEMS' },
  { type: 'expense_head', name: 'EMJAY ENTERPRISES' },
  { type: 'expense_head', name: 'ENTERTAINMENT' },
  { type: 'expense_head', name: 'FASTCO COURIER' },
  { type: 'expense_head', name: 'FEDEX' },
  { type: 'expense_head', name: 'FIRST AID PRODUCTS' },
  { type: 'expense_head', name: 'FITNESS' },
  { type: 'expense_head', name: 'FLIGHT TICKET' },
  { type: 'expense_head', name: 'FURNITURE-S' },
  { type: 'expense_head', name: 'GIFT' },
  { type: 'expense_head', name: 'GOVT LICENCES' },
  { type: 'expense_head', name: 'GOVT TAX' },
  { type: 'expense_head', name: 'GSM BILL PAYMENT' },
  { type: 'expense_head', name: 'GYPSUM' },
  { type: 'expense_head', name: 'HI DENT' },
  { type: 'expense_head', name: 'HIDE-NT' },
  { type: 'expense_head', name: 'HOSPILAND' },
  { type: 'expense_head', name: 'HOSPILAND HEALTHCARE' },
  { type: 'expense_head', name: 'HOTEL BILL-DENTAL CONFERENCE' },
  { type: 'expense_head', name: 'IN-HOUSE' },
  { type: 'expense_head', name: 'INDIA' },
  { type: 'expense_head', name: 'JITHU SALARY' },
  { type: 'expense_head', name: 'KAFALAT' },
  { type: 'expense_head', name: 'LAB EQUIPMENT PURCHASING' },
  { type: 'expense_head', name: 'LAB EQUIPMENT REPAIR' },
  { type: 'expense_head', name: 'LAB MACHINARY PARTS' },
  { type: 'expense_head', name: 'LAB MAINTENANCE' },
  { type: 'expense_head', name: 'LAB MATERIALS' },
  { type: 'expense_head', name: 'LPG GAS' },
  { type: 'expense_head', name: 'MARKETING' },
  { type: 'expense_head', name: 'MEDICINE' },
  { type: 'expense_head', name: 'MISCELLANEOUS' },
  { type: 'expense_head', name: 'OFFICE SUPPLIES' },
  { type: 'expense_head', name: 'OMANI STAFF SALARY' },
  { type: 'expense_head', name: 'OXYGEN AND ACETYLENE' },
  { type: 'expense_head', name: 'PAKISTAN' },
  { type: 'expense_head', name: 'PARCEL' },
  { type: 'expense_head', name: 'PARKING & FINES' },
  { type: 'expense_head', name: 'PARTNER\'S EXPENSE' },
  { type: 'expense_head', name: 'PETROL' },
  { type: 'expense_head', name: 'PETROL PAJERO' },
  { type: 'expense_head', name: 'PLUMBER PAYMENT' },
  { type: 'expense_head', name: 'PRINTING' },
  { type: 'expense_head', name: 'PRO EXPENSES' },
  { type: 'expense_head', name: 'RAMESH SALARY (RAVI)' },
  { type: 'expense_head', name: 'REFRESHMENT' },
  { type: 'expense_head', name: 'RENEWALS' },
  { type: 'expense_head', name: 'RENT FOR LAB' },
  { type: 'expense_head', name: 'RENT FOR STAFF ACCOMODATION' },
  { type: 'expense_head', name: 'RENT FOR VARGHESE ACCOMODATION' },
  { type: 'expense_head', name: 'SAFETY TOOLS' },
  { type: 'expense_head', name: 'Sample Dental Supplier' },
  { type: 'expense_head', name: 'SHAMS AL JEEL' },
  { type: 'expense_head', name: 'SPORTS ACTIVITIES' },
  { type: 'expense_head', name: 'STAFF INSURANCE' },
  { type: 'expense_head', name: 'STAFF OVER TIME' },
  { type: 'expense_head', name: 'STAFF PERSONAL EXPENSE' },
  { type: 'expense_head', name: 'STAFF SPORTS & ENTERTAINMENT' },
  { type: 'expense_head', name: 'STAFF TRAINING' },
  { type: 'expense_head', name: 'STAFF VISA' },
  { type: 'expense_head', name: 'STATIONERY' },
  { type: 'expense_head', name: 'STELLA SALARY' },
  { type: 'expense_head', name: 'SUHUL ZAKUIT' },
  { type: 'expense_head', name: 'SUNIL SALARY' },
  { type: 'expense_head', name: 'TAWAZON MEDICAL SUPPLIES' },
  { type: 'expense_head', name: 'TAX PAYMENTS' },
  { type: 'expense_head', name: 'TELEPHONE BILL' },
  { type: 'expense_head', name: 'THE UNITED DENTAL SUPPLY CO.' },
  { type: 'expense_head', name: 'TRASPORTATION' },
  { type: 'expense_head', name: 'TRAVEL & VISA' },
  { type: 'expense_head', name: 'TRAVEL LOUNGE' },
  { type: 'expense_head', name: 'VARUGHESE SALARY' },
  { type: 'expense_head', name: 'VEHICLE' },
  { type: 'expense_head', name: 'VEHICLE FINE' },
  { type: 'expense_head', name: 'VEHICLE LOAN' },
  { type: 'expense_head', name: 'VEHICLE MAINTENANCE' },
  { type: 'expense_head', name: 'VEHICLE MAINTENANCE VARUGHESE' },
  { type: 'expense_head', name: 'WATER BILLS MONTHLY' },
  { type: 'expense_head', name: 'WIFI' },
  { type: 'expense_head', name: 'WORK DONE ABROAD' }
];

async function main() {
  console.log('Seeding default lookups...');
  for (const lookup of defaultLookups) {
    const existing = await prisma.settingLookup.findFirst({
      where: {
        type: lookup.type,
        name: lookup.name
      }
    });
    if (!existing) {
      await prisma.settingLookup.create({ data: lookup });
      console.log(`Created lookup: [${lookup.type}] ${lookup.name}`);
    }
  }
  console.log('Lookup seeding completed successfully!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
