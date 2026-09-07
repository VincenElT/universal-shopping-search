import { NextRequest, NextResponse } from "next/server";
import { discoverListings } from "@/lib/search/serper";
import { ingestDiscoveredListings } from "@/lib/search/ingest";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "10")));

  if (!keyword) return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });

  try {
    const discovered = await discoverListings(keyword, { limit });
    const ingested = await ingestDiscoveredListings(discovered);
    return NextResponse.json({ keyword, ...ingested });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live search failed.";
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
