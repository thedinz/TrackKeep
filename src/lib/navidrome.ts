import { execFile } from "child_process";
import { createHash, randomBytes } from "crypto";
import { constants, type Dirent } from "fs";
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  defaultOrganizeNamingSettings,
  loadOrganizeNamingSettings,
  organizeNamingSettingsKey,
  type OrganizeNamingSettings
} from "./organize-settings.ts";
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
  namingSchemeKey?: string;
  skipped?: NavidromeIndexSkip[];
  tracks: NavidromeIndexedTrack[];
  version: 1;
};

export type NavidromeLibraryIndexSummary = {
  generatedAt?: string;
  libraryPath?: string;
  namingSchemeChanged?: boolean;
  namingSchemeKey?: string;
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

export type NaviCleanCanonicalTargetRequestTrack = {
  duration?: number | null;
  relativePath: string;
  size?: number | null;
};

export type NaviCleanCanonicalTarget = {
  album: string;
  albumArtist: string;
  matchedBy?: "duration" | "isrc" | "metadata";
  playlistIds: string[];
  playlistNames: string[];
  sourceRelativePath: string;
  spotifyTrackIds: string[];
  spotifyTrackNames: string[];
  targetRelativePath: string;
};

export type NaviCleanCanonicalTargetConflict = {
  sourceRelativePath: string;
  targets: Array<{
    album?: string;
    albumArtist?: string;
    playlistIds: string[];
    playlistNames?: string[];
    selected?: boolean;
    spotifyTrackIds: string[];
    spotifyTrackNames?: string[];
    targetRelativePath: string;
  }>;
};

export type NaviCleanCanonicalTargetResponse = {
  conflicts: NaviCleanCanonicalTargetConflict[];
  indexGeneratedAt?: string;
  requested: number;
  skippedStale: number;
  targets: NaviCleanCanonicalTarget[];
  warnings: string[];
};

export type NaviCleanTargetConflictResolution = {
  sourceRelativePath: string;
  targetRelativePath: string;
  updatedAt: string;
};

export type NaviCleanTargetConflictsResponse = {
  conflicts: NaviCleanCanonicalTargetConflict[];
  indexGeneratedAt?: string;
  resolvedCount: number;
  unresolvedCount: number;
  warnings: string[];
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
  addedCount?: number;
  appendedCount?: number;
  matchedCount: number;
  mode: NavidromePlaylistSyncMode;
  name: string;
  playlistId?: string;
  removedCount?: number;
  skipped: Array<{
    reason: string;
    trackName: string;
    trackPosition: number;
  }>;
  skippedCount: number;
  songCount: number;
  updated: boolean;
};

export type NavidromePlaylistSyncMode = "append" | "fullsync" | "replace";

const albumFolderLogSegments = [".spotifybu", "album-folders.json"];
const libraryIndexSegments = [".spotifybu", "library-index.json"];
const naviCleanTargetResolutionSegments = [
  ".spotifybu",
  "naviclean-target-resolutions.json"
];
const defaultOrganizeMoveLimit = 15;
const indexValidationConcurrency = 64;
const unknownReleaseYear = "Unknown Year";
const defaultOrganizeNamingSettingsKey = organizeNamingSettingsKey(
  defaultOrganizeNamingSettings
);
const controlCharacters = /[\u0000-\u001f]/g;
const combiningMarks = /[\u0300-\u036f]/g;
const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const unsafePathCharacters = ["\\", "/", "<", ">", "?", "*", "|", "\""];
const pathReplacementCharacters = ["+", "+", "", "", "!", "-", "", ""];
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

export const emptyNavidromeLibraryIndexSummary = {
  stale: true,
  trackCount: 0
} satisfies NavidromeLibraryIndexSummary;

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
  const naming = await loadOrganizeNamingSettings();
  const tracksByAlbum = groupTracksByAlbum(tracks);

  return Array.from(tracksByAlbum.entries()).map(([key, albumTracks]) => {
    const representativeTrack = albumTracks[0];
    const existingFolder = log.albums[key];
    const folderPlan = buildNamingAlbumFolderPlan(representativeTrack, naming);

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
  const naming = await loadOrganizeNamingSettings();
  const tracksByAlbum = groupTracksByAlbum(tracks);
  const now = new Date().toISOString();

  for (const [key, albumTracks] of tracksByAlbum.entries()) {
    const representativeTrack = albumTracks[0];
    const existingFolder = log.albums[key];
    const folderPlan = buildNamingAlbumFolderPlan(representativeTrack, naming);
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
    const summary = emptyNavidromeLibraryIndexSummary;

    lastLibraryIndexSummary = summary;

    return summary;
  }

  const index = await readCurrentNavidromeLibraryIndex();
  const naming = await loadOrganizeNamingSettings();
  const summary = summarizeNavidromeLibraryIndex(
    index,
    libraryPath,
    organizeNamingSettingsKey(naming)
  );

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
    index: lastLibraryIndexSummary ?? emptyNavidromeLibraryIndexSummary,
    startedAt,
    state: "running"
  } satisfies NavidromeLibraryIndexScanStatus;

  libraryIndexScanStatus = scan;
  activeLibraryIndexScan = new Promise<void>((resolve) => {
    setTimeout(() => {
      void scanNavidromeLibraryIndex()
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
          resolve();
        });
    }, 0);
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

export async function readCurrentNavidromeLibraryIndex() {
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
  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);

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
    namingSchemeKey,
    skipped: indexSkipped,
    tracks,
    version: 1
  } satisfies NavidromeLibraryIndex;

  await writeNavidromeLibraryIndex(index);
  const navidromeScan = await requestNavidromeServerScan();

  const summary = {
    ...summarizeNavidromeLibraryIndex(
      index,
      status.libraryPath,
      namingSchemeKey
    ),
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
  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);
  const existingIndex = await readCurrentNavidromeLibraryIndex();
  const reusableIndex =
    existingIndex?.libraryPath === libraryPath ? existingIndex : null;
  const index =
    reusableIndex
      ? reusableIndex
      : ({
          generatedAt: new Date(0).toISOString(),
          libraryPath,
          namingSchemeKey,
          skipped: [],
          tracks: [],
          version: 1
        } satisfies NavidromeLibraryIndex);
  const indexedTrackKey = normalizeRelativePathKey(indexedTrack.relativePath);

  index.generatedAt = new Date().toISOString();
  index.libraryPath = libraryPath;
  index.namingSchemeKey = namingSchemeKey;
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

  const summary = summarizeNavidromeLibraryIndex(
    index,
    libraryPath,
    namingSchemeKey
  );
  lastLibraryIndexSummary = summary;

  return summary;
}

