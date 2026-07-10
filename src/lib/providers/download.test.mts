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

test("default provider download profile is Opus 192k ahead of legacy MP3", () => {
  const opus = providerDownloadFormatProfiles.opus;
  const mp3 = providerDownloadFormatProfiles.mp3;

  assert.equal(opus.container, "Ogg Opus");
  assert.equal(opus.codec, "Opus");
  assert.equal(opus.bitrate, 192000);
  assert.equal(opus.defaultQuality, "192");
  assert.equal(opus.extension, "opus");
  assert.equal(mp3.container, "MPEG");
  assert.equal(mp3.codec, "MP3");
  assert.equal(mp3.bitrate, 320000);
  assert.equal(mp3.defaultQuality, "320");
  assert.ok(opus.modernLossyRank > mp3.modernLossyRank);
});

test("provider downloads request Opus/192K and write tagged .opus files by default", async (t) => {
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

      assert.equal(result.format, "opus");
      assert.equal(result.quality, "192");
      assert.ok(result.destinationPath.endsWith(".opus"));
      assert.ok(result.relativePath?.endsWith(".opus"));
      await stat(result.destinationPath);

      const ytDlpInvocation = JSON.parse(
        await readFile(argsPath, "utf8")
      ) as FakeYtDlpInvocation;
      assert.equal(optionAfter(ytDlpInvocation.args, "--audio-format"), "opus");
      assert.equal(optionAfter(ytDlpInvocation.args, "--audio-quality"), "192K");
      assert.equal(ytDlpInvocation.audioFormat, "opus");
      assert.equal(ytDlpInvocation.audioQuality, "192K");
      assert.ok(ytDlpInvocation.outputPath.endsWith(".opus"));

      const probe = await readAudioProbe(result.destinationPath);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio"
      );
      const coverStream = probe.streams?.find(
        (stream) => stream.codec_type === "video"
      );
      const tags = lowerCaseTags(probe.format?.tags, audioStream?.tags);

      assert.equal(audioStream?.codec_name, "opus");
      assert.equal(coverStream?.disposition?.attached_pic, 1);
      assert.match(probe.format?.format_name ?? "", /ogg/i);
      assert.equal(tags.title, "Opening");
      assert.equal(tags.artist, "Example Artist");
      assert.equal(tags.album, "Example Record");
      assert.equal(tags.album_artist, "Example Artist");
      assert.equal(tags.track, "1");
      assert.equal(tags.disc, "1");
      assert.equal(tags.date, "2026-02-03");
      assert.equal(tags.releasedate, "2026-02-03");
      assert.equal(tags.isrc, "USABC1234567");
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

test("provider downloads fall back from Opus to comparable MP3 quality", async (t) => {
  if (!(await hasCommand("ffmpeg")) || !(await hasCommand("ffprobe"))) {
    t.skip("ffmpeg and ffprobe are required for download fallback coverage.");
    return;
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "spotifybu-download-"));
  const libraryPath = path.join(tempRoot, "library");
  const configPath = path.join(tempRoot, "config");
  const binPath = path.join(tempRoot, "bin");
  const argsPath = path.join(tempRoot, "yt-dlp-args.json");

  t.after(async () => {
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
      SPOTIFYBU_FAKE_YTDLP_APPEND_ARGS: "1",
      SPOTIFYBU_FAKE_YTDLP_FAIL_OPUS: "1",
      SPOTIFYBU_FAKE_YTDLP_ARGS_PATH: argsPath
    },
    async () => {
      const result = await downloadAuthorizedProviderTrack({
        bulkRiskAccepted: true,
        fallbackFormat: "mp3",
        fallbackQuality: "320",
        format: "opus",
        providerId: "youtube",
        quality: "160",
        rightsConfirmed: true,
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        track: exampleTrack
      });

      assert.equal(result.format, "mp3");
      assert.equal(result.quality, "320");
      assert.ok(result.destinationPath.endsWith(".mp3"));
      assert.ok(result.relativePath?.endsWith(".mp3"));
      await stat(result.destinationPath);

      const ytDlpInvocations = JSON.parse(
        await readFile(argsPath, "utf8")
      ) as FakeYtDlpInvocation[];
      assert.equal(ytDlpInvocations.length, 2);
      assert.equal(
        optionAfter(ytDlpInvocations[0].args, "--audio-format"),
        "opus"
      );
      assert.equal(
        optionAfter(ytDlpInvocations[0].args, "--audio-quality"),
        "160K"
      );
      assert.equal(
        optionAfter(ytDlpInvocations[1].args, "--audio-format"),
        "mp3"
      );
      assert.equal(
        optionAfter(ytDlpInvocations[1].args, "--audio-quality"),
        "320K"
      );

      const probe = await readAudioProbe(result.destinationPath);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio"
      );
      assert.equal(audioStream?.codec_name, "mp3");
    }
  );
});

test("provider downloads do not use MP3 fallback when disabled", async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "spotifybu-download-"));
  const libraryPath = path.join(tempRoot, "library");
  const configPath = path.join(tempRoot, "config");
  const binPath = path.join(tempRoot, "bin");
  const argsPath = path.join(tempRoot, "yt-dlp-args.json");

  t.after(async () => {
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
      SPOTIFYBU_FAKE_YTDLP_APPEND_ARGS: "1",
      SPOTIFYBU_FAKE_YTDLP_FAIL_OPUS: "1",
      SPOTIFYBU_FAKE_YTDLP_ARGS_PATH: argsPath
    },
    async () => {
      await assert.rejects(
        () =>
          downloadAuthorizedProviderTrack({
            bulkRiskAccepted: true,
            fallbackFormat: "none",
            format: "opus",
            providerId: "youtube",
            quality: "160",
            rightsConfirmed: true,
            sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            track: exampleTrack
          }),
        /Unknown encoder libopus/
      );

      const ytDlpInvocations = JSON.parse(
        await readFile(argsPath, "utf8")
      ) as FakeYtDlpInvocation[];
      assert.equal(ytDlpInvocations.length, 1);
      assert.equal(
        optionAfter(ytDlpInvocations[0].args, "--audio-format"),
        "opus"
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
const audioFormat = optionAfter("--audio-format") || "opus";
const audioQuality = optionAfter("--audio-quality") || "192K";
const outputTemplate = optionAfter("--output");

if (!outputTemplate) {
  console.error("missing --output");
  process.exit(2);
}

const outputPath = outputTemplate.replace("%(ext)s", audioFormat);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

if (process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH) {
  const invocation = { args, audioFormat, audioQuality, outputPath };

  if (process.env.SPOTIFYBU_FAKE_YTDLP_APPEND_ARGS === "1") {
    let invocations = [];

    try {
      invocations = JSON.parse(
        fs.readFileSync(process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH, "utf8")
      );
    } catch {}

    fs.writeFileSync(
      process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH,
      JSON.stringify([...invocations, invocation], null, 2)
    );
  } else {
    fs.writeFileSync(
      process.env.SPOTIFYBU_FAKE_YTDLP_ARGS_PATH,
      JSON.stringify(invocation, null, 2)
    );
  }
}

if (process.env.SPOTIFYBU_FAKE_YTDLP_FAIL_OPUS === "1" && audioFormat === "opus") {
  console.error("ERROR: Postprocessing: audio conversion failed: Unknown encoder libopus");
  process.exit(1);
}

const codec = audioFormat === "mp3" ? "libmp3lame" : "libopus";
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
      tags?: Record<string, string>;
    }>;
  };
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
