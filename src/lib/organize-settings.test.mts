import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { loadOrganizeNamingSettings } from "./organize-settings.ts";

test("auto-syncs Lidarr naming when configured", async (t) => {
  await withStoredSettings(t, storedLidarrSettings, async (configDirectory) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        json: async () => ({
          artistFolderFormat: "{Artist CleanName}",
          colonReplacementFormat: 4,
          multiDiscTrackFormat:
            "{Artist CleanName} - {Album Type} - {Release Year} - {Album CleanTitle}/{medium:00}{track:00} - {Track CleanTitle}",
          replaceIllegalCharacters: true,
          standardTrackFormat:
            "{Artist CleanName} - {Album Type} - {Release Year} - {Album CleanTitle}/{medium:00}{track:00} - {Track CleanTitle}"
        }),
        ok: true,
        status: 200
      }) as Response;

    t.after(() => {
      globalThis.fetch = previousFetch;
    });

    const synced = await loadOrganizeNamingSettings({
      syncLidarr: true
    });
    const saved = JSON.parse(
      await readFile(
        path.join(configDirectory, "organize-settings.json"),
        "utf8"
      )
    ) as typeof storedLidarrSettings;

    assert.equal(
      synced.standardTrackFormat,
      "{Artist CleanName} - {Album Type} - {Release Year} - {Album CleanTitle}/{medium:00}{track:00} - {Track CleanTitle}"
    );
    assert.equal(saved.standardTrackFormat, synced.standardTrackFormat);
  });
});

test("keeps saved Lidarr naming when auto-sync fails", async (t) => {
  await withStoredSettings(t, storedLidarrSettings, async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Lidarr offline");
    };

    t.after(() => {
      globalThis.fetch = previousFetch;
    });

    const settings = await loadOrganizeNamingSettings({
      syncLidarr: true
    });

    assert.equal(settings.standardTrackFormat, "old/{track:00}");
  });
});

const storedLidarrSettings = {
  artistFolderFormat: "{Artist CleanName}",
  colonReplacementFormat: 4,
  lidarr: {
    apiKey: "abc123",
    baseUrl: "http://lidarr.local:8686"
  },
  mode: "lidarr",
  multiDiscTrackFormat: "old/{medium:00}{track:00}",
  replaceIllegalCharacters: true,
  standardTrackFormat: "old/{track:00}",
  updatedAt: new Date(0).toISOString(),
  version: 1
};

async function withStoredSettings(
  t: TestContext,
  settings: Record<string, unknown>,
  run: (configDirectory: string) => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-settings-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  await writeFile(
    path.join(configDirectory, "organize-settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8"
  );

  t.after(async () => {
    if (typeof previousConfigDirectory === "string") {
      process.env.SPOTIFYBU_CONFIG_DIR = previousConfigDirectory;
    } else {
      delete process.env.SPOTIFYBU_CONFIG_DIR;
    }

    await rm(configDirectory, {
      force: true,
      recursive: true
    });
  });

  await run(configDirectory);
}
