import { NextRequest, NextResponse } from "next/server";
import { discoverListings } from "@/lib/search/serper";
import { ingestDiscoveredListings } from "@/lib/search/ingest";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "10")));

  if (!keyword) return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });

  const startedAt = Date.now();
  try {
    const discovered = await discoverListings(keyword, { limit });
    const discoveredByMarketplace = discovered.reduce<Record<string, number>>((counts, listing) => {
      counts[listing.marketplace] = (counts[listing.marketplace] ?? 0) + 1;
      return counts;
    }, {});
    console.log("[live-search] discovered", {
      keyword,
      provider: process.env.SEARCH_PROVIDER || "auto",
      count: discovered.length,
      byMarketplace: discoveredByMarketplace,
      priced: discovered.filter((listing) => listing.price != null).length,
      withSellerSignal: discovered.filter((listing) => listing.sellerTrustScore != null).length,
      samples: discovered.slice(0, 5).map((listing) => ({ marketplace: listing.marketplace, title: listing.title, price: listing.price, url: listing.url })),
    });

    const ingested = await ingestDiscoveredListings(discovered);
    console.log("[live-search] ingestion", {
      keyword,
      elapsedMs: Date.now() - startedAt,
      stats: ingested.stats,
      skippedReasons: ingested.results
        .filter((result) => result.status === "skipped")
        .map((result) => ("reason" in result ? result.reason : "unknown")),
    });
    return NextResponse.json({ keyword, ...ingested });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live search failed.";
    console.error("[live-search] failed", { keyword, elapsedMs: Date.now() - startedAt, message });
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
