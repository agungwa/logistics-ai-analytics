import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware: cheap cookie presence check to bounce anonymous traffic to
 * /login early. Real session validation + RBAC happens in route handlers and
 * server components (Prisma cannot run on the edge runtime).
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("logistics_session");
  const { pathname } = req.nextUrl;

  if (!hasSession && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
