const DEFAULT_ENDPOINT = "https://google.serper.dev/search";

export type SearchDiscoveryResult = {
  title: string;
  url: string;
  snippet?: string;
  marketplace?: string;
  marketplaceSlug?: string;
};

type SerperResponse = {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
};

const MARKETPLACES = [
  { slug: "shopee", name: "Shopee", hosts: ["shopee.co.id"] },
  { slug: "lazada", name: "Lazada", hosts: ["lazada.co.id"] },
  { slug: "tokopedia", name: "Tokopedia", hosts: ["tokopedia.com"] },
];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function detectMarketplace(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return MARKETPLACES.find((marketplace) =>
      marketplace.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    );
  } catch {
    return undefined;
  }
}

export async function discoverMarketplaceProducts(keyword: string, options?: { limit?: number }) {
  if (!keyword.trim()) throw new Error("Search keyword is required.");

  const apiKey = requiredEnv("SERPER_API_KEY");
  const endpoint = process.env.SERPER_API_URL || DEFAULT_ENDPOINT;
  const limit = Math.min(20, Math.max(1, options?.limit ?? 10));

  const query = `${keyword.trim()} (site:shopee.co.id OR site:lazada.co.id OR site:tokopedia.com)`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, gl: "id", hl: "id", num: limit }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);

  const payload = (await response.json()) as SerperResponse;
  return (payload.organic ?? [])
    .filter((item) => item.title && item.link)
    .map<SearchDiscoveryResult>((item) => {
      const marketplace = detectMarketplace(item.link!);
      return {
        title: item.title!,
        url: item.link!,
        snippet: item.snippet,
        marketplace: marketplace?.name,
        marketplaceSlug: marketplace?.slug,
      };
    })
    .filter((result) => result.marketplaceSlug);
}
