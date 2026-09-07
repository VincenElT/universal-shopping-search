import { NextRequest, NextResponse } from "next/server";
import { discoverListings } from "../../../../../lib/search/serper";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

  if (!keyword) {
    return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });
  }

  try {
    const listings = await discoverListings(keyword, { limit });
    return NextResponse.json({ keyword, count: listings.length, listings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search discovery failed.";
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
