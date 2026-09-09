import { NextRequest, NextResponse } from "next/server";
import { getActiveBashoId } from "@/lib/active-basho";
import { syncBanzuke, syncAllDays, syncDay } from "@/lib/sync";
import { calculateScores } from "@/lib/scoring";
import { getSessionUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session || !session.admin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const { action, day } = await request.json();
  const bashoId = getActiveBashoId();
  if (!bashoId) {
    return NextResponse.json({ error: "No active basho" }, { status: 503 });
  }

  try {
    if (action === "banzuke") {
      const result = await syncBanzuke(bashoId);
      return NextResponse.json({
        success: true,
        message: `Synced ${result.count} wrestlers`,
      });
    }

    if (action === "day" && day) {
      const result = await syncDay(bashoId, day);
      calculateScores(bashoId);
      return NextResponse.json({
        success: true,
        message: `Day ${day}: ${result.bouts} bouts synced`,
        inProgress: result.inProgress,
      });
    }

    if (action === "all") {
      const result = await syncAllDays(bashoId);
      return NextResponse.json({
        success: true,
        message: `Synced ${result.synced} days, ${result.pending} pending`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
