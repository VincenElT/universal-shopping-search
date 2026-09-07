import { findBestProductMatch, type CandidateProduct, type MatchDecision } from "../product-matcher";
import { normalizeProduct } from "../product-normalizer";
import { discoverListingsWithGemini } from "./gemini";

const DEFAULT_ENDPOINT = "https://google.serper.dev/search";
const SHOPPING_ENDPOINT = "https://google.serper.dev/shopping";

type SearchProvider = "auto" | "serper" | "gemini";

export type DiscoveredListing = {
  marketplace: "shopee" | "tokopedia" | "lazada" | "other";
  title: string;
  url: string;
  snippet?: string;
  position?: number;
  price?: number | null;
  seller?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  soldCount?: number | null;
  sellerTrustScore?: number | null;
};

export type MatchedDiscoveredListing = DiscoveredListing & {
  normalized: ReturnType<typeof normalizeProduct>;
  match: MatchDecision;
};

type SerperOrganicResult = { title?: string; link?: string; snippet?: string; position?: number };
type SerperShoppingResult = { title?: string; link?: string; price?: string | number; source?: string; rating?: number | string; ratingCount?: number | string; snippet?: string; position?: number };
type SerperResponse = { organic?: SerperOrganicResult[]; shopping?: SerperShoppingResult[] };

function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }
function marketplaceFromUrl(url: string): DiscoveredListing["marketplace"] { const host = new URL(url).hostname.toLowerCase(); if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee"; if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia"; if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada"; return "other"; }
function normalizeUrl(url: string) { const parsed = new URL(url); parsed.hash = ""; parsed.search = ""; parsed.pathname = parsed.pathname.replace(/\/+$/, ""); return parsed.toString(); }
function parseMoney(value: string | number | undefined) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const match = String(value).match(/[0-9][0-9.,]*/); if (!match) return null; const digits = match[0].replace(/[^0-9]/g, ""); const number = Number(digits); return Number.isFinite(number) && number >= 1000 && number <= 100_000_000 ? number : null; }
function parseCount(value: string | number | undefined) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const normalized = String(value).toLowerCase().replace(/,/g, "").trim(); const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([km]?)/); if (!match) return null; const base = Number(match[1]); const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1; return Number.isFinite(base) ? Math.round(base * multiplier) : null; }
function parseSoldCount(text: string) { const match = text.match(/(?:terjual|sold)\s*([0-9]+(?:[.,][0-9]+)?)\s*([rbkm]?)/i); if (!match) return null; return parseCount(`${match[1]}${match[2]}`); }
function sellerScore(rating: number | null, reviews: number | null, sold: number | null) { if (rating == null && reviews == null && sold == null) return null; const ratingScore = rating == null ? 0 : Math.min(5, Math.max(0, rating)) / 5 * 55; const reviewScore = reviews == null ? 0 : Math.min(1, Math.log10(Math.max(1, reviews)) / 5) * 25; const soldScore = sold == null ? 0 : Math.min(1, Math.log10(Math.max(1, sold)) / 5) * 20; return Math.round(ratingScore + reviewScore + soldScore); }

