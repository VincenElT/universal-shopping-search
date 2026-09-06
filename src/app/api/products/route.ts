import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const products = await prisma.product.findMany({
    include: {
      listings: {
        include: { marketplace: true },
        orderBy: { price: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const normalizedQuery = query.toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const results = products
    .map((product) => {
      const haystack = `${product.name} ${product.brand ?? ""} ${product.category} ${product.modelNumber ?? ""}`.toLowerCase();
      let score = 0;

      if (!tokens.length) score = 1;
      else if (haystack.includes(normalizedQuery)) score = 100;
      else score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 20 : 0), 0);

      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.product.listings[0]?.price - b.product.listings[0]?.price)
    .map(({ product }) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      modelNumber: product.modelNumber,
      listings: product.listings.map((listing) => ({
        id: listing.id,
        marketplace: listing.marketplace.name,
        price: listing.price,
        seller: listing.seller,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        url: listing.affiliateUrl ?? listing.productUrl,
        inStock: listing.inStock,
        lastCheckedAt: listing.lastCheckedAt,
      })),
    }));

  return NextResponse.json({ query, count: results.length, results });
}
