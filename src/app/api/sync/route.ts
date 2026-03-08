import { NextRequest, NextResponse } from "next/server";
import { getConfig, isAdmin } from "@/lib/config";
import { syncBanzuke, syncAllDays, syncDay, calculateScores } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const { userName, action, day } = await request.json();

  if (!userName || !isAdmin(userName)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const config = getConfig();
  const bashoId = config.basho;

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
