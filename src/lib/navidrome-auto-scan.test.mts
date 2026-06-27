import assert from "node:assert/strict";
import test from "node:test";
import {
  nextNavidromeAutoScanRunAt,
  normalizeNavidromeAutoScanSettings
} from "./navidrome-auto-scan.ts";

test("normalizes auto scan time and timezone settings", () => {
  assert.deepEqual(
    normalizeNavidromeAutoScanSettings(
      {
        enabled: false,
        time: "03:00",
        timeZone: "UTC"
      },
      {
        enabled: true,
        time: "2:05",
        timeZone: "America/New_York"
      }
    ),
    {
      enabled: true,
      time: "02:05",
      timeZone: "America/New_York"
    }
  );
});

test("falls back when auto scan settings are invalid", () => {
  assert.deepEqual(
    normalizeNavidromeAutoScanSettings(
      {
        enabled: true,
        time: "03:00",
        timeZone: "UTC"
      },
      {
        enabled: "yes" as never,
        time: "26:99",
        timeZone: "Nope/NotAZone"
      }
    ),
    {
      enabled: true,
      time: "03:00",
      timeZone: "UTC"
    }
  );
});

test("schedules the next daily run in the configured timezone", () => {
  assert.equal(
    nextNavidromeAutoScanRunAt(
      "03:00",
      "America/New_York",
      new Date("2026-06-26T05:00:00.000Z")
    ).toISOString(),
    "2026-06-26T07:00:00.000Z"
  );

  assert.equal(
    nextNavidromeAutoScanRunAt(
      "03:00",
      "America/New_York",
      new Date("2026-06-26T08:00:00.000Z")
    ).toISOString(),
    "2026-06-27T07:00:00.000Z"
  );
});
