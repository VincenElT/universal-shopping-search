import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUsableDestinationUrl } from "@/lib/search/product-url";

const MAX_LIMIT = 50;

function popularityScore(soldCount: number | null) {
  if (soldCount == null || soldCount <= 0) return 0;
  return Math.round(Math.log10(soldCount + 1) * 100);
}

function listingScore(listing: {
  price: number;
  soldCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerTrustScore: number | null;
  inStock: boolean;
}) {
  const sales = popularityScore(listing.soldCount);
  const rating = listing.rating != null ? (Math.max(0, Math.min(5, listing.rating)) / 5) * 20 : 0;
  const reviews = listing.reviewCount != null ? Math.min(15, Math.log10(listing.reviewCount + 1) * 5) : 0;
  const trust = listing.sellerTrustScore != null ? Math.max(0, Math.min(100, listing.sellerTrustScore)) * 0.2 : 0;
  const stock = listing.inStock ? 25 : -100;
  return Math.round(sales + rating + reviews + trust + stock);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const query = params.get("q")?.trim() ?? "";
    const brand = params.get("brand")?.trim() ?? "";
    const category = params.get("category")?.trim() ?? "";
    const marketplace = params.get("marketplace")?.trim() ?? "";
    const sort = params.get("sort") === "price" ? "price" : "relevance";
    const minPriceParam = params.get("minPrice");
    const maxPriceParam = params.get("maxPrice");
    const minPrice = minPriceParam !== null && minPriceParam !== "" ? Number(minPriceParam) : null;
    const maxPrice = maxPriceParam !== null && maxPriceParam !== "" ? Number(maxPriceParam) : null;
    const hasMinPrice = minPrice !== null && Number.isFinite(minPrice);
    const hasMaxPrice = maxPrice !== null && Number.isFinite(maxPrice);
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(params.get("limit") ?? "12", 10) || 12));

    const products = await prisma.product.findMany({
      where: {
        ...(brand ? { brand: { equals: brand } } : {}),
        ...(category ? { category: { equals: category } } : {}),
        ...(marketplace || hasMinPrice || hasMaxPrice ? { listings: { some: {
          ...(marketplace ? { marketplace: { slug: marketplace } } : {}),
          ...(hasMinPrice ? { price: { gte: minPrice! } } : {}),
          ...(hasMaxPrice ? { price: { lte: maxPrice! } } : {}),
        } } } : {}),
      },
      include: {
        listings: {
          where: {
            ...(marketplace ? { marketplace: { slug: marketplace } } : {}),
            ...(hasMinPrice || hasMaxPrice ? { price: { ...(hasMinPrice ? { gte: minPrice! } : {}), ...(hasMaxPrice ? { lte: maxPrice! } : {}) } } : {}),
          },
          include: { marketplace: true },
        },
      },
    });

    const normalizedQuery = query.toLowerCase();
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const scored = products.map((product) => {
      const validListings = product.listings.filter((listing) => {
        const destination = listing.affiliateUrl && listing.affiliateUrl !== "#" ? listing.affiliateUrl : listing.productUrl;
        return isUsableDestinationUrl(destination, listing.marketplace.slug, listing.price);
      });
      const name = product.name.toLowerCase();
      const brandName = (product.brand ?? "").toLowerCase();
      const categoryName = product.category.toLowerCase();
      const model = (product.modelNumber ?? "").toLowerCase();
      const haystack = `${name} ${brandName} ${categoryName} ${model}`;
      const bestListing = validListings.reduce<{ listing: (typeof validListings)[number] | null; score: number }>((best, listing) => {
        const score = listingScore(listing);
        return score > best.score ? { listing, score } : best;
      }, { listing: null, score: 0 });
      const popularity = bestListing.score;
      let score = tokens.length ? tokens.reduce((total, token) => total + (haystack.includes(token) ? 40 : 0), 0) : 1;
      if (name === normalizedQuery) score += 1000;
      else if (name.includes(normalizedQuery)) score += 500;
      if (brandName === normalizedQuery) score += 350;
      if (model === normalizedQuery) score += 400;
      if (categoryName === normalizedQuery) score += 250;
      score += popularity;
      return { product, validListings, score };
    }).filter(({ validListings, score }) => validListings.length > 0 && score > 0).sort((a, b) => {
      if (sort === "price") {
        const aPrice = Math.min(...a.validListings.filter((listing) => listing.inStock).map((listing) => listing.price), Number.MAX_SAFE_INTEGER);
        const bPrice = Math.min(...b.validListings.filter((listing) => listing.inStock).map((listing) => listing.price), Number.MAX_SAFE_INTEGER);
        return aPrice - bPrice;
      }
      return b.score - a.score || (a.validListings[0]?.price ?? Number.MAX_SAFE_INTEGER) - (b.validListings[0]?.price ?? Number.MAX_SAFE_INTEGER);
    });

    const total = scored.length;
    const start = (page - 1) * limit;
    const results = scored.slice(start, start + limit).map(({ product, validListings, score }) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      modelNumber: product.modelNumber,
      score,
      listings: [...validListings]
        .map((listing) => {
          const destination = listing.affiliateUrl && listing.affiliateUrl !== "#" ? listing.affiliateUrl : listing.productUrl;
          return {
            id: listing.id,
            marketplace: listing.marketplace.name,
            marketplaceSlug: listing.marketplace.slug,
            price: listing.price,
            seller: listing.seller,
            rating: listing.rating,
            reviewCount: listing.reviewCount,
            soldCount: listing.soldCount,
            sellerTrustScore: listing.sellerTrustScore,
            listingScore: listingScore(listing),
            url: destination,
            inStock: listing.inStock,
            lastCheckedAt: listing.lastCheckedAt,
          };
        })
        .sort((a, b) => b.listingScore - a.listingScore || a.price - b.price),
    }));

    return NextResponse.json({ query, filters: { brand, category, marketplace, minPrice: hasMinPrice ? minPrice : null, maxPrice: hasMaxPrice ? maxPrice : null }, sort, page, limit, total, pages: Math.ceil(total / limit), results });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json({ error: "Unable to search products" }, { status: 500 });
  }
}
