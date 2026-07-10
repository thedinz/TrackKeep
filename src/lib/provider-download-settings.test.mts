import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  defaultProviderDownloadSettings,
  loadProviderDownloadSettings,
  normalizeProviderDownloadSettings,
  updateProviderDownloadSettings
} from "./provider-download-settings.ts";

test("uses Opus 192 by default", async (t) => {
  await withStoredSettings(t, null, async () => {
    const settings = await loadProviderDownloadSettings();

    assert.deepEqual(settings, {
      fallbackFormat: "mp3",
      mp3FallbackQuality: "320",
      opusQuality: "192"
    });
    assert.deepEqual(settings, defaultProviderDownloadSettings);
  });
});

test("saves selected Opus quality and fallback", async (t) => {
  await withStoredSettings(t, null, async () => {
    const settings = await updateProviderDownloadSettings({
      fallbackFormat: "none",
      mp3FallbackQuality: "256",
      opusQuality: "256"
    });

    assert.deepEqual(settings, {
      fallbackFormat: "none",
      mp3FallbackQuality: "256",
      opusQuality: "256"
    });
    assert.deepEqual(await loadProviderDownloadSettings(), settings);
  });
});

test("rejects unsupported provider download qualities", () => {
  assert.deepEqual(
    normalizeProviderDownloadSettings(
      {
        fallbackFormat: "mp3",
        mp3FallbackQuality: "320",
        opusQuality: "160"
      },
      {
        fallbackFormat: "wav" as never,
        mp3FallbackQuality: "128" as never,
        opusQuality: "320" as never
      }
    ),
    {
      fallbackFormat: "mp3",
      mp3FallbackQuality: "320",
      opusQuality: "160"
    }
  );
});

async function withStoredSettings(
  t: TestContext,
  settings: Record<string, unknown> | null,
  run: (configDirectory: string) => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-provider-download-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  if (settings) {
    await writeFile(
      path.join(configDirectory, "provider-download-settings.json"),
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
