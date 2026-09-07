const BLOCKED_PATH_SEGMENTS = new Set([
  "search",
  "find",
  "category",
  "categories",
  "mall",
  "reviews",
  "review",
  "help",
  "login",
  "signup",
  "register",
  "cart",
  "checkout",
  "wishlist",
  "tag",
  "list",
  "collections",
]);

export function marketplaceFromUrl(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee";
  if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia";
  if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada";
  return host || "other";
}

export function normalizeProductUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function hasBlockedPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .some((segment) => BLOCKED_PATH_SEGMENTS.has(segment.toLowerCase()));
}

/**
 * Returns true only when the URL has enough marketplace-specific structure to
 * be treated as a direct product detail page. Search/category/store pages are
 * deliberately rejected even if a price was extracted from their snippet.
 */
export function isProductUrl(listing: { marketplace: string; url: string; price?: number | null }) {
  let parsed: URL;
  try {
    parsed = new URL(listing.url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  if (!segments.length || hasBlockedPath(path)) return false;

  if (listing.marketplace === "shopee") {
    // Shopee detail URLs contain both shop/item numeric IDs.
    return /-i\.\d+\.\d+$/.test(path);
  }

  if (listing.marketplace === "tokopedia") {
    // Tokopedia product pages are /<shop>/<product-slug>. Do not accept /search,
    // /find, store pages, or arbitrary two-segment URLs without a product price.
    if (segments.length !== 2) return false;
    return Boolean(listing.price != null && listing.price >= 1000);
  }

  if (listing.marketplace === "lazada") {
    // Lazada product detail URLs use /products/<slug>-i<numeric-id>.html.
    return /^\/products\/.+-i\d+\.html$/.test(path);
  }

  // Known Blibli-style product URLs use /p/<product-slug>/<product-id>.
  if (listing.marketplace === "blibli.com" || listing.marketplace === "blibli") {
    return /^\/p\/[^/]+\/[^/]+$/.test(path) || /^\/[^/]+\/p-[^/]+$/.test(path);
  }

  // Other retailers are accepted only when they expose a non-trivial product
  // path and a price. This is intentionally conservative; search/category
  // pages are blocked above and can never become stored product URLs.
  return segments.length >= 2 && listing.price != null && listing.price >= 1000;
}

export function isUsableDestinationUrl(url: string, marketplace: string, price?: number | null) {
  if (!url || url === "#") return false;
  return isProductUrl({ marketplace, url, price });
}
