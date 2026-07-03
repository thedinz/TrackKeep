import { execFile } from "child_process";
import { createHash, randomBytes } from "crypto";
import { constants, type Dirent } from "fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getLatestPlaylistBackupSnapshots } from "./backup-store";
import {
  defaultOrganizeNamingSettings,
  loadOrganizeNamingSettings,
  organizeNamingSettingsKey,
  type OrganizeNamingSettings
} from "./organize-settings.ts";
import {
  isUnresolvedSpotifyLocalBackupTrack,
  unresolvedSpotifyLocalTrackMessage,
  type BackupTrack,
  type PlaylistSummary
} from "./spotify";
import {
  isSpotifyCompilationAlbum,
  spotifyReleaseDateTag,
  tagAudioFileWithSpotifyBackfillMetadata
} from "./providers/tagging";
import {
  spotifyBuIdentityKeyForTrack,
  spotifyBuIdentityMetadataForTrack,
  spotifyBuIdentityMetadataFromTagLookup,
  spotifyBuIdentityMetadataHasTrackIdentity,
  spotifyBuIdentityVersion,
  type SpotifyBuIdentityMetadata
} from "./spotify-identity-tags";

export type MusicLibraryState =
  | "not_configured"
  | "missing"
  | "not_directory"
  | "not_readable"
  | "not_writable"
  | "ready"
  | "error";

export type MusicServerState =
  | "not_configured"
  | "ready"
  | "scan_requested"
  | "auth_failed"
  | "error";

export type MusicServerStatus = {
  configured: boolean;
  message: string;
  musicLibraryUrl: string;
  scanCount?: number;
  scanning?: boolean;
  state: MusicServerState;
};

export type MusicServerScanResult = MusicServerStatus & {
  requested: boolean;
};

export type MusicLibraryStatus = {
  configured: boolean;
  exists: boolean;
  libraryPath?: string;
  message: string;
  musicLibraryUrl?: string;
  readable: boolean;
  server: MusicServerStatus;
  state: MusicLibraryState;
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

export type MusicLibraryFolderPlan = {
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

export type MusicLibraryTrackFileDestination = {
  absolutePath: string;
  directoryPath: string;
  fileBase: string;
  fileName: string;
  relativeDirectory: string;
  relativePath: string;
};

export type MusicLibraryIndexedTrack = {
  album?: string;
  albumArtist?: string;
  artist?: string;
  artists: string[];
  compilation?: boolean;
  discNumber?: number;
  durationMs?: number;
  fileName: string;
  isrc?: string;
  mtimeMs: number;
  releaseDate?: string;
  relativeDirectory: string;
  relativePath: string;
  sizeBytes: number;
  source: "mixed" | "path" | "tags";
  spotifyAlbumId?: string;
  spotifyIsrc?: string;
  spotifyTrackId?: string;
  spotifyTrackUri?: string;
  spotifybuIdentityVersion?: string;
  title: string;
  trackNumber?: number;
};

export type MusicLibraryIndexSkip = {
  kind: "directory" | "file";
  reason: string;
  relativePath: string;
};

type MusicLibraryIndexAudioResult =
  | {
      ok: true;
      track: MusicLibraryIndexedTrack;
    }
  | {
      ok: false;
      skip: MusicLibraryIndexSkip;
    };

export type MusicLibraryIndex = {
  generatedAt: string;
  libraryPath: string;
  namingSchemeKey?: string;
  skipped?: MusicLibraryIndexSkip[];
  tracks: MusicLibraryIndexedTrack[];
  version: 1;
};

type MusicLibraryOrganizeIgnore = {
  ignoredAt: string;
  recommendedRelativePath?: string;
  relativePath: string;
};

type MusicLibraryOrganizeIgnoreStore = {
  ignores: Record<string, MusicLibraryOrganizeIgnore>;
  updatedAt: string;
  version: 1;
};

export type MusicLibraryIndexSummary = {
  generatedAt?: string;
  libraryPath?: string;
  namingSchemeChanged?: boolean;
  namingSchemeKey?: string;
  musicLibraryScan?: MusicServerScanResult;
  skippedCount?: number;
  skippedExamples?: MusicLibraryIndexSkip[];
  stale: boolean;
  trackCount: number;
};

export type MusicLibraryIndexScanState =
  | "failed"
  | "idle"
  | "running"
  | "succeeded";

export type MusicLibraryIndexScanStatus = {
  completedAt?: string;
  error?: string;
  id?: string;
  index?: MusicLibraryIndexSummary;
  startedAt?: string;
  state: MusicLibraryIndexScanState;
};

export type MusicLibraryTrackMatch = {
  exists: boolean;
  expectedFolder: string;
  matchedBy?: MusicLibraryTrackMatchMethod;
  matchedTrack?: MusicLibraryIndexedTrack;
  needsMove: boolean;
  organizeIgnored?: boolean;
  recommendedRelativePath?: string;
  trackId?: string;
  trackPosition: number;
};

export type MusicLibraryTrackMatchMethod =
  | "duration"
  | "isrc"
  | "metadata"
  | "path"
  | "spotify_identity";

export type MusicLibraryTrackOrganizationResult = {
  attemptedCount: number;
  libraryMatches: MusicLibraryTrackMatch[];
  moveFailures: MusicLibraryTrackMoveFailure[];
  movedCount: number;
  remainingMoveCount: number;
  skippedCount: number;
  summary: MusicLibraryIndexSummary;
};

export type MusicLibraryTrackOrganizationIgnoreResult = {
  ignored: boolean;
  index: MusicLibraryIndexSummary;
  libraryMatches: MusicLibraryTrackMatch[];
  relativePath?: string;
};

export type MusicLibraryTrackMoveFailure = {
  code?: string;
  message: string;
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string;
  targetRelativePath: string;
  trackName: string;
  trackPosition: number;
};

export type MusicLibraryPlaylistSyncResult = {
  addedCount?: number;
  appendedCount?: number;
  artworkError?: string;
  artworkUpdated?: boolean;
  matchedCount: number;
  mode: MusicLibraryPlaylistSyncMode;
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

export type MusicLibraryPlaylistSyncMode = "append" | "fullsync" | "replace";

export type MusicLibraryIdentityTagBackfillResult = {
  alreadyTaggedCount: number;
  attemptedCount: number;
  failedCount: number;
  failures: Array<{
    reason: string;
    relativePath: string;
    trackName: string;
  }>;
  index: MusicLibraryIndexSummary;
  matchedCount: number;
  skippedCount: number;
  snapshotCount: number;
  taggedCount: number;
  trackCount: number;
};

export type MusicLibraryIdentityTagBackfillJobStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running";

export type MusicLibraryIdentityTagBackfillJobSnapshot = {
  alreadyTaggedCount: number;
  attemptedCount: number;
  completedAt?: string;
  createdAt: string;
  currentTrackName?: string;
  currentTrackPosition?: number;
  error?: string;
  failedCount: number;
  id: string;
  matchedCount: number;
  processedCount: number;
  result?: MusicLibraryIdentityTagBackfillResult;
  skippedCount: number;
  snapshotCount: number;
  status: MusicLibraryIdentityTagBackfillJobStatus;
  taggedCount: number;
  totalCount: number;
  trackCount: number;
  updatedAt: string;
};

type MusicLibraryIdentityTagBackfillProgress = {
  alreadyTaggedCount: number;
  attemptedCount: number;
  currentTrackName?: string;
  currentTrackPosition?: number;
  failedCount: number;
  matchedCount: number;
  processedCount: number;
  skippedCount: number;
  snapshotCount: number;
  taggedCount: number;
  totalCount: number;
  trackCount: number;
};

type MusicLibraryIdentityTagBackfillOptions = {
  onProgress?: (progress: MusicLibraryIdentityTagBackfillProgress) => void;
};

type MusicLibraryIdentityTagBackfillJobRecord =
  MusicLibraryIdentityTagBackfillJobSnapshot;

const albumFolderLogSegments = [".spotifybu", "album-folders.json"];
const libraryIndexSegments = [".spotifybu", "library-index.json"];
const organizeIgnoresSegments = [".spotifybu", "organize-ignores.json"];
const defaultOrganizeMoveLimit = 15;
const organizeMoveFailureLimit = 10;
const indexValidationConcurrency = 64;
const unknownReleaseYear = "Unknown Year";
const defaultOrganizeNamingSettingsKey = organizeNamingSettingsKey(
  defaultOrganizeNamingSettings
);
const controlCharacters = /[\u0000-\u001f]/g;
const combiningMarks = /[\u0300-\u036f]/g;
const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const unsafePathCharacters = ["\\", "/", "<", ">", "?", "*", "|", "\""];
const identityTagBackfillJobs = new Map<
  string,
  MusicLibraryIdentityTagBackfillJobRecord
>();
const activeIdentityTagBackfillJobs = new Set<string>();
const maxIdentityTagBackfillJobs = 10;
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
let lastLibraryIndexSummary: MusicLibraryIndexSummary | null = null;
let libraryIndexScanStatus: MusicLibraryIndexScanStatus = {
  state: "idle"
};

export const emptyMusicLibraryIndexSummary = {
  stale: true,
  trackCount: 0
} satisfies MusicLibraryIndexSummary;

export function getMusicLibraryPath() {
  const configuredPath = firstConfiguredEnvironmentValue(
    "MUSIC_LIBRARY_PATH",
    "NAVIDROME_LIBRARY_PATH",
    "NAVIDROME_MUSIC_PATH"
  );

  return configuredPath
    ? path.resolve(/* turbopackIgnore: true */ configuredPath)
    : null;
}

export function getMusicLibraryUrl() {
  return (
    firstConfiguredEnvironmentValue("MUSIC_LIBRARY_URL", "NAVIDROME_URL") ||
    "http://localhost:4533"
  );
}

function getMusicServerApiCredentials() {
  const username = firstConfiguredEnvironmentValue(
    "MUSIC_LIBRARY_USERNAME",
    "MUSIC_LIBRARY_USER",
    "NAVIDROME_USERNAME",
    "NAVIDROME_USER"
  );
  const password = firstConfiguredRawEnvironmentValue(
    "MUSIC_LIBRARY_PASSWORD",
    "NAVIDROME_PASSWORD"
  );

  if (!username || !password) {
    return null;
  }

  return {
    password,
    username
  };
}

export async function getMusicLibraryStatus() {
  const libraryPath = getMusicLibraryPath();
  const musicLibraryUrl = getMusicLibraryUrl();
  const server = await getMusicServerStatus();

  if (!libraryPath) {
    return {
      configured: false,
      exists: false,
      message:
        "Set MUSIC_LIBRARY_PATH, NAVIDROME_LIBRARY_PATH, or NAVIDROME_MUSIC_PATH to your Navidrome music folder.",
      musicLibraryUrl,
      readable: false,
      server,
      state: "not_configured",
      writable: false
    } satisfies MusicLibraryStatus;
  }

  try {
    const libraryStats = await stat(libraryPath);

    if (!libraryStats.isDirectory()) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "The configured Navidrome music path exists but is not a directory.",
        musicLibraryUrl,
        readable: false,
        server,
        state: "not_directory",
        writable: false
      } satisfies MusicLibraryStatus;
    }

    const readable = await canAccess(libraryPath, constants.R_OK);
    const writable = await canAccess(libraryPath, constants.W_OK);

    if (!readable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot read the configured Navidrome music path.",
        musicLibraryUrl,
        readable,
        server,
        state: "not_readable",
        writable
      } satisfies MusicLibraryStatus;
    }

    if (!writable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot write into the configured Navidrome music path.",
        musicLibraryUrl,
        readable,
        server,
        state: "not_writable",
        writable
      } satisfies MusicLibraryStatus;
    }

    return {
      configured: true,
      exists: true,
      libraryPath,
      message: "Ready to stage authorized audio files for Navidrome scanning.",
      musicLibraryUrl,
      readable,
      server,
      state: "ready",
      writable
    } satisfies MusicLibraryStatus;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        configured: true,
        exists: false,
        libraryPath,
        message: "The configured Navidrome music path does not exist on this server.",
        musicLibraryUrl,
        readable: false,
        server,
        state: "missing",
        writable: false
      } satisfies MusicLibraryStatus;
    }

    return {
      configured: true,
      exists: false,
      libraryPath,
      message: "SpotifyBU could not inspect the configured Navidrome music path.",
      musicLibraryUrl,
      readable: false,
      server,
      state: "error",
      writable: false
    } satisfies MusicLibraryStatus;
  }
}

