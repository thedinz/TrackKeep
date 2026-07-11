import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  spotifyAudioMetadataArgs,
  spotifyBackfillMetadataArgs,
  tagAudioFileWithSpotifyBackfillMetadata,
  tagDownloadedFile
} from "./tagging.ts";
import {
  spotifyBuIdentityTags,
  spotifyBuIdentityVersion
} from "../spotify-identity-tags.ts";
import type { BackupTrack } from "../spotify.ts";

const execFileAsync = promisify(execFile);

test("tagDownloadedFile metadata arguments include TrackKeep identity tags", () => {
  const spotifyTrackId = "4uLU6hMCjMI75M1A2tKUQC";
  const spotifyAlbumId = "0ETFjACtuP2ADo6LFhL6HN";
  const metadataValues = metadataArgumentValues(
    spotifyAudioMetadataArgs({
      ...exampleTrack,
      albumId: spotifyAlbumId,
      id: spotifyTrackId,
      isrc: "USRC17607839",
      spotifyUri: `spotify:track:${spotifyTrackId}`
    })
  );

  assert.ok(
    metadataValues.includes(`${spotifyBuIdentityTags.trackId}=${spotifyTrackId}`)
  );
  assert.ok(
    metadataValues.includes(
      `${spotifyBuIdentityTags.trackUri}=spotify:track:${spotifyTrackId}`
    )
  );
  assert.ok(
    metadataValues.includes(`${spotifyBuIdentityTags.albumId}=${spotifyAlbumId}`)
  );
  assert.ok(
    metadataValues.includes(`${spotifyBuIdentityTags.isrc}=USRC17607839`)
  );
  assert.ok(
    metadataValues.includes(
      `${spotifyBuIdentityTags.identityVersion}=${spotifyBuIdentityVersion}`
    )
  );
});

test("tagDownloadedFile metadata arguments include Navidrome-facing release tags", () => {
  const metadataValues = metadataArgumentValues(
    spotifyAudioMetadataArgs({
      ...exampleTrack,
      albumReleaseDate: "2012-08-07",
      albumType: "compilation"
    })
  );

  assert.ok(metadataValues.includes("date=2012-08-07"));
  assert.ok(metadataValues.includes("releasedate=2012-08-07"));
  assert.ok(metadataValues.includes("compilation=1"));
});

test("tagDownloadedFile metadata arguments skip invalid release dates and non-compilations", () => {
  const metadataValues = metadataArgumentValues(
    spotifyAudioMetadataArgs({
      ...exampleTrack,
      albumReleaseDate: "soon",
      albumType: "album"
    })
  );

  assert.equal(
    metadataValues.some((value) => value.startsWith("date=")),
    false
  );
  assert.equal(
    metadataValues.some((value) => value.startsWith("releasedate=")),
    false
  );
  assert.equal(metadataValues.includes("compilation=1"), false);
});

test("backfill metadata arguments only include identity and Navidrome-facing tags", () => {
  const metadataValues = metadataArgumentValues(
    spotifyBackfillMetadataArgs({
      ...exampleTrack,
      albumReleaseDate: "2012-08-07",
      albumType: "compilation"
    })
  );

  assert.ok(metadataValues.includes("date=2012-08-07"));
  assert.ok(metadataValues.includes("releasedate=2012-08-07"));
  assert.ok(metadataValues.includes("compilation=1"));
  assert.equal(
    metadataValues.some((value) => value.startsWith("title=")),
    false
  );
  assert.equal(
    metadataValues.some((value) => value.startsWith("artist=")),
    false
  );
  assert.equal(
    metadataValues.some((value) => value.startsWith("album=")),
    false
  );
});

test("tagDownloadedFile metadata arguments skip unresolved Spotify local identities", () => {
  const metadataValues = metadataArgumentValues(
    spotifyAudioMetadataArgs({
      ...exampleTrack,
      albumId: "0ETFjACtuP2ADo6LFhL6HN",
      id: "4uLU6hMCjMI75M1A2tKUQC",
      metadataStatus: "spotify-local-unresolved",
      spotifyUri: "spotify:local:Example:Artist:Track:180"
    })
  );

  assert.equal(
    metadataValues.some((value) =>
      value.startsWith(`${spotifyBuIdentityTags.trackId}=`)
    ),
    false
  );
  assert.equal(
    metadataValues.some((value) =>
      value.startsWith(`${spotifyBuIdentityTags.trackUri}=`)
    ),
    false
  );
  assert.equal(
    metadataValues.some((value) =>
      value.startsWith(`${spotifyBuIdentityTags.albumId}=`)
    ),
    false
  );
  assert.ok(
    metadataValues.includes(
      `${spotifyBuIdentityTags.identityVersion}=${spotifyBuIdentityVersion}`
    )
  );
});

