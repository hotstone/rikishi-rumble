import { NextResponse } from "next/server";
import { getActiveBashoId } from "@/lib/active-basho";
import { getChampions } from "@/lib/champions";

export async function GET() {
  return NextResponse.json({ champions: getChampions(getActiveBashoId()) });
}
