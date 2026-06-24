import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  buildNaviCleanCanonicalTargets,
  getNaviCleanTargetConflicts,
  matchNavidromeTracksWithIndex,
  planNavidromeAlbumFolders,
  readCurrentNavidromeLibraryIndex,
  resolveNaviCleanTargetConflict,
  scanNavidromeLibraryIndex,
  type NavidromeLibraryIndex
} from "./navidrome.ts";
import type { BackupTrack } from "./spotify.ts";

const nodeSqliteAvailable = await import("node:sqlite")
  .then(() => true)
  .catch(() => false);

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

test("standard matching keeps Spotify year canonical when local year differs", async (t) => {
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
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].expectedFolder,
      "Example Artist/Example Artist - Example Record (2026)"
    );
    assert.equal(
      matches[0].recommendedRelativePath,
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Opening.mp3"
    );
  });
});

test("NaviClean targets use saved Spotify metadata for matched files", {
  skip: nodeSqliteAvailable ? false : "node:sqlite is not available in this Node runtime"
}, async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-naviclean-")
    );
    const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
    const sourceRelativePath =
      "Example Artist/Example Artist - Example Record (2025)/Example Artist - Example Record (2025) - 01 - Opening.mp3";

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

    await mkdir(path.join(libraryPath, ".spotifybu"), {
      recursive: true
    });
    await mkdir(path.join(libraryPath, path.dirname(sourceRelativePath)), {
      recursive: true
    });
    await writeFile(path.join(libraryPath, sourceRelativePath), "audio", "utf8");
    await writeFile(
      path.join(libraryPath, ".spotifybu", "library-index.json"),
      `${JSON.stringify({
        generatedAt: new Date(0).toISOString(),
        libraryPath,
        tracks: [
          {
            album: "Example Record",
            albumArtist: "Example Artist",
            artist: "Example Artist",
            artists: ["Example Artist"],
            durationMs: 180_000,
            fileName: "Example Artist - Example Record (2025) - 01 - Opening.mp3",
            mtimeMs: 0,
            relativeDirectory:
              "Example Artist/Example Artist - Example Record (2025)",
            relativePath: sourceRelativePath,
            sizeBytes: 123,
            source: "tags",
            title: "Opening",
            trackNumber: 1
          }
        ],
        version: 1
      } satisfies NavidromeLibraryIndex, null, 2)}\n`,
      "utf8"
    );
    const { persistPlaylistBackup } = await import("./backup-store.ts");

    persistPlaylistBackup({
      playlist: {
        id: "playlist-1",
        imageUrl: undefined,
        name: "Example Playlist",
        owner: "Tester",
        ownerId: "tester",
        tracksTotal: 1
      },
      source: "playlist-load",
      tracks: [exampleTrack]
    });

    const result = await buildNaviCleanCanonicalTargets([
      {
        duration: 180,
        relativePath: sourceRelativePath,
        size: 123
      }
    ]);

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0].sourceRelativePath, sourceRelativePath);
    assert.equal(
      result.targets[0].targetRelativePath,
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Opening.mp3"
    );

    persistPlaylistBackup({
      playlist: {
        id: "playlist-2",
        imageUrl: undefined,
        name: "Conflicting Playlist",
        owner: "Tester",
        ownerId: "tester",
        tracksTotal: 1
      },
      source: "playlist-load",
      tracks: [
        {
          ...exampleTrack,
          album: "Example Record Deluxe",
          albumId: "album-deluxe",
          id: "track-deluxe",
          isrc: undefined
        }
      ]
    });

    const conflictingResult = await buildNaviCleanCanonicalTargets([
      {
        duration: 180,
        relativePath: sourceRelativePath,
        size: 123
      }
    ]);

    assert.equal(conflictingResult.targets.length, 0);
    assert.equal(conflictingResult.conflicts.length, 1);
    assert.equal(conflictingResult.conflicts[0].targets.length, 2);

    const conflicts = await getNaviCleanTargetConflicts();

    assert.equal(conflicts.unresolvedCount, 1);
    assert.equal(conflicts.resolvedCount, 0);
    assert.equal(conflicts.conflicts[0].sourceRelativePath, sourceRelativePath);
    assert.equal(conflicts.conflicts[0].targets.length, 2);

    await resolveNaviCleanTargetConflict({
      sourceRelativePath,
      targetRelativePath:
        "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Opening.mp3"
    });

    const resolvedConflicts = await getNaviCleanTargetConflicts();

    assert.equal(resolvedConflicts.unresolvedCount, 0);
    assert.equal(resolvedConflicts.resolvedCount, 1);
    assert.equal(
      resolvedConflicts.conflicts[0].targets.filter((target) => target.selected)
        .length,
      1
    );

    const resolvedResult = await buildNaviCleanCanonicalTargets([
      {
        duration: 180,
        relativePath: sourceRelativePath,
        size: 123
      }
    ]);

    assert.equal(resolvedResult.conflicts.length, 0);
    assert.equal(resolvedResult.targets.length, 1);
    assert.equal(
      resolvedResult.targets[0].targetRelativePath,
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Opening.mp3"
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
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Artist & Friend/Artist & Friend - Ampersand Record (2026)/Artist & Friend - Ampersand Record (2026) - 01 - Opening.mp3"
    );
  });
});

