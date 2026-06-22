import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  matchNavidromeTracksWithIndex,
  planNavidromeAlbumFolders,
  type NavidromeLibraryIndex
} from "./navidrome.ts";
import type { BackupTrack } from "./spotify.ts";

test("standard album folder uses artist album year layout", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const [plan] = await planNavidromeAlbumFolders([exampleTrack]);

    assert.equal(
      plan.relativePath,
      "Example Artist/Example Artist - Example Record (2026)"
    );
    assert.equal(
      plan.albumFolderName,
      "Example Artist - Example Record (2026)"
    );
  });
});

test("standard album folder uses Unknown Year when metadata is missing", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const [plan] = await planNavidromeAlbumFolders([
      {
        ...exampleTrack,
        albumReleaseDate: undefined
      }
    ]);

    assert.equal(
      plan.relativePath,
      "Example Artist/Example Artist - Example Record (Unknown Year)"
    );
  });
});

test("standard matching accepts compatible folders with a different release year", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const matches = await matchNavidromeTracksWithIndex([exampleTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Example Record",
          albumArtist: "Example Artist",
          artist: "Example Artist",
          artists: ["Example Artist"],
          fileName: "Example Artist - Example Record (2025) - 01 - Opening.mp3",
          mtimeMs: 0,
          relativeDirectory:
            "Example Artist/Example Artist - Example Record (2025)",
          relativePath:
            "Example Artist/Example Artist - Example Record (2025)/Example Artist - Example Record (2025) - 01 - Opening.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Opening"
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, false);
    assert.equal(
      matches[0].expectedFolder,
      "Example Artist/Example Artist - Example Record (2025)"
    );
  });
});

test("manual templates keep meaningful album type tokens when requested", async (t) => {
  await withOrganizeSettings(t, manualNamingSettings, async () => {
    const [plan] = await planNavidromeAlbumFolders([
      {
        ...exampleTrack,
        album: "Example EP",
        albumId: "album-ep",
        albumTracksTotal: 5,
        albumType: "single"
      }
    ]);

    assert.equal(
      plan.relativePath,
      "Example Artist/Example Artist - EP - 2026 - Example EP"
    );
  });
});

test("manual templates omit unknown album type tokens cleanly", async (t) => {
  await withOrganizeSettings(t, manualNamingSettings, async () => {
    const [plan] = await planNavidromeAlbumFolders([
      {
        ...exampleTrack,
        albumType: undefined
      }
    ]);

    assert.equal(
      plan.relativePath,
      "Example Artist/Example Artist - 2026 - Example Record"
    );
    assert.equal(plan.albumFolderName.includes(" - - "), false);
  });
});

const exampleTrack = {
  album: "Example Record",
  albumArtist: "Example Artist",
  albumArtistIds: [],
  albumId: "album-1",
  albumReleaseDate: "2026-02-03",
  albumTracksTotal: 10,
  albumType: "album",
  artists: ["Example Artist"],
  artistIds: [],
  discNumber: 1,
  durationMs: 180_000,
  explicit: false,
  id: "track-1",
  name: "Opening",
  position: 1,
  trackNumber: 1
} satisfies BackupTrack;

const manualNamingSettings = {
  artistFolderFormat: "{Artist CleanName}{ (Artist Disambiguation)}",
  colonReplacementFormat: 4,
  mode: "manual",
  multiDiscTrackFormat:
    "{Artist CleanName} - {Album Type} - {Release Year} - {Album CleanTitle}/{medium:00}{track:00} - {Track CleanTitle}",
  replaceIllegalCharacters: true,
  standardTrackFormat:
    "{Artist CleanName} - {Album Type} - {Release Year} - {Album CleanTitle}/{medium:00}{track:00} - {Track CleanTitle}",
  updatedAt: new Date(0).toISOString(),
  version: 1
};

async function withDefaultOrganizeSettings(
  t: TestContext,
  run: () => Promise<void>
) {
  await withOrganizeSettings(t, null, run);
}

async function withOrganizeSettings(
  t: TestContext,
  settings: Record<string, unknown> | null,
  run: () => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-organize-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  delete process.env.NAVIDROME_LIBRARY_PATH;

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

    if (typeof previousLibraryPath === "string") {
      process.env.NAVIDROME_LIBRARY_PATH = previousLibraryPath;
    } else {
      delete process.env.NAVIDROME_LIBRARY_PATH;
    }

    await rm(configDirectory, {
      force: true,
      recursive: true
    });
  });

  await run();
}
