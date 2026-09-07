import type { DiscoveredListing } from "./serper";
import type { ExtractedListingData } from "./extract";

export type ValidationResult = {
  valid: boolean;
  confidence: number;
  flags: string[];
};

export function validateListing(listing: DiscoveredListing, data: ExtractedListingData): ValidationResult {
  const flags: string[] = [];
  let confidence = 0;

  if (data.price != null) confidence += listing.price != null ? 45 : 30;
  else flags.push("missing price");

  if (data.seller) confidence += 15;
  else flags.push("missing seller");

  if (data.rating != null) {
    if (data.rating >= 0 && data.rating <= 5) confidence += 12;
    else flags.push("invalid rating");
  }

  if (data.reviewCount != null && data.reviewCount >= 0) confidence += 8;
  if (data.soldCount != null && data.soldCount >= 0) confidence += 5;

  try {
    const url = new URL(listing.url);
    if (url.protocol === "https:") confidence += 5;
    else flags.push("non-https url");
  } catch {
    flags.push("invalid url");
  }

  if (/\b(500gb|2tb|4tb)\b/i.test(listing.title) && /\b1tb\b/i.test(listing.snippet ?? "")) {
    flags.push("variant ambiguity");
    confidence -= 20;
  }

  const valid = data.price != null && !flags.includes("invalid url") && !flags.includes("invalid rating");
  return { valid, confidence: Math.max(0, Math.min(100, confidence)), flags };
}
