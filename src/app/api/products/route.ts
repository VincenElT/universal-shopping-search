import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_LIMIT = 50;

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
          orderBy: [{ sellerTrustScore: "desc" }, { price: "asc" }],
        },
      },
    });

    const normalizedQuery = query.toLowerCase();
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const scored = products.map((product) => {
      const name = product.name.toLowerCase();
      const brandName = (product.brand ?? "").toLowerCase();
      const categoryName = product.category.toLowerCase();
      const model = (product.modelNumber ?? "").toLowerCase();
      const haystack = `${name} ${brandName} ${categoryName} ${model}`;
      let score = tokens.length ? tokens.reduce((total, token) => total + (haystack.includes(token) ? 40 : 0), 0) : 1;
      if (name === normalizedQuery) score += 1000;
      else if (name.includes(normalizedQuery)) score += 500;
      if (brandName === normalizedQuery) score += 350;
      if (model === normalizedQuery) score += 400;
      if (categoryName === normalizedQuery) score += 250;
      return { product, score };
    }).filter(({ score }) => score > 0).sort((a, b) => {
      if (sort === "price") return (a.product.listings[0]?.price ?? Number.MAX_SAFE_INTEGER) - (b.product.listings[0]?.price ?? Number.MAX_SAFE_INTEGER);
      return b.score - a.score || (a.product.listings[0]?.price ?? Number.MAX_SAFE_INTEGER) - (b.product.listings[0]?.price ?? Number.MAX_SAFE_INTEGER);
    });

    const total = scored.length;
    const start = (page - 1) * limit;
    const results = scored.slice(start, start + limit).map(({ product, score }) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      modelNumber: product.modelNumber,
      score,
      listings: product.listings.map((listing) => ({
        id: listing.id,
        marketplace: listing.marketplace.name,
        marketplaceSlug: listing.marketplace.slug,
        price: listing.price,
        seller: listing.seller,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        soldCount: listing.soldCount,
        sellerTrustScore: listing.sellerTrustScore,
        url: listing.affiliateUrl ?? listing.productUrl,
        inStock: listing.inStock,
        lastCheckedAt: listing.lastCheckedAt,
      })),
    }));

    return NextResponse.json({ query, filters: { brand, category, marketplace, minPrice: hasMinPrice ? minPrice : null, maxPrice: hasMaxPrice ? maxPrice : null }, sort, page, limit, total, pages: Math.ceil(total / limit), results });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json({ error: "Unable to search products" }, { status: 500 });
  }
}