export async function getMusicServerStatus(): Promise<MusicServerStatus> {
  const musicLibraryUrl = getMusicLibraryUrl();

  if (!getMusicServerApiCredentials()) {
    return {
      configured: false,
      message:
        "Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD to let SpotifyBU ask Navidrome to rescan. MUSIC_LIBRARY_USERNAME and MUSIC_LIBRARY_PASSWORD are also accepted.",
      musicLibraryUrl,
      state: "not_configured"
    };
  }

  try {
    await musicServerApiRequest("ping");
    const scanStatusResponse = await musicServerApiRequest("getScanStatus").catch(
      () => null
    );
    const scanStatus = readMusicLibraryScanStatus(scanStatusResponse);

    return {
      configured: true,
      message: scanStatus?.scanning
        ? "Connected to Navidrome API; Navidrome scan is running."
        : "Connected to Navidrome API.",
      musicLibraryUrl,
      scanCount: scanStatus?.count,
      scanning: scanStatus?.scanning,
      state: "ready"
    };
  } catch (error) {
    return {
      configured: true,
      message: errorMessage(error),
      musicLibraryUrl,
      state: isMusicLibraryAuthError(error) ? "auth_failed" : "error"
    };
  }
}

async function requestMusicServerScan(): Promise<MusicServerScanResult> {
  const musicLibraryUrl = getMusicLibraryUrl();

  if (!getMusicServerApiCredentials()) {
    return {
      configured: false,
      message:
        "SpotifyBU indexed the mounted Navidrome folder. Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD to also request a Navidrome scan. MUSIC_LIBRARY_USERNAME and MUSIC_LIBRARY_PASSWORD are also accepted.",
      musicLibraryUrl,
      requested: false,
      state: "not_configured"
    };
  }

  try {
    await musicServerApiRequest("startScan");
    const scanStatusResponse = await musicServerApiRequest("getScanStatus").catch(
      () => null
    );
    const scanStatus = readMusicLibraryScanStatus(scanStatusResponse);

    return {
      configured: true,
      message: "SpotifyBU indexed the mounted Navidrome folder and requested a Navidrome scan.",
      musicLibraryUrl,
      requested: true,
      scanCount: scanStatus?.count,
      scanning: scanStatus?.scanning,
      state: "scan_requested"
    };
  } catch (error) {
    return {
      configured: true,
      message: `SpotifyBU indexed the mounted Navidrome folder, but could not request a Navidrome scan: ${errorMessage(
        error
      )}`,
      musicLibraryUrl,
      requested: false,
      state: isMusicLibraryAuthError(error) ? "auth_failed" : "error"
    };
  }
}

export async function ensureMusicLibraryTargetDirectory(segments: string[]) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const targetPath = path.resolve(
    /* turbopackIgnore: true */ libraryPath,
    ...segments.map(sanitizePathSegment)
  );
  const relativePath = path.relative(libraryPath, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved Navidrome target escaped the configured music path.");
  }

  await mkdir(targetPath, {
    recursive: true
  });

  return targetPath;
}

export async function planMusicLibraryAlbumFolders(tracks: BackupTrack[]) {
  const libraryPath = getMusicLibraryPath();
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
    } satisfies MusicLibraryFolderPlan;
  });
}

export async function recordMusicLibraryAlbumFolders(tracks: BackupTrack[]) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const log = await readAlbumFolderLog();
  const naming = await loadOrganizeNamingSettings();
  const tracksByAlbum = groupTracksByAlbum(tracks);
  const now = new Date().toISOString();

  for (const [key, albumTracks] of tracksByAlbum.entries()) {
    const representativeTrack = albumTracks[0];
    const existingFolder = log.albums[key];
    const folderPlan = buildNamingAlbumFolderPlan(representativeTrack, naming);
    const folderPath = await ensureMusicLibraryOrganizedDirectory(
      folderPlan.relativePath
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

  return planMusicLibraryAlbumFolders(tracks);
}

export async function getMusicLibraryIndexSummary() {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    const summary = emptyMusicLibraryIndexSummary;

    lastLibraryIndexSummary = summary;

    return summary;
  }

  const index = await readCurrentMusicLibraryIndex();
  const naming = await loadOrganizeNamingSettings();
  const summary = summarizeMusicLibraryIndex(
    index,
    libraryPath,
    organizeNamingSettingsKey(naming)
  );

  lastLibraryIndexSummary = summary;

  return summary;
}

export function getCachedMusicLibraryIndexSummary() {
  return lastLibraryIndexSummary;
}

export function getMusicLibraryIndexScanStatus() {
  return libraryIndexScanStatus;
}

