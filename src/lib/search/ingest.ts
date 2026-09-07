import { prisma } from "@/lib/prisma";
import { findBestProductMatch, type CandidateProduct } from "@/lib/product-matcher";
import { normalizeProduct } from "@/lib/product-normalizer";
import type { DiscoveredListing } from "./serper";
import { extractListingData } from "./extract";
import { validateListing } from "./validate";

export type EnrichedDiscoveredListing = DiscoveredListing & ReturnType<typeof extractListingData>;

function candidatesFor(normalized: ReturnType<typeof normalizeProduct>, candidates: CandidateProduct[]) {
  return candidates.filter((candidate) =>
    candidate.category === normalized.category && (!normalized.brand || candidate.brand === normalized.brand),
  );
}

export function enrichDiscoveredListing(listing: DiscoveredListing): EnrichedDiscoveredListing {
  return { ...listing, ...extractListingData(listing) };
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
  let observations = 0;

  for (const listing of enriched) {
    const validation = validateListing(listing, listing);
    if (!validation.valid || listing.price == null || listing.marketplace === "other") {
      skippedListings += 1;
      results.push({ listing, status: "skipped", reason: validation.flags.join(", ") || "invalid listing" });
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

    await prisma.listingObservation.create({
      data: {
        listingId: saved.id,
        source: "google_serper_shopping",
        sourceUrl: listing.url,
        rawTitle: listing.title,
        rawPrice: listing.price == null ? null : String(listing.price),
        rawSeller: listing.seller,
        rawRating: listing.rating == null ? null : String(listing.rating),
        rawReviewCount: listing.reviewCount == null ? null : String(listing.reviewCount),
        rawSoldCount: listing.soldCount == null ? null : String(listing.soldCount),
        extractedData: JSON.stringify({
          price: listing.price,
          seller: listing.seller,
          rating: listing.rating,
          reviewCount: listing.reviewCount,
          soldCount: listing.soldCount,
          inStock: listing.inStock,
          fields: listing.fields,
          validationFlags: validation.flags,
        }),
        confidence: validation.confidence,
      },
    });
    observations += 1;

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
      confidence: validation.confidence,
      flags: validation.flags,
      status: decision.status === "match" ? "matched" : "created",
    });
  }

  return {
    results,
    stats: {
      discovered: listings.length,
      createdProducts,
      upsertedListings,
      recordedSnapshots,
      observations,
      skippedListings,
    },
  };
}
