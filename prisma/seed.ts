import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    id: "g502",
    name: "Logitech G502 HERO Gaming Mouse",
    brand: "Logitech",
    category: "Mouse",
    modelNumber: "G502 HERO",
    icon: "🖱️",
    listings: [
      ["Shopee", "shopee", 649000, "Official Store"],
      ["Tokopedia", "tokopedia", 679000, "Official Store"],
      ["Lazada", "lazada", 699000, "Official Store"],
    ],
  },
  {
    id: "k380",
    name: "Logitech K380 Bluetooth Keyboard",
    brand: "Logitech",
    category: "Keyboard",
    modelNumber: "K380",
    icon: "⌨️",
    listings: [
      ["Tokopedia", "tokopedia", 479000, "Official Store"],
      ["Shopee", "shopee", 489000, "Official Store"],
      ["Lazada", "lazada", 515000, "Official Store"],
    ],
  },
  {
    id: "t7",
    name: "Samsung T7 Portable SSD 1TB",
    brand: "Samsung",
    category: "Storage",
    modelNumber: "MU-PC1T0T",
    icon: "💾",
    listings: [
      ["Shopee", "shopee", 1399000, "Samsung Official"],
      ["Lazada", "lazada", 1425000, "Samsung Official"],
      ["Tokopedia", "tokopedia", 1499000, "Samsung Official"],
    ],
  },
  {
    id: "fury",
    name: "Kingston FURY Beast 16GB DDR4 3200MHz",
    brand: "Kingston",
    category: "RAM",
    modelNumber: "KF432C16BB/16",
    icon: "🧠",
    listings: [
      ["Tokopedia", "tokopedia", 549000, "Kingston Store"],
      ["Shopee", "shopee", 565000, "Kingston Store"],
      ["Lazada", "lazada", 599000, "Kingston Store"],
    ],
  },
] as const;

async function main() {
  const marketplaces = [
    ["Shopee", "shopee"],
    ["Tokopedia", "tokopedia"],
    ["Lazada", "lazada"],
  ] as const;

  for (const [name, slug] of marketplaces) {
    await prisma.marketplace.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
  }

  for (const item of products) {
    const product = await prisma.product.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        brand: item.brand,
        category: item.category,
        modelNumber: item.modelNumber,
      },
      create: {
        id: item.id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        modelNumber: item.modelNumber,
      },
    });

    for (const [marketplaceName, marketplaceSlug, price, seller] of item.listings) {
      const marketplace = await prisma.marketplace.findUniqueOrThrow({ where: { slug: marketplaceSlug } });
      await prisma.marketplaceListing.upsert({
        where: {
          productId_marketplaceId_productUrl: {
            productId: product.id,
            marketplaceId: marketplace.id,
            productUrl: "#",
          },
        },
        update: { title: item.name, price, seller, affiliateUrl: null, inStock: true },
        create: {
          productId: product.id,
          marketplaceId: marketplace.id,
          title: item.name,
          price,
          seller,
          productUrl: "#",
          inStock: true,
        },
      });
    }
  }

  console.log("Seeded products and marketplace listings.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
