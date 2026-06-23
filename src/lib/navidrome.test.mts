import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  matchNavidromeTracksWithIndex,
  planNavidromeAlbumFolders,
  readCurrentNavidromeLibraryIndex,
  scanNavidromeLibraryIndex,
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

test("standard matching finds indexed title variants but keeps Spotify naming canonical", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      id: "track-title-variant",
      isrc: "USABC1234567",
      name: "Spotify Title Variant"
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Example Record",
          albumArtist: "Example Artist",
          artist: "Example Artist",
          artists: ["Example Artist"],
          durationMs: 180_000,
          fileName:
            "Example Artist - Example Record (2026) - 01 - Local Title.mp3",
          isrc: "USABC1234567",
          mtimeMs: 0,
          relativeDirectory:
            "Example Artist/Example Artist - Example Record (2026)",
          relativePath:
            "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Local Title.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Local Title",
          trackNumber: 1
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Spotify Title Variant.mp3"
    );
  });
});

test("standard matching uses NaviClean path token normalization", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      album: "Ampersand Record",
      albumArtist: "Artist & Friend",
      albumId: "album-ampersand",
      artists: ["Artist & Friend"],
      id: "track-ampersand",
      isrc: "USABC7654321"
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Ampersand Record",
          albumArtist: "Artist and Friend",
          artist: "Artist and Friend",
          artists: ["Artist and Friend"],
          durationMs: 180_000,
          fileName:
            "Artist and Friend - Ampersand Record (2026) - 01 - Opening.mp3",
          isrc: "USABC7654321",
          mtimeMs: 0,
          relativeDirectory:
            "Artist and Friend/Artist and Friend - Ampersand Record (2026)",
          relativePath:
            "Artist and Friend/Artist and Friend - Ampersand Record (2026)/Artist and Friend - Ampersand Record (2026) - 01 - Opening.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Opening",
          trackNumber: 1
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, false);
    assert.equal(matches[0].expectedFolder, "Artist and Friend/Artist and Friend - Ampersand Record (2026)");
  });
});

test("standard matching accepts folders organized from indexed album variants", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      album: "Passion: Even So Come (Live)",
      albumArtist: "Passion",
      albumId: "album-passion",
      artists: ["Passion"],
      id: "track-passion",
      isrc: "USABC2345678"
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Passion - Even So Come (Live)",
          albumArtist: "Passion",
          artist: "Passion",
          artists: ["Passion"],
          durationMs: 180_000,
          fileName:
            "Passion - Passion - Even So Come (Live) (2015) - 01 - Opening.mp3",
          isrc: "USABC2345678",
          mtimeMs: 0,
          relativeDirectory:
            "Passion/Passion - Passion - Even So Come (Live) (2015)",
          relativePath:
            "Passion/Passion - Passion - Even So Come (Live) (2015)/Passion - Passion - Even So Come (Live) (2015) - 01 - Opening.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Opening",
          trackNumber: 1
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, false);
    assert.equal(
      matches[0].expectedFolder,
      "Passion/Passion - Passion - Even So Come (Live) (2015)"
    );
  });
});

test("matching finds repeated live album suffixes without marking files missing", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      album: "Live From Europe",
      albumArtist: "Kari Jobe Carnes, Cody Carnes",
      albumId: "album-live-from-europe",
      albumReleaseDate: "2024-08-16",
      artists: ["Kari Jobe Carnes", "Cody Carnes"],
      id: "track-firm-foundation",
      name: "Firm Foundation (He Won't) / Great Are You Lord - Live From Europe",
      trackNumber: 1
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Live From Europe",
          albumArtist: "Kari Jobe Carnes, Cody Carnes",
          artist: "Kari Jobe Carnes, Cody Carnes",
          artists: ["Kari Jobe Carnes", "Cody Carnes"],
          durationMs: 180_000,
          fileName:
            "Kari Jobe Carnes, Cody Carnes - Live From Europe (2024) - 01 - Firm Foundation (He Won't) + Great Are You Lord.mp3",
          mtimeMs: 0,
          relativeDirectory:
            "Kari Jobe Carnes, Cody Carnes/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024)",
          relativePath:
            "Kari Jobe Carnes, Cody Carnes/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024)/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024) - 01 - Firm Foundation (He Won't) + Great Are You Lord.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Firm Foundation (He Won't) / Great Are You Lord",
          trackNumber: 1
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Kari Jobe Carnes, Cody Carnes/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024)/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024) - 01 - Firm Foundation (He Won't) Great Are You Lord - Live From Europe.mp3"
    );
  });
});

test("library index parses standard folders when parent artist stripped trailing punctuation", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
    const relativePath =
      "Journey Worship Co/Journey Worship Co. - Come to the Lord (2021)/Journey Worship Co. - Come to the Lord (2021) - 01 - Come to the Lord.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));

    process.env.NAVIDROME_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.NAVIDROME_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.NAVIDROME_LIBRARY_PATH;
      }

      await rm(libraryPath, {
        force: true,
        recursive: true
      });
    });

    await mkdir(path.dirname(filePath), {
      recursive: true
    });
    await writeFile(filePath, "not real audio", "utf8");

    await scanNavidromeLibraryIndex();
    const index = await readCurrentNavidromeLibraryIndex();
    const track = index?.tracks[0];

    assert.equal(index?.tracks.length, 1);
    assert.equal(track?.albumArtist, "Journey Worship Co.");
    assert.equal(track?.album, "Come to the Lord");
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
