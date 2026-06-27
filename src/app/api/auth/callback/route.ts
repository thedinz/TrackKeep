import { NextResponse } from "next/server";
import {
  spotifyAuthRequestDiagnostics,
  spotifyAuthValueFingerprint
} from "@/lib/auth-diagnostics";
import { getAppUrl } from "@/lib/app-url";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import {
  clearOAuthCookies,
  encodeTokenSet,
  readOAuthCookies,
  setSessionCookie
} from "@/lib/session";
import { exchangeCodeForToken, getSpotifyRedirectUri } from "@/lib/spotify";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthCookies = await readOAuthCookies();
  const callbackDiagnostics = {
    error,
    hasCode: Boolean(code),
    hasStateCookie: Boolean(oauthCookies.state),
    hasStateParam: Boolean(state),
    hasVerifierCookie: Boolean(oauthCookies.verifier),
    request: spotifyAuthRequestDiagnostics(request),
    stateCookieFingerprint: spotifyAuthValueFingerprint(oauthCookies.state),
    stateParamFingerprint: spotifyAuthValueFingerprint(state)
  };

  await appendDiagnosticLog("spotify.auth.callback_received", callbackDiagnostics);

  if (error) {
    return redirectWithError(request, error);
  }

  if (!code || !state || !oauthCookies.state || !oauthCookies.verifier) {
    await appendDiagnosticLog("spotify.auth.missing_oauth_state", {
      ...callbackDiagnostics,
      redirectUri: getSpotifyRedirectUri(request)
    });

    return redirectWithError(request, "missing_oauth_state");
  }

  if (state !== oauthCookies.state) {
    await appendDiagnosticLog("spotify.auth.oauth_state_mismatch", {
      ...callbackDiagnostics,
      redirectUri: getSpotifyRedirectUri(request)
    });

    return redirectWithError(request, "oauth_state_mismatch");
  }

  try {
    const tokenSet = await exchangeCodeForToken({
      code,
      codeVerifier: oauthCookies.verifier,
      redirectUri: getSpotifyRedirectUri(request)
    });
    const response = NextResponse.redirect(getAppUrl(request, "/"));
    setSessionCookie(response, tokenSet, request);
    clearOAuthCookies(response, request);
    await appendDiagnosticLog("spotify.auth.callback_success", {
      hasRefreshToken: Boolean(tokenSet.refresh_token),
      redirectUri: getSpotifyRedirectUri(request),
      request: spotifyAuthRequestDiagnostics(request),
      sessionCookieEncodedLength: encodeTokenSet(tokenSet).length,
      stateFingerprint: spotifyAuthValueFingerprint(state),
      tokenExpiresAt: new Date(tokenSet.expires_at).toISOString()
    });

    return response;
  } catch (error) {
    await appendDiagnosticLog("spotify.auth.token_exchange_failed", {
      ...callbackDiagnostics,
      error: diagnosticError(error),
      redirectUri: getSpotifyRedirectUri(request)
    });

    return redirectWithError(request, "token_exchange_failed");
  }
}

function redirectWithError(request: Request, error: string) {
  const response = NextResponse.redirect(
    getAppUrl(request, `/?error=${encodeURIComponent(error)}`)
  );
  clearOAuthCookies(response, request);

  return response;
}