test("standard matching finds indexed album variants but keeps Spotify naming canonical", async (t) => {
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
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Passion/Passion - Passion - Even So Come (Live) (2026)/Passion - Passion - Even So Come (Live) (2026) - 01 - Opening.mp3"
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

test("matching finds existing artist title matches across album folders", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      album: "Live From Europe",
      albumArtist: "Cody Carnes",
      albumId: "album-live-from-europe-cody",
      albumReleaseDate: "2024-08-16",
      artists: ["Cody Carnes"],
      id: "track-cody-firm-foundation",
      name: "Firm Foundation (He Won't) - Live From Europe",
      trackNumber: 4
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Firm Foundation (Live)",
          albumArtist: "Cody Carnes",
          artist: "Cody Carnes",
          artists: ["Cody Carnes"],
          durationMs: 180_000,
          fileName:
            "Cody Carnes - Firm Foundation (Live) (2023) - 04 - Firm Foundation (He Won\u2019t) [Live].mp3",
          mtimeMs: 0,
          relativeDirectory:
            "Cody Carnes/Cody Carnes - Firm Foundation (Live) (2023)",
          relativePath:
            "Cody Carnes/Cody Carnes - Firm Foundation (Live) (2023)/Cody Carnes - Firm Foundation (Live) (2023) - 04 - Firm Foundation (He Won\u2019t) [Live].mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Firm Foundation (He Won\u2019t) [Live]",
          trackNumber: 4
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Cody Carnes/Cody Carnes - Live From Europe (2024)/Cody Carnes - Live From Europe (2024) - 04 - Firm Foundation (He Won't) - Live From Europe.mp3"
    );
  });
});

test("matching finds moved artist-title files without tag duration or track number", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
    const relativePath = "Loose Downloads/Marilyn Manson - Tainted Love.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));
    const spotifyTrack = {
      ...exampleTrack,
      album: "Lest We Forget - The Best Of",
      albumArtist: "Marilyn Manson",
      albumId: "album-manson-best-of",
      albumReleaseDate: "2004-01-01",
      artists: ["Marilyn Manson"],
      id: "track-tainted-love",
      isrc: undefined,
      name: "Tainted Love",
      trackNumber: 17
    } satisfies BackupTrack;

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
    assert.ok(index);
    const indexedTrack = index.tracks[0];

    assert.equal(index.tracks.length, 1);
    assert.equal(indexedTrack.artist, "Marilyn Manson");
    assert.equal(indexedTrack.title, "Tainted Love");

    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], index);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(matches[0].matchedTrack?.relativePath, relativePath);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Marilyn Manson/Marilyn Manson - Lest We Forget - The Best Of (2004)/Marilyn Manson - Lest We Forget - The Best Of (2004) - 17 - Tainted Love.mp3"
    );
  });
});

test("matching finds moved title-only files with artist context in the path", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.NAVIDROME_LIBRARY_PATH;
    const relativePath = "Marilyn Manson/Lest We Forget/Tainted Love.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));
    const spotifyTrack = {
      ...exampleTrack,
      album: "Lest We Forget - The Best Of",
      albumArtist: "Marilyn Manson",
      albumId: "album-manson-best-of-title-only",
      albumReleaseDate: "2004-01-01",
      artists: ["Marilyn Manson"],
      id: "track-tainted-love-title-only",
      isrc: undefined,
      name: "Tainted Love",
      trackNumber: 17
    } satisfies BackupTrack;

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
    assert.ok(index);
    const indexedTrack = index.tracks[0];

    assert.equal(index.tracks.length, 1);
    assert.equal(indexedTrack.artist, undefined);
    assert.equal(indexedTrack.title, "Tainted Love");

    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], index);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(matches[0].matchedTrack?.relativePath, relativePath);
  });
});

test("matching accepts comma-joined local artist tags", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      album: "Live From Europe",
      albumArtist: "Cody Carnes",
      albumId: "album-cody-comma",
      albumReleaseDate: "2024-08-16",
      artists: ["Cody Carnes"],
      id: "track-cody-comma",
      isrc: undefined,
      name: "Firm Foundation (He Won't)",
      trackNumber: 4
    } satisfies BackupTrack;
    const matches = await matchNavidromeTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Live From Europe",
          albumArtist: "Kari Jobe Carnes, Cody Carnes",
          artist: "Kari Jobe Carnes, Cody Carnes",
          artists: ["Kari Jobe Carnes, Cody Carnes"],
          durationMs: undefined,
          fileName:
            "Kari Jobe Carnes, Cody Carnes - Live From Europe (2024) - 04 - Firm Foundation (He Won't).mp3",
          mtimeMs: 0,
          relativeDirectory:
            "Kari Jobe Carnes, Cody Carnes/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024)",
          relativePath:
            "Kari Jobe Carnes, Cody Carnes/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024)/Kari Jobe Carnes, Cody Carnes - Live From Europe (2024) - 04 - Firm Foundation (He Won't).mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Firm Foundation (He Won't)",
          trackNumber: 4
        }
      ],
      version: 1
    } satisfies NavidromeLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
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