test("backfill tagging preserves existing descriptive metadata", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for tagging regression coverage.");
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), "spotifybu-backfill-"));
  t.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true
    });
  });

  const filePath = path.join(directory, "existing-backup.mp3");

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
      "-metadata",
      "title=Existing Local Title",
      "-metadata",
      "artist=Existing Local Artist",
      "-metadata",
      "album=Existing Local Album",
      filePath
    ],
    {
      timeout: 60000
    }
  );

  await tagAudioFileWithSpotifyBackfillMetadata(filePath, {
    ...exampleTrack,
    albumReleaseDate: "2012-08-07",
    albumType: "compilation"
  });

  const tags = await readAudioTags(filePath);

  assert.equal(tags.title, "Existing Local Title");
  assert.equal(tags.artist, "Existing Local Artist");
  assert.equal(tags.album, "Existing Local Album");
  assert.equal(tags.date, "2012-08-07");
  assert.equal(tags.compilation, "1");
});

test("rewrites provider audio tags with Spotify metadata", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for tagging regression coverage.");
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), "spotifybu-tagging-"));
  t.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true
    });
  });

  const filePath = path.join(directory, "provider-source.mp3");

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
      "-metadata",
      "title=Fuck You All The Time (Shlohmo Remix) (video clip)",
      "-metadata",
      "artist=Jeremih",
      "-metadata",
      "album=ClipConverter.cc",
      filePath
    ],
    {
      timeout: 60000
    }
  );

  await tagDownloadedFile(filePath, {
    album: "Late Nights With Jeremih",
    albumArtist: "Jeremih",
    albumArtistIds: [],
    albumReleaseDate: "2012-08-07",
    artists: ["Jeremih"],
    artistIds: [],
    discNumber: 1,
    durationMs: 245000,
    explicit: true,
    name: "Fuck You All The Time - Shlohmo Remix",
    position: 1,
    trackNumber: 7
  } satisfies BackupTrack);

  const tags = await readAudioTags(filePath);

  assert.equal(tags.title, "Fuck You All The Time - Shlohmo Remix");
  assert.equal(tags.artist, "Jeremih");
  assert.equal(tags.album, "Late Nights With Jeremih");
  assert.equal(tags.album_artist, "Jeremih");
  assert.equal(tags.track, "7");
  assert.equal(tags.disc, "1");
  assert.equal(tags.date, "2012-08-07");
});

test("writes Opus audio tags and artwork with discrete TrackKeep identity tags", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for Opus tagging coverage.");
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), "spotifybu-opus-tagging-"));
  const coverServer = await startCoverServer();
  t.after(async () => {
    await closeServer(coverServer.server);
    await rm(directory, {
      force: true,
      recursive: true
    });
  });

  const filePath = path.join(directory, "provider-source.opus");
  const spotifyTrackId = "4uLU6hMCjMI75M1A2tKUQC";
  const spotifyAlbumId = "0ETFjACtuP2ADo6LFhL6HN";

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-t",
      "0.1",
      "-codec:a",
      "libopus",
      "-b:a",
      "160k",
      "-metadata",
      "title=Provider Clip Title",
      filePath
    ],
    {
      timeout: 60000
    }
  );

  await tagDownloadedFile(filePath, {
    ...exampleTrack,
    albumId: spotifyAlbumId,
    albumImageUrl: coverServer.url,
    albumReleaseDate: "2012-08-07",
    albumType: "compilation",
    id: spotifyTrackId,
    isrc: "USRC17607839",
    spotifyUri: `spotify:track:${spotifyTrackId}`
  } satisfies BackupTrack);

  const probe = await readAudioProbe(filePath);
  const tags = probe.tags;

  assert.equal(probe.audioCodec, "opus");
  assert.equal(probe.hasAttachedPicture, true);
  assert.equal(tags.title, "Fuck You All The Time - Shlohmo Remix");
  assert.equal(tags.artist, "Jeremih");
  assert.equal(tags.album, "Late Nights With Jeremih");
  assert.equal(tags.album_artist, "Jeremih");
  assert.equal(tags.track, "7");
  assert.equal(tags.disc, "1");
  assert.equal(tags.date, "2012-08-07");
  assert.equal(tags.releasedate, "2012-08-07");
  assert.equal(tags.isrc, "USRC17607839");
  assert.equal(tags.compilation, "1");
  assert.equal(tags[spotifyBuIdentityTags.trackId], spotifyTrackId);
  assert.equal(tags[spotifyBuIdentityTags.trackUri], `spotify:track:${spotifyTrackId}`);
  assert.equal(tags[spotifyBuIdentityTags.albumId], spotifyAlbumId);
  assert.equal(tags[spotifyBuIdentityTags.isrc], "USRC17607839");
  assert.equal(tags[spotifyBuIdentityTags.identityVersion], spotifyBuIdentityVersion);
});

