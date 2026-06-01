import { constants } from "fs";
import { access, mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import type { BackupTrack } from "./spotify";

export type NavidromeLibraryState =
  | "not_configured"
  | "missing"
  | "not_directory"
  | "not_readable"
  | "not_writable"
  | "ready"
  | "error";

export type NavidromeLibraryStatus = {
  configured: boolean;
  exists: boolean;
  libraryPath?: string;
  message: string;
  navidromeUrl?: string;
  readable: boolean;
  state: NavidromeLibraryState;
  writable: boolean;
};

export type AlbumFolderLogEntry = {
  album: string;
  albumArtist: string;
  albumId?: string;
  firstSeenAt: string;
  folderName: string;
  folderPath: string;
  key: string;
  lastSeenAt: string;
  source: "spotify";
  trackIds: string[];
};

export type AlbumFolderLog = {
  albums: Record<string, AlbumFolderLogEntry>;
  updatedAt: string;
  version: 1;
};

export type NavidromeFolderPlan = {
  absolutePath?: string;
  album: string;
  albumArtist: string;
  albumId?: string;
  folderName: string;
  key: string;
  logged: boolean;
  relativePath: string;
  trackCount: number;
  trackIds: string[];
};

const albumFolderLogSegments = [".spotifybu", "album-folders.json"];

export function getNavidromeLibraryPath() {
  const configuredPath = process.env.NAVIDROME_LIBRARY_PATH?.trim();

  return configuredPath
    ? path.resolve(/* turbopackIgnore: true */ configuredPath)
    : null;
}

export function getNavidromeUrl() {
  return process.env.NAVIDROME_URL?.trim() || "http://localhost:4533";
}

export async function getNavidromeLibraryStatus() {
  const libraryPath = getNavidromeLibraryPath();
  const navidromeUrl = getNavidromeUrl();

  if (!libraryPath) {
    return {
      configured: false,
      exists: false,
      message: "Set NAVIDROME_LIBRARY_PATH to the music folder Navidrome scans.",
      navidromeUrl,
      readable: false,
      state: "not_configured",
      writable: false
    } satisfies NavidromeLibraryStatus;
  }

  try {
    const libraryStats = await stat(libraryPath);

    if (!libraryStats.isDirectory()) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "NAVIDROME_LIBRARY_PATH exists but is not a directory.",
        navidromeUrl,
        readable: false,
        state: "not_directory",
        writable: false
      } satisfies NavidromeLibraryStatus;
    }

    const readable = await canAccess(libraryPath, constants.R_OK);
    const writable = await canAccess(libraryPath, constants.W_OK);

    if (!readable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot read the configured Navidrome library path.",
        navidromeUrl,
        readable,
        state: "not_readable",
        writable
      } satisfies NavidromeLibraryStatus;
    }

    if (!writable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot write into the Navidrome library path.",
        navidromeUrl,
        readable,
        state: "not_writable",
        writable
      } satisfies NavidromeLibraryStatus;
    }

    return {
      configured: true,
      exists: true,
      libraryPath,
      message: "Ready to stage authorized audio files for Navidrome scanning.",
      navidromeUrl,
      readable,
      state: "ready",
      writable
    } satisfies NavidromeLibraryStatus;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        configured: true,
        exists: false,
        libraryPath,
        message: "NAVIDROME_LIBRARY_PATH does not exist on this server.",
        navidromeUrl,
        readable: false,
        state: "missing",
        writable: false
      } satisfies NavidromeLibraryStatus;
    }

    return {
      configured: true,
      exists: false,
      libraryPath,
      message: "SpotifyBU could not inspect the Navidrome library path.",
      navidromeUrl,
      readable: false,
      state: "error",
      writable: false
    } satisfies NavidromeLibraryStatus;
  }
}

export async function ensureNavidromeTargetDirectory(segments: string[]) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const targetPath = path.resolve(
    /* turbopackIgnore: true */ libraryPath,
    ...segments.map(sanitizePathSegment)
  );
  const relativePath = path.relative(libraryPath, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved Navidrome target escaped the library path.");
  }

  await mkdir(targetPath, {
    recursive: true
  });

  return targetPath;
}

