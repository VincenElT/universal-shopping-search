import type { DiscoveredListing } from "./serper";
import { isProductUrl, marketplaceFromUrl as marketplaceFromProductUrl, normalizeProductUrl } from "./product-url";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string; groundingMetadata?: { groundingChunks?: GroundingChunk[]; groundingSupports?: unknown[]; webSearchQueries?: string[]; searchEntryPoint?: { renderedContent?: string }>; }>; promptFeedback?: { blockReason?: string; blockReasonMessage?: string }; error?: { message?: string; status?: string; code?: number } };
type GeminiListing = { title?: string; url?: string | null; price?: number | string | null; seller?: string | null; rating?: number | string | null; reviewCount?: number | string | null; soldCount?: number | string | null; sourceIndex?: number | null };

function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }
function parseMoney(value: GeminiListing["price"]) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const match = String(value).match(/[0-9][0-9.,]*/); if (!match) return null; const number = Number(match[0].replace(/[^0-9]/g, "")); return Number.isFinite(number) && number >= 1000 && number <= 100_000_000 ? number : null; }
function parseCount(value: GeminiListing["reviewCount"] | GeminiListing["soldCount"]) { if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (!value) return null; const match = String(value).toLowerCase().replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*([km]?)/); if (!match) return null; const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1; const number = Number(match[1]) * multiplier; return Number.isFinite(number) ? Math.round(number) : null; }
function marketplaceFromUrl(url: string) { return marketplaceFromProductUrl(url); }
function isGoogleGroundingRedirect(url: string) { try { const parsed = new URL(url); return parsed.hostname.toLowerCase() === "vertexaisearch.cloud.google.com" && parsed.pathname.startsWith("/grounding-api-redirect/"); } catch { return false; } }

/**
 * Resolve Google grounding links and verify that ordinary listing URLs do not
 * redirect to a search/category/home page. We intentionally keep the returned
 * URL as the marketplace's canonical URL rather than exposing a Google or
 * affiliate redirect to the browser.
 */
async function resolveListingUrl(url: string, expectedMarketplace?: string, price?: number | null) {
  for (const method of ["HEAD", "GET"] as const) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; UniversalShoppingSearch/1.0)" },
      });
      const resolved = response.url;
      if (!response.ok && response.status >= 400) continue;
      if (!resolved || isGoogleGroundingRedirect(resolved)) continue;
      const marketplace = marketplaceFromUrl(resolved);
      if (marketplace === "other") continue;
      if (expectedMarketplace && marketplace !== expectedMarketplace) continue;
      if (!isProductUrl({ marketplace, url: resolved, price })) {
        console.warn("[gemini-debug] destination redirected to non-product URL", { originalUrl: url, resolvedUrl: resolved, marketplace });
        continue;
      }
      return resolved;
    } catch {
      // A marketplace can reject server-side HEAD/GET requests while still
      // exposing a perfectly valid product URL. Fall back to the original URL
      // only when its URL shape is already independently valid.
      try {
        const marketplace = marketplaceFromUrl(url);
        if (marketplace !== "other" && isProductUrl({ marketplace, url, price }) && (!expectedMarketplace || marketplace === expectedMarketplace)) return url;
      } catch {}
    } finally { clearTimeout(timeout); }
  }
  return null;
}

function sellerScore(rating: number | null, reviews: number | null, sold: number | null) { if (rating == null && reviews == null && sold == null) return null; const ratingScore = rating == null ? 0 : Math.min(5, Math.max(0, rating)) / 5 * 55; const reviewScore = reviews == null ? 0 : Math.min(1, Math.log10(Math.max(1, reviews)) / 5) * 25; const soldScore = sold == null ? 0 : Math.min(1, Math.log10(Math.max(1, sold)) / 5) * 20; return Math.round(ratingScore + reviewScore + soldScore); }
function extractJson(text: string): GeminiListing[] { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text; const start = fenced.indexOf("["); const end = fenced.lastIndexOf("]"); if (start < 0 || end <= start) return []; try { const parsed = JSON.parse(fenced.slice(start, end + 1)); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function candidateUrls(item: GeminiListing, chunks: GroundingChunk[]) { const urls: string[] = []; if (item.url) urls.push(item.url); const indexed = item.sourceIndex != null ? chunks[item.sourceIndex]?.web?.uri : undefined; if (indexed && !urls.includes(indexed)) urls.push(indexed); return urls; }

async function requestGemini(apiKey: string, keyword: string, limit: number) {
  const prompt = `You are a product research agent. You MUST use Google Search for this request; do not answer from memory and do not restrict the search to specific domains.\n\nSearch the entire public web for current real purchasable product listings in Indonesia for the exact product: "${keyword}".\n\nRun broad Google searches and gather MORE candidates than the final answer needs. Search multiple result pages/queries when useful. Look across marketplaces, retailers, specialty stores, manufacturer stores, distributors, and other ecommerce sites. Do NOT limit the search to Shopee, Tokopedia, Lazada, or any predefined website.\n\nPrioritize actual product/detail pages. Exclude category pages, search pages, articles, reviews, generic homepages, seller profile pages, and unrelated variants. Prefer different sellers/stores for the same exact product so the final result can compare offers. Also include genuinely different product variants when they are distinct products, but do not mix them into the exact product requested.\n\nReturn up to ${limit} strong verified listings. For every listing, extract the exact listing title, current price in IDR if shown, seller/store if shown, rating/review/sold counts if shown, and the actual product-page URL. Do not invent or estimate missing values; use null when unavailable.\n\nOnly include listings supported by Google Search results. sourceIndex MUST point to the Google grounding source that supports the listing. If item.url is an actual product/detail URL, use it. If you cannot identify a real product-detail URL, omit the listing rather than inventing one. Return ONLY a JSON array with objects containing: title, url, price, seller, rating, reviewCount, soldCount, sourceIndex. Do not return markdown or explanatory text.`;
  console.log("[gemini-debug] request", { endpoint: GEMINI_ENDPOINT, keyword, limit, hasApiKey: Boolean(apiKey) }); const startedAt = Date.now();
  try { const response = await fetch(GEMINI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }), cache: "no-store" }); console.log("[gemini-debug] http", { status: response.status, ok: response.ok, elapsedMs: Date.now() - startedAt }); const data = (await response.json().catch(() => ({}))) as GeminiResponse; if (!response.ok) { const detail = data.error?.message ? ` ${data.error.message}` : ""; throw new Error(`Gemini API returned HTTP ${response.status}.${detail}`); } return data; } catch (error) { console.error("[gemini-debug] request failed", { elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }); throw error; }
}

