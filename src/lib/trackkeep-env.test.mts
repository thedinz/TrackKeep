import assert from "node:assert/strict";
import test from "node:test";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env.ts";

test("uses legacy SpotifyBU environment values as fallbacks", () => {
  const previousTrackKeepValue = process.env.TRACKKEEP_APP_SECRET;
  const previousSpotifyBuValue = process.env.SPOTIFYBU_APP_SECRET;

  delete process.env.TRACKKEEP_APP_SECRET;
  process.env.SPOTIFYBU_APP_SECRET = "legacy-secret";

  try {
    assert.equal(getTrackKeepEnvironmentValue("APP_SECRET"), "legacy-secret");
  } finally {
    restoreEnvironmentValue("TRACKKEEP_APP_SECRET", previousTrackKeepValue);
    restoreEnvironmentValue("SPOTIFYBU_APP_SECRET", previousSpotifyBuValue);
  }
});

test("prefers TrackKeep environment values when both names are configured", () => {
  const previousTrackKeepValue = process.env.TRACKKEEP_APP_SECRET;
  const previousSpotifyBuValue = process.env.SPOTIFYBU_APP_SECRET;

  process.env.TRACKKEEP_APP_SECRET = "trackkeep-secret";
  process.env.SPOTIFYBU_APP_SECRET = "legacy-secret";

  try {
    assert.equal(getTrackKeepEnvironmentValue("APP_SECRET"), "trackkeep-secret");
  } finally {
    restoreEnvironmentValue("TRACKKEEP_APP_SECRET", previousTrackKeepValue);
    restoreEnvironmentValue("SPOTIFYBU_APP_SECRET", previousSpotifyBuValue);
  }
});

function restoreEnvironmentValue(name: string, value?: string) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