export async function matchNavidromeTracks(tracks: BackupTrack[]) {
  const libraryPath = getNavidromeLibraryPath();
  const index = await readCurrentNavidromeLibraryIndex();
  const naming = await loadOrganizeNamingSettings();

  return matchNavidromeTracksWithIndexUsingSettings(
    tracks,
    libraryPath && index?.libraryPath === libraryPath ? index : null,
    naming
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
  const naming = await loadOrganizeNamingSettings();

  if (!currentIndex) {
    throw new Error("Scan the Navidrome library before organizing matched files.");
  }

  if (currentIndex.libraryPath !== libraryPath) {
    throw new Error("Scan the current Navidrome library before organizing files.");
  }

  const matches = matchNavidromeTracksWithIndexUsingSettings(
    tracks,
    currentIndex,
    naming
  );
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
    namingSchemeKey: organizeNamingSettingsKey(naming),
    tracks: updatedTracks.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    )
  } satisfies NavidromeLibraryIndex;

  await writeNavidromeLibraryIndex(updatedIndex);
  const libraryMatches = matchNavidromeTracksWithIndexUsingSettings(
    tracks,
    updatedIndex,
    naming
  );

  return {
    attemptedCount: batchCandidates.length,
    libraryMatches,
    movedCount,
    remainingMoveCount: libraryMatches.filter((match) => match.needsMove).length,
    skippedCount,
    summary: summarizeNavidromeLibraryIndex(
      updatedIndex,
      libraryPath,
      organizeNamingSettingsKey(naming)
    )
  } satisfies NavidromeTrackOrganizationResult;
}

export async function buildNaviCleanCanonicalTargets(
  requestedTracks: NaviCleanCanonicalTargetRequestTrack[]
): Promise<NaviCleanCanonicalTargetResponse> {
  const requestedByRelativePath = new Map(
    requestedTracks
      .filter((track) => track.relativePath)
      .map((track) => [normalizeRelativePathKey(track.relativePath), track])
  );

  if (requestedByRelativePath.size === 0) {
    return {
      conflicts: [],
      requested: 0,
      skippedStale: 0,
      targets: [],
      warnings: []
    };
  }

  const collection = await collectNaviCleanTargetCandidates(requestedByRelativePath);
  const response: NaviCleanCanonicalTargetResponse = {
    conflicts: [],
    requested: requestedByRelativePath.size,
    skippedStale: collection.skippedStale,
    targets: [],
    warnings: collection.warnings
  };

  if (!collection.index) {
    return response;
  }

  const resolutions = await readNaviCleanTargetResolutions();

  for (const [sourceKey, candidates] of collection.candidatesBySourcePath) {
    const candidatesByTarget = mergeNaviCleanTargetCandidates(candidates);

    if (candidatesByTarget.length === 1) {
      response.targets.push(candidatesByTarget[0]);
      continue;
    }

    const resolvedTarget = resolvedNaviCleanTargetCandidate(
      candidatesByTarget,
      resolutions.get(sourceKey)
    );

    if (resolvedTarget) {
      response.targets.push(resolvedTarget);
    } else {
      response.conflicts.push(
        naviCleanConflictFromCandidates(candidates[0].sourceRelativePath, candidatesByTarget)
      );
    }
  }

  response.targets.sort((left, right) =>
    left.sourceRelativePath.localeCompare(right.sourceRelativePath)
  );
  response.conflicts.sort((left, right) =>
    left.sourceRelativePath.localeCompare(right.sourceRelativePath)
  );

  return {
    ...response,
    indexGeneratedAt: collection.index.generatedAt
  };
}

export async function getNaviCleanTargetConflicts(): Promise<NaviCleanTargetConflictsResponse> {
  const collection = await collectNaviCleanTargetCandidates(null);
  const response: NaviCleanTargetConflictsResponse = {
    conflicts: [],
    resolvedCount: 0,
    unresolvedCount: 0,
    warnings: collection.warnings
  };

  if (!collection.index) {
    return response;
  }

  const resolutions = await readNaviCleanTargetResolutions();

  for (const [sourceKey, candidates] of collection.candidatesBySourcePath) {
    const candidatesByTarget = mergeNaviCleanTargetCandidates(candidates);

    if (candidatesByTarget.length <= 1) {
      continue;
    }

    const resolution = resolutions.get(sourceKey);
    const conflict = naviCleanConflictFromCandidates(
      candidates[0].sourceRelativePath,
      candidatesByTarget,
      resolution
    );
    const resolved = conflict.targets.some((target) => target.selected);

    response.conflicts.push(conflict);

    if (resolved) {
      response.resolvedCount += 1;
    } else {
      response.unresolvedCount += 1;
    }
  }

  response.conflicts.sort((left, right) =>
    left.sourceRelativePath.localeCompare(right.sourceRelativePath)
  );

  return {
    ...response,
    indexGeneratedAt: collection.index.generatedAt
  };
}

export async function resolveNaviCleanTargetConflict({
  sourceRelativePath,
  targetRelativePath
}: {
  sourceRelativePath: string;
  targetRelativePath?: string | null;
}) {
  const sourceKey = normalizeRelativePathKey(sourceRelativePath);

  if (!sourceKey) {
    throw new Error("Choose a source file before saving a NaviClean target resolution.");
  }

  const conflicts = await getNaviCleanTargetConflicts();
  const conflict = conflicts.conflicts.find(
    (item) => normalizeRelativePathKey(item.sourceRelativePath) === sourceKey
  );

  if (!conflict) {
    throw new Error("SpotifyBU could not find an active target conflict for that file.");
  }

  const resolutions = await readNaviCleanTargetResolutions();

  if (!targetRelativePath) {
    resolutions.delete(sourceKey);
    await writeNaviCleanTargetResolutions(resolutions);
    return getNaviCleanTargetConflicts();
  }

  const selectedTarget = conflict.targets.find(
    (target) =>
      normalizeRelativePathKey(target.targetRelativePath) ===
      normalizeRelativePathKey(targetRelativePath)
  );

  if (!selectedTarget) {
    throw new Error("Choose one of SpotifyBU's target options before saving.");
  }

  resolutions.set(sourceKey, {
    sourceRelativePath: conflict.sourceRelativePath,
    targetRelativePath: selectedTarget.targetRelativePath,
    updatedAt: new Date().toISOString()
  });
  await writeNaviCleanTargetResolutions(resolutions);

  return getNaviCleanTargetConflicts();
}

