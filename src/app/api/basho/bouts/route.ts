import { NextRequest, NextResponse } from "next/server";
import { getActiveBashoId } from "@/lib/active-basho";
import { getBoutsPayload } from "@/lib/bouts";

export async function GET(request: NextRequest) {
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getActiveBashoId();
  const requestingUserId = request.nextUrl.searchParams.get("userId") || null;

  if (!bashoId) {
    return NextResponse.json({ basho: null, currentDay: 0, syncedDays: [], boutsByDay: {} });
  }

  return NextResponse.json(getBoutsPayload(bashoId, requestingUserId));
}
