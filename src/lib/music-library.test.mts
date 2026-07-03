import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { persistPlaylistBackup } from "./backup-store.ts";
import {
  backfillMusicLibrarySpotifyIdentityTags,
  clearMusicLibraryTrackOrganizationIgnore,
  deleteMusicLibraryTrack,
  getMusicLibraryStatus,
  getMusicServerStatus,
  ignoreMusicLibraryTrackOrganization,
  matchMusicLibraryTracks,
  matchMusicLibraryTracksWithIndex,
  organizeMusicLibraryMatchedTracks,
  parseMusicLibraryIndexedTrackIdentityTags,
  planMusicLibraryAlbumFolders,
  prepareMusicLibraryTrackFileDestination,
  recordMusicLibraryAlbumFolders,
  readCurrentMusicLibraryIndex,
  scanMusicLibraryIndex,
  type MusicLibraryIndex
} from "./music-library.ts";
import { tagAudioFileWithSpotifyIdentity } from "./providers/tagging.ts";
import {
  spotifyBuIdentityTags,
  spotifyBuIdentityVersion
} from "./spotify-identity-tags.ts";
import type { BackupTrack } from "./spotify.ts";

const execFileAsync = promisify(execFile);

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

test("matching does not use a same-title single as cross-artist context", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const jaidenTrack = {
      ...exampleTrack,
      album: "Dead 2 Me",
      albumArtist: "Jaiden",
      albumId: "album-jaiden-dead-2-me",
      albumReleaseDate: "2017-01-01",
      artists: ["Jaiden"],
      id: "track-jaiden-dead-2-me",
      isrc: undefined,
      name: "Dead 2 Me",
      trackNumber: 1
    } satisfies BackupTrack;
    const tomMacDonaldPath =
      "Tom MacDonald/Tom MacDonald - Infidelity in the Throne Room (2012)/Tom MacDonald - Infidelity in the Throne Room (2012) - 22 - Dead 2 Me.mp3";
    const matches = await matchMusicLibraryTracksWithIndex([jaidenTrack], {
      generatedAt: new Date(0).toISOString(),
      libraryPath: "/music",
      tracks: [
        {
          album: "Infidelity in the Throne Room",
          albumArtist: "Tom MacDonald",
          artist: "Tom MacDonald",
          artists: ["Tom MacDonald"],
          durationMs: jaidenTrack.durationMs,
          fileName: path.posix.basename(tomMacDonaldPath),
          mtimeMs: 0,
          relativeDirectory: path.posix.dirname(tomMacDonaldPath),
          relativePath: tomMacDonaldPath,
          sizeBytes: 1,
          source: "path",
          title: "Dead 2 Me",
          trackNumber: 22
        }
      ],
      version: 1
    } satisfies MusicLibraryIndex);

    assert.equal(matches[0].exists, false);
  });
});

