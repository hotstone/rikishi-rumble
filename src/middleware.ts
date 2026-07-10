import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public endpoints
  if (pathname.startsWith("/api/auth") || pathname === "/api/basho") {
    return NextResponse.next();
  }

  // All other /api/* routes require a valid session cookie
  if (!getSessionFromRequest(request)) {
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
