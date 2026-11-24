import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Free Fire Hub BD Database Seeding...");

  // ==========================================================================
  // 1. SEED DEFAULT ADMIN USER
  // ==========================================================================
  const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || "admin@freefirehub.bd";
  const adminPassword =
    process.env.ADMIN_DEFAULT_PASSWORD || "ChangeThisAdminPassword123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: "ADMIN",
      isActive: true,
    },
    create: {
      name: "FFH Super Admin",
      email: adminEmail,
      phone: "01700000000",
      passwordHash,
      role: "ADMIN",
      walletBalance: 0,
      rewardPoints: 1000,
      referralCode: "FFHADMIN01",
      savedServer: "BD",
      isActive: true,
    },
  });
  console.log(`✅ Admin user ready: ${adminUser.email}`);

  // ==========================================================================
  // 2. SEED PRODUCT CATEGORIES
  // ==========================================================================
  const categoriesData = [
    {
      name: "Regular Diamonds",
      slug: "regular",
      description: "Instant Free Fire BD Server UID Diamond Top-Up",
      badgeText: "INSTANT UID",
      displayOrder: 1,
      isActive: true,
    },
    {
      name: "Memberships",
      slug: "membership",
      description: "Weekly, Monthly & Lite Memberships with daily rewards",
      badgeText: "BEST VALUE",
      displayOrder: 2,
      isActive: true,
    },
    {
      name: "Special Passes",
      slug: "special",
      description: "Level Up Pass and EVO Gun Access Pass",
      badgeText: "SPECIAL",
      displayOrder: 3,
      isActive: true,
    },
  ];

  const categoryMap = {};

  for (const cat of categoriesData) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
        badgeText: cat.badgeText,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
      },
      create: cat,
    });
    categoryMap[cat.slug] = savedCategory.id;
  }
  console.log("✅ Categories seeded: Regular, Memberships, Special Passes");

  // ==========================================================================
  // 3. SEED ALL 13 DYNAMIC DIAMOND & MEMBERSHIP PRODUCTS
  // ==========================================================================
  const productsData = [
    // --- Regular Diamonds ---
    {
      sku: "FFH-25D",
      name: "25 Diamonds",
      slug: "25-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 25,
      bonusDiamonds: 0,
      purchasePrice: 20,
      sellingPrice: 25,
      discount: 3,
      imageUrl: "/images/diamonds-small.png",
      tag: "STARTER",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 1,
      supplierCode: "FF_BD_25",
      description: "25 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-50D",
      name: "50 Diamonds",
      slug: "50-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 50,
      bonusDiamonds: 0,
      purchasePrice: 38,
      sellingPrice: 45,
      discount: 5,
      imageUrl: "/images/diamonds-small.png",
      tag: null,
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 2,
      supplierCode: "FF_BD_50",
      description: "50 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-115D",
      name: "115 Diamonds",
      slug: "115-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 115,
      bonusDiamonds: 5,
      purchasePrice: 76,
      sellingPrice: 85,
      discount: 10,
      imageUrl: "/images/diamonds-medium.png",
      tag: "HOT",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 3,
      supplierCode: "FF_BD_115",
      description: "115 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-240D",
      name: "240 Diamonds",
      slug: "240-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 240,
      bonusDiamonds: 10,
      purchasePrice: 152,
      sellingPrice: 170,
      discount: 15,
      imageUrl: "/images/diamonds-medium.png",
      tag: "BEST SELLER",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 4,
      supplierCode: "FF_BD_240",
      description: "240 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-610D",
      name: "610 Diamonds",
      slug: "610-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 610,
      bonusDiamonds: 25,
      purchasePrice: 385,
      sellingPrice: 425,
      discount: 25,
      imageUrl: "/images/diamonds-large.png",
      tag: "VALUE PACK",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 5,
      supplierCode: "FF_BD_610",
      description: "610 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-1240D",
      name: "1240 Diamonds",
      slug: "1240-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 1240,
      bonusDiamonds: 50,
      purchasePrice: 770,
      sellingPrice: 850,
      discount: 50,
      imageUrl: "/images/diamonds-large.png",
      tag: "PRO CHOICE",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 6,
      supplierCode: "FF_BD_1240",
      description: "1240 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-2530D",
      name: "2530 Diamonds",
      slug: "2530-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 2530,
      bonusDiamonds: 100,
      purchasePrice: 1540,
      sellingPrice: 1700,
      discount: 100,
      imageUrl: "/images/diamonds-chest.png",
      tag: "ELITE",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 7,
      supplierCode: "FF_BD_2530",
      description: "2530 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },
    {
      sku: "FFH-5060D",
      name: "5060 Diamonds",
      slug: "5060-diamonds",
      categoryId: categoryMap["regular"],
      diamondQuantity: 5060,
      bonusDiamonds: 200,
      purchasePrice: 3080,
      sellingPrice: 3380,
      discount: 220,
      imageUrl: "/images/diamonds-chest.png",
      tag: "MEGA VAULT",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 8,
      supplierCode: "FF_BD_5060",
      description: "5060 Free Fire Diamonds instant top-up via Player UID (BD Server).",
    },

    // --- Memberships ---
    {
      sku: "FFH-WEEKLY",
      name: "Weekly Membership",
      slug: "weekly-membership",
      categoryId: categoryMap["membership"],
      diamondQuantity: 450,
      bonusDiamonds: 0,
      purchasePrice: 142,
      sellingPrice: 160,
      discount: 20,
      imageUrl: "/images/weekly-membership.png",
      tag: "MOST POPULAR",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 9,
      supplierCode: "FF_BD_WEEKLY",
      description: "Instant 100 Diamonds + 50 Diamonds daily for 7 days (Total 450 Diamonds).",
    },
    {
      sku: "FFH-MONTHLY",
      name: "Monthly Membership",
      slug: "monthly-membership",
      categoryId: categoryMap["membership"],
      diamondQuantity: 2600,
      bonusDiamonds: 0,
      purchasePrice: 710,
      sellingPrice: 780,
      discount: 70,
      imageUrl: "/images/monthly-membership.png",
      tag: "MAX SAVING",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 10,
      supplierCode: "FF_BD_MONTHLY",
      description: "Instant 500 Diamonds + 70 Diamonds daily for 30 days (Total 2600 Diamonds).",
    },
    {
      sku: "FFH-WEEKLY-LITE",
      name: "Weekly Lite",
      slug: "weekly-lite",
      categoryId: categoryMap["membership"],
      diamondQuantity: 100,
      bonusDiamonds: 0,
      purchasePrice: 38,
      sellingPrice: 45,
      discount: 5,
      imageUrl: "/images/weekly-lite.png",
      tag: "BUDGET PASS",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 11,
      supplierCode: "FF_BD_WEEKLY_LITE",
      description: "Weekly Lite Membership for budget daily diamond rewards via Player UID.",
    },

    // --- Special Passes ---
    {
      sku: "FFH-LEVEL-UP",
      name: "Level Up Pass",
      slug: "level-up-pass",
      categoryId: categoryMap["special"],
      diamondQuantity: 800,
      bonusDiamonds: 0,
      purchasePrice: 140,
      sellingPrice: 165,
      discount: 25,
      imageUrl: "/images/level-up-pass.png",
      tag: "800💎 REWARD",
      isPopular: true,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 12,
      supplierCode: "FF_BD_LEVEL_UP",
      description: "Unlock up to 800 Diamonds based on your Free Fire account level milestones.",
    },
    {
      sku: "FFH-EVO-PASS",
      name: "EVO Pass",
      slug: "evo-pass",
      categoryId: categoryMap["special"],
      diamondQuantity: 0,
      bonusDiamonds: 0,
      purchasePrice: 82,
      sellingPrice: 100,
      discount: 15,
      imageUrl: "/images/evo-pass.png",
      tag: "EVO GUNS",
      isPopular: false,
      availability: "IN_STOCK",
      isActive: true,
      displayOrder: 13,
      supplierCode: "FF_BD_EVO_PASS",
      description: "7 Days EVO Access Badge with exclusive Evo Gun trial & crate benefits.",
    },
  ];

  for (const product of productsData) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        slug: product.slug,
        categoryId: product.categoryId,
        diamondQuantity: product.diamondQuantity,
        bonusDiamonds: product.bonusDiamonds,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        discount: product.discount,
        imageUrl: product.imageUrl,
        tag: product.tag,
        isPopular: product.isPopular,
        availability: product.availability,
        isActive: product.isActive,
        displayOrder: product.displayOrder,
        supplierCode: product.supplierCode,
        description: product.description,
      },
      create: product,
    });
  }
  console.log(`✅ All ${productsData.length} Diamond & Membership Products seeded.`);

  // ==========================================================================
  // 4. SEED MODULAR SUPPLIER CONFIGURATION (DEMO & LIVE ADAPTER SLOTS)
  // ==========================================================================
  await prisma.supplier.upsert({
    where: { code: "DEMO_MOCK_SUPPLIER" },
    update: {
      isActive: true,
      isDemoMode: true,
    },
    create: {
      name: "FFH Internal Demo Delivery Engine (Sandbox)",
      code: "DEMO_MOCK_SUPPLIER",
      baseUrl: "internal://demo-supplier-sandbox",
      isActive: true,
      isDemoMode: true,
      priority: 1,
      timeoutMs: 10000,
      maxRetries: 3,
      configJson: {
        mode: "DEMO",
        notice:
          "Clearly marked DEMO delivery provider. Does not claim real Garena live top-up until an official Supplier API is connected.",
      },
    },
  });

  await prisma.supplier.upsert({
    where: { code: "OFFICIAL_LIVE_SUPPLIER" },
    update: {},
    create: {
      name: "Official Top-Up Supplier API (Configure Before Live Activation)",
      code: "OFFICIAL_LIVE_SUPPLIER",
      baseUrl: process.env.SUPPLIER_API_BASE_URL || "",
      isActive: false,
      isDemoMode: false,
      priority: 2,
      timeoutMs: 15000,
      maxRetries: 3,
      configJson: {
        mode: "LIVE",
        requiresOfficialApiKey: true,
      },
    },
  });
  console.log("✅ Modular Suppliers seeded (DEMO active, LIVE ready for API credentials).");

  // ==========================================================================
  // 5. SEED DEFAULT PROMO COUPON
  // ==========================================================================
  await prisma.coupon.upsert({
    where: { code: "FFHUB10" },
    update: {
      isActive: true,
    },
    create: {
      code: "FFHUB10",
      description: "৳10 Instant Discount on orders above ৳150",
      discountType: "FIXED",
      discountValue: 10,
      minOrderAmount: 150,
      maxDiscount: 10,
      maxUses: 500,
      usedCount: 0,
      isActive: true,
    },
  });
  console.log("✅ Default promo coupon 'FFHUB10' seeded.");

  console.log("🎉 Database seeding completed successfully!");
}

main()
  .catch((error) => {
    console.error("❌ Error during database seeding:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
