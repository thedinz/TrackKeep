import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { getTrackKeepEnvironmentValue } from "@/lib/trackkeep-env";

const appAuthCookie = "spotifybu_app_session";
const publicPaths = new Set([
  "/api/app-auth/login",
  "/api/app-auth/logout",
  "/api/app-auth/session",
  "/api/app-info",
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

  const cookieAuthenticated = await verifySessionCookie(
    request.cookies.get(appAuthCookie)?.value
  );
  const appAuthStatus = cookieAuthenticated
    ? null
    : await getAppAuthStatus(request);
  const authenticated =
    cookieAuthenticated ||
    appAuthStatus?.authMode === "external" ||
    Boolean(appAuthStatus?.authenticated);

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

async function verifySessionCookie(value?: string) {
  if (!value) {
    return false;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = await signPayload(payload);

  if (signature !== expectedSignature) {
    return false;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      exp?: number;
      u?: string;
    };

    return Boolean(
      parsed.u && parsed.exp && parsed.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

async function getAppAuthStatus(request: NextRequest) {
  try {
    const sessionUrl = getAppUrl(request, "/api/app-auth/session");
    const response = await fetch(sessionUrl, {
      cache: "no-store",
      headers: {
        cookie: request.headers.get("cookie") ?? ""
      }
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as {
      authenticated?: boolean;
      authMode?: string;
    };

    return {
      authenticated: Boolean(body.authenticated),
      authMode: body.authMode === "external" ? "external" : "internal"
    };
  } catch {
    return null;
  }
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAppAuthSecret()),
    {
      hash: "SHA-256",
      name: "HMAC"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return base64UrlEncode(signature);
}

function getAppAuthSecret() {
  return (
    getTrackKeepEnvironmentValue("APP_SECRET") ||
    "spotifybu-development-session-secret"
  );
}

function base64UrlEncode(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const paddedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const decodedValue = atob(
    paddedValue.padEnd(
      paddedValue.length + ((4 - (paddedValue.length % 4)) % 4),
      "="
    )
  );

  return decodedValue;
}
