import { createHash, timingSafeEqual } from "crypto";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env";

export function hasHomepageApiKey() {
  return Boolean(getHomepageApiKey());
}

export function isHomepageApiRequestAuthorized(request: Request) {
  const configuredKey = getHomepageApiKey();
  const suppliedKey = request.headers.get("x-api-key")?.trim();

  if (!configuredKey || !suppliedKey) {
    return false;
  }

  return timingSafeEqual(hashKey(configuredKey), hashKey(suppliedKey));
}

function getHomepageApiKey() {
  return getTrackKeepEnvironmentValue("HOMEPAGE_API_KEY")?.trim() || null;
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest();
}
