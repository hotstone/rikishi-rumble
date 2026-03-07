import { NextRequest, NextResponse } from "next/server";
import { validatePin, isAdmin, getConfig } from "@/lib/config";

export async function POST(request: NextRequest) {
  const { name, pin } = await request.json();

  if (!name || !pin) {
    return NextResponse.json(
      { error: "Name and PIN required" },
      { status: 400 }
    );
  }

  if (!validatePin(name, pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const userId = name.toLowerCase().replace(/\s+/g, "-");

  return NextResponse.json({
    userId,
    name,
    admin: isAdmin(name),
  });
}

export async function GET() {
  const config = getConfig();
  const users = config.users.map((u) => ({
    name: u.name,
    id: u.name.toLowerCase().replace(/\s+/g, "-"),
  }));
  return NextResponse.json({ users });
}
