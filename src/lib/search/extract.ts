import type { DiscoveredListing } from "./serper";

export type ExtractedListingData = {
  price: number | null;
  seller: string | null;
  rating: number | null;
  reviewCount: number | null;
  soldCount: number | null;
  inStock: boolean;
  fields: Record<string, "structured" | "title" | "snippet" | "url" | "inferred" | "missing">;
};

function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (!value) return null;
  const match = String(value).match(/[0-9][0-9.,]*/);
  if (!match) return null;
  const digits = match[0].replace(/[^0-9]/g, "");
  const number = Number(digits);
  return Number.isFinite(number) && number >= 1000 && number <= 100_000_000 ? number : null;
}

function parseCount(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (!value) return null;
  const normalized = String(value).toLowerCase().replace(/,/g, "").trim();
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([km]?)/);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return Number.isFinite(base) ? Math.round(base * multiplier) : null;
}

function parseSoldCount(text: string) {
  const match = text.match(/(?:terjual|sold)\s*([0-9]+(?:[.,][0-9]+)?)\s*([rbkm]?)/i);
  return match ? parseCount(`${match[1]}${match[2]}`) : null;
}

function sellerFromUrl(listing: DiscoveredListing) {
  try {
    const path = new URL(listing.url).pathname.split("/").filter(Boolean);
    if (listing.marketplace === "tokopedia" && path.length >= 2) return decodeURIComponent(path[0]);
  } catch {}
  return null;
}

export function extractListingData(listing: DiscoveredListing): ExtractedListingData {
  const text = `${listing.title} ${listing.snippet ?? ""}`;
  const price = listing.price ?? parseMoney(listing.snippet);
  const seller = listing.seller ?? sellerFromUrl(listing);
  const rating = listing.rating ?? null;
  const reviewCount = listing.reviewCount ?? null;
  const soldCount = listing.soldCount ?? parseSoldCount(text);
  const inStock = !/habis|sold\s*out|out\s*of\s*stock|stok\s*habis/i.test(text);

  return {
    price,
    seller,
    rating,
    reviewCount,
    soldCount,
    inStock,
    fields: {
      price: listing.price != null ? "structured" : price != null ? "snippet" : "missing",
      seller: listing.seller != null ? "structured" : seller != null ? "url" : "missing",
      rating: listing.rating != null ? "structured" : "missing",
      reviewCount: listing.reviewCount != null ? "structured" : "missing",
      soldCount: listing.soldCount != null ? "structured" : soldCount != null ? "snippet" : "missing",
      inStock: /habis|sold\s*out|out\s*of\s*stock|stok\s*habis/i.test(text) ? "snippet" : "inferred",
    },
  };
}
