import { NextResponse } from "next/server";
import { currentOrNextBashoInfo, stableLockDate } from "@/lib/basho";
import { getDisplayBasho } from "@/lib/active-basho";
import { subWindowIntervals } from "@/lib/substitution";

export async function GET() {
  const basho = getDisplayBasho();
  // A completed basho is shown for its results, but the countdown should
  // point at the next basho — so treat it as "no active basho" here.
  const completed = basho?.status === "completed";
  const info = currentOrNextBashoInfo(
    completed ? null : basho?.id || null,
    basho?.start_date || null
  );
  const lockDate = basho ? stableLockDate(basho.id, basho.start_date) : null;

  // Absolute UTC timestamps for the nightly substitution windows, so clients
  // can render window state and countdowns with plain arithmetic.
  const subWindows = basho?.start_date
    ? subWindowIntervals(new Date(basho.start_date)).map((w) => ({
        opensAt: w.opensAt.toISOString(),
        closesAt: w.closesAt.toISOString(),
      }))
    : [];

  return NextResponse.json({
    basho: basho?.id || null,
    startDate: basho?.start_date || null,
    stableLockDate: lockDate?.toISOString() || null,
    status: basho?.status || "upcoming",
    subWindows,
    countdown: info.active ? null : {
      targetDate: info.countdownTarget?.toISOString() || null,
      bashoId: info.nextBashoId,
      bashoLabel: info.nextBashoLabel,
    },
  });
}