test("matching uses exact organized paths before stale identity tags", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const hurtMeTrack = {
      ...exampleTrack,
      album: "Spirit",
      albumArtist: "Amos Lee",
      albumId: "album-amos-spirit",
      albumReleaseDate: "2016-01-01",
      artists: ["Amos Lee"],
      id: "track-amos-hurt-me",
      isrc: undefined,
      name: "Hurt Me",
      spotifyUri: "spotify:track:track-amos-hurt-me",
      trackNumber: 10
    } satisfies BackupTrack;
    const vaporizeTrack = {
      ...hurtMeTrack,
      id: "track-amos-vaporize",
      name: "Vaporize",
      spotifyUri: "spotify:track:track-amos-vaporize",
      trackNumber: 11
    } satisfies BackupTrack;
    const folder = "Amos Lee/Amos Lee - Spirit (2016)";
    const hurtMePath = `${folder}/Amos Lee - Spirit (2016) - 10 - Hurt Me.flac`;
    const vaporizePath = `${folder}/Amos Lee - Spirit (2016) - 11 - Vaporize.flac`;
    const matches = await matchMusicLibraryTracksWithIndex(
      [hurtMeTrack, vaporizeTrack],
      {
        generatedAt: new Date(0).toISOString(),
        libraryPath: "/music",
        tracks: [
          {
            album: "Spirit",
            albumArtist: "Amos Lee",
            artist: "Amos Lee",
            artists: ["Amos Lee"],
            durationMs: hurtMeTrack.durationMs,
            fileName: path.posix.basename(hurtMePath),
            mtimeMs: 0,
            relativeDirectory: path.posix.dirname(hurtMePath),
            relativePath: hurtMePath,
            sizeBytes: 1,
            source: "tags",
            spotifyTrackId: vaporizeTrack.id,
            spotifyTrackUri: vaporizeTrack.spotifyUri,
            spotifybuIdentityVersion: spotifyBuIdentityVersion,
            title: "Vaporize",
            trackNumber: 11
          },
          {
            album: "Spirit",
            albumArtist: "Amos Lee",
            artist: "Amos Lee",
            artists: ["Amos Lee"],
            durationMs: vaporizeTrack.durationMs,
            fileName: path.posix.basename(vaporizePath),
            mtimeMs: 0,
            relativeDirectory: path.posix.dirname(vaporizePath),
            relativePath: vaporizePath,
            sizeBytes: 1,
            source: "path",
            title: "Vaporize",
            trackNumber: 11
          }
        ],
        version: 1
      } satisfies MusicLibraryIndex
    );

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].matchedBy, "path");
    assert.equal(matches[0].needsMove, false);
    assert.equal(matches[0].matchedTrack?.relativePath, hurtMePath);
    assert.equal(matches[1].exists, true);
    assert.equal(matches[1].matchedBy, "path");
    assert.equal(matches[1].needsMove, false);
    assert.equal(matches[1].matchedTrack?.relativePath, vaporizePath);
  });
});

test("matching does not let different Spotify tracks share one indexed file", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const hurtMeTrack = {
      ...exampleTrack,
      album: "Spirit",
      albumArtist: "Amos Lee",
      albumId: "album-amos-spirit",
      albumReleaseDate: "2016-01-01",
      artists: ["Amos Lee"],
      id: "track-amos-hurt-me",
      isrc: undefined,
      name: "Hurt Me",
      spotifyUri: "spotify:track:track-amos-hurt-me",
      trackNumber: 10
    } satisfies BackupTrack;
    const vaporizeTrack = {
      ...hurtMeTrack,
      id: "track-amos-vaporize",
      name: "Vaporize",
      spotifyUri: "spotify:track:track-amos-vaporize",
      trackNumber: 11
    } satisfies BackupTrack;
    const hurtMePath =
      "Amos Lee/Amos Lee - Spirit (2016)/Amos Lee - Spirit (2016) - 10 - Hurt Me.flac";
    const matches = await matchMusicLibraryTracksWithIndex(
      [hurtMeTrack, vaporizeTrack],
      {
        generatedAt: new Date(0).toISOString(),
        libraryPath: "/music",
        tracks: [
          {
            album: "Spirit",
            albumArtist: "Amos Lee",
            artist: "Amos Lee",
            artists: ["Amos Lee"],
            durationMs: hurtMeTrack.durationMs,
            fileName: path.posix.basename(hurtMePath),
            mtimeMs: 0,
            relativeDirectory: path.posix.dirname(hurtMePath),
            relativePath: hurtMePath,
            sizeBytes: 1,
            source: "tags",
            spotifyTrackId: vaporizeTrack.id,
            spotifyTrackUri: vaporizeTrack.spotifyUri,
            spotifybuIdentityVersion: spotifyBuIdentityVersion,
            title: "Vaporize",
            trackNumber: 11
          }
        ],
        version: 1
      } satisfies MusicLibraryIndex
    );

    assert.equal(matches[0].exists, true);
    assert.equal(matches[0].matchedBy, "path");
    assert.equal(matches[0].matchedTrack?.relativePath, hurtMePath);
    assert.equal(matches[1].exists, false);
    assert.equal(matches[1].needsMove, false);
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

test("organization ignores are reversible and skipped by organize", async (t) => {
  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const spotifyTrack = {
      ...exampleTrack,
      id: "trackabc123",
      spotifyUri: "spotify:track:trackabc123"
    } satisfies BackupTrack;
    const looseRelativePath = "Loose/Example Artist - Opening.mp3";
    const loosePath = path.join(libraryPath, ...looseRelativePath.split("/"));

    t.after(async () => {
      await rm(libraryPath, {
        force: true,
        recursive: true
      });
    });

    await withEnvironment(t, { MUSIC_LIBRARY_PATH: libraryPath }, async () => {
      await mkdir(path.dirname(loosePath), {
        recursive: true
      });
      await writeFile(loosePath, "not real audio", "utf8");

      await scanMusicLibraryIndex();

      const initialMatches = await matchMusicLibraryTracks([spotifyTrack]);

      assert.equal(initialMatches[0].exists, true);
      assert.equal(initialMatches[0].needsMove, true);

      const ignored = await ignoreMusicLibraryTrackOrganization(spotifyTrack, [
        spotifyTrack
      ]);

      assert.equal(ignored.libraryMatches[0].exists, true);
      assert.equal(ignored.libraryMatches[0].needsMove, false);
      assert.equal(ignored.libraryMatches[0].organizeIgnored, true);
      assert.equal(
        ignored.libraryMatches[0].matchedTrack?.relativePath,
        looseRelativePath
      );

      const organizeResult = await organizeMusicLibraryMatchedTracks([
        spotifyTrack
      ]);

      assert.equal(organizeResult.attemptedCount, 0);
      assert.equal(organizeResult.movedCount, 0);
      await stat(loosePath);

      const cleared = await clearMusicLibraryTrackOrganizationIgnore(
        spotifyTrack,
        [spotifyTrack]
      );

      assert.equal(Boolean(cleared.libraryMatches[0].organizeIgnored), false);
      assert.equal(cleared.libraryMatches[0].needsMove, true);
    });
  });
});

