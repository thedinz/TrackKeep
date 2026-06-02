import { execFile } from "child_process";
import { constants } from "fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  ensureNavidromeTargetDirectory,
  getNavidromeLibraryPath,
  planNavidromeAlbumFolders,
  recordNavidromeAlbumFolders
} from "@/lib/navidrome";
import type { BackupTrack } from "@/lib/spotify";
import {
  SOURCE_PROVIDER_CATALOG,
  type CandidateScore,
  type SourceCandidate,
  type SourceProviderCatalogEntry
} from "./types";

type DownloadProviderId = "jiosaavn" | "youtube";
type DownloadFormat = "flac" | "mp3";
type DownloadQuality = "128" | "320";

export type ProviderSearchRequest = {
  limit?: number;
  providerIds?: string[];
  track: BackupTrack;
};

export type ProviderSearchResult = {
  candidates: SourceCandidate[];
  errors: Array<{
    error: string;
    providerId: DownloadProviderId;
  }>;
  providerOrder: DownloadProviderId[];
};

export type AuthorizedProviderDownloadRequest = {
  bulkRiskAccepted: boolean;
  format?: string;
  providerId: string;
  quality?: string;
  rightsConfirmed: boolean;
  selectedReason?: string;
  sourceUrl: string;
  track: BackupTrack;
};

export type AuthorizedProviderDownloadBatchItem = {
  format?: string;
  providerId: string;
  quality?: string;
  selectedReason?: string;
  sourceUrl: string;
  track: BackupTrack;
};

export type AuthorizedProviderDownloadBatchRequest = {
  bulkRiskAccepted: boolean;
  chunkPauseMs?: number;
  chunkSize?: number;
  delayMs?: number;
  format?: string;
  items: AuthorizedProviderDownloadBatchItem[];
  quality?: string;
  rightsConfirmed: boolean;
};

export type AuthorizedProviderDownloadResult = {
  bytesWritten?: number;
  destinationPath: string;
  format: DownloadFormat;
  providerId: DownloadProviderId;
  quality: DownloadQuality;
  provenancePath?: string;
  relativePath?: string;
  sourceUrl: string;
};

export type AuthorizedProviderDownloadBatchResult = {
  completedCount: number;
  failedCount: number;
  results: Array<
    | {
        ok: true;
        result: AuthorizedProviderDownloadResult;
        trackPosition: number;
      }
    | {
        error: string;
        ok: false;
        trackName: string;
        trackPosition: number;
      }
  >;
  totalCount: number;
};

type ProviderDownloadLog = {
  downloads: ProviderDownloadLogEntry[];
  updatedAt: string;
  version: 1;
};

type YtDlpSearchEntry = {
  channel?: string;
  duration?: number;
  id?: string;
  title?: string;
  uploader?: string;
  url?: string;
  webpage_url?: string;
};

type YtDlpSearchResult = {
  entries?: YtDlpSearchEntry[];
};

type JioSaavnAutocompleteResponse = {
  songs?: {
    data?: JioSaavnSongEntry[];
  };
};

type JioSaavnSongEntry = {
  duration?: string;
  id?: string;
  more_info?: {
    album?: string;
    duration?: string;
    primary_artists?: string;
    singers?: string;
  };
  perma_url?: string;
  subtitle?: string;
  title?: string;
  url?: string;
};

type ProviderDownloadLogEntry = {
  album: string;
  artists: string[];
  bytesWritten?: number;
  confirmedAt: string;
  destinationPath: string;
  downloadUrl: string;
  format: DownloadFormat;
  providerId: DownloadProviderId;
  quality: DownloadQuality;
  relativePath?: string;
  selectedReason?: string;
  sourceUrl: string;
  trackId?: string;
  trackName: string;
};

const execFileAsync = promisify(execFile);
const downloadableProviderIds = new Set<DownloadProviderId>([
  "jiosaavn",
  "youtube"
]);
const defaultProviderSearchOrder: DownloadProviderId[] = ["youtube", "jiosaavn"];
const provenanceLogSegments = [".spotifybu", "provider-downloads.json"];
const maxBatchItems = 500;
const stagingRootSegments = [".spotifybu", "tmp", "provider-downloads"];
const idleCleanupDelayMs = 10 * 60 * 1000;
let idleCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let activeDownloadOperations = 0;

