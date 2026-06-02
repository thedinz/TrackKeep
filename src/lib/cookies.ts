export function shouldUseSecureCookies() {
  const configuredValue = process.env.SPOTIFYBU_SECURE_COOKIES?.trim().toLowerCase();

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

  return process.env.NODE_ENV === "production";
}
