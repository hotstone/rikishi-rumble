import { NextRequest, NextResponse } from "next/server";
import { getActiveBashoId } from "@/lib/active-basho";
import { getWrestlers } from "@/lib/wrestlers";

export async function GET(request: NextRequest) {
  const tierParam = request.nextUrl.searchParams.get("tier");
  const dayParam = request.nextUrl.searchParams.get("day");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getActiveBashoId();

  if (!bashoId) {
    return NextResponse.json({ wrestlers: [], basho: null });
  }

  const wrestlers = getWrestlers(
    bashoId,
    tierParam ? parseInt(tierParam) : null,
    dayParam ? parseInt(dayParam) : null
  );

  return NextResponse.json({ wrestlers, basho: bashoId });
}