test("writes Opus artwork without passing large picture blocks through argv", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for large Opus artwork coverage.");
    return;
  }

  const directory = await mkdtemp(
    path.join(tmpdir(), "spotifybu-opus-large-artwork-")
  );
  const coverServer = await startCoverServer(largeCoverImage());
  t.after(async () => {
    await closeServer(coverServer.server);
    await rm(directory, {
      force: true,
      recursive: true
    });
  });

  const filePath = path.join(directory, "provider-source.opus");

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-t",
      "0.1",
      "-codec:a",
      "libopus",
      "-b:a",
      "256k",
      "-metadata",
      "title=Provider Clip Title",
      filePath
    ],
    {
      timeout: 60000
    }
  );

  await tagDownloadedFile(filePath, {
    ...exampleTrack,
    albumImageUrl: coverServer.url,
    albumReleaseDate: "2012-08-07"
  } satisfies BackupTrack);

  const probe = await readAudioProbe(filePath);

  assert.equal(probe.audioCodec, "opus");
  assert.equal(probe.hasAttachedPicture, true);
  assert.equal(probe.tags.title, "Fuck You All The Time - Shlohmo Remix");
  assert.equal(probe.tags.album, "Late Nights With Jeremih");
});

test("fails instead of silently skipping expected Spotify artwork", async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(404, {
      "Content-Type": "text/plain"
    });
    response.end("missing");
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

  await assert.rejects(
    () =>
      tagDownloadedFile("/tmp/spotifybu-missing-artwork.mp3", {
        ...exampleTrack,
        albumImageUrl: `http://127.0.0.1:${address.port}/cover.jpg`
      }),
    /Spotify album artwork was expected but not embedded/
  );
});

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

const exampleTrack = {
  album: "Late Nights With Jeremih",
  albumArtist: "Jeremih",
  albumArtistIds: [],
  albumReleaseDate: "2012",
  artists: ["Jeremih"],
  artistIds: [],
  discNumber: 1,
  durationMs: 245000,
  explicit: true,
  name: "Fuck You All The Time - Shlohmo Remix",
  position: 1,
  trackNumber: 7
} satisfies BackupTrack;

async function readAudioProbe(filePath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
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
    streams?: Array<{
      codec_name?: string;
      codec_type?: string;
      disposition?: {
        attached_pic?: number;
      };
      tags?: Record<string, string>;
    }>;
  };
  const audioStream = body.streams?.find(
    (stream) => stream.codec_type === "audio"
  );

  return {
    audioCodec: audioStream?.codec_name,
    hasAttachedPicture: Boolean(
      body.streams?.some(
        (stream) =>
          stream.codec_type === "video" && stream.disposition?.attached_pic === 1
      )
    ),
    tags: lowerCaseTags(body.format?.tags, audioStream?.tags)
  };
}

async function readAudioTags(filePath: string) {
  return (await readAudioProbe(filePath)).tags;
}

function lowerCaseTags(
  ...tagRecords: Array<Record<string, string> | undefined>
) {
  return Object.fromEntries(
    tagRecords.flatMap((tags) =>
      Object.entries(tags ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value
      ])
    )
  );
}

function defaultCoverImage() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

function largeCoverImage() {
  return Buffer.concat([
    defaultCoverImage(),
    Buffer.alloc(3 * 1024 * 1024, 0)
  ]);
}

async function startCoverServer(image = defaultCoverImage()) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "image/png"
    });
    response.end(image);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert.equal(typeof address, "object");
  assert.ok(address);

  return {
    server,
    url: `http://127.0.0.1:${address.port}/cover.png`
  };
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function metadataArgumentValues(args: string[]) {
  return args.flatMap((arg, index) =>
    arg === "-metadata" && args[index + 1] ? [args[index + 1]] : []
  );
}
