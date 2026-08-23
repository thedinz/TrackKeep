import assert from "node:assert/strict";
import test from "node:test";
import { buildHomepageStats } from "./homepage-stats.ts";

test("buildHomepageStats separates fully backed-up playlists from playlists needing backup", () => {
  assert.deepEqual(
    buildHomepageStats(
      [
        { id: "one", tracksTotal: 10 },
        { id: "two", tracksTotal: 12 },
        { id: "three", tracksTotal: 4 }
      ],
      {
        one: {
          backedUp: true,
          missingTrackCount: 0,
          trackCount: 10
        },
        two: {
          backedUp: false,
          missingTrackCount: 2,
          trackCount: 12
        }
      },
      "2026-08-23T12:00:00.000Z"
    ),
    {
      fullyBackedUp: 1,
      needsBackup: 2,
      totalPlaylists: 3,
      updatedAt: "2026-08-23T12:00:00.000Z"
    }
  );
});

test("buildHomepageStats returns zeroes for an empty catalog", () => {
  assert.deepEqual(buildHomepageStats([], {}, null), {
    fullyBackedUp: 0,
    needsBackup: 0,
    totalPlaylists: 0,
    updatedAt: null
  });
});

test("buildHomepageStats treats tracks added after the saved snapshot as needing backup", () => {
  assert.deepEqual(
    buildHomepageStats(
      [{ id: "changed", tracksTotal: 11 }],
      {
        changed: {
          backedUp: true,
          missingTrackCount: 0,
          trackCount: 10
        }
      },
      "2026-08-23T12:00:00.000Z"
    ),
    {
      fullyBackedUp: 0,
      needsBackup: 1,
      totalPlaylists: 1,
      updatedAt: "2026-08-23T12:00:00.000Z"
    }
  );
});
