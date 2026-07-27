import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActiveBashoId, getDisplayBashoId } from "@/lib/active-basho";
import { getSubstitutions, applySubstitution } from "@/lib/substitution";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getDisplayBashoId();

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (!bashoId) {
    return NextResponse.json({ substitutions: [], windowOpen: false, windowDay: null });
  }

  return NextResponse.json(getSubstitutions(getDb(), bashoId, userId));
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { tier, newRikishiId } = await request.json();

  if (!tier || !newRikishiId) {
    return NextResponse.json(
      { error: "tier and newRikishiId required" },
      { status: 400 }
    );
  }

  const bashoId = getActiveBashoId();
  if (!bashoId) {
    return NextResponse.json({ error: "No active basho" }, { status: 503 });
  }

  const failure = applySubstitution(getDb(), bashoId, session.userId, tier, newRikishiId);
  if (failure) {
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  return NextResponse.json({ success: true });
}
