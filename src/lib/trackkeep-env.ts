type TrackKeepEnvironmentSuffix =
  | "APP_SECRET"
  | "AUTH_MODE"
  | "CONFIG_DIR"
  | "DATABASE_PATH"
  | "PROVIDER_DOWNLOAD_TIMEOUT_MS"
  | "PROVIDER_SEARCH_TIMEOUT_MS"
  | "SECURE_COOKIES"
  | "YTDLP_JS_RUNTIME";

export function getTrackKeepEnvironmentValue(
  suffix: TrackKeepEnvironmentSuffix
) {
  const trackKeepValue = process.env[`TRACKKEEP_${suffix}`];

  if (trackKeepValue !== undefined) {
    return trackKeepValue;
  }

  return process.env[`SPOTIFYBU_${suffix}`];
}
