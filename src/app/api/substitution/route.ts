import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActiveBashoId, getDisplayBashoId } from "@/lib/active-basho";
import { getSubstitutions, applySubstitution } from "@/lib/substitution";
import { getSessionUser } from "@/lib/auth";

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
    return NextResponse.json({ substitutions: [], windowOpen: false, windowDay: null });
  }

  return NextResponse.json(getSubstitutions(getDb(), bashoId, userId));
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
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
