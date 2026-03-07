import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const tier = request.nextUrl.searchParams.get("tier");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getConfig().basho;

  const db = getDb();

  let query = "SELECT id, name, rank, tier FROM rikishi_cache WHERE basho_id = ?";
  const params: (string | number)[] = [bashoId];

  if (tier) {
    query += " AND tier = ?";
    params.push(parseInt(tier));
  }

  query += " ORDER BY tier, rank";

  const wrestlers = db.prepare(query).all(...params);

  return NextResponse.json({ wrestlers, basho: bashoId });
}
