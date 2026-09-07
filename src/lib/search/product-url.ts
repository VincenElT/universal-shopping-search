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

const BLOCKED_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "googleapis.com",
  "www.googleapis.com",
  "googleusercontent.com",
]);

export function marketplaceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "shopee.co.id" || host.endsWith(".shopee.co.id")) return "shopee";
    if (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) return "tokopedia";
    if (host === "lazada.co.id" || host.endsWith(".lazada.co.id")) return "lazada";
    if (host === "blibli.com" || host.endsWith(".blibli.com")) return "blibli.com";
    return host || "other";
  } catch {
    return "other";
  }
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

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return [...BLOCKED_HOSTS].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/**
 * Reject navigation/search pages while accepting the real product URL shapes
 * returned by marketplace search engines. This is intentionally less strict
 * than the previous validator: URL shape is evidence, not proof that a page
 * contains a product.
 */
export function isProductUrl(listing: { marketplace: string; url: string; price?: number | null }) {
  let parsed: URL;
  try {
    parsed = new URL(listing.url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (isBlockedHost(parsed.hostname)) return false;

  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  if (!segments.length || hasBlockedPath(path)) return false;

  if (listing.marketplace === "shopee") {
    // Current Shopee detail URLs normally contain the shop and item IDs.
    // Accept both the canonical -i.shopId.itemId form and valid-looking
    // product paths with an ID, since Google can surface alternate variants.
    return /-i\.\d+\.\d+$/.test(path) || /\/[^/]+-i\.\d+\.\d+(?:\/|$)/.test(path);
  }

  if (listing.marketplace === "tokopedia") {
    // Tokopedia product URLs are commonly /<shop>/<product-slug>, while some
    // links have extra routing segments. Keep only paths that look product-like
    // and have a price when the URL cannot otherwise be identified as a detail page.
    if (segments.length === 2) return true;
    return segments.length >= 2 && Boolean(listing.price != null && listing.price >= 1000);
  }

  if (listing.marketplace === "lazada") {
    return /^\/products\/.+-i\d+\.html$/.test(path) || /-i\d+\.html$/.test(path);
  }

  if (listing.marketplace === "blibli.com" || listing.marketplace === "blibli") {
    // Blibli commonly uses /p/<product-slug>, and Google may return a canonical
    // product URL without a second ID segment.
    return /^\/p\/[^/]+$/.test(path) || /^\/p\/[^/]+\/[^/]+$/.test(path) || /^\/[^/]+\/p-[^/]+$/.test(path);
  }

  // Other retailers: require a meaningful detail path and a price. This avoids
  // turning a generic retailer homepage into a store destination.
  return segments.length >= 2 && listing.price != null && listing.price >= 1000;
}

export function isUsableDestinationUrl(url: string, marketplace: string, price?: number | null) {
  if (!url || url === "#") return false;
  return isProductUrl({ marketplace, url, price });
}
