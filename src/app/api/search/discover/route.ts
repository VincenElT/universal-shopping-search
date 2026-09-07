import { NextRequest, NextResponse } from "next/server";
import { discoverMarketplaceProducts } from "../../../../lib/search-discovery";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

  if (!keyword) {
    return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });
  }

  try {
    const results = await discoverMarketplaceProducts(keyword, { limit });
    return NextResponse.json({ keyword, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search discovery failed.";
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
