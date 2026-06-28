import { execFile } from "child_process";
import { constants } from "fs";
import { access, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  spotifyBuIdentityMetadataEntries,
  spotifyBuIdentityMetadataForTrack
} from "@/lib/spotify-identity-tags";
import type { BackupTrack } from "@/lib/spotify";

const execFileAsync = promisify(execFile);

export async function tagDownloadedFile(filePath: string, track: BackupTrack) {
  const parsedPath = path.parse(filePath);
  const tempPath = path.join(
    /* turbopackIgnore: true */ parsedPath.dir,
    `${parsedPath.name}.spotifybu-tagging${parsedPath.ext}`
  );
  const metadataArgs = spotifyAudioMetadataArgs(track);
  let coverPath: string | null = null;

  try {
    coverPath = await downloadSpotifyAlbumCover(
      parsedPath.dir,
      parsedPath.name,
      track.albumImageUrl
    );
    await writeTaggedAudioFile(filePath, tempPath, metadataArgs, coverPath);
    await rename(tempPath, filePath);
  } catch (error) {
    await removeTaggingTempPath(tempPath);
    throw new Error(formatSpotifyTaggingError(error, Boolean(track.albumImageUrl)));
  } finally {
    if (coverPath) {
      await rm(coverPath, {
        force: true
      }).catch(() => undefined);
    }
  }
}

export async function tagAudioFileWithSpotifyIdentity(
  filePath: string,
  track: BackupTrack
) {
  const parsedPath = path.parse(filePath);
  const tempPath = path.join(
    /* turbopackIgnore: true */ parsedPath.dir,
    `${parsedPath.name}.spotifybu-identity${parsedPath.ext}`
  );

  try {
    await writeIdentityTaggedAudioFile(
      filePath,
      tempPath,
      spotifyIdentityMetadataArgs(track)
    );
    await rename(tempPath, filePath);
  } catch (error) {
    await removeTaggingTempPath(tempPath);
    throw new Error(formatSpotifyIdentityTaggingError(error));
  }
}

export function spotifyAudioMetadataArgs(track: BackupTrack) {
  const metadataArgs = [
    "-metadata",
    `title=${track.name}`,
    "-metadata",
    `artist=${track.artists.join("; ")}`,
    "-metadata",
    `album=${track.album}`,
    "-metadata",
    `album_artist=${track.albumArtist}`,
    "-metadata",
    `track=${track.trackNumber ?? track.position}`,
    "-metadata",
    `disc=${track.discNumber ?? 1}`
  ];

  if (track.isrc) {
    metadataArgs.push("-metadata", `isrc=${track.isrc}`);
  }

  metadataArgs.push(...spotifyIdentityMetadataArgs(track));

  return metadataArgs;
}

export function spotifyIdentityMetadataArgs(track: BackupTrack) {
  return spotifyBuIdentityMetadataEntries(
    spotifyBuIdentityMetadataForTrack(track)
  ).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]);
}

async function writeTaggedAudioFile(
  filePath: string,
  tempPath: string,
  metadataArgs: string[],
  coverPath: string | null
) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      filePath,
      ...(coverPath ? ["-i", coverPath] : []),
      "-map",
      "0:a:0",
      ...(coverPath ? ["-map", "1:v:0"] : []),
      "-map_metadata",
      "-1",
      "-c:a",
      "copy",
      ...(coverPath
        ? [
            "-c:v",
            "mjpeg",
            "-disposition:v:0",
            "attached_pic",
            "-metadata:s:v",
            "title=Album cover",
            "-metadata:s:v",
            "comment=Cover (front)"
          ]
        : []),
      ...containerMetadataArgs(tempPath),
      ...id3MetadataArgs(tempPath),
      ...metadataArgs,
      tempPath
    ],
    {
      maxBuffer: 1024 * 1024 * 2,
      timeout: 60000
    }
  );
}

async function writeIdentityTaggedAudioFile(
  filePath: string,
  tempPath: string,
  metadataArgs: string[]
) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      filePath,
      "-map",
      "0",
      "-map_metadata",
      "0",
      "-c",
      "copy",
      ...containerMetadataArgs(tempPath),
      ...id3MetadataArgs(tempPath),
      ...metadataArgs,
      tempPath
    ],
    {
      maxBuffer: 1024 * 1024 * 2,
      timeout: 60000
    }
  );
}

function containerMetadataArgs(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".m4a" || extension === ".m4b" || extension === ".mp4") {
    return ["-movflags", "use_metadata_tags"];
  }

  return [];
}

function id3MetadataArgs(filePath: string) {
  return path.extname(filePath).toLowerCase() === ".mp3"
    ? ["-id3v2_version", "3"]
    : [];
}

async function downloadSpotifyAlbumCover(
  directory: string,
  fileBase: string,
  imageUrl?: string
) {
  if (!imageUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(imageUrl);
  } catch (error) {
    throw new Error(
      `Spotify album artwork URL was invalid: ${errorMessage(error)}`
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Spotify album artwork must use an HTTP or HTTPS URL.");
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`unexpected content type ${contentType}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (!bytes.length) {
      throw new Error("empty response body");
    }

    const coverPath = path.join(
      /* turbopackIgnore: true */ directory,
      `${fileBase}.spotifybu-cover${coverExtension(contentType)}`
    );

    await writeFile(coverPath, bytes);

    return coverPath;
  } catch (error) {
    throw new Error(
      `Could not download Spotify album artwork: ${errorMessage(error)}`
    );
  }
}

function coverExtension(contentType: string) {
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("png")) {
    return ".png";
  }

  if (normalizedContentType.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}

async function removeTaggingTempPath(tempPath: string) {
  if (await canAccess(tempPath, constants.F_OK)) {
    await rm(tempPath, {
      force: true
    }).catch(() => undefined);
  }
}

async function canAccess(filePath: string, mode: number) {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function formatSpotifyTaggingError(error: unknown, expectedArtwork: boolean) {
  return [
    "Could not write Spotify metadata tags to the downloaded audio file.",
    "The provider source metadata was not accepted as a backup.",
    expectedArtwork ? "Spotify album artwork was expected but not embedded." : "",
    `Tagging failed: ${formatExecFileError(error)}`
  ]
    .filter(Boolean)
    .join(" ");
}

function formatSpotifyIdentityTaggingError(error: unknown) {
  return [
    "Could not write Spotify identity tags to the audio file.",
    `Tagging failed: ${formatExecFileError(error)}`
  ].join(" ");
}

function formatExecFileError(error: unknown) {
  const execError = error as {
    code?: number | string;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
  const output = [
    bufferishToString(execError.stderr),
    bufferishToString(execError.stdout),
    error instanceof Error ? error.message : ""
  ]
    .filter(Boolean)
    .join("\n");
  const diagnosticLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()[0];
  const exitCode =
    execError.code && execError.code !== "ETIMEDOUT"
      ? `exit code ${execError.code}; `
      : "";

  return truncateDiagnostic(`${exitCode}${diagnosticLine || "unknown error"}`);
}

function bufferishToString(value: Buffer | string | undefined) {
  return typeof value === "string" ? value : value?.toString() ?? "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function truncateDiagnostic(value: string) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  return normalizedValue.length > 360
    ? `${normalizedValue.slice(0, 357)}...`
    : normalizedValue;
}
