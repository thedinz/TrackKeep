import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  deleteMusicLibraryTrack,
  matchMusicLibraryTracksWithIndex,
  parseMusicLibraryIndexedTrackIdentityTags,
  planMusicLibraryAlbumFolders,
  prepareMusicLibraryTrackFileDestination,
  recordMusicLibraryAlbumFolders,
  readCurrentMusicLibraryIndex,
  scanMusicLibraryIndex,
  type MusicLibraryIndex
} from "./music-library.ts";
import {
  spotifyBuIdentityTags,
  spotifyBuIdentityVersion
} from "./spotify-identity-tags.ts";
import type { BackupTrack } from "./spotify.ts";

test("standard album folder uses artist album year layout", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const [plan] = await planMusicLibraryAlbumFolders([exampleTrack]);

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
    const [plan] = await planMusicLibraryAlbumFolders([
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

test("download destinations use the same long folder path as organization", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
    const longAlbumTitle = `Long Album ${"Name ".repeat(28)}`.trim();
    const spotifyTrack = {
      ...exampleTrack,
      album: longAlbumTitle,
      albumId: "album-long-download-path",
      name: "Short Song"
    } satisfies BackupTrack;

    process.env.MUSIC_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.MUSIC_LIBRARY_PATH;
      }

      await rm(libraryPath, {
        force: true,
        recursive: true
      });
    });

    const [plan] = await recordMusicLibraryAlbumFolders([spotifyTrack]);
    const exactDirectory = path.join(
      libraryPath,
      ...plan.relativePath.split("/")
    );
    const truncatedDirectory = path.join(
      libraryPath,
      ...plan.relativePath.split("/").map((segment) => segment.slice(0, 120))
    );
    const destination = await prepareMusicLibraryTrackFileDestination(
      spotifyTrack,
      "mp3"
    );

    assert.ok(plan.relativePath.split("/").some((segment) => segment.length > 120));
    assert.equal(destination.relativeDirectory, plan.relativePath);
    assert.ok((await stat(exactDirectory)).isDirectory());

    if (truncatedDirectory !== exactDirectory) {
      await assert.rejects(stat(truncatedDirectory));
    }

    const [match] = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath,
      tracks: [
        {
          album: spotifyTrack.album,
          albumArtist: spotifyTrack.albumArtist,
          artist: spotifyTrack.artists[0],
          artists: spotifyTrack.artists,
          durationMs: spotifyTrack.durationMs,
          fileName: destination.fileName,
          isrc: spotifyTrack.isrc,
          mtimeMs: 0,
          relativeDirectory: destination.relativeDirectory,
          relativePath: destination.relativePath,
          sizeBytes: 1,
          source: "tags",
          title: spotifyTrack.name,
          trackNumber: spotifyTrack.trackNumber
        }
      ],
      version: 1
    } satisfies MusicLibraryIndex);

    assert.equal(match.exists, true);
    assert.equal(match.needsMove, false);
  });
});

test("standard matching keeps Spotify year canonical when local year differs", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const matches = await matchMusicLibraryTracksWithIndex([exampleTrack], {
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
    } satisfies MusicLibraryIndex);

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

test("standard matching finds indexed title variants but keeps Spotify naming canonical", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      id: "track-title-variant",
      isrc: "USABC1234567",
      name: "Spotify Title Variant"
    } satisfies BackupTrack;
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Spotify Title Variant.mp3"
    );
  });
});

test("library index parser reads SpotifyBU identity tags", () => {
  const spotifyTrackId = "6rqhFgbbKwnb9MLmUQDhG6";
  const spotifyAlbumId = "0sNOF9WDwhWunNAHPD3Baj";
  const identity = parseMusicLibraryIndexedTrackIdentityTags(
    new Map([
      [spotifyBuIdentityTags.trackId, spotifyTrackId],
      [spotifyBuIdentityTags.trackUri, `spotify:track:${spotifyTrackId}`],
      [spotifyBuIdentityTags.albumId, spotifyAlbumId],
      [spotifyBuIdentityTags.isrc, "usrc17607839"],
      [spotifyBuIdentityTags.identityVersion, spotifyBuIdentityVersion]
    ])
  );

  assert.equal(identity.spotifyTrackId, spotifyTrackId);
  assert.equal(identity.spotifyTrackUri, `spotify:track:${spotifyTrackId}`);
  assert.equal(identity.spotifyAlbumId, spotifyAlbumId);
  assert.equal(identity.spotifyIsrc, "USRC17607839");
  assert.equal(identity.spotifybuIdentityVersion, spotifyBuIdentityVersion);
});

