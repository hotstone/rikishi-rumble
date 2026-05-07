import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { bashoLabel } from "@/lib/basho";

const LEGENDARY_PLACEHOLDERS = [
  { name: "Hakuho", bashoLabel: "---" },
  { name: "Taiho", bashoLabel: "---" },
  { name: "Chiyonofuji", bashoLabel: "---" },
  { name: "Kitanoumi", bashoLabel: "---" },
  { name: "Asashoryu", bashoLabel: "---" },
  { name: "Takanohana", bashoLabel: "---" },
  { name: "Futabayama", bashoLabel: "---" },
  { name: "Raiden", bashoLabel: "---" },
];

export async function GET() {
  const config = getConfig();
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT ds.basho_id, ds.user_id, u.name,
              SUM(ds.points) as total_points, SUM(ds.kimboshi) as total_kimboshi
       FROM daily_scores ds
       JOIN users u ON u.id = ds.user_id
       WHERE ds.basho_id != ?
       GROUP BY ds.basho_id, ds.user_id
       ORDER BY ds.basho_id, total_points DESC, total_kimboshi DESC`
    )
    .all(config.basho) as {
    basho_id: string;
    user_id: string;
    name: string;
    total_points: number;
    total_kimboshi: number;
  }[];

  const champions: { name: string; bashoId: string; bashoLabel: string; points: number; kimboshi: number }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.basho_id)) continue;
    seen.add(row.basho_id);
    champions.push({
      name: row.name,
      bashoId: row.basho_id,
      bashoLabel: bashoLabel(row.basho_id),
      points: row.total_points,
      kimboshi: row.total_kimboshi,
    });
  }

  champions.sort((a, b) => b.points - a.points || b.kimboshi - a.kimboshi);

  const placeholders = LEGENDARY_PLACEHOLDERS
    .slice(0, Math.max(0, 8 - champions.length))
    .map((p) => ({ name: p.name, bashoId: "", bashoLabel: p.bashoLabel, points: 0, kimboshi: 0 }));

  return NextResponse.json({ champions: [...champions, ...placeholders] });
}