export function startMusicLibraryIndexScan() {
  if (activeLibraryIndexScan) {
    return libraryIndexScanStatus;
  }

  const startedAt = new Date().toISOString();
  const scan = {
    id: randomBytes(8).toString("hex"),
    index: lastLibraryIndexSummary ?? emptyMusicLibraryIndexSummary,
    startedAt,
    state: "running"
  } satisfies MusicLibraryIndexScanStatus;

  libraryIndexScanStatus = scan;
  activeLibraryIndexScan = new Promise<void>((resolve) => {
    setTimeout(() => {
      void scanMusicLibraryIndex()
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

export async function readMusicLibraryIndex() {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    return null;
  }

  try {
    const contents = await readFile(
      path.join(/* turbopackIgnore: true */ libraryPath, ...libraryIndexSegments),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<MusicLibraryIndex>;

    if (parsed.version !== 1 || !Array.isArray(parsed.tracks)) {
      return null;
    }

    return parsed as MusicLibraryIndex;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readMusicLibraryOrganizeIgnores(libraryPath: string) {
  try {
    const contents = await readFile(
      path.join(/* turbopackIgnore: true */ libraryPath, ...organizeIgnoresSegments),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<MusicLibraryOrganizeIgnoreStore>;

    if (parsed.version !== 1 || !parsed.ignores) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.ignores).filter(
        (entry): entry is [string, MusicLibraryOrganizeIgnore] =>
          Boolean(
            entry[0] &&
              entry[1] &&
              typeof entry[1].ignoredAt === "string" &&
              typeof entry[1].relativePath === "string"
          )
      )
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeMusicLibraryOrganizeIgnores(
  ignores: Record<string, MusicLibraryOrganizeIgnore>
) {
  const storeDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);
  const store = {
    ignores,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies MusicLibraryOrganizeIgnoreStore;

  await writeFile(
    path.join(/* turbopackIgnore: true */ storeDirectory, "organize-ignores.json"),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8"
  );
}

export async function readCurrentMusicLibraryIndex() {
  const libraryPath = getMusicLibraryPath();
  const index = await readMusicLibraryIndex();

  if (!libraryPath || !index) {
    return index;
  }

  return pruneMissingMusicLibraryIndexTracks(index, libraryPath);
}

async function pruneMissingMusicLibraryIndexTracks(
  index: MusicLibraryIndex,
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
  ).filter((track): track is MusicLibraryIndexedTrack => Boolean(track));

  if (tracks.length === index.tracks.length) {
    return index;
  }

  const updatedIndex = {
    ...index,
    tracks
  } satisfies MusicLibraryIndex;

  await writeMusicLibraryIndex(updatedIndex).catch(() => undefined);

  return updatedIndex;
}

export async function scanMusicLibraryIndex() {
  const status = await getMusicLibraryStatus();
  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);

  if (status.state !== "ready" || !status.libraryPath) {
    throw new Error(status.message);
  }

  const { audioFilePaths, skipped } = await findAudioFiles(status.libraryPath);
  const indexedResults = await mapWithConcurrency<string, MusicLibraryIndexAudioResult>(
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
  } satisfies MusicLibraryIndex;

  await writeMusicLibraryIndex(index);
  const musicLibraryScan = await requestMusicServerScan();

  const summary = {
    ...summarizeMusicLibraryIndex(
      index,
      status.libraryPath,
      namingSchemeKey
    ),
    musicLibraryScan
  } satisfies MusicLibraryIndexSummary;

  lastLibraryIndexSummary = summary;

  return summary;
}

export async function upsertMusicLibraryIndexTrack(filePath: string) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const targetPath = path.resolve(/* turbopackIgnore: true */ filePath);
  const relativePath = path.relative(libraryPath, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved Navidrome target escaped the configured music path.");
  }

  const indexedTrack = await indexAudioFile(libraryPath, targetPath);
  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);
  const existingIndex = await readCurrentMusicLibraryIndex();
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
        } satisfies MusicLibraryIndex);
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

  await writeMusicLibraryIndex(index);

  const summary = summarizeMusicLibraryIndex(
    index,
    libraryPath,
    namingSchemeKey
  );
  lastLibraryIndexSummary = summary;

  return summary;
}

export async function deleteMusicLibraryTrack(relativePath: string) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const normalizedRelativePath = normalizeRelativePath(relativePath);

  if (
    !normalizedRelativePath ||
    normalizedRelativePath === "." ||
    normalizedRelativePath.startsWith(".spotifybu/") ||
    normalizedRelativePath === ".spotifybu"
  ) {
    throw new Error("Choose a backed-up track file to delete.");
  }

  const targetPath = absoluteLibraryPath(libraryPath, normalizedRelativePath);
  const existed = await canAccess(targetPath, constants.F_OK);
  const existingIndex = await readMusicLibraryIndex();

  await rm(targetPath, {
    force: true
  });

  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);
  const index =
    existingIndex?.libraryPath === libraryPath
      ? existingIndex
      : ({
          generatedAt: new Date(0).toISOString(),
          libraryPath,
          namingSchemeKey,
          skipped: [],
          tracks: [],
          version: 1
        } satisfies MusicLibraryIndex);
  const deletedTrackKey = normalizeRelativePathKey(normalizedRelativePath);
  const tracks = index.tracks.filter(
    (track) => normalizeRelativePathKey(track.relativePath) !== deletedTrackKey
  );
  const removedFromIndex = tracks.length !== index.tracks.length;
  const updatedIndex = {
    ...index,
    generatedAt: new Date().toISOString(),
    libraryPath,
    namingSchemeKey,
    tracks,
    skipped: index.skipped?.filter(
      (entry) => normalizeRelativePathKey(entry.relativePath) !== deletedTrackKey
    )
  } satisfies MusicLibraryIndex;

  await writeMusicLibraryIndex(updatedIndex);

  const summary = summarizeMusicLibraryIndex(
    updatedIndex,
    libraryPath,
    namingSchemeKey
  );
  lastLibraryIndexSummary = summary;

  return {
    deleted: existed,
    index: summary,
    relativePath: normalizedRelativePath,
    removedFromIndex
  };
}

export async function ignoreMusicLibraryTrackOrganization(
  track: BackupTrack,
  tracks: BackupTrack[] = [track]
): Promise<MusicLibraryTrackOrganizationIgnoreResult> {
  const context = await musicLibraryOrganizationIgnoreContext();
  const identityKey = musicLibraryTrackOrganizationIgnoreKey(track);
  const [rawMatch] = matchMusicLibraryTracksWithIndexUsingSettings(
    [track],
    context.index,
    context.naming,
    {}
  );

  if (!rawMatch?.matchedTrack) {
    throw new Error("SpotifyBU could not find the matched Navidrome file to ignore.");
  }

  if (!rawMatch.needsMove || !rawMatch.recommendedRelativePath) {
    throw new Error("That matched file is already in the active organize layout.");
  }

  const nextIgnores = {
    ...context.ignores,
    [identityKey]: {
      ignoredAt: new Date().toISOString(),
      recommendedRelativePath: rawMatch.recommendedRelativePath,
      relativePath: rawMatch.matchedTrack.relativePath
    }
  } satisfies Record<string, MusicLibraryOrganizeIgnore>;

  await writeMusicLibraryOrganizeIgnores(nextIgnores);

  return musicLibraryOrganizationIgnoreResult({
    ignored: true,
    ignores: nextIgnores,
    index: context.index,
    libraryPath: context.libraryPath,
    naming: context.naming,
    relativePath: rawMatch.matchedTrack.relativePath,
    tracks
  });
}

export async function clearMusicLibraryTrackOrganizationIgnore(
  track: BackupTrack,
  tracks: BackupTrack[] = [track]
): Promise<MusicLibraryTrackOrganizationIgnoreResult> {
  const context = await musicLibraryOrganizationIgnoreContext();
  const identityKey = musicLibraryTrackOrganizationIgnoreKey(track);
  const relativePath = context.ignores[identityKey]?.relativePath;
  const nextIgnores = { ...context.ignores };

  delete nextIgnores[identityKey];

  await writeMusicLibraryOrganizeIgnores(nextIgnores);

  return musicLibraryOrganizationIgnoreResult({
    ignored: false,
    ignores: nextIgnores,
    index: context.index,
    libraryPath: context.libraryPath,
    naming: context.naming,
    relativePath,
    tracks
  });
}

async function musicLibraryOrganizationIgnoreContext() {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const index = await readCurrentMusicLibraryIndex();
  const naming = await loadOrganizeNamingSettings();

  if (!index || index.libraryPath !== libraryPath) {
    throw new Error("Scan the current Navidrome folder before changing organize ignores.");
  }

  return {
    ignores: await readMusicLibraryOrganizeIgnores(libraryPath),
    index,
    libraryPath,
    naming
  };
}

function musicLibraryOrganizationIgnoreResult({
  ignored,
  ignores,
  index,
  libraryPath,
  naming,
  relativePath,
  tracks
}: {
  ignored: boolean;
  ignores: Record<string, MusicLibraryOrganizeIgnore>;
  index: MusicLibraryIndex;
  libraryPath: string;
  naming: OrganizeNamingSettings;
  relativePath?: string;
  tracks: BackupTrack[];
}) {
  const namingSchemeKey = organizeNamingSettingsKey(naming);
  const summary = summarizeMusicLibraryIndex(index, libraryPath, namingSchemeKey);

  lastLibraryIndexSummary = summary;

  return {
    ignored,
    index: summary,
    libraryMatches: matchMusicLibraryTracksWithIndexUsingSettings(
      tracks,
      index,
      naming,
      ignores
    ),
    relativePath
  } satisfies MusicLibraryTrackOrganizationIgnoreResult;
}

function musicLibraryTrackOrganizationIgnoreKey(track: BackupTrack) {
  const identityKey = spotifyBuIdentityKeyForTrack(track);

  if (!identityKey) {
    throw new Error("SpotifyBU cannot ignore organization for an unresolved Spotify local track.");
  }

  return identityKey;
}

export function startMusicLibrarySpotifyIdentityTagBackfillJob() {
  const now = new Date().toISOString();
  const job = {
    alreadyTaggedCount: 0,
    attemptedCount: 0,
    createdAt: now,
    failedCount: 0,
    id: randomBytes(8).toString("hex"),
    matchedCount: 0,
    processedCount: 0,
    skippedCount: 0,
    snapshotCount: 0,
    status: "queued",
    taggedCount: 0,
    totalCount: 0,
    trackCount: 0,
    updatedAt: now
  } satisfies MusicLibraryIdentityTagBackfillJobRecord;

  identityTagBackfillJobs.set(job.id, job);
  pruneIdentityTagBackfillJobs();
  scheduleMusicLibrarySpotifyIdentityTagBackfillJob(job.id);

  return snapshotMusicLibraryIdentityTagBackfillJob(job);
}

export function getMusicLibrarySpotifyIdentityTagBackfillJobSnapshot(
  jobId: string
) {
  const job = identityTagBackfillJobs.get(jobId);

  return job ? snapshotMusicLibraryIdentityTagBackfillJob(job) : null;
}

function scheduleMusicLibrarySpotifyIdentityTagBackfillJob(jobId: string) {
  setTimeout(() => {
    void runMusicLibrarySpotifyIdentityTagBackfillJob(jobId);
  }, 0);
}

async function runMusicLibrarySpotifyIdentityTagBackfillJob(jobId: string) {
  const job = identityTagBackfillJobs.get(jobId);

  if (!job || activeIdentityTagBackfillJobs.has(jobId)) {
    return;
  }

  activeIdentityTagBackfillJobs.add(jobId);
  job.status = "running";
  job.updatedAt = new Date().toISOString();

  try {
    job.result = await backfillMusicLibrarySpotifyIdentityTags({
      onProgress(progress) {
        updateMusicLibraryIdentityTagBackfillJob(job, progress);
      }
    });
    updateMusicLibraryIdentityTagBackfillJob(job, {
      ...job.result,
      processedCount: job.result.trackCount,
      totalCount: job.result.trackCount
    });
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.currentTrackName = undefined;
    job.currentTrackPosition = undefined;
    job.updatedAt = job.completedAt;
  } catch (error) {
    job.error = errorMessage(error);
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.currentTrackName = undefined;
    job.currentTrackPosition = undefined;
    job.updatedAt = job.completedAt;
  } finally {
    activeIdentityTagBackfillJobs.delete(jobId);
  }
}

function updateMusicLibraryIdentityTagBackfillJob(
  job: MusicLibraryIdentityTagBackfillJobRecord,
  progress: MusicLibraryIdentityTagBackfillProgress
) {
  job.alreadyTaggedCount = progress.alreadyTaggedCount;
  job.attemptedCount = progress.attemptedCount;
  job.currentTrackName = progress.currentTrackName;
  job.currentTrackPosition = progress.currentTrackPosition;
  job.failedCount = progress.failedCount;
  job.matchedCount = progress.matchedCount;
  job.processedCount = progress.processedCount;
  job.skippedCount = progress.skippedCount;
  job.snapshotCount = progress.snapshotCount;
  job.taggedCount = progress.taggedCount;
  job.totalCount = progress.totalCount;
  job.trackCount = progress.trackCount;
  job.updatedAt = new Date().toISOString();
}

function snapshotMusicLibraryIdentityTagBackfillJob(
  job: MusicLibraryIdentityTagBackfillJobRecord
): MusicLibraryIdentityTagBackfillJobSnapshot {
  return {
    alreadyTaggedCount: job.alreadyTaggedCount,
    attemptedCount: job.attemptedCount,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    currentTrackName: job.currentTrackName,
    currentTrackPosition: job.currentTrackPosition,
    error: job.error,
    failedCount: job.failedCount,
    id: job.id,
    matchedCount: job.matchedCount,
    processedCount: job.processedCount,
    result: job.result,
    skippedCount: job.skippedCount,
    snapshotCount: job.snapshotCount,
    status: job.status,
    taggedCount: job.taggedCount,
    totalCount: job.totalCount,
    trackCount: job.trackCount,
    updatedAt: job.updatedAt
  };
}

function pruneIdentityTagBackfillJobs() {
  if (identityTagBackfillJobs.size <= maxIdentityTagBackfillJobs) {
    return;
  }

  const removableJobs = [...identityTagBackfillJobs.values()]
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  for (const job of removableJobs) {
    if (identityTagBackfillJobs.size <= maxIdentityTagBackfillJobs) {
      break;
    }

    identityTagBackfillJobs.delete(job.id);
  }
}

export async function backfillMusicLibrarySpotifyIdentityTags(
  options: MusicLibraryIdentityTagBackfillOptions = {}
) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const index = await readCurrentMusicLibraryIndex();
  const naming = await loadOrganizeNamingSettings();
  const namingSchemeKey = organizeNamingSettingsKey(naming);

  if (!index || index.libraryPath !== libraryPath) {
    throw new Error(
      "Scan the current Navidrome folder before backfilling Spotify metadata tags."
    );
  }

  const snapshots = Object.values(getLatestPlaylistBackupSnapshots());
  const tracks = uniqueBackupTracksWithSpotifyIdentity(
    snapshots.flatMap((snapshot) => snapshot.tracks)
  );
  const matches = matchMusicLibraryTracksWithIndexUsingSettings(
    tracks,
    index,
    naming
  );
  const updatedTracksByRelativePath = new Map(
    index.tracks.map((track) => [normalizeRelativePathKey(track.relativePath), track])
  );
  const processedRelativePathKeys = new Set<string>();
  const failures: MusicLibraryIdentityTagBackfillResult["failures"] = [];
  let alreadyTaggedCount = 0;
  let attemptedCount = 0;
  let matchedCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let taggedCount = 0;
  const totalCount = tracks.length;
  const reportProgress = (track?: BackupTrack) => {
    options.onProgress?.({
      alreadyTaggedCount,
      attemptedCount,
      currentTrackName: track?.name,
      currentTrackPosition: track?.position,
      failedCount: failures.length,
      matchedCount,
      processedCount,
      skippedCount,
      snapshotCount: snapshots.length,
      taggedCount,
      totalCount,
      trackCount: tracks.length
    });
  };

  reportProgress();

  for (const [trackIndex, track] of tracks.entries()) {
    const match = matches[trackIndex];
    const matchedTrack = match?.matchedTrack;

    reportProgress(track);

    if (!match?.exists || !matchedTrack) {
      skippedCount += 1;
      processedCount += 1;
      reportProgress(track);
      continue;
    }

    const relativePathKey = normalizeRelativePathKey(matchedTrack.relativePath);

    if (processedRelativePathKeys.has(relativePathKey)) {
      skippedCount += 1;
      processedCount += 1;
      reportProgress(track);
      continue;
    }

    processedRelativePathKeys.add(relativePathKey);
    matchedCount += 1;

    const indexedTrack =
      updatedTracksByRelativePath.get(relativePathKey) ?? matchedTrack;
    const identityMetadata = spotifyBuIdentityMetadataForTrack(track);

    if (!spotifyBuIdentityMetadataHasTrackIdentity(identityMetadata)) {
      skippedCount += 1;
      processedCount += 1;
      reportProgress(track);
      continue;
    }

    if (!indexedTrackNeedsSpotifyBackfill(indexedTrack, track, identityMetadata)) {
      alreadyTaggedCount += 1;
      processedCount += 1;
      reportProgress(track);
      continue;
    }

    attemptedCount += 1;

    try {
      const filePath = absoluteLibraryPath(libraryPath, indexedTrack.relativePath);

      await tagAudioFileWithSpotifyBackfillMetadata(filePath, track);
      updatedTracksByRelativePath.set(
        relativePathKey,
        await indexAudioFile(libraryPath, filePath)
      );
      taggedCount += 1;
    } catch (error) {
      failures.push({
        reason: errorMessage(error),
        relativePath: indexedTrack.relativePath,
        trackName: track.name
      });
    }

    processedCount += 1;
    reportProgress(track);
  }

  const updatedIndex =
    taggedCount > 0
      ? ({
          ...index,
          generatedAt: new Date().toISOString(),
          libraryPath,
          namingSchemeKey,
          tracks: Array.from(updatedTracksByRelativePath.values()).sort(
            (left, right) => left.relativePath.localeCompare(right.relativePath)
          )
        } satisfies MusicLibraryIndex)
      : index;

  if (taggedCount > 0) {
    await writeMusicLibraryIndex(updatedIndex);
  }

  const summary = summarizeMusicLibraryIndex(
    updatedIndex,
    libraryPath,
    namingSchemeKey
  );
  lastLibraryIndexSummary = summary;

  return {
    alreadyTaggedCount,
    attemptedCount,
    failedCount: failures.length,
    failures,
    index: summary,
    matchedCount,
    skippedCount,
    snapshotCount: snapshots.length,
    taggedCount,
    trackCount: tracks.length
  } satisfies MusicLibraryIdentityTagBackfillResult;
}

