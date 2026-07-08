import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  downloadAuthorizedProviderTrack,
  providerDownloadFormatProfiles
} from "./download.ts";
import {
  spotifyBuIdentityMetadataFromTagLookup,
  spotifyBuIdentityVersion
} from "../spotify-identity-tags.ts";
import type { BackupTrack } from "../spotify.ts";

const execFileAsync = promisify(execFile);

test("default provider download profile is M4A/AAC 256k ahead of legacy MP3", () => {
  const m4a = providerDownloadFormatProfiles.m4a;
  const mp3 = providerDownloadFormatProfiles.mp3;

  assert.equal(m4a.container, "M4A");
  assert.equal(m4a.codec, "AAC");
  assert.equal(m4a.bitrate, 256000);
  assert.equal(m4a.defaultQuality, "256");
  assert.equal(m4a.extension, "m4a");
  assert.equal(mp3.container, "MPEG");
  assert.equal(mp3.codec, "MP3");
  assert.equal(mp3.bitrate, 320000);
  assert.equal(mp3.defaultQuality, "320");
  assert.ok(m4a.modernLossyRank > mp3.modernLossyRank);
});

test("provider downloads request m4a/256K and write tagged .m4a files by default", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for download metadata coverage.");
    return;
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "spotifybu-download-"));
  const libraryPath = path.join(tempRoot, "library");
  const configPath = path.join(tempRoot, "config");
  const binPath = path.join(tempRoot, "bin");
  const argsPath = path.join(tempRoot, "yt-dlp-args.json");
  const coverServer = await startCoverServer();

  t.after(async () => {
    await closeServer(coverServer.server);
    await rm(tempRoot, {
      force: true,
      recursive: true
    });
  });

  await writeFakeYtDlp(binPath);

  await withEnvironment(
    {
      MUSIC_LIBRARY_PATH: libraryPath,
      PATH: `${binPath}${path.delimiter}${process.env.PATH ?? ""}`,
      SPOTIFYBU_CONFIG_DIR: configPath,
      SPOTIFYBU_FAKE_YTDLP_ARGS_PATH: argsPath
    },
    async () => {
      const result = await downloadAuthorizedProviderTrack({
        bulkRiskAccepted: true,
        providerId: "youtube",
        rightsConfirmed: true,
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        track: {
          ...exampleTrack,
          albumReleaseDate: "2026-02-03",
          albumImageUrl: coverServer.url,
          id: "4uLU6hMCjMI75M1A2tKUQC",
          isrc: "USABC1234567",
          spotifyUri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
        }
      });

      assert.equal(result.format, "m4a");
      assert.equal(result.quality, "256");
      assert.ok(result.destinationPath.endsWith(".m4a"));
      assert.ok(result.relativePath?.endsWith(".m4a"));
      await stat(result.destinationPath);

      const ytDlpInvocation = JSON.parse(
        await readFile(argsPath, "utf8")
      ) as FakeYtDlpInvocation;
      assert.equal(optionAfter(ytDlpInvocation.args, "--audio-format"), "m4a");
      assert.equal(optionAfter(ytDlpInvocation.args, "--audio-quality"), "256K");
      assert.equal(ytDlpInvocation.audioFormat, "m4a");
      assert.equal(ytDlpInvocation.audioQuality, "256K");
      assert.ok(ytDlpInvocation.outputPath.endsWith(".m4a"));

      const probe = await readAudioProbe(result.destinationPath);
      const tags = lowerCaseTags(probe.format?.tags);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio"
      );
      const coverStream = probe.streams?.find(
        (stream) => stream.codec_type === "video"
      );

      assert.equal(audioStream?.codec_name, "aac");
      assert.equal(coverStream?.disposition?.attached_pic, 1);
      assert.match(probe.format?.format_name ?? "", /mp4/i);
      assert.equal(tags.title, "Opening");
      assert.equal(tags.artist, "Example Artist");
      assert.equal(tags.album, "Example Record");
      assert.equal(tags.album_artist, "Example Artist");
      assert.equal(tags.track, "1");
      assert.equal(tags.disc, "1");
      assert.equal(tags.date, "2026-02-03");
      assert.ok(tags.comment?.startsWith("SpotifyBU identity "));
      const identityMetadata = spotifyBuIdentityMetadataFromTagLookup((keys) =>
        tagValue(tags, keys)
      );
      assert.equal(identityMetadata.spotifyIsrc, "USABC1234567");
      assert.equal(
        identityMetadata.spotifyTrackId,
        "4uLU6hMCjMI75M1A2tKUQC"
      );
      assert.equal(
        identityMetadata.spotifyTrackUri,
        "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
      );
      assert.equal(
        identityMetadata.spotifybuIdentityVersion,
        spotifyBuIdentityVersion
      );
    }
  );
});

type FakeYtDlpInvocation = {
  args: string[];
  audioFormat: string;
  audioQuality: string;
  outputPath: string;
};

const exampleTrack = {
  album: "Example Record",
  albumArtist: "Example Artist",
  albumArtistIds: [],
  albumReleaseDate: "2026",
  artists: ["Example Artist"],
  artistIds: [],
  discNumber: 1,
  durationMs: 180000,
  explicit: false,
  name: "Opening",
  position: 1,
  trackNumber: 1
} satisfies BackupTrack;

async function writeFakeYtDlp(directory: string) {
  await mkdir(directory, {
    recursive: true
  });
  await writeFile(
    path.join(directory, "yt-dlp"),
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const optionAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const audioFormat = optionAfter("--audio-format") || "m4a";
const audioQuality = optionAfter("--audio-quality") || "256K";
const outputTemplate = optionAfter("--output");

if (!outputTemplate) {
  console.error("missing --output");
  process.exit(2);
}

const outputPath = outputTemplate.replace("%(ext)s", audioFormat);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

if (process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH) {
  fs.writeFileSync(
    process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH,
    JSON.stringify({ args, audioFormat, audioQuality, outputPath }, null, 2)
  );
}

const codec = audioFormat === "mp3" ? "libmp3lame" : "aac";
const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    "0.25",
    "-codec:a",
    codec,
    "-b:a",
    audioQuality.toLowerCase(),
    outputPath
  ],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }
);

if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || "ffmpeg failed");
  process.exit(result.status || 1);
}

console.log(outputPath);
`,
    {
      mode: 0o755
    }
  );
  await chmod(path.join(directory, "yt-dlp"), 0o755);
}

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

  return JSON.parse(stdout.toString()) as {
    format?: {
      format_name?: string;
      tags?: Record<string, string>;
    };
    streams?: Array<{
      codec_name?: string;
      codec_type?: string;
      disposition?: {
        attached_pic?: number;
      };
    }>;
  };
}

function lowerCaseTags(tags: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(tags ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function optionAfter(args: string[], name: string) {
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
}

function tagValue(tags: Record<string, string>, keys: readonly string[]) {
  for (const key of keys) {
    const value = tags[key.toLowerCase()];

    if (value) {
      return value;
    }
  }

  return undefined;
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

async function startCoverServer() {
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
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

async function withEnvironment(
  values: Record<string, string>,
  run: () => Promise<void>
) {
  const previousValues = new Map(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  try {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }

    await run();
  } finally {
    for (const [key, value] of previousValues) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}