function isProductUrl(listing: DiscoveredListing) {
  const parsed = new URL(listing.url); const path = parsed.pathname.toLowerCase().replace(/\/+$/, ""); const segments = path.split("/").filter(Boolean); if (!segments.length) return false;
  if (/\/(search|find|category|categories|mall|reviews?|help|login)(\/|$)/i.test(path)) return false;
  if (listing.marketplace === "shopee") return /-i\.\d+\.\d+$/.test(path) || (listing.price != null && segments.length >= 1);
  if (listing.marketplace === "tokopedia") return !path.startsWith("/find") && !path.startsWith("/search") && !path.includes("/review") && (segments.length >= 2 || listing.price != null);
  if (listing.marketplace === "lazada") return (/^\/products\//.test(path) && /-i\d+\.html$/.test(path)) || (listing.price != null && segments.length >= 2);
  return false;
}

export function cleanAndDeduplicateListings(listings: DiscoveredListing[]) { const seen = new Set<string>(); return listings.flatMap((listing) => { if (listing.marketplace === "other") return []; let url: string; try { url = normalizeUrl(listing.url); } catch { return []; } const normalizedListing = { ...listing, url }; if (!isProductUrl(normalizedListing)) return []; const key = `${listing.marketplace}:${url}`; if (seen.has(key)) return []; seen.add(key); return [normalizedListing]; }); }
export function matchDiscoveredListings(listings: DiscoveredListing[], candidates: CandidateProduct[]) { return cleanAndDeduplicateListings(listings).map<MatchedDiscoveredListing>((listing) => { const normalized = normalizeProduct({ name: listing.title }); const match = findBestProductMatch(normalized, candidates); return { ...listing, normalized, match }; }); }

async function discoverWithSerper(keyword: string, options?: { limit?: number }) {
  const trimmed = keyword.trim(); if (!trimmed) throw new Error("Search keyword is required.");
  const apiKey = requiredEnv("SERPER_API_KEY"); const endpoint = process.env.SERPER_API_URL || DEFAULT_ENDPOINT; const limit = Math.min(20, Math.max(1, options?.limit ?? 10));
  const marketplaces = [
    { name: "shopee", query: `site:shopee.co.id ${trimmed}` },
    { name: "tokopedia", query: `site:tokopedia.com ${trimmed}` },
    { name: "lazada", query: `site:lazada.co.id ${trimmed}` },
  ];
  const responses = await Promise.all(marketplaces.map(async ({ name, query }) => {
    const shoppingResponse = await fetch(SHOPPING_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": apiKey }, body: JSON.stringify({ q: `${trimmed} ${name}`, gl: "id", hl: "id", num: limit }), cache: "no-store" });
    if (!shoppingResponse.ok) throw new Error(`Serper API returned HTTP ${shoppingResponse.status}.`);
    const shopping = (await shoppingResponse.json()) as SerperResponse; const results: DiscoveredListing[] = [];
    for (const item of shopping.shopping ?? []) {
      if (!item.link || !item.title) continue; const marketplace = marketplaceFromUrl(item.link); if (marketplace !== name) continue;
      const rating = item.rating == null ? null : Number(item.rating); const reviewCount = parseCount(item.ratingCount); const text = `${item.title} ${item.snippet ?? ""}`; const soldCount = parseSoldCount(text);
      results.push({ marketplace, title: item.title, url: item.link, snippet: item.snippet, position: item.position, price: parseMoney(item.price), seller: item.source ?? null, rating: Number.isFinite(rating ?? NaN) ? rating : null, reviewCount, soldCount, sellerTrustScore: sellerScore(Number.isFinite(rating ?? NaN) ? rating : null, reviewCount, soldCount) });
    }
    if (results.filter((item) => item.price !== null).length >= 3) return results;
    const organicResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": apiKey }, body: JSON.stringify({ q: query, gl: "id", hl: "id", num: limit }), cache: "no-store" });
    if (!organicResponse.ok) return results;
    const organic = (await organicResponse.json()) as SerperResponse;
    for (const item of organic.organic ?? []) {
      if (!item.link || !item.title) continue; const marketplace = marketplaceFromUrl(item.link); if (marketplace !== name) continue; const soldCount = parseSoldCount(`${item.title} ${item.snippet ?? ""}`);
      results.push({ marketplace, title: item.title, url: item.link, snippet: item.snippet, position: item.position, price: null, seller: null, rating: null, reviewCount: null, soldCount, sellerTrustScore: soldCount == null ? null : sellerScore(null, null, soldCount) });
    }
    return results;
  }));
  const cleaned = cleanAndDeduplicateListings(responses.flat());
  return cleaned.filter((listing) => listing.sellerTrustScore !== null || listing.price !== null).sort((a, b) => (b.sellerTrustScore ?? -1) - (a.sellerTrustScore ?? -1) || (a.position ?? 999) - (b.position ?? 999));
}

function configuredProvider(): SearchProvider { const value = process.env.SEARCH_PROVIDER?.trim().toLowerCase(); if (value === "serper" || value === "gemini" || value === "auto") return value; return "auto"; }
function shouldFallbackToSerper(error: unknown) { const message = error instanceof Error ? error.message : String(error); return message.includes("Gemini API returned HTTP") || message.includes("GEMINI_API_KEY is not configured") || message.includes("Gemini request failed") || message.includes("Gemini request timed out"); }

export async function discoverListings(keyword: string, options?: { limit?: number }) {
  const provider = configuredProvider(); if (provider === "serper") return discoverWithSerper(keyword, options);
  try {
    const geminiListings = await discoverListingsWithGemini(keyword, options);
    if (geminiListings.length > 0) return geminiListings;
    console.warn("[search] Gemini returned 0 usable listings; falling back to Serper.");
    if (provider === "auto" || provider === "gemini") return await discoverWithSerper(keyword, options);
  } catch (error) {
    if (provider === "gemini" && !shouldFallbackToSerper(error)) throw error;
    if (provider === "gemini" || provider === "auto") {
      try { return await discoverWithSerper(keyword, options); }
      catch (fallbackError) { throw new Error(`${error instanceof Error ? error.message : String(error)} Serper fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`); }
    }
    throw error;
  }
  return [];
}
