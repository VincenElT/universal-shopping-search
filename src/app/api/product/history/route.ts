import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        listings: {
          include: {
            marketplace: { select: { name: true, slug: true } },
            priceHistory: { orderBy: { observedAt: "asc" } },
          },
          orderBy: { price: "asc" },
        },
      },
    });

    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({
      product: { id: product.id, name: product.name },
      history: product.listings.flatMap((listing) =>
        listing.priceHistory.map((snapshot) => ({
          listingId: listing.id,
          marketplace: listing.marketplace.name,
          marketplaceSlug: listing.marketplace.slug,
          price: snapshot.price,
          inStock: snapshot.inStock,
          observedAt: snapshot.observedAt,
        })),
      ).sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()),
    });
  } catch (error) {
    console.error("Price history failed:", error);
    return NextResponse.json({ error: "Unable to load price history" }, { status: 500 });
  }
}
