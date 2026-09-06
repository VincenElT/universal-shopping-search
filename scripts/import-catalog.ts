import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ImportRow = {
  marketplace: string;
  marketplaceSlug: string;
  name: string;
  brand?: string;
  category: string;
  modelNumber?: string;
  price: number;
  seller?: string;
  productUrl: string;
  affiliateUrl?: string;
  inStock?: boolean;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]));
    const price = Number(row.price);

    if (!row.marketplaceSlug || !row.name || !row.category || !Number.isFinite(price) || price < 0 || !row.productUrl) {
      throw new Error(`Invalid row ${index + 2}: marketplaceSlug, name, category, price and productUrl are required.`);
    }

    return {
      marketplace: row.marketplace,
      marketplaceSlug: row.marketplaceSlug.toLowerCase(),
      name: row.name,
      brand: row.brand || undefined,
      category: row.category,
      modelNumber: row.modelNumber || undefined,
      price: Math.round(price),
      seller: row.seller || undefined,
      productUrl: row.productUrl,
      affiliateUrl: row.affiliateUrl || undefined,
      inStock: row.inStock === "false" ? false : true,
    };
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

async function findCanonicalProduct(row: ImportRow) {
  if (row.modelNumber) {
    const byModel = await prisma.product.findFirst({
      where: { modelNumber: row.modelNumber },
    });
    if (byModel) return byModel;
  }

  const candidates = await prisma.product.findMany({
    where: {
      category: row.category,
      ...(row.brand ? { brand: row.brand } : {}),
    },
  });

  const target = normalize(row.name);
  return candidates.find((candidate) => normalize(candidate.name) === target) ?? null;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run import:catalog -- path/to/catalog.csv");
  }

  const text = await readFile(filePath, "utf8");
  const rows = parseCsv(text);
  let createdProducts = 0;
  let updatedProducts = 0;
  let upsertedListings = 0;

  for (const row of rows) {
    const marketplace = await prisma.marketplace.upsert({
      where: { slug: row.marketplaceSlug },
      update: { name: row.marketplace || row.marketplaceSlug },
      create: { name: row.marketplace || row.marketplaceSlug, slug: row.marketplaceSlug },
    });

    let product = await findCanonicalProduct(row);

    if (product) {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          name: row.name,
          brand: row.brand ?? product.brand,
          category: row.category,
          modelNumber: row.modelNumber ?? product.modelNumber,
        },
      });
      updatedProducts += 1;
    } else {
      product = await prisma.product.create({
        data: {
          name: row.name,
          brand: row.brand,
          category: row.category,
          modelNumber: row.modelNumber,
        },
      });
      createdProducts += 1;
    }

    await prisma.marketplaceListing.upsert({
      where: {
        productId_marketplaceId: {
          productId: product.id,
          marketplaceId: marketplace.id,
        },
      },
      update: {
        title: row.name,
        price: row.price,
        seller: row.seller,
        productUrl: row.productUrl,
        affiliateUrl: row.affiliateUrl,
        inStock: row.inStock,
        lastCheckedAt: new Date(),
      },
      create: {
        productId: product.id,
        marketplaceId: marketplace.id,
        title: row.name,
        price: row.price,
        seller: row.seller,
        productUrl: row.productUrl,
        affiliateUrl: row.affiliateUrl,
        inStock: row.inStock,
      },
    });

    upsertedListings += 1;
  }

  console.log(`Imported ${rows.length} rows.`);
  console.log(`Created products: ${createdProducts}`);
  console.log(`Updated/matched products: ${updatedProducts}`);
  console.log(`Upserted listings: ${upsertedListings}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
