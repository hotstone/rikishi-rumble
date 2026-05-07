import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { currentOrNextBashoInfo } from "@/lib/basho";

export async function GET() {
  const config = getConfig();
  const db = getDb();

  const basho = db
    .prepare("SELECT id, start_date, status FROM basho WHERE id = ?")
    .get(config.basho) as { id: string; start_date: string | null; status: string } | undefined;

  const info = currentOrNextBashoInfo(config.basho, basho?.start_date || null);

  return NextResponse.json({
    basho: basho?.id || config.basho,
    startDate: basho?.start_date || null,
    stableLockDate: config.stableLockDate || null,
    status: basho?.status || "upcoming",
    countdown: info.active ? null : {
      targetDate: info.countdownTarget?.toISOString() || null,
      bashoId: info.nextBashoId,
      bashoLabel: info.nextBashoLabel,
    },
  });
}
