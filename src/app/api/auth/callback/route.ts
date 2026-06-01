import { NextResponse } from "next/server";
import { clearOAuthCookies, readOAuthCookies, setSessionCookie } from "@/lib/session";
import { exchangeCodeForToken, getSpotifyRedirectUri } from "@/lib/spotify";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthCookies = await readOAuthCookies();

  if (error) {
    return redirectWithError(request, error);
  }

  if (!code || !state || !oauthCookies.state || !oauthCookies.verifier) {
    return redirectWithError(request, "missing_oauth_state");
  }

  if (state !== oauthCookies.state) {
    return redirectWithError(request, "oauth_state_mismatch");
  }

  try {
    const tokenSet = await exchangeCodeForToken({
      code,
      codeVerifier: oauthCookies.verifier,
      redirectUri: getSpotifyRedirectUri(request)
    });
    const response = NextResponse.redirect(new URL("/", request.url));
    setSessionCookie(response, tokenSet);
    clearOAuthCookies(response);

    return response;
  } catch {
    return redirectWithError(request, "token_exchange_failed");
  }
}

function redirectWithError(request: Request, error: string) {
  const response = NextResponse.redirect(
    new URL(`/?error=${encodeURIComponent(error)}`, request.url)
  );
  clearOAuthCookies(response);

  return response;
}
