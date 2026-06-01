import { NextResponse } from "next/server";
import {
  getSpotifyClientId,
  getSpotifyRedirectUri,
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_SCOPES
} from "@/lib/spotify";
import {
  pkceChallenge,
  randomUrlSafeString,
  setOAuthCookies
} from "@/lib/session";

export async function GET(request: Request) {
  let clientId: string;

  try {
    clientId = getSpotifyClientId();
  } catch {
    return NextResponse.redirect(new URL("/?error=missing_spotify_client_id", request.url));
  }

  const verifier = randomUrlSafeString(64);
  const state = randomUrlSafeString(24);
  const redirectUri = getSpotifyRedirectUri(request);
  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SPOTIFY_SCOPES.join(" "),
    state
  });

  const response = NextResponse.redirect(
    `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`
  );
  setOAuthCookies(response, state, verifier);

  return response;
}
