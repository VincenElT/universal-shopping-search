import type { DiscoveredListing } from "./serper";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent";

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; groundingMetadata?: { groundingChunks?: GroundingChunk[] } }> };
type GeminiListing = { title?: string; url?: string; price?: number | string | null; seller?: string | null; rating?: number | string | null; reviewCount?: number | string | null; soldCount?: number | string | null; sourceIndex?: number | null };

function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }
function parseMoney(value: GeminiListing["price"]) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const match = String(value).match(/[0-9][0-9.,]*/); if (!match) return null; const number = Number(match[0].replace(/[^0-9]/g, "")); return Number.isFinite(number) && number >= 1000 && number <= 100_000_000 ? number : null; }
function parseCount(value: GeminiListing["reviewCount"] | GeminiListing["soldCount"]) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const match = String(value).toLowerCase().replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*([km]?)/); if (!match) return null; const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1; const number = Number(match[1]) * multiplier; return Number.isFinite(number) ? Math.round(number) : null; }
function marketplaceFromUrl(url: string): DiscoveredListing["marketplace"] { try { const host = new URL(url).hostname.toLowerCase(); if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee"; if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia"; if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada"; } catch {} return "other"; }
function normalizeUrl(url: string) { const parsed = new URL(url); parsed.hash = ""; parsed.search = ""; parsed.pathname = parsed.pathname.replace(/\/+$/, ""); return parsed.toString(); }
function sellerScore(rating: number | null, reviews: number | null, sold: number | null) { if (rating == null && reviews == null && sold == null) return null; const ratingScore = rating == null ? 0 : Math.min(5, Math.max(0, rating)) / 5 * 55; const reviewScore = reviews == null ? 0 : Math.min(1, Math.log10(Math.max(1, reviews)) / 5) * 25; const soldScore = sold == null ? 0 : Math.min(1, Math.log10(Math.max(1, sold)) / 5) * 20; return Math.round(ratingScore + reviewScore + soldScore); }
function extractJson(text: string): GeminiListing[] { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text; const start = fenced.indexOf("["); const end = fenced.lastIndexOf("]"); if (start < 0 || end <= start) return []; try { const parsed = JSON.parse(fenced.slice(start, end + 1)); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

async function searchMarketplace(apiKey: string, keyword: string, marketplace: string, limit: number) {
  const prompt = `Search Google for real Indonesian marketplace listings for the exact product: "${keyword}". Focus only on ${marketplace}. Return up to ${limit} concrete product listings. Do not invent listings, prices, sellers, ratings, or URLs. Only include a listing when the source is a real search result. Return ONLY a JSON array, no markdown, with objects containing: title, url, price, seller, rating, reviewCount, soldCount, sourceIndex. price must be an integer IDR when visible, otherwise null. sourceIndex refers to the source number in the grounding results.`;
  const response = await fetch(GEMINI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }), cache: "no-store" });
  if (!response.ok) throw new Error(`Gemini API returned HTTP ${response.status}.`);
  const data = (await response.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  return extractJson(text).flatMap((item): DiscoveredListing[] => {
    const rawUrl = item.url || (item.sourceIndex != null ? chunks[item.sourceIndex]?.web?.uri : undefined);
    if (!rawUrl || !item.title) return [];
    let url: string; try { url = normalizeUrl(rawUrl); } catch { return []; }
    const detected = marketplaceFromUrl(url); if (detected !== marketplace) return [];
    const rating = item.rating == null ? null : Number(item.rating);
    const reviewCount = parseCount(item.reviewCount); const soldCount = parseCount(item.soldCount);
    return [{ marketplace: detected, title: item.title, url, price: parseMoney(item.price), seller: item.seller ?? null, rating: Number.isFinite(rating ?? NaN) ? rating : null, reviewCount, soldCount, sellerTrustScore: sellerScore(Number.isFinite(rating ?? NaN) ? rating : null, reviewCount, soldCount) }];
  });
}

export async function discoverListingsWithGemini(keyword: string, options?: { limit?: number }) {
  const trimmed = keyword.trim(); if (!trimmed) throw new Error("Search keyword is required.");
  const apiKey = requiredEnv("GEMINI_API_KEY"); const limit = Math.min(10, Math.max(1, options?.limit ?? 5));
  const results = await Promise.all(["shopee", "tokopedia", "lazada"].map((marketplace) => searchMarketplace(apiKey, trimmed, marketplace, limit)));
  const seen = new Set<string>();
  return results.flat().filter((listing) => { const key = `${listing.marketplace}:${listing.url}`; if (seen.has(key)) return false; seen.add(key); return listing.price !== null || listing.sellerTrustScore !== null; });
}
