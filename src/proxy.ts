import { NextRequest, NextResponse } from "next/server";
import {
  APP_AUTH_COOKIE,
  getAppAuthMode,
  verifyAppSessionCookie
} from "@/lib/app-auth";
import { getAppUrl } from "@/lib/app-url";

const publicPaths = new Set([
  "/api/app-auth/login",
  "/api/app-auth/logout",
  "/api/app-auth/session",
  "/api/app-info",
  "/api/homepage/stats",
  "/api/providers",
  "/login"
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath =
    publicPaths.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg";
  const needsLoginRedirectCheck = pathname === "/login";

  if (isPublicPath && !needsLoginRedirectCheck) {
    return NextResponse.next();
  }

  const authenticated = await isRequestAuthenticated(request);

  if (needsLoginRedirectCheck && authenticated) {
    return NextResponse.redirect(getAppUrl(request, "/"));
  }

  if (isPublicPath) {
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Log in to TrackKeep before using this endpoint." },
      { status: 401 }
    );
  }

  const loginUrl = getAppUrl(request, "/login");
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};

// Proxy runs on the Node.js runtime, so auth is checked in-process. It must
// never be delegated to an HTTP request built from X-Forwarded-Host or Host,
// because those headers are client-controlled.
async function isRequestAuthenticated(request: NextRequest) {
  if (verifyAppSessionCookie(request.cookies.get(APP_AUTH_COOKIE)?.value)) {
    return true;
  }

  try {
    return (await getAppAuthMode()) === "external";
  } catch {
    return false;
  }
}
