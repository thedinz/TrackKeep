export function getAppBaseUrl(request: Request) {
  const configuredUrl = getConfiguredAppBaseUrl();

  if (configuredUrl) {
    return configuredUrl;
  }

  const forwardedBaseUrl = getForwardedBaseUrl(request.headers);

  if (forwardedBaseUrl) {
    return forwardedBaseUrl;
  }

  return new URL(request.url).origin;
}

export function getAppUrl(request: Request, path: string) {
  return new URL(path, getAppBaseUrl(request));
}

function getConfiguredAppBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  return configuredUrl ? normalizeBaseUrl(configuredUrl) : null;
}

function getForwardedBaseUrl(headers: Headers) {
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(headers.get("host"));

  if (!host) {
    return null;
  }

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const proto = forwardedProto || "http";

  return normalizeBaseUrl(`${proto}://${host}`);
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}
