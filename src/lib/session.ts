import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { SpotifyTokenSet } from "./spotify";

export const SESSION_COOKIE = "spotifybu_session";
export const OAUTH_STATE_COOKIE = "spotifybu_oauth_state";
export const PKCE_VERIFIER_COOKIE = "spotifybu_pkce_verifier";

const secureCookie = process.env.NODE_ENV === "production";
const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: secureCookie,
  path: "/"
};

export function randomUrlSafeString(size = 32) {
  return randomBytes(size).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function setOAuthCookies(
  response: NextResponse,
  state: string,
  verifier: string
) {
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    ...baseCookieOptions,
    maxAge: 10 * 60
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, verifier, {
    ...baseCookieOptions,
    maxAge: 10 * 60
  });
}

export function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    ...baseCookieOptions,
    maxAge: 0
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, "", {
    ...baseCookieOptions,
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
  tokenSet: SpotifyTokenSet
) {
  response.cookies.set(SESSION_COOKIE, encodeTokenSet(tokenSet), {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    ...baseCookieOptions,
    maxAge: 0
  });
}
