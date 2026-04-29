import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public endpoints
  if (pathname.startsWith("/api/auth") || pathname === "/api/basho") {
    return NextResponse.next();
  }

  // All other /api/* routes require a valid session cookie
  const sessionCookie = request.cookies.get("rikishi-session");
  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(sessionCookie.value));
    if (!parsed.userId || !parsed.name) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { error: "Invalid session" },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: ["/api/((?!auth).*)"],
};
