import { execFile } from "child_process";
import { createHash, randomBytes } from "crypto";
import { constants, type Dirent } from "fs";
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { BackupTrack, PlaylistSummary } from "./spotify";

export type NavidromeLibraryState =
  | "not_configured"
  | "missing"
  | "not_directory"
  | "not_readable"
  | "not_writable"
  | "ready"
  | "error";

export type NavidromeServerState =
  | "not_configured"
  | "ready"
  | "scan_requested"
  | "auth_failed"
  | "error";

export type NavidromeServerStatus = {
  configured: boolean;
  message: string;
  navidromeUrl: string;
  scanCount?: number;
  scanning?: boolean;
  state: NavidromeServerState;
};

export type NavidromeServerScanResult = NavidromeServerStatus & {
  requested: boolean;
};

export type NavidromeLibraryStatus = {
  configured: boolean;
  exists: boolean;
  libraryPath?: string;
  message: string;
  navidromeUrl?: string;
  readable: boolean;
  server: NavidromeServerStatus;
  state: NavidromeLibraryState;
  writable: boolean;
};

export type AlbumFolderLogEntry = {
  album: string;
  albumArtist: string;
  albumId?: string;
  artistFolderName?: string;
  firstSeenAt: string;
  folderName: string;
  folderPath: string;
  key: string;
  lastSeenAt: string;
  relativePath?: string;
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
  albumFolderName: string;
  artistFolderName: string;
  folderName: string;
  key: string;
  logged: boolean;
  relativePath: string;
  trackCount: number;
  trackIds: string[];
};

export type NavidromeIndexedTrack = {
  album?: string;
  albumArtist?: string;
  artist?: string;
  artists: string[];
  discNumber?: number;
  durationMs?: number;
  fileName: string;
  isrc?: string;
  mtimeMs: number;
  relativeDirectory: string;
  relativePath: string;
  sizeBytes: number;
  source: "mixed" | "path" | "tags";
  title: string;
  trackNumber?: number;
};

export type NavidromeIndexSkip = {
  kind: "directory" | "file";
  reason: string;
  relativePath: string;
};

type NavidromeIndexAudioResult =
  | {
      ok: true;
      track: NavidromeIndexedTrack;
    }
  | {
      ok: false;
      skip: NavidromeIndexSkip;
    };

export type NavidromeLibraryIndex = {
  generatedAt: string;
  libraryPath: string;
  skipped?: NavidromeIndexSkip[];
  tracks: NavidromeIndexedTrack[];
  version: 1;
};

export type NavidromeLibraryIndexSummary = {
  generatedAt?: string;
  libraryPath?: string;
  navidromeScan?: NavidromeServerScanResult;
  skippedCount?: number;
  skippedExamples?: NavidromeIndexSkip[];
  stale: boolean;
  trackCount: number;
};

export type NavidromeLibraryIndexScanState =
  | "failed"
  | "idle"
  | "running"
  | "succeeded";

export type NavidromeLibraryIndexScanStatus = {
  completedAt?: string;
  error?: string;
  id?: string;
  index?: NavidromeLibraryIndexSummary;
  startedAt?: string;
  state: NavidromeLibraryIndexScanState;
};

export type NavidromeTrackMatch = {
  exists: boolean;
  expectedFolder: string;
  matchedBy?: "duration" | "isrc" | "metadata";
  matchedTrack?: NavidromeIndexedTrack;
  needsMove: boolean;
  recommendedRelativePath?: string;
  trackId?: string;
  trackPosition: number;
};

export type NavidromeTrackOrganizationResult = {
  attemptedCount: number;
  libraryMatches: NavidromeTrackMatch[];
  movedCount: number;
  remainingMoveCount: number;
  skippedCount: number;
  summary: NavidromeLibraryIndexSummary;
};

export type NavidromePlaylistSyncResult = {
  matchedCount: number;
  name: string;
  playlistId?: string;
  skipped: Array<{
    reason: string;
    trackName: string;
    trackPosition: number;
  }>;
  skippedCount: number;
  songCount: number;
  updated: boolean;
};

const albumFolderLogSegments = [".spotifybu", "album-folders.json"];
const libraryIndexSegments = [".spotifybu", "library-index.json"];
const defaultOrganizeMoveLimit = 15;
const indexValidationConcurrency = 64;
const unknownLidarrReleaseYear = "Unknown Year";
const audioFileExtensions = new Set([
  ".aac",
  ".aiff",
  ".alac",
  ".ape",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".wma"
]);
const execFileAsync = promisify(execFile);
let activeLibraryIndexScan: Promise<void> | null = null;
let lastLibraryIndexSummary: NavidromeLibraryIndexSummary | null = null;
let libraryIndexScanStatus: NavidromeLibraryIndexScanStatus = {
  state: "idle"
};

export function getNavidromeLibraryPath() {
  const configuredPath = process.env.NAVIDROME_LIBRARY_PATH?.trim();

  return configuredPath
    ? path.resolve(/* turbopackIgnore: true */ configuredPath)
    : null;
}

export function getNavidromeUrl() {
  return process.env.NAVIDROME_URL?.trim() || "http://localhost:4533";
}

function getNavidromeApiCredentials() {
  const username =
    process.env.NAVIDROME_USERNAME?.trim() ||
    process.env.NAVIDROME_USER?.trim() ||
    "";
  const password = process.env.NAVIDROME_PASSWORD ?? "";

  if (!username || !password) {
    return null;
  }

  return {
    password,
    username
  };
}

export async function getNavidromeLibraryStatus() {
  const libraryPath = getNavidromeLibraryPath();
  const navidromeUrl = getNavidromeUrl();
  const server = await getNavidromeServerStatus();

  if (!libraryPath) {
    return {
      configured: false,
      exists: false,
      message: "Set NAVIDROME_LIBRARY_PATH to the music folder Navidrome scans.",
      navidromeUrl,
      readable: false,
      server,
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
        server,
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
        server,
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
        server,
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
      server,
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
        server,
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
      server,
      state: "error",
      writable: false
    } satisfies NavidromeLibraryStatus;
  }
}

export async function getNavidromeServerStatus(): Promise<NavidromeServerStatus> {
  const navidromeUrl = getNavidromeUrl();

  if (!getNavidromeApiCredentials()) {
    return {
      configured: false,
      message:
        "Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD to let SpotifyBU ask Navidrome to rescan.",
      navidromeUrl,
      state: "not_configured"
    };
  }

  try {
    await navidromeApiRequest("ping");
    const scanStatusResponse = await navidromeApiRequest("getScanStatus").catch(
      () => null
    );
    const scanStatus = readNavidromeScanStatus(scanStatusResponse);

    return {
      configured: true,
      message: scanStatus?.scanning
        ? "Connected to Navidrome API; server scan is running."
        : "Connected to Navidrome API.",
      navidromeUrl,
      scanCount: scanStatus?.count,
      scanning: scanStatus?.scanning,
      state: "ready"
    };
  } catch (error) {
    return {
      configured: true,
      message: errorMessage(error),
      navidromeUrl,
      state: isNavidromeAuthError(error) ? "auth_failed" : "error"
    };
  }
}

