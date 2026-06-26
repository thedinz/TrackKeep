import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { tagDownloadedFile } from "./tagging.ts";
import type { BackupTrack } from "../spotify.ts";

const execFileAsync = promisify(execFile);

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
  artists: ["Jeremih"],
  artistIds: [],
  discNumber: 1,
  durationMs: 245000,
  explicit: true,
  name: "Fuck You All The Time - Shlohmo Remix",
  position: 1,
  trackNumber: 7
} satisfies BackupTrack;

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
