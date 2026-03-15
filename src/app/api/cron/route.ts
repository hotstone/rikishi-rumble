import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { userName } = await request.json();

  if (userName !== "Matt") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { startCronJobs } = await import("@/lib/cron");
  startCronJobs();

  return NextResponse.json({ message: "CRON STARTED" });
}
