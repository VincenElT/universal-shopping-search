import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUsableDestinationUrl } from "@/lib/search/product-url";

/** Always return the canonical product URL discovered from the marketplace.
 * Affiliate/tracking URLs are deliberately ignored because they can be stale
 * or redirect to a search/category page instead of the exact listing.
 */
function destinationUrl(listing: { affiliateUrl: string | null; productUrl: string; marketplace: { slug: string }; price: number }) {
  return isUsableDestinationUrl(listing.productUrl, listing.marketplace.slug, listing.price) ? listing.productUrl : null;
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id },
      include: { listings: { include: { marketplace: true }, orderBy: [{ sellerTrustScore: "desc" }, { price: "asc" }] } },
    });

    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const listings = product.listings.flatMap((listing) => {
      const destination = destinationUrl(listing);
      return destination ? [{ listing, destination }] : [];
    });
    const prices = listings.map(({ listing }) => listing.price);
    const lowestPrice = prices.length ? Math.min(...prices) : null;
    const highestPrice = prices.length ? Math.max(...prices) : null;

    return NextResponse.json({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      modelNumber: product.modelNumber,
      imageUrl: product.imageUrl,
      lowestPrice,
      highestPrice,
      savings: lowestPrice !== null && highestPrice !== null ? highestPrice - lowestPrice : 0,
      listings: listings.map(({ listing, destination }) => ({
        id: listing.id,
        marketplace: listing.marketplace.name,
        marketplaceSlug: listing.marketplace.slug,
        title: listing.title,
        price: listing.price,
        seller: listing.seller,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        soldCount: listing.soldCount,
        sellerTrustScore: listing.sellerTrustScore,
        url: destination,
        inStock: listing.inStock,
        lastCheckedAt: listing.lastCheckedAt,
      })),
    });
  } catch (error) {
    console.error("Product detail failed:", error);
    return NextResponse.json({ error: "Unable to load product" }, { status: 500 });
  }
}