test("matching prefers Spotify identity tags before fuzzy metadata", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrackId = "6rqhFgbbKwnb9MLmUQDhG6";
    const spotifyTrack = {
      ...exampleTrack,
      id: spotifyTrackId,
      spotifyUri: `spotify:track:${spotifyTrackId}`
    } satisfies BackupTrack;
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: spotifyTrack.album,
          albumArtist: spotifyTrack.albumArtist,
          artist: spotifyTrack.artists[0],
          artists: spotifyTrack.artists,
          durationMs: spotifyTrack.durationMs,
          fileName: "01 - Opening.mp3",
          mtimeMs: 0,
          relativeDirectory: "Fuzzy",
          relativePath: "Fuzzy/01 - Opening.mp3",
          sizeBytes: 1,
          source: "tags",
          title: spotifyTrack.name,
          trackNumber: spotifyTrack.trackNumber
        },
        {
          album: "Wrong Album",
          albumArtist: "Wrong Artist",
          artist: "Wrong Artist",
          artists: ["Wrong Artist"],
          fileName: "Moved And Renamed.mp3",
          mtimeMs: 0,
          relativeDirectory: "Moved",
          relativePath: "Moved/Moved And Renamed.mp3",
          sizeBytes: 1,
          source: "tags",
          spotifyTrackId,
          spotifybuIdentityVersion: spotifyBuIdentityVersion,
          title: "Wrong Title"
        }
      ],
      version: 1
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].matchedBy, "spotify_identity");
    assert.equal(matches[0].matchedTrack?.relativePath, "Moved/Moved And Renamed.mp3");
  });
});

test("matching uses Spotify URI identity when a moved file has no track ID tag", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrackId = "3n3Ppam7vgaVa1iaRUc9Lp";
    const spotifyTrack = {
      ...exampleTrack,
      id: undefined,
      isrc: undefined,
      spotifyUri: `spotify:track:${spotifyTrackId}`
    } satisfies BackupTrack;
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Wrong Album",
          albumArtist: "Wrong Artist",
          artist: "Wrong Artist",
          artists: ["Wrong Artist"],
          fileName: "Organizer Changed Everything.mp3",
          mtimeMs: 0,
          relativeDirectory: "Loose",
          relativePath: "Loose/Organizer Changed Everything.mp3",
          sizeBytes: 1,
          source: "tags",
          spotifyTrackUri: `spotify:track:${spotifyTrackId}`,
          spotifybuIdentityVersion: spotifyBuIdentityVersion,
          title: "Wrong Title"
        }
      ],
      version: 1
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].matchedBy, "spotify_identity");
    assert.equal(
      matches[0].matchedTrack?.relativePath,
      "Loose/Organizer Changed Everything.mp3"
    );
  });
});

test("matching still falls back for old indexed files without identity tags", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const spotifyTrack = {
      ...exampleTrack,
      id: "6rqhFgbbKwnb9MLmUQDhG6",
      isrc: "USRC17607839",
      spotifyUri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"
    } satisfies BackupTrack;
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: spotifyTrack.album,
          albumArtist: spotifyTrack.albumArtist,
          artist: spotifyTrack.artists[0],
          artists: spotifyTrack.artists,
          fileName: "Old File.mp3",
          isrc: "USRC17607839",
          mtimeMs: 0,
          relativeDirectory: "Old",
          relativePath: "Old/Old File.mp3",
          sizeBytes: 1,
          source: "tags",
          title: "Old Local Title"
        }
      ],
      version: 1
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].matchedBy, "isrc");
    assert.equal(matches[0].matchedTrack?.relativePath, "Old/Old File.mp3");
  });
});

