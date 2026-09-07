import { findBestProductMatch, type CandidateProduct, type MatchDecision } from "../product-matcher";
import { normalizeProduct } from "../product-normalizer";

const DEFAULT_ENDPOINT = "https://google.serper.dev/search";

export type DiscoveredListing = {
  marketplace: "shopee" | "tokopedia" | "lazada" | "other";
  title: string;
  url: string;
  snippet?: string;
  position?: number;
};

export type MatchedDiscoveredListing = DiscoveredListing & {
  normalized: ReturnType<typeof normalizeProduct>;
  match: MatchDecision;
};

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type SerperResponse = {
  organic?: SerperOrganicResult[];
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function marketplaceFromUrl(url: string): DiscoveredListing["marketplace"] {
  const host = new URL(url).hostname.toLowerCase();
  if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee";
  if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia";
  if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada";
  return "other";
}

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function isProductUrl(listing: DiscoveredListing) {
  const parsed = new URL(listing.url);
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");

  if (listing.marketplace === "shopee") {
    // Shopee product pages use /...-i.<shopId>.<itemId>.
    return /-i\.\d+\.\d+$/.test(path);
  }

  if (listing.marketplace === "tokopedia") {
    // Exclude search, category, review and other non-PDP pages.
    if (path.startsWith("/find") || path.startsWith("/search") || path.includes("/review")) return false;
    return path.split("/").filter(Boolean).length >= 2;
  }

  if (listing.marketplace === "lazada") {
    return path.startsWith("/products/") && /-i\d+\.html$/.test(path);
  }

  return false;
}

export function cleanAndDeduplicateListings(listings: DiscoveredListing[]) {
  const seen = new Set<string>();
  const cleaned: DiscoveredListing[] = [];

  for (const listing of listings) {
    if (listing.marketplace === "other") continue;

    let url: string;
    try {
      url = normalizeUrl(listing.url);
    } catch {
      continue;
    }

    const normalizedListing = { ...listing, url };
    if (!isProductUrl(normalizedListing)) continue;

    const key = `${listing.marketplace}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalizedListing);
  }

  return cleaned;
}

export function matchDiscoveredListings(listings: DiscoveredListing[], candidates: CandidateProduct[]) {
  return cleanAndDeduplicateListings(listings).map<MatchedDiscoveredListing>((listing) => {
    const normalized = normalizeProduct({ name: listing.title });
    const match = findBestProductMatch(normalized, candidates);
    return { ...listing, normalized, match };
  });
}

export async function discoverListings(keyword: string, options?: { limit?: number }) {
  const trimmed = keyword.trim();
  if (!trimmed) throw new Error("Search keyword is required.");

  const apiKey = requiredEnv("SERPER_API_KEY");
  const endpoint = process.env.SERPER_API_URL || DEFAULT_ENDPOINT;
  const limit = Math.min(20, Math.max(1, options?.limit ?? 10));
  const marketplaces = [
    { name: "shopee", query: `site:shopee.co.id ${trimmed}` },
    { name: "tokopedia", query: `site:tokopedia.com ${trimmed}` },
    { name: "lazada", query: `site:lazada.co.id ${trimmed}` },
  ];

  const responses = await Promise.all(
    marketplaces.map(async ({ query }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ q: query, gl: "id", hl: "id", num: limit }),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Serper API returned HTTP ${response.status}.`);
      }

      return (await response.json()) as SerperResponse;
    }),
  );

  const rawListings = responses
    .flatMap((response) => response.organic ?? [])
    .filter((result) => result.title && result.link)
    .map<DiscoveredListing>((result) => ({
      marketplace: marketplaceFromUrl(result.link!),
      title: result.title!,
      url: result.link!,
      snippet: result.snippet,
      position: result.position,
    }));

  return cleanAndDeduplicateListings(rawListings);
}
