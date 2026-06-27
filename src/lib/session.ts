import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "./cookies";
import type { SpotifyTokenSet } from "./spotify";

export const SESSION_COOKIE = "spotifybu_session";
export const OAUTH_STATE_COOKIE = "spotifybu_oauth_state";
export const PKCE_VERIFIER_COOKIE = "spotifybu_pkce_verifier";

type CookieRequest = Parameters<typeof shouldUseSecureCookies>[0];

function baseCookieOptions(request?: CookieRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(request),
    path: "/"
  };
}

export function randomUrlSafeString(size = 32) {
  return randomBytes(size).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function setOAuthCookies(
  response: NextResponse,
  state: string,
  verifier: string,
  request?: CookieRequest
) {
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    ...baseCookieOptions(request),
    maxAge: 10 * 60
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, verifier, {
    ...baseCookieOptions(request),
    maxAge: 10 * 60
  });
}

export function clearOAuthCookies(
  response: NextResponse,
  request?: CookieRequest
) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    ...baseCookieOptions(request),
    maxAge: 0
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, "", {
    ...baseCookieOptions(request),
    maxAge: 0
  });
}

export async function readOAuthCookies() {
  const cookieStore = await cookies();

  return {
    state: cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null,
    verifier: cookieStore.get(PKCE_VERIFIER_COOKIE)?.value ?? null
  };
}

export function encodeTokenSet(tokenSet: SpotifyTokenSet) {
  return Buffer.from(JSON.stringify(tokenSet), "utf8").toString("base64url");
}

export function decodeTokenSet(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<SpotifyTokenSet>;

    if (!parsed.access_token || typeof parsed.expires_at !== "number") {
      return null;
    }

    return parsed as SpotifyTokenSet;
  } catch {
    return null;
  }
}

export async function readTokenCookie() {
  const cookieStore = await cookies();
  return decodeTokenSet(cookieStore.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(
  response: NextResponse,
  tokenSet: SpotifyTokenSet,
  request?: CookieRequest
) {
  response.cookies.set(SESSION_COOKIE, encodeTokenSet(tokenSet), {
    ...baseCookieOptions(request),
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie(
  response: NextResponse,
  request?: CookieRequest
) {
  response.cookies.set(SESSION_COOKIE, "", {
    ...baseCookieOptions(request),
    maxAge: 0
  });
}
