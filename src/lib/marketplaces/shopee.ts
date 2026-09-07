import crypto from "node:crypto";

const DEFAULT_ENDPOINT = "https://open-api.affiliate.shopee.co.id/graphql";

export type ShopeeOffer = {
  productId: string;
  title: string;
  price: number;
  seller?: string;
  rating?: number;
  productUrl?: string;
  affiliateUrl?: string;
  inStock: boolean;
};

type ShopeeResponse = {
  data?: {
    productOfferV2?: {
      nodes?: Array<{
        productId?: string | number;
        productName?: string;
        price?: number | string;
        shopName?: string;
        ratingStar?: number | string;
        productLink?: string;
        offerLink?: string;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function buildQuery(keyword: string, page: number, limit: number) {
  const escapedKeyword = JSON.stringify(keyword);
  return `query { productOfferV2(keyword: ${escapedKeyword}, sortType: 1, page: ${page}, limit: ${limit}) { nodes { productId productName price shopName ratingStar productLink offerLink } } }`;
}

function signPayload(appId: string, timestamp: number, body: string, secret: string) {
  return crypto.createHash("sha256").update(`${appId}${timestamp}${body}${secret}`).digest("hex");
}

export async function searchShopeeOffers(keyword: string, options?: { page?: number; limit?: number }) {
  if (!keyword.trim()) throw new Error("Shopee search keyword is required.");

  const appId = requiredEnv("SHOPEE_APP_ID");
  const secret = requiredEnv("SHOPEE_APP_SECRET");
  const endpoint = process.env.SHOPEE_AFFILIATE_API_URL || DEFAULT_ENDPOINT;
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));

  const body = JSON.stringify({ query: buildQuery(keyword.trim(), page, limit) });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(appId, timestamp, body, secret);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopee API returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ShopeeResponse;
  if (payload.errors?.length) {
    throw new Error(`Shopee API error: ${payload.errors[0]?.message || "Unknown error"}`);
  }

  return (payload.data?.productOfferV2?.nodes ?? [])
    .filter((item) => item.productId && item.productName && Number.isFinite(Number(item.price)))
    .map<ShopeeOffer>((item) => ({
      productId: String(item.productId),
      title: String(item.productName),
      price: Math.round(Number(item.price)),
      seller: item.shopName || undefined,
      rating: item.ratingStar == null ? undefined : Number(item.ratingStar),
      productUrl: item.productLink || undefined,
      affiliateUrl: item.offerLink || undefined,
      inStock: true,
    }));
}
