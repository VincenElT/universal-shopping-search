import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { normalizeProduct } from "../src/lib/product-normalizer";
import { findBestProductMatch } from "../src/lib/product-matcher";

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
    if (char === '"' && quoted && next === '"') { current += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
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

async function findCanonicalProduct(row: ImportRow) {
  const normalized = normalizeProduct(row);
  const candidates = await prisma.product.findMany({
    where: {
      category: normalized.category,
      ...(normalized.brand ? { brand: normalized.brand } : {}),
    },
  });

  return findBestProductMatch(normalized, candidates);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: npm run import:catalog -- path/to/catalog.csv");
  const rows = parseCsv(await readFile(filePath, "utf8"));
  let createdProducts = 0;
  let updatedProducts = 0;
  let upsertedListings = 0;
  let recordedSnapshots = 0;
  let skippedSnapshots = 0;
  let ambiguousMatches = 0;

  for (const row of rows) {
    const normalized = normalizeProduct(row);
    const marketplace = await prisma.marketplace.upsert({
      where: { slug: row.marketplaceSlug },
      update: { name: row.marketplace || row.marketplaceSlug },
      create: { name: row.marketplace || row.marketplaceSlug, slug: row.marketplaceSlug },
    });

    const decision = await findCanonicalProduct(row);
    let product = decision.product;

    if (decision.status === "ambiguous") ambiguousMatches += 1;

    if (product && decision.status === "match") {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          name: product.name,
          brand: normalized.brand ?? product.brand,
          category: normalized.category,
          modelNumber: normalized.modelNumber ?? product.modelNumber,
        },
      });
      updatedProducts += 1;
      console.log(`MATCH ${decision.score}: "${row.name}" -> "${product.name}" (${decision.reasons.join(", ")})`);
    } else {
      product = await prisma.product.create({
        data: {
          name: normalized.name,
          brand: normalized.brand,
          category: normalized.category,
          modelNumber: normalized.modelNumber,
        },
      });
      createdProducts += 1;
      console.log(`${decision.status === "ambiguous" ? "AMBIGUOUS" : "NEW"} ${decision.score}: "${row.name}" -> new product`);
    }

    const existingListing = await prisma.marketplaceListing.findUnique({
      where: { productId_marketplaceId_productUrl: { productId: product.id, marketplaceId: marketplace.id, productUrl: row.productUrl } },
      select: { id: true, price: true, inStock: true },
    });

    const listing = await prisma.marketplaceListing.upsert({
      where: { productId_marketplaceId_productUrl: { productId: product.id, marketplaceId: marketplace.id, productUrl: row.productUrl } },
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

    await prisma.listingObservation.create({
      data: {
        listingId: listing.id,
        source: "catalog_import",
        sourceUrl: row.productUrl,
        rawTitle: row.name,
        rawPrice: String(row.price),
        rawSeller: row.seller,
        extractedData: JSON.stringify({ source: "catalog_import", marketplace: row.marketplaceSlug }),
        confidence: 80,
      },
    });

    const changed = !existingListing || existingListing.price !== row.price || existingListing.inStock !== row.inStock;
    if (changed) {
      await prisma.priceHistory.create({
        data: {
          listingId: listing.id,
          price: row.price,
          inStock: row.inStock ?? true,
        },
      });
      recordedSnapshots += 1;
    } else {
      skippedSnapshots += 1;
    }
  }

  console.log(`Imported ${rows.length} rows.`);
  console.log(`Created products: ${createdProducts}`);
  console.log(`Updated/matched products: ${updatedProducts}`);
  console.log(`Ambiguous matches: ${ambiguousMatches}`);
  console.log(`Upserted listings: ${upsertedListings}`);
  console.log(`Recorded price snapshots: ${recordedSnapshots}`);
  console.log(`Skipped unchanged snapshots: ${skippedSnapshots}`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
