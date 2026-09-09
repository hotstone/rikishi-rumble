import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActiveBashoId, getDisplayBashoId } from "@/lib/active-basho";
import { getSessionUser } from "@/lib/auth";
import { stableWithDetails, savePicks } from "@/lib/stable";

export async function GET(request: NextRequest) {
  // Identity comes from the session, never from a query param.
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.userId;
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getDisplayBashoId();

  if (!bashoId) {
    return NextResponse.json({ stable: [], basho: null });
  }

  const stable = stableWithDetails(getDb(), bashoId, userId);
  return NextResponse.json({ stable, basho: bashoId });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { picks } = await request.json();

  if (!picks) {
    return NextResponse.json({ error: "picks required" }, { status: 400 });
  }

  const bashoId = getActiveBashoId();
  if (!bashoId) {
    return NextResponse.json({ error: "No active basho" }, { status: 503 });
  }

  const failure = savePicks(getDb(), bashoId, session.userId, picks);
  if (failure) {
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  return NextResponse.json({ success: true });
}
