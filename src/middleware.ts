import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public endpoints
  if (pathname.startsWith("/api/auth") || pathname === "/api/basho") {
    return NextResponse.next();
  }

  // All other /api/* routes require a valid signed session token
  if (!(await getSessionAccountId(request))) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/((?!auth).*)"],
};