test("standard matching uses shared path token normalization", async (t) => {
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
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

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
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

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
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

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
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

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
    const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
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

    process.env.MUSIC_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.MUSIC_LIBRARY_PATH;
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

    await scanMusicLibraryIndex();
    const index = await readCurrentMusicLibraryIndex();
    assert.ok(index);
    const indexedTrack = index.tracks[0];

    assert.equal(index.tracks.length, 1);
    assert.equal(indexedTrack.artist, "Marilyn Manson");
    assert.equal(indexedTrack.title, "Tainted Love");

    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], index);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
    assert.equal(matches[0].matchedTrack?.relativePath, relativePath);
    assert.equal(
      matches[0].recommendedRelativePath,
      "Marilyn Manson/Marilyn Manson - Lest We Forget - The Best Of (2004)/Marilyn Manson - Lest We Forget - The Best Of (2004) - 17 - Tainted Love.mp3"
    );
  });
});

test("deleting a library track removes the file and index entry", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
    const relativePath = "Example Artist/Example Artist - Example Record (2026)/01 - Opening.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));
    const indexPath = path.join(libraryPath, ".spotifybu", "library-index.json");

    process.env.MUSIC_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.MUSIC_LIBRARY_PATH;
      }

      await rm(libraryPath, {
        force: true,
        recursive: true
      });
    });

    await mkdir(path.dirname(filePath), {
      recursive: true
    });
    await mkdir(path.dirname(indexPath), {
      recursive: true
    });
    await writeFile(filePath, "not real audio", "utf8");
    await writeFile(
      indexPath,
      `${JSON.stringify(
        {
          generatedAt: new Date(0).toISOString(),
          libraryPath,
          tracks: [
            {
              album: exampleTrack.album,
              albumArtist: exampleTrack.albumArtist,
              artist: exampleTrack.artists[0],
              artists: exampleTrack.artists,
              durationMs: exampleTrack.durationMs,
              fileName: path.posix.basename(relativePath),
              mtimeMs: 0,
              relativeDirectory: path.posix.dirname(relativePath),
              relativePath,
              sizeBytes: 1,
              source: "tags",
              title: exampleTrack.name,
              trackNumber: exampleTrack.trackNumber
            }
          ],
          version: 1
        } satisfies MusicLibraryIndex,
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await deleteMusicLibraryTrack(relativePath);
    const index = await readCurrentMusicLibraryIndex();

    assert.equal(result.deleted, true);
    assert.equal(result.removedFromIndex, true);
    assert.equal(index?.tracks.length, 0);
    await assert.rejects(readFile(filePath, "utf8"));
  });
});

test("matching finds moved title-only files with artist context in the path", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
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

    process.env.MUSIC_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.MUSIC_LIBRARY_PATH;
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

    await scanMusicLibraryIndex();
    const index = await readCurrentMusicLibraryIndex();
    assert.ok(index);
    const indexedTrack = index.tracks[0];

    assert.equal(index.tracks.length, 1);
    assert.equal(indexedTrack.artist, undefined);
    assert.equal(indexedTrack.title, "Tainted Love");

    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], index);

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
    const matches = await matchMusicLibraryTracksWithIndex([spotifyTrack], {
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
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].needsMove, true);
  });
});

test("library index parses standard folders when parent artist stripped trailing punctuation", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
    const relativePath =
      "Journey Worship Co/Journey Worship Co. - Come to the Lord (2021)/Journey Worship Co. - Come to the Lord (2021) - 01 - Come to the Lord.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));

    process.env.MUSIC_LIBRARY_PATH = libraryPath;
    t.after(async () => {
      if (typeof previousLibraryPath === "string") {
        process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
      } else {
        delete process.env.MUSIC_LIBRARY_PATH;
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

    await scanMusicLibraryIndex();
    const index = await readCurrentMusicLibraryIndex();
    const track = index?.tracks[0];

    assert.equal(index?.tracks.length, 1);
    assert.equal(track?.albumArtist, "Journey Worship Co.");
    assert.equal(track?.album, "Come to the Lord");
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
  await withOrganizeSettings(t, null, run);
}

async function withOrganizeSettings(
  t: TestContext,
  settings: Record<string, unknown> | null,
  run: () => Promise<void>
) {
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;
  const configDirectory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-organize-")
  );

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  delete process.env.MUSIC_LIBRARY_PATH;

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
      process.env.MUSIC_LIBRARY_PATH = previousLibraryPath;
    } else {
      delete process.env.MUSIC_LIBRARY_PATH;
    }

    await rm(configDirectory, {
      force: true,
      recursive: true
    });
  });

  await run();
}
