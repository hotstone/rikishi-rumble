import { NextResponse } from "next/server";
import { currentOrNextBashoInfo, stableLockDate } from "@/lib/basho";
import { getActiveBasho } from "@/lib/db";

export async function GET() {
  const basho = getActiveBasho();
  const info = currentOrNextBashoInfo(basho?.id || null, basho?.start_date || null);
  const lockDate = basho ? stableLockDate(basho.id, basho.start_date) : null;

  return NextResponse.json({
    basho: basho?.id || null,
    startDate: basho?.start_date || null,
    stableLockDate: lockDate?.toISOString() || null,
    status: basho?.status || "upcoming",
    countdown: info.active ? null : {
      targetDate: info.countdownTarget?.toISOString() || null,
      bashoId: info.nextBashoId,
      bashoLabel: info.nextBashoLabel,
    },
  });
}