export async function discoverListingsWithGemini(keyword: string, options?: { limit?: number }) {
  const trimmed = keyword.trim(); if (!trimmed) throw new Error("Search keyword is required."); const apiKey = requiredEnv("GEMINI_API_KEY"); const limit = Math.min(20, Math.max(1, options?.limit ?? 10)); const data = await requestGemini(apiKey, trimmed, Math.min(20, Math.max(limit * 2, 15))); const candidate = data.candidates?.[0]; const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? ""; const metadata = candidate?.groundingMetadata; const chunks = metadata?.groundingChunks ?? []; const parsedListings = extractJson(text);
  console.log("[gemini-debug] response", { candidateCount: data.candidates?.length ?? 0, finishReason: candidate?.finishReason ?? null, promptBlockReason: data.promptFeedback?.blockReason ?? null, promptBlockReasonMessage: data.promptFeedback?.blockReasonMessage ?? null, textLength: text.length, textPreview: text.slice(0, 4000), parsedCount: parsedListings.length, groundingChunkCount: chunks.length, groundingSupportCount: metadata?.groundingSupports?.length ?? 0, webSearchQueries: metadata?.webSearchQueries ?? [], hasSearchEntryPoint: Boolean(metadata?.searchEntryPoint), groundingChunks: chunks.map((chunk, index) => ({ index, title: chunk.web?.title ?? null, uri: chunk.web?.uri ?? null, marketplace: chunk.web?.uri ? marketplaceFromUrl(chunk.web.uri) : "other" })) });
  const seen = new Set<string>(); const resolvedListings = await Promise.all(parsedListings.map(async (item) => {
    if (!item.title) return null;
    const rating = item.rating == null ? null : Number(item.rating); const reviewCount = parseCount(item.reviewCount); const soldCount = parseCount(item.soldCount); const safeRating = Number.isFinite(rating ?? NaN) ? rating : null; const price = parseMoney(item.price);
    for (const rawUrl of candidateUrls(item, chunks)) {
      const expectedMarketplace = marketplaceFromUrl(rawUrl);
      const resolvedUrl = await resolveListingUrl(rawUrl, expectedMarketplace === "other" ? undefined : expectedMarketplace, price); if (!resolvedUrl) continue;
      let url: string; try { url = normalizeProductUrl(resolvedUrl); } catch { continue; }
      const marketplace = marketplaceFromUrl(url); if (marketplace === "other") continue;
      if (!isProductUrl({ marketplace, url, price })) { console.warn("[gemini-debug] rejected non-product URL", { marketplace, url, title: item.title, sourceIndex: item.sourceIndex }); continue; }
      return { marketplace, title: item.title, url, price, seller: item.seller ?? null, rating: safeRating, reviewCount, soldCount, sellerTrustScore: sellerScore(safeRating, reviewCount, soldCount) } satisfies DiscoveredListing;
    }
    console.warn("[gemini-debug] no verified product URL", { title: item.title, sourceIndex: item.sourceIndex }); return null;
  }));
  const results: DiscoveredListing[] = []; for (const listing of resolvedListings) { if (!listing) continue; const key = `${listing.marketplace}:${listing.url}`; if (seen.has(key)) continue; seen.add(key); if (listing.price === null && listing.sellerTrustScore === null) continue; results.push(listing); }
  console.log("[gemini-debug] verified", { candidateCount: parsedListings.length, verifiedCount: results.length, marketplaces: results.reduce<Record<string, number>>((counts, listing) => { counts[listing.marketplace] = (counts[listing.marketplace] ?? 0) + 1; return counts; }, {}) });
  return results.slice(0, limit);
}
