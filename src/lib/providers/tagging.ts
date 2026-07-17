import { execFile } from "child_process";
import { constants } from "fs";
import { access, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  spotifyBuIdentityCommentPrefix,
  spotifyBuIdentityMetadataEntries,
  spotifyBuIdentityMetadataForTrack,
  spotifyBuIdentityTags,
  trackKeepIdentityTags
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

export async function tagAudioFileWithSpotifyBackfillMetadata(
  filePath: string,
  track: BackupTrack
) {
  const parsedPath = path.parse(filePath);
  const tempPath = path.join(
    /* turbopackIgnore: true */ parsedPath.dir,
    `${parsedPath.name}.spotifybu-backfill${parsedPath.ext}`
  );

  try {
    await writeIdentityTaggedAudioFile(
      filePath,
      tempPath,
      spotifyBackfillMetadataArgs(track)
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

  metadataArgs.push(...spotifyNavidromeMetadataArgs(track));
  metadataArgs.push(...spotifyIdentityMetadataArgs(track));

  return metadataArgs;
}

export function spotifyBackfillMetadataArgs(track: BackupTrack) {
  return [
    ...spotifyNavidromeMetadataArgs(track),
    ...spotifyIdentityMetadataArgs(track)
  ];
}

export function spotifyNavidromeMetadataArgs(track: BackupTrack) {
  const metadataArgs: string[] = [];
  const releaseDate = spotifyReleaseDateTag(track.albumReleaseDate);

  if (releaseDate) {
    metadataArgs.push("-metadata", `date=${releaseDate}`);
    metadataArgs.push("-metadata", `releasedate=${releaseDate}`);
  }

  if (isSpotifyCompilationAlbum(track)) {
    metadataArgs.push("-metadata", "compilation=1");
  }

  return metadataArgs;
}

export function spotifyIdentityMetadataArgs(track: BackupTrack) {
  return spotifyBuIdentityMetadataEntries(
    spotifyBuIdentityMetadataForTrack(track)
  ).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]);
}

export function spotifyReleaseDateTag(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  return /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(trimmed) ? trimmed : "";
}

export function isSpotifyCompilationAlbum(track: BackupTrack) {
  return track.albumType?.trim().toLowerCase() === "compilation";
}

async function writeTaggedAudioFile(
  filePath: string,
  tempPath: string,
  metadataArgs: string[],
  coverPath: string | null
) {
  const isOggOpus = isOggOpusPath(tempPath);
  const pictureMetadataPath =
    coverPath && isOggOpus
      ? await writeOggOpusPictureMetadataFile(tempPath, coverPath)
      : null;

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        filePath,
        ...(pictureMetadataPath
          ? ["-f", "ffmetadata", "-i", pictureMetadataPath]
          : []),
        ...(coverPath && !isOggOpus ? ["-i", coverPath] : []),
        "-map",
        "0:a:0",
        ...(coverPath && !isOggOpus ? ["-map", "1:v:0"] : []),
        "-map_metadata",
        pictureMetadataPath ? "1" : "-1",
        "-map_metadata:s:a:0",
        "-1",
        "-c:a",
        "copy",
        ...(coverPath && !isOggOpus
          ? [
              ...coverCodecArgs(tempPath, coverPath),
              "-disposition:v:0",
              "attached_pic",
              "-metadata:s:v",
              "title=Album cover",
              "-metadata:s:v",
              "comment=Cover (front)"
            ]
          : []),
        ...containerMetadataArgs(tempPath, coverPath),
        ...id3MetadataArgs(tempPath),
        ...metadataArgs,
        ...mp4ArtworkIdentityFallbackArgs(tempPath, metadataArgs, coverPath),
        tempPath
      ],
      {
        maxBuffer: 1024 * 1024 * 2,
        timeout: 60000
      }
    );
  } finally {
    if (pictureMetadataPath) {
      await rm(pictureMetadataPath, {
        force: true
      }).catch(() => undefined);
    }
  }
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

function containerMetadataArgs(filePath: string, coverPath?: string | null) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".m4a" || extension === ".m4b" || extension === ".mp4") {
    // ffmpeg drops MP4 attached pictures when use_metadata_tags is enabled.
    return coverPath ? [] : ["-movflags", "use_metadata_tags"];
  }

  return [];
}

