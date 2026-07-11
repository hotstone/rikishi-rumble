import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActiveBashoId } from "@/lib/active-basho";
import { getSessionFromRequest } from "@/lib/session";
import { stableWithDetails, savePicks } from "@/lib/stable";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getActiveBashoId();

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (!bashoId) {
    return NextResponse.json({ stable: [], basho: null });
  }

  const stable = stableWithDetails(getDb(), bashoId, userId);
  return NextResponse.json({ stable, basho: bashoId });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
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
