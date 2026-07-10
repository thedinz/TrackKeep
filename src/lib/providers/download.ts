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
  ensureMusicLibraryTargetDirectory,
  getMusicLibraryPath,
  prepareMusicLibraryTrackFileDestination,
  recordMusicLibraryAlbumFolders,
  upsertMusicLibraryIndexTrack,
  type MusicLibraryIndexSummary
} from "@/lib/music-library";
import { getSpotifyBuDatabase } from "@/lib/database";
import {
  isUnresolvedSpotifyLocalBackupTrack,
  unresolvedSpotifyLocalTrackMessage,
  type BackupTrack
} from "@/lib/spotify";
import { scoreProviderCandidate } from "./scoring";
import {
  providerSearchQuery,
  youtubeProviderSearchQueries
} from "./search-query";
import {
  SOURCE_PROVIDER_CATALOG,
  type SourceCandidate,
  type SourceProviderCatalogEntry
} from "./types";
import { tagDownloadedFile } from "./tagging";

type DownloadProviderId = "jiosaavn" | "youtube";
type DownloadFormat = "opus" | "mp3";
type DownloadQuality = "128" | "160" | "192" | "256" | "320";
type DownloadFallbackFormat = "mp3" | "none";
type DownloadFormatProfile = {
  bitrate: number;
  codec: "Opus" | "MP3";
  container: "Ogg Opus" | "MPEG";
  defaultQuality: DownloadQuality;
  extension: DownloadFormat;
  label: string;
  modernLossyRank: number;
};

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

export type ProviderDownloadJobStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running";

export type ProviderBulkDownloadJobStatus =
  | "cancelled"
  | "cancelling"
  | "completed"
  | "failed"
  | "queued"
  | "running";

export type ProviderBulkDownloadItemStatus =
  | "cancelled"
  | "completed"
  | "downloading"
  | "failed"
  | "pending";

export type ProviderDownloadJobSnapshot = {
  createdAt: string;
  diagnosticId: string;
  download?: AuthorizedProviderDownloadResult;
  error?: string;
  id: string;
  request: {
    providerId: string;
    sourceHost: string;
    sourceUrl: string;
    trackName: string;
    trackPosition?: number;
  };
  status: ProviderDownloadJobStatus;
  updatedAt: string;
};

export type ProviderBulkCandidatePreviewItem = {
  candidate?: SourceCandidate;
  candidates: SourceCandidate[];
  errors: ProviderSearchResult["errors"];
  track: BackupTrack;
};

export type ProviderBulkCandidatePreviewResult = {
  downloadableCount: number;
  failedCount: number;
  generatedAt: string;
  items: ProviderBulkCandidatePreviewItem[];
  totalCount: number;
};

export type ProviderBulkCandidatePreviewProgress = {
  completedCount: number;
  failedCount: number;
  item: ProviderBulkCandidatePreviewItem;
  totalCount: number;
};

type ProviderCandidateSearchOutcome =
  | {
      candidates: SourceCandidate[];
      ok: true;
      providerId: DownloadProviderId;
    }
  | {
      error: string;
      ok: false;
      providerId: DownloadProviderId;
    };

export type AuthorizedProviderDownloadRequest = {
  bulkRiskAccepted: boolean;
  diagnosticId?: string;
  fallbackFormat?: string;
  fallbackQuality?: string;
  fallbackSources?: AuthorizedProviderDownloadFallbackSource[];
  format?: string;
  providerId: string;
  quality?: string;
  rightsConfirmed: boolean;
  selectedReason?: string;
  sourceUrl: string;
  track: BackupTrack;
};

export type AuthorizedProviderDownloadFallbackSource = {
  candidateScore?: number;
  candidateTitle?: string;
  providerId: string;
  selectedReason?: string;
  sourceUrl: string;
};

export type AuthorizedProviderDownloadBatchItem = {
  candidateScore?: number;
  candidateTitle?: string;
  fallbackFormat?: string;
  fallbackQuality?: string;
  fallbackSources?: AuthorizedProviderDownloadFallbackSource[];
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
  fallbackFormat?: string;
  fallbackQuality?: string;
  format?: string;
  items: AuthorizedProviderDownloadBatchItem[];
  quality?: string;
  rightsConfirmed: boolean;
};

export type AuthorizedProviderBulkDownloadRequest = {
  bulkRiskAccepted: boolean;
  chunkPauseMs?: number;
  chunkSize?: number;
  delayMs?: number;
  fallbackFormat?: string;
  fallbackQuality?: string;
  format?: string;
  items: AuthorizedProviderDownloadBatchItem[];
  quality?: string;
  rightsConfirmed: boolean;
};

