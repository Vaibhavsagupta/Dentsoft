const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

  // return_type (Shipments - returns)
  { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Impression', optionValue: 'Impression', sortOrder: 1 },
  { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Wax Trial', optionValue: 'Wax Trial', sortOrder: 2 },
  { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Metal Frame', optionValue: 'Metal Frame', sortOrder: 3 },
  { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Old Restorations', optionValue: 'Old Restorations', sortOrder: 4 },
  { page: 'Shipment', dropdownKey: 'return_type', dropdownLabel: 'Return Type', optionLabel: 'Other', optionValue: 'Other', sortOrder: 5 },

  // payment_mode (used in Shipments, Accounts)
  { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Cash', optionValue: 'Cash', sortOrder: 1 },
  { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Cheque', optionValue: 'Cheque', sortOrder: 2 },
  { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'UPI', optionValue: 'UPI', sortOrder: 3 },
  { page: 'Account', dropdownKey: 'payment_mode', dropdownLabel: 'Payment Mode', optionLabel: 'Bank Transfer', optionValue: 'Bank Transfer', sortOrder: 4 },

  // account_type
  { page: 'Account', dropdownKey: 'account_type', dropdownLabel: 'Account Type', optionLabel: 'Credit', optionValue: 'Credit', sortOrder: 1 },
  { page: 'Account', dropdownKey: 'account_type', dropdownLabel: 'Account Type', optionLabel: 'Debit', optionValue: 'Debit', sortOrder: 2 },

  // expense_category (Office)
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Office Supplies', optionValue: 'Office Supplies', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Travel & Fuel', optionValue: 'Travel & Fuel', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Meals', optionValue: 'Meals', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Utilities', optionValue: 'Utilities', sortOrder: 4 },
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Maintenance', optionValue: 'Maintenance', sortOrder: 5 },
  { page: 'Office', dropdownKey: 'expense_category', dropdownLabel: 'Expense Category', optionLabel: 'Other', optionValue: 'Other', sortOrder: 6 },

  // expense_method (Office)
  { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Cash', optionValue: 'Cash', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Bank Transfer', optionValue: 'Bank Transfer', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'UPI', optionValue: 'UPI', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'expense_method', dropdownLabel: 'Expense Method', optionLabel: 'Cheque', optionValue: 'Cheque', sortOrder: 4 },

  // staff_role (Office / Settings)
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Technician', optionValue: 'Technician', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Manager', optionValue: 'Manager', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Admin', optionValue: 'Admin', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Delivery Boy', optionValue: 'Delivery Boy', sortOrder: 4 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Lab Administrator', optionValue: 'Lab Administrator', sortOrder: 5 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Driver', optionValue: 'Driver', sortOrder: 6 },
  { page: 'Office', dropdownKey: 'staff_role', dropdownLabel: 'Staff Role', optionLabel: 'Other', optionValue: 'Other', sortOrder: 7 },

  // material_category (Office)
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ACRYLIC', optionValue: 'ACRYLIC', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ACRYLIC POWDER', optionValue: 'ACRYLIC POWDER', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ACRYLIC TEETH', optionValue: 'ACRYLIC TEETH', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ALGINATE', optionValue: 'ALGINATE', sortOrder: 4 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ARTICULATOR', optionValue: 'ARTICULATOR', sortOrder: 5 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BALL CLASP SS', optionValue: 'BALL CLASP SS', sortOrder: 6 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BAND MATERIAL', optionValue: 'BAND MATERIAL', sortOrder: 7 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BANDS ORTHO', optionValue: 'BANDS ORTHO', sortOrder: 8 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BASE PASTE', optionValue: 'BASE PASTE', sortOrder: 9 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BASE PLATE', optionValue: 'BASE PLATE', sortOrder: 10 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BELT', optionValue: 'BELT', sortOrder: 11 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BLADES', optionValue: 'BLADES', sortOrder: 12 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BLOCKS', optionValue: 'BLOCKS', sortOrder: 13 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BUFFS', optionValue: 'BUFFS', sortOrder: 14 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BUILD UP', optionValue: 'BUILD UP', sortOrder: 15 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BUR', optionValue: 'BUR', sortOrder: 16 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'BURNER', optionValue: 'BURNER', sortOrder: 17 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'CARTRIDGE', optionValue: 'CARTRIDGE', sortOrder: 18 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'CASTING METAL', optionValue: 'CASTING METAL', sortOrder: 19 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'CERAMIC', optionValue: 'CERAMIC', sortOrder: 20 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'CERAMIC POWDER', optionValue: 'CERAMIC POWDER', sortOrder: 21 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'CRUCIBLES', optionValue: 'CRUCIBLES', sortOrder: 22 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'DAPPEN DISH', optionValue: 'DAPPEN DISH', sortOrder: 23 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'DENTIN', optionValue: 'DENTIN', sortOrder: 24 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'DENTURE', optionValue: 'DENTURE', sortOrder: 25 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'DISCS', optionValue: 'DISCS', sortOrder: 26 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'EMAX', optionValue: 'EMAX', sortOrder: 27 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ENAMEL', optionValue: 'ENAMEL', sortOrder: 28 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'EQUIPMENTS', optionValue: 'EQUIPMENTS', sortOrder: 29 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'EXPANSION SCREW', optionValue: 'EXPANSION SCREW', sortOrder: 30 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'EXPANSION SCREW 3D', optionValue: 'EXPANSION SCREW 3D', sortOrder: 31 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'FLASKS', optionValue: 'FLASKS', sortOrder: 32 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'GEL', optionValue: 'GEL', sortOrder: 33 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'GENERAL', optionValue: 'GENERAL', sortOrder: 34 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'GLAZE LIQUID', optionValue: 'GLAZE LIQUID', sortOrder: 35 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'GLAZE POWDER', optionValue: 'GLAZE POWDER', sortOrder: 36 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'GYPSUM POWDER', optionValue: 'GYPSUM POWDER', sortOrder: 37 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'HARD SHEET', optionValue: 'HARD SHEET', sortOrder: 38 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'HEAD GEAR TUBE', optionValue: 'HEAD GEAR TUBE', sortOrder: 39 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'HEAT CURE', optionValue: 'HEAT CURE', sortOrder: 40 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'HYRAX SCREW', optionValue: 'HYRAX SCREW', sortOrder: 41 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'IMPLANT', optionValue: 'IMPLANT', sortOrder: 42 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'IMPRESSION TRAY', optionValue: 'IMPRESSION TRAY', sortOrder: 43 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'INSTRUMENTS', optionValue: 'INSTRUMENTS', sortOrder: 44 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'INVESTMENT LIQUID', optionValue: 'INVESTMENT LIQUID', sortOrder: 45 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'INVESTMENT POWDER', optionValue: 'INVESTMENT POWDER', sortOrder: 46 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'KNIFE', optionValue: 'KNIFE', sortOrder: 47 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'LINGUAL SHEATH', optionValue: 'LINGUAL SHEATH', sortOrder: 48 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'METAL', optionValue: 'METAL', sortOrder: 49 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'MOLAR TUBE', optionValue: 'MOLAR TUBE', sortOrder: 50 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'MONOMER', optionValue: 'MONOMER', sortOrder: 51 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'MOTORS', optionValue: 'MOTORS', sortOrder: 52 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'MOULDING POWDER', optionValue: 'MOULDING POWDER', sortOrder: 53 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'OPAQUE', optionValue: 'OPAQUE', sortOrder: 54 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ORTHO', optionValue: 'ORTHO', sortOrder: 55 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'POLISHING', optionValue: 'POLISHING', sortOrder: 56 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'POLISHING DISC', optionValue: 'POLISHING DISC', sortOrder: 57 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'POLYMER', optionValue: 'POLYMER', sortOrder: 58 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'PUMICE', optionValue: 'PUMICE', sortOrder: 59 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'PUTTY', optionValue: 'PUTTY', sortOrder: 60 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'RESINS', optionValue: 'RESINS', sortOrder: 61 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SAND', optionValue: 'SAND', sortOrder: 62 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SAND PAPER', optionValue: 'SAND PAPER', sortOrder: 63 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SELF CURE', optionValue: 'SELF CURE', sortOrder: 64 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SEPARATING DISC', optionValue: 'SEPARATING DISC', sortOrder: 65 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SEPARATING FLUID', optionValue: 'SEPARATING FLUID', sortOrder: 66 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SILICON DISC', optionValue: 'SILICON DISC', sortOrder: 67 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SOLDERING WIRE', optionValue: 'SOLDERING WIRE', sortOrder: 68 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SPATULA', optionValue: 'SPATULA', sortOrder: 69 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'SPRUE', optionValue: 'SPRUE', sortOrder: 70 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'STAIN', optionValue: 'STAIN', sortOrder: 71 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'STONE POWDER', optionValue: 'STONE POWDER', sortOrder: 72 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'STONE WHEEL', optionValue: 'STONE WHEEL', sortOrder: 73 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'STONES', optionValue: 'STONES', sortOrder: 74 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'TEETH SET', optionValue: 'TEETH SET', sortOrder: 75 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'THERMOFORMING SHEET', optionValue: 'THERMOFORMING SHEET', sortOrder: 76 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'WAX', optionValue: 'WAX', sortOrder: 77 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'WIRE SS', optionValue: 'WIRE SS', sortOrder: 78 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'WIRE TMA', optionValue: 'WIRE TMA', sortOrder: 79 },
  { page: 'Office', dropdownKey: 'material_category', dropdownLabel: 'Material Category', optionLabel: 'ZIRCON', optionValue: 'ZIRCON', sortOrder: 80 },

  // inward_doc_type (Office - Inventory)
  { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Purchase', optionValue: 'Purchase', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Goods Inward', optionValue: 'Goods Inward', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'inward_doc_type', dropdownLabel: 'Inward Document Type', optionLabel: 'Opening Stock', optionValue: 'Opening Stock', sortOrder: 3 },

  // outward_doc_type (Office - Inventory)
  { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Consumption', optionValue: 'Consumption', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Issued', optionValue: 'Issued', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'outward_doc_type', dropdownLabel: 'Outward Document Type', optionLabel: 'Damaged', optionValue: 'Damaged', sortOrder: 3 },

  // product_type (Office - Productions)
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'PFM', optionValue: 'PFM', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Zirconia', optionValue: 'Zirconia', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'E-Max', optionValue: 'E-Max', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Denture', optionValue: 'Denture', sortOrder: 4 },
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'Implant', optionValue: 'Implant', sortOrder: 5 },
  { page: 'Office', dropdownKey: 'product_type', dropdownLabel: 'Product Type', optionLabel: 'General', optionValue: 'General', sortOrder: 6 },

  // tryin_type (Settings / Orders)
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Try-In', optionValue: 'Try-In', sortOrder: 1 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Special Tray', optionValue: 'Special Tray', sortOrder: 2 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Metal/Coping Trial', optionValue: 'Metal/Coping Trial', sortOrder: 3 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Record Base', optionValue: 'Record Base', sortOrder: 4 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Setting Trial', optionValue: 'Setting Trial', sortOrder: 5 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Wax Test', optionValue: 'Wax Test', sortOrder: 6 },
  { page: 'Order', dropdownKey: 'tryin_type', dropdownLabel: 'Try-In Type', optionLabel: 'Bisque Trial', optionValue: 'Bisque Trial', sortOrder: 7 },

  // supplier (Office - Inventory)
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'AL FARSI', optionValue: 'AL FARSI', sortOrder: 1 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'AL MAZROUI', optionValue: 'AL MAZROUI', sortOrder: 2 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'AL SALA', optionValue: 'AL SALA', sortOrder: 3 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'ALIF', optionValue: 'ALIF', sortOrder: 4 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'CHINA', optionValue: 'CHINA', sortOrder: 5 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'COCHIN DENTAL EQUIPS', optionValue: 'COCHIN DENTAL EQUIPS', sortOrder: 6 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'DENTROM', optionValue: 'DENTROM', sortOrder: 7 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'HI DENT', optionValue: 'HI DENT', sortOrder: 8 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'HOSPILAND', optionValue: 'HOSPILAND', sortOrder: 9 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'IN-HOUSE', optionValue: 'IN-HOUSE', sortOrder: 10 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'INDIA', optionValue: 'INDIA', sortOrder: 11 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'PAKISTAN', optionValue: 'PAKISTAN', sortOrder: 12 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'Sample Dental Supplier', optionValue: 'Sample Dental Supplier', sortOrder: 13 },
  { page: 'Office', dropdownKey: 'supplier', dropdownLabel: 'Supplier', optionLabel: 'SHAMS AL JEEL', optionValue: 'SHAMS AL JEEL', sortOrder: 14 },
];

async function main() {
  console.log('Seeding default dropdown options...');
  let created = 0;
  for (const item of defaultDropdowns) {
    const existing = await prisma.dropdownOption.findFirst({
      where: {
        dropdownKey: item.dropdownKey,
        optionValue: item.optionValue
      }
    });
    if (!existing) {
      await prisma.dropdownOption.create({ data: item });
      console.log(`Created: [${item.dropdownKey}] ${item.optionLabel}`);
      created++;
    }
  }
  console.log(`\nSeeding completed! ${created} new options added.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