export async function searchProviderCandidates(
  request: ProviderSearchRequest
): Promise<ProviderSearchResult> {
  validateTrack(request.track);

  const limit = clampPositiveInteger(request.limit, 5, 1, 50);
  const providerOrder = normalizeSearchProviderOrder(request.providerIds);
  const candidates: SourceCandidate[] = [];
  const errors: ProviderSearchResult["errors"] = [];

  for (const providerId of providerOrder) {
    try {
      const providerCandidates =
        providerId === "youtube"
          ? await searchYoutubeCandidates(request.track, limit)
          : await searchJioSaavnCandidates(request.track, limit);
      candidates.push(...providerCandidates);
    } catch (error) {
      errors.push({
        error:
          error instanceof Error
            ? error.message
            : "Provider search failed.",
        providerId
      });
    }
  }

  candidates.sort((left, right) => {
    const providerDelta =
      providerOrder.indexOf(left.providerId as DownloadProviderId) -
      providerOrder.indexOf(right.providerId as DownloadProviderId);

    return providerDelta || right.score.overall - left.score.overall;
  });

  return {
    candidates: candidates.slice(0, limit * providerOrder.length),
    errors,
    providerOrder
  };
}

export async function downloadAuthorizedProviderBatch(
  request: AuthorizedProviderDownloadBatchRequest
) {
  if (!request.rightsConfirmed) {
    throw new Error("Confirm you are authorized to download these tracks first.");
  }

  if (!request.bulkRiskAccepted) {
    throw new Error("Accept the provider and bulk-download risk warning first.");
  }

  if (!Array.isArray(request.items) || !request.items.length) {
    throw new Error("Add at least one provider download item to the bulk queue.");
  }

  if (request.items.length > maxBatchItems) {
    throw new Error(`Bulk queues are limited to ${maxBatchItems} tracks.`);
  }

  const chunkSize = clampPositiveInteger(request.chunkSize, 5, 1, 20);
  const delayMs = clampPositiveInteger(request.delayMs, 4000, 1000, 120000);
  const chunkPauseMs = clampPositiveInteger(
    request.chunkPauseMs,
    60000,
    5000,
    600000
  );
  const results: AuthorizedProviderDownloadBatchResult["results"] = [];

  for (let index = 0; index < request.items.length; index += 1) {
    const item = request.items[index];

    try {
      const result = await downloadAuthorizedProviderTrack({
        bulkRiskAccepted: true,
        format: item.format ?? request.format,
        providerId: item.providerId,
        quality: item.quality ?? request.quality,
        rightsConfirmed: true,
        selectedReason:
          item.selectedReason ??
          "SpotifyBU queued a reviewed provider candidate for bulk backup",
        sourceUrl: item.sourceUrl,
        track: item.track
      });

      results.push({
        ok: true,
        result,
        trackPosition: item.track.position
      });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : "Provider download failed.",
        ok: false,
        trackName: item.track.name,
        trackPosition: item.track.position
      });
    }

    const isLast = index === request.items.length - 1;
    const isChunkBoundary = (index + 1) % chunkSize === 0;

    if (!isLast) {
      await sleep(isChunkBoundary ? chunkPauseMs : delayMs);
    }
  }

  const failedCount = results.filter((result) => !result.ok).length;

  return {
    completedCount: results.length - failedCount,
    failedCount,
    results,
    totalCount: request.items.length
  } satisfies AuthorizedProviderDownloadBatchResult;
}

export async function downloadAuthorizedProviderTrack(
  request: AuthorizedProviderDownloadRequest
) {
  beginProviderDownloadActivity();

  try {
    return await downloadAuthorizedProviderTrackInner(request);
  } finally {
    endProviderDownloadActivity();
  }
}

