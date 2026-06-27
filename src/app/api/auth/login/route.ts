import { NextResponse } from "next/server";
import {
  spotifyAuthRequestDiagnostics,
  spotifyAuthValueFingerprint
} from "@/lib/auth-diagnostics";
import { getAppUrl } from "@/lib/app-url";
import { appendDiagnosticLog } from "@/lib/diagnostics";
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
    await appendDiagnosticLog("spotify.auth.login_missing_client_id", {
      request: spotifyAuthRequestDiagnostics(request)
    });

    return NextResponse.redirect(
      getAppUrl(request, "/?error=missing_spotify_client_id")
    );
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
  setOAuthCookies(response, state, verifier, request);
  await appendDiagnosticLog("spotify.auth.login_start", {
    cookieNamesSet: ["spotifybu_oauth_state", "spotifybu_pkce_verifier"],
    redirectUri,
    request: spotifyAuthRequestDiagnostics(request),
    stateFingerprint: spotifyAuthValueFingerprint(state)
  });

  return response;
}
