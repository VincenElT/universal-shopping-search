import { NextRequest, NextResponse } from "next/server";
import { searchShopeeOffers } from "../../../../../lib/marketplaces/shopee";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");

  if (!keyword) {
    return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });
  }

  try {
    const offers = await searchShopeeOffers(keyword, { page, limit });
    return NextResponse.json({ marketplace: "shopee", keyword, offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopee request failed.";
    const status = message.includes("is not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
