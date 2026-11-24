const { PrismaClient } = require('@prisma/client');

// Crash-proof bcrypt loader (supports both bcryptjs and bcrypt)
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (err) {
  bcrypt = require('bcrypt');
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Free Fire Hub (Project 03) Database Seeding...');

  // ==========================================
  // 1. SEED ADMIN ACCOUNT
  // ==========================================
  const adminEmail = (process.env.ADMIN_EMAIL || 'mrsadhin131@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '7681573669';
  const adminPhone = process.env.ADMIN_PHONE || '01623759878';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      phone: adminPhone,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Free Fire Hub Admin',
      phone: adminPhone,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`👑 Admin user verified/configured: ${adminUser.email} (Phone: ${adminUser.phone})`);

  // ==========================================
  // 2. SEED DIAMOND PACKAGES (SERVER-SIDE PRICING)
  // ==========================================
  const diamondPackages = [
    {
      name: '25 Diamonds',
      slug: '25-diamonds',
      sku: 'FFH-BD-025',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 25,
      bonusDiamonds: 0,
      basePrice: 25.00,
      discountAmount: 3.00,
      sellingPrice: 22.00,
      isPopular: false,
      sortOrder: 1,
      description: 'Fast Free Fire BD Server 25 Diamonds Top-Up via Player UID.',
      costPrice: 19.50,
    },
    {
      name: '50 Diamonds',
      slug: '50-diamonds',
      sku: 'FFH-BD-050',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 50,
      bonusDiamonds: 5,
      basePrice: 45.00,
      discountAmount: 3.00,
      sellingPrice: 42.00,
      isPopular: false,
      sortOrder: 2,
      description: 'Fast Free Fire BD Server 50 Diamonds Top-Up via Player UID.',
      costPrice: 38.00,
    },
    {
      name: '115 Diamonds',
      slug: '115-diamonds',
      sku: 'FFH-BD-115',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 115,
      bonusDiamonds: 10,
      basePrice: 95.00,
      discountAmount: 10.00,
      sellingPrice: 85.00,
      isPopular: true,
      sortOrder: 3,
      description: 'Most Popular 115 Diamonds Pack for Free Fire BD Server.',
      costPrice: 78.00,
    },
    {
      name: '240 Diamonds',
      slug: '240-diamonds',
      sku: 'FFH-BD-240',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 240,
      bonusDiamonds: 20,
      basePrice: 185.00,
      discountAmount: 15.00,
      sellingPrice: 170.00,
      isPopular: true,
      sortOrder: 4,
      description: 'Best Value 240 Diamonds Bundle for Free Fire BD Server.',
      costPrice: 156.00,
    },
    {
      name: '610 Diamonds',
      slug: '610-diamonds',
      sku: 'FFH-BD-610',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 610,
      bonusDiamonds: 50,
      basePrice: 450.00,
      discountAmount: 30.00,
      sellingPrice: 420.00,
      isPopular: true,
      sortOrder: 5,
      description: 'Mega Pack 610 Diamonds for Free Fire BD Server.',
      costPrice: 390.00,
    },
    {
      name: '1240 Diamonds',
      slug: '1240-diamonds',
      sku: 'FFH-BD-1240',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 1240,
      bonusDiamonds: 100,
      basePrice: 900.00,
      discountAmount: 50.00,
      sellingPrice: 850.00,
      isPopular: false,
      sortOrder: 6,
      description: 'Pro Gamer 1240 Diamonds Pack for Free Fire BD Server.',
      costPrice: 790.00,
    },
    {
      name: '2530 Diamonds',
      slug: '2530-diamonds',
      sku: 'FFH-BD-2530',
      category: 'DIAMOND_TOPUP',
      game: 'FREE_FIRE',
      diamondAmount: 2530,
      bonusDiamonds: 220,
      basePrice: 1800.00,
      discountAmount: 100.00,
      sellingPrice: 1700.00,
      isPopular: false,
      sortOrder: 7,
      description: 'Ultimate 2530 Diamonds Vault Pack for Free Fire BD Server.',
      costPrice: 1590.00,
    },
    {
      name: 'Weekly Membership',
      slug: 'weekly-membership',
      sku: 'FFH-BD-WEEKLY',
      category: 'MEMBERSHIP',
      game: 'FREE_FIRE',
      diamondAmount: 450,
      bonusDiamonds: 0,
      basePrice: 170.00,
      discountAmount: 15.00,
      sellingPrice: 155.00,
      isPopular: true,
      sortOrder: 8,
      description: 'Free Fire Weekly Membership (Instant + Daily Diamonds Rewards).',
      costPrice: 142.00,
    },
    {
      name: 'Monthly Membership',
      slug: 'monthly-membership',
      sku: 'FFH-BD-MONTHLY',
      category: 'MEMBERSHIP',
      game: 'FREE_FIRE',
      diamondAmount: 2600,
      bonusDiamonds: 0,
      basePrice: 820.00,
      discountAmount: 50.00,
      sellingPrice: 770.00,
      isPopular: true,
      sortOrder: 9,
      description: 'Free Fire Monthly Membership (Mega Diamond Rewards).',
      costPrice: 720.00,
    },
  ];

  const createdProducts = [];

  for (const pkg of diamondPackages) {
    const { costPrice, ...productData } = pkg;

    const savedProduct = await prisma.product.upsert({
      where: { slug: productData.slug },
      update: {
        name: productData.name,
        sku: productData.sku,
        category: productData.category,
        game: productData.game,
        diamondAmount: productData.diamondAmount,
        bonusDiamonds: productData.bonusDiamonds,
        basePrice: productData.basePrice,
        discountAmount: productData.discountAmount,
        sellingPrice: productData.sellingPrice,
        isPopular: productData.isPopular,
        sortOrder: productData.sortOrder,
        description: productData.description,
        isActive: true,
      },
      create: {
        ...productData,
        currency: 'BDT',
        isActive: true,
      },
    });

    createdProducts.push({ product: savedProduct, costPrice });
  }

  console.log(`💎 Seeded ${createdProducts.length} Free Fire Diamond & Membership packages.`);

  // ==========================================
  // 3. SEED DEFAULT DEMO SUPPLIER & PRODUCT MAPPINGS
  // ==========================================
  const demoSupplier = await prisma.supplier.upsert({
    where: { code: 'DEMO_SUPPLIER' },
    update: {
      name: 'FreeFireHub Safe Demo Supplier Engine (DEMO MODE)',
      adapterType: 'DEMO',
      timeoutMs: 12000,
      isActive: true,
      priority: 1,
      metadata: {
        isRealDelivery: false,
        notice: 'DEMO MODE ONLY - Does not send real diamonds until live supplier API is configured.',
      },
    },
    create: {
      code: 'DEMO_SUPPLIER',
      name: 'FreeFireHub Safe Demo Supplier Engine (DEMO MODE)',
      adapterType: 'DEMO',
      apiEndpoint: null,
      apiKeyEnvVar: 'SUPPLIER_API_KEY',
      apiSecretEnvVar: 'SUPPLIER_API_SECRET',
      timeoutMs: 12000,
      isActive: true,
      priority: 1,
      metadata: {
        isRealDelivery: false,
        notice: 'DEMO MODE ONLY - Does not send real diamonds until live supplier API is configured.',
      },
    },
  });

  for (const item of createdProducts) {
    await prisma.supplierProduct.upsert({
      where: {
        supplierId_productId: {
          supplierId: demoSupplier.id,
          productId: item.product.id,
        },
      },
      update: {
        externalProductCode: `EXT_${item.product.sku}`,
        costPrice: item.costPrice,
        isActive: true,
      },
      create: {
        supplierId: demoSupplier.id,
        productId: item.product.id,
        externalProductCode: `EXT_${item.product.sku}`,
        costPrice: item.costPrice,
        isActive: true,
      },
    });
  }

  console.log(`🔌 Supplier "${demoSupplier.code}" and ${createdProducts.length} product mappings configured.`);
  console.log('✅ Project 03 Database Seeding Completed Successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Database Seeding Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
