import { NextRequest, NextResponse } from "next/server";
import { isAdmin, validatePin, updateUserPin, getConfig } from "@/lib/config";

export async function POST(request: NextRequest) {
  const { adminName, adminPin, targetUser, newPin } = await request.json();

  if (!adminName || !adminPin || !targetUser || !newPin) {
    return NextResponse.json(
      { error: "adminName, adminPin, targetUser, and newPin required" },
      { status: 400 }
    );
  }

  if (!validatePin(adminName, adminPin)) {
    return NextResponse.json({ error: "Invalid admin PIN" }, { status: 401 });
  }

  if (!isAdmin(adminName)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  if (!/^\d{4}$/.test(newPin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits" },
      { status: 400 }
    );
  }

  const config = getConfig();
  const target = config.users.find((u) => u.name === targetUser);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const success = updateUserPin(targetUser, newPin);
  if (!success) {
    return NextResponse.json({ error: "Failed to update PIN" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `PIN updated for ${targetUser}` });
}
