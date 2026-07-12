import { NextRequest, NextResponse } from "next/server";
import { getActiveBashoId } from "@/lib/active-basho";
import { getLeaderboard } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getActiveBashoId();

  if (!bashoId) {
    return NextResponse.json({
      leaderboard: [],
      currentDay: 0,
      activeDay: 0,
      basho: null,
      hasPendingResults: false,
      hasUndecidedBouts: false,
    });
  }

  return NextResponse.json(getLeaderboard(bashoId));
}
