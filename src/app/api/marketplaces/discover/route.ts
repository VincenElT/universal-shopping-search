import { NextRequest, NextResponse } from "next/server";
import { discoverListings, matchDiscoveredListings } from "../../../../lib/search/serper";
import { prisma } from "../../../../lib/prisma";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

  if (!keyword) {
    return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });
  }

  try {
    const listings = await discoverListings(keyword, { limit });
    const candidates = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        modelNumber: true,
      },
    });

    const matchedListings = matchDiscoveredListings(listings, candidates);
    const counts = matchedListings.reduce(
      (summary, listing) => {
        summary[listing.match.status] += 1;
        return summary;
      },
      { match: 0, ambiguous: 0, new: 0 },
    );

    return NextResponse.json({
      keyword,
      count: matchedListings.length,
      counts,
      listings: matchedListings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search discovery failed.";
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
