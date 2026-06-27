import { createHash } from "crypto";
import { getAppBaseUrl } from "./app-url";
import { shouldUseSecureCookies } from "./cookies";
import {
  OAUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  SESSION_COOKIE
} from "./session";

export function spotifyAuthRequestDiagnostics(request: Request) {
  const requestUrl = safeUrl(request.url);
  const headers = request.headers;

  return {
    appBaseUrl: getAppBaseUrl(request),
    cookies: spotifyAuthCookieDiagnostics(request),
    forwardedHost: headers.get("x-forwarded-host"),
    forwardedProto: headers.get("x-forwarded-proto"),
    host: headers.get("host"),
    nextPublicAppUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
    queryKeys: requestUrl ? Array.from(requestUrl.searchParams.keys()).sort() : [],
    requestOrigin: requestUrl?.origin,
    requestPath: requestUrl?.pathname,
    secureCookieOverride: secureCookieOverrideState(),
    secureCookies: shouldUseSecureCookies(request)
  };
}

export function spotifyAuthCookieDiagnostics(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name) => name.startsWith("spotifybu_"))
    .sort();
  const cookieNameSet = new Set(cookieNames);

  return {
    cookieHeaderPresent: Boolean(cookieHeader),
    oauthStateCookiePresent: cookieNameSet.has(OAUTH_STATE_COOKIE),
    pkceVerifierCookiePresent: cookieNameSet.has(PKCE_VERIFIER_COOKIE),
    sessionCookiePresent: cookieNameSet.has(SESSION_COOKIE),
    spotifybuCookieNames: cookieNames
  };
}

export function spotifyAuthValueFingerprint(value?: string | null) {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 16)
    : null;
}

function secureCookieOverrideState() {
  const configuredValue = process.env.SPOTIFYBU_SECURE_COOKIES?.trim();

  if (!configuredValue) {
    return "unset";
  }

  return configuredValue.toLowerCase();
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
