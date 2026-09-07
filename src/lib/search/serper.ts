const DEFAULT_ENDPOINT = "https://google.serper.dev/search";

export type DiscoveredListing = {
  marketplace: "shopee" | "tokopedia" | "lazada" | "other";
  title: string;
  url: string;
  snippet?: string;
  position?: number;
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
  if (host.includes("shopee.co.id")) return "shopee";
  if (host.includes("tokopedia.com")) return "tokopedia";
  if (host.includes("lazada.co.id")) return "lazada";
  return "other";
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

  return responses
    .flatMap((response) => response.organic ?? [])
    .filter((result) => result.title && result.link)
    .map<DiscoveredListing>((result) => ({
      marketplace: marketplaceFromUrl(result.link!),
      title: result.title!,
      url: result.link!,
      snippet: result.snippet,
      position: result.position,
    }));
}