async function downloadAuthorizedProviderTrackInner(
  request: AuthorizedProviderDownloadRequest
) {
  const providerId = assertDownloadProvider(request.providerId);
  const providerCatalog: readonly SourceProviderCatalogEntry[] =
    SOURCE_PROVIDER_CATALOG;
  const provider = providerCatalog.find(
    (entry) => entry.id === providerId
  );

  if (!provider?.capabilities.includes("download")) {
    throw new Error("Choose a download-capable provider.");
  }

  if (!request.rightsConfirmed) {
    throw new Error("Confirm you are authorized to download this track first.");
  }

  if (!request.bulkRiskAccepted) {
    throw new Error("Accept the provider and bulk-download risk warning first.");
  }

  validateTrack(request.track);

  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const source = resolveProviderSource(providerId, request.sourceUrl);
  const format = normalizeDownloadFormat(request.format);
  const quality = normalizeDownloadQuality(request.quality);
  const [folderPlan] = await planNavidromeAlbumFolders([request.track]);

  if (!folderPlan) {
    throw new Error("Could not plan a Navidrome destination for this track.");
  }

  await recordNavidromeAlbumFolders([request.track]);
  const targetDirectory = await ensureNavidromeTargetDirectory([
    folderPlan.folderName
  ]);
  const fileBase = buildTrackFileBase(request.track);
  const stagingDirectory = await createDownloadStagingDirectory(libraryPath);
  const outputTemplate = path.join(
    /* turbopackIgnore: true */ stagingDirectory,
    `${fileBase}.%(ext)s`
  );
  const beforePaths = await matchingOutputPaths(
    stagingDirectory,
    fileBase
  );
  const stdout = await runYtDlp({
    downloadUrl: source.downloadUrl,
    format,
    outputTemplate,
    quality
  });
  const stagedPath = await findDownloadedPath({
    beforePaths,
    format,
    outputTemplate,
    stdout,
    targetDirectory: stagingDirectory
  });
  const finalPath = await moveStagedDownloadToTarget({
    fileBase,
    format,
    stagedPath,
    targetDirectory
  });

  await tagDownloadedFile(finalPath, request.track);
  await cleanupDirectory(stagingDirectory);
  scheduleIdleTempCleanup();

  const fileStats = await stat(finalPath);
  const relativePath = toLibraryRelativePath(libraryPath, finalPath);
  const provenancePath = await recordProviderDownload({
    album: request.track.album,
    artists: request.track.artists,
    bytesWritten: fileStats.size,
    confirmedAt: new Date().toISOString(),
    destinationPath: finalPath,
    downloadUrl: source.downloadUrl,
    format,
    providerId,
    quality,
    relativePath,
    selectedReason: request.selectedReason,
    sourceUrl: source.sourceUrl,
    trackId: request.track.id,
    trackName: request.track.name
  });

  return {
    bytesWritten: fileStats.size,
    destinationPath: finalPath,
    format,
    providerId,
    quality,
    provenancePath,
    relativePath,
    sourceUrl: source.sourceUrl
  } satisfies AuthorizedProviderDownloadResult;
}

function normalizeDownloadFormat(value?: string): DownloadFormat {
  return value === "flac" ? "flac" : "mp3";
}

function normalizeDownloadQuality(value?: string): DownloadQuality {
  return value === "128" ? "128" : "320";
}

function normalizeSearchProviderOrder(providerIds?: string[]) {
  const normalizedProviderIds = (providerIds?.length
    ? providerIds
    : defaultProviderSearchOrder
  )
    .map((providerId) => providerId.trim().toLowerCase())
    .filter((providerId): providerId is DownloadProviderId =>
      downloadableProviderIds.has(providerId as DownloadProviderId)
    );
  const providerOrder = normalizedProviderIds.filter(
    (providerId, index) => normalizedProviderIds.indexOf(providerId) === index
  );

  return providerOrder.length ? providerOrder : defaultProviderSearchOrder;
}

async function searchYoutubeCandidates(
  track: BackupTrack,
  limit: number
): Promise<SourceCandidate[]> {
  const searchQuery = providerSearchQuery(track, "official audio");
  const searchResult = await runYtDlpSearch(`ytsearch${limit}:${searchQuery}`);
  const entries = Array.isArray(searchResult.entries) ? searchResult.entries : [];

  return entries
    .map((entry, index) => youtubeCandidateFromEntry(track, entry, index))
    .filter((candidate): candidate is SourceCandidate => Boolean(candidate));
}

