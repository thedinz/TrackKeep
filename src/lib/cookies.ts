import { getTrackKeepEnvironmentValue } from "./trackkeep-env";

type CookieRequest = Pick<Request, "headers" | "url">;

export function shouldUseSecureCookies(request?: CookieRequest) {
  const configuredValue = getTrackKeepEnvironmentValue("SECURE_COOKIES")
    ?.trim()
    .toLowerCase();

  if (configuredValue) {
    return ["1", "true", "yes", "on"].includes(configuredValue);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (appUrl) {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      return process.env.NODE_ENV === "production";
    }
  }

  const requestProtocol = request ? getRequestProtocol(request) : null;

  if (requestProtocol) {
    return requestProtocol === "https";
  }

  return process.env.NODE_ENV === "production";
}

function getRequestProtocol(request: CookieRequest) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));

  if (forwardedProto) {
    return forwardedProto.replace(/:$/, "").toLowerCase();
  }

  try {
    return new URL(request.url).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}