export async function matchMusicLibraryTracks(tracks: BackupTrack[]) {
  const libraryPath = getMusicLibraryPath();
  const index = await readCurrentMusicLibraryIndex();
  const naming = await loadOrganizeNamingSettings();
  const organizeIgnores = libraryPath
    ? await readMusicLibraryOrganizeIgnores(libraryPath)
    : {};

  return matchMusicLibraryTracksWithIndexUsingSettings(
    tracks,
    libraryPath && index?.libraryPath === libraryPath ? index : null,
    naming,
    organizeIgnores
  );
}

export async function organizeMusicLibraryMatchedTracks(
  tracks: BackupTrack[],
  options: {
    maxMoves?: number;
    trackPositions?: number[];
  } = {}
) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const index = await readMusicLibraryIndex();
  const currentIndex = index
    ? await pruneMissingMusicLibraryIndexTracks(index, libraryPath)
    : null;
  const naming = await loadOrganizeNamingSettings();
  const organizeIgnores = await readMusicLibraryOrganizeIgnores(libraryPath);

  if (!currentIndex) {
    throw new Error("Scan the Navidrome folder before organizing matched files.");
  }

  if (currentIndex.libraryPath !== libraryPath) {
    throw new Error("Scan the current Navidrome folder before organizing files.");
  }

  const matches = matchMusicLibraryTracksWithIndexUsingSettings(
    tracks,
    currentIndex,
    naming,
    organizeIgnores
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
  const backupTracksByPosition = new Map(
    tracks.map((track) => [track.position, track] as const)
  );
  let updatedTracks = currentIndex.tracks.map((track) => ({ ...track }));
  const tracksByRelativePath = new Map(
    updatedTracks.map((track) => [
      normalizeRelativePathKey(track.relativePath),
      track
    ])
  );
  const occupiedRelativePaths = new Set(tracksByRelativePath.keys());
  const moveFailures: MusicLibraryTrackMoveFailure[] = [];
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

    await ensureMusicLibraryTargetDirectory(relativePathSegments(targetDirectory));

    try {
      await rename(sourcePath, targetPath);
      const movedTrack = {
        ...indexedTrack,
        fileName: path.posix.basename(targetRelativePath),
        relativeDirectory: targetDirectory,
        relativePath: targetRelativePath
      } satisfies MusicLibraryIndexedTrack;

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
    } catch (error) {
      skippedCount += 1;

      if (moveFailures.length < organizeMoveFailureLimit) {
        moveFailures.push(
          musicLibraryMoveFailureFromError({
            error,
            match,
            sourcePath,
            sourceRelativePath: indexedTrack.relativePath,
            targetPath,
            targetRelativePath,
            trackName:
              backupTracksByPosition.get(match.trackPosition)?.name ??
              `Track ${match.trackPosition}`
          })
        );
      }
    }
  }

  const updatedIndex = {
    ...currentIndex,
    generatedAt: new Date().toISOString(),
    namingSchemeKey: organizeNamingSettingsKey(naming),
    tracks: updatedTracks.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    )
  } satisfies MusicLibraryIndex;

  await writeMusicLibraryIndex(updatedIndex);
  const libraryMatches = matchMusicLibraryTracksWithIndexUsingSettings(
    tracks,
    updatedIndex,
    naming,
    organizeIgnores
  );

  return {
    attemptedCount: batchCandidates.length,
    libraryMatches,
    moveFailures,
    movedCount,
    remainingMoveCount: libraryMatches.filter((match) => match.needsMove).length,
    skippedCount,
    summary: summarizeMusicLibraryIndex(
      updatedIndex,
      libraryPath,
      organizeNamingSettingsKey(naming)
    )
  } satisfies MusicLibraryTrackOrganizationResult;
}