async function requestNavidromeServerScan(): Promise<NavidromeServerScanResult> {
  const navidromeUrl = getNavidromeUrl();

  if (!getNavidromeApiCredentials()) {
    return {
      configured: false,
      message:
        "SpotifyBU indexed the mounted library. Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD to also request a Navidrome server scan.",
      navidromeUrl,
      requested: false,
      state: "not_configured"
    };
  }

  try {
    await navidromeApiRequest("startScan");
    const scanStatusResponse = await navidromeApiRequest("getScanStatus").catch(
      () => null
    );
    const scanStatus = readNavidromeScanStatus(scanStatusResponse);

    return {
      configured: true,
      message: "SpotifyBU indexed the mounted library and requested a Navidrome server scan.",
      navidromeUrl,
      requested: true,
      scanCount: scanStatus?.count,
      scanning: scanStatus?.scanning,
      state: "scan_requested"
    };
  } catch (error) {
    return {
      configured: true,
      message: `SpotifyBU indexed the mounted library, but could not request a Navidrome server scan: ${errorMessage(
        error
      )}`,
      navidromeUrl,
      requested: false,
      state: isNavidromeAuthError(error) ? "auth_failed" : "error"
    };
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
    const folderPlan = buildLidarrAlbumFolderPlan(representativeTrack);

    return {
      absolutePath: libraryPath
        ? path.join(
            /* turbopackIgnore: true */ libraryPath,
            ...relativePathSegments(folderPlan.relativePath)
          )
        : undefined,
      album: representativeTrack.album || "Unknown Album",
      albumArtist: representativeTrack.albumArtist || "Unknown Artist",
      albumId: representativeTrack.albumId,
      albumFolderName: folderPlan.albumFolderName,
      artistFolderName: folderPlan.artistFolderName,
      folderName: folderPlan.albumFolderName,
      key,
      logged: existingFolder?.relativePath === folderPlan.relativePath,
      relativePath: folderPlan.relativePath,
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
    const folderPlan = buildLidarrAlbumFolderPlan(representativeTrack);
    const folderPath = await ensureNavidromeTargetDirectory(
      relativePathSegments(folderPlan.relativePath)
    );
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
      artistFolderName: folderPlan.artistFolderName,
      firstSeenAt: existingFolder?.firstSeenAt ?? now,
      folderName: folderPlan.albumFolderName,
      folderPath,
      key,
      lastSeenAt: now,
      relativePath: folderPlan.relativePath,
      source: "spotify",
      trackIds
    };
  }

  log.updatedAt = now;
  await writeAlbumFolderLog(log);

  return planNavidromeAlbumFolders(tracks);
}

export async function getNavidromeLibraryIndexSummary() {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    const summary = {
      stale: true,
      trackCount: 0
    } satisfies NavidromeLibraryIndexSummary;

    lastLibraryIndexSummary = summary;

    return summary;
  }

  const index = await readCurrentNavidromeLibraryIndex();
  const summary = summarizeNavidromeLibraryIndex(index, libraryPath);

  lastLibraryIndexSummary = summary;

  return summary;
}

export function getCachedNavidromeLibraryIndexSummary() {
  return lastLibraryIndexSummary;
}

export function getNavidromeLibraryIndexScanStatus() {
  return libraryIndexScanStatus;
}

export function startNavidromeLibraryIndexScan() {
  if (activeLibraryIndexScan) {
    return libraryIndexScanStatus;
  }

  const startedAt = new Date().toISOString();
  const scan = {
    id: randomBytes(8).toString("hex"),
    startedAt,
    state: "running"
  } satisfies NavidromeLibraryIndexScanStatus;

  libraryIndexScanStatus = scan;
  activeLibraryIndexScan = scanNavidromeLibraryIndex()
    .then((index) => {
      libraryIndexScanStatus = {
        ...scan,
        completedAt: new Date().toISOString(),
        index,
        state: "succeeded"
      };
    })
    .catch((error) => {
      libraryIndexScanStatus = {
        ...scan,
        completedAt: new Date().toISOString(),
        error: errorMessage(error),
        state: "failed"
      };
    })
    .finally(() => {
      activeLibraryIndexScan = null;
    });
  void activeLibraryIndexScan;

  return libraryIndexScanStatus;
}