test("metadata backfill upgrades existing identity-tagged backups with release tags", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for metadata backfill coverage.");
    return;
  }

  await withDefaultOrganizeSettings(t, async () => {
    const libraryPath = await mkdtemp(
      path.join(tmpdir(), "spotifybu-library-")
    );
    const spotifyTrack = {
      ...exampleTrack,
      albumReleaseDate: "2026-02-03",
      albumType: "compilation",
      id: "4uLU6hMCjMI75M1A2tKUQC",
      isrc: "USABC1234567",
      spotifyUri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
    } satisfies BackupTrack;
    const relativePath =
      "Example Artist/Example Artist - Example Record (2026)/Example Artist - Example Record (2026) - 01 - Opening.mp3";
    const filePath = path.join(libraryPath, ...relativePath.split("/"));

    t.after(async () => {
      await rm(libraryPath, {
        force: true,
        recursive: true
      });
    });

    await withEnvironment(t, { MUSIC_LIBRARY_PATH: libraryPath }, async () => {
      await mkdir(path.dirname(filePath), {
        recursive: true
      });
      await writeSilentMp3(filePath, [
        "title=Opening",
        "artist=Example Artist",
        "album=Example Record"
      ]);
      await tagAudioFileWithSpotifyIdentity(filePath, spotifyTrack);
      await scanMusicLibraryIndex();

      persistPlaylistBackup({
        playlist: {
          collaborative: false,
          description: "",
          id: "playlist-backfill",
          name: "Backfill",
          owner: "SpotifyBU",
          public: false,
          tracksTotal: 1
        },
        source: "playlist-load",
        tracks: [spotifyTrack]
      });

      const beforeBackfillTags = await readAudioTags(filePath);

      assert.equal(beforeBackfillTags.date, undefined);
      assert.equal(beforeBackfillTags.compilation, undefined);

      const result = await backfillMusicLibrarySpotifyIdentityTags();

      assert.equal(result.matchedCount, 1);
      assert.equal(result.taggedCount, 1);
      assert.equal(result.alreadyTaggedCount, 0);

      const tags = await readAudioTags(filePath);
      const index = await readCurrentMusicLibraryIndex();
      const indexedTrack = index?.tracks.find(
        (track) => track.relativePath === relativePath
      );

      assert.equal(tags.date, "2026-02-03");
      assert.equal(tags.compilation, "1");
      assert.equal(indexedTrack?.releaseDate, "2026-02-03");
      assert.equal(indexedTrack?.compilation, true);
    });
  });
});

