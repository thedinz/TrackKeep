import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  matchNavidromeTracksWithIndex,
  planNavidromeAlbumFolders,
  type NavidromeLibraryIndex
} from "./navidrome.ts";
import type { BackupTrack } from "./spotify.ts";

test("SpotifyBU default album folder omits the literal album type", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const [plan] = await planNavidromeAlbumFolders([exampleTrack]);

    assert.equal(
      plan.relativePath,
      "Example Artist/Example Artist - 2026 - Example Record"
    );
    assert.equal(plan.albumFolderName, "Example Artist - 2026 - Example Record");
    assert.equal(plan.albumFolderName.includes(" - Album - "), false);
  });
});

test("SpotifyBU recognizes its album-type-free folder layout", async (t) => {
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
          fileName: "0101 - Opening.mp3",
          mtimeMs: 0,
          relativeDirectory:
            "Example Artist/Example Artist - 2026 - Example Record",
          relativePath:
            "Example Artist/Example Artist - 2026 - Example Record/0101 - Opening.mp3",
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
      "Example Artist/Example Artist - 2026 - Example Record"
    );
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

async function withDefaultOrganizeSettings(
  t: TestContext,
  run: () => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-organize-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  delete process.env.NAVIDROME_LIBRARY_PATH;

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