export type AuthorizedProviderDownloadResult = {
  bytesWritten?: number;
  diagnosticId: string;
  destinationPath: string;
  format: DownloadFormat;
  libraryIndex?: MusicLibraryIndexSummary;
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

export type ProviderBulkDownloadJobItemSnapshot = {
  candidateScore?: number;
  candidateTitle?: string;
  completedAt?: string;
  download?: AuthorizedProviderDownloadResult;
  error?: string;
  fallbackSources?: AuthorizedProviderDownloadFallbackSource[];
  providerId: string;
  selectedReason?: string;
  sourceUrl: string;
  startedAt?: string;
  status: ProviderBulkDownloadItemStatus;
  track: BackupTrack;
};

export type ProviderBulkDownloadJobSnapshot = {
  cancelRequestedAt?: string;
  completedAt?: string;
  completedCount: number;
  createdAt: string;
  diagnosticId: string;
  failedCount: number;
  id: string;
  items: ProviderBulkDownloadJobItemSnapshot[];
  pendingCount: number;
  request: {
    chunkPauseMs: number;
    chunkSize: number;
    delayMs: number;
    fallbackFormat: DownloadFallbackFormat;
    fallbackQuality?: DownloadQuality;
    format: DownloadFormat;
    quality: DownloadQuality;
  };
  runningCount: number;
  status: ProviderBulkDownloadJobStatus;
  totalCount: number;
  updatedAt: string;
};

type ProviderDownloadLog = {
  downloads: ProviderDownloadLogEntry[];
  updatedAt: string;
  version: 1;
};

type ProviderDownloadAttemptLog = {
  attempts: ProviderDownloadAttemptLogEntry[];
  updatedAt: string;
  version: 1;
};

type ProviderDownloadJobRecord = {
  createdAt: string;
  diagnosticId: string;
  download?: AuthorizedProviderDownloadResult;
  error?: string;
  id: string;
  request: AuthorizedProviderDownloadRequest;
  requestSummary: ProviderDownloadJobSnapshot["request"];
  status: ProviderDownloadJobStatus;
  updatedAt: string;
};

type ProviderBulkDownloadJobRecord = {
  cancelRequestedAt?: string;
  completedAt?: string;
  createdAt: string;
  diagnosticId: string;
  id: string;
  items: ProviderBulkDownloadJobItemSnapshot[];
  request: ProviderBulkDownloadJobSnapshot["request"];
  status: ProviderBulkDownloadJobStatus;
  updatedAt: string;
};

type ProviderBulkDownloadJobRow = {
  snapshot_json: string;
};

type ProviderDownloadAttemptStatus = "completed" | "failed" | "started";

type ProviderDownloadAttemptLogEntry = {
  bytesWritten?: number;
  destinationPath?: string;
  diagnosticId: string;
  error?: string;
  format: DownloadFormat;
  providerId: DownloadProviderId;
  quality: DownloadQuality;
  relativePath?: string;
  sourceUrl: string;
  stage?: string;
  status: ProviderDownloadAttemptStatus;
  timestamp: string;
  trackId?: string;
  trackName: string;
  trackPosition: number;
};

type YtDlpSearchEntry = {
  channel?: string;
  duration?: number;
  id?: string;
  release_timestamp?: number;
  timestamp?: number;
  title?: string;
  uploader?: string;
  upload_date?: string;
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

type ExecFileError = Error & {
  code?: number | string;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
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
const attemptLogSegments = [".spotifybu", "provider-download-attempts.json"];
const maxAttemptLogEntries = 200;
const maxBatchItems = 500;
const maxProviderDownloadJobs = 100;
const providerDownloadJobTtlMs = 2 * 60 * 60 * 1000;
const defaultProviderBulkChunkSize = 3;
const defaultProviderBulkDelayMs = 10000;
const defaultProviderBulkChunkPauseMs = 120000;
const providerFallbackDelayMs = 5000;
const defaultProviderSearchTimeoutMs = 20000;
const maxYoutubeSearchResultsPerQuery = 25;
const minYoutubeSearchResultsPerQuery = 5;
const confidentYoutubeCandidateScore = 94;
const stagingRootSegments = [".spotifybu", "tmp", "provider-downloads"];
const idleCleanupDelayMs = 10 * 60 * 1000;
const defaultYtDlpJsRuntime = "node";
const defaultProviderDownloadFormat: DownloadFormat = "opus";
export const providerDownloadFormatProfiles = {
  opus: {
    bitrate: 192000,
    codec: "Opus",
    container: "Ogg Opus",
    defaultQuality: "192",
    extension: "opus",
    label: "Opus 192 kbps",
    modernLossyRank: 2
  },
  mp3: {
    bitrate: 320000,
    codec: "MP3",
    container: "MPEG",
    defaultQuality: "320",
    extension: "mp3",
    label: "MP3 320 kbps (legacy)",
    modernLossyRank: 1
  }
} as const satisfies Record<DownloadFormat, DownloadFormatProfile>;
const providerDownloadJobs = new Map<string, ProviderDownloadJobRecord>();
const providerBulkDownloadJobs = new Map<string, ProviderBulkDownloadJobRecord>();
const activeProviderBulkDownloadJobs = new Set<string>();
let idleCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let activeDownloadOperations = 0;

export async function searchProviderCandidates(
  request: ProviderSearchRequest
): Promise<ProviderSearchResult> {
  validateTrack(request.track);

  const limit = clampPositiveInteger(request.limit, 5, 1, 50);
  const providerOrder = normalizeSearchProviderOrder(request.providerIds);
  const providerResults: ProviderCandidateSearchOutcome[] = await Promise.all(
    providerOrder.map(async (providerId): Promise<ProviderCandidateSearchOutcome> => {
      try {
        const candidates =
          providerId === "youtube"
            ? await searchYoutubeCandidates(request.track, limit)
            : await searchJioSaavnCandidates(request.track, limit);

        return {
          candidates,
          ok: true,
          providerId
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Provider search failed.",
          ok: false,
          providerId
        };
      }
    })
  );
  const candidates: SourceCandidate[] = [];
  const errors: ProviderSearchResult["errors"] = [];

  for (const result of providerResults) {
    if (result.ok) {
      candidates.push(...result.candidates);
    } else {
      errors.push({
        error: result.error,
        providerId: result.providerId
      });
    }
  }

  candidates.sort((left, right) => {
    const providerDelta =
      providerOrder.indexOf(left.providerId as DownloadProviderId) -
      providerOrder.indexOf(right.providerId as DownloadProviderId);

    return providerDelta || compareSourceCandidatesByScore(left, right);
  });

  return {
    candidates: candidates.slice(0, limit * providerOrder.length),
    errors,
    providerOrder
  };
}

export async function previewProviderBulkDownloadCandidates({
  limit,
  onProgress,
  providerIds,
  tracks
}: {
  limit?: number;
  onProgress?: (progress: ProviderBulkCandidatePreviewProgress) => void;
  providerIds?: string[];
  tracks: BackupTrack[];
}) {
  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error("Send Spotify tracks before previewing provider candidates.");
  }

  if (tracks.length > maxBatchItems) {
    throw new Error(`Bulk previews are limited to ${maxBatchItems} tracks.`);
  }

  tracks.forEach(validateTrack);

  let completedCount = 0;
  let failedCount = 0;
  const items = await mapWithConcurrency(tracks, 3, async (track) => {
    const item = await previewProviderBulkDownloadCandidate({
      limit,
      providerIds,
      track
    });

    if (item.candidate?.url) {
      completedCount += 1;
    } else {
      failedCount += 1;
    }

    onProgress?.({
      completedCount,
      failedCount,
      item,
      totalCount: tracks.length
    });

    return item;
  });
  const downloadableCount = items.filter((item) => item.candidate?.url).length;

  return {
    downloadableCount,
    failedCount: items.length - downloadableCount,
    generatedAt: new Date().toISOString(),
    items,
    totalCount: items.length
  } satisfies ProviderBulkCandidatePreviewResult;
}

async function previewProviderBulkDownloadCandidate({
  limit,
  providerIds,
  track
}: {
  limit?: number;
  providerIds?: string[];
  track: BackupTrack;
}) {
  try {
    const search = await searchProviderCandidates({
      limit: clampPositiveInteger(limit, 4, 1, 12),
      providerIds,
      track
    });

    return {
      candidate: bestProviderCandidate(search.candidates),
      candidates: search.candidates,
      errors: search.errors,
      track
    } satisfies ProviderBulkCandidatePreviewItem;
  } catch (error) {
    return {
      candidates: [],
      errors: [
        {
          error: errorMessage(error),
          providerId: "youtube"
        }
      ],
      track
    } satisfies ProviderBulkCandidatePreviewItem;
  }
}

export function startProviderBulkDownloadJob(
  request: AuthorizedProviderBulkDownloadRequest
) {
  const job = buildProviderBulkDownloadJob(request);

  providerBulkDownloadJobs.set(job.id, job);
  persistProviderBulkDownloadJob(job);
  scheduleProviderBulkDownloadJob(job.id);

  return snapshotProviderBulkDownloadJob(job);
}

export function getProviderBulkDownloadJobSnapshot(jobId: string) {
  const job = getProviderBulkDownloadJob(jobId);

  return job ? snapshotProviderBulkDownloadJob(job) : null;
}

export function cancelProviderBulkDownloadJob(jobId: string) {
  const job = getProviderBulkDownloadJob(jobId);

  if (!job) {
    return null;
  }

  const now = new Date().toISOString();
  job.cancelRequestedAt = job.cancelRequestedAt ?? now;
  job.updatedAt = now;

  if (job.status === "queued") {
    job.status = "cancelled";
    job.completedAt = now;
    job.items = job.items.map((item) =>
      item.status === "completed"
        ? item
        : {
            ...item,
            completedAt: item.completedAt ?? now,
            status: "cancelled"
          }
    );
  } else if (job.status === "running") {
    job.status = "cancelling";
  }

  persistProviderBulkDownloadJob(job);

  return snapshotProviderBulkDownloadJob(job);
}

export function retryProviderBulkDownloadJob(jobId: string) {
  const job = getProviderBulkDownloadJob(jobId);

  if (!job) {
    return null;
  }

  if (activeProviderBulkDownloadJobs.has(job.id)) {
    return snapshotProviderBulkDownloadJob(job);
  }

  const now = new Date().toISOString();
  let retryCount = 0;

  job.items = job.items.map((item) => {
    if (item.status === "completed") {
      return item;
    }

    retryCount += 1;

    return {
      candidateScore: item.candidateScore,
      candidateTitle: item.candidateTitle,
      fallbackSources: item.fallbackSources,
      providerId: item.providerId,
      selectedReason: item.selectedReason,
      sourceUrl: item.sourceUrl,
      status: "pending",
      track: item.track
    } satisfies ProviderBulkDownloadJobItemSnapshot;
  });

  if (!retryCount) {
    return snapshotProviderBulkDownloadJob(job);
  }

  job.cancelRequestedAt = undefined;
  job.completedAt = undefined;
  job.status = "queued";
  job.updatedAt = now;
  persistProviderBulkDownloadJob(job);
  scheduleProviderBulkDownloadJob(job.id);

  return snapshotProviderBulkDownloadJob(job);
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

  const chunkSize = clampPositiveInteger(
    request.chunkSize,
    defaultProviderBulkChunkSize,
    1,
    20
  );
  const delayMs = clampPositiveInteger(
    request.delayMs,
    defaultProviderBulkDelayMs,
    1000,
    120000
  );
  const chunkPauseMs = clampPositiveInteger(
    request.chunkPauseMs,
    defaultProviderBulkChunkPauseMs,
    5000,
    600000
  );
  const results: AuthorizedProviderDownloadBatchResult["results"] = [];

  for (let index = 0; index < request.items.length; index += 1) {
    const item = request.items[index];

    try {
      const result = await downloadAuthorizedProviderTrack({
        bulkRiskAccepted: true,
        fallbackFormat: item.fallbackFormat ?? request.fallbackFormat,
        fallbackQuality: item.fallbackQuality ?? request.fallbackQuality,
        fallbackSources: item.fallbackSources,
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

export function startProviderDownloadJob(
  request: AuthorizedProviderDownloadRequest
) {
  pruneProviderDownloadJobs();

  const now = new Date().toISOString();
  const diagnosticId = request.diagnosticId ?? providerDownloadDiagnosticId();
  const job: ProviderDownloadJobRecord = {
    createdAt: now,
    diagnosticId,
    id: providerDownloadJobId(),
    request: {
      ...request,
      diagnosticId
    },
    requestSummary: summarizeProviderDownloadJobRequest(request),
    status: "queued",
    updatedAt: now
  };

  providerDownloadJobs.set(job.id, job);
  setTimeout(() => {
    void runProviderDownloadJob(job.id);
  }, 0);

  return snapshotProviderDownloadJob(job);
}

export function getProviderDownloadJobSnapshot(jobId: string) {
  pruneProviderDownloadJobs();

  const job = providerDownloadJobs.get(jobId);

  return job ? snapshotProviderDownloadJob(job) : null;
}

export async function downloadAuthorizedProviderTrack(
  request: AuthorizedProviderDownloadRequest
) {
  beginProviderDownloadActivity();

  try {
    return await downloadAuthorizedProviderTrackWithFallback(request);
  } finally {
    endProviderDownloadActivity();
  }
}

async function downloadAuthorizedProviderTrackWithFallback(
  request: AuthorizedProviderDownloadRequest
) {
  const diagnosticId = request.diagnosticId ?? providerDownloadDiagnosticId();
  const primaryFormat = normalizeDownloadFormat(request.format);
  const primaryQuality = normalizeDownloadQuality(request.quality, primaryFormat);
  const formatFallback = normalizeDownloadFallback({
    fallbackFormat: request.fallbackFormat,
    fallbackQuality: request.fallbackQuality,
    primaryFormat,
    primaryQuality
  });
  const attempts = providerDownloadAttemptSources({
    ...request,
    diagnosticId
  });
  const failures: string[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      return await downloadAuthorizedProviderTrackInner({
        ...request,
        diagnosticId,
        format: primaryFormat,
        providerId: attempt.providerId,
        quality: primaryQuality,
        selectedReason: attempt.selectedReason,
        sourceUrl: attempt.sourceUrl
      });
    } catch (error) {
      lastError = error;
      failures.push(
        providerAttemptFailureLabel(attempt, error, {
          format: primaryFormat,
          quality: primaryQuality
        })
      );

      let fallbackGateError = error;

      if (formatFallback && isFormatFallbackError(error)) {
        try {
          console.warn("[spotifybu.provider-download] retrying fallback format", {
            diagnosticId,
            fallbackFormat: formatFallback.format,
            fallbackQuality: formatFallback.quality,
            failedFormat: primaryFormat,
            failedQuality: primaryQuality,
            providerId: attempt.providerId,
            sourceHost: safeHostname(attempt.sourceUrl),
            sourceUrl: attempt.sourceUrl,
            trackName: request.track?.name,
            trackPosition: request.track?.position
          });

          return await downloadAuthorizedProviderTrackInner({
            ...request,
            diagnosticId,
            format: formatFallback.format,
            providerId: attempt.providerId,
            quality: formatFallback.quality,
            selectedReason: formatFallbackSelectedReason(
              attempt.selectedReason,
              primaryFormat,
              formatFallback
            ),
            sourceUrl: attempt.sourceUrl
          });
        } catch (fallbackError) {
          lastError = fallbackError;
          fallbackGateError = fallbackError;
          failures.push(
            providerAttemptFailureLabel(attempt, fallbackError, formatFallback)
          );
        }
      }

      const nextAttempt = attempts[index + 1];

      if (!nextAttempt || !isProviderFallbackError(fallbackGateError)) {
        break;
      }

      console.warn("[spotifybu.provider-download] retrying alternate source", {
        diagnosticId,
        failedProviderId: attempt.providerId,
        failedSourceHost: safeHostname(attempt.sourceUrl),
        failedSourceUrl: attempt.sourceUrl,
        nextProviderId: nextAttempt.providerId,
        nextSourceHost: safeHostname(nextAttempt.sourceUrl),
        nextSourceUrl: nextAttempt.sourceUrl,
        trackName: request.track?.name,
        trackPosition: request.track?.position
      });
      await sleep(providerFallbackDelayMs);
    }
  }

  if (failures.length > 1) {
    throw new Error(
      `Provider download failed after ${failures.length} sources. ${failures.join(
        " "
      )}`
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Provider download failed.");
}

type ProviderDownloadAttemptSource = {
  candidateScore?: number;
  candidateTitle?: string;
  providerId: DownloadProviderId;
  selectedReason?: string;
  sourceUrl: string;
};

type ProviderDownloadFormatProfile = {
  format: DownloadFormat;
  quality: DownloadQuality;
};

function providerDownloadAttemptSources(
  request: AuthorizedProviderDownloadRequest
) {
  const providerId = assertDownloadProvider(request.providerId);
  const source = resolveProviderSource(providerId, request.sourceUrl);
  const primaryAttempt = {
    providerId,
    selectedReason: request.selectedReason,
    sourceUrl: source.sourceUrl
  } satisfies ProviderDownloadAttemptSource;

  return [
    primaryAttempt,
    ...normalizeProviderFallbackSources(
      request.fallbackSources,
      providerId,
      source.sourceUrl
    )
  ];
}

function normalizeProviderFallbackSources(
  fallbackSources: AuthorizedProviderDownloadFallbackSource[] | undefined,
  primaryProviderId: DownloadProviderId,
  primarySourceUrl: string
) {
  if (!Array.isArray(fallbackSources) || !fallbackSources.length) {
    return [];
  }

  const seenSources = new Set([
    providerAttemptSourceKey(primaryProviderId, primarySourceUrl)
  ]);
  const normalizedSources: ProviderDownloadAttemptSource[] = [];

  for (const fallbackSource of fallbackSources) {
    try {
      const providerId = assertDownloadProvider(fallbackSource.providerId);
      const source = resolveProviderSource(providerId, fallbackSource.sourceUrl);
      const sourceKey = providerAttemptSourceKey(providerId, source.sourceUrl);

      if (seenSources.has(sourceKey)) {
        continue;
      }

      seenSources.add(sourceKey);
      normalizedSources.push({
        candidateScore: fallbackSource.candidateScore,
        candidateTitle: fallbackSource.candidateTitle,
        providerId,
        selectedReason:
          fallbackSource.selectedReason ??
          fallbackSelectedReason(fallbackSource),
        sourceUrl: source.sourceUrl
      });
    } catch {
      continue;
    }
  }

  return normalizedSources.slice(0, 5);
}

function providerAttemptSourceKey(
  providerId: DownloadProviderId,
  sourceUrl: string
) {
  return `${providerId}:${sourceUrl.trim().toLowerCase()}`;
}

function fallbackSelectedReason(
  fallbackSource: AuthorizedProviderDownloadFallbackSource
) {
  return fallbackSource.candidateTitle
    ? `SpotifyBU automatically retried fallback provider candidate ${fallbackSource.candidateTitle} (${fallbackSource.candidateScore ?? 0}% match)`
    : "SpotifyBU automatically retried a fallback provider candidate";
}

function providerAttemptFailureLabel(
  attempt: ProviderDownloadAttemptSource,
  error: unknown,
  profile?: ProviderDownloadFormatProfile
) {
  const profileLabel = profile ? ` ${profile.format}/${profile.quality}K` : "";

  return `${providerDisplayName(attempt.providerId)} ${safeHostname(
    attempt.sourceUrl
  )}${profileLabel}: ${errorMessage(error)}`;
}

function providerDisplayName(providerId: DownloadProviderId) {
  return (
    SOURCE_PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.name ??
    providerId
  );
}

function isProviderFallbackError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return [
    "http error 403",
    "403: forbidden",
    "http error 429",
    "too many requests",
    "rate limit",
    "unable to download video data",
    "did not expose a downloadable audio stream",
    "precondition check failed",
    "signature extraction failed",
    "n challenge",
    "requested format is not available",
    "this video is unavailable",
    "not available",
    "timed out"
  ].some((needle) => message.includes(needle));
}

function isFormatFallbackError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return [
    "audio conversion failed",
    "could not write header",
    "encoder",
    "ffmpeg",
    "invalid audio format",
    "libopus",
    "postprocessing",
    "requested audio format",
    "unsupported codec"
  ].some((needle) => message.includes(needle));
}

async function downloadAuthorizedProviderTrackInner(
  request: AuthorizedProviderDownloadRequest
) {
  const diagnosticId = request.diagnosticId ?? providerDownloadDiagnosticId();
  let stage = "validating request";
  let stagingDirectory: string | null = null;
  let attemptBase: Omit<
    ProviderDownloadAttemptLogEntry,
    "error" | "status" | "timestamp"
  > | null = null;

  try {
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

    const libraryPath = getMusicLibraryPath();

    if (!libraryPath) {
      throw new Error("Navidrome music path is not configured.");
    }

    const source = resolveProviderSource(providerId, request.sourceUrl);
    const format = normalizeDownloadFormat(request.format);
    const quality = normalizeDownloadQuality(request.quality, format);

    attemptBase = {
      diagnosticId,
      format,
      providerId,
      quality,
      sourceUrl: source.sourceUrl,
      trackId: request.track.id,
      trackName: request.track.name,
      trackPosition: request.track.position
    };
    await recordProviderDownloadAttempt({
      ...attemptBase,
      stage,
      status: "started",
      timestamp: new Date().toISOString()
    });
    console.info("[spotifybu.provider-download] attempt started", {
      diagnosticId,
      format,
      providerId,
      quality,
      sourceUrl: source.sourceUrl,
      trackName: request.track.name,
      trackPosition: request.track.position
    });

    stage = "preparing destination";
    await recordMusicLibraryAlbumFolders([request.track]);
    const destination = await prepareMusicLibraryTrackFileDestination(
      request.track,
      format
    );
    stagingDirectory = await createDownloadStagingDirectory(libraryPath);
    const outputTemplate = path.join(
      /* turbopackIgnore: true */ stagingDirectory,
      `${destination.fileBase}.%(ext)s`
    );
    const beforePaths = await matchingOutputPaths(
      stagingDirectory,
      destination.fileBase
    );

    stage = "running yt-dlp";
    const stdout = await runYtDlp({
      downloadUrl: source.downloadUrl,
      format,
      outputTemplate,
      quality
    });

    stage = "locating downloaded file";
    const stagedPath = await findDownloadedPath({
      beforePaths,
      format,
      outputTemplate,
      stdout,
      targetDirectory: stagingDirectory
    });

    stage = "tagging downloaded file";
    await tagDownloadedFile(stagedPath, request.track);

    stage = "moving file to library";
    const finalPath = await moveStagedDownloadToTarget({
      desiredTargetPath: destination.absolutePath,
      stagedPath
    });

    let libraryIndex: MusicLibraryIndexSummary | undefined;
    stage = "updating library index";
    try {
      libraryIndex = await upsertMusicLibraryIndexTrack(finalPath);
    } catch (error) {
      console.warn("[spotifybu.provider-download] could not update library index", {
        diagnosticId,
        error: errorMessage(error),
        finalPath
      });
    }

    stage = "cleaning staging files";
    await cleanupDirectory(stagingDirectory);
    scheduleIdleTempCleanup();

    stage = "recording provenance";
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

    await recordProviderDownloadAttempt({
      ...attemptBase,
      bytesWritten: fileStats.size,
      destinationPath: finalPath,
      relativePath,
      stage,
      status: "completed",
      timestamp: new Date().toISOString()
    });

    return {
      bytesWritten: fileStats.size,
      destinationPath: finalPath,
      diagnosticId,
      format,
      libraryIndex,
      providerId,
      quality,
      provenancePath,
      relativePath,
      sourceUrl: source.sourceUrl
    } satisfies AuthorizedProviderDownloadResult;
  } catch (error) {
    if (stagingDirectory) {
      await cleanupDirectory(stagingDirectory).catch(() => undefined);
    }

    if (attemptBase) {
      await recordProviderDownloadAttempt({
        ...attemptBase,
        error: errorMessage(error),
        stage,
        status: "failed",
        timestamp: new Date().toISOString()
      });
    }

    console.error("[spotifybu.provider-download] attempt failed", {
      diagnosticId,
      error: errorMessage(error),
      providerId: attemptBase?.providerId,
      sourceUrl: attemptBase?.sourceUrl,
      stage,
      trackName: attemptBase?.trackName,
      trackPosition: attemptBase?.trackPosition
    });
    throw error;
  }
}

async function runProviderDownloadJob(jobId: string) {
  const job = providerDownloadJobs.get(jobId);

  if (!job || job.status !== "queued") {
    return;
  }

  job.status = "running";
  job.updatedAt = new Date().toISOString();
  console.info("[spotifybu.provider-download] job running", {
    diagnosticId: job.diagnosticId,
    jobId,
    ...job.requestSummary
  });

  try {
    job.download = await downloadAuthorizedProviderTrack(job.request);
    job.status = "completed";
    job.updatedAt = new Date().toISOString();
    console.info("[spotifybu.provider-download] job completed", {
      bytesWritten: job.download.bytesWritten,
      destinationPath: job.download.relativePath ?? job.download.destinationPath,
      diagnosticId: job.diagnosticId,
      jobId,
      providerId: job.download.providerId,
      sourceUrl: job.download.sourceUrl
    });
  } catch (error) {
    job.error = errorMessage(error);
    job.status = "failed";
    job.updatedAt = new Date().toISOString();
    console.error("[spotifybu.provider-download] job failed", {
      diagnosticId: job.diagnosticId,
      error: job.error,
      jobId,
      ...job.requestSummary
    });
  }
}

function buildProviderBulkDownloadJob(
  request: AuthorizedProviderBulkDownloadRequest
): ProviderBulkDownloadJobRecord {
  if (!request.rightsConfirmed) {
    throw new Error("Confirm you are authorized to download these tracks first.");
  }

  if (!request.bulkRiskAccepted) {
    throw new Error("Accept the provider and bulk-download risk warning first.");
  }

  if (!Array.isArray(request.items) || !request.items.length) {
    throw new Error("Add previewed provider candidates before starting bulk backup.");
  }

  if (request.items.length > maxBatchItems) {
    throw new Error(`Bulk queues are limited to ${maxBatchItems} tracks.`);
  }

  const format = normalizeDownloadFormat(request.format);
  const quality = normalizeDownloadQuality(request.quality, format);
  const fallbackConfig = normalizeDownloadFallback({
    fallbackFormat: request.fallbackFormat,
    fallbackQuality: request.fallbackQuality,
    primaryFormat: format,
    primaryQuality: quality
  });
  const chunkSize = clampPositiveInteger(
    request.chunkSize,
    defaultProviderBulkChunkSize,
    1,
    20
  );
  const delayMs = clampPositiveInteger(
    request.delayMs,
    defaultProviderBulkDelayMs,
    1000,
    120000
  );
  const chunkPauseMs = clampPositiveInteger(
    request.chunkPauseMs,
    defaultProviderBulkChunkPauseMs,
    5000,
    600000
  );
  const now = new Date().toISOString();
  const diagnosticId = providerDownloadDiagnosticId();
  const items = request.items.map((item) => {
    validateTrack(item.track);
    const providerId = assertDownloadProvider(item.providerId);
    const source = resolveProviderSource(providerId, item.sourceUrl);

    return {
      candidateScore: item.candidateScore,
      candidateTitle: item.candidateTitle,
      fallbackSources: normalizeProviderFallbackSources(
        item.fallbackSources,
        providerId,
        source.sourceUrl
      ),
      providerId,
      selectedReason:
        item.selectedReason ??
        "SpotifyBU queued a previewed provider candidate for bulk backup",
      sourceUrl: source.sourceUrl,
      status: "pending",
      track: item.track
    } satisfies ProviderBulkDownloadJobItemSnapshot;
  });

  return {
    createdAt: now,
    diagnosticId,
    id: providerBulkDownloadJobId(),
    items,
    request: {
      chunkPauseMs,
      chunkSize,
      delayMs,
      fallbackFormat: fallbackConfig ? "mp3" : "none",
      ...(fallbackConfig ? { fallbackQuality: fallbackConfig.quality } : {}),
      format,
      quality
    },
    status: "queued",
    updatedAt: now
  } satisfies ProviderBulkDownloadJobRecord;
}

function scheduleProviderBulkDownloadJob(jobId: string) {
  setTimeout(() => {
    void runProviderBulkDownloadJob(jobId);
  }, 0);
}

async function runProviderBulkDownloadJob(jobId: string) {
  const job = getProviderBulkDownloadJob(jobId);

  if (!job || activeProviderBulkDownloadJobs.has(jobId)) {
    return;
  }

  if (job.status !== "queued" && job.status !== "failed") {
    return;
  }

  activeProviderBulkDownloadJobs.add(jobId);
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  persistProviderBulkDownloadJob(job);

  console.info("[spotifybu.provider-download] bulk job running", {
    diagnosticId: job.diagnosticId,
    jobId,
    totalCount: job.items.length
  });

  try {
    for (let index = 0; index < job.items.length; index += 1) {
      const item = job.items[index];

      if (job.cancelRequestedAt) {
        markRemainingBulkItemsCancelled(job);
        break;
      }

      if (item.status === "completed") {
        continue;
      }

      item.status = "downloading";
      item.startedAt = new Date().toISOString();
      item.error = undefined;
      item.download = undefined;
      job.updatedAt = item.startedAt;
      persistProviderBulkDownloadJob(job);

      try {
        item.download = await downloadAuthorizedProviderTrack({
          bulkRiskAccepted: true,
          diagnosticId: `${job.diagnosticId}-${item.track.position}`,
          fallbackFormat: job.request.fallbackFormat,
          fallbackQuality: job.request.fallbackQuality,
          fallbackSources: item.fallbackSources,
          format: job.request.format,
          providerId: item.providerId,
          quality: job.request.quality,
          rightsConfirmed: true,
          selectedReason: item.selectedReason,
          sourceUrl: item.sourceUrl,
          track: item.track
        });
        item.providerId = item.download.providerId;
        item.sourceUrl = item.download.sourceUrl;
        item.status = "completed";
        item.completedAt = new Date().toISOString();
      } catch (error) {
        item.error = errorMessage(error);
        item.status = "failed";
        item.completedAt = new Date().toISOString();
      }

      job.updatedAt = item.completedAt;
      persistProviderBulkDownloadJob(job);

      if (job.cancelRequestedAt) {
        markRemainingBulkItemsCancelled(job);
        break;
      }

      const isLastRunnableItem = !job.items
        .slice(index + 1)
        .some((nextItem) => nextItem.status !== "completed");

      if (!isLastRunnableItem) {
        const isChunkBoundary = (index + 1) % job.request.chunkSize === 0;
        await sleep(isChunkBoundary ? job.request.chunkPauseMs : job.request.delayMs);
      }
    }

    finalizeProviderBulkDownloadJob(job);
    persistProviderBulkDownloadJob(job);
  } finally {
    activeProviderBulkDownloadJobs.delete(jobId);
  }
}

function markRemainingBulkItemsCancelled(job: ProviderBulkDownloadJobRecord) {
  const now = new Date().toISOString();

  job.items = job.items.map((item) =>
    item.status === "completed" || item.status === "failed"
      ? item
      : {
          ...item,
          completedAt: item.completedAt ?? now,
          status: "cancelled"
        }
  );
  job.status = "cancelled";
  job.completedAt = now;
  job.updatedAt = now;
}

function finalizeProviderBulkDownloadJob(job: ProviderBulkDownloadJobRecord) {
  const counts = providerBulkDownloadJobCounts(job);
  const now = new Date().toISOString();

  if (job.cancelRequestedAt || counts.cancelledCount) {
    job.status = "cancelled";
  } else if (counts.failedCount) {
    job.status = "failed";
  } else if (counts.completedCount === job.items.length) {
    job.status = "completed";
  } else {
    job.status = "failed";
  }

  job.completedAt = now;
  job.updatedAt = now;
}

function snapshotProviderDownloadJob(
  job: ProviderDownloadJobRecord
): ProviderDownloadJobSnapshot {
  return {
    createdAt: job.createdAt,
    diagnosticId: job.diagnosticId,
    download: job.download,
    error: job.error,
    id: job.id,
    request: job.requestSummary,
    status: job.status,
    updatedAt: job.updatedAt
  };
}

function snapshotProviderBulkDownloadJob(
  job: ProviderBulkDownloadJobRecord
): ProviderBulkDownloadJobSnapshot {
  const counts = providerBulkDownloadJobCounts(job);

  return {
    cancelRequestedAt: job.cancelRequestedAt,
    completedAt: job.completedAt,
    completedCount: counts.completedCount,
    createdAt: job.createdAt,
    diagnosticId: job.diagnosticId,
    failedCount: counts.failedCount,
    id: job.id,
    items: job.items,
    pendingCount: counts.pendingCount,
    request: job.request,
    runningCount: counts.runningCount,
    status: job.status,
    totalCount: job.items.length,
    updatedAt: job.updatedAt
  };
}

function providerBulkDownloadJobCounts(job: ProviderBulkDownloadJobRecord) {
  const completedCount = job.items.filter(
    (item) => item.status === "completed"
  ).length;
  const failedCount = job.items.filter((item) => item.status === "failed").length;
  const runningCount = job.items.filter(
    (item) => item.status === "downloading"
  ).length;
  const cancelledCount = job.items.filter(
    (item) => item.status === "cancelled"
  ).length;
  const pendingCount = job.items.length - completedCount - failedCount - runningCount - cancelledCount;

  return {
    cancelledCount,
    completedCount,
    failedCount,
    pendingCount,
    runningCount
  };
}

function getProviderBulkDownloadJob(jobId: string) {
  const memoryJob = providerBulkDownloadJobs.get(jobId);

  if (memoryJob) {
    return memoryJob;
  }

  const row = getSpotifyBuDatabase()
    .prepare(
      `
        SELECT snapshot_json
        FROM provider_bulk_jobs
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(jobId) as ProviderBulkDownloadJobRow | undefined;

  if (!row?.snapshot_json) {
    return null;
  }

  try {
    const job = JSON.parse(row.snapshot_json) as ProviderBulkDownloadJobRecord;
    let shouldResume = false;

    if (!job.id || !Array.isArray(job.items)) {
      return null;
    }

    if (job.status === "running" || job.status === "cancelling") {
      job.status = job.cancelRequestedAt ? "cancelled" : "queued";
      job.items = job.items.map((item) =>
        item.status === "downloading"
          ? {
              ...item,
              status: job.cancelRequestedAt ? "cancelled" : "pending"
            }
          : item
      );
      job.updatedAt = new Date().toISOString();
      persistProviderBulkDownloadJob(job);
      shouldResume = job.status === "queued";
    }

    providerBulkDownloadJobs.set(job.id, job);

    if (shouldResume) {
      scheduleProviderBulkDownloadJob(job.id);
    }

    return job;
  } catch {
    return null;
  }
}

function persistProviderBulkDownloadJob(job: ProviderBulkDownloadJobRecord) {
  providerBulkDownloadJobs.set(job.id, job);
  getSpotifyBuDatabase()
    .prepare(
      `
        INSERT INTO provider_bulk_jobs (
          id,
          status,
          diagnostic_id,
          created_at,
          updated_at,
          snapshot_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status,
          diagnostic_id = excluded.diagnostic_id,
          updated_at = excluded.updated_at,
          snapshot_json = excluded.snapshot_json
      `
    )
    .run(
      job.id,
      job.status,
      job.diagnosticId,
      job.createdAt,
      job.updatedAt,
      JSON.stringify(job)
    );
}

function bestProviderCandidate(candidates: SourceCandidate[]) {
  return candidates
    .filter((candidate) => candidate.url)
    .sort((left, right) => {
      const scoreDelta = compareSourceCandidatesByScore(left, right);

      if (scoreDelta) {
        return scoreDelta;
      }

      return (
        defaultProviderSearchOrder.indexOf(left.providerId as DownloadProviderId) -
        defaultProviderSearchOrder.indexOf(right.providerId as DownloadProviderId)
      );
    })[0];
}

function compareSourceCandidatesByScore(
  left: SourceCandidate,
  right: SourceCandidate
) {
  return (
    right.score.overall - left.score.overall ||
    (left.providerId === right.providerId
      ? sourceCandidateUploadedAtTime(right) -
        sourceCandidateUploadedAtTime(left)
      : 0)
  );
}

function sourceCandidateUploadedAtTime(candidate: SourceCandidate) {
  const timestamp = Date.parse(candidate.uploadedAt ?? "");

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function summarizeProviderDownloadJobRequest(
  request: AuthorizedProviderDownloadRequest
): ProviderDownloadJobSnapshot["request"] {
  const sourceUrl = String(request.sourceUrl ?? "");
  const track = request.track as Partial<BackupTrack> | undefined;
  const trackPosition =
    typeof track?.position === "number" ? track.position : undefined;

  return {
    providerId: String(request.providerId ?? ""),
    sourceHost: safeHostname(sourceUrl),
    sourceUrl,
    trackName: typeof track?.name === "string" ? track.name : "",
    ...(trackPosition === undefined ? {} : { trackPosition })
  };
}

function pruneProviderDownloadJobs() {
  const now = Date.now();

  for (const [jobId, job] of providerDownloadJobs) {
    const updatedAt = Date.parse(job.updatedAt);
    const isFinished = job.status === "completed" || job.status === "failed";

    if (
      isFinished &&
      Number.isFinite(updatedAt) &&
      now - updatedAt > providerDownloadJobTtlMs
    ) {
      providerDownloadJobs.delete(jobId);
    }
  }

  if (providerDownloadJobs.size <= maxProviderDownloadJobs) {
    return;
  }

  const removableJobs = [...providerDownloadJobs.values()]
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  for (const job of removableJobs) {
    if (providerDownloadJobs.size <= maxProviderDownloadJobs) {
      break;
    }

    providerDownloadJobs.delete(job.id);
  }
}

function normalizeDownloadFormat(value?: string): DownloadFormat {
  const normalizedFormat = value?.trim().toLowerCase();

  return normalizedFormat === "mp3" ? "mp3" : defaultProviderDownloadFormat;
}

function normalizeDownloadQuality(
  value?: string,
  format: DownloadFormat = defaultProviderDownloadFormat
): DownloadQuality {
  const normalizedQuality = value?.trim();

  if (
    normalizedQuality === "128" ||
    normalizedQuality === "160" ||
    normalizedQuality === "192" ||
    normalizedQuality === "256" ||
    normalizedQuality === "320"
  ) {
    return normalizedQuality;
  }

  return providerDownloadFormatProfiles[format].defaultQuality;
}

function normalizeDownloadFallback({
  fallbackFormat,
  fallbackQuality,
  primaryFormat,
  primaryQuality
}: {
  fallbackFormat?: string;
  fallbackQuality?: string;
  primaryFormat: DownloadFormat;
  primaryQuality: DownloadQuality;
}): ProviderDownloadFormatProfile | null {
  if (primaryFormat !== "opus") {
    return null;
  }

  const normalizedFallbackFormat = fallbackFormat?.trim().toLowerCase();

  if (normalizedFallbackFormat === "none") {
    return null;
  }

  return {
    format: "mp3",
    quality: normalizeMp3FallbackQuality(fallbackQuality, primaryQuality)
  };
}

function normalizeMp3FallbackQuality(
  value: string | undefined,
  _primaryQuality: DownloadQuality
): DownloadQuality {
  const normalizedQuality = value?.trim();

  return normalizedQuality === "192" ||
    normalizedQuality === "256" ||
    normalizedQuality === "320"
    ? normalizedQuality
    : "320";
}

function formatFallbackSelectedReason(
  selectedReason: string | undefined,
  primaryFormat: DownloadFormat,
  fallback: ProviderDownloadFormatProfile
) {
  const fallbackReason = `SpotifyBU used ${fallback.format.toUpperCase()} ${
    fallback.quality
  } kbps fallback after ${primaryFormat.toUpperCase()} could not be written.`;

  return selectedReason ? `${selectedReason}. ${fallbackReason}` : fallbackReason;
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
  const perQueryLimit = Math.min(
    Math.max(limit, minYoutubeSearchResultsPerQuery),
    maxYoutubeSearchResultsPerQuery
  );
  const candidatesById = new Map<string, SourceCandidate>();

  for (const searchQuery of youtubeProviderSearchQueries(track)) {
    const searchResult = await runYtDlpSearch(
      `ytsearch${perQueryLimit}:${searchQuery}`
    );
    const entries = Array.isArray(searchResult.entries)
      ? searchResult.entries
      : [];

    entries
      .map((entry, index) => youtubeCandidateFromEntry(track, entry, index))
      .filter((candidate): candidate is SourceCandidate => Boolean(candidate))
      .forEach((candidate) => {
        rememberBestYoutubeCandidate(candidatesById, candidate);
      });

    if (
      candidatesById.size >= limit &&
      bestCandidateScore(candidatesById.values()) >=
        confidentYoutubeCandidateScore
    ) {
      break;
    }
  }

  return [...candidatesById.values()].sort(
    compareSourceCandidatesByScore
  );
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
  let stdout: Buffer | string;

  try {
    ({ stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--dump-single-json",
        "--flat-playlist",
        "--skip-download",
        "--no-warnings",
        "--quiet",
        ...ytDlpJsRuntimeArgs(),
        "--socket-timeout",
        "8",
        searchUrl
      ],
      {
        maxBuffer: 1024 * 1024 * 4,
        timeout:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? timeoutMs
            : defaultProviderSearchTimeoutMs
      }
    ));
  } catch (error) {
    throw new Error(formatYtDlpError(error, "YouTube search failed."));
  }

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

  const title = stripHtmlEntities(String(entry.title));
  const artists = [entry.channel, entry.uploader]
    .filter((value): value is string => Boolean(value))
    .map((value) => stripHtmlEntities(value));
  const durationMs =
    typeof entry.duration === "number"
      ? Math.round(entry.duration * 1000)
      : undefined;
  const uploadedAt = youtubeEntryUploadedAt(entry);
  const score = scoreProviderCandidate(track, {
    artists,
    durationMs,
    title,
    uploadedAt
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
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    ...(uploadedAt ? { uploadedAt } : {}),
    verified: false
  } satisfies SourceCandidate;
}

function youtubeEntryUploadedAt(entry: YtDlpSearchEntry) {
  const uploadDate = normalizedYtDlpDate(entry.upload_date);

  if (uploadDate) {
    return uploadDate;
  }

  const timestamp = entry.timestamp ?? entry.release_timestamp;

  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function normalizedYtDlpDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (compactDate) {
    return validYtDlpDate(
      Number(compactDate[1]),
      Number(compactDate[2]),
      Number(compactDate[3])
    );
  }

  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (calendarDate) {
    return validYtDlpDate(
      Number(calendarDate[1]),
      Number(calendarDate[2]),
      Number(calendarDate[3])
    );
  }

  return undefined;
}

function validYtDlpDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
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
  const album = stripHtmlEntities(entry.more_info?.album ?? "");
  const score = scoreProviderCandidate(track, {
    album,
    artists,
    durationMs,
    title
  });

  return {
    album,
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

function splitProviderArtists(value: string) {
  return value
    .split(/,|&|;|\band\b/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function rememberBestYoutubeCandidate(
  candidatesById: Map<string, SourceCandidate>,
  candidate: SourceCandidate
) {
  const existingCandidate = candidatesById.get(candidate.id);

  if (
    !existingCandidate ||
    compareSourceCandidatesByScore(candidate, existingCandidate) < 0
  ) {
    candidatesById.set(candidate.id, candidate);
  }
}

function bestCandidateScore(candidates: Iterable<SourceCandidate>) {
  let bestScore = 0;

  for (const candidate of candidates) {
    bestScore = Math.max(bestScore, candidate.score.overall);
  }

  return bestScore;
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
  const stagingRoot = await ensureMusicLibraryTargetDirectory(stagingRootSegments);
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
  desiredTargetPath,
  stagedPath
}: {
  desiredTargetPath: string;
  stagedPath: string;
}) {
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
  idleCleanupTimer.unref?.();
}

async function cleanupStaleProviderTempFiles() {
  if (activeDownloadOperations > 0) {
    scheduleIdleTempCleanup();
    return;
  }

  const libraryPath = getMusicLibraryPath();

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
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

function validateTrack(track: BackupTrack) {
  if (!track || typeof track.name !== "string" || !track.name.trim()) {
    throw new Error("Send a Spotify track before downloading.");
  }

  if (!Array.isArray(track.artists)) {
    throw new Error("Send Spotify track artists before downloading.");
  }

  if (isUnresolvedSpotifyLocalBackupTrack(track)) {
    throw new Error(track.metadataWarning ?? unresolvedSpotifyLocalTrackMessage);
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
  let stdout: Buffer | string;

  try {
    ({ stdout } = await execFileAsync(
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
        ...ytDlpJsRuntimeArgs(),
        "--sleep-requests",
        "2",
        "--sleep-interval",
        "5",
        "--max-sleep-interval",
        "10",
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
    ));
  } catch (error) {
    throw new Error(
      formatYtDlpError(error, "Provider download failed.", downloadUrl)
    );
  }

  return stdout.toString();
}

function ytDlpJsRuntimeArgs() {
  const configuredRuntime = process.env.SPOTIFYBU_YTDLP_JS_RUNTIME?.trim();
  const runtime =
    configuredRuntime === "none"
      ? ""
      : configuredRuntime || defaultYtDlpJsRuntime;

  return runtime ? ["--js-runtimes", runtime] : [];
}

function formatYtDlpError(
  error: unknown,
  fallbackMessage: string,
  sourceUrl?: string
) {
  const execError = error as ExecFileError;
  const output = [
    bufferishToString(execError.stderr),
    bufferishToString(execError.stdout),
    error instanceof Error ? error.message : ""
  ]
    .filter(Boolean)
    .join("\n");
  const normalizedOutput = output.toLowerCase();
  const sourceHost = sourceUrl ? safeHostname(sourceUrl) : "";
  const diagnosticLines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isYtDlpDiagnosticLine);
  const lastErrorLine = [...diagnosticLines]
    .reverse()
    .find((line) => /^error:/i.test(line) || /^warning:/i.test(line));
  const lastDiagnosticLine = lastErrorLine ?? diagnosticLines.at(-1);
  const exitCode =
    execError.code && execError.code !== "ETIMEDOUT"
      ? `yt-dlp exit code: ${execError.code}.`
      : "";
  const youtubeExtractorFailed =
    sourceHost.includes("youtube") ||
    sourceHost.includes("youtu.be") ||
    normalizedOutput.includes("[youtube]");

  if (
    youtubeExtractorFailed &&
    (normalizedOutput.includes("precondition check failed") ||
      normalizedOutput.includes("signature extraction failed") ||
      normalizedOutput.includes("n challenge") ||
      normalizedOutput.includes("only images are available") ||
      normalizedOutput.includes("requested format is not available"))
  ) {
    return [
      "YouTube did not expose a downloadable audio stream for that result.",
      "Pull or rebuild the latest SpotifyBU image so yt-dlp, yt-dlp-ejs, and the Node challenge runtime are current.",
      "If this specific video still fails, choose a JioSaavn candidate or another YouTube result.",
      lastDiagnosticLine
        ? `yt-dlp reported: ${formatYtDlpDiagnosticLine(lastDiagnosticLine)}`
        : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (execError.code === "ETIMEDOUT") {
    return fallbackMessage.toLowerCase().includes("search")
      ? "The provider search timed out. Try again, or use another provider result if one is available."
      : "The provider download timed out. Try the candidate again or choose another source.";
  }

  return [
    fallbackMessage,
    exitCode,
    lastDiagnosticLine
      ? `yt-dlp output: ${formatYtDlpDiagnosticLine(lastDiagnosticLine)}`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function isYtDlpDiagnosticLine(line: string) {
  return (
    Boolean(line) &&
    !/^\[download\]\s+\d+(?:\.\d+)?%/i.test(line) &&
    !/^\[download\]\s+(destination|has already been downloaded)/i.test(line)
  );
}

function formatYtDlpDiagnosticLine(line: string) {
  const stripped = stripYtDlpPrefix(line).replace(/\s+/g, " ").trim();

  return stripped.length > 360 ? `${stripped.slice(0, 357)}...` : stripped;
}

function bufferishToString(value: Buffer | string | undefined) {
  return typeof value === "string" ? value : value?.toString() ?? "";
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stripYtDlpPrefix(value: string) {
  return value.replace(/^(error|warning):\s*/i, "");
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

async function recordProviderDownload(entry: ProviderDownloadLogEntry) {
  const log = await readProviderDownloadLog();
  const now = new Date().toISOString();

  log.downloads.push(entry);
  log.updatedAt = now;

  const logDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);
  const logPath = path.join(
    /* turbopackIgnore: true */ logDirectory,
    "provider-downloads.json"
  );

  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  return logPath;
}

export async function purgeProviderDownloadLogsForRelativePath(relativePath: string) {
  const normalizedRelativePath = normalizeRelativePathKey(relativePath);

  if (!normalizedRelativePath) {
    return {
      attemptsRemoved: 0,
      downloadsRemoved: 0
    };
  }

  const [downloadsRemoved, attemptsRemoved] = await Promise.all([
    purgeProviderDownloadLog(normalizedRelativePath),
    purgeProviderDownloadAttemptLog(normalizedRelativePath)
  ]);

  return {
    attemptsRemoved,
    downloadsRemoved
  };
}

async function purgeProviderDownloadLog(normalizedRelativePath: string) {
  const log = await readProviderDownloadLog();
  const downloads = log.downloads.filter(
    (entry) => normalizeRelativePathKey(entry.relativePath) !== normalizedRelativePath
  );
  const removedCount = log.downloads.length - downloads.length;

  if (!removedCount) {
    return 0;
  }

  await writeProviderDownloadLog({
    ...log,
    downloads,
    updatedAt: new Date().toISOString()
  });

  return removedCount;
}

async function purgeProviderDownloadAttemptLog(normalizedRelativePath: string) {
  const log = await readProviderDownloadAttemptLog();
  const attempts = log.attempts.filter(
    (entry) => normalizeRelativePathKey(entry.relativePath) !== normalizedRelativePath
  );
  const removedCount = log.attempts.length - attempts.length;

  if (!removedCount) {
    return 0;
  }

  await writeProviderDownloadAttemptLog({
    ...log,
    attempts,
    updatedAt: new Date().toISOString()
  });

  return removedCount;
}

async function writeProviderDownloadLog(log: ProviderDownloadLog) {
  const logDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);
  const logPath = path.join(
    /* turbopackIgnore: true */ logDirectory,
    "provider-downloads.json"
  );

  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

async function writeProviderDownloadAttemptLog(log: ProviderDownloadAttemptLog) {
  const logDirectory = await ensureMusicLibraryTargetDirectory([".spotifybu"]);
  const logPath = path.join(
    /* turbopackIgnore: true */ logDirectory,
    "provider-download-attempts.json"
  );

  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

async function recordProviderDownloadAttempt(
  entry: ProviderDownloadAttemptLogEntry
) {
  try {
    const log = await readProviderDownloadAttemptLog();
    const now = new Date().toISOString();

    log.attempts.push(entry);
    log.attempts = log.attempts.slice(-maxAttemptLogEntries);
    log.updatedAt = now;

    await writeProviderDownloadAttemptLog(log);
  } catch (error) {
    console.warn("[spotifybu.provider-download] could not write attempt log", {
      diagnosticId: entry.diagnosticId,
      error: errorMessage(error)
    });
  }
}

async function readProviderDownloadLog(): Promise<ProviderDownloadLog> {
  const libraryPath = getMusicLibraryPath();

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

async function readProviderDownloadAttemptLog(): Promise<ProviderDownloadAttemptLog> {
  const libraryPath = getMusicLibraryPath();

  if (!libraryPath) {
    return emptyProviderDownloadAttemptLog();
  }

  try {
    const contents = await readFile(
      path.join(
        /* turbopackIgnore: true */ libraryPath,
        ...attemptLogSegments
      ),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Partial<ProviderDownloadAttemptLog>;

    if (parsed.version !== 1 || !Array.isArray(parsed.attempts)) {
      return emptyProviderDownloadAttemptLog();
    }

    return parsed as ProviderDownloadAttemptLog;
  } catch {
    return emptyProviderDownloadAttemptLog();
  }
}

function emptyProviderDownloadAttemptLog(): ProviderDownloadAttemptLog {
  return {
    attempts: [],
    updatedAt: new Date(0).toISOString(),
    version: 1
  };
}

function normalizeRelativePathKey(relativePath: string | undefined) {
  return (relativePath ?? "").split(path.sep).join("/").toLowerCase();
}

function providerDownloadDiagnosticId() {
  return `pd-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function providerDownloadJobId() {
  return `pdj-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function providerBulkDownloadJobId() {
  return `pdbj-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
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