function coverCodecArgs(filePath: string, coverPath: string) {
  const audioExtension = path.extname(filePath).toLowerCase();
  const coverExtension = path.extname(coverPath).toLowerCase();
  const isMp4Family =
    audioExtension === ".m4a" ||
    audioExtension === ".m4b" ||
    audioExtension === ".mp4";

  if (
    isMp4Family &&
    coverExtension !== ".jpg" &&
    coverExtension !== ".jpeg"
  ) {
    return ["-c:v", "png"];
  }

  return ["-c:v", "mjpeg"];
}

function mp4ArtworkIdentityFallbackArgs(
  filePath: string,
  metadataArgs: string[],
  coverPath?: string | null
) {
  const extension = path.extname(filePath).toLowerCase();
  const isMp4Family =
    extension === ".m4a" || extension === ".m4b" || extension === ".mp4";

  if (!coverPath || !isMp4Family) {
    return [];
  }

  const metadata = metadataMapFromArgs(metadataArgs);
  const identityMetadata: Record<string, string> = {};

  for (const key of [
    ...Object.values(trackKeepIdentityTags),
    ...Object.values(spotifyBuIdentityTags)
  ]) {
    const value = metadata.get(key);

    if (value) {
      identityMetadata[key] = value;
    }
  }

  if (!Object.keys(identityMetadata).length) {
    return [];
  }

  return [
    "-metadata",
    `comment=${spotifyBuIdentityCommentPrefix}${JSON.stringify(identityMetadata)}`
  ];
}

function metadataMapFromArgs(metadataArgs: string[]) {
  const metadata = new Map<string, string>();

  for (let index = 0; index < metadataArgs.length - 1; index += 1) {
    if (metadataArgs[index] !== "-metadata") {
      continue;
    }

    const metadataValue = metadataArgs[index + 1];
    const separator = metadataValue.indexOf("=");

    if (separator > 0) {
      metadata.set(
        metadataValue.slice(0, separator).toLowerCase(),
        metadataValue.slice(separator + 1)
      );
    }
  }

  return metadata;
}

function id3MetadataArgs(filePath: string) {
  return path.extname(filePath).toLowerCase() === ".mp3"
    ? ["-id3v2_version", "3"]
    : [];
}

function isOggOpusPath(filePath: string) {
  return path.extname(filePath).toLowerCase() === ".opus";
}

async function writeOggOpusPictureMetadataFile(
  audioTempPath: string,
  coverPath: string
) {
  const parsedPath = path.parse(audioTempPath);
  const metadataPath = path.join(
    /* turbopackIgnore: true */ parsedPath.dir,
    `${parsedPath.name}.spotifybu-picture.ffmetadata`
  );
  const pictureBlock = await flacPictureBlockBase64(coverPath);

  await writeFile(
    metadataPath,
    [
      ";FFMETADATA1",
      `METADATA_BLOCK_PICTURE=${escapeFfmetadataValue(pictureBlock)}`,
      ""
    ].join("\n"),
    "utf8"
  );

  return metadataPath;
}

function escapeFfmetadataValue(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\\n")
    .replaceAll("=", "\\=")
    .replaceAll(";", "\\;")
    .replaceAll("#", "\\#");
}

async function flacPictureBlockBase64(coverPath: string) {
  const imageBytes = await readFile(coverPath);
  const mimeBytes = Buffer.from(coverMimeType(coverPath), "utf8");
  const descriptionBytes = Buffer.from("Cover (front)", "utf8");

  return Buffer.concat([
    uint32Be(3),
    uint32Be(mimeBytes.length),
    mimeBytes,
    uint32Be(descriptionBytes.length),
    descriptionBytes,
    uint32Be(0),
    uint32Be(0),
    uint32Be(0),
    uint32Be(0),
    uint32Be(imageBytes.length),
    imageBytes
  ]).toString("base64");
}

function coverMimeType(coverPath: string) {
  const extension = path.extname(coverPath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function uint32Be(value: number) {
  const bytes = Buffer.alloc(4);

  bytes.writeUInt32BE(value);

  return bytes;
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