function musicLibraryMoveFailureFromError({
  error,
  match,
  sourcePath,
  sourceRelativePath,
  targetPath,
  targetRelativePath,
  trackName
}: {
  error: unknown;
  match: MusicLibraryTrackMatch;
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string;
  targetRelativePath: string;
  trackName: string;
}) {
  return {
    code:
      isNodeError(error) && typeof error.code === "string"
        ? error.code
        : undefined,
    message: error instanceof Error ? error.message : "Unknown move error.",
    sourcePath,
    sourceRelativePath,
    targetPath,
    targetRelativePath,
    trackName,
    trackPosition: match.trackPosition
  } satisfies MusicLibraryTrackMoveFailure;
}

export async function createOrUpdateMusicLibraryPlaylistFromSpotify(
  playlist: PlaylistSummary,
  tracks: BackupTrack[],
  options: {
    mode?: MusicLibraryPlaylistSyncMode;
  } = {}
) {
  if (!tracks.length) {
    throw new Error("Load Spotify playlist tracks before creating a Navidrome playlist.");
  }

  await musicServerApiRequest("ping");

  const mode = normalizePlaylistSyncMode(options.mode);
  const matches = await matchMusicLibraryTracks(tracks);
  const songIds: string[] = [];
  const skipped: MusicLibraryPlaylistSyncResult["skipped"] = [];

  for (const track of tracks) {
    if (isUnresolvedSpotifyLocalBackupTrack(track)) {
      skipped.push({
        reason: track.metadataWarning ?? unresolvedSpotifyLocalTrackMessage,
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    const match = matches.find(
      (candidate) => candidate.trackPosition === track.position
    );

    if (!match?.matchedTrack) {
      skipped.push({
        reason: "Track is not backed up in the Navidrome folder.",
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    const songId = await resolveMusicLibrarySongId(track, match.matchedTrack);

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

  const name = musicLibraryPlaylistName(playlist);
  const existingPlaylist = await findMusicLibraryPlaylistByName(name);
  const existingSongIds =
    (mode === "append" || mode === "fullsync") && existingPlaylist?.id
      ? await getMusicLibraryPlaylistSongIds(existingPlaylist.id)
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
      await fullSyncMusicLibraryPlaylist(existingPlaylist.id, existingSongIds, songIds);
    }

    const updatedPlaylist =
      (await getMusicLibraryPlaylist(existingPlaylist.id)) ?? existingPlaylist;

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
    } satisfies MusicLibraryPlaylistSyncResult;
  }

  if (mode === "append" && existingPlaylist?.id) {
    if (appendSongIds.length) {
      await musicServerApiRequest("updatePlaylist", {
        playlistId: existingPlaylist.id,
        songIdToAdd: appendSongIds
      });
    }

    const updatedPlaylist =
      (await getMusicLibraryPlaylist(existingPlaylist.id)) ?? existingPlaylist;

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
    } satisfies MusicLibraryPlaylistSyncResult;
  }

  const playlistResponse = await musicServerApiRequest("createPlaylist", {
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
  } satisfies MusicLibraryPlaylistSyncResult;
}

async function fullSyncMusicLibraryPlaylist(
  playlistId: string,
  existingSongIds: string[],
  desiredSongIds: string[]
) {
  const songIndexToRemove = existingSongIds
    .map((_songId, index) => String(index))
    .reverse();

  if (songIndexToRemove.length) {
    await musicServerApiRequest("updatePlaylist", {
      playlistId,
      songIndexToRemove
    });
  }

  if (desiredSongIds.length) {
    await musicServerApiRequest("updatePlaylist", {
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

export async function buildMusicLibraryTrackFileBase(
  track: BackupTrack,
  matchedTrack?: MusicLibraryIndexedTrack
) {
  const naming = await loadOrganizeNamingSettings();

  return buildMusicLibraryTrackFileBaseWithSettings(track, naming, matchedTrack);
}

export async function buildMusicLibraryTrackRelativePath(
  track: BackupTrack,
  extension: string,
  matchedTrack?: MusicLibraryIndexedTrack
) {
  const naming = await loadOrganizeNamingSettings();

  return buildMusicLibraryTrackRelativePathWithSettings(
    track,
    naming,
    extension,
    matchedTrack
  );
}

export async function prepareMusicLibraryTrackFileDestination(
  track: BackupTrack,
  extension: string,
  matchedTrack?: MusicLibraryIndexedTrack
) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const relativePath = await buildMusicLibraryTrackRelativePath(
    track,
    extension,
    matchedTrack
  );
  const relativeDirectory = relativeDirectoryName(relativePath);
  const directoryPath = await ensureMusicLibraryOrganizedDirectory(
    relativeDirectory
  );
  const fileName = path.posix.basename(relativePath);

  return {
    absolutePath: absoluteLibraryPath(libraryPath, relativePath),
    directoryPath,
    fileBase: path.posix.parse(fileName).name,
    fileName,
    relativeDirectory,
    relativePath
  } satisfies MusicLibraryTrackFileDestination;
}

function buildMusicLibraryTrackFileBaseWithSettings(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  matchedTrack?: MusicLibraryIndexedTrack
): string {
  return buildNamingTrackDestination(track, naming, "", matchedTrack).fileBase;
}

function buildMusicLibraryTrackRelativePathWithSettings(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  extension: string,
  matchedTrack?: MusicLibraryIndexedTrack
): string {
  return buildNamingTrackDestination(
    track,
    naming,
    normalizeFileExtension(extension),
    matchedTrack
  ).relativePath;
}

function buildOrganizedTrackRelativePath(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  matchedTrack: MusicLibraryIndexedTrack,
  relativeDirectory = buildNamingAlbumFolderPlan(track, naming).relativePath
) {
  const extension = path.posix.extname(matchedTrack.fileName);
  const renderedPath = buildMusicLibraryTrackRelativePathWithSettings(
    track,
    naming,
    extension,
    matchedTrack
  );

  return path.posix.join(relativeDirectory, path.posix.basename(renderedPath));
}

function buildNamingTrackDestination(
  track: BackupTrack,
  naming: OrganizeNamingSettings,
  extension: string,
  matchedTrack?: MusicLibraryIndexedTrack
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
  matchedTrack?: MusicLibraryIndexedTrack
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
  matchedTrack?: MusicLibraryIndexedTrack
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
  matchedTrack?: MusicLibraryIndexedTrack
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

function normalizeFileExtension(extension: string) {
  const trimmedExtension = extension.trim();

  if (!trimmedExtension) {
    return "";
  }

  return trimmedExtension.startsWith(".")
    ? trimmedExtension
    : `.${trimmedExtension}`;
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

function summarizeMusicLibraryIndex(
  index: MusicLibraryIndex | null,
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
    } satisfies MusicLibraryIndexSummary;
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
  } satisfies MusicLibraryIndexSummary;
}

async function findMusicLibraryPlaylistByName(name: string) {
  const response = await musicServerApiRequest("getPlaylists");
  const playlists = arrayFrom(response.playlists?.playlist);
  const nameKey = normalizeText(name);

  return playlists.find((playlist) => normalizeText(playlist.name) === nameKey);
}

async function getMusicLibraryPlaylist(playlistId: string) {
  const response = await musicServerApiRequest("getPlaylist", {
    id: playlistId
  });

  return response.playlist;
}

async function getMusicLibraryPlaylistSongIds(playlistId: string) {
  const playlist = await getMusicLibraryPlaylist(playlistId);

  return arrayFrom(playlist?.entry)
    .map((song) => song.id)
    .filter((songId): songId is string => Boolean(songId));
}

async function resolveMusicLibrarySongId(
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack
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
  const candidates = new Map<string, MusicServerApiSong>();

  for (const query of queries) {
    const response = await musicServerApiRequest("search3", {
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

  let bestMatch: { score: number; song: MusicServerApiSong } | null = null;

  for (const song of candidates.values()) {
    const score = scoreMusicLibrarySongCandidate(track, matchedTrack, song);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        song
      };
    }
  }

  return bestMatch && bestMatch.score >= 60 ? bestMatch.song.id : null;
}

function scoreMusicLibrarySongCandidate(
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack,
  song: MusicServerApiSong
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

function musicLibraryPlaylistName(playlist: PlaylistSummary) {
  return playlist.name.trim().slice(0, 120) || `Spotify playlist ${playlist.id}`;
}

function normalizePlaylistSyncMode(
  mode?: MusicLibraryPlaylistSyncMode
): MusicLibraryPlaylistSyncMode {
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

const musicServerApiVersion = "1.16.1";
const musicServerApiClient = "SpotifyBU";

type MusicLibrarySubsonicResponse = {
  "subsonic-response"?: {
    error?: {
      code?: number;
      message?: string;
    };
    playlist?: MusicServerApiPlaylist;
    playlists?: {
      playlist?: MusicServerApiPlaylist[] | MusicServerApiPlaylist;
    };
    scanStatus?: {
      count?: number;
      scanning?: boolean;
    };
    searchResult3?: {
      song?: MusicServerApiSong[] | MusicServerApiSong;
    };
    status?: string;
  };
};

type MusicServerApiPlaylist = {
  entry?: MusicServerApiSong[] | MusicServerApiSong;
  id: string;
  name: string;
  songCount?: number;
};

type MusicServerApiSong = {
  album?: string;
  artist?: string;
  duration?: number;
  id?: string;
  path?: string;
  title?: string;
};

class MusicServerApiError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

async function musicServerApiRequest(
  endpoint: string,
  extraParams: Record<string, string | string[]> = {}
) {
  const credentials = getMusicServerApiCredentials();

  if (!credentials) {
    throw new Error(
      "Set NAVIDROME_USERNAME and NAVIDROME_PASSWORD, or MUSIC_LIBRARY_USERNAME and MUSIC_LIBRARY_PASSWORD."
    );
  }

  const salt = randomBytes(8).toString("hex");
  const token = createHash("md5")
    .update(`${credentials.password}${salt}`)
    .digest("hex");
  const apiUrl = new URL(
    `${getMusicLibraryUrl().replace(/\/+$/, "")}/rest/${endpoint}.view`
  );
  const params = new URLSearchParams({
    c: musicServerApiClient,
    f: "json",
    s: salt,
    t: token,
    u: credentials.username,
    v: musicServerApiVersion
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
      throw new MusicServerApiError(musicLibraryAuthFailureMessage(), 40);
    }

    throw new Error(`Navidrome API returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as MusicLibrarySubsonicResponse;
  const subsonicResponse = body["subsonic-response"];

  if (!subsonicResponse) {
    throw new Error("Navidrome API response was not a Subsonic response.");
  }

  if (subsonicResponse.status !== "ok") {
    throw new MusicServerApiError(
      musicServerApiErrorMessage(subsonicResponse.error),
      subsonicResponse.error?.code
    );
  }

  return subsonicResponse;
}

function readMusicLibraryScanStatus(
  response: Awaited<ReturnType<typeof musicServerApiRequest>> | null
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

function isMusicLibraryAuthError(error: unknown) {
  return error instanceof MusicServerApiError && error.code === 40;
}

function errorMessage(error: unknown) {
  if (isMusicLibraryAuthError(error)) {
    return musicLibraryAuthFailureMessage();
  }

  return error instanceof Error ? error.message : "Unknown error.";
}

function musicServerApiErrorMessage(error?: { message?: string }) {
  const message = error?.message?.trim();

  if (!message || /^forbidden$/i.test(message)) {
    return musicLibraryAuthFailureMessage();
  }

  return message;
}

function musicLibraryAuthFailureMessage() {
  return "The Navidrome API rejected the configured credentials. Check NAVIDROME_USERNAME and NAVIDROME_PASSWORD, or MUSIC_LIBRARY_USERNAME and MUSIC_LIBRARY_PASSWORD.";
}

function firstConfiguredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function firstConfiguredRawEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "";
}

async function findAudioFiles(libraryPath: string) {
  const audioFilePaths: string[] = [];
  const skipped: MusicLibraryIndexSkip[] = [];

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
  kind: MusicLibraryIndexSkip["kind"],
  reason: string
) {
  return {
    kind,
    reason,
    relativePath: safeLibraryRelativePath(libraryPath, filePath)
  } satisfies MusicLibraryIndexSkip;
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
  const releaseDate = normalizeMusicLibraryReleaseDate(
    tagValue(probe?.tags, ["releasedate", "release_date", "date", "year"])
  );
  const compilation = parseCompilationTag(
    tagValue(probe?.tags, ["compilation", "tcmp", "cpil", "iscompilation"])
  );
  const identityMetadata = parseMusicLibraryIndexedTrackIdentityTags(probe?.tags);
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
    compilation,
    discNumber: tagDiscNumber ?? inferred.discNumber,
    durationMs: probe?.durationMs,
    fileName: path.posix.basename(relativePath),
    isrc: normalizeIsrc(tagValue(probe?.tags, ["isrc"])),
    mtimeMs: fileStats.mtimeMs,
    releaseDate,
    relativeDirectory: relativeDirectoryName(relativePath),
    relativePath,
    sizeBytes: fileStats.size,
    source: usedTags ? (usedPathFallback ? "mixed" : "tags") : "path",
    ...identityMetadata,
    title,
    trackNumber: tagTrackNumber ?? inferred.trackNumber
  } satisfies MusicLibraryIndexedTrack;
}

export function parseMusicLibraryIndexedTrackIdentityTags(
  tags: Map<string, string> | undefined | null
) {
  const identityMetadata = spotifyBuIdentityMetadataFromTagLookup((keys) =>
    tagValue(tags, keys)
  );

  return {
    spotifyAlbumId: identityMetadata.spotifyAlbumId,
    spotifyIsrc: normalizeIsrc(identityMetadata.spotifyIsrc),
    spotifyTrackId: identityMetadata.spotifyTrackId,
    spotifyTrackUri: identityMetadata.spotifyTrackUri,
    spotifybuIdentityVersion: identityMetadata.spotifybuIdentityVersion
  } satisfies Pick<
    MusicLibraryIndexedTrack,
    | "spotifyAlbumId"
    | "spotifyIsrc"
    | "spotifyTrackId"
    | "spotifyTrackUri"
    | "spotifybuIdentityVersion"
  >;
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
  const artist =
    structuredFolder?.artist ?? folderMatch?.groups?.artist?.trim();
  const album = structuredFolder?.album ?? folderMatch?.groups?.album?.trim();
  const cleanedTitle = cleanTrackFileName(parsedPath.name, { album, artist });
  const fileArtistTitle = inferArtistTitleFromFileName(cleanedTitle);

  return {
    album,
    albumArtist: artist ?? fileArtistTitle?.artist,
    artist: artist ?? fileArtistTitle?.artist,
    discNumber: trackNumbers.discNumber,
    trackNumber: trackNumbers.trackNumber,
    title: fileArtistTitle?.title ?? cleanedTitle
  };
}

function cleanTrackFileName(
  value: string,
  context: { album?: string; artist?: string } = {}
) {
  let clean = value;

  if (context.artist && context.album) {
    const artistPattern = escapeRegExp(context.artist);
    const albumPattern = escapeRegExp(context.album);
    clean = clean.replace(
      new RegExp(
        `^\\s*${artistPattern}\\s+-\\s+${albumPattern}(?:\\s+\\((?:\\d{4}|Unknown Year)\\))?\\s+-\\s+`,
        "i"
      ),
      ""
    );
  }

  return (
    clean
      .replace(/^\s*\d{4}\s*[-_. ]+\s*/, "")
      .replace(/^\s*\d{1,2}[-_.]\d{1,2}\s*[-_. ]+\s*/, "")
      .replace(/^\s*\d{1,3}\s*[-_. ]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim() || value
  );
}

function inferArtistTitleFromFileName(value: string) {
  const match = value.match(/^(?<artist>.+?)\s+-\s+(?<title>.+)$/);

  if (!match?.groups?.artist || !match.groups.title) {
    return null;
  }

  return {
    artist: match.groups.artist.trim(),
    title: cleanTrackFileName(match.groups.title.trim())
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function tagValue(
  tags: Map<string, string> | undefined | null,
  keys: readonly string[]
) {
  for (const key of keys) {
    const value = tags?.get(key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeMusicLibraryReleaseDate(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?/);

  return match?.[0];
}

function parseCompilationTag(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
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

export async function matchMusicLibraryTracksWithIndex(
  tracks: BackupTrack[],
  index: MusicLibraryIndex | null
) {
  const naming = await loadOrganizeNamingSettings();

  return matchMusicLibraryTracksWithIndexUsingSettings(tracks, index, naming);
}

function matchMusicLibraryTracksWithIndexUsingSettings(
  tracks: BackupTrack[],
  index: MusicLibraryIndex | null,
  naming: OrganizeNamingSettings,
  organizeIgnores: Record<string, MusicLibraryOrganizeIgnore> = {}
) {
  const indexedTracks = index?.tracks ?? [];
  const lookup = buildMusicLibraryTrackLookup(indexedTracks);

  const matches = tracks.map((track) => {
    const expectedFolder = buildNamingAlbumFolderPlan(track, naming).relativePath;
    const match = findIndexedTrackMatch(track, lookup, naming);

    if (!match) {
      return unmatchedMusicLibraryTrackMatch(track, expectedFolder);
    }

    const organizationPlan = buildTrackOrganizationPlan(
      track,
      match.track,
      naming
    );
    const organizeIgnore = matchingOrganizeIgnore(
      track,
      match.track,
      organizationPlan,
      organizeIgnores
    );
    const needsMove = organizationPlan.needsMove && !organizeIgnore;

    return {
      exists: true,
      expectedFolder: organizationPlan.expectedFolder,
      matchedBy: match.matchedBy,
      matchedTrack: match.track,
      needsMove,
      organizeIgnored: Boolean(organizeIgnore),
      recommendedRelativePath: needsMove
        ? organizationPlan.recommendedRelativePath
        : undefined,
      trackId: track.id,
      trackPosition: track.position
    } satisfies MusicLibraryTrackMatch;
  });

  return resolveSharedMusicLibraryTrackMatches(tracks, matches, naming);
}

function unmatchedMusicLibraryTrackMatch(
  track: BackupTrack,
  expectedFolder: string
) {
  return {
    exists: false,
    expectedFolder,
    needsMove: false,
    trackId: track.id,
    trackPosition: track.position
  } satisfies MusicLibraryTrackMatch;
}

function resolveSharedMusicLibraryTrackMatches(
  tracks: BackupTrack[],
  matches: MusicLibraryTrackMatch[],
  naming: OrganizeNamingSettings
) {
  const claimedIndexesByPath = new Map<string, number[]>();

  for (const [index, match] of matches.entries()) {
    if (!match.matchedTrack) {
      continue;
    }

    const pathKey = normalizeRelativePathKey(match.matchedTrack.relativePath);
    const claimedIndexes = claimedIndexesByPath.get(pathKey);

    if (claimedIndexes) {
      claimedIndexes.push(index);
    } else {
      claimedIndexesByPath.set(pathKey, [index]);
    }
  }

  const resolvedMatches = matches.map((match) => ({ ...match }));

  for (const claimedIndexes of claimedIndexesByPath.values()) {
    if (claimedIndexes.length < 2) {
      continue;
    }

    const claimKeys = new Set(
      claimedIndexes.map((index) => musicLibraryTrackClaimKey(tracks[index]))
    );

    if (claimKeys.size < 2) {
      continue;
    }

    const rankedClaims = claimedIndexes
      .map((index) => ({
        index,
        score: musicLibraryTrackClaimScore(tracks[index], matches[index], naming)
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          tracks[left.index].position - tracks[right.index].position
      );
    const winner = rankedClaims[0];
    const runnerUp = rankedClaims[1];
    const winnerIndex =
      winner && (!runnerUp || winner.score > runnerUp.score)
        ? winner.index
        : null;

    for (const claimedIndex of claimedIndexes) {
      if (claimedIndex === winnerIndex) {
        continue;
      }

      resolvedMatches[claimedIndex] = unmatchedMusicLibraryTrackMatch(
        tracks[claimedIndex],
        matches[claimedIndex].expectedFolder
      );
    }
  }

  return resolvedMatches;
}

function musicLibraryTrackClaimKey(track: BackupTrack) {
  const identityKey = spotifyBuIdentityKeyForTrack(track);

  if (identityKey) {
    return identityKey;
  }

  return [
    normalizeText(track.name),
    normalizeText(track.album),
    Array.from(normalizedSpotifyArtists(track)).sort().join("|"),
    track.discNumber ?? "",
    track.trackNumber ?? "",
    track.durationMs
  ].join("\u0000");
}

function musicLibraryTrackClaimScore(
  track: BackupTrack,
  match: MusicLibraryTrackMatch,
  naming: OrganizeNamingSettings
) {
  if (!match.matchedTrack || !match.matchedBy) {
    return 0;
  }

  const methodPriorities: Record<MusicLibraryTrackMatchMethod, number> = {
    duration: 1,
    isrc: 3,
    metadata: 2,
    path: 5,
    spotify_identity: 4
  };

  return (
    methodPriorities[match.matchedBy] * 10_000 +
    indexedTrackMatchScore(track, match.matchedTrack, naming)
  );
}

function buildTrackOrganizationPlan(
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack,
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

function matchingOrganizeIgnore(
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack,
  organizationPlan: ReturnType<typeof buildTrackOrganizationPlan>,
  organizeIgnores: Record<string, MusicLibraryOrganizeIgnore>
) {
  if (!organizationPlan.needsMove) {
    return null;
  }

  const identityKey = spotifyBuIdentityKeyForTrack(track);
  const ignore = identityKey ? organizeIgnores[identityKey] : undefined;

  if (
    ignore &&
    normalizeRelativePathKey(ignore.relativePath) ===
      normalizeRelativePathKey(matchedTrack.relativePath)
  ) {
    return ignore;
  }

  return null;
}

function findIndexedTrackMatch(
  track: BackupTrack,
  lookup: MusicLibraryTrackLookup,
  naming: OrganizeNamingSettings
) {
  const identityMetadata = spotifyBuIdentityMetadataForTrack(track);
  const trackIsrc = normalizeIsrc(track.isrc);
  const title = normalizeText(track.name);
  const album = normalizeText(track.album);
  const artists = normalizedSpotifyArtists(track);

  const pathMatch = bestIndexedTrackMatch(
    track,
    lookup.organizedPathBaseMatches.get(
      organizedTrackPathBaseLookupKey(track, naming)
    ),
    "path",
    naming
  );

  if (pathMatch) {
    return pathMatch;
  }

  if (identityMetadata.spotifyTrackId) {
    const match = bestIndexedTrackMatch(
      track,
      lookup.spotifyTrackIdMatches.get(identityMetadata.spotifyTrackId),
      "spotify_identity",
      naming
    );

    if (match) {
      return match;
    }
  }

  if (identityMetadata.spotifyTrackUri) {
    const match = bestIndexedTrackMatch(
      track,
      lookup.spotifyTrackUriMatches.get(identityMetadata.spotifyTrackUri),
      "spotify_identity",
      naming
    );

    if (match) {
      return match;
    }
  }

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
      .get(musicLibraryMatchLookupKey(title, album))
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

  const unambiguousArtistTitleMatch = unambiguousIndexedTrackMatch(
    track,
    indexedArtistCandidates(artists, lookup).filter((candidate) =>
      indexedTrackTitleLooselyMatches(track, candidate.track)
    ),
    "metadata",
    naming
  );

  if (unambiguousArtistTitleMatch) {
    return unambiguousArtistTitleMatch;
  }

  const contextualTitleMatch = unambiguousIndexedTrackMatch(
    track,
    indexedTitleCandidates(track, lookup).filter(
      (candidate) =>
        indexedTrackTitleLooselyMatches(track, candidate.track) &&
        indexedTrackHasSpotifyContext(track, candidate.track)
    ),
    "metadata",
    naming
  );

  if (contextualTitleMatch) {
    return contextualTitleMatch;
  }

  return null;
}

function indexedArtistCandidates(
  artists: Set<string>,
  lookup: MusicLibraryTrackLookup
) {
  const candidates = new Map<string, MusicLibraryTrackLookupEntry>();

  for (const artist of artists) {
    for (const candidate of lookup.artistMatches.get(artist) ?? []) {
      candidates.set(candidate.track.relativePath, candidate);
    }
  }

  return Array.from(candidates.values());
}

function indexedTitleCandidates(
  track: BackupTrack,
  lookup: MusicLibraryTrackLookup
) {
  const candidates = new Map<string, MusicLibraryTrackLookupEntry>();

  for (const titleKey of titleMatchKeys(track.name, [track.album])) {
    for (const candidate of lookup.titleMatches.get(titleKey) ?? []) {
      candidates.set(candidate.track.relativePath, candidate);
    }
  }

  return Array.from(candidates.values());
}

function bestIndexedTrackMatch(
  track: BackupTrack,
  candidates: MusicLibraryTrackLookupEntry[] | undefined,
  matchedBy: MusicLibraryTrackMatchMethod,
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

function unambiguousIndexedTrackMatch(
  track: BackupTrack,
  candidates: MusicLibraryTrackLookupEntry[] | undefined,
  matchedBy: MusicLibraryTrackMatchMethod,
  naming: OrganizeNamingSettings
) {
  const scoredCandidates = candidates
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
    );

  if (!scoredCandidates?.length) {
    return null;
  }

  if (
    scoredCandidates.length > 1 &&
    scoredCandidates[0].score === scoredCandidates[1].score
  ) {
    return null;
  }

  return {
    matchedBy,
    track: scoredCandidates[0].candidate.track
  };
}

function indexedTrackTitleMatches(
  track: BackupTrack,
  indexedTrack: MusicLibraryIndexedTrack
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

function indexedTrackTitleLooselyMatches(
  track: BackupTrack,
  indexedTrack: MusicLibraryIndexedTrack
) {
  return titleKeysCompatible(track.name, indexedTrack.title, [
    track.album,
    indexedTrack.album
  ]);
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
  indexedTrack: MusicLibraryIndexedTrack,
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

  if (indexedTrackHasSpotifyArtistContext(track, indexedTrack)) {
    score += 8;
  }

  if (indexedTrackHasSpotifyAlbumContext(track, indexedTrack)) {
    score += 6;
  }

  if (normalizeText(track.album) === normalizeText(indexedTrack.album)) {
    score += 5;
  }

  return score;
}

type MusicLibraryTrackLookup = {
  albumMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  artistMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  isrcMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  metadataMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  organizedPathBaseMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  spotifyTrackIdMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  spotifyTrackUriMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
  titleMatches: Map<string, MusicLibraryTrackLookupEntry[]>;
};

type MusicLibraryTrackLookupEntry = {
  albumKey: string;
  artistKeys: Set<string>;
  isrcKeys: Set<string>;
  spotifyTrackIdKey?: string;
  spotifyTrackUriKey?: string;
  titleKey: string;
  track: MusicLibraryIndexedTrack;
};

function buildMusicLibraryTrackLookup(
  indexedTracks: MusicLibraryIndexedTrack[]
): MusicLibraryTrackLookup {
  const lookup = {
    albumMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    artistMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    isrcMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    metadataMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    organizedPathBaseMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    spotifyTrackIdMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    spotifyTrackUriMatches: new Map<string, MusicLibraryTrackLookupEntry[]>(),
    titleMatches: new Map<string, MusicLibraryTrackLookupEntry[]>()
  } satisfies MusicLibraryTrackLookup;

  for (const track of indexedTracks) {
    const entry = {
      albumKey: normalizeText(track.album),
      artistKeys: indexedArtists(track),
      isrcKeys: new Set(
        [normalizeIsrc(track.isrc), normalizeIsrc(track.spotifyIsrc)].filter(
          (value): value is string => Boolean(value)
        )
      ),
      spotifyTrackIdKey: track.spotifyTrackId,
      spotifyTrackUriKey: track.spotifyTrackUri,
      titleKey: normalizeText(track.title),
      track
    } satisfies MusicLibraryTrackLookupEntry;

    for (const isrcKey of entry.isrcKeys) {
      appendMusicLibraryLookupEntry(lookup.isrcMatches, isrcKey, entry);
    }

    if (entry.spotifyTrackIdKey) {
      appendMusicLibraryLookupEntry(
        lookup.spotifyTrackIdMatches,
        entry.spotifyTrackIdKey,
        entry
      );
    }

    if (entry.spotifyTrackUriKey) {
      appendMusicLibraryLookupEntry(
        lookup.spotifyTrackUriMatches,
        entry.spotifyTrackUriKey,
        entry
      );
    }

    if (entry.albumKey) {
      appendMusicLibraryLookupEntry(lookup.albumMatches, entry.albumKey, entry);
    }

    for (const artistKey of entry.artistKeys) {
      appendMusicLibraryLookupEntry(lookup.artistMatches, artistKey, entry);
    }

    appendMusicLibraryLookupEntry(
      lookup.metadataMatches,
      musicLibraryMatchLookupKey(entry.titleKey, entry.albumKey),
      entry
    );
    appendMusicLibraryLookupEntry(
      lookup.organizedPathBaseMatches,
      indexedTrackPathBaseLookupKey(track),
      entry
    );

    for (const titleKey of titleMatchKeys(track.title, [track.album])) {
      appendMusicLibraryLookupEntry(lookup.titleMatches, titleKey, entry);
    }
  }

  return lookup;
}

function appendMusicLibraryLookupEntry(
  map: Map<string, MusicLibraryTrackLookupEntry[]>,
  key: string,
  entry: MusicLibraryTrackLookupEntry
) {
  const entries = map.get(key);

  if (entries) {
    entries.push(entry);
    return;
  }

  map.set(key, [entry]);
}

function musicLibraryMatchLookupKey(title: string, album: string) {
  return `${title}\u0000${album}`;
}

function indexedTrackPathBaseLookupKey(track: MusicLibraryIndexedTrack) {
  const parsed = path.posix.parse(track.relativePath);

  return normalizeRelativePathKey(path.posix.join(parsed.dir, parsed.name));
}

function organizedTrackPathBaseLookupKey(
  track: BackupTrack,
  naming: OrganizeNamingSettings
) {
  return normalizeRelativePathKey(
    buildMusicLibraryTrackRelativePathWithSettings(track, naming, "")
  );
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

function uniqueBackupTracksWithSpotifyIdentity(tracks: BackupTrack[]) {
  const tracksByIdentity = new Map<string, BackupTrack>();

  for (const track of tracks) {
    const key = spotifyBuIdentityKeyForTrack(track);

    if (key && !tracksByIdentity.has(key)) {
      tracksByIdentity.set(key, track);
    }
  }

  return Array.from(tracksByIdentity.values());
}

function indexedTrackHasSpotifyIdentity(
  indexedTrack: MusicLibraryIndexedTrack,
  identityMetadata: SpotifyBuIdentityMetadata
) {
  if (!spotifyBuIdentityMetadataHasTrackIdentity(identityMetadata)) {
    return false;
  }

  if (indexedTrack.spotifybuIdentityVersion !== spotifyBuIdentityVersion) {
    return false;
  }

  if (
    identityMetadata.spotifyTrackId &&
    indexedTrack.spotifyTrackId !== identityMetadata.spotifyTrackId
  ) {
    return false;
  }

  if (
    identityMetadata.spotifyTrackUri &&
    indexedTrack.spotifyTrackUri !== identityMetadata.spotifyTrackUri
  ) {
    return false;
  }

  if (
    identityMetadata.spotifyAlbumId &&
    indexedTrack.spotifyAlbumId !== identityMetadata.spotifyAlbumId
  ) {
    return false;
  }

  if (
    identityMetadata.spotifyIsrc &&
    normalizeIsrc(indexedTrack.spotifyIsrc) !==
      normalizeIsrc(identityMetadata.spotifyIsrc)
  ) {
    return false;
  }

  return true;
}

function indexedTrackNeedsSpotifyBackfill(
  indexedTrack: MusicLibraryIndexedTrack,
  track: BackupTrack,
  identityMetadata: SpotifyBuIdentityMetadata
) {
  if (!indexedTrackHasSpotifyIdentity(indexedTrack, identityMetadata)) {
    return true;
  }

  const releaseDate = spotifyReleaseDateTag(track.albumReleaseDate);

  if (releaseDate && indexedTrack.releaseDate !== releaseDate) {
    return true;
  }

  return isSpotifyCompilationAlbum(track) && indexedTrack.compilation !== true;
}

function normalizedSpotifyArtists(track: BackupTrack) {
  return new Set(
    [track.albumArtist, ...track.artists]
      .map(normalizeText)
      .filter((artist) => artist.length > 0)
  );
}

function indexedArtists(track: MusicLibraryIndexedTrack) {
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

  for (const leftArtist of left) {
    for (const rightArtist of right) {
      if (artistKeysCompatible(leftArtist, rightArtist)) {
        return true;
      }
    }
  }

  return false;
}

function artistKeysCompatible(left: string, right: string) {
  const leftKey = canonicalArtistKey(left);
  const rightKey = canonicalArtistKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey === rightKey) {
    return true;
  }

  const leftTokenCount = leftKey.split(/\s+/).filter(Boolean).length;
  const rightTokenCount = rightKey.split(/\s+/).filter(Boolean).length;

  return (
    leftTokenCount >= 2 &&
    rightTokenCount >= 2 &&
    (titleTokenCoverage(leftKey, rightKey) === 1 ||
      titleTokenCoverage(rightKey, leftKey) === 1)
  );
}

function canonicalArtistKey(value: string) {
  return value.replace(/^the\s+/, "").trim();
}

function indexedTrackHasSpotifyContext(
  track: BackupTrack,
  indexedTrack: MusicLibraryIndexedTrack
) {
  if (indexedTrackHasSpotifyArtistContext(track, indexedTrack)) {
    return true;
  }

  return (
    spotifyAlbumProvidesMatchContext(track) &&
    indexedTrackHasSpotifyAlbumContext(track, indexedTrack)
  );
}

function indexedTrackHasSpotifyArtistContext(
  track: BackupTrack,
  indexedTrack: MusicLibraryIndexedTrack
) {
  const pathText = indexedTrackContextText(indexedTrack);

  for (const artist of normalizedSpotifyArtists(track)) {
    if (normalizedTextContainsKey(pathText, artist)) {
      return true;
    }
  }

  return false;
}

function indexedTrackHasSpotifyAlbumContext(
  track: BackupTrack,
  indexedTrack: MusicLibraryIndexedTrack
) {
  const album = normalizeText(track.album);

  return (
    Boolean(album) &&
    normalizedTextContainsKey(indexedTrackAlbumContextText(indexedTrack), album)
  );
}

function indexedTrackContextText(indexedTrack: MusicLibraryIndexedTrack) {
  return normalizeText(
    [
      indexedTrack.relativePath,
      indexedTrack.relativeDirectory,
      indexedTrack.fileName,
      indexedTrack.album,
      indexedTrack.albumArtist,
      indexedTrack.artist,
      ...indexedTrack.artists
    ].filter(Boolean).join(" ")
  );
}

function indexedTrackAlbumContextText(indexedTrack: MusicLibraryIndexedTrack) {
  return normalizeText(
    [indexedTrack.relativeDirectory, indexedTrack.album].filter(Boolean).join(" ")
  );
}

function spotifyAlbumProvidesMatchContext(track: BackupTrack) {
  const album = normalizeText(track.album);
  const title = normalizeText(track.name);

  return Boolean(album && album !== title);
}

function normalizedTextContainsKey(text: string, key: string) {
  if (!text || !key) {
    return false;
  }

  return ` ${text} `.includes(` ${key} `);
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

async function ensureMusicLibraryOrganizedDirectory(relativeDirectory: string) {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const directoryPath = absoluteLibraryPath(
    libraryPath,
    normalizeRelativePath(relativeDirectory)
  );

  await mkdir(directoryPath, {
    recursive: true
  });

  return directoryPath;
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
    throw new Error("Resolved Navidrome target escaped the configured music path.");
  }

  return targetPath;
}

async function writeMusicLibraryIndex(index: MusicLibraryIndex) {
  const indexDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);

  await writeFile(
    path.join(/* turbopackIgnore: true */ indexDirectory, "library-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
  );
}

async function readAlbumFolderLog(): Promise<AlbumFolderLog> {
  const libraryPath = getMusicLibraryPath();

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
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    throw new Error("Navidrome music path is not configured.");
  }

  const logDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);
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
