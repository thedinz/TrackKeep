import type { NextResponse } from "next/server";
import { clearSessionCookie, readTokenCookie, setSessionCookie } from "./session";
import { refreshAccessToken, type SpotifyTokenSet } from "./spotify";

type SessionFound = {
  ok: true;
  refreshed: boolean;
  token: SpotifyTokenSet;
};

type SessionMissing = {
  clearSession?: boolean;
  message: string;
  ok: false;
  status: number;
};

export type SpotifySession = SessionFound | SessionMissing;

const refreshWindowMs = 90_000;

export async function getSpotifySession(): Promise<SpotifySession> {
  const token = await readTokenCookie();

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Connect Spotify before using this endpoint."
    };
  }

  if (Date.now() < token.expires_at - refreshWindowMs) {
    return {
      ok: true,
      refreshed: false,
      token
    };
  }

  try {
    return {
      ok: true,
      refreshed: true,
      token: await refreshAccessToken(token)
    };
  } catch {
    return {
      clearSession: true,
      ok: false,
      status: 401,
      message: "Spotify session expired. Reconnect Spotify to continue."
    };
  }
}

export function withSessionCookie<T extends NextResponse>(
  response: T,
  session: SpotifySession
) {
  if (session.ok && session.refreshed) {
    setSessionCookie(response, session.token);
  }

  if (!session.ok && session.clearSession) {
    clearSessionCookie(response);
  }

  return response;
}
