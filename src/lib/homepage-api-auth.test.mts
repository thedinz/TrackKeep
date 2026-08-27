import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  hasHomepageApiKey,
  isHomepageApiRequestAuthorized
} from "./homepage-api-auth.ts";

const originalTrackKeepKey = process.env.TRACKKEEP_HOMEPAGE_API_KEY;
const originalLegacyKey = process.env.SPOTIFYBU_HOMEPAGE_API_KEY;

afterEach(() => {
  restoreEnvironmentValue("TRACKKEEP_HOMEPAGE_API_KEY", originalTrackKeepKey);
  restoreEnvironmentValue("SPOTIFYBU_HOMEPAGE_API_KEY", originalLegacyKey);
});

test("Homepage API access stays disabled until a key is configured", () => {
  delete process.env.TRACKKEEP_HOMEPAGE_API_KEY;
  delete process.env.SPOTIFYBU_HOMEPAGE_API_KEY;

  assert.equal(hasHomepageApiKey(), false);
  assert.equal(
    isHomepageApiRequestAuthorized(
      new Request("http://trackkeep.test/api/homepage/stats", {
        headers: { "X-API-Key": "supplied-key" }
      })
    ),
    false
  );
});

test("Homepage API access requires the exact configured key", () => {
  process.env.TRACKKEEP_HOMEPAGE_API_KEY = "a-long-trackkeep-homepage-key";

  assert.equal(hasHomepageApiKey(), true);
  assert.equal(
    isHomepageApiRequestAuthorized(
      new Request("http://trackkeep.test/api/homepage/stats", {
        headers: { "X-API-Key": "a-long-trackkeep-homepage-key" }
      })
    ),
    true
  );
  assert.equal(
    isHomepageApiRequestAuthorized(
      new Request("http://trackkeep.test/api/homepage/stats", {
        headers: { "X-API-Key": "wrong-key" }
      })
    ),
    false
  );
});

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