export async function readNavidromeLibraryIndex() {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    return null;
  }

  try {
    const contents = await readFile(
      path.join(/* turbopackIgnore: true */ libraryPath, ...libraryIndexSegments),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<NavidromeLibraryIndex>;

    if (parsed.version !== 1 || !Array.isArray(parsed.tracks)) {
      return null;
    }

    return parsed as NavidromeLibraryIndex;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readCurrentNavidromeLibraryIndex() {
  const libraryPath = getNavidromeLibraryPath();
  const index = await readNavidromeLibraryIndex();

  if (!libraryPath || !index) {
    return index;
  }

  return pruneMissingNavidromeIndexTracks(index, libraryPath);
}

async function pruneMissingNavidromeIndexTracks(
  index: NavidromeLibraryIndex,
  libraryPath: string
) {
  if (index.libraryPath !== libraryPath) {
    return index;
  }

  const tracks = (
    await mapWithConcurrency(
      index.tracks,
      indexValidationConcurrency,
      async (track) => {
        try {
          const filePath = absoluteLibraryPath(libraryPath, track.relativePath);

          return (await canAccess(filePath, constants.F_OK)) ? track : null;
        } catch {
          return null;
        }
      }
    )
  ).filter((track): track is NavidromeIndexedTrack => Boolean(track));

  if (tracks.length === index.tracks.length) {
    return index;
  }

  const updatedIndex = {
    ...index,
    tracks
  } satisfies NavidromeLibraryIndex;

  await writeNavidromeLibraryIndex(updatedIndex).catch(() => undefined);

  return updatedIndex;
}

export async function scanNavidromeLibraryIndex() {
  const status = await getNavidromeLibraryStatus();

  if (status.state !== "ready" || !status.libraryPath) {
    throw new Error(status.message);
  }

  const { audioFilePaths, skipped } = await findAudioFiles(status.libraryPath);
  const indexedResults = await mapWithConcurrency<string, NavidromeIndexAudioResult>(
    audioFilePaths,
    4,
    async (filePath) => {
      try {
        return {
          ok: true,
          track: await indexAudioFile(status.libraryPath, filePath)
        };
      } catch (error) {
        return {
          ok: false,
          skip: skippedIndexEntry(
            status.libraryPath,
            filePath,
            "file",
            errorMessage(error)
          )
        };
      }
    }
  );
  const tracks = indexedResults.flatMap((result) =>
    result.ok ? [result.track] : []
  );
  const indexSkipped = [
    ...skipped,
    ...indexedResults.flatMap((result) =>
      result.ok ? [] : [result.skip]
    )
  ];

  indexSkipped.sort((a, b) =>
    `${a.kind}:${a.relativePath}`.localeCompare(`${b.kind}:${b.relativePath}`)
  );

  const index = {
    generatedAt: new Date().toISOString(),
    libraryPath: status.libraryPath,
    skipped: indexSkipped,
    tracks,
    version: 1
  } satisfies NavidromeLibraryIndex;

  await writeNavidromeLibraryIndex(index);
  const navidromeScan = await requestNavidromeServerScan();

  const summary = {
    ...summarizeNavidromeLibraryIndex(index, status.libraryPath),
    navidromeScan
  } satisfies NavidromeLibraryIndexSummary;

  lastLibraryIndexSummary = summary;

  return summary;
}

export async function upsertNavidromeLibraryIndexTrack(filePath: string) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const targetPath = path.resolve(/* turbopackIgnore: true */ filePath);
  const relativePath = path.relative(libraryPath, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved Navidrome target escaped the library path.");
  }

  const indexedTrack = await indexAudioFile(libraryPath, targetPath);
  const existingIndex = await readCurrentNavidromeLibraryIndex();
  const reusableIndex =
    existingIndex?.libraryPath === libraryPath ? existingIndex : null;
  const index =
    reusableIndex
      ? reusableIndex
      : ({
          generatedAt: new Date(0).toISOString(),
          libraryPath,
          skipped: [],
          tracks: [],
          version: 1
        } satisfies NavidromeLibraryIndex);
  const indexedTrackKey = normalizeRelativePathKey(indexedTrack.relativePath);

  index.generatedAt = new Date().toISOString();
  index.libraryPath = libraryPath;
  index.tracks = [
    ...index.tracks.filter(
      (track) => normalizeRelativePathKey(track.relativePath) !== indexedTrackKey
    ),
    indexedTrack
  ].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  index.skipped = index.skipped?.filter(
    (entry) => normalizeRelativePathKey(entry.relativePath) !== indexedTrackKey
  );

  await writeNavidromeLibraryIndex(index);

  const summary = summarizeNavidromeLibraryIndex(index, libraryPath);
  lastLibraryIndexSummary = summary;

  return summary;
}

export async function matchNavidromeTracks(tracks: BackupTrack[]) {
  const libraryPath = getNavidromeLibraryPath();
  const index = await readCurrentNavidromeLibraryIndex();

  return matchNavidromeTracksWithIndex(
    tracks,
    libraryPath && index?.libraryPath === libraryPath ? index : null
  );
}

export async function organizeNavidromeMatchedTracks(
  tracks: BackupTrack[],
  options: {
    maxMoves?: number;
    trackPositions?: number[];
  } = {}
) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const index = await readNavidromeLibraryIndex();
  const currentIndex = index
    ? await pruneMissingNavidromeIndexTracks(index, libraryPath)
    : null;

  if (!currentIndex) {
    throw new Error("Scan the Navidrome library before organizing matched files.");
  }

  if (currentIndex.libraryPath !== libraryPath) {
    throw new Error("Scan the current Navidrome library before organizing files.");
  }

  const matches = matchNavidromeTracksWithIndex(tracks, currentIndex);
  const trackPositionFilter = normalizeTrackPositionFilter(options.trackPositions);
  const maxMoves = normalizeOrganizeMoveLimit(options.maxMoves);
  const moveCandidates = matches.filter(
    (match) =>
      match.matchedTrack &&
      match.needsMove &&
      match.recommendedRelativePath &&
      (!trackPositionFilter || trackPositionFilter.has(match.trackPosition))
  );
  const batchCandidates = moveCandidates.slice(0, maxMoves);
  let updatedTracks = currentIndex.tracks.map((track) => ({ ...track }));
  const tracksByRelativePath = new Map(
    updatedTracks.map((track) => [
      normalizeRelativePathKey(track.relativePath),
      track
    ])
  );
  const occupiedRelativePaths = new Set(tracksByRelativePath.keys());
  let movedCount = 0;
  let skippedCount = 0;

  for (const match of batchCandidates) {
    const matchedTrack = match.matchedTrack;

    if (!matchedTrack || !match.recommendedRelativePath) {
      continue;
    }

    const sourceRelativePathKey = normalizeRelativePathKey(matchedTrack.relativePath);
    const indexedTrack = tracksByRelativePath.get(sourceRelativePathKey) ?? matchedTrack;
    const sourcePath = absoluteLibraryPath(libraryPath, indexedTrack.relativePath);
    const targetRelativePath = await nextAvailableRelativeTrackPath({
      desiredRelativePath: match.recommendedRelativePath,
      libraryPath,
      occupiedRelativePaths,
      originalRelativePath: indexedTrack.relativePath
    });
    const targetRelativePathKey = normalizeRelativePathKey(targetRelativePath);
    const targetPath = absoluteLibraryPath(libraryPath, targetRelativePath);
    const targetDirectory = relativeDirectoryName(targetRelativePath);

    await ensureNavidromeTargetDirectory(relativePathSegments(targetDirectory));

    try {
      await rename(sourcePath, targetPath);
      const movedTrack = {
        ...indexedTrack,
        fileName: path.posix.basename(targetRelativePath),
        relativeDirectory: targetDirectory,
        relativePath: targetRelativePath
      } satisfies NavidromeIndexedTrack;

      updatedTracks = updatedTracks.map((track) =>
        normalizeRelativePathKey(track.relativePath) === sourceRelativePathKey
          ? movedTrack
          : track
      );
      tracksByRelativePath.delete(sourceRelativePathKey);
      tracksByRelativePath.set(targetRelativePathKey, movedTrack);
      occupiedRelativePaths.delete(sourceRelativePathKey);
      occupiedRelativePaths.add(targetRelativePathKey);
      movedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  const updatedIndex = {
    ...currentIndex,
    generatedAt: new Date().toISOString(),
    tracks: updatedTracks.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    )
  } satisfies NavidromeLibraryIndex;

  await writeNavidromeLibraryIndex(updatedIndex);
  const libraryMatches = matchNavidromeTracksWithIndex(tracks, updatedIndex);

  return {
    attemptedCount: batchCandidates.length,
    libraryMatches,
    movedCount,
    remainingMoveCount: libraryMatches.filter((match) => match.needsMove).length,
    skippedCount,
    summary: summarizeNavidromeLibraryIndex(updatedIndex, libraryPath)
  } satisfies NavidromeTrackOrganizationResult;
}

export async function createOrUpdateNavidromePlaylistFromSpotify(
  playlist: PlaylistSummary,
  tracks: BackupTrack[]
) {
  if (!tracks.length) {
    throw new Error("Load Spotify playlist tracks before creating a Navidrome playlist.");
  }

  await navidromeApiRequest("ping");

  const matches = await matchNavidromeTracks(tracks);
  const songIds: string[] = [];
  const skipped: NavidromePlaylistSyncResult["skipped"] = [];

  for (const track of tracks) {
    const match = matches.find(
      (candidate) => candidate.trackPosition === track.position
    );

    if (!match?.matchedTrack) {
      skipped.push({
        reason: "Track is not backed up in the Navidrome library.",
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    const songId = await resolveNavidromeSongId(track, match.matchedTrack);

    if (!songId) {
      skipped.push({
        reason: "Matched file was not found through the Navidrome API. Scan Navidrome and try again.",
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    songIds.push(songId);
  }

  if (!songIds.length) {
    throw new Error(
      "No backed-up tracks could be resolved to Navidrome songs. Scan SpotifyBU and Navidrome first."
    );
  }

  const name = navidromePlaylistName(playlist);
  const existingPlaylist = await findNavidromePlaylistByName(name);
  const playlistResponse = await navidromeApiRequest("createPlaylist", {
    name,
    ...(existingPlaylist?.id ? { playlistId: existingPlaylist.id } : {}),
    songId: songIds
  });
  const createdPlaylist = playlistResponse.playlist;

  return {
    matchedCount: songIds.length,
    name: createdPlaylist?.name ?? name,
    playlistId: createdPlaylist?.id ?? existingPlaylist?.id,
    skipped,
    skippedCount: skipped.length,
    songCount: createdPlaylist?.songCount ?? songIds.length,
    updated: Boolean(existingPlaylist?.id)
  } satisfies NavidromePlaylistSyncResult;
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

function buildLidarrAlbumFolderPlan(track: BackupTrack) {
  const artistFolderName = buildLidarrArtistFolderName(track);
  const albumFolderName = buildLidarrAlbumFolderName(track, artistFolderName);

  return {
    albumFolderName,
    artistFolderName,
    relativePath: path.posix.join(artistFolderName, albumFolderName)
  };
}

function buildLidarrArtistFolderName(track: BackupTrack) {
  return cleanLidarrToken(track.albumArtist || "Unknown Artist", "Unknown Artist");
}

function buildLidarrAlbumFolderName(
  track: BackupTrack,
  artistFolderName = buildLidarrArtistFolderName(track)
) {
  return [
    artistFolderName,
    lidarrAlbumType(track),
    releaseYear(track),
    cleanLidarrToken(track.album || "Unknown Album", "Unknown Album")
  ].join(" - ");
}

export function buildNavidromeTrackFileBase(
  track: BackupTrack,
  matchedTrack?: NavidromeIndexedTrack
) {
  const mediumNumber = track.discNumber ?? matchedTrack?.discNumber ?? 1;
  const trackNumber =
    track.trackNumber ?? matchedTrack?.trackNumber ?? track.position;
  const prefix = `${padLidarrNumber(mediumNumber)}${padLidarrNumber(trackNumber)}`;

  return `${prefix} - ${cleanLidarrToken(
    track.name || matchedTrack?.title || "Unknown Track",
    "Unknown Track"
  )}`;
}

function buildLidarrTrackRelativePath(
  track: BackupTrack,
  matchedTrack: NavidromeIndexedTrack,
  relativeDirectory = buildLidarrAlbumFolderPlan(track).relativePath
) {
  const extension = path.posix.extname(matchedTrack.fileName);

  return path.posix.join(
    relativeDirectory,
    `${buildNavidromeTrackFileBase(track, matchedTrack)}${extension}`
  );
}

function cleanLidarrToken(value: string, fallback: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || fallback
  );
}

function lidarrAlbumType(track: BackupTrack) {
  const albumType = (track.albumType ?? "").trim().toLowerCase();

  if (albumType === "compilation") {
    return "Compilation";
  }

  if (albumType === "single") {
    return typeof track.albumTracksTotal === "number" &&
      track.albumTracksTotal >= 4 &&
      track.albumTracksTotal <= 7
      ? "EP"
      : "Single";
  }

  if (albumType === "ep") {
    return "EP";
  }

  return albumType ? titleCaseAlbumType(albumType) : "Album";
}

function titleCaseAlbumType(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function releaseYear(track: BackupTrack) {
  return track.albumReleaseDate?.match(/^\d{4}/)?.[0] ?? unknownLidarrReleaseYear;
}

function padLidarrNumber(value: number) {
  return Math.max(0, Math.floor(value)).toString().padStart(2, "0");
}

function parseLidarrAlbumDirectory(
  relativeDirectory: string,
  track?: BackupTrack
) {
  const segments = relativeDirectory.split("/").filter(Boolean);
  const albumFolderName = segments.at(-1);
  const parentArtistFolderName = segments.at(-2);

  if (!albumFolderName || !parentArtistFolderName) {
    return null;
  }

  const artistCandidates = [
    track ? buildLidarrArtistFolderName(track) : undefined,
    parentArtistFolderName
  ].filter((artist): artist is string => Boolean(artist));

  for (const artistFolderName of artistCandidates) {
    const prefix = `${artistFolderName} - `;

    if (!albumFolderName.toLowerCase().startsWith(prefix.toLowerCase())) {
      continue;
    }

    const parsed = parseLidarrAlbumFolderRemainder(
      artistFolderName,
      albumFolderName.slice(prefix.length)
    );

    if (parsed) {
      return parsed;
    }
  }

  const fallbackMatch = albumFolderName.match(
    /^(?<artist>.+?) - (?<albumType>.+?) - (?<releaseYear>\d{4}|Unknown Year) - (?<album>.+)$/
  );

  if (!fallbackMatch?.groups) {
    return null;
  }

  return {
    album: fallbackMatch.groups.album,
    albumKey: lidarrTokenKey(fallbackMatch.groups.album),
    albumType: fallbackMatch.groups.albumType,
    artist: fallbackMatch.groups.artist,
    artistKey: lidarrTokenKey(fallbackMatch.groups.artist),
    releaseYear: fallbackMatch.groups.releaseYear
  };
}

function parseLidarrAlbumFolderRemainder(
  artistFolderName: string,
  remainder: string
) {
  const firstSeparatorIndex = remainder.indexOf(" - ");

  if (firstSeparatorIndex < 0) {
    return null;
  }

  const albumType = remainder.slice(0, firstSeparatorIndex);
  const yearAndAlbum = remainder.slice(firstSeparatorIndex + 3);
  const secondSeparatorIndex = yearAndAlbum.indexOf(" - ");

  if (secondSeparatorIndex < 0) {
    return null;
  }

  const releaseYear = yearAndAlbum.slice(0, secondSeparatorIndex);
  const album = yearAndAlbum.slice(secondSeparatorIndex + 3);

  if (!/^(?:\d{4}|Unknown Year)$/.test(releaseYear) || !album) {
    return null;
  }

  return {
    album,
    albumKey: lidarrTokenKey(album),
    albumType,
    artist: artistFolderName,
    artistKey: lidarrTokenKey(artistFolderName),
    releaseYear
  };
}

function lidarrTokenKey(value: string) {
  return cleanLidarrToken(value, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

function summarizeNavidromeLibraryIndex(
  index: NavidromeLibraryIndex | null,
  libraryPath: string
) {
  if (!index) {
    return {
      libraryPath,
      stale: true,
      trackCount: 0
    } satisfies NavidromeLibraryIndexSummary;
  }

  return {
    generatedAt: index.generatedAt,
    libraryPath,
    skippedCount: index.skipped?.length,
    skippedExamples: index.skipped?.slice(0, 3),
    stale: index.libraryPath !== libraryPath,
    trackCount: index.tracks.length
  } satisfies NavidromeLibraryIndexSummary;
}

async function findNavidromePlaylistByName(name: string) {
  const response = await navidromeApiRequest("getPlaylists");
  const playlists = arrayFrom(response.playlists?.playlist);
  const nameKey = normalizeText(name);

  return playlists.find((playlist) => normalizeText(playlist.name) === nameKey);
}

async function resolveNavidromeSongId(
  track: BackupTrack,
  matchedTrack: NavidromeIndexedTrack
) {
  const queries = Array.from(
    new Set(
      [
        [track.name, track.artists[0]].filter(Boolean).join(" "),
        [matchedTrack.title, matchedTrack.artist].filter(Boolean).join(" "),
        track.name,
        matchedTrack.title
      ]
        .map((query) => query.trim())
        .filter(Boolean)
    )
  );
  const candidates = new Map<string, NavidromeApiSong>();

  for (const query of queries) {
    const response = await navidromeApiRequest("search3", {
      albumCount: "0",
      artistCount: "0",
      query,
      songCount: "25"
    });

    for (const song of arrayFrom(response.searchResult3?.song)) {
      if (song.id) {
        candidates.set(song.id, song);
      }
    }
  }

  let bestMatch: { score: number; song: NavidromeApiSong } | null = null;

  for (const song of candidates.values()) {
    const score = scoreNavidromeSongCandidate(track, matchedTrack, song);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        song
      };
    }
  }

  return bestMatch && bestMatch.score >= 60 ? bestMatch.song.id : null;
}

function scoreNavidromeSongCandidate(
  track: BackupTrack,
  matchedTrack: NavidromeIndexedTrack,
  song: NavidromeApiSong
) {
  if (!song.id) {
    return 0;
  }

  const songPath = normalizeRelativePathKey(song.path ?? "");
  const matchedPath = normalizeRelativePathKey(matchedTrack.relativePath);
  const songTitle = normalizeText(song.title);
  const trackTitle = normalizeText(track.name);
  const matchedTitle = normalizeText(matchedTrack.title);
  let score = 0;

  if (songPath && songPath === matchedPath) {
    score += 100;
  } else if (
    song.path &&
    normalizeText(path.posix.basename(song.path)) ===
      normalizeText(path.posix.basename(matchedTrack.relativePath))
  ) {
    score += 20;
  }

  if (songTitle && (songTitle === trackTitle || songTitle === matchedTitle)) {
    score += 45;
  } else if (
    songTitle &&
    (trackTitle.includes(songTitle) ||
      songTitle.includes(trackTitle) ||
      matchedTitle.includes(songTitle) ||
      songTitle.includes(matchedTitle))
  ) {
    score += 25;
  }

  if (
    hasArtistOverlap(
      new Set(
        [track.albumArtist, ...track.artists]
          .flatMap(splitArtists)
          .map(normalizeText)
          .filter(Boolean)
      ),
      new Set(
        [song.artist, matchedTrack.artist, ...matchedTrack.artists]
          .flatMap(splitArtists)
          .map(normalizeText)
          .filter(Boolean)
      )
    )
  ) {
    score += 25;
  }

  if (normalizeText(song.album) === normalizeText(track.album)) {
    score += 15;
  }

  if (
    typeof song.duration === "number" &&
    durationCloseEnough(track.durationMs, Math.round(song.duration * 1000))
  ) {
    score += 15;
  }

  return score;
}

function navidromePlaylistName(playlist: PlaylistSummary) {
  return playlist.name.trim().slice(0, 120) || `Spotify playlist ${playlist.id}`;
}

function arrayFrom<T>(value: T[] | T | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

const navidromeApiVersion = "1.16.1";
const navidromeApiClient = "SpotifyBU";

type NavidromeSubsonicResponse = {
  "subsonic-response"?: {
    error?: {
      code?: number;
      message?: string;
    };
    playlist?: NavidromeApiPlaylist;
    playlists?: {
      playlist?: NavidromeApiPlaylist[] | NavidromeApiPlaylist;
    };
    scanStatus?: {
      count?: number;
      scanning?: boolean;
    };
    searchResult3?: {
      song?: NavidromeApiSong[] | NavidromeApiSong;
    };
    status?: string;
  };
};

type NavidromeApiPlaylist = {
  id: string;
  name: string;
  songCount?: number;
};

type NavidromeApiSong = {
  album?: string;
  artist?: string;
  duration?: number;
  id?: string;
  path?: string;
  title?: string;
};

class NavidromeApiError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

async function navidromeApiRequest(
  endpoint: string,
  extraParams: Record<string, string | string[]> = {}
) {
  const credentials = getNavidromeApiCredentials();

  if (!credentials) {
    throw new Error("Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD.");
  }

  const salt = randomBytes(8).toString("hex");
  const token = createHash("md5")
    .update(`${credentials.password}${salt}`)
    .digest("hex");
  const apiUrl = new URL(
    `${getNavidromeUrl().replace(/\/+$/, "")}/rest/${endpoint}.view`
  );
  const params = new URLSearchParams({
    c: navidromeApiClient,
    f: "json",
    s: salt,
    t: token,
    u: credentials.username,
    v: navidromeApiVersion
  });

  for (const [key, value] of Object.entries(extraParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    params.set(key, value);
  }

  const encodedParams = params.toString();
  const usePost = endpoint === "createPlaylist" || encodedParams.length > 1800;
  const timeoutMs = endpoint === "createPlaylist" ? 15000 : 5000;

  if (!usePost) {
    apiUrl.search = encodedParams;
  }

  const response = await fetch(apiUrl, {
    body: usePost ? encodedParams : undefined,
    cache: "no-store",
    headers: usePost
      ? {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      : undefined,
    method: usePost ? "POST" : "GET",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NavidromeApiError(navidromeAuthFailureMessage(), 40);
    }

    throw new Error(`Navidrome API returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as NavidromeSubsonicResponse;
  const subsonicResponse = body["subsonic-response"];

  if (!subsonicResponse) {
    throw new Error("Navidrome API response was not a Subsonic response.");
  }

  if (subsonicResponse.status !== "ok") {
    throw new NavidromeApiError(
      navidromeApiErrorMessage(subsonicResponse.error),
      subsonicResponse.error?.code
    );
  }

  return subsonicResponse;
}

function readNavidromeScanStatus(
  response: Awaited<ReturnType<typeof navidromeApiRequest>> | null
) {
  if (!response?.scanStatus) {
    return null;
  }

  return {
    count:
      typeof response.scanStatus.count === "number"
        ? response.scanStatus.count
        : undefined,
    scanning: Boolean(response.scanStatus.scanning)
  };
}

function isNavidromeAuthError(error: unknown) {
  return error instanceof NavidromeApiError && error.code === 40;
}

function errorMessage(error: unknown) {
  if (isNavidromeAuthError(error)) {
    return navidromeAuthFailureMessage();
  }

  return error instanceof Error ? error.message : "Unknown error.";
}

function navidromeApiErrorMessage(error?: { message?: string }) {
  const message = error?.message?.trim();

  if (!message || /^forbidden$/i.test(message)) {
    return navidromeAuthFailureMessage();
  }

  return message;
}

function navidromeAuthFailureMessage() {
  return "Navidrome rejected the configured API credentials. Check NAVIDROME_USERNAME and NAVIDROME_PASSWORD.";
}

async function findAudioFiles(libraryPath: string) {
  const audioFilePaths: string[] = [];
  const skipped: NavidromeIndexSkip[] = [];

  async function walk(directory: string) {
    let entries: Dirent[];

    try {
      entries = await readdir(directory, {
        withFileTypes: true
      });
    } catch (error) {
      skipped.push(
        skippedIndexEntry(libraryPath, directory, "directory", errorMessage(error))
      );
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(/* turbopackIgnore: true */ directory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === ".spotifybu" || entry.name === "@eaDir") {
          continue;
        }

        await walk(entryPath);
        continue;
      }

      if (
        entry.isFile() &&
        audioFileExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        audioFilePaths.push(entryPath);
      }
    }
  }

  await walk(libraryPath);

  return {
    audioFilePaths,
    skipped
  };
}

function skippedIndexEntry(
  libraryPath: string,
  filePath: string,
  kind: NavidromeIndexSkip["kind"],
  reason: string
) {
  return {
    kind,
    reason,
    relativePath: safeLibraryRelativePath(libraryPath, filePath)
  } satisfies NavidromeIndexSkip;
}

function safeLibraryRelativePath(libraryPath: string, filePath: string) {
  try {
    return toLibraryRelativePath(libraryPath, filePath);
  } catch {
    return path.basename(filePath);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(concurrency, items.length)
      },
      () => worker()
    )
  );

  return results;
}

async function indexAudioFile(libraryPath: string, filePath: string) {
  const [fileStats, probe] = await Promise.all([
    stat(filePath),
    probeAudioFile(filePath)
  ]);
  const relativePath = toLibraryRelativePath(libraryPath, filePath);
  const inferred = inferMetadataFromPath(relativePath);
  const tagTitle = tagValue(probe?.tags, ["title"]);
  const tagArtist = tagValue(probe?.tags, ["artist"]);
  const tagAlbumArtist = tagValue(probe?.tags, [
    "album_artist",
    "albumartist",
    "albumartistsort"
  ]);
  const tagAlbum = tagValue(probe?.tags, ["album"]);
  const title = tagTitle || inferred.title;
  const artist = tagArtist || inferred.artist;
  const albumArtist = tagAlbumArtist || tagArtist || inferred.albumArtist;
  const album = tagAlbum || inferred.album;
  const tagArtists = splitArtists(
    tagValue(probe?.tags, ["artists"]) || tagArtist || inferred.artist
  );
  const tagDiscNumber = parsePositiveInteger(
    tagValue(probe?.tags, ["disc", "discnumber"])
  );
  const tagTrackNumber = parsePositiveInteger(
    tagValue(probe?.tags, ["track", "tracknumber"])
  );
  const artists = tagArtists.length ? tagArtists : artist ? [artist] : [];
  const usedTags = Boolean(tagTitle || tagArtist || tagAlbumArtist || tagAlbum);
  const usedPathFallback = Boolean(
    (!tagTitle && inferred.title) ||
      (!tagArtist && inferred.artist) ||
      (!tagAlbumArtist && inferred.albumArtist) ||
      (!tagAlbum && inferred.album)
  );

  return {
    album,
    albumArtist,
    artist,
    artists,
    discNumber: tagDiscNumber ?? inferred.discNumber,
    durationMs: probe?.durationMs,
    fileName: path.posix.basename(relativePath),
    isrc: normalizeIsrc(tagValue(probe?.tags, ["isrc"])),
    mtimeMs: fileStats.mtimeMs,
    relativeDirectory: relativeDirectoryName(relativePath),
    relativePath,
    sizeBytes: fileStats.size,
    source: usedTags ? (usedPathFallback ? "mixed" : "tags") : "path",
    title,
    trackNumber: tagTrackNumber ?? inferred.trackNumber
  } satisfies NavidromeIndexedTrack;
}

async function probeAudioFile(filePath: string) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
      {
        maxBuffer: 1024 * 1024,
        timeout: 10000
      }
    );
    const parsed = JSON.parse(stdout.toString()) as {
      format?: {
        duration?: string;
        tags?: Record<string, string | number>;
      };
    };

    return {
      durationMs: secondsToMilliseconds(parsed.format?.duration),
      tags: normalizeTagMap(parsed.format?.tags)
    };
  } catch {
    return null;
  }
}

function inferMetadataFromPath(relativePath: string) {
  const parsedPath = path.posix.parse(relativePath);
  const folderSegments = parsedPath.dir.split("/").filter(Boolean);
  const folderName = folderSegments.at(-1) ?? "";
  const lidarrFolder = parseLidarrAlbumDirectory(parsedPath.dir);
  const folderMatch = folderName.match(/^(?<artist>.+?)\s+-\s+(?<album>.+)$/);
  const trackNumbers = inferTrackNumbersFromFileName(parsedPath.name);
  const title = cleanTrackFileName(parsedPath.name);
  const artist =
    lidarrFolder?.artist ?? folderMatch?.groups?.artist?.trim();
  const album = lidarrFolder?.album ?? folderMatch?.groups?.album?.trim();

  return {
    album,
    albumArtist: artist,
    artist,
    discNumber: trackNumbers.discNumber,
    trackNumber: trackNumbers.trackNumber,
    title
  };
}

function cleanTrackFileName(value: string) {
  return (
    value
      .replace(/^\s*\d{4}\s*[-_. ]+\s*/, "")
      .replace(/^\s*\d{1,2}[-_.]\d{1,2}\s*[-_. ]+\s*/, "")
      .replace(/^\s*\d{1,3}\s*[-_. ]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim() || value
  );
}

function inferTrackNumbersFromFileName(value: string) {
  const lidarrMatch = value.match(/^\s*(?<medium>\d{2})(?<track>\d{2})\s*[-_. ]+/);

  if (lidarrMatch?.groups) {
    return {
      discNumber: parsePositiveInteger(lidarrMatch.groups.medium),
      trackNumber: parsePositiveInteger(lidarrMatch.groups.track)
    };
  }

  const multiDiscMatch = value.match(
    /^\s*(?<medium>\d{1,2})[-_.](?<track>\d{1,2})\s*[-_. ]+/
  );

  if (multiDiscMatch?.groups) {
    return {
      discNumber: parsePositiveInteger(multiDiscMatch.groups.medium),
      trackNumber: parsePositiveInteger(multiDiscMatch.groups.track)
    };
  }

  const trackMatch = value.match(/^\s*(?<track>\d{1,3})\s*[-_. ]+/);

  return {
    discNumber: undefined,
    trackNumber: parsePositiveInteger(trackMatch?.groups?.track)
  };
}

function normalizeTagMap(tags?: Record<string, string | number>) {
  const tagMap = new Map<string, string>();

  for (const [key, value] of Object.entries(tags ?? {})) {
    tagMap.set(
      key.toLowerCase().replace(/[-\s]+/g, "_"),
      String(value).trim()
    );
  }

  return tagMap;
}

function tagValue(tags: Map<string, string> | undefined | null, keys: string[]) {
  for (const key of keys) {
    const value = tags?.get(key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function secondsToMilliseconds(value?: string) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

function parsePositiveInteger(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value.split("/")[0], 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function splitArtists(value?: string) {
  return (value ?? "")
    .split(/\s*(?:;|\u0000)\s*/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function matchNavidromeTracksWithIndex(
  tracks: BackupTrack[],
  index: NavidromeLibraryIndex | null
) {
  const indexedTracks = index?.tracks ?? [];
  const lookup = buildNavidromeTrackLookup(indexedTracks);

  return tracks.map((track) => {
    const expectedFolder = buildLidarrAlbumFolderPlan(track).relativePath;
    const match = findIndexedTrackMatch(track, lookup);

    if (!match) {
      return {
        exists: false,
        expectedFolder,
        needsMove: false,
        trackId: track.id,
        trackPosition: track.position
      } satisfies NavidromeTrackMatch;
    }

    const organizationPlan = buildTrackOrganizationPlan(track, match.track);

    return {
      exists: true,
      expectedFolder: organizationPlan.expectedFolder,
      matchedBy: match.matchedBy,
      matchedTrack: match.track,
      needsMove: organizationPlan.needsMove,
      recommendedRelativePath: organizationPlan.needsMove
        ? organizationPlan.recommendedRelativePath
        : undefined,
      trackId: track.id,
      trackPosition: track.position
    } satisfies NavidromeTrackMatch;
  });
}

function buildTrackOrganizationPlan(
  track: BackupTrack,
  matchedTrack: NavidromeIndexedTrack
) {
  const compatibleDirectory = compatibleExistingLidarrDirectory(track, matchedTrack);
  const expectedFolder =
    compatibleDirectory ?? buildLidarrAlbumFolderPlan(track).relativePath;
  const recommendedRelativePath = buildLidarrTrackRelativePath(
    track,
    matchedTrack,
    expectedFolder
  );

  return {
    expectedFolder,
    needsMove:
      normalizeRelativePathKey(matchedTrack.relativePath) !==
      normalizeRelativePathKey(recommendedRelativePath),
    recommendedRelativePath
  };
}

function compatibleExistingLidarrDirectory(
  track: BackupTrack,
  matchedTrack: NavidromeIndexedTrack
) {
  const parsedDirectory = parseLidarrAlbumDirectory(
    matchedTrack.relativeDirectory,
    track
  );

  if (!parsedDirectory) {
    return null;
  }

  const expectedArtistKey = lidarrTokenKey(track.albumArtist || "Unknown Artist");
  const expectedAlbumKey = lidarrTokenKey(track.album || "Unknown Album");
  const expectedReleaseYear = releaseYear(track);

  if (
    parsedDirectory.artistKey !== expectedArtistKey ||
    parsedDirectory.albumKey !== expectedAlbumKey
  ) {
    return null;
  }

  if (
    expectedReleaseYear !== unknownLidarrReleaseYear &&
    parsedDirectory.releaseYear !== expectedReleaseYear
  ) {
    return null;
  }

  return matchedTrack.relativeDirectory;
}

function findIndexedTrackMatch(
  track: BackupTrack,
  lookup: NavidromeTrackLookup
) {
  const trackIsrc = normalizeIsrc(track.isrc);
  const title = normalizeText(track.name);
  const album = normalizeText(track.album);
  const artists = normalizedSpotifyArtists(track);

  if (trackIsrc) {
    const match = bestIndexedTrackMatch(
      track,
      lookup.isrcMatches
        .get(trackIsrc)
        ?.filter((candidate) => hasArtistOverlap(artists, candidate.artistKeys)),
      "isrc"
    );

    if (match) {
      return match;
    }
  }

  const metadataMatch = bestIndexedTrackMatch(
    track,
    lookup.metadataMatches
      .get(navidromeMatchLookupKey(title, album))
      ?.filter((candidate) => hasArtistOverlap(artists, candidate.artistKeys)),
    "metadata"
  );

  if (metadataMatch) {
    return metadataMatch;
  }

  const durationMatch = bestIndexedTrackMatch(
    track,
    lookup.titleMatches
      .get(title)
      ?.filter(
        (candidate) =>
          hasArtistOverlap(artists, candidate.artistKeys) &&
          durationCloseEnough(track.durationMs, candidate.track.durationMs)
      ),
    "duration"
  );

  if (durationMatch) {
    return durationMatch;
  }

  return null;
}

function bestIndexedTrackMatch(
  track: BackupTrack,
  candidates: NavidromeTrackLookupEntry[] | undefined,
  matchedBy: "duration" | "isrc" | "metadata"
) {
  const bestCandidate = candidates
    ?.map((candidate) => ({
      candidate,
      score: indexedTrackMatchScore(track, candidate.track)
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.track.relativePath.localeCompare(
          right.candidate.track.relativePath
        )
    )[0]?.candidate;

  return bestCandidate
    ? {
        matchedBy,
        track: bestCandidate.track
      }
    : null;
}

function indexedTrackMatchScore(
  track: BackupTrack,
  indexedTrack: NavidromeIndexedTrack
) {
  const organizationPlan = buildTrackOrganizationPlan(track, indexedTrack);
  let score = 0;

  if (!organizationPlan.needsMove) {
    score += 1000;
  }

  if (
    normalizeRelativePathKey(indexedTrack.relativeDirectory) ===
    normalizeRelativePathKey(organizationPlan.expectedFolder)
  ) {
    score += 100;
  }

  if (durationCloseEnough(track.durationMs, indexedTrack.durationMs)) {
    score += 10;
  }

  if (normalizeText(track.album) === normalizeText(indexedTrack.album)) {
    score += 5;
  }

  return score;
}

type NavidromeTrackLookup = {
  isrcMatches: Map<string, NavidromeTrackLookupEntry[]>;
  metadataMatches: Map<string, NavidromeTrackLookupEntry[]>;
  titleMatches: Map<string, NavidromeTrackLookupEntry[]>;
};

type NavidromeTrackLookupEntry = {
  albumKey: string;
  artistKeys: Set<string>;
  isrcKey?: string;
  titleKey: string;
  track: NavidromeIndexedTrack;
};

function buildNavidromeTrackLookup(
  indexedTracks: NavidromeIndexedTrack[]
): NavidromeTrackLookup {
  const lookup = {
    isrcMatches: new Map<string, NavidromeTrackLookupEntry[]>(),
    metadataMatches: new Map<string, NavidromeTrackLookupEntry[]>(),
    titleMatches: new Map<string, NavidromeTrackLookupEntry[]>()
  } satisfies NavidromeTrackLookup;

  for (const track of indexedTracks) {
    const entry = {
      albumKey: normalizeText(track.album),
      artistKeys: indexedArtists(track),
      isrcKey: normalizeIsrc(track.isrc),
      titleKey: normalizeText(track.title),
      track
    } satisfies NavidromeTrackLookupEntry;

    if (entry.isrcKey) {
      appendNavidromeLookupEntry(lookup.isrcMatches, entry.isrcKey, entry);
    }

    appendNavidromeLookupEntry(
      lookup.metadataMatches,
      navidromeMatchLookupKey(entry.titleKey, entry.albumKey),
      entry
    );

    if (entry.titleKey) {
      appendNavidromeLookupEntry(lookup.titleMatches, entry.titleKey, entry);
    }
  }

  return lookup;
}

function appendNavidromeLookupEntry(
  map: Map<string, NavidromeTrackLookupEntry[]>,
  key: string,
  entry: NavidromeTrackLookupEntry
) {
  const entries = map.get(key);

  if (entries) {
    entries.push(entry);
    return;
  }

  map.set(key, [entry]);
}

function navidromeMatchLookupKey(title: string, album: string) {
  return `${title}\u0000${album}`;
}

function normalizeOrganizeMoveLimit(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultOrganizeMoveLimit;
  }

  return Math.max(1, Math.min(50, Math.floor(value)));
}

function normalizeTrackPositionFilter(trackPositions?: number[]) {
  if (!trackPositions) {
    return null;
  }

  return new Set(
    trackPositions.filter(
      (trackPosition) =>
        Number.isInteger(trackPosition) && trackPosition > 0
    )
  );
}

function normalizedSpotifyArtists(track: BackupTrack) {
  return new Set(
    [track.albumArtist, ...track.artists]
      .map(normalizeText)
      .filter((artist) => artist.length > 0)
  );
}

function indexedArtists(track: NavidromeIndexedTrack) {
  return new Set(
    [track.albumArtist, track.artist, ...track.artists]
      .map(normalizeText)
      .filter((artist) => artist.length > 0)
  );
}

function hasArtistOverlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) {
    return true;
  }

  for (const artist of left) {
    if (right.has(artist)) {
      return true;
    }
  }

  return false;
}

function durationCloseEnough(leftMs: number, rightMs?: number) {
  return typeof rightMs === "number" && Math.abs(leftMs - rightMs) <= 3000;
}

async function nextAvailableRelativeTrackPath({
  desiredRelativePath,
  libraryPath,
  occupiedRelativePaths,
  originalRelativePath
}: {
  desiredRelativePath: string;
  libraryPath: string;
  occupiedRelativePaths: Set<string>;
  originalRelativePath: string;
}) {
  const parsed = path.posix.parse(desiredRelativePath);
  const originalKey = normalizeRelativePathKey(originalRelativePath);

  for (let count = 0; count < 1000; count += 1) {
    const fileName =
      count === 0 ? parsed.base : `${parsed.name} (${count + 1})${parsed.ext}`;
    const candidateRelativePath = path.posix.join(parsed.dir, fileName);
    const candidateKey = normalizeRelativePathKey(candidateRelativePath);

    if (candidateKey === originalKey) {
      return candidateRelativePath;
    }

    if (
      !occupiedRelativePaths.has(candidateKey) &&
      !(await canAccess(absoluteLibraryPath(libraryPath, candidateRelativePath), constants.F_OK))
    ) {
      return candidateRelativePath;
    }
  }

  throw new Error("Could not find an available destination filename.");
}

function toLibraryRelativePath(libraryPath: string, filePath: string) {
  return normalizeRelativePath(path.relative(libraryPath, filePath));
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join("/");
}

function normalizeRelativePathKey(relativePath: string) {
  return normalizeRelativePath(relativePath).toLowerCase();
}

function relativeDirectoryName(relativePath: string) {
  const directory = path.posix.dirname(relativePath);

  return directory === "." ? "" : directory;
}

function relativePathSegments(relativePath: string) {
  return normalizeRelativePath(relativePath).split("/").filter(Boolean);
}

function absoluteLibraryPath(libraryPath: string, relativePath: string) {
  const targetPath = path.resolve(
    /* turbopackIgnore: true */ libraryPath,
    ...relativePath.split("/")
  );
  const resolvedRelativePath = path.relative(libraryPath, targetPath);

  if (
    resolvedRelativePath.startsWith("..") ||
    path.isAbsolute(resolvedRelativePath)
  ) {
    throw new Error("Resolved Navidrome target escaped the library path.");
  }

  return targetPath;
}

async function writeNavidromeLibraryIndex(index: NavidromeLibraryIndex) {
  const indexDirectory = await ensureNavidromeTargetDirectory([".spotifybu"]);

  await writeFile(
    path.join(/* turbopackIgnore: true */ indexDirectory, "library-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
  );
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

function normalizeText(value?: string) {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeIsrc(value?: string) {
  const normalized = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  return normalized || undefined;
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