export async function planNavidromeAlbumFolders(tracks: BackupTrack[]) {
  const libraryPath = getNavidromeLibraryPath();
  const log = await readAlbumFolderLog();
  const tracksByAlbum = groupTracksByAlbum(tracks);

  return Array.from(tracksByAlbum.entries()).map(([key, albumTracks]) => {
    const representativeTrack = albumTracks[0];
    const existingFolder = log.albums[key];
    const folderName =
      existingFolder?.folderName ?? buildAlbumFolderName(representativeTrack);
    const relativePath = folderName;

    return {
      absolutePath: libraryPath
        ? path.join(/* turbopackIgnore: true */ libraryPath, relativePath)
        : undefined,
      album: representativeTrack.album || "Unknown Album",
      albumArtist: representativeTrack.albumArtist || "Unknown Artist",
      albumId: representativeTrack.albumId,
      folderName,
      key,
      logged: Boolean(existingFolder),
      relativePath,
      trackCount: albumTracks.length,
      trackIds: albumTracks
        .map((track) => track.id)
        .filter((id): id is string => Boolean(id))
    } satisfies NavidromeFolderPlan;
  });
}

export async function recordNavidromeAlbumFolders(tracks: BackupTrack[]) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const log = await readAlbumFolderLog();
  const tracksByAlbum = groupTracksByAlbum(tracks);
  const now = new Date().toISOString();

  for (const [key, albumTracks] of tracksByAlbum.entries()) {
    const representativeTrack = albumTracks[0];
    const existingFolder = log.albums[key];
    const folderName =
      existingFolder?.folderName ?? buildAlbumFolderName(representativeTrack);
    const folderPath = await ensureNavidromeTargetDirectory([folderName]);
    const trackIds = Array.from(
      new Set([
        ...(existingFolder?.trackIds ?? []),
        ...albumTracks
          .map((track) => track.id)
          .filter((id): id is string => Boolean(id))
      ])
    );

    log.albums[key] = {
      album: representativeTrack.album || "Unknown Album",
      albumArtist: representativeTrack.albumArtist || "Unknown Artist",
      albumId: representativeTrack.albumId,
      firstSeenAt: existingFolder?.firstSeenAt ?? now,
      folderName,
      folderPath,
      key,
      lastSeenAt: now,
      source: "spotify",
      trackIds
    };
  }

  log.updatedAt = now;
  await writeAlbumFolderLog(log);

  return planNavidromeAlbumFolders(tracks);
}

function sanitizePathSegment(segment: string) {
  return (
    segment
      .normalize("NFKD")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Unknown"
  );
}

function buildAlbumFolderName(track: BackupTrack) {
  return sanitizePathSegment(
    `${track.albumArtist || "Unknown Artist"} - ${track.album || "Unknown Album"}`
  );
}

function groupTracksByAlbum(tracks: BackupTrack[]) {
  const tracksByAlbum = new Map<string, BackupTrack[]>();

  for (const track of tracks) {
    const key = getAlbumFolderKey(track);
    const albumTracks = tracksByAlbum.get(key) ?? [];
    albumTracks.push(track);
    tracksByAlbum.set(key, albumTracks);
  }

  return tracksByAlbum;
}

function getAlbumFolderKey(track: BackupTrack) {
  if (track.albumId) {
    return `spotify:album:${track.albumId}`;
  }

  return `spotify:album-name:${stableSlug(
    `${track.albumArtist || "Unknown Artist"}-${track.album || "Unknown Album"}`
  )}`;
}

async function readAlbumFolderLog(): Promise<AlbumFolderLog> {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    return emptyAlbumFolderLog();
  }

  try {
    const contents = await readFile(
      path.join(
        /* turbopackIgnore: true */ libraryPath,
        ...albumFolderLogSegments
      ),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<AlbumFolderLog>;

    if (parsed.version !== 1 || !parsed.albums) {
      return emptyAlbumFolderLog();
    }

    return parsed as AlbumFolderLog;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return emptyAlbumFolderLog();
    }

    throw error;
  }
}

async function writeAlbumFolderLog(log: AlbumFolderLog) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const logDirectory = await ensureNavidromeTargetDirectory([".spotifybu"]);
  await writeFile(
    path.join(/* turbopackIgnore: true */ logDirectory, "album-folders.json"),
    `${JSON.stringify(log, null, 2)}\n`,
    "utf8"
  );
}

function emptyAlbumFolderLog(): AlbumFolderLog {
  return {
    albums: {},
    updatedAt: new Date(0).toISOString(),
    version: 1
  };
}

function stableSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function canAccess(filePath: string, mode: number) {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
