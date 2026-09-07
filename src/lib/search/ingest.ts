import { prisma } from "@/lib/prisma";
import { findBestProductMatch, type CandidateProduct } from "@/lib/product-matcher";
import { normalizeProduct } from "@/lib/product-normalizer";
import type { DiscoveredListing } from "./serper";

export type EnrichedDiscoveredListing = DiscoveredListing & {
  price: number | null;
  seller: string | null;
  inStock: boolean;
};

function parsePrice(text: string) {
  const matches = [...text.matchAll(/(?:Rp\.?\s*)?([0-9]{1,3}(?:[.][0-9]{3})+|[0-9]{5,})/gi)]
    .map((match) => Number(match[1].replace(/\./g, "")))
    .filter((value) => Number.isFinite(value) && value >= 1000 && value <= 100_000_000);
  return matches[0] ?? null;
}

function sellerFromUrl(listing: DiscoveredListing) {
  try {
    const path = new URL(listing.url).pathname.split("/").filter(Boolean);
    if (listing.marketplace === "tokopedia" && path.length >= 2) return decodeURIComponent(path[0]);
  } catch {}
  return null;
}

export function enrichDiscoveredListing(listing: DiscoveredListing): EnrichedDiscoveredListing {
  const text = `${listing.title} ${listing.snippet ?? ""}`;
  return {
    ...listing,
    price: listing.price ?? parsePrice(listing.snippet ?? listing.title),
    seller: listing.seller ?? sellerFromUrl(listing),
    inStock: !/habis|sold\s*out|out\s*of\s*stock|stok\s*habis/i.test(text),
  };
}

function candidatesFor(normalized: ReturnType<typeof normalizeProduct>, candidates: CandidateProduct[]) {
  return candidates.filter((candidate) =>
    candidate.category === normalized.category && (!normalized.brand || candidate.brand === normalized.brand),
  );
}

export async function ingestDiscoveredListings(listings: DiscoveredListing[]) {
  const enriched = listings.map(enrichDiscoveredListing);
  const candidates = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, modelNumber: true },
  });
  const results = [];
  let createdProducts = 0;
  let upsertedListings = 0;
  let recordedSnapshots = 0;
  let skippedListings = 0;

  for (const listing of enriched) {
    if (!listing.price || listing.marketplace === "other") {
      skippedListings += 1;
      continue;
    }

    const normalized = normalizeProduct({ name: listing.title });
    const decision = findBestProductMatch(normalized, candidatesFor(normalized, candidates));
    let product = decision.product;

    if (!product || decision.status !== "match") {
      product = await prisma.product.create({
        data: {
          name: normalized.name,
          brand: normalized.brand,
          category: normalized.category,
          modelNumber: normalized.modelNumber,
        },
      });
      candidates.push(product);
      createdProducts += 1;
    }

    const marketplace = await prisma.marketplace.upsert({
      where: { slug: listing.marketplace },
      update: { name: listing.marketplace[0].toUpperCase() + listing.marketplace.slice(1) },
      create: { name: listing.marketplace[0].toUpperCase() + listing.marketplace.slice(1), slug: listing.marketplace },
    });

    const existing = await prisma.marketplaceListing.findUnique({
      where: { productId_marketplaceId_productUrl: { productId: product.id, marketplaceId: marketplace.id, productUrl: listing.url } },
      select: { id: true, price: true, inStock: true },
    });

    const saved = await prisma.marketplaceListing.upsert({
      where: { productId_marketplaceId_productUrl: { productId: product.id, marketplaceId: marketplace.id, productUrl: listing.url } },
      update: {
        title: listing.title,
        price: listing.price,
        seller: listing.seller,
        rating: listing.rating ?? undefined,
        reviewCount: listing.reviewCount ?? undefined,
        soldCount: listing.soldCount ?? undefined,
        sellerTrustScore: listing.sellerTrustScore ?? undefined,
        productUrl: listing.url,
        inStock: listing.inStock,
        lastCheckedAt: new Date(),
      },
      create: {
        productId: product.id,
        marketplaceId: marketplace.id,
        title: listing.title,
        price: listing.price,
        seller: listing.seller,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        soldCount: listing.soldCount,
        sellerTrustScore: listing.sellerTrustScore,
        productUrl: listing.url,
        inStock: listing.inStock,
      },
    });
    upsertedListings += 1;

    const changed = !existing || existing.price !== listing.price || existing.inStock !== listing.inStock;
    if (changed) {
      await prisma.priceHistory.create({ data: { listingId: saved.id, price: listing.price, inStock: listing.inStock } });
      recordedSnapshots += 1;
    } else {
      skippedListings += 1;
    }

    results.push({
      listing,
      productId: product.id,
      status: decision.status === "match" ? "matched" : "created",
    });
  }

  return { results, stats: { discovered: listings.length, createdProducts, upsertedListings, recordedSnapshots, skippedListings } };
}