type NaviCleanTargetCandidateCollection = {
  candidatesBySourcePath: Map<string, NaviCleanCanonicalTarget[]>;
  index: NavidromeLibraryIndex | null;
  skippedStale: number;
  warnings: string[];
};

async function collectNaviCleanTargetCandidates(
  requestedByRelativePath: Map<string, NaviCleanCanonicalTargetRequestTrack> | null
): Promise<NaviCleanTargetCandidateCollection> {
  const collection: NaviCleanTargetCandidateCollection = {
    candidatesBySourcePath: new Map(),
    index: null,
    skippedStale: 0,
    warnings: []
  };
  const index = await readCurrentNavidromeLibraryIndex();

  if (!index) {
    collection.warnings.push(
      "SpotifyBU has no Navidrome library index. Scan the Navidrome library in SpotifyBU first."
    );
    return collection;
  }

  collection.index = index;

  const { getLatestPlaylistBackupSnapshots } = await import("./backup-store.ts");
  const snapshots = Object.values(getLatestPlaylistBackupSnapshots());

  if (snapshots.length === 0) {
    collection.warnings.push("SpotifyBU has no saved Spotify metadata backups yet.");
    return collection;
  }

  const naming = await loadOrganizeNamingSettings();

  for (const snapshot of snapshots) {
    const matches = matchNavidromeTracksWithIndexUsingSettings(
      snapshot.tracks,
      index,
      naming
    );

    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      const match = matches[matchIndex];
      const spotifyTrack = snapshot.tracks[matchIndex];
      const matchedTrack = match.matchedTrack;

      if (!spotifyTrack || !matchedTrack) {
        continue;
      }

      const sourceKey = normalizeRelativePathKey(matchedTrack.relativePath);
      const requestedTrack = requestedByRelativePath?.get(sourceKey);

      if (requestedByRelativePath && !requestedTrack) {
        continue;
      }

      if (
        requestedTrack &&
        !naviCleanRequestMatchesIndexedTrack(requestedTrack, matchedTrack)
      ) {
        collection.skippedStale += 1;
        continue;
      }

      const organizationPlan = buildTrackOrganizationPlan(
        spotifyTrack,
        matchedTrack,
        naming
      );
      const currentCandidates = collection.candidatesBySourcePath.get(sourceKey) ?? [];

      currentCandidates.push({
        album: spotifyTrack.album || "",
        albumArtist: spotifyTrack.albumArtist || "",
        matchedBy: match.matchedBy,
        playlistIds: [snapshot.playlistId],
        playlistNames: [snapshot.playlistName],
        sourceRelativePath: matchedTrack.relativePath,
        spotifyTrackIds: spotifyTrack.id ? [spotifyTrack.id] : [],
        spotifyTrackNames: [spotifyTrack.name],
        targetRelativePath: organizationPlan.recommendedRelativePath
      });
      collection.candidatesBySourcePath.set(sourceKey, currentCandidates);
    }
  }

  return collection;
}

function resolvedNaviCleanTargetCandidate(
  candidates: NaviCleanCanonicalTarget[],
  resolution?: NaviCleanTargetConflictResolution
) {
  if (!resolution) {
    return null;
  }

  const resolvedKey = normalizeRelativePathKey(resolution.targetRelativePath);

  return candidates.find(
    (candidate) => normalizeRelativePathKey(candidate.targetRelativePath) === resolvedKey
  ) ?? null;
}

function naviCleanConflictFromCandidates(
  sourceRelativePath: string,
  candidates: NaviCleanCanonicalTarget[],
  resolution?: NaviCleanTargetConflictResolution
): NaviCleanCanonicalTargetConflict {
  const selectedKey = resolution
    ? normalizeRelativePathKey(resolution.targetRelativePath)
    : "";

  return {
    sourceRelativePath,
    targets: candidates.map((candidate) => {
      const targetRelativePath = candidate.targetRelativePath;

      return {
        album: candidate.album,
        albumArtist: candidate.albumArtist,
        playlistIds: candidate.playlistIds,
        playlistNames: candidate.playlistNames,
        selected:
          Boolean(selectedKey) &&
          normalizeRelativePathKey(targetRelativePath) === selectedKey,
        spotifyTrackIds: candidate.spotifyTrackIds,
        spotifyTrackNames: candidate.spotifyTrackNames,
        targetRelativePath
      };
    })
  };
}

async function readNaviCleanTargetResolutions() {
  const libraryPath = getNavidromeLibraryPath();
  const resolutions = new Map<string, NaviCleanTargetConflictResolution>();

  if (!libraryPath) {
    return resolutions;
  }

  try {
    const contents = await readFile(
      path.join(
        /* turbopackIgnore: true */ libraryPath,
        ...naviCleanTargetResolutionSegments
      ),
      "utf8"
    );
    const parsed = JSON.parse(contents) as {
      resolutions?: Record<string, Partial<NaviCleanTargetConflictResolution>>;
      version?: number;
    };

    if (parsed.version !== 1 || !parsed.resolutions) {
      return resolutions;
    }

    for (const value of Object.values(parsed.resolutions)) {
      if (
        typeof value.sourceRelativePath !== "string" ||
        typeof value.targetRelativePath !== "string" ||
        typeof value.updatedAt !== "string"
      ) {
        continue;
      }

      resolutions.set(normalizeRelativePathKey(value.sourceRelativePath), {
        sourceRelativePath: value.sourceRelativePath,
        targetRelativePath: value.targetRelativePath,
        updatedAt: value.updatedAt
      });
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return resolutions;
    }

    throw error;
  }

  return resolutions;
}