async function searchJioSaavnCandidates(
  track: BackupTrack,
  limit: number
): Promise<SourceCandidate[]> {
  const query = providerSearchQuery(track);
  const searchUrl = new URL("https://www.jiosaavn.com/api.php");
  searchUrl.search = new URLSearchParams({
    __call: "autocomplete.get",
    _format: "json",
    _marker: "0",
    query
  }).toString();

  const response = await fetch(searchUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "SpotifyBU/1.0"
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`JioSaavn search returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as JioSaavnAutocompleteResponse;
  const entries = Array.isArray(body.songs?.data) ? body.songs.data : [];

  return entries
    .slice(0, limit)
    .map((entry, index) => jioSaavnCandidateFromEntry(track, entry, index))
    .filter((candidate): candidate is SourceCandidate => Boolean(candidate));
}

async function runYtDlpSearch(searchUrl: string) {
  const timeoutMs = Number(process.env.SPOTIFYBU_PROVIDER_SEARCH_TIMEOUT_MS);
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--dump-single-json",
      "--flat-playlist",
      "--skip-download",
      "--no-warnings",
      "--quiet",
      searchUrl
    ],
    {
      maxBuffer: 1024 * 1024 * 4,
      timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45000
    }
  );

  return JSON.parse(stdout.toString()) as YtDlpSearchResult;
}

function youtubeCandidateFromEntry(
  track: BackupTrack,
  entry: YtDlpSearchEntry,
  index: number
): SourceCandidate | null {
  const videoId = extractYoutubeVideoIdFromValue(
    String(entry.id ?? entry.url ?? entry.webpage_url ?? "")
  );

  if (!videoId || !entry.title) {
    return null;
  }

  const title = String(entry.title);
  const artists = [entry.channel, entry.uploader]
    .filter((value): value is string => Boolean(value))
    .map((value) => stripHtmlEntities(value));
  const durationMs =
    typeof entry.duration === "number"
      ? Math.round(entry.duration * 1000)
      : undefined;
  const score = scoreCandidate(track, {
    artists,
    durationMs,
    title
  });

  return {
    artists,
    durationMs,
    id: `youtube:${videoId}`,
    providerId: "youtube",
    score: {
      ...score,
      overall: Math.max(0, score.overall - index)
    },
    title: stripHtmlEntities(title),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    verified: false
  } satisfies SourceCandidate;
}

function jioSaavnCandidateFromEntry(
  track: BackupTrack,
  entry: JioSaavnSongEntry,
  index: number
): SourceCandidate | null {
  const url = entry.perma_url || entry.url;

  if (!url || !entry.title) {
    return null;
  }

  const title = stripHtmlEntities(entry.title);
  const artistText =
    entry.more_info?.primary_artists ||
    entry.more_info?.singers ||
    entry.subtitle ||
    "";
  const artists = splitProviderArtists(stripHtmlEntities(artistText));
  const durationSeconds = Number(entry.more_info?.duration ?? entry.duration);
  const durationMs = Number.isFinite(durationSeconds)
    ? Math.round(durationSeconds * 1000)
    : undefined;
  const score = scoreCandidate(track, {
    artists,
    durationMs,
    title
  });

  return {
    album: stripHtmlEntities(entry.more_info?.album ?? ""),
    artists,
    durationMs,
    id: `jiosaavn:${entry.id ?? index}`,
    providerId: "jiosaavn",
    score: {
      ...score,
      overall: Math.max(0, score.overall - index)
    },
    title,
    url,
    verified: false
  } satisfies SourceCandidate;
}

function providerSearchQuery(track: BackupTrack, suffix?: string) {
  return [
    track.name,
    track.artists.slice(0, 2).join(" "),
    suffix
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreCandidate(
  track: BackupTrack,
  candidate: {
    artists: string[];
    durationMs?: number;
    title: string;
  }
) {
  const titleScore = textSimilarity(track.name, candidate.title);
  const artistScore = Math.max(
    ...track.artists.map((artist) =>
      textSimilarity(artist, candidate.artists.join(" "))
    ),
    0
  );
  const durationDeltaMs =
    typeof candidate.durationMs === "number"
      ? Math.abs(candidate.durationMs - track.durationMs)
      : undefined;
  const durationScore =
    typeof durationDeltaMs === "number"
      ? Math.max(0, 100 - Math.round(durationDeltaMs / 1000) * 3)
      : 50;
  const overall = Math.round(titleScore * 0.48 + artistScore * 0.34 + durationScore * 0.18);

  return {
    artistScore,
    durationDeltaMs,
    overall,
    titleScore
  } satisfies CandidateScore;
}

function textSimilarity(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let intersectionCount = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionCount += 1;
    }
  }

  return Math.round(
    (intersectionCount / new Set([...leftTokens, ...rightTokens]).size) * 100
  );
}

function tokenSet(value: string) {
  return new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((token) => token.length > 1)
  );
}

function normalizeSearchText(value: string) {
  return stripHtmlEntities(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitProviderArtists(value: string) {
  return value
    .split(/,|&|;|\band\b/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function stripHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function createDownloadStagingDirectory(libraryPath: string) {
  const stagingRoot = await ensureNavidromeTargetDirectory(stagingRootSegments);
  const stagingDirectory = path.join(
    /* turbopackIgnore: true */ stagingRoot,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  assertLibraryPath(stagingDirectory, libraryPath);
  await mkdir(stagingDirectory, {
    recursive: true
  });

  return stagingDirectory;
}

async function moveStagedDownloadToTarget({
  fileBase,
  format,
  stagedPath,
  targetDirectory
}: {
  fileBase: string;
  format: DownloadFormat;
  stagedPath: string;
  targetDirectory: string;
}) {
  const desiredTargetPath = path.join(
    /* turbopackIgnore: true */ targetDirectory,
    `${fileBase}.${format}`
  );
  const targetPath = await nextAvailableFilePath(desiredTargetPath);

  await rename(stagedPath, targetPath);

  return targetPath;
}

async function nextAvailableFilePath(filePath: string) {
  const parsedPath = path.parse(filePath);

  for (let count = 0; count < 1000; count += 1) {
    const candidatePath =
      count === 0
        ? filePath
        : path.join(
            /* turbopackIgnore: true */ parsedPath.dir,
            `${parsedPath.name} (${count + 1})${parsedPath.ext}`
          );

    if (!(await canAccess(candidatePath, constants.F_OK))) {
      return candidatePath;
    }
  }

  throw new Error("Could not find an available destination filename.");
}

async function cleanupDirectory(directory: string) {
  await rm(directory, {
    force: true,
    recursive: true
  });
}

function assertLibraryPath(filePath: string, libraryPath: string) {
  const relativePath = path.relative(libraryPath, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved provider staging path escaped the library path.");
  }
}

function beginProviderDownloadActivity() {
  activeDownloadOperations += 1;

  if (idleCleanupTimer) {
    clearTimeout(idleCleanupTimer);
    idleCleanupTimer = null;
  }
}

function endProviderDownloadActivity() {
  activeDownloadOperations = Math.max(0, activeDownloadOperations - 1);
  scheduleIdleTempCleanup();
}

function scheduleIdleTempCleanup() {
  if (idleCleanupTimer) {
    clearTimeout(idleCleanupTimer);
  }

  idleCleanupTimer = setTimeout(() => {
    void cleanupStaleProviderTempFiles().catch(() => undefined);
  }, idleCleanupDelayMs);
}

async function cleanupStaleProviderTempFiles() {
  if (activeDownloadOperations > 0) {
    scheduleIdleTempCleanup();
    return;
  }

  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    return;
  }

  const stagingRoot = path.join(
    /* turbopackIgnore: true */ libraryPath,
    ...stagingRootSegments
  );
  const cutoff = Date.now() - idleCleanupDelayMs;

  let entries;

  try {
    entries = await readdir(stagingRoot, {
      withFileTypes: true
    });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(/* turbopackIgnore: true */ stagingRoot, entry.name);

      try {
        const entryStats = await stat(entryPath);

        if (entryStats.mtimeMs <= cutoff) {
          await rm(entryPath, {
            force: true,
            recursive: true
          });
        }
      } catch {
        // Cleanup is best-effort; failed temp entries will be retried later.
      }
    })
  );
}

function assertDownloadProvider(value: string) {
  if (downloadableProviderIds.has(value as DownloadProviderId)) {
    return value as DownloadProviderId;
  }

  throw new Error("Choose YouTube or JioSaavn.");
}

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (!Number.isFinite(value) || !value) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function validateTrack(track: BackupTrack) {
  if (!track || typeof track.name !== "string" || !track.name.trim()) {
    throw new Error("Send a Spotify track before downloading.");
  }

  if (!Array.isArray(track.artists)) {
    throw new Error("Send Spotify track artists before downloading.");
  }
}

function resolveProviderSource(providerId: DownloadProviderId, input: string) {
  const sourceUrl = input.trim();

  if (!sourceUrl) {
    throw new Error("Search and choose a provider candidate before downloading.");
  }

  const url = parseHttpsUrl(sourceUrl);

  if (providerId === "youtube") {
    assertYoutubeUrl(url);

    return {
      downloadUrl: sourceUrl,
      sourceUrl
    };
  }

  assertJioSaavnSongUrl(url);

  return {
    downloadUrl: sourceUrl,
    sourceUrl
  };
}

function parseHttpsUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Choose a valid provider result.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Provider downloads require an HTTPS source URL.");
  }

  return url;
}

function assertYoutubeUrl(url: URL) {
  const hostname = normalizedHost(url);
  const isYoutube =
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be";

  if (!isYoutube) {
    throw new Error("Choose a youtube.com or youtu.be result for YouTube.");
  }

  if (hostname !== "youtu.be" && url.pathname !== "/watch") {
    throw new Error("Choose a single YouTube video, not a playlist page.");
  }

  if (hostname !== "youtu.be" && !url.searchParams.get("v")) {
    throw new Error("Choose a single YouTube video result.");
  }
}

function assertJioSaavnSongUrl(url: URL) {
  const hostname = normalizedHost(url);

  if (
    hostname !== "jiosaavn.com" &&
    hostname !== "www.jiosaavn.com" &&
    hostname !== "saavn.com" &&
    hostname !== "www.saavn.com"
  ) {
    throw new Error("Choose a JioSaavn song result.");
  }

  if (!url.pathname.includes("/song/")) {
    throw new Error("Choose a single JioSaavn song, not an album or playlist.");
  }
}

function normalizedHost(url: URL) {
  return url.hostname.toLowerCase();
}

function sanitizeYoutubeVideoId(value: string) {
  const match = value.match(/^[A-Za-z0-9_-]{6,20}$/);

  return match?.[0] ?? null;
}

function extractYoutubeVideoIdFromValue(value: string) {
  const directId = sanitizeYoutubeVideoId(value);

  if (directId) {
    return directId;
  }

  try {
    const url = new URL(value);
    const hostname = normalizedHost(url);

    if (hostname === "youtu.be") {
      return sanitizeYoutubeVideoId(url.pathname.replace(/^\//, ""));
    }

    if (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com"
    ) {
      return sanitizeYoutubeVideoId(url.searchParams.get("v") ?? "");
    }
  } catch {
    return null;
  }

  return null;
}

async function runYtDlp({
  downloadUrl,
  format,
  outputTemplate,
  quality
}: {
  downloadUrl: string;
  format: DownloadFormat;
  outputTemplate: string;
  quality: DownloadQuality;
}) {
  const timeoutMs = Number(process.env.SPOTIFYBU_PROVIDER_DOWNLOAD_TIMEOUT_MS);
  const formatSelector = `bestaudio[abr<=${quality}]/bestaudio/best`;
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-overwrites",
      "--restrict-filenames",
      "--extract-audio",
      "--audio-format",
      format,
      "--audio-quality",
      `${quality}K`,
      "--format",
      formatSelector,
      "--embed-metadata",
      "--embed-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "--sleep-requests",
      "1",
      "--sleep-interval",
      "2",
      "--max-sleep-interval",
      "6",
      "--print",
      "after_move:filepath",
      "--output",
      outputTemplate,
      downloadUrl
    ],
    {
      maxBuffer: 1024 * 1024 * 2,
      timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600000
    }
  );

  return stdout.toString();
}

async function matchingOutputPaths(directory: string, fileBase: string) {
  const extensions = ["mp3", "m4a", "opus", "webm", "flac"];
  const paths = new Set<string>();

  await Promise.all(
    extensions.map(async (extension) => {
      const filePath = path.join(
        /* turbopackIgnore: true */ directory,
        `${fileBase}.${extension}`
      );

      if (await canAccess(filePath, constants.F_OK)) {
        paths.add(filePath);
      }
    })
  );

  return paths;
}

async function findDownloadedPath({
  beforePaths,
  format,
  outputTemplate,
  stdout,
  targetDirectory
}: {
  beforePaths: Set<string>;
  format: DownloadFormat;
  outputTemplate: string;
  stdout: string;
  targetDirectory: string;
}) {
  const printedPaths = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => path.resolve(/* turbopackIgnore: true */ line));

  for (const printedPath of printedPaths.reverse()) {
    if (isPathInside(printedPath, targetDirectory)) {
      return printedPath;
    }
  }

  const expectedOutputPath = path.resolve(
    /* turbopackIgnore: true */ outputTemplate.replace("%(ext)s", format)
  );

  if (
    !beforePaths.has(expectedOutputPath) &&
    (await canAccess(expectedOutputPath, constants.F_OK))
  ) {
    return expectedOutputPath;
  }

  throw new Error("The provider download finished but no output file was found.");
}

async function tagDownloadedFile(filePath: string, track: BackupTrack) {
  const parsedPath = path.parse(filePath);
  const tempPath = path.join(
    /* turbopackIgnore: true */ parsedPath.dir,
    `${parsedPath.name}.spotifybu-tagging${parsedPath.ext}`
  );
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

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        filePath,
        "-map",
        "0",
        "-c",
        "copy",
        ...metadataArgs,
        tempPath
      ],
      {
        maxBuffer: 1024 * 1024 * 2,
        timeout: 60000
      }
    );
    await rename(tempPath, filePath);
  } catch {
    if (await canAccess(tempPath, constants.F_OK)) {
      await rm(tempPath, {
        force: true
      }).catch(() => undefined);
    }
  }
}

async function recordProviderDownload(entry: ProviderDownloadLogEntry) {
  const log = await readProviderDownloadLog();
  const now = new Date().toISOString();

  log.downloads.push(entry);
  log.updatedAt = now;

  const logDirectory = await ensureNavidromeTargetDirectory([".spotifybu"]);
  const logPath = path.join(
    /* turbopackIgnore: true */ logDirectory,
    "provider-downloads.json"
  );

  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  return logPath;
}

async function readProviderDownloadLog(): Promise<ProviderDownloadLog> {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    return emptyProviderDownloadLog();
  }

  try {
    const contents = await readFile(
      path.join(
        /* turbopackIgnore: true */ libraryPath,
        ...provenanceLogSegments
      ),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<ProviderDownloadLog>;

    if (parsed.version !== 1 || !Array.isArray(parsed.downloads)) {
      return emptyProviderDownloadLog();
    }

    return parsed as ProviderDownloadLog;
  } catch {
    return emptyProviderDownloadLog();
  }
}

function emptyProviderDownloadLog(): ProviderDownloadLog {
  return {
    downloads: [],
    updatedAt: new Date(0).toISOString(),
    version: 1
  };
}

function buildTrackFileBase(track: BackupTrack) {
  const prefix = track.trackNumber
    ? track.trackNumber.toString().padStart(2, "0")
    : track.position.toString().padStart(2, "0");

  return sanitizeFileBase(`${prefix} - ${track.name}`);
}

function sanitizeFileBase(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Unknown Track"
  );
}

function toLibraryRelativePath(libraryPath: string, filePath: string) {
  return path.relative(libraryPath, filePath).split(path.sep).join("/");
}

function isPathInside(filePath: string, directory: string) {
  const relativePath = path.relative(directory, filePath);

  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function canAccess(filePath: string, mode: number) {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}
