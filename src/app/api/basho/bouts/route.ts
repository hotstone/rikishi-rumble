import { NextRequest, NextResponse } from "next/server";
import { getDisplayBashoId } from "@/lib/active-basho";
import { getBoutsPayload } from "@/lib/bouts";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Identity comes from the session, never from a query param.
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const bashoId =
    request.nextUrl.searchParams.get("basho") || getDisplayBashoId();

  if (!bashoId) {
    return NextResponse.json({ basho: null, currentDay: 0, syncedDays: [], boutsByDay: {} });
  }

  return NextResponse.json(getBoutsPayload(bashoId, session.userId));
}
