import type { DiscoveredListing } from "./serper";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: GroundingChunk[];
      groundingSupports?: unknown[];
      webSearchQueries?: string[];
      searchEntryPoint?: { renderedContent?: string };
    };
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  error?: { message?: string; status?: string; code?: number };
};
type GeminiListing = {
  title?: string;
  url?: string | null;
  price?: number | string | null;
  seller?: string | null;
  rating?: number | string | null;
  reviewCount?: number | string | null;
  soldCount?: number | string | null;
  sourceIndex?: number | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function parseMoney(value: GeminiListing["price"]) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (!value) return null;
  const match = String(value).match(/[0-9][0-9.,]*/);
  if (!match) return null;
  const number = Number(match[0].replace(/[^0-9]/g, ""));
  return Number.isFinite(number) && number >= 1000 && number <= 100_000_000 ? number : null;
}

function parseCount(value: GeminiListing["reviewCount"] | GeminiListing["soldCount"]) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (!value) return null;
  const match = String(value).toLowerCase().replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*([km]?)/);
  if (!match) return null;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  const number = Number(match[1]) * multiplier;
  return Number.isFinite(number) ? Math.round(number) : null;
}

function marketplaceFromUrl(url: string): DiscoveredListing["marketplace"] {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee";
    if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia";
    if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada";
    if (host === "google.com" || host.endsWith(".google.com") || host.endsWith(".googleapis.com") || host.endsWith("googleusercontent.com")) return "other";
    return host;
  } catch {}
  return "other";
}

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function sellerScore(rating: number | null, reviews: number | null, sold: number | null) {
  if (rating == null && reviews == null && sold == null) return null;
  const ratingScore = rating == null ? 0 : Math.min(5, Math.max(0, rating)) / 5 * 55;
  const reviewScore = reviews == null ? 0 : Math.min(1, Math.log10(Math.max(1, reviews)) / 5) * 25;
  const soldScore = sold == null ? 0 : Math.min(1, Math.log10(Math.max(1, sold)) / 5) * 20;
  return Math.round(ratingScore + reviewScore + soldScore);
}

function extractJson(text: string): GeminiListing[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function marketplaceUrlFromText(text: string) {
  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return urls.find((url) => marketplaceFromUrl(url) !== "other");
}

function bestGroundingUrl(item: GeminiListing, chunks: GroundingChunk[]) {
  if (item.url) return item.url;
  const indexed = item.sourceIndex != null ? chunks[item.sourceIndex]?.web : undefined;
  if (indexed?.uri && marketplaceFromUrl(indexed.uri) !== "other") return indexed.uri;
  return undefined;
}

async function requestGemini(apiKey: string, keyword: string, limit: number) {
  const prompt = `You are a product research agent. You MUST use Google Search for this request; do not answer from memory and do not restrict the search to specific domains.

Search the entire public web for current real purchasable product listings in Indonesia for the exact product: "${keyword}".

Use Google Search broadly. Look for marketplaces, retailers, specialty stores, manufacturer stores, distributors, and other ecommerce sites. Do NOT limit the search to Shopee, Tokopedia, Lazada, or any predefined website. Prioritize actual product/detail pages over category pages, search pages, articles, reviews, or generic homepages.

Return up to ${limit} of the strongest verified listings you can find across the web. For every listing, extract the exact listing title, current price in IDR if shown, seller/store if shown, rating/review/sold counts if shown, and the actual product-page URL. Do not invent or estimate missing values; use null when unavailable.

Only include listings supported by the Google Search results. Return ONLY a JSON array with objects containing: title, url, price, seller, rating, reviewCount, soldCount, sourceIndex. sourceIndex is the zero-based index of the supporting grounded web source. Do not return markdown or explanatory text.`;

  console.log("[gemini-debug] request", { endpoint: GEMINI_ENDPOINT, keyword, limit, hasApiKey: Boolean(apiKey) });
  const startedAt = Date.now();
  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
      cache: "no-store",
    });
    console.log("[gemini-debug] http", { status: response.status, ok: response.ok, elapsedMs: Date.now() - startedAt });
    const data = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      const detail = data.error?.message ? ` ${data.error.message}` : "";
      throw new Error(`Gemini API returned HTTP ${response.status}.${detail}`);
    }
    return data;
  } catch (error) {
    console.error("[gemini-debug] request failed", { elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function discoverListingsWithGemini(keyword: string, options?: { limit?: number }) {
  const trimmed = keyword.trim();
  if (!trimmed) throw new Error("Search keyword is required.");
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const limit = Math.min(20, Math.max(1, options?.limit ?? 10));
  const data = await requestGemini(apiKey, trimmed, limit);
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const metadata = candidate?.groundingMetadata;
  const chunks = metadata?.groundingChunks ?? [];
  const parsedListings = extractJson(text);

  console.log("[gemini-debug] response", {
    candidateCount: data.candidates?.length ?? 0,
    finishReason: candidate?.finishReason ?? null,
    promptBlockReason: data.promptFeedback?.blockReason ?? null,
    promptBlockReasonMessage: data.promptFeedback?.blockReasonMessage ?? null,
    textLength: text.length,
    textPreview: text.slice(0, 4000),
    parsedCount: parsedListings.length,
    groundingChunkCount: chunks.length,
    groundingSupportCount: metadata?.groundingSupports?.length ?? 0,
    webSearchQueries: metadata?.webSearchQueries ?? [],
    hasSearchEntryPoint: Boolean(metadata?.searchEntryPoint),
    groundingChunks: chunks.map((chunk, index) => ({ index, title: chunk.web?.title ?? null, uri: chunk.web?.uri ?? null, marketplace: chunk.web?.uri ? marketplaceFromUrl(chunk.web.uri) : "other" })),
  });

  const textUrl = marketplaceUrlFromText(text);
  const seen = new Set<string>();
  return parsedListings.flatMap((item): DiscoveredListing[] => {
    const rawUrl = bestGroundingUrl(item, chunks) ?? textUrl;
    if (!rawUrl || !item.title) return [];
    let url: string;
    try { url = normalizeUrl(rawUrl); } catch { return []; }
    const marketplace = marketplaceFromUrl(url);
    if (marketplace === "other") return [];
    const key = `${marketplace}:${url}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const rating = item.rating == null ? null : Number(item.rating);
    const reviewCount = parseCount(item.reviewCount);
    const soldCount = parseCount(item.soldCount);
    const safeRating = Number.isFinite(rating ?? NaN) ? rating : null;
    return [{ marketplace, title: item.title, url, price: parseMoney(item.price), seller: item.seller ?? null, rating: safeRating, reviewCount, soldCount, sellerTrustScore: sellerScore(safeRating, reviewCount, soldCount) }];
  }).filter((listing) => listing.price !== null || listing.sellerTrustScore !== null);
}
