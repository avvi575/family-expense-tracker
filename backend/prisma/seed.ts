import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PARENTS = [
  { name: 'Groceries', icon: '🛒', color: '#10b981' },
  { name: 'Utilities', icon: '💡', color: '#f59e0b' },
  { name: 'Education', icon: '🎓', color: '#3b82f6' },
  { name: 'Health', icon: '🏥', color: '#ef4444' },
  { name: 'Transport', icon: '🚗', color: '#8b5cf6' },
  { name: 'Entertainment', icon: '🎬', color: '#ec4899' },
  { name: 'Dining', icon: '🍽️', color: '#f97316' },
  { name: 'Other', icon: '🪪', color: '#64748b' },
  { name: 'Insurance', icon: '🛡️', color: '#0ea5e9' },
  { name: 'Gifts', icon: '🎁', color: '#a855f7' },
  { name: 'Investment', icon: '📈', color: '#14b8a6' },
  { name: 'Income', icon: '💰', color: '#22c55e' },
  { name: 'Business', icon: '💼', color: '#475569' },
  { name: 'Miscellaneous', icon: '🧾', color: '#94a3b8' },
];

/** name, parentName, icon (optional) */
const SUBCATEGORIES: Array<{ name: string; parent: string; icon?: string }> = [
  // --- Groceries ---
  { name: 'Ration / Kirana', parent: 'Groceries', icon: '🌾' },
  { name: 'Vegetables / Fruits', parent: 'Groceries', icon: '🥦' },
  { name: 'Dairy / Milk', parent: 'Groceries', icon: '🥛' },
  { name: 'Bakery / Sweets', parent: 'Groceries', icon: '🍞' },
  { name: 'Spices / Masala', parent: 'Groceries', icon: '🌶️' },
  { name: 'Dry Fruits', parent: 'Groceries', icon: '🥜' },

  // --- Utilities ---
  { name: 'Apartment Maintenance', parent: 'Utilities', icon: '🏢' },
  { name: 'Electricity Bill', parent: 'Utilities', icon: '⚡' },
  { name: 'Water Bill', parent: 'Utilities', icon: '💧' },
  { name: 'Property Tax', parent: 'Utilities', icon: '🏛️' },
  { name: 'House Maid Salary', parent: 'Utilities', icon: '🧹' },
  { name: 'Cook / Cook Salary', parent: 'Utilities', icon: '👨‍🍳' },
  { name: 'Watchman / Security', parent: 'Utilities', icon: '👮' },
  { name: 'Water Tanker', parent: 'Utilities', icon: '🚛' },
  { name: 'Cable / DTH', parent: 'Utilities', icon: '📺' },
  { name: 'Mobile Recharge', parent: 'Utilities', icon: '📱' },
  { name: 'Phone Recharge', parent: 'Utilities', icon: '☎️' },
  { name: 'Gas Cylinder', parent: 'Utilities', icon: '🔥' },
  { name: 'Broadband Bills', parent: 'Utilities', icon: '🌐' },
  { name: 'Dish TV', parent: 'Utilities', icon: '📡' },
  { name: 'Miscellaneous', parent: 'Utilities', icon: '🧾' },

  // --- Transport ---
  { name: 'Fuel', parent: 'Transport', icon: '⛽' },
  { name: 'Toll Charges', parent: 'Transport', icon: '🛣️' },
  { name: 'Tyre Maintenance', parent: 'Transport', icon: '🛞' },
  { name: 'Vehicle Maintenance', parent: 'Transport', icon: '🔧' },
  { name: 'Metro Card', parent: 'Transport', icon: '🚇' },
  { name: 'Bus Pass', parent: 'Transport', icon: '🚌' },
  { name: 'Rapido / Ola / Uber', parent: 'Transport', icon: '🛺' },
  { name: 'Auto / Rickshaw', parent: 'Transport', icon: '🛺' },
  { name: 'Travel / Train', parent: 'Transport', icon: '🚆' },
  { name: 'Flight', parent: 'Transport', icon: '✈️' },
  { name: 'Petrol / Fuel', parent: 'Transport', icon: '⛽' },
  { name: 'Auto Maintenance', parent: 'Transport', icon: '🔧' },

  // --- Dining ---
  { name: 'Food Delivery', parent: 'Dining', icon: '🛵' },
  { name: 'Restaurant', parent: 'Dining', icon: '🍴' },
  { name: 'Takeaway', parent: 'Dining', icon: '🥡' },
  { name: 'Tiffin / Dabba', parent: 'Dining', icon: '🍱' },
  { name: 'Street Food', parent: 'Dining', icon: '🌭' },
  { name: 'Festival Shopping', parent: 'Dining', icon: '🪔' },

  // --- Education ---
  { name: 'Tuition / Coaching', parent: 'Education', icon: '👨‍🏫' },
  { name: 'Books & Stationery', parent: 'Education', icon: '📚' },
  { name: 'School Fees', parent: 'Education', icon: '🏫' },
  { name: 'College / University Fees', parent: 'Education', icon: '🎓' },
  { name: 'Exam Fees', parent: 'Education', icon: '📝' },
  { name: 'Online Courses', parent: 'Education', icon: '💻' },

  // --- Health ---
  { name: 'Pharmacy / Medicines', parent: 'Health', icon: '💊' },
  { name: 'Doctor Consultation', parent: 'Health', icon: '🩺' },
  { name: 'Lab Tests', parent: 'Health', icon: '🧪' },
  { name: 'Dental', parent: 'Health', icon: '🦷' },
  { name: 'Eye Care', parent: 'Health', icon: '👁️' },
  { name: 'Physiotherapy', parent: 'Health', icon: '🤸' },
  { name: 'Hospitalization', parent: 'Health', icon: '🏥' },
  { name: 'Gym / Fitness', parent: 'Health', icon: '🏋️' },
  { name: 'Yoga / Fitness', parent: 'Health', icon: '🧘' },
  { name: 'Ayurvedic / Homeopathy', parent: 'Health', icon: '🌿' },

  // --- Entertainment ---
  { name: 'Movie Tickets', parent: 'Entertainment', icon: '🎬' },
  { name: 'Theatre / Drama', parent: 'Entertainment', icon: '🎭' },
  { name: 'Music / Concerts', parent: 'Entertainment', icon: '🎤' },
  { name: 'Sports / Games', parent: 'Entertainment', icon: '⚽' },
  { name: 'Books / Magazines', parent: 'Entertainment', icon: '📖' },
  { name: 'Online Streaming', parent: 'Entertainment', icon: '📺' },
  { name: 'Gaming', parent: 'Entertainment', icon: '🎮' },
  { name: 'Club Membership', parent: 'Entertainment', icon: '🎟️' },
  { name: 'Liquor / Bar', parent: 'Entertainment', icon: '🍻' },

  // --- Insurance ---
  { name: 'Health Insurance', parent: 'Insurance', icon: '🏥' },
  { name: 'Vehicle Insurance', parent: 'Insurance', icon: '🚗' },
  { name: 'Home Insurance', parent: 'Insurance', icon: '🏠' },
  { name: 'Travel Insurance', parent: 'Insurance', icon: '🧳' },
  { name: 'LIC / Term Plan', parent: 'Insurance', icon: '📋' },
  { name: 'LIC Premium', parent: 'Insurance', icon: '📋' },

  // --- Gifts ---
  { name: 'Birthday Gift', parent: 'Gifts', icon: '🎂' },
  { name: 'Anniversary Gift', parent: 'Gifts', icon: '💝' },
  { name: 'Festival Gift', parent: 'Gifts', icon: '🎉' },
  { name: 'Wedding Gift', parent: 'Gifts', icon: '💒' },
  { name: 'Housewarming Gift', parent: 'Gifts', icon: '🏡' },
  { name: 'Baby Shower Gift', parent: 'Gifts', icon: '👶' },

  // --- Investment ---
  { name: 'Mutual Funds', parent: 'Investment', icon: '📊' },
  { name: 'Stocks / Shares', parent: 'Investment', icon: '📉' },
  { name: 'Fixed Deposit', parent: 'Investment', icon: '🏦' },
  { name: 'PPF / PF', parent: 'Investment', icon: '🧾' },
  { name: 'NSC / KVP', parent: 'Investment', icon: '📜' },
  { name: 'Gold Investment', parent: 'Investment', icon: '🥇' },
  { name: 'Real Estate', parent: 'Investment', icon: '🏘️' },
  { name: 'Pension Plan', parent: 'Investment', icon: '👴' },
  { name: 'Children Education Plan', parent: 'Investment', icon: '👨‍🎓' },
  { name: 'Emergency Fund', parent: 'Investment', icon: '🚨' },
  { name: 'Chit Fund', parent: 'Investment', icon: '🪙' },

  // --- Income ---
  { name: 'Salary', parent: 'Income', icon: '💵' },
  { name: 'Freelance Income', parent: 'Income', icon: '💻' },
  { name: 'Consulting Fees', parent: 'Income', icon: '🧑‍💼' },
  { name: 'Commission', parent: 'Income', icon: '🤝' },
  { name: 'Dividends', parent: 'Income', icon: '💹' },
  { name: 'Interest Income', parent: 'Income', icon: '🏦' },
  { name: 'Pension', parent: 'Income', icon: '👴' },
  { name: 'Scholarship', parent: 'Income', icon: '🎓' },
  { name: 'Award / Prize', parent: 'Income', icon: '🏆' },
  { name: 'Inheritance', parent: 'Income', icon: '📜' },
  { name: 'Cashback / Rewards', parent: 'Income', icon: '🎁' },
  { name: 'Refund', parent: 'Income', icon: '↩️' },
  { name: 'Money from Friends', parent: 'Income', icon: '👫' },
  { name: 'Money from Family', parent: 'Income', icon: '👨‍👩‍👧' },

  // --- Business ---
  { name: 'Business Investment', parent: 'Business', icon: '🏢' },
  { name: 'Shop Rent', parent: 'Business', icon: '🏪' },
  { name: 'Business License', parent: 'Business', icon: '📄' },
  { name: 'GST / Taxes', parent: 'Business', icon: '🧾' },
  { name: 'Business Travel', parent: 'Business', icon: '✈️' },
  { name: 'Client Entertainment', parent: 'Business', icon: '🍾' },
  { name: 'Office Supplies', parent: 'Business', icon: '📎' },
  { name: 'Employee Salary', parent: 'Business', icon: '👨‍💼' },

  // --- Other ---
  { name: 'Sarees / Clothing', parent: 'Other', icon: '👗' },
  { name: 'Jewellery / Gold', parent: 'Other', icon: '💍' },
  { name: 'Furniture / Home', parent: 'Other', icon: '🛋️' },
  { name: 'Electronics / Gadgets', parent: 'Other', icon: '📱' },
  { name: 'Mobile / Phone', parent: 'Other', icon: '📱' },
  { name: 'Computer / Laptop', parent: 'Other', icon: '💻' },
  { name: 'Pets', parent: 'Other', icon: '🐾' },
  { name: 'Pooja / Religious', parent: 'Other', icon: '🪷' },
  { name: 'Temple Donation', parent: 'Other', icon: '🛕' },
  { name: 'Festival Shopping', parent: 'Other', icon: '🎊' },

  // --- Miscellaneous ---
  { name: 'Uncategorised', parent: 'Miscellaneous', icon: '❓' },
  { name: 'Bank Charges', parent: 'Miscellaneous', icon: '🏦' },
  { name: 'ATM Fees', parent: 'Miscellaneous', icon: '🏧' },
  { name: 'Late Fees', parent: 'Miscellaneous', icon: '⏰' },
  { name: 'Other', parent: 'Miscellaneous', icon: '🔖' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  for (const p of PARENTS) {
    await prisma.category.upsert({
      where: { id: `system-${slug(p.name)}` },
      update: { icon: p.icon, color: p.color },
      create: { id: `system-${slug(p.name)}`, name: p.name, icon: p.icon, color: p.color, familyId: null, parentId: null },
    });
  }
  for (const s of SUBCATEGORIES) {
    const parentId = `system-${slug(s.parent)}`;
    await prisma.category.upsert({
      where: { id: `system-${slug(s.parent)}-${slug(s.name)}` },
      update: { icon: s.icon ?? '  ' },
      create: {
        id: `system-${slug(s.parent)}-${slug(s.name)}`,
        name: s.name,
        icon: s.icon ?? '  ',
        color: '#6b7280',
        familyId: null,
        parentId,
      },
    });
  }
  console.log('Seeded categories and subcategories');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());