async function writeNaviCleanTargetResolutions(
  resolutions: Map<string, NaviCleanTargetConflictResolution>
) {
  const resolutionDirectory = await ensureNavidromeTargetDirectory([".spotifybu"]);
  const payload = {
    resolutions: Object.fromEntries(
      Array.from(resolutions.entries()).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    updatedAt: new Date().toISOString(),
    version: 1
  };

  await writeFile(
    path.join(
      /* turbopackIgnore: true */ resolutionDirectory,
      "naviclean-target-resolutions.json"
    ),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

export async function createOrUpdateNavidromePlaylistFromSpotify(
  playlist: PlaylistSummary,
  tracks: BackupTrack[],
  options: {
    mode?: NavidromePlaylistSyncMode;
  } = {}
) {
  if (!tracks.length) {
    throw new Error("Load Spotify playlist tracks before creating a Navidrome playlist.");
  }

  await navidromeApiRequest("ping");

  const mode = normalizePlaylistSyncMode(options.mode);
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
  const existingSongIds =
    (mode === "append" || mode === "fullsync") && existingPlaylist?.id
      ? await getNavidromePlaylistSongIds(existingPlaylist.id)
      : [];
  const existingSongIdSet = new Set(existingSongIds);
  const appendSongIds =
    mode === "append"
      ? songIds.filter((songId) => !existingSongIdSet.has(songId))
      : songIds;

  if (mode === "fullsync" && existingPlaylist?.id) {
    const addedCount = countPlaylistSongsAdded(existingSongIds, songIds);
    const removedCount = countPlaylistSongsRemoved(existingSongIds, songIds);

    if (!orderedSongIdsEqual(existingSongIds, songIds)) {
      await fullSyncNavidromePlaylist(existingPlaylist.id, existingSongIds, songIds);
    }

    const updatedPlaylist =
      (await getNavidromePlaylist(existingPlaylist.id)) ?? existingPlaylist;

    return {
      addedCount,
      matchedCount: songIds.length,
      mode,
      name: updatedPlaylist.name ?? name,
      playlistId: updatedPlaylist.id,
      removedCount,
      skipped,
      skippedCount: skipped.length,
      songCount: updatedPlaylist.songCount ?? songIds.length,
      updated: true
    } satisfies NavidromePlaylistSyncResult;
  }

  if (mode === "append" && existingPlaylist?.id) {
    if (appendSongIds.length) {
      await navidromeApiRequest("updatePlaylist", {
        playlistId: existingPlaylist.id,
        songIdToAdd: appendSongIds
      });
    }

    const updatedPlaylist =
      (await getNavidromePlaylist(existingPlaylist.id)) ?? existingPlaylist;

    return {
      appendedCount: appendSongIds.length,
      matchedCount: songIds.length,
      mode,
      name: updatedPlaylist.name ?? name,
      playlistId: updatedPlaylist.id,
      skipped,
      skippedCount: skipped.length,
      songCount:
        updatedPlaylist.songCount ??
        existingSongIds.length + appendSongIds.length,
      updated: true
    } satisfies NavidromePlaylistSyncResult;
  }

  const playlistResponse = await navidromeApiRequest("createPlaylist", {
    name,
    ...(existingPlaylist?.id ? { playlistId: existingPlaylist.id } : {}),
    songId: songIds
  });
  const createdPlaylist = playlistResponse.playlist;

  return {
    addedCount: mode === "fullsync" ? songIds.length : undefined,
    appendedCount: mode === "append" ? appendSongIds.length : undefined,
    matchedCount: songIds.length,
    mode,
    name: createdPlaylist?.name ?? name,
    playlistId: createdPlaylist?.id ?? existingPlaylist?.id,
    removedCount: mode === "fullsync" ? 0 : undefined,
    skipped,
    skippedCount: skipped.length,
    songCount: createdPlaylist?.songCount ?? songIds.length,
    updated: Boolean(existingPlaylist?.id)
  } satisfies NavidromePlaylistSyncResult;
}

async function fullSyncNavidromePlaylist(
  playlistId: string,
  existingSongIds: string[],
  desiredSongIds: string[]
) {
  const songIndexToRemove = existingSongIds
    .map((_songId, index) => String(index))
    .reverse();

  if (songIndexToRemove.length) {
    await navidromeApiRequest("updatePlaylist", {
      playlistId,
      songIndexToRemove
    });
  }

  if (desiredSongIds.length) {
    await navidromeApiRequest("updatePlaylist", {
      playlistId,
      songIdToAdd: desiredSongIds
    });
  }
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

function buildNamingAlbumFolderPlan(
  track: BackupTrack,
  naming: OrganizeNamingSettings
) {
  const destination = buildNamingTrackDestination(track, naming, "");
  const relativeDirectory = destination.relativeDirectory;
  const segments = relativeDirectory.split("/").filter(Boolean);

  return {
    albumFolderName: segments.at(-1) ?? destination.fileBase,
    artistFolderName: segments[0] ?? buildDefaultArtistFolderName(track),
    relativePath: relativeDirectory || buildDefaultArtistFolderName(track)
  };
}

function buildDefaultArtistFolderName(track: BackupTrack) {
  return cleanPathToken(track.albumArtist || "Unknown Artist", "Unknown Artist");
}

export async function buildNavidromeTrackFileBase(
  track: BackupTrack,
  matchedTrack?: NavidromeIndexedTrack
) {
  const naming = await loadOrganizeNamingSettings();

  return buildNavidromeTrackFileBaseWithSettings(track, naming, matchedTrack);
}

function buildNavidromeTrackFileBaseWithSettings(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  matchedTrack?: NavidromeIndexedTrack
): string {
  return buildNamingTrackDestination(track, naming, "", matchedTrack).fileBase;
}

function buildOrganizedTrackRelativePath(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  matchedTrack: NavidromeIndexedTrack,
  relativeDirectory = buildNamingAlbumFolderPlan(track, naming).relativePath
) {
  const extension = path.posix.extname(matchedTrack.fileName);
  const renderedPath = buildNamingTrackDestination(
    track,
    naming,
    extension,
    matchedTrack
  ).relativePath;

  return path.posix.join(relativeDirectory, path.posix.basename(renderedPath));
}

function buildNamingTrackDestination(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  extension: string,
  matchedTrack?: NavidromeIndexedTrack
): {
  fileBase: string;
  relativeDirectory: string;
  relativePath: string;
} {
  const relativePath = buildTemplateRelativeTrackPath(track, naming, extension, matchedTrack);
  const parsed = path.posix.parse(relativePath);
  const relativeDirectory = parsed.dir === "." ? "" : parsed.dir;

  return {
    fileBase: parsed.name || "Unknown Track",
    relativeDirectory,
    relativePath
  };
}

function buildTemplateRelativeTrackPath(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  extension: string,
  matchedTrack?: NavidromeIndexedTrack
): string {
  const tokens = toNamingTemplateTokens(track, matchedTrack);
  const renderedArtist = renderNamingTemplate(
    naming.artistFolderFormat || "{Artist Name}",
    tokens
  );
  const renderedTrack = renderNamingTemplate(
    selectNamingTrackFormat(track, naming, matchedTrack),
    tokens
  );
  const segments = [
    ...pathSegmentsFromNamingTemplate(renderedArtist, naming),
    ...pathSegmentsFromNamingTemplate(renderedTrack, naming)
  ];
  const fileBase = segments.pop() || "Unknown Track";

  return path.posix.join(...segments, `${fileBase}${extension}`);
}

function selectNamingTrackFormat(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  matchedTrack?: NavidromeIndexedTrack
) {
  const mediumNumber = track.discNumber ?? matchedTrack?.discNumber ?? 1;
  const isMultiDisc = mediumNumber > 1;

  if (isMultiDisc && naming.multiDiscTrackFormat) {
    return naming.multiDiscTrackFormat;
  }

  return naming.standardTrackFormat || "{track:00} - {Track Title}";
}

function toNamingTemplateTokens(
  track: BackupTrack,
  matchedTrack?: NavidromeIndexedTrack
) {
  const artist =
    track.artists[0] ||
    matchedTrack?.artist ||
    matchedTrack?.artists[0] ||
    track.albumArtist ||
    "Unknown Artist";
  const albumArtist = track.albumArtist || matchedTrack?.albumArtist || artist;
  const album = track.album || matchedTrack?.album || "Unknown Album";
  const title = track.name || matchedTrack?.title || "Unknown Track";
  const trackNumber =
    track.trackNumber ?? matchedTrack?.trackNumber ?? track.position ?? 0;
  const mediumNumber = track.discNumber ?? matchedTrack?.discNumber ?? 1;
  const originalFilename = matchedTrack
    ? path.posix.parse(matchedTrack.fileName).name
    : title;

  return {
    albumartistname: albumArtist,
    albumcleantitle: cleanTitleToken(album),
    albumcleantitlethe: cleanTitleToken(titleThe(album)),
    albumtitle: album,
    albumtitlethe: titleThe(album),
    albumtype: albumTypeToken(track),
    artistcleanname: cleanTitleToken(albumArtist),
    artistcleannamethe: cleanTitleToken(titleThe(albumArtist)),
    artistname: albumArtist,
    artistnamethe: titleThe(albumArtist),
    customformats: "",
    medium: String(mediumNumber),
    mediumformat: "CD",
    mediainfoaudiobitrate: "",
    mediainfoaudiobitspersample: "",
    mediainfoaudiochannels: "",
    mediainfoaudiocodec: "",
    mediainfoaudiosamplerate: "",
    originalfilename: originalFilename,
    originaltitle: title,
    preferredwords: "",
    qualityfull: "",
    qualityproper: "",
    qualitytitle: "",
    releasegroup: "",
    releaseyear: releaseYear(track),
    track: String(trackNumber),
    trackartistmbid: "",
    trackartistname: artist,
    trackcleantitle: cleanTitleToken(title),
    tracktitle: title
  } satisfies Record<string, string>;
}

function renderNamingTemplate(
  template: string,
  tokens: Record<string, string>
) {
  return template.replace(/\{([^{}]+)}/g, (_match, rawToken: string) => {
    const { format, key, prefix, suffix } = parseNamingTemplateToken(rawToken);
    const value = formatNamingTokenValue(tokens[key] ?? "", format);

    if (!value) {
      return "";
    }

    return `${prefix}${tokenValueForPath(value)}${suffix}`;
  });
}

function parseNamingTemplateToken(rawToken: string) {
  const trimmed = rawToken.trim();
  const optional = trimmed.match(/^([([_])(.+?)([)\]_])$/);
  const prefix = optional?.[1] || "";
  const suffix = optional?.[3] || "";
  const body = optional?.[2] || trimmed;
  const separator = body.indexOf(":");
  const name = separator >= 0 ? body.slice(0, separator) : body;
  const format = separator >= 0 ? body.slice(separator + 1) : "";

  return {
    format,
    key: normalizeNamingTemplateTokenName(name),
    prefix,
    suffix
  };
}

function normalizeNamingTemplateTokenName(value: string) {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

function formatNamingTokenValue(value: string, format: string) {
  if (!format) {
    return value;
  }

  if (/^0+$/.test(format) && /^\d+$/.test(value)) {
    return value.padStart(format.length, "0");
  }

  const truncate = Number.parseInt(format, 10);

  if (Number.isFinite(truncate) && truncate !== 0) {
    return truncate > 0 ? value.slice(0, truncate) : value.slice(truncate);
  }

  return value;
}

function tokenValueForPath(value: string) {
  return value.replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim();
}

function pathSegmentsFromNamingTemplate(
  value: string,
  naming: OrganizeNamingSettings
) {
  return value
    .split(/[\\/]+/)
    .map((segment) => sanitizeNamingTemplateSegment(segment, naming))
    .filter(Boolean);
}

function sanitizeNamingTemplateSegment(
  value: string,
  naming: OrganizeNamingSettings
) {
  let segment = value
    .normalize("NFKD")
    .replace(combiningMarks, "")
    .replace(/\s+/g, " ")
    .trim();

  segment = replaceTemplateColon(segment, naming);

  for (let index = 0; index < unsafePathCharacters.length; index += 1) {
    segment = segment.replaceAll(
      unsafePathCharacters[index],
      naming.replaceIllegalCharacters ? pathReplacementCharacters[index] : ""
    );
  }

  segment = segment
    .replace(controlCharacters, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
  segment = collapseEmptyNamingTemplateParts(segment);

  if (!segment || segment === "." || segment === "..") {
    return "";
  }

  if (reservedWindowsNames.test(segment)) {
    segment = `_${segment}`;
  }

  return segment.slice(0, 180).trim();
}

function collapseEmptyNamingTemplateParts(value: string) {
  let compacted = value;
  let previous = "";

  while (compacted !== previous) {
    previous = compacted;
    compacted = compacted.replace(/\s+-\s*-\s+/g, " - ");
  }

  return compacted.replace(/^\s*-\s*/, "").replace(/\s*-\s*$/, "").trim();
}

function replaceTemplateColon(value: string, naming: OrganizeNamingSettings) {
  if (!naming.replaceIllegalCharacters) {
    return value.replaceAll(":", "");
  }

  if (naming.colonReplacementFormat === 1) {
    return value.replaceAll(":", "-");
  }

  if (naming.colonReplacementFormat === 2) {
    return value.replaceAll(":", " -");
  }

  if (naming.colonReplacementFormat === 3) {
    return value.replaceAll(":", " - ");
  }

  if (naming.colonReplacementFormat === 4) {
    return value.replaceAll(": ", " - ").replaceAll(":", "-");
  }

  return value.replaceAll(":", "");
}

function cleanTitleToken(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(combiningMarks, "")
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim() || value
  );
}

function titleThe(value: string) {
  const match = value.match(/^(the)\s+(.+)$/i);

  return match ? `${match[2]}, ${match[1]}` : value;
}

function cleanPathToken(value: string, fallback: string) {
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

function albumTypeToken(track: BackupTrack) {
  const albumType = (track.albumType ?? "").trim().toLowerCase();

  if (!albumType) {
    return "";
  }

  if (albumType === "album") {
    return "Album";
  }

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

  return titleCaseAlbumType(albumType);
}

function titleCaseAlbumType(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function releaseYear(track: BackupTrack) {
  return track.albumReleaseDate?.match(/^\d{4}/)?.[0] ?? unknownReleaseYear;
}

function parseStructuredAlbumDirectory(
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
    track ? buildDefaultArtistFolderName(track) : undefined,
    parentArtistFolderName
  ].filter((artist): artist is string => Boolean(artist));

  for (const artistFolderName of artistCandidates) {
    const prefix = `${artistFolderName} - `;

    if (!albumFolderName.toLowerCase().startsWith(prefix.toLowerCase())) {
      continue;
    }

    const parsed = parseStructuredAlbumFolderRemainder(
      artistFolderName,
      albumFolderName.slice(prefix.length)
    );

    if (parsed) {
      return parsed;
    }
  }

  const fallbackStandardMatch = albumFolderName.match(
    /^(?<artist>.+?) - (?<album>.+?)\s+\((?<releaseYear>\d{4}|Unknown Year)\)$/
  );

  if (
    fallbackStandardMatch?.groups &&
    structuredArtistMatches(
      fallbackStandardMatch.groups.artist,
      parentArtistFolderName,
      track
    )
  ) {
    return {
      album: fallbackStandardMatch.groups.album,
      albumKey: pathTokenKey(fallbackStandardMatch.groups.album),
      albumType: "",
      artist: fallbackStandardMatch.groups.artist,
      artistKey: pathTokenKey(fallbackStandardMatch.groups.artist),
      releaseYear: fallbackStandardMatch.groups.releaseYear
    };
  }

  const fallbackMatch = albumFolderName.match(
    /^(?<artist>.+?) - (?:(?<albumType>.+?) - )?(?<releaseYear>\d{4}|Unknown Year) - (?<album>.+)$/
  );

  if (!fallbackMatch?.groups) {
    return null;
  }

  return {
    album: fallbackMatch.groups.album,
    albumKey: pathTokenKey(fallbackMatch.groups.album),
    albumType: fallbackMatch.groups.albumType ?? "",
    artist: fallbackMatch.groups.artist,
    artistKey: pathTokenKey(fallbackMatch.groups.artist),
    releaseYear: fallbackMatch.groups.releaseYear
  };
}

function structuredArtistMatches(
  artist: string,
  parentArtistFolderName: string,
  track?: BackupTrack
) {
  const artistKey = pathTokenKey(artist);
  const expectedArtistKeys = [
    track?.albumArtist,
    parentArtistFolderName
  ]
    .filter((value): value is string => Boolean(value))
    .map(pathTokenKey);

  return expectedArtistKeys.includes(artistKey);
}

function parseStructuredAlbumFolderRemainder(
  artistFolderName: string,
  remainder: string
) {
  const standard = remainder.match(/^(?<album>.+?)\s+\((?<releaseYear>\d{4}|Unknown Year)\)$/);

  if (standard?.groups) {
    return {
      album: standard.groups.album,
      albumKey: pathTokenKey(standard.groups.album),
      albumType: "",
      artist: artistFolderName,
      artistKey: pathTokenKey(artistFolderName),
      releaseYear: standard.groups.releaseYear
    };
  }

  const parts = remainder.split(" - ");

  if (parts.length < 2) {
    return null;
  }

  const hasAlbumType = !isReleaseYearToken(parts[0]);
  const albumType = hasAlbumType ? parts[0] : "";
  const releaseYear = hasAlbumType ? parts[1] : parts[0];
  const albumParts = parts.slice(hasAlbumType ? 2 : 1);
  const album = albumParts.join(" - ");

  if (!isReleaseYearToken(releaseYear) || !album) {
    return null;
  }

  return {
    album,
    albumKey: pathTokenKey(album),
    albumType,
    artist: artistFolderName,
    artistKey: pathTokenKey(artistFolderName),
    releaseYear
  };
}

function isReleaseYearToken(value: string) {
  return /^(?:\d{4}|Unknown Year)$/.test(value);
}

function pathTokenKey(value: string) {
  return cleanTitleToken(value).toLowerCase();
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
  libraryPath: string,
  namingSchemeKey: string
) {
  if (!index) {
    return {
      libraryPath,
      namingSchemeChanged: true,
      namingSchemeKey,
      stale: true,
      trackCount: 0
    } satisfies NavidromeLibraryIndexSummary;
  }

  const indexNamingSchemeKey =
    index.namingSchemeKey ?? defaultOrganizeNamingSettingsKey;
  const namingSchemeChanged = indexNamingSchemeKey !== namingSchemeKey;

  return {
    generatedAt: index.generatedAt,
    libraryPath,
    namingSchemeChanged,
    namingSchemeKey: indexNamingSchemeKey,
    skippedCount: index.skipped?.length,
    skippedExamples: index.skipped?.slice(0, 3),
    stale: index.libraryPath !== libraryPath || namingSchemeChanged,
    trackCount: index.tracks.length
  } satisfies NavidromeLibraryIndexSummary;
}

async function findNavidromePlaylistByName(name: string) {
  const response = await navidromeApiRequest("getPlaylists");
  const playlists = arrayFrom(response.playlists?.playlist);
  const nameKey = normalizeText(name);

  return playlists.find((playlist) => normalizeText(playlist.name) === nameKey);
}

async function getNavidromePlaylist(playlistId: string) {
  const response = await navidromeApiRequest("getPlaylist", {
    id: playlistId
  });

  return response.playlist;
}

async function getNavidromePlaylistSongIds(playlistId: string) {
  const playlist = await getNavidromePlaylist(playlistId);

  return arrayFrom(playlist?.entry)
    .map((song) => song.id)
    .filter((songId): songId is string => Boolean(songId));
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

function normalizePlaylistSyncMode(
  mode?: NavidromePlaylistSyncMode
): NavidromePlaylistSyncMode {
  if (mode === "append" || mode === "fullsync") {
    return mode;
  }

  return "replace";
}

function orderedSongIdsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((songId, index) => songId === right[index])
  );
}

function countPlaylistSongsAdded(existingSongIds: string[], desiredSongIds: string[]) {
  return countPlaylistSongDifference(desiredSongIds, existingSongIds);
}

function countPlaylistSongsRemoved(
  existingSongIds: string[],
  desiredSongIds: string[]
) {
  return countPlaylistSongDifference(existingSongIds, desiredSongIds);
}

function countPlaylistSongDifference(sourceSongIds: string[], comparisonSongIds: string[]) {
  const comparisonCounts = new Map<string, number>();
  let count = 0;

  for (const songId of comparisonSongIds) {
    comparisonCounts.set(songId, (comparisonCounts.get(songId) ?? 0) + 1);
  }

  for (const songId of sourceSongIds) {
    const remainingCount = comparisonCounts.get(songId) ?? 0;

    if (remainingCount > 0) {
      comparisonCounts.set(songId, remainingCount - 1);
      continue;
    }

    count += 1;
  }

  return count;
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
  entry?: NavidromeApiSong[] | NavidromeApiSong;
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
  const usePost =
    endpoint === "createPlaylist" ||
    endpoint === "updatePlaylist" ||
    encodedParams.length > 1800;
  const timeoutMs =
    endpoint === "createPlaylist" || endpoint === "updatePlaylist" ? 15000 : 5000;

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
  const structuredFolder = parseStructuredAlbumDirectory(parsedPath.dir);
  const folderMatch = folderName.match(/^(?<artist>.+?)\s+-\s+(?<album>.+)$/);
  const trackNumbers = inferTrackNumbersFromFileName(parsedPath.name);
  const title = cleanTrackFileName(parsedPath.name);
  const artist =
    structuredFolder?.artist ?? folderMatch?.groups?.artist?.trim();
  const album = structuredFolder?.album ?? folderMatch?.groups?.album?.trim();

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
  const combinedDiscTrackMatch = value.match(/^\s*(?<medium>\d{2})(?<track>\d{2})\s*[-_. ]+/);

  if (combinedDiscTrackMatch?.groups) {
    return {
      discNumber: parsePositiveInteger(combinedDiscTrackMatch.groups.medium),
      trackNumber: parsePositiveInteger(combinedDiscTrackMatch.groups.track)
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

export async function matchNavidromeTracksWithIndex(
  tracks: BackupTrack[],
  index: NavidromeLibraryIndex | null
) {
  const naming = await loadOrganizeNamingSettings();

  return matchNavidromeTracksWithIndexUsingSettings(tracks, index, naming);
}

function matchNavidromeTracksWithIndexUsingSettings(
  tracks: BackupTrack[],
  index: NavidromeLibraryIndex | null,
  naming: OrganizeNamingSettings
) {
  const indexedTracks = index?.tracks ?? [];
  const lookup = buildNavidromeTrackLookup(indexedTracks);

  return tracks.map((track) => {
    const expectedFolder = buildNamingAlbumFolderPlan(track, naming).relativePath;
    const match = findIndexedTrackMatch(track, lookup, naming);

    if (!match) {
      return {
        exists: false,
        expectedFolder,
        needsMove: false,
        trackId: track.id,
        trackPosition: track.position
      } satisfies NavidromeTrackMatch;
    }

    const organizationPlan = buildTrackOrganizationPlan(
      track,
      match.track,
      naming
    );

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
  matchedTrack: NavidromeIndexedTrack,
  naming: OrganizeNamingSettings
) {
  const expectedFolder = buildNamingAlbumFolderPlan(track, naming).relativePath;
  const renderedRelativePath = buildOrganizedTrackRelativePath(
    track,
    naming,
    matchedTrack,
    expectedFolder
  );

  return {
    expectedFolder,
    needsMove:
      normalizeRelativePathKey(matchedTrack.relativePath) !==
      normalizeRelativePathKey(renderedRelativePath),
    recommendedRelativePath: renderedRelativePath
  };
}

function findIndexedTrackMatch(
  track: BackupTrack,
  lookup: NavidromeTrackLookup,
  naming: OrganizeNamingSettings
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
      "isrc",
      naming
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
    "metadata",
    naming
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
    "duration",
    naming
  );

  if (durationMatch) {
    return durationMatch;
  }

  const flexibleMetadataMatch = bestIndexedTrackMatch(
    track,
    lookup.albumMatches
      .get(album)
      ?.filter(
        (candidate) =>
          hasArtistOverlap(artists, candidate.artistKeys) &&
          indexedTrackTitleMatches(track, candidate.track)
      ),
    "metadata",
    naming
  );

  if (flexibleMetadataMatch) {
    return flexibleMetadataMatch;
  }

  const flexibleArtistMatch = bestIndexedTrackMatch(
    track,
    indexedArtistCandidates(artists, lookup).filter((candidate) =>
      indexedTrackTitleMatches(track, candidate.track)
    ),
    "metadata",
    naming
  );

  if (flexibleArtistMatch) {
    return flexibleArtistMatch;
  }

  return null;
}

function indexedArtistCandidates(
  artists: Set<string>,
  lookup: NavidromeTrackLookup
) {
  const candidates = new Map<string, NavidromeTrackLookupEntry>();

  for (const artist of artists) {
    for (const candidate of lookup.artistMatches.get(artist) ?? []) {
      candidates.set(candidate.track.relativePath, candidate);
    }
  }

  return Array.from(candidates.values());
}

function bestIndexedTrackMatch(
  track: BackupTrack,
  candidates: NavidromeTrackLookupEntry[] | undefined,
  matchedBy: "duration" | "isrc" | "metadata",
  naming: OrganizeNamingSettings
) {
  const bestCandidate = candidates
    ?.map((candidate) => ({
      candidate,
      score: indexedTrackMatchScore(track, candidate.track, naming)
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

function indexedTrackTitleMatches(
  track: BackupTrack,
  indexedTrack: NavidromeIndexedTrack
) {
  if (!titleKeysCompatible(track.name, indexedTrack.title, [
    track.album,
    indexedTrack.album
  ])) {
    return false;
  }

  const sameTrackNumber =
    typeof track.trackNumber === "number" &&
    typeof indexedTrack.trackNumber === "number" &&
    track.trackNumber === indexedTrack.trackNumber;

  return sameTrackNumber || durationCloseEnough(track.durationMs, indexedTrack.durationMs);
}

function titleKeysCompatible(
  left: string,
  right: string,
  contexts: Array<string | undefined>
) {
  const leftKeys = titleMatchKeys(left, contexts);
  const rightKeys = titleMatchKeys(right, contexts);

  for (const leftKey of leftKeys) {
    for (const rightKey of rightKeys) {
      if (
        leftKey === rightKey ||
        titleTokenCoverage(leftKey, rightKey) >= 0.85 ||
        titleTokenCoverage(rightKey, leftKey) >= 0.85
      ) {
        return true;
      }
    }
  }

  return false;
}

function titleMatchKeys(value: string | undefined, contexts: Array<string | undefined>) {
  const keys = new Set<string>();
  const base = normalizeText(value);

  if (base) {
    keys.add(base);
  }

  for (const context of contexts) {
    const contextKey = normalizeText(context);

    if (!base || !contextKey || base === contextKey) {
      continue;
    }

    if (base.endsWith(` ${contextKey}`)) {
      keys.add(base.slice(0, -contextKey.length).trim());
    }
  }

  return Array.from(keys).filter(Boolean);
}

function titleTokenCoverage(left: string, right: string) {
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));

  if (!leftTokens.length || !rightTokens.size) {
    return 0;
  }

  const matchingTokens = leftTokens.filter((token) => rightTokens.has(token)).length;

  return matchingTokens / leftTokens.length;
}

function indexedTrackMatchScore(
  track: BackupTrack,
  indexedTrack: NavidromeIndexedTrack,
  naming: OrganizeNamingSettings
) {
  const organizationPlan = buildTrackOrganizationPlan(
    track,
    indexedTrack,
    naming
  );
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
  albumMatches: Map<string, NavidromeTrackLookupEntry[]>;
  artistMatches: Map<string, NavidromeTrackLookupEntry[]>;
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
    albumMatches: new Map<string, NavidromeTrackLookupEntry[]>(),
    artistMatches: new Map<string, NavidromeTrackLookupEntry[]>(),
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

    if (entry.albumKey) {
      appendNavidromeLookupEntry(lookup.albumMatches, entry.albumKey, entry);
    }

    for (const artistKey of entry.artistKeys) {
      appendNavidromeLookupEntry(lookup.artistMatches, artistKey, entry);
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

function naviCleanRequestMatchesIndexedTrack(
  requestedTrack: NaviCleanCanonicalTargetRequestTrack,
  indexedTrack: NavidromeIndexedTrack
) {
  if (
    typeof requestedTrack.size === "number" &&
    requestedTrack.size > 0 &&
    indexedTrack.sizeBytes > 0 &&
    requestedTrack.size !== indexedTrack.sizeBytes
  ) {
    return false;
  }

  if (
    typeof requestedTrack.duration === "number" &&
    requestedTrack.duration > 0 &&
    typeof indexedTrack.durationMs === "number" &&
    !durationCloseEnough(requestedTrack.duration * 1000, indexedTrack.durationMs)
  ) {
    return false;
  }

  return true;
}

function mergeNaviCleanTargetCandidates(candidates: NaviCleanCanonicalTarget[]) {
  const candidatesByTarget = new Map<string, NaviCleanCanonicalTarget>();

  for (const candidate of candidates) {
    const targetKey = normalizeRelativePathKey(candidate.targetRelativePath);
    const existing = candidatesByTarget.get(targetKey);

    if (!existing) {
      candidatesByTarget.set(targetKey, { ...candidate });
      continue;
    }

    existing.playlistIds = uniqueStrings([
      ...existing.playlistIds,
      ...candidate.playlistIds
    ]);
    existing.playlistNames = uniqueStrings([
      ...existing.playlistNames,
      ...candidate.playlistNames
    ]);
    existing.spotifyTrackIds = uniqueStrings([
      ...existing.spotifyTrackIds,
      ...candidate.spotifyTrackIds
    ]);
    existing.spotifyTrackNames = uniqueStrings([
      ...existing.spotifyTrackNames,
      ...candidate.spotifyTrackNames
    ]);
  }

  return Array.from(candidatesByTarget.values()).sort((left, right) =>
    left.targetRelativePath.localeCompare(right.targetRelativePath)
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
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
