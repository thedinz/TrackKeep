import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  defaultOrganizeNamingSettings,
  loadOrganizeNamingSettings,
  updateOrganizeNamingSettings
} from "./organize-settings.ts";

test("uses standard naming by default", async (t) => {
  await withStoredSettings(t, null, async () => {
    const settings = await loadOrganizeNamingSettings();

    assert.deepEqual(settings, defaultOrganizeNamingSettings);
  });
});

test("legacy imported naming becomes standard defaults", async (t) => {
  await withStoredSettings(t, legacyImportedSettings, async () => {
    const settings = await loadOrganizeNamingSettings();

    assert.deepEqual(settings, defaultOrganizeNamingSettings);
  });
});

test("legacy default naming becomes standard defaults", async (t) => {
  await withStoredSettings(t, legacyDefaultSettings, async () => {
    const settings = await loadOrganizeNamingSettings();

    assert.equal(settings.mode, "standard");
    assert.equal(
      settings.standardTrackFormat,
      defaultOrganizeNamingSettings.standardTrackFormat
    );
  });
});

test("posted naming settings cannot switch away from standard defaults", async (t) => {
  await withStoredSettings(t, null, async () => {
    const settings = await updateOrganizeNamingSettings({
      artistFolderFormat: "{Artist CleanName}",
      colonReplacementFormat: 0,
      mode: "manual" as never,
      multiDiscTrackFormat: "old/{medium:00}{track:00}",
      replaceIllegalCharacters: false,
      standardTrackFormat: "old/{track:00}"
    });

    assert.deepEqual(settings, defaultOrganizeNamingSettings);
  });
});

const legacyImportedSettings = {
  artistFolderFormat: "{Artist CleanName}",
  colonReplacementFormat: 4,
  mode: "lidarr",
  multiDiscTrackFormat: "old/{medium:00}{track:00}",
  replaceIllegalCharacters: true,
  standardTrackFormat: "old/{track:00}",
  updatedAt: new Date(0).toISOString(),
  version: 1
};

const legacyDefaultSettings = {
  artistFolderFormat: "{Album Artist Name}",
  colonReplacementFormat: 4,
  mode: "spotifybu",
  multiDiscTrackFormat: "legacy",
  replaceIllegalCharacters: true,
  standardTrackFormat: "legacy",
  updatedAt: new Date(0).toISOString(),
  version: 1
};

async function withStoredSettings(
  t: TestContext,
  settings: Record<string, unknown> | null,
  run: (configDirectory: string) => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-settings-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  if (settings) {
    await writeFile(
      path.join(configDirectory, "organize-settings.json"),
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf8"
    );
  }

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
