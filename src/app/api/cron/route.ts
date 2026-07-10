import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || !session.admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { startCronJobs } = await import("@/lib/cron");
  startCronJobs();

  return NextResponse.json({ message: "CRON STARTED" });
}