test("music library status accepts Navidrome library path env var", async (t) => {
  const libraryPath = await mkdtemp(path.join(tmpdir(), "spotifybu-library-"));

  t.after(async () => {
    await rm(libraryPath, {
      force: true,
      recursive: true
    });
  });

  await withEnvironment(
    t,
    {
      MUSIC_LIBRARY_PASSWORD: null,
      MUSIC_LIBRARY_PATH: null,
      MUSIC_LIBRARY_URL: null,
      MUSIC_LIBRARY_USER: null,
      MUSIC_LIBRARY_USERNAME: null,
      NAVIDROME_LIBRARY_PATH: libraryPath,
      NAVIDROME_MUSIC_PATH: null,
      NAVIDROME_PASSWORD: null,
      NAVIDROME_URL: null,
      NAVIDROME_USER: null,
      NAVIDROME_USERNAME: null
    },
    async () => {
      const status = await getMusicLibraryStatus();

      assert.equal(status.state, "ready");
      assert.equal(status.configured, true);
      assert.equal(status.libraryPath, libraryPath);
    }
  );
});

test("music library status accepts Navidrome music path env var", async (t) => {
  const libraryPath = await mkdtemp(path.join(tmpdir(), "spotifybu-library-"));

  t.after(async () => {
    await rm(libraryPath, {
      force: true,
      recursive: true
    });
  });

  await withEnvironment(
    t,
    {
      MUSIC_LIBRARY_PASSWORD: null,
      MUSIC_LIBRARY_PATH: null,
      MUSIC_LIBRARY_URL: null,
      MUSIC_LIBRARY_USER: null,
      MUSIC_LIBRARY_USERNAME: null,
      NAVIDROME_LIBRARY_PATH: null,
      NAVIDROME_MUSIC_PATH: libraryPath,
      NAVIDROME_PASSWORD: null,
      NAVIDROME_URL: null,
      NAVIDROME_USER: null,
      NAVIDROME_USERNAME: null
    },
    async () => {
      const status = await getMusicLibraryStatus();

      assert.equal(status.state, "ready");
      assert.equal(status.configured, true);
      assert.equal(status.libraryPath, libraryPath);
    }
  );
});

test("Navidrome API status accepts Navidrome URL and credentials", async (t) => {
  const requestedPaths: string[] = [];
  const server = http.createServer((request, response) => {
    requestedPaths.push(request.url ?? "");
    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        "subsonic-response": {
          scanStatus: {
            count: 12,
            scanning: false
          },
          status: "ok"
        }
      })
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address();

  assert.equal(typeof address, "object");
  assert.ok(address);

  await withEnvironment(
    t,
    {
      MUSIC_LIBRARY_PASSWORD: null,
      MUSIC_LIBRARY_URL: null,
      MUSIC_LIBRARY_USER: null,
      MUSIC_LIBRARY_USERNAME: null,
      NAVIDROME_PASSWORD: "navidrome-password",
      NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
      NAVIDROME_USER: null,
      NAVIDROME_USERNAME: "navidrome-user"
    },
    async () => {
      const status = await getMusicServerStatus();

      assert.equal(status.state, "ready");
      assert.equal(status.configured, true);
      assert.equal(status.musicLibraryUrl, `http://127.0.0.1:${address.port}`);
      assert.equal(status.scanCount, 12);
      assert.ok(
        requestedPaths.some((requestPath) =>
          requestPath.startsWith("/rest/ping.view?")
        )
      );
      assert.ok(
        requestedPaths.some((requestPath) =>
          requestPath.startsWith("/rest/getScanStatus.view?")
        )
      );
    }
  );
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

async function withEnvironment(
  t: TestContext,
  updates: Record<string, string | null>,
  run: () => Promise<void>
) {
  const previousValues = new Map(
    Object.keys(updates).map((key) => [key, process.env[key]] as const)
  );

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  t.after(() => {
    for (const [key, value] of previousValues) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  await run();
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

async function hasCommand(command: string) {
  try {
    await execFileAsync(command, ["-version"], {
      timeout: 10000
    });
    return true;
  } catch {
    return false;
  }
}

async function writeSilentMp3(filePath: string, metadata: string[]) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-t",
      "0.1",
      "-q:a",
      "9",
      ...metadata.flatMap((value) => ["-metadata", value]),
      filePath
    ],
    {
      timeout: 60000
    }
  );
}

async function readAudioTags(filePath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath
    ],
    {
      timeout: 60000
    }
  );
  const body = JSON.parse(stdout.toString()) as {
    format?: {
      tags?: Record<string, string>;
    };
  };

  return Object.fromEntries(
    Object.entries(body.format?.tags ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value
    ])
  );
}
