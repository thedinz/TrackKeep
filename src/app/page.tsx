"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileJson,
  FileText,
  HardDrive,
  Link2,
  ListMusic,
  Loader2,
  LogIn,
  LogOut,
  Music2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOURCE_PROVIDER_CATALOG,
  type ProviderRiskLevel,
  type ProviderStatus,
  type SourceProviderCatalogEntry
} from "@/lib/providers/types";

type UserProfile = {
  displayName: string;
  email?: string;
  id: string;
  imageUrl?: string;
};

type SessionResponse = {
  authenticated: boolean;
  spotifyClientConfigured: boolean;
  user?: UserProfile;
};

type AppInfo = {
  branch: string;
  version: string;
};

type AppAuthStatus = {
  authenticated: boolean;
  authMode: "external" | "internal";
};

type SpotifyAuthConfigResponse = {
  appBaseUrl: string;
  redirectUri: string;
  redirectUriWarning?: string | null;
  spotifyClientConfigured: boolean;
};

type NavidromeLibraryStatus = {
  configured: boolean;
  exists: boolean;
  libraryPath?: string;
  message: string;
  navidromeUrl?: string;
  readable: boolean;
  server: NavidromeServerStatus;
  state:
    | "not_configured"
    | "missing"
    | "not_directory"
    | "not_readable"
    | "not_writable"
    | "ready"
    | "error";
  writable: boolean;
};

type NavidromeServerStatus = {
  configured: boolean;
  message: string;
  navidromeUrl: string;
  requested?: boolean;
  scanCount?: number;
  scanning?: boolean;
  state:
    | "not_configured"
    | "ready"
    | "scan_requested"
    | "auth_failed"
    | "error";
};

type NavidromeIndexSkip = {
  kind: "directory" | "file";
  reason: string;
  relativePath: string;
};

type SourceKind = "album" | "playlist" | "track" | "track-list";

type ResolvedSource = {
  externalUrl?: string;
  id?: string;
  imageUrl?: string;
  name: string;
  subtitle: string;
  tracksTotal: number;
  type: SourceKind;
};

type FolderPlan = {
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

type FolderPlanDisplayStatus =
  | "download"
  | "folder-ready"
  | "organize"
  | "partial"
  | "ready"
  | "scan";

type FolderPlanSummary = FolderPlan & {
  backedUpCount: number;
  countLabel: string;
  missingCount: number;
  organizeCount: number;
  organizeTrackPositions: number[];
  status: FolderPlanDisplayStatus;
  statusLabel: string;
};

type IndexedTrack = {
  album?: string;
  albumArtist?: string;
  artist?: string;
  artists: string[];
  durationMs?: number;
  fileName: string;
  isrc?: string;
  relativeDirectory: string;
  relativePath: string;
  title: string;
};

type LibraryMatch = {
  exists: boolean;
  expectedFolder: string;
  matchedBy?: "duration" | "isrc" | "metadata";
  matchedTrack?: IndexedTrack;
  needsMove: boolean;
  recommendedRelativePath?: string;
  trackId?: string;
  trackPosition: number;
};

type NavidromeLibraryIndexSummary = {
  generatedAt?: string;
  libraryPath?: string;
  namingSchemeChanged?: boolean;
  navidromeScan?: NavidromeServerStatus;
  skippedCount?: number;
  skippedExamples?: NavidromeIndexSkip[];
  stale: boolean;
  trackCount: number;
};

type NavidromeLibraryIndexScanStatus = {
  completedAt?: string;
  error?: string;
  id?: string;
  index?: NavidromeLibraryIndexSummary;
  startedAt?: string;
  state: "failed" | "idle" | "running" | "succeeded";
};

type PlaylistSummary = {
  collaborative: boolean;
  description: string;
  externalUrl?: string;
  id: string;
  imageUrl?: string;
  name: string;
  owner: string;
  ownerId?: string;
  public: boolean | null;
  tracksTotal: number;
};

type PlaylistBackupStatus = {
  backedUp: boolean;
  missingTrackCount: number;
  trackCount: number;
};

type PlaylistMetadataBackup = {
  exportedAt: string;
  id: string;
  playlistId: string;
  playlistName: string;
  source: string;
  trackCount: number;
  updatedAt: string;
};

type BackupTrack = {
  addedAt?: string;
  album: string;
  albumArtist: string;
  albumArtistIds?: string[];
  albumId?: string;
  albumImageUrl?: string;
  albumReleaseDate?: string;
  albumTracksTotal?: number;
  albumType?: string;
  artists: string[];
  artistIds?: string[];
  discNumber?: number;
  durationMs: number;
  explicit: boolean;
  id?: string;
  isrc?: string;
  name: string;
  position: number;
  spotifyUri?: string;
  spotifyUrl?: string;
  trackNumber?: number;
};

type PlaylistResponse = {
  backupStatuses?: Record<string, PlaylistBackupStatus>;
  metadataBackups?: Record<string, PlaylistMetadataBackup>;
  playlists: PlaylistSummary[];
};

type TracksResponse = {
  folderPlans: FolderPlan[];
  libraryMatches: LibraryMatch[];
  metadataBackup?: PlaylistMetadataBackup | null;
  playlist: PlaylistSummary;
  tracks: BackupTrack[];
};

type ResolveResponse = {
  folderPlans: FolderPlan[];
  libraryMatches: LibraryMatch[];
  source: ResolvedSource;
  tracks: BackupTrack[];
  type: "album" | "track" | "track-list";
};

type LibraryIndexResponse = {
  index: NavidromeLibraryIndexSummary;
  scan?: NavidromeLibraryIndexScanStatus;
};

type LibraryMatchesResponse = {
  libraryMatches: LibraryMatch[];
};

type LibraryOrganizeResponse = LibraryIndexResponse & LibraryMatchesResponse & {
  attemptedCount: number;
  movedCount: number;
  remainingMoveCount: number;
  skippedCount: number;
};

type NavidromePlaylistSyncResponse = {
  navidromePlaylist: {
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
};

type NavidromePlaylistSyncMode = "append" | "fullsync" | "replace";

type ProviderDownloadPayload = {
  bytesWritten?: number;
  diagnosticId?: string;
  destinationPath: string;
  format: string;
  libraryIndex?: NavidromeLibraryIndexSummary;
  providerId: string;
  quality: string;
  provenancePath?: string;
  relativePath?: string;
  sourceUrl: string;
};

type ProviderDownloadFallbackSource = {
  candidateScore?: number;
  candidateTitle?: string;
  providerId: string;
  selectedReason?: string;
  sourceUrl: string;
};

type ProviderDownloadJobStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running";

type ProviderBulkDownloadJobStatus =
  | "cancelled"
  | "cancelling"
  | "completed"
  | "failed"
  | "queued"
  | "running";

type ProviderBulkDownloadItemStatus =
  | "cancelled"
  | "completed"
  | "downloading"
  | "failed"
  | "pending";

type ProviderDownloadJob = {
  createdAt: string;
  diagnosticId: string;
  download?: ProviderDownloadPayload;
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

type ProviderDownloadResponse = {
  diagnosticId?: string;
  download?: ProviderDownloadPayload;
  job?: ProviderDownloadJob;
};

type ProviderSearchCandidate = {
  album?: string;
  artists: string[];
  durationMs?: number;
  id: string;
  providerId: string;
  score: {
    albumScore?: number;
    artistScore: number;
    durationDeltaMs?: number;
    isrcMatch?: boolean;
    overall: number;
    titleScore: number;
  };
  title: string;
  url?: string;
  verified: boolean;
};

type ProviderSearchResponse = {
  diagnosticId?: string;
  search: {
    candidates: ProviderSearchCandidate[];
    errors: Array<{
      error: string;
      providerId: string;
    }>;
    providerOrder: string[];
  };
};

type ProviderBulkCandidatePreviewItem = {
  candidate?: ProviderSearchCandidate;
  candidates: ProviderSearchCandidate[];
  errors: Array<{
    error: string;
    providerId: string;
  }>;
  track: BackupTrack;
};

type ProviderBulkCandidatePreview = {
  downloadableCount: number;
  failedCount: number;
  generatedAt: string;
  items: ProviderBulkCandidatePreviewItem[];
  totalCount: number;
};

type ProviderBulkDownloadJobItem = {
  candidateScore?: number;
  candidateTitle?: string;
  completedAt?: string;
  download?: ProviderDownloadPayload;
  error?: string;
  fallbackSources?: ProviderDownloadFallbackSource[];
  providerId: string;
  selectedReason?: string;
  sourceUrl: string;
  startedAt?: string;
  status: ProviderBulkDownloadItemStatus;
  track: BackupTrack;
};

type ProviderBulkDownloadJob = {
  cancelRequestedAt?: string;
  completedAt?: string;
  completedCount: number;
  createdAt: string;
  diagnosticId: string;
  failedCount: number;
  id: string;
  items: ProviderBulkDownloadJobItem[];
  pendingCount: number;
  request: {
    chunkPauseMs: number;
    chunkSize: number;
    delayMs: number;
    format: string;
    quality: string;
  };
  runningCount: number;
  status: ProviderBulkDownloadJobStatus;
  totalCount: number;
  updatedAt: string;
};

type ProviderBulkPreviewProgressEvent = {
  completedCount: number;
  failedCount: number;
  totalCount: number;
  trackLabel?: string;
  type: "progress";
};

type ProviderBulkPreviewStreamEvent =
  | ProviderBulkPreviewProgressEvent
  | {
      preview: ProviderBulkCandidatePreview;
      type: "complete";
    }
  | {
      error: string;
      type: "error";
    };

type ProviderBulkDownloadResponse = {
  diagnosticId?: string;
  job?: ProviderBulkDownloadJob;
};

type BulkDownloadProgress = {
  completedCount: number;
  failedCount: number;
  phase: string;
  totalCount: number;
  trackLabel?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const libraryOrganizeBatchSize = 10;
const folderPlanPreviewLimit = 5;
const downloadEnabledProviderIds = new Set(["jiosaavn", "youtube"]);
const providerSearchOrder = ["youtube", "jiosaavn"] as const;
const singleTrackProviderSearchLimit = 8;
const providerDownloadPollIntervalMs = 2500;
const maxProviderDownloadPollAttempts = 720;
const bulkProviderJobStorageKey = "spotifybu.bulkProviderJobId";
const mediaSourceProviders: readonly SourceProviderCatalogEntry[] =
  SOURCE_PROVIDER_CATALOG.filter(
    (provider) => downloadEnabledProviderIds.has(provider.id)
  );

export default function Home() {
  const missingBackupActionsRef = useRef<HTMLDivElement | null>(null);
  const bulkDownloadJobRef = useRef<ProviderBulkDownloadJob | null>(null);
  const refreshedBulkJobIdRef = useRef<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appAuthMode, setAppAuthMode] =
    useState<AppAuthStatus["authMode"]>("internal");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [spotifyAuthConfig, setSpotifyAuthConfig] =
    useState<SpotifyAuthConfigResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [playlistBackupStatuses, setPlaylistBackupStatuses] = useState<
    Record<string, PlaylistBackupStatus>
  >({});
  const [playlistMetadataBackups, setPlaylistMetadataBackups] = useState<
    Record<string, PlaylistMetadataBackup>
  >({});
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(
    null
  );
  const [selectedMetadataBackup, setSelectedMetadataBackup] =
    useState<PlaylistMetadataBackup | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>("playlist");
  const [lookupInput, setLookupInput] = useState("");
  const [resolvedSource, setResolvedSource] = useState<ResolvedSource | null>(null);
  const [tracks, setTracks] = useState<BackupTrack[]>([]);
  const [folderPlans, setFolderPlans] = useState<FolderPlan[]>([]);
  const [showAllFolderPlans, setShowAllFolderPlans] = useState(false);
  const [libraryIndex, setLibraryIndex] =
    useState<NavidromeLibraryIndexSummary | null>(null);
  const [libraryIndexScan, setLibraryIndexScan] =
    useState<NavidromeLibraryIndexScanStatus | null>(null);
  const [libraryMatches, setLibraryMatches] = useState<LibraryMatch[]>([]);
  const [query, setQuery] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [isOrganizingLibrary, setIsOrganizingLibrary] = useState(false);
  const [organizingTrackPositions, setOrganizingTrackPositions] = useState<
    number[]
  >([]);
  const [libraryOrganizeProgress, setLibraryOrganizeProgress] =
    useState<string | null>(null);
  const [isCreatingNavidromePlaylist, setIsCreatingNavidromePlaylist] =
    useState(false);
  const [navidromePlaylistSyncMode, setNavidromePlaylistSyncMode] =
    useState<NavidromePlaylistSyncMode>("replace");
  const [isSearchingProvider, setIsSearchingProvider] = useState(false);
  const [isDownloadingProvider, setIsDownloadingProvider] = useState(false);
  const [isDownloadingBulkProvider, setIsDownloadingBulkProvider] =
    useState(false);
  const [isPreviewingBulkProvider, setIsPreviewingBulkProvider] =
    useState(false);
  const [navidromeStatus, setNavidromeStatus] =
    useState<NavidromeLibraryStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadTrackPosition, setDownloadTrackPosition] = useState("");
  const [downloadQuality, setDownloadQuality] = useState("320");
  const [providerCandidates, setProviderCandidates] = useState<
    ProviderSearchCandidate[]
  >([]);
  const [selectedProviderCandidateId, setSelectedProviderCandidateId] =
    useState("");
  const [manualProviderSourceUrl, setManualProviderSourceUrl] = useState("");
  const [isManualProviderSourceOpen, setIsManualProviderSourceOpen] =
    useState(false);
  const [downloadRightsConfirmed, setDownloadRightsConfirmed] = useState(false);
  const [downloadBulkRiskAccepted, setDownloadBulkRiskAccepted] = useState(false);
  const [providerDownloadMessage, setProviderDownloadMessage] =
    useState<string | null>(null);
  const [providerDownloadError, setProviderDownloadError] =
    useState<string | null>(null);
  const [providerDownloadStatusLabel, setProviderDownloadStatusLabel] =
    useState<string | null>(null);
  const [bulkDownloadMessage, setBulkDownloadMessage] = useState<string | null>(
    null
  );
  const [bulkDownloadProgress, setBulkDownloadProgress] =
    useState<BulkDownloadProgress | null>(null);
  const [bulkCandidatePreview, setBulkCandidatePreview] =
    useState<ProviderBulkCandidatePreview | null>(null);
  const [bulkDownloadJob, setBulkDownloadJob] =
    useState<ProviderBulkDownloadJob | null>(null);
  const [libraryOrganizeMessage, setLibraryOrganizeMessage] =
    useState<string | null>(null);
  const [navidromePlaylistMessage, setNavidromePlaylistMessage] =
    useState<string | null>(null);
  const [navidromePlaylistSkipped, setNavidromePlaylistSkipped] = useState<
    NavidromePlaylistSyncResponse["navidromePlaylist"]["skipped"]
  >([]);

  const applyLibraryMatches = useCallback(
    (nextTracks: BackupTrack[], nextMatches: LibraryMatch[]) => {
      setLibraryMatches(nextMatches);

      if (sourceKind === "playlist" && selectedPlaylistId) {
        setPlaylistBackupStatuses((current) => ({
          ...current,
          [selectedPlaylistId]: getPlaylistBackupStatus(nextTracks, nextMatches)
        }));
      }
    },
    [selectedPlaylistId, sourceKind]
  );

  useEffect(() => {
    bulkDownloadJobRef.current = bulkDownloadJob;
  }, [bulkDownloadJob]);

  const clearBackupWorkflowState = useCallback(() => {
    setBulkDownloadMessage(null);
    setBulkDownloadProgress(null);
    setBulkCandidatePreview(null);
    setBulkDownloadJob(null);
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
    setProviderDownloadStatusLabel(null);
    setProviderCandidates([]);
    setSelectedProviderCandidateId("");
    setManualProviderSourceUrl("");
    setIsManualProviderSourceOpen(false);
    setDownloadRightsConfirmed(false);
    setDownloadBulkRiskAccepted(false);
  }, []);

  const loadSession = useCallback(async () => {
    setIsLoadingSession(true);
    setRequestError(null);

    try {
      setSession(await fetchJson<SessionResponse>("/api/session"));
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  const loadSpotifyAuthConfig = useCallback(async () => {
    try {
      setSpotifyAuthConfig(
        await fetchJson<SpotifyAuthConfigResponse>("/api/spotify/auth-config")
      );
    } catch {
      setSpotifyAuthConfig(null);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setIsLoadingPlaylists(true);
    setRequestError(null);

    try {
      const response = await fetchJson<PlaylistResponse>("/api/spotify/playlists");
      const firstReadablePlaylist = response.playlists.find((playlist) =>
        canReadPlaylistTracks(playlist, session?.user?.id)
      );

      setPlaylists(response.playlists);
      setPlaylistMetadataBackups(response.metadataBackups ?? {});
      setPlaylistBackupStatuses(response.backupStatuses ?? {});
      setSelectedPlaylistId((current) => {
        if (
          current &&
          response.playlists.some(
            (playlist) =>
              playlist.id === current &&
              canReadPlaylistTracks(playlist, session?.user?.id)
          )
        ) {
          return current;
        }

        return firstReadablePlaylist?.id ?? null;
      });

      if (response.playlists.length && session?.user?.id && !firstReadablePlaylist) {
        setRequestError(
          "Spotify only exposes playlist tracks for playlists owned by or collaborated on by the connected Spotify user."
        );
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [session?.user?.id]);

  const loadNavidromeStatus = useCallback(async () => {
    try {
      setNavidromeStatus(
        await fetchJson<NavidromeLibraryStatus>("/api/navidrome/library")
      );
    } catch {
      setNavidromeStatus({
        configured: false,
        exists: false,
        message: "SpotifyBU could not check the Navidrome library target.",
        readable: false,
        server: {
          configured: false,
          message: "SpotifyBU could not check the Navidrome server API.",
          navidromeUrl: "",
          state: "error"
        },
        state: "error",
        writable: false
      });
    }
  }, []);

  const applyLibraryIndexResponse = useCallback(
    (response: LibraryIndexResponse) => {
      setLibraryIndex((current) =>
        response.scan?.state === "running" ? current ?? response.index : response.index
      );
      setLibraryIndexScan(response.scan ?? null);
      setIsScanningLibrary(response.scan?.state === "running");
    },
    []
  );

  const loadLibraryIndex = useCallback(async () => {
    try {
      const response = await fetchJson<LibraryIndexResponse>(
        "/api/navidrome/library/index"
      );
      applyLibraryIndexResponse(response);
    } catch {
      setLibraryIndex({
        stale: true,
        trackCount: 0
      });
      setLibraryIndexScan(null);
      setIsScanningLibrary(false);
    }
  }, [applyLibraryIndexResponse]);

  const loadAppInfo = useCallback(async () => {
    try {
      setAppInfo(await fetchJson<AppInfo>("/api/app-info"));
    } catch {
      setAppInfo({
        branch: "unknown",
        version: "unknown"
      });
    }
  }, []);

  const refreshLibraryMatches = useCallback(async (nextTracks = tracks) => {
    if (!nextTracks.length) {
      applyLibraryMatches([], []);
      return [];
    }

    const response = await postJson<LibraryMatchesResponse>(
      "/api/navidrome/library/matches",
      {
        tracks: nextTracks
      }
    );

    applyLibraryMatches(nextTracks, response.libraryMatches);

    return response.libraryMatches;
  }, [applyLibraryMatches, tracks]);

  const markDownloadedTrackInLibrary = useCallback(
    (track: BackupTrack, relativePath: string) => {
      const normalizedRelativePath = normalizeRelativePath(relativePath);
      const relativeDirectory = relativeDirectoryFromPath(normalizedRelativePath);
      const fileName = fileNameFromPath(normalizedRelativePath);

      setLibraryMatches((currentMatches) => {
        const existingMatch = currentMatches.find(
          (match) => match.trackPosition === track.position
        );
        const expectedFolder =
          existingMatch?.expectedFolder || relativeDirectory;
        const needsMove = Boolean(
          expectedFolder && relativeDirectory !== expectedFolder
        );
        const nextMatch = {
          exists: true,
          expectedFolder,
          matchedBy: "metadata",
          matchedTrack: {
            album: track.album,
            albumArtist: track.albumArtist,
            artist: track.artists[0],
            artists: track.artists,
            durationMs: track.durationMs,
            fileName,
            isrc: track.isrc,
            relativeDirectory,
            relativePath: normalizedRelativePath,
            title: track.name
          },
          needsMove,
          recommendedRelativePath:
            needsMove && expectedFolder
              ? `${expectedFolder}/${fileName}`
              : undefined,
          trackId: track.id,
          trackPosition: track.position
        } satisfies LibraryMatch;
        const nextMatches = currentMatches.some(
          (match) => match.trackPosition === track.position
        )
          ? currentMatches.map((match) =>
              match.trackPosition === track.position ? nextMatch : match
            )
          : [...currentMatches, nextMatch];

        return nextMatches.sort(
          (left, right) => left.trackPosition - right.trackPosition
        );
      });
    },
    []
  );

  const scanNavidromeLibrary = useCallback(async () => {
    setIsScanningLibrary(true);
    setRequestError(null);
    let scanStarted = false;

    try {
      const response = await postJson<LibraryIndexResponse>(
        "/api/navidrome/library/index",
        {}
      );
      applyLibraryIndexResponse(response);
      scanStarted = response.scan?.state === "running";

      if (!scanStarted) {
        await refreshLibraryMatches();
      }
    } catch (error) {
      if (isGatewayTimeoutError(error)) {
        const index = libraryIndex ?? {
          stale: true,
          trackCount: 0
        };

        scanStarted = true;
        applyLibraryIndexResponse({
          index,
          scan: {
            index,
            startedAt: new Date().toISOString(),
            state: "running"
          }
        });
        return;
      }

      setRequestError(errorMessage(error));
    } finally {
      if (!scanStarted) {
        setIsScanningLibrary(false);
      }
    }
  }, [
    applyLibraryIndexResponse,
    libraryIndex,
    refreshLibraryMatches
  ]);

  const organizeLibraryMatches = useCallback(async (
    requestedTrackPositions?: number[]
  ) => {
    if (!tracks.length) {
      return;
    }

    const requestedPositions = requestedTrackPositions?.length
      ? new Set(requestedTrackPositions)
      : null;

    if (requestedPositions) {
      setOrganizingTrackPositions([...requestedPositions]);
    } else {
      setIsOrganizingLibrary(true);
    }
    setLibraryOrganizeMessage(null);
    setLibraryOrganizeProgress(null);
    setRequestError(null);

    try {
      const attemptedTrackPositions = new Set<number>();
      let latestLibraryMatches = libraryMatches;
      let totalMovedCount = 0;
      let totalSkippedCount = 0;
      const initialMoveCount = latestLibraryMatches.filter(
        (match) =>
          match.needsMove &&
          (!requestedPositions || requestedPositions.has(match.trackPosition))
      ).length;

      if (!initialMoveCount) {
        latestLibraryMatches = await refreshLibraryMatches(tracks);
        setLibraryOrganizeMessage("No files need organization.");
        return;
      }

      while (true) {
        const batchTrackPositions = latestLibraryMatches
          .filter(
            (match) =>
              match.needsMove &&
              !attemptedTrackPositions.has(match.trackPosition) &&
              (!requestedPositions ||
                requestedPositions.has(match.trackPosition))
          )
          .slice(0, libraryOrganizeBatchSize)
          .map((match) => match.trackPosition);

        if (!batchTrackPositions.length) {
          break;
        }

        for (const trackPosition of batchTrackPositions) {
          attemptedTrackPositions.add(trackPosition);
        }

        setLibraryOrganizeProgress(
          `${numberFormatter.format(
            Math.min(attemptedTrackPositions.size, initialMoveCount)
          )}/${numberFormatter.format(initialMoveCount)}`
        );

        const response = await postJson<LibraryOrganizeResponse>(
          "/api/navidrome/library/organize",
          {
            maxMoves: libraryOrganizeBatchSize,
            trackPositions: batchTrackPositions,
            tracks
          }
        );

        totalMovedCount += response.movedCount;
        totalSkippedCount += response.skippedCount;
        latestLibraryMatches = response.libraryMatches;
        setLibraryIndex(response.index);
        applyLibraryMatches(tracks, response.libraryMatches);
      }

      latestLibraryMatches = await refreshLibraryMatches(tracks);

      if (totalMovedCount || totalSkippedCount) {
        const remainingMoveCount = latestLibraryMatches.filter(
          (match) =>
            match.needsMove &&
            (!requestedPositions || requestedPositions.has(match.trackPosition))
        ).length;
        setLibraryOrganizeMessage(
          `Orginized ${numberFormatter.format(totalMovedCount)} files${
            totalSkippedCount
              ? `; ${numberFormatter.format(totalSkippedCount)} could not be moved`
              : ""
          }${
            remainingMoveCount
              ? `; ${numberFormatter.format(
                  remainingMoveCount
                )} still need organization`
              : ""
          }.`
        );
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      if (requestedPositions) {
        setOrganizingTrackPositions([]);
      } else {
        setIsOrganizingLibrary(false);
      }
      setLibraryOrganizeProgress(null);
    }
  }, [applyLibraryMatches, libraryMatches, refreshLibraryMatches, tracks]);

  const createNavidromePlaylist = useCallback(async () => {
    if (!selectedPlaylistId) {
      return;
    }

    setIsCreatingNavidromePlaylist(true);
    setNavidromePlaylistMessage(null);
    setNavidromePlaylistSkipped([]);
    setRequestError(null);

    try {
      const response = await postJson<NavidromePlaylistSyncResponse>(
        `/api/spotify/playlists/${selectedPlaylistId}/navidrome`,
        {
          mode: navidromePlaylistSyncMode
        }
      );
      const result = response.navidromePlaylist;
      const action =
        result.mode === "append" && result.updated
          ? `Appended ${numberFormatter.format(result.appendedCount ?? 0)} tracks to`
          : result.mode === "fullsync" && result.updated
            ? "Full synced"
          : result.updated
            ? "Replaced"
            : "Created";
      const fullSyncDetails =
        result.mode === "fullsync" && result.updated
          ? [
              result.removedCount
                ? `removed ${numberFormatter.format(result.removedCount)} stale tracks`
                : "",
              result.addedCount
                ? `added ${numberFormatter.format(result.addedCount)} missing tracks`
                : ""
            ]
              .filter(Boolean)
              .join("; ")
          : "";
      const skipped = result.skippedCount
        ? ` ${numberFormatter.format(result.skippedCount)} unmatched tracks were skipped.`
        : "";

      setNavidromePlaylistMessage(
        `${action} Navidrome playlist "${result.name}" with ${numberFormatter.format(
          result.songCount
        )} tracks.${fullSyncDetails ? ` ${fullSyncDetails}.` : ""}${skipped}`
      );
      setNavidromePlaylistSkipped(result.skipped);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsCreatingNavidromePlaylist(false);
    }
  }, [navidromePlaylistSyncMode, selectedPlaylistId]);

  const searchProviderTrack = useCallback(async (track: BackupTrack) => {
    setDownloadTrackPosition(String(track.position));
    setIsSearchingProvider(true);
    setProviderCandidates([]);
    setSelectedProviderCandidateId("");
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
    setProviderDownloadStatusLabel(null);
    setRequestError(null);
    setManualProviderSourceUrl("");
    setIsManualProviderSourceOpen(false);

    try {
      const response = await postJson<ProviderSearchResponse>(
        "/api/providers/search",
        {
          limit: singleTrackProviderSearchLimit,
          providerIds: providerSearchOrder,
          track
        }
      );

      setProviderCandidates(response.search.candidates);
      setSelectedProviderCandidateId(response.search.candidates[0]?.id ?? "");
      setProviderDownloadMessage(
        response.search.candidates.length
          ? `Found ${response.search.candidates.length} candidate sources.`
          : response.search.errors.length
            ? response.search.errors
                .map((error) => `${providerDisplayName(error.providerId)}: ${error.error}`)
                .join(" ")
            : "No provider candidates found."
      );
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsSearchingProvider(false);
    }
  }, []);

  const scrollToMissingBackupActions = useCallback(() => {
    const actionsElement = missingBackupActionsRef.current;

    if (!actionsElement) {
      return;
    }

    actionsElement.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    actionsElement.focus({
      preventScroll: true
    });
  }, []);

  const openMissingBackupActions = useCallback(
    async (track: BackupTrack) => {
      scrollToMissingBackupActions();
      await searchProviderTrack(track);
    },
    [scrollToMissingBackupActions, searchProviderTrack]
  );

  const searchSelectedProviderTrack = useCallback(async () => {
    const selectedTrack = tracks.find(
      (track) => String(track.position) === downloadTrackPosition
    );

    if (!selectedTrack) {
      setRequestError("Choose a track before searching providers.");
      return;
    }

    await searchProviderTrack(selectedTrack);
  }, [
    downloadTrackPosition,
    searchProviderTrack,
    tracks
  ]);

  const toggleManualProviderSource = useCallback(() => {
    const nextIsOpen = !isManualProviderSourceOpen;

    setIsManualProviderSourceOpen(nextIsOpen);

    if (!nextIsOpen) {
      setManualProviderSourceUrl("");
    }

    setDownloadRightsConfirmed(false);
    setDownloadBulkRiskAccepted(false);
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
  }, [isManualProviderSourceOpen]);

  const downloadSelectedProviderCandidate = useCallback(async () => {
    const selectedTrack = tracks.find(
      (track) => String(track.position) === downloadTrackPosition
    );
    const selectedCandidate = providerCandidates.find(
      (candidate) => candidate.id === selectedProviderCandidateId
    );
    const manualSourceUrl = manualProviderSourceUrl.trim();
    const manualSource = manualSourceUrl
      ? providerSourceFromUrl(manualSourceUrl)
      : null;
    const downloadSource = isManualProviderSourceOpen
      ? manualSource
      : selectedCandidate?.url
        ? {
            providerId: selectedCandidate.providerId,
            sourceUrl: selectedCandidate.url
          }
        : null;

    if (!selectedTrack) {
      setRequestError("Choose a track before downloading.");
      return;
    }

    if (isManualProviderSourceOpen && !manualSourceUrl) {
      setRequestError("Enter a manual source URL before downloading.");
      return;
    }

    if (manualSourceUrl && !manualSource) {
      setRequestError("Enter a YouTube or JioSaavn HTTPS source URL.");
      return;
    }

    if (!downloadSource?.sourceUrl) {
      setRequestError(
        "Choose a provider search result or enter a manual source URL before downloading."
      );
      return;
    }

    setIsDownloadingProvider(true);
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
    setProviderDownloadStatusLabel("Starting download job");
    setRequestError(null);

    try {
      const response = await postJson<ProviderDownloadResponse>(
        "/api/providers/download",
        {
          bulkRiskAccepted: downloadBulkRiskAccepted,
          fallbackSources: isManualProviderSourceOpen
            ? []
            : buildProviderFallbackSources(
                providerCandidates,
                downloadSource.sourceUrl
              ),
          providerId: downloadSource.providerId,
          quality: downloadQuality,
          rightsConfirmed: downloadRightsConfirmed,
          selectedReason: isManualProviderSourceOpen
            ? `User entered a manual ${providerDisplayName(
                downloadSource.providerId
              )} source URL`
            : `User reviewed SpotifyBU provider search result (${
                selectedCandidate?.title ?? downloadSource.sourceUrl
              })`,
          sourceUrl: downloadSource.sourceUrl,
          track: selectedTrack
        }
      );
      const download = await waitForProviderDownload(response, (job) => {
        setProviderDownloadStatusLabel(providerDownloadJobLabel(job));
      });
      const location =
        download.relativePath ?? download.destinationPath;
      const downloadMessage = `Downloaded ${selectedTrack.name} to ${location}`;

      if (download.libraryIndex) {
        setLibraryIndex(download.libraryIndex);
      }

      if (download.relativePath) {
        markDownloadedTrackInLibrary(selectedTrack, download.relativePath);
      }

      setProviderDownloadMessage(downloadMessage);
      setProviderDownloadError(null);
      setProviderDownloadStatusLabel(null);
      setProviderCandidates([]);
      setSelectedProviderCandidateId("");
      setManualProviderSourceUrl("");
      setIsManualProviderSourceOpen(false);

      try {
        await refreshLibraryMatches();
      } catch (error) {
        setProviderDownloadMessage(
          `${downloadMessage}. SpotifyBU could not refresh the match table automatically (${errorMessage(
            error
          )}). The file is already in the library folder; run Library Index after the server settles.`
        );
      }
    } catch (error) {
      setProviderDownloadMessage(null);
      setProviderDownloadError(errorMessage(error));
    } finally {
      setIsDownloadingProvider(false);
      setProviderDownloadStatusLabel(null);
    }
  }, [
    downloadBulkRiskAccepted,
    downloadQuality,
    downloadRightsConfirmed,
    downloadTrackPosition,
    isManualProviderSourceOpen,
    manualProviderSourceUrl,
    markDownloadedTrackInLibrary,
    providerCandidates,
    refreshLibraryMatches,
    selectedProviderCandidateId,
    tracks
  ]);

  const resolveCatalogSource = useCallback(async () => {
    const trimmedInput = lookupInput.trim();

    if (sourceKind === "playlist" || !trimmedInput) {
      return;
    }

    setIsResolvingSource(true);
    setRequestError(null);

    try {
      const response = await fetchJson<ResolveResponse>(
        `/api/spotify/resolve?type=${sourceKind}&input=${encodeURIComponent(
          trimmedInput
        )}`
      );
      setResolvedSource(response.source);
      setTracks(response.tracks);
      setFolderPlans(response.folderPlans);
      setLibraryMatches(response.libraryMatches);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsResolvingSource(false);
    }
  }, [lookupInput, sourceKind]);

  const changeSourceKind = useCallback((nextSourceKind: SourceKind) => {
    setSourceKind(nextSourceKind);
    setLibraryOrganizeMessage(null);
    clearBackupWorkflowState();
    setRequestError(null);
    setNavidromePlaylistMessage(null);
    setNavidromePlaylistSkipped([]);
    setResolvedSource(null);
    setTracks([]);
    setFolderPlans([]);
    setShowAllFolderPlans(false);
    setLibraryMatches([]);
    setSelectedPlaylist(null);
    setSelectedMetadataBackup(null);
  }, [clearBackupWorkflowState]);

  const selectPlaylist = useCallback(
    (playlistId: string) => {
      if (playlistId !== selectedPlaylistId) {
        setLibraryOrganizeMessage(null);
        setNavidromePlaylistMessage(null);
        setNavidromePlaylistSkipped([]);
        clearBackupWorkflowState();
        setRequestError(null);
        setSelectedPlaylist(null);
        setTracks([]);
        setFolderPlans([]);
        setShowAllFolderPlans(false);
        setLibraryMatches([]);
        setSelectedMetadataBackup(null);
      }

      setSelectedPlaylistId(playlistId);
    },
    [clearBackupWorkflowState, selectedPlaylistId]
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error) {
      setAuthError(error.replace(/_/g, " "));
      window.history.replaceState({}, "", "/");
    }

    void loadAppInfo();

    async function loadAuthenticatedStartupData() {
      try {
        const appSession = await fetchJson<AppAuthStatus>("/api/app-auth/session");

        if (cancelled) {
          return;
        }

        if (!appSession.authenticated) {
          redirectToLogin();
          return;
        }

        setAppAuthMode(
          appSession.authMode === "external" ? "external" : "internal"
        );
      } catch {
        if (!cancelled) {
          redirectToLogin();
        }
        return;
      }

      if (cancelled) {
        return;
      }

      void loadSpotifyAuthConfig();
      void loadLibraryIndex();
      void loadSession();
      void loadNavidromeStatus();
    }

    void loadAuthenticatedStartupData();

    return () => {
      cancelled = true;
    };
  }, [
    loadAppInfo,
    loadLibraryIndex,
    loadNavidromeStatus,
    loadSession,
    loadSpotifyAuthConfig
  ]);

  useEffect(() => {
    if (libraryIndexScan?.state !== "running") {
      return;
    }

    let cancelled = false;

    async function pollLibraryIndexScan() {
      try {
        const response = await fetchJson<LibraryIndexResponse>(
          "/api/navidrome/library/index"
        );

        if (cancelled) {
          return;
        }

        applyLibraryIndexResponse(response);

        if (response.scan?.state === "succeeded") {
          await refreshLibraryMatches();
          return;
        }

        if (response.scan?.state === "failed") {
          setRequestError(
            response.scan.error ?? "SpotifyBU could not scan the Navidrome library."
          );
        }
      } catch (error) {
        if (!cancelled) {
          if (isGatewayTimeoutError(error)) {
            setIsScanningLibrary(true);
            return;
          }

          setRequestError(errorMessage(error));
          setLibraryIndexScan(null);
          setIsScanningLibrary(false);
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollLibraryIndexScan();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    applyLibraryIndexResponse,
    libraryIndexScan?.state,
    refreshLibraryMatches
  ]);

  useEffect(() => {
    if (session?.authenticated && sourceKind === "playlist") {
      void loadPlaylists();
    }
  }, [loadPlaylists, session?.authenticated, sourceKind]);

  useEffect(() => {
    if (sourceKind !== "playlist") {
      return;
    }

    if (!selectedPlaylistId) {
      setSelectedPlaylist(null);
      setSelectedMetadataBackup(null);
      setTracks([]);
      setFolderPlans([]);
      setShowAllFolderPlans(false);
      setLibraryMatches([]);
      setNavidromePlaylistMessage(null);
      setNavidromePlaylistSkipped([]);
      clearBackupWorkflowState();
      return;
    }

    let cancelled = false;
    const playlistId = selectedPlaylistId;

    async function loadTracks() {
      setIsLoadingTracks(true);
      setLibraryOrganizeMessage(null);
      setNavidromePlaylistMessage(null);
      setNavidromePlaylistSkipped([]);
      clearBackupWorkflowState();
      setRequestError(null);
      setSelectedPlaylist(null);
      setSelectedMetadataBackup(null);
      setTracks([]);
      setFolderPlans([]);
      setShowAllFolderPlans(false);
      setLibraryMatches([]);

      try {
        const response = await fetchJson<TracksResponse>(
          `/api/spotify/playlists/${playlistId}/tracks`
        );

        if (!cancelled) {
          setSelectedPlaylist(response.playlist);
          setTracks(response.tracks);
          setFolderPlans(response.folderPlans);
          setLibraryMatches(response.libraryMatches);
          setSelectedMetadataBackup(response.metadataBackup ?? null);
          if (response.metadataBackup) {
            setPlaylistMetadataBackups((current) => ({
              ...current,
              [playlistId]: response.metadataBackup as PlaylistMetadataBackup
            }));
          }
          setPlaylistBackupStatuses((current) => ({
            ...current,
            [playlistId]: getPlaylistBackupStatus(
              response.tracks,
              response.libraryMatches
            )
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setRequestError(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTracks(false);
        }
      }
    }

    void loadTracks();

    return () => {
      cancelled = true;
    };
  }, [
    clearBackupWorkflowState,
    selectedPlaylistId,
    sourceKind
  ]);

  useEffect(() => {
    if (sourceKind !== "playlist" || !selectedPlaylistId || !tracks.length) {
      return;
    }

    const nextStatus = getPlaylistBackupStatus(tracks, libraryMatches);

    setPlaylistBackupStatuses((current) => {
      const currentStatus = current[selectedPlaylistId];

      if (
        currentStatus?.backedUp === nextStatus.backedUp &&
        currentStatus.missingTrackCount === nextStatus.missingTrackCount &&
        currentStatus.trackCount === nextStatus.trackCount
      ) {
        return current;
      }

      return {
        ...current,
        [selectedPlaylistId]: nextStatus
      };
    });
  }, [libraryMatches, selectedPlaylistId, sourceKind, tracks]);

  const filteredPlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return playlists;
    }

    return playlists.filter((playlist) =>
      [playlist.name, playlist.owner]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [playlists, query]);

  const totalTracks = useMemo(
    () => playlists.reduce((total, playlist) => total + playlist.tracksTotal, 0),
    [playlists]
  );

  const isConnected = Boolean(session?.authenticated);
  const externalAuthEnabled = appAuthMode === "external";
  const userInitial = session?.user?.displayName?.charAt(0).toUpperCase() ?? "S";
  const navidromeReady = navidromeStatus?.state === "ready";
  const navidromeApiReady =
    navidromeStatus?.server.state === "ready" ||
    navidromeStatus?.server.state === "scan_requested";
  const navidromeStatusLabel = navidromeStatus
    ? navidromeStatusMessage(navidromeStatus)
    : "Checking library target";
  const navidromeServerStatusLabel = navidromeStatus?.server.message;
  const libraryMatchesByPosition = useMemo(
    () =>
      new Map(
        libraryMatches.map((match) => [match.trackPosition, match] as const)
      ),
    [libraryMatches]
  );
  const hasUsableLibraryIndex = Boolean(libraryIndex && !libraryIndex.stale);
  const indexedTrackCount = libraryMatches.filter((match) => match.exists).length;
  const moveNeededCount = libraryMatches.filter((match) => match.needsMove).length;
  const missingBackupTracks = useMemo(
    () =>
      hasUsableLibraryIndex
        ? tracks.filter((track) => {
            const match = libraryMatchesByPosition.get(track.position);

            return !match?.exists;
          })
        : tracks,
    [hasUsableLibraryIndex, libraryMatchesByPosition, tracks]
  );
  const missingBackupCount = hasUsableLibraryIndex
    ? missingBackupTracks.length
    : 0;
  const folderPlanSummaries = useMemo(
    () =>
      summarizeFolderPlans(
        folderPlans,
        tracks,
        libraryMatchesByPosition,
        hasUsableLibraryIndex
      ),
    [folderPlans, hasUsableLibraryIndex, libraryMatchesByPosition, tracks]
  );
  const visibleFolderPlans = showAllFolderPlans
    ? folderPlanSummaries
    : folderPlanSummaries.slice(0, folderPlanPreviewLimit);
  const hiddenFolderPlanCount = Math.max(
    0,
    folderPlanSummaries.length - visibleFolderPlans.length
  );
  const backupCoverageLabel = tracks.length
    ? hasUsableLibraryIndex
      ? `${Math.round((indexedTrackCount / tracks.length) * 100)}%`
      : "Scan"
    : "0%";
  const downloadTrackOptions = missingBackupTracks;
  useEffect(() => {
    const nextDownloadTrackPosition = downloadTrackOptions[0]
      ? String(downloadTrackOptions[0].position)
      : "";

    if (
      downloadTrackPosition &&
      downloadTrackOptions.some(
        (track) => String(track.position) === downloadTrackPosition
      )
    ) {
      return;
    }

    if (downloadTrackPosition === nextDownloadTrackPosition) {
      return;
    }

    setDownloadTrackPosition(nextDownloadTrackPosition);
    setProviderCandidates([]);
    setSelectedProviderCandidateId("");
    setManualProviderSourceUrl("");
    setIsManualProviderSourceOpen(false);
    setDownloadRightsConfirmed(false);
    setDownloadBulkRiskAccepted(false);
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
    const currentBulkDownloadJob = bulkDownloadJobRef.current;

    if (
      !currentBulkDownloadJob ||
      !isProviderBulkJobActive(currentBulkDownloadJob)
    ) {
      setBulkCandidatePreview(null);
    }
    if (!currentBulkDownloadJob) {
      setBulkDownloadMessage(null);
      setBulkDownloadProgress(null);
    }
  }, [downloadTrackOptions, downloadTrackPosition]);
  const canOrganizeLibrary =
    navidromeReady && tracks.length > 0 && hasUsableLibraryIndex;
  const organizingTrackPositionSet = new Set(organizingTrackPositions);
  const isAnyOrganizationRunning =
    isOrganizingLibrary || organizingTrackPositions.length > 0;
  const canCreateNavidromePlaylist =
    sourceKind === "playlist" &&
    Boolean(selectedPlaylistId) &&
    tracks.length > 0 &&
    navidromeApiReady &&
    !isLoadingTracks &&
    !isCreatingNavidromePlaylist;
  const selectedDownloadTrack =
    downloadTrackOptions.find(
      (track) => String(track.position) === downloadTrackPosition
    ) ??
    downloadTrackOptions[0] ??
    null;
  const selectedProviderCandidate = providerCandidates.find(
    (candidate) => candidate.id === selectedProviderCandidateId
  );
  const manualProviderSourceUrlTrimmed = manualProviderSourceUrl.trim();
  const manualProviderSource = manualProviderSourceUrlTrimmed
    ? providerSourceFromUrl(manualProviderSourceUrlTrimmed)
    : null;
  const selectedProviderDownloadSource = isManualProviderSourceOpen
    ? manualProviderSource
    : selectedProviderCandidate?.url
      ? {
          providerId: selectedProviderCandidate.providerId,
          sourceUrl: selectedProviderCandidate.url
        }
      : null;
  const canDownloadProvider =
    Boolean(
      navidromeReady &&
        selectedDownloadTrack &&
        selectedProviderDownloadSource?.sourceUrl &&
        downloadRightsConfirmed &&
        downloadBulkRiskAccepted
    ) &&
    !isSearchingProvider &&
    !isDownloadingProvider &&
    !isDownloadingBulkProvider &&
    !isPreviewingBulkProvider;
  const canDownloadBulkProvider =
    Boolean(
      navidromeReady &&
        bulkCandidatePreview?.downloadableCount &&
        downloadRightsConfirmed &&
        downloadBulkRiskAccepted &&
        !isDownloadingProvider &&
        !isSearchingProvider &&
        !isDownloadingBulkProvider &&
        !isPreviewingBulkProvider
    );
  const canPreviewBulkProvider =
    Boolean(
      navidromeReady &&
        downloadTrackOptions.length &&
        !isDownloadingProvider &&
        !isSearchingProvider &&
        !isDownloadingBulkProvider &&
        !isPreviewingBulkProvider
    );
  const previewBulkProviderCandidates = useCallback(async () => {
    if (!downloadTrackOptions.length) {
      setRequestError("Resolve Spotify tracks with missing backups first.");
      return;
    }

    setIsPreviewingBulkProvider(true);
    setBulkCandidatePreview(null);
    setBulkDownloadMessage(null);
    setBulkDownloadProgress({
      completedCount: 0,
      failedCount: 0,
      phase: "Dry run",
      totalCount: downloadTrackOptions.length
    });
    setProviderDownloadMessage(null);
    setProviderDownloadError(null);
    setRequestError(null);

    try {
      const preview = await postProviderBulkPreviewStream(
        {
          limit: 4,
          providerIds: providerSearchOrder,
          tracks: downloadTrackOptions
        },
        (progress) => {
          setBulkDownloadProgress({
            completedCount: progress.completedCount,
            failedCount: progress.failedCount,
            phase: "Dry run",
            totalCount: progress.totalCount,
            trackLabel: progress.trackLabel ?? "Checking provider matches"
          });
        }
      );

      setBulkCandidatePreview(preview);
      setBulkDownloadProgress(null);
      setBulkDownloadMessage(
        `Dry run selected candidates for ${numberFormatter.format(
          preview.downloadableCount
        )} of ${numberFormatter.format(preview.totalCount)} missing tracks.`
      );
    } catch (error) {
      setBulkDownloadProgress(null);
      setRequestError(errorMessage(error));
    } finally {
      setIsPreviewingBulkProvider(false);
    }
  }, [downloadTrackOptions]);

  const applyBulkProviderJob = useCallback(
    (job: ProviderBulkDownloadJob) => {
      setBulkDownloadJob(job);
      setBulkDownloadProgress(providerBulkJobProgress(job));
      setIsDownloadingBulkProvider(isProviderBulkJobActive(job));

      for (const item of job.items) {
        if (item.status !== "completed" || !item.download) {
          continue;
        }

        if (item.download.libraryIndex) {
          setLibraryIndex(item.download.libraryIndex);
        }

        if (item.download.relativePath) {
          markDownloadedTrackInLibrary(item.track, item.download.relativePath);
        }
      }

      if (isProviderBulkJobTerminal(job)) {
        const bulkMessage = providerBulkJobResultMessage(job);

        setBulkDownloadMessage(bulkMessage);

        try {
          window.localStorage.removeItem(bulkProviderJobStorageKey);
        } catch {
          // Local storage may be unavailable in hardened browser contexts.
        }
      }
    },
    [markDownloadedTrackInLibrary]
  );

  const loadBulkProviderJob = useCallback(
    async (jobId: string) => {
      const response = await fetchJson<ProviderBulkDownloadResponse>(
        `/api/providers/download/bulk/${encodeURIComponent(jobId)}`
      );

      if (!response.job) {
        throw new Error("Provider bulk job status response was incomplete.");
      }

      applyBulkProviderJob(response.job);

      return response.job;
    },
    [applyBulkProviderJob]
  );

  const startBulkProviderJob = useCallback(async () => {
    const items = buildBulkDownloadItems(bulkCandidatePreview);

    if (!items.length) {
      setRequestError("Run a dry-run preview and choose tracks with candidates first.");
      return;
    }

    setIsDownloadingBulkProvider(true);
    setBulkDownloadMessage(null);
    setBulkDownloadJob(null);
    setBulkDownloadProgress({
      completedCount: 0,
      failedCount: 0,
      phase: "Queued",
      totalCount: items.length
    });
    setRequestError(null);

    try {
      const response = await postJson<ProviderBulkDownloadResponse>(
        "/api/providers/download/bulk",
        {
          bulkRiskAccepted: downloadBulkRiskAccepted,
          items,
          quality: downloadQuality,
          rightsConfirmed: downloadRightsConfirmed
        }
      );

      if (!response.job) {
        throw new Error("Provider bulk job did not return a job.");
      }

      try {
        window.localStorage.setItem(bulkProviderJobStorageKey, response.job.id);
      } catch {
        // Local storage may be unavailable in hardened browser contexts.
      }

      applyBulkProviderJob(response.job);
    } catch (error) {
      setIsDownloadingBulkProvider(false);
      setRequestError(errorMessage(error));
    }
  }, [
    applyBulkProviderJob,
    bulkCandidatePreview,
    downloadBulkRiskAccepted,
    downloadQuality,
    downloadRightsConfirmed
  ]);

  const cancelBulkProviderJob = useCallback(async () => {
    if (!bulkDownloadJob) {
      return;
    }

    try {
      const response = await postJson<ProviderBulkDownloadResponse>(
        `/api/providers/download/bulk/${encodeURIComponent(bulkDownloadJob.id)}`,
        {
          action: "cancel"
        }
      );

      if (response.job) {
        applyBulkProviderJob(response.job);
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  }, [applyBulkProviderJob, bulkDownloadJob]);

  const retryBulkProviderJob = useCallback(async () => {
    if (!bulkDownloadJob) {
      return;
    }

    setBulkDownloadMessage(null);
    setProviderDownloadError(null);
    setRequestError(null);

    try {
      const response = await postJson<ProviderBulkDownloadResponse>(
        `/api/providers/download/bulk/${encodeURIComponent(bulkDownloadJob.id)}`,
        {
          action: "retry"
        }
      );

      if (response.job) {
        try {
          window.localStorage.setItem(bulkProviderJobStorageKey, response.job.id);
        } catch {
          // Local storage may be unavailable in hardened browser contexts.
        }

        applyBulkProviderJob(response.job);
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  }, [applyBulkProviderJob, bulkDownloadJob]);

  useEffect(() => {
    let cancelled = false;
    let storedJobId = "";

    try {
      storedJobId = window.localStorage.getItem(bulkProviderJobStorageKey) ?? "";
    } catch {
      storedJobId = "";
    }

    if (!storedJobId || bulkDownloadJob?.id === storedJobId) {
      return;
    }

    async function restoreBulkJob() {
      try {
        const job = await loadBulkProviderJob(storedJobId);

        if (!cancelled && isProviderBulkJobTerminal(job)) {
          try {
            window.localStorage.removeItem(bulkProviderJobStorageKey);
          } catch {
            // Local storage may be unavailable in hardened browser contexts.
          }
        }
      } catch {
        try {
          window.localStorage.removeItem(bulkProviderJobStorageKey);
        } catch {
          // Local storage may be unavailable in hardened browser contexts.
        }
      }
    }

    void restoreBulkJob();

    return () => {
      cancelled = true;
    };
  }, [bulkDownloadJob?.id, loadBulkProviderJob]);

  useEffect(() => {
    if (!bulkDownloadJob || isProviderBulkJobTerminal(bulkDownloadJob)) {
      return;
    }

    let cancelled = false;
    const jobId = bulkDownloadJob.id;

    async function pollBulkJob() {
      try {
        const job = await loadBulkProviderJob(jobId);

        if (!cancelled && isProviderBulkJobTerminal(job)) {
          setIsDownloadingBulkProvider(false);
        }
      } catch (error) {
        if (!cancelled) {
          setRequestError(errorMessage(error));
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollBulkJob();
    }, providerDownloadPollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [bulkDownloadJob, loadBulkProviderJob]);

  useEffect(() => {
    if (!bulkDownloadJob || !isProviderBulkJobTerminal(bulkDownloadJob)) {
      return;
    }

    if (refreshedBulkJobIdRef.current === bulkDownloadJob.id) {
      return;
    }

    refreshedBulkJobIdRef.current = bulkDownloadJob.id;

    void refreshLibraryMatches().catch((error) => {
      setBulkDownloadMessage(
        `${providerBulkJobResultMessage(
          bulkDownloadJob
        )} SpotifyBU could not refresh the match table automatically (${errorMessage(
          error
        )}). Run Library Index after the server settles.`
      );
    });
  }, [bulkDownloadJob, refreshLibraryMatches]);
  const libraryIndexLabel = libraryIndex
    ? libraryIndex.generatedAt
      ? `${numberFormatter.format(libraryIndex.trackCount)} indexed - scanned ${formatShortDate(
          libraryIndex.generatedAt
        )}${
          libraryIndex.namingSchemeChanged
            ? " - organize scheme changed; index needed"
            : libraryIndex.stale
              ? " - index needed"
              : ""
        }${
          libraryIndex.skippedCount
            ? ` - ${numberFormatter.format(libraryIndex.skippedCount)} skipped`
            : ""
        }`
      : "No library index yet"
    : "Checking index";
  const libraryIndexScanLabel =
    libraryIndexScan?.state === "running"
      ? "Library Index running in the background."
      : libraryIndexScan?.state === "failed"
        ? `Library Index failed: ${
            libraryIndexScan.error ?? "SpotifyBU could not scan the library."
          }`
        : libraryIndexScan?.state === "succeeded"
          ? "Library Index completed."
          : null;
  const playlistSource = selectedPlaylist
    ? ({
        externalUrl: selectedPlaylist.externalUrl,
        id: selectedPlaylist.id,
        imageUrl: selectedPlaylist.imageUrl,
        name: selectedPlaylist.name,
        subtitle: selectedPlaylist.owner,
        tracksTotal: selectedPlaylist.tracksTotal,
        type: "playlist"
      } satisfies ResolvedSource)
    : null;
  const activeSource = sourceKind === "playlist" ? playlistSource : resolvedSource;
  const canExportPlaylist = sourceKind === "playlist" && Boolean(selectedPlaylistId);
  const selectedTracksLabel =
    sourceKind === "playlist" ? "Selected Tracks" : "Resolved Tracks";
  const bulkProgressFinished = bulkDownloadProgress
    ? bulkDownloadProgress.completedCount + bulkDownloadProgress.failedCount
    : 0;
  const bulkProgressPercent =
    bulkDownloadProgress && bulkDownloadProgress.totalCount
      ? Math.round((bulkProgressFinished / bulkDownloadProgress.totalCount) * 100)
      : 0;
  const visibleBulkPreviewItems = bulkCandidatePreview?.items ?? [];
  const failedBulkDownloadItems =
    bulkDownloadJob?.items.filter((item) => item.status === "failed") ?? [];
  const visibleFailedBulkDownloadItems = failedBulkDownloadItems.slice(0, 6);
  const bulkDownloadMessageClass =
    bulkDownloadJob?.status === "failed"
      ? "provider-error"
      : bulkDownloadJob?.status === "cancelled"
        ? "provider-queue-note"
        : "provider-success";
  const canCancelBulkProviderJob = Boolean(
    bulkDownloadJob && isProviderBulkJobActive(bulkDownloadJob)
  );
  const canRetryBulkProviderJob = Boolean(
    bulkDownloadJob &&
      isProviderBulkJobTerminal(bulkDownloadJob) &&
      bulkDownloadJob.items.some((item) => item.status !== "completed")
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-note">BU</span>
          </div>
          <div>
            <p className="eyebrow">SpotifyBU</p>
            <h1>Spotify Backup</h1>
          </div>
        </div>

        <div className="topbar-actions">
          {isConnected && session?.user ? (
            <div className="user-chip">
              {session.user.imageUrl ? (
                <img
                  alt=""
                  className="user-avatar"
                  src={session.user.imageUrl}
                />
              ) : (
                <span className="user-avatar">{userInitial}</span>
              )}
              <span>{session.user.displayName}</span>
            </div>
          ) : null}

          {isConnected ? (
            <a className="icon-command" href="/api/auth/logout" title="Disconnect">
              <LogOut size={18} />
              Spotify
            </a>
          ) : (
            <a
              className={`command green ${
                session?.spotifyClientConfigured === false ? "disabled" : ""
              }`}
              aria-disabled={session?.spotifyClientConfigured === false}
              href="/api/auth/login"
              tabIndex={session?.spotifyClientConfigured === false ? -1 : undefined}
              title="Connect Spotify"
            >
              <LogIn size={18} />
              Connect Spotify
            </a>
          )}

          <a className="icon-command" href="/settings" title="Settings">
            <Settings size={18} />
            Settings
          </a>

          {externalAuthEnabled ? (
            <span
              className="user-chip"
              title="App sign-out is managed by the external auth provider"
            >
              <ShieldCheck size={18} />
              External auth
            </span>
          ) : (
            <a className="icon-command" href="/api/app-auth/logout" title="Sign out">
              <LogOut size={18} />
              Sign out
            </a>
          )}
        </div>
      </header>

      {authError ? (
        <div className="alert danger">
          <ShieldCheck size={18} />
          <span>
            {authError}
            {spotifyAuthConfig?.redirectUri
              ? `. Spotify must allow exactly: ${spotifyAuthConfig.redirectUri}`
              : ""}
            {spotifyAuthConfig?.redirectUriWarning
              ? ` ${spotifyAuthConfig.redirectUriWarning}`
              : ""}
          </span>
        </div>
      ) : null}

      {requestError ? (
        <div className="alert danger">
          <ShieldCheck size={18} />
          <span>{requestError}</span>
        </div>
      ) : null}

      {libraryOrganizeMessage ? (
        <div className="alert success">
          <CheckCircle2 size={18} />
          <span>{libraryOrganizeMessage}</span>
        </div>
      ) : null}

      {navidromePlaylistMessage ? (
        <div className="alert success">
          <CheckCircle2 size={18} />
          <span>{navidromePlaylistMessage}</span>
        </div>
      ) : null}

      {navidromePlaylistSkipped.length ? (
        <div className="alert skipped-review">
          <ShieldCheck size={18} />
          <span>
            <strong>Skipped tracks</strong>
            {navidromePlaylistSkipped.slice(0, 8).map((track) => (
              <span
                className="skipped-review-row"
                key={`${track.trackPosition}-${track.trackName}`}
              >
                {track.trackPosition}. {track.trackName} - {track.reason}
              </span>
            ))}
            {navidromePlaylistSkipped.length > 8 ? (
              <span className="skipped-review-row">
                {numberFormatter.format(navidromePlaylistSkipped.length - 8)}{" "}
                more skipped tracks
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {session?.spotifyClientConfigured === false ? (
        <div className="alert">
          <ShieldCheck size={18} />
          <span>Set SPOTIFY_CLIENT_ID in .env.local before connecting.</span>
        </div>
      ) : null}

      {navidromeStatus && !navidromeReady ? (
        <div className="alert">
          <HardDrive size={18} />
          <span>{navidromeStatus.message}</span>
        </div>
      ) : null}

      {isLoadingSession ? (
        <section className="panel loading-state">
          <Loader2 className="spin" size={28} />
          <span>Loading session</span>
        </section>
      ) : isConnected ? (
        <section className="workspace-grid">
          <aside className="panel library-panel">
            <div className="panel-header">
              <div className="panel-title">
                <ListMusic size={20} />
                <div>
                  <h2>Backup Scope</h2>
                  <p className="muted">
                    {sourceKindLabel(sourceKind)}
                  </p>
                </div>
              </div>
              <button
                className="icon-command"
                disabled={sourceKind !== "playlist" || isLoadingPlaylists}
                onClick={() => void loadPlaylists()}
                title="Refresh playlists"
                type="button"
              >
                <RefreshCw
                  className={isLoadingPlaylists ? "spin" : undefined}
                  size={18}
                />
              </button>
            </div>

            <div className="library-tools">
              <label className="scope-control">
                <span className="stat-label">Type</span>
                <select
                  aria-label="Backup source type"
                  onChange={(event) =>
                    changeSourceKind(event.target.value as SourceKind)
                  }
                  value={sourceKind}
                >
                  <option value="playlist">User playlist</option>
                  <option value="album">Album</option>
                  <option value="track">Song</option>
                  <option value="track-list">Track list</option>
                </select>
              </label>

              {sourceKind === "playlist" ? (
                <label className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="Search playlists"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search"
                    value={query}
                  />
                </label>
              ) : (
                <form
                  className="lookup-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void resolveCatalogSource();
                  }}
                >
                  {sourceKind === "track-list" ? (
                    <label className="search-box multiline">
                      <Search size={18} />
                      <textarea
                        aria-label="Spotify track list"
                        onChange={(event) => setLookupInput(event.target.value)}
                        placeholder="Spotify song URLs, URIs, or IDs"
                        value={lookupInput}
                      />
                    </label>
                  ) : (
                    <label className="search-box">
                      <Search size={18} />
                      <input
                        aria-label={`Spotify ${sourceKindLabel(sourceKind)} URL`}
                        onChange={(event) => setLookupInput(event.target.value)}
                        placeholder={
                          sourceKind === "album"
                            ? "Spotify album URL or ID"
                            : "Spotify song URL or ID"
                        }
                        value={lookupInput}
                      />
                    </label>
                  )}
                  <button
                    className="command"
                    disabled={!lookupInput.trim() || isResolvingSource}
                    type="submit"
                  >
                    {isResolvingSource ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <Search size={18} />
                    )}
                    Resolve
                  </button>
                </form>
              )}
            </div>

            {sourceKind === "playlist" ? (
              <div className="playlist-list">
                {filteredPlaylists.map((playlist) => {
                  const playlistReadable = canReadPlaylistTracks(
                    playlist,
                    session?.user?.id
                  );
                  const backupStatus = playlistBackupStatuses[playlist.id];
                  const metadataBackup = playlistMetadataBackups[playlist.id];
                  const missingBackupTrackCount =
                    getPlaylistMissingBackupTrackCount(
                      playlist,
                      backupStatus,
                      metadataBackup
                    );

                  return (
                    <button
                      className={`playlist-button ${
                        playlist.id === selectedPlaylistId ? "active" : ""
                      }`}
                      key={playlist.id}
                      onClick={() => selectPlaylist(playlist.id)}
                      title={
                        playlistReadable
                          ? undefined
                          : "Spotify only exposes tracks for owned or collaborative playlists"
                      }
                      type="button"
                    >
                      <span className="playlist-art">
                        {playlist.imageUrl ? (
                          <img alt="" src={playlist.imageUrl} />
                        ) : (
                          <Music2 size={22} />
                        )}
                      </span>
                      <span className="playlist-meta">
                        <span className="playlist-title-row">
                          <span className="playlist-name">{playlist.name}</span>
                          {!playlistReadable ? (
                            <span
                              className="playlist-unavailable-badge"
                              title="Spotify only exposes tracks for owned or collaborative playlists"
                            >
                              Limited
                            </span>
                          ) : missingBackupTrackCount > 0 ? (
                            <span
                              className="playlist-missing-backup-badge"
                              title={playlistMissingBackupTitle(
                                missingBackupTrackCount
                              )}
                            >
                              {numberFormatter.format(missingBackupTrackCount)} not
                              backed up
                            </span>
                          ) : backupStatus?.backedUp ? (
                            <span
                              className="playlist-backed-up-badge"
                              title="All tracks in this playlist are backed up"
                            >
                              <CheckCircle2 size={14} />
                              Backed up
                            </span>
                          ) : null}
                          {metadataBackup ? (
                            <span
                              className="playlist-saved-badge"
                              title={`Metadata saved ${formatShortDate(
                                metadataBackup.exportedAt
                              )}`}
                            >
                              DB saved
                            </span>
                          ) : null}
                        </span>
                        <span className="playlist-count">
                          {numberFormatter.format(playlist.tracksTotal)} tracks
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="source-preview">
                {resolvedSource ? (
                  <>
                    <span className="playlist-art">
                      {resolvedSource.imageUrl ? (
                        <img alt="" src={resolvedSource.imageUrl} />
                      ) : (
                        <Music2 size={22} />
                      )}
                    </span>
                    <span>
                      <span className="playlist-name">{resolvedSource.name}</span>
                      <span className="playlist-count">
                        {resolvedSource.subtitle}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="muted">
                    {sourceKind === "track-list"
                      ? "Paste Spotify song URLs, URIs, or IDs to preview Navidrome targets."
                      : `Paste a Spotify ${sourceKindLabel(
                          sourceKind
                        ).toLowerCase()} URL or ID to preview its Navidrome target.`}
                  </span>
                )}
              </div>
            )}
          </aside>

          <section className="panel detail-panel">
            <div className="panel-header">
              <div className="panel-title">
                <Download size={20} />
                <div>
                  <h2>{activeSource?.name ?? `Select a ${sourceKindLabel(sourceKind)}`}</h2>
                  <p className="muted">{activeSource?.subtitle ?? "Ready"}</p>
                </div>
              </div>
              <div className="detail-actions">
                {sourceKind === "playlist" ? (
                  <>
                    <label className="sync-mode-control">
                      <span className="stat-label">Navidrome</span>
                      <select
                        disabled={isCreatingNavidromePlaylist}
                        onChange={(event) =>
                          setNavidromePlaylistSyncMode(
                            parseNavidromePlaylistSyncMode(event.target.value)
                          )
                        }
                        value={navidromePlaylistSyncMode}
                      >
                        <option value="replace">Replace</option>
                        <option value="append">Append</option>
                        <option value="fullsync">Full sync</option>
                      </select>
                    </label>
                    <button
                      className={`command secondary ${
                        canCreateNavidromePlaylist ? "" : "disabled"
                      }`}
                      disabled={!canCreateNavidromePlaylist}
                      onClick={() => void createNavidromePlaylist()}
                      title={
                        navidromeApiReady
                          ? "Sync this playlist in Navidrome"
                          : "Connect Navidrome API credentials to create playlists"
                      }
                      type="button"
                    >
                      {isCreatingNavidromePlaylist ? (
                        <Loader2 className="spin" size={18} />
                      ) : (
                        <ListMusic size={18} />
                      )}
                      Sync Navidrome
                    </button>
                  </>
                ) : null}
                <a
                  className={`command secondary ${
                    canExportPlaylist ? "" : "disabled"
                  }`}
                  href={
                    canExportPlaylist
                      ? `/api/spotify/playlists/${selectedPlaylistId}/export?format=json`
                      : "#"
                  }
                  aria-disabled={!canExportPlaylist}
                  tabIndex={canExportPlaylist ? undefined : -1}
                  title="Export JSON"
                >
                  <FileJson size={18} />
                  JSON
                </a>
                <a
                  className={`command secondary ${
                    canExportPlaylist ? "" : "disabled"
                  }`}
                  href={
                    canExportPlaylist
                      ? `/api/spotify/playlists/${selectedPlaylistId}/export?format=csv`
                      : "#"
                  }
                  aria-disabled={!canExportPlaylist}
                  tabIndex={canExportPlaylist ? undefined : -1}
                  title="Export CSV"
                >
                  <FileText size={18} />
                  CSV
                </a>
                <button
                  className={`command secondary ${
                    canOrganizeLibrary ? "" : "disabled"
                  }`}
                  disabled={!canOrganizeLibrary || isAnyOrganizationRunning}
                  onClick={() => void organizeLibraryMatches()}
                  title="Move matched files into organized album folders"
                  type="button"
                >
                  {isOrganizingLibrary ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <HardDrive size={18} />
                  )}
                  {isOrganizingLibrary
                    ? `Organizing ${
                        libraryOrganizeProgress ?? ""
                      }`.trim()
                    : "Orginize"}
                </button>
              </div>
            </div>

            <div className="detail-body">
              <div className="summary-strip">
                <span>
                  <span className="stat-label">Spotify Source</span>
                  <span className="stat-value">
                    {numberFormatter.format(
                      activeSource?.tracksTotal ??
                        (sourceKind === "playlist" ? totalTracks : 0)
                    )}
                  </span>
                </span>
                <span>
                  <span className="stat-label">{selectedTracksLabel}</span>
                  <span className="stat-value">
                    {numberFormatter.format(tracks.length)}
                  </span>
                </span>
                <span>
                  <span className="stat-label">Metadata DB</span>
                  <span className="stat-value metadata-stat">
                    {selectedMetadataBackup
                      ? formatShortDate(selectedMetadataBackup.exportedAt)
                      : sourceKind === "playlist"
                        ? "Saving"
                        : "N/A"}
                  </span>
                </span>
                <span>
                  <span className="stat-label">Backup Coverage</span>
                  <span className="stat-value">{backupCoverageLabel}</span>
                </span>
                <span>
                  <span className="stat-label">Backed Up</span>
                  <span className="stat-value">
                    {numberFormatter.format(indexedTrackCount)}
                  </span>
                </span>
                <span>
                  <span className="stat-label">Missing Backup</span>
                  <span className="stat-value">
                    {hasUsableLibraryIndex
                      ? numberFormatter.format(missingBackupCount)
                      : "Index"}
                  </span>
                </span>
              </div>

              {folderPlanSummaries.length ? (
                <div className="folder-plan-section">
                  <div className="section-heading">
                    <span className="stat-label">Album organization targets</span>
                    <p>
                      Existing backups, files to organize, and download
                      destinations by Navidrome album folder.
                    </p>
                  </div>
                  <div className="folder-plan-list">
                    {visibleFolderPlans.map((plan) => (
                      <div
                        className={`folder-plan ${plan.status}`}
                        key={plan.key}
                      >
                        <HardDrive size={18} />
                        <span>
                          <span className="folder-plan-name">
                            {plan.folderName}
                          </span>
                          <span className="folder-plan-path">
                            {plan.absolutePath ?? plan.relativePath}
                          </span>
                        </span>
                        <span className="folder-plan-state">
                          {plan.status === "organize" ? (
                            <button
                              className={`folder-plan-status ${plan.status}`}
                              disabled={isAnyOrganizationRunning}
                              onClick={() =>
                                void organizeLibraryMatches(
                                  plan.organizeTrackPositions
                                )
                              }
                              title={`Orginize files into ${plan.relativePath}`}
                              type="button"
                            >
                              {plan.organizeTrackPositions.some((position) =>
                                organizingTrackPositionSet.has(position)
                              ) ? (
                                <Loader2 className="spin" size={14} />
                              ) : (
                                renderFolderPlanStatusIcon(plan.status)
                              )}
                              {plan.organizeTrackPositions.some((position) =>
                                organizingTrackPositionSet.has(position)
                              )
                                ? "Orginizing"
                                : plan.statusLabel}
                            </button>
                          ) : (
                            <span
                              className={`folder-plan-status ${plan.status}`}
                            >
                              {renderFolderPlanStatusIcon(plan.status)}
                              {plan.statusLabel}
                            </span>
                          )}
                          <span className="folder-plan-count">
                            {plan.countLabel}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {folderPlanSummaries.length > folderPlanPreviewLimit ? (
                    <button
                      className="folder-plan-toggle"
                      onClick={() =>
                        setShowAllFolderPlans((current) => !current)
                      }
                      type="button"
                    >
                      {showAllFolderPlans ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                      {showAllFolderPlans
                        ? "Show fewer destinations"
                        : `Show ${numberFormatter.format(
                            hiddenFolderPlanCount
                          )} more destinations`}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!isLoadingTracks && activeSource ? (
                <div
                  aria-label="Missing backup actions"
                  className="provider-download backup-workflow"
                  ref={missingBackupActionsRef}
                  tabIndex={-1}
                >
                  <div className="backup-workflow-header">
                    <div>
                      <span className="stat-label">Missing backup actions</span>
                      <h3>Back up tracks that are not in Navidrome</h3>
                      <p>
                        The track table below shows coverage. These controls only
                        target tracks that are still missing from the library index.
                      </p>
                    </div>
                    <span className="backup-workflow-count">
                      {hasUsableLibraryIndex
                        ? `${numberFormatter.format(missingBackupCount)} missing`
                        : "Run Index"}
                    </span>
                  </div>
                  <div className="provider-throttle-grid compact backup-workflow-settings">
                    <label className="provider-field">
                      <span>Quality</span>
                      <select
                        disabled={isDownloadingProvider || isDownloadingBulkProvider}
                        onChange={(event) => {
                          setDownloadQuality(event.target.value);
                          setDownloadRightsConfirmed(false);
                          setDownloadBulkRiskAccepted(false);
                          setProviderDownloadMessage(null);
                          setProviderDownloadError(null);
                          setBulkDownloadMessage(null);
                          setBulkDownloadProgress(null);
                        }}
                        value={downloadQuality}
                      >
                        <option value="128">128 kbps</option>
                        <option value="320">320 kbps</option>
                      </select>
                    </label>
                  </div>
                  <div className="backup-workflow-grid">
                    <section className="backup-workflow-section">
                      <div>
                        <h3>Single track</h3>
                        <p>
                          Choose a missing Spotify track, search provider
                          candidates, review the match, then stage it into
                          Navidrome.
                        </p>
                      </div>
                      <label className="provider-field">
                        <span>Missing Spotify track</span>
                        <select
                          disabled={
                            !downloadTrackOptions.length ||
                            isDownloadingProvider ||
                            isDownloadingBulkProvider
                          }
                          onChange={(event) => {
                            setDownloadTrackPosition(event.target.value);
                            setProviderCandidates([]);
                            setSelectedProviderCandidateId("");
                            setManualProviderSourceUrl("");
                            setIsManualProviderSourceOpen(false);
                            setDownloadRightsConfirmed(false);
                            setDownloadBulkRiskAccepted(false);
                            setProviderDownloadMessage(null);
                            setProviderDownloadError(null);
                          }}
                          value={downloadTrackPosition}
                        >
                          {downloadTrackOptions.length ? (
                            downloadTrackOptions.map((track) => (
                              <option
                                key={`${track.position}-${track.id ?? track.name}`}
                                value={String(track.position)}
                              >
                                {track.position}. {track.name}
                              </option>
                            ))
                          ) : (
                            <option value="">
                              {tracks.length
                                ? "No missing backup tracks"
                                : "Resolve Spotify tracks first"}
                            </option>
                          )}
                        </select>
                      </label>
                      <button
                        className="command secondary"
                        disabled={
                          !selectedDownloadTrack ||
                          isSearchingProvider ||
                          isDownloadingProvider ||
                          isDownloadingBulkProvider
                        }
                        onClick={() => void searchSelectedProviderTrack()}
                        title="Search YouTube and JioSaavn for this track"
                        type="button"
                      >
                        {isSearchingProvider ? (
                          <Loader2 className="spin" size={18} />
                        ) : (
                          <Search size={18} />
                        )}
                        Find Source
                      </button>
                      {providerCandidates.length ? (
                        <label className="provider-field">
                          <span>Provider candidate</span>
                          <select
                            disabled={
                              isDownloadingProvider || isDownloadingBulkProvider
                            }
                            onChange={(event) => {
                              setSelectedProviderCandidateId(event.target.value);
                              setManualProviderSourceUrl("");
                              setIsManualProviderSourceOpen(false);
                              setDownloadRightsConfirmed(false);
                              setDownloadBulkRiskAccepted(false);
                              setProviderDownloadMessage(null);
                              setProviderDownloadError(null);
                            }}
                            value={selectedProviderCandidateId}
                          >
                            {providerCandidates.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {providerDisplayName(candidate.providerId)} -{" "}
                                {candidate.title} ({candidate.score.overall}%)
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {selectedProviderCandidate ? (
                        <div className="provider-candidate">
                          <span className="stat-label">
                            {providerDisplayName(
                              selectedProviderCandidate.providerId
                            )}
                          </span>
                          <strong>{selectedProviderCandidate.title}</strong>
                          <span>
                            {selectedProviderCandidate.artists.join(", ") ||
                              "Unknown artist"}
                          </span>
                          <span>
                            Match score {selectedProviderCandidate.score.overall}%
                          </span>
                          {selectedProviderCandidate.url ? (
                            <span className="provider-candidate-actions">
                              <a
                                href={selectedProviderCandidate.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Review source
                              </a>
                              <button
                                className="provider-inline-button"
                                disabled={
                                  isDownloadingProvider ||
                                  isDownloadingBulkProvider
                                }
                                onClick={toggleManualProviderSource}
                                type="button"
                              >
                                <Link2 size={14} />
                                {isManualProviderSourceOpen
                                  ? "Clear manual URL"
                                  : "Enter URL manually"}
                              </button>
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          className="command secondary"
                          disabled={
                            !selectedDownloadTrack ||
                            isDownloadingProvider ||
                            isDownloadingBulkProvider
                          }
                          onClick={toggleManualProviderSource}
                          title="Enter a known provider source URL"
                          type="button"
                        >
                          <Link2 size={18} />
                          {isManualProviderSourceOpen
                            ? "Clear Manual URL"
                            : "Enter URL Manually"}
                        </button>
                      )}
                      {isManualProviderSourceOpen ? (
                        <div className="provider-manual-source">
                          <label className="provider-field">
                            <span>Manual source URL</span>
                            <input
                              disabled={
                                isDownloadingProvider ||
                                isDownloadingBulkProvider
                              }
                              onChange={(event) => {
                                setManualProviderSourceUrl(event.target.value);
                                setDownloadRightsConfirmed(false);
                                setDownloadBulkRiskAccepted(false);
                                setProviderDownloadMessage(null);
                                setProviderDownloadError(null);
                              }}
                              placeholder="https://www.youtube.com/watch?v=..."
                              type="url"
                              value={manualProviderSourceUrl}
                            />
                          </label>
                          {manualProviderSourceUrlTrimmed ? (
                            <p
                              className={
                                manualProviderSource
                                  ? "provider-queue-note"
                                  : "provider-error"
                              }
                            >
                              {manualProviderSource
                                ? `Manual source: ${providerDisplayName(
                                    manualProviderSource.providerId
                                  )}`
                                : "Use a YouTube or JioSaavn HTTPS URL."}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <label className="provider-check">
                        <input
                          checked={downloadRightsConfirmed}
                          disabled={
                            isDownloadingProvider || isDownloadingBulkProvider
                          }
                          onChange={(event) =>
                            setDownloadRightsConfirmed(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I am authorized to download this selected source.
                        </span>
                      </label>
                      <label className="provider-check">
                        <input
                          checked={downloadBulkRiskAccepted}
                          disabled={
                            isDownloadingProvider || isDownloadingBulkProvider
                          }
                          onChange={(event) =>
                            setDownloadBulkRiskAccepted(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I understand provider throttling and blocking risk.
                        </span>
                      </label>
                      <button
                        className={`command secondary ${
                          canDownloadProvider ? "" : "disabled"
                        }`}
                        disabled={!canDownloadProvider}
                        onClick={() => void downloadSelectedProviderCandidate()}
                        title="Download selected provider candidate"
                        type="button"
                      >
                        {isDownloadingProvider ? (
                          <Loader2 className="spin" size={18} />
                        ) : (
                          <Download size={18} />
                        )}
                        Download
                      </button>
                      {isDownloadingProvider ? (
                        <div
                          aria-live="polite"
                          className="download-progress"
                          role="status"
                        >
                          <div className="download-progress-meta">
                            <span>Downloading</span>
                            <span>MP3 {downloadQuality} kbps</span>
                          </div>
                          <div
                            aria-label="Provider download in progress"
                            className="download-progress-bar"
                            role="progressbar"
                          >
                            <span className="download-progress-fill indeterminate" />
                          </div>
                          <p className="download-progress-note">
                            {providerDownloadStatusLabel ??
                            (selectedDownloadTrack
                              ? `${selectedDownloadTrack.position}. ${selectedDownloadTrack.name}`
                              : "Preparing source")}
                          </p>
                        </div>
                      ) : null}
                      {providerDownloadMessage ? (
                        <p className="provider-success">
                          {providerDownloadMessage}
                        </p>
                      ) : null}
                      {providerDownloadError ? (
                        <p className="provider-error" role="alert">
                          {providerDownloadError}
                        </p>
                      ) : null}
                    </section>
                    <section className="backup-workflow-section">
                      <div>
                        <h3>Bulk playlist</h3>
                        <p>
                          Automatically stage missing tracks with the highest
                          scoring provider match.
                        </p>
                      </div>
                      {downloadTrackOptions.length ? (
                        <p className="provider-queue-note">
                          {numberFormatter.format(downloadTrackOptions.length)}{" "}
                          missing tracks ready
                        </p>
                      ) : null}
                      <button
                        className={`command secondary ${
                          canPreviewBulkProvider ? "" : "disabled"
                        }`}
                        disabled={!canPreviewBulkProvider}
                        onClick={() => void previewBulkProviderCandidates()}
                        title="Preview provider selections without downloading"
                        type="button"
                      >
                        {isPreviewingBulkProvider ? (
                          <Loader2 className="spin" size={18} />
                        ) : (
                          <Search size={18} />
                        )}
                        Preview Candidates
                      </button>
                      {bulkCandidatePreview ? (
                        <div className="provider-preview">
                          <div className="download-progress-meta">
                            <span>Dry run</span>
                            <span>
                              {numberFormatter.format(
                                bulkCandidatePreview.downloadableCount
                              )}
                              /{numberFormatter.format(
                                bulkCandidatePreview.totalCount
                              )} ready
                            </span>
                          </div>
                          <div className="provider-preview-list">
                            {visibleBulkPreviewItems.map((item) => (
                              <div
                                className={`provider-preview-item ${
                                  item.candidate?.url ? "ready" : "failed"
                                }`}
                                key={`${item.track.position}-${item.track.id ?? item.track.name}`}
                              >
                                <span>
                                  {item.track.position}. {item.track.name}
                                </span>
                                <strong>{bulkPreviewCandidateLabel(item)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <label className="provider-check">
                        <input
                          checked={downloadRightsConfirmed}
                          disabled={
                            isDownloadingProvider || isDownloadingBulkProvider
                          }
                          onChange={(event) =>
                            setDownloadRightsConfirmed(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I am authorized to download these previewed sources.
                        </span>
                      </label>
                      <label className="provider-check">
                        <input
                          checked={downloadBulkRiskAccepted}
                          disabled={
                            isDownloadingProvider || isDownloadingBulkProvider
                          }
                          onChange={(event) =>
                            setDownloadBulkRiskAccepted(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I understand provider throttling and blocking risk.
                        </span>
                      </label>
                      <div className="provider-action-row">
                        <button
                          className={`command secondary ${
                            canDownloadBulkProvider ? "" : "disabled"
                          }`}
                          disabled={!canDownloadBulkProvider}
                          onClick={() => void startBulkProviderJob()}
                          title="Start a resumable background bulk backup job"
                          type="button"
                        >
                          {isDownloadingBulkProvider ? (
                            <Loader2 className="spin" size={18} />
                          ) : (
                            <Play size={18} />
                          )}
                          Start Job
                        </button>
                        <button
                          className="icon-command compact"
                          disabled={!canCancelBulkProviderJob}
                          onClick={() => void cancelBulkProviderJob()}
                          title="Cancel bulk job after the current track"
                          type="button"
                        >
                          <XCircle size={18} />
                        </button>
                        <button
                          className="icon-command compact"
                          disabled={!canRetryBulkProviderJob}
                          onClick={() => void retryBulkProviderJob()}
                          title="Retry unfinished bulk job items"
                          type="button"
                        >
                          <RotateCcw size={18} />
                        </button>
                      </div>
                      {bulkDownloadProgress ? (
                        <div
                          aria-live="polite"
                          className="download-progress"
                          role="status"
                        >
                          <div className="download-progress-meta">
                            <span>{bulkDownloadProgress.phase}</span>
                            <span>
                              {`${bulkProgressFinished}/${bulkDownloadProgress.totalCount} (${bulkProgressPercent}%)`}
                            </span>
                          </div>
                          <div
                            aria-label="Bulk download progress"
                            aria-valuemax={bulkDownloadProgress.totalCount}
                            aria-valuemin={0}
                            aria-valuenow={bulkProgressFinished}
                            className="download-progress-bar"
                            role="progressbar"
                          >
                            <span
                              className="download-progress-fill"
                              style={{ width: `${bulkProgressPercent}%` }}
                            />
                          </div>
                          <p className="download-progress-note">
                            {bulkDownloadProgress.trackLabel ??
                              (bulkDownloadProgress.failedCount
                                ? `${bulkDownloadProgress.failedCount} need review`
                                : "Queue complete")}
                          </p>
                        </div>
                      ) : null}
                      {bulkDownloadMessage ? (
                        <p className={bulkDownloadMessageClass}>
                          {bulkDownloadMessage}
                        </p>
                      ) : null}
                      {failedBulkDownloadItems.length ? (
                        <div className="provider-failed-list" role="status">
                          <div className="download-progress-meta">
                            <span>Needs Review</span>
                            <span>
                              {numberFormatter.format(
                                failedBulkDownloadItems.length
                              )}{" "}
                              failed
                            </span>
                          </div>
                          <div className="provider-preview-list">
                            {visibleFailedBulkDownloadItems.map((item) => (
                              <div
                                className="provider-preview-item failed"
                                key={`${item.track.position}-${item.track.id ?? item.track.name}`}
                              >
                                <span>
                                  {item.track.position}. {item.track.name}
                                </span>
                                <strong>
                                  {providerDisplayName(item.providerId)} -{" "}
                                  {item.candidateTitle ?? item.sourceUrl}
                                </strong>
                                <span>{item.error ?? "Provider download failed."}</span>
                                <a
                                  href={item.sourceUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Review source
                                </a>
                              </div>
                            ))}
                            {failedBulkDownloadItems.length >
                            visibleFailedBulkDownloadItems.length ? (
                              <div className="provider-preview-item failed">
                                <span>
                                  {numberFormatter.format(
                                    failedBulkDownloadItems.length -
                                      visibleFailedBulkDownloadItems.length
                                  )}{" "}
                                  more failed tracks
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </div>
              ) : null}

              {isLoadingTracks ? (
                <div className="loading-state">
                  <Loader2 className="spin" size={28} />
                  <span>Loading tracks</span>
                </div>
              ) : activeSource ? (
                <>
                  <div className="section-heading track-table-heading">
                    <span className="stat-label">Track backup status</span>
                    <p>
                      Every Spotify track in the selected source, with its current
                      Navidrome match status.
                    </p>
                  </div>
                  <div className="track-table">
                    <div className="track-row track-head">
                      <span>#</span>
                      <span>Track</span>
                      <span className="track-cell">Album</span>
                      <span className="track-cell">Backup</span>
                      <span className="track-cell">Time</span>
                    </div>
                    {tracks.map((track) => {
                      const libraryMatch = libraryMatchesByPosition.get(
                        track.position
                      );

                      return (
                        <div
                          className="track-row"
                          key={`${track.position}-${track.id}`}
                        >
                          <span className="track-cell">{track.position}</span>
                          <span className="track-meta">
                            <span className="track-title">{track.name}</span>
                            <span className="track-subtitle">
                              {track.artists.join(", ") || "Unknown artist"}
                            </span>
                          </span>
                          <span className="track-cell">
                            {track.album || "Unknown"}
                          </span>
                          <span className="track-cell library-cell">
                            {renderLibraryMatch(
                              libraryMatch,
                              libraryIndex,
                              {
                                isOrganizing:
                                  organizingTrackPositionSet.has(track.position),
                                onOrganize: () =>
                                  void organizeLibraryMatches([track.position]),
                                onSearchMissing: () =>
                                  void openMissingBackupActions(track),
                                organizeDisabled: isAnyOrganizationRunning,
                                searchDisabled:
                                  isSearchingProvider ||
                                  isDownloadingProvider ||
                                  isDownloadingBulkProvider ||
                                  isPreviewingBulkProvider
                              }
                            )}
                          </span>
                          <span className="track-cell">
                            {formatDuration(track.durationMs)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <ListMusic size={30} />
                  <span>No {sourceKindLabel(sourceKind).toLowerCase()} selected</span>
                </div>
              )}
            </div>
          </section>

          <aside className="panel ops-panel">
            <div className="panel-header">
              <div className="panel-title">
                <HardDrive size={20} />
                <div>
                  <h2>Backup Sources</h2>
                  <p className="muted">Spotify to Navidrome backup path</p>
                </div>
              </div>
            </div>
            <div className="ops-body">
              <div className="provider-row">
                <span className="provider-icon green">
                  <CheckCircle2 size={18} />
                </span>
                <span>
                  <h3>Spotify metadata</h3>
                  <p>Reads playlists, albums, songs, and export manifests</p>
                </span>
              </div>
              <div className="provider-row">
                <span
                  className={`provider-icon ${
                    navidromeReady ? "green" : "amber"
                  }`}
                >
                  {navidromeReady ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <HardDrive size={18} />
                  )}
                </span>
                <span>
                  <h3>Navidrome library</h3>
                  <p>{navidromeStatusLabel}</p>
                </span>
              </div>
              {navidromeServerStatusLabel ? (
                <div className="provider-row">
                  <span
                    className={`provider-icon ${
                      navidromeStatus?.server.state === "ready" ||
                      navidromeStatus?.server.state === "scan_requested"
                        ? "green"
                        : navidromeStatus?.server.state === "not_configured"
                          ? "teal"
                          : "amber"
                    }`}
                  >
                    {navidromeStatus?.server.state === "ready" ||
                    navidromeStatus?.server.state === "scan_requested" ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <HardDrive size={18} />
                    )}
                  </span>
                  <span>
                    <h3>Navidrome server</h3>
                    <p>{navidromeServerStatusLabel}</p>
                  </span>
                </div>
              ) : null}
              <div className="provider-row with-action index-row">
                <span
                  className={`provider-icon ${
                    libraryIndex?.trackCount ? "green" : "teal"
                  }`}
                >
                  <HardDrive size={18} />
                </span>
                <span className="provider-content">
                  <h3>Library index</h3>
                  <p>{libraryIndexLabel}</p>
                  {libraryIndexScanLabel ? <p>{libraryIndexScanLabel}</p> : null}
                  {libraryIndex?.navidromeScan ? (
                    <p>{libraryIndex.navidromeScan.message}</p>
                  ) : null}
                  {libraryIndex?.skippedExamples?.length ? (
                    <p>
                      Skipped first:{" "}
                      {libraryIndex.skippedExamples
                        .map((skip) => `${skip.relativePath} (${skip.reason})`)
                        .join("; ")}
                    </p>
                  ) : null}
                  <button
                    className="icon-command index-command"
                    disabled={!navidromeReady || isScanningLibrary}
                    onClick={() => void scanNavidromeLibrary()}
                    title="Run Library Index"
                    type="button"
                  >
                    <RefreshCw
                      className={isScanningLibrary ? "spin" : undefined}
                      size={18}
                    />
                    Run Index
                  </button>
                </span>
              </div>
              <div className="provider-warning">
                <span className="provider-icon amber">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <h3>External media providers</h3>
                  <p>
                    No provider account connection is needed here. SpotifyBU
                    searches YouTube first, then JioSaavn; you review the match
                    before downloading. Bulk jobs can trigger provider blocking.
                  </p>
                </span>
              </div>
              <div className="provider-list">
                {mediaSourceProviders.map((provider) => (
                  <div
                    className="provider-row provider-row-stacked"
                    key={provider.id}
                  >
                    <span
                      className={`provider-icon ${providerStatusTone(
                        provider.status
                      )}`}
                    >
                      {provider.status === "planned" ? (
                        <Clock3 size={18} />
                      ) : provider.status === "active" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                    </span>
                    <span>
                      <span className="provider-heading">
                        <h3>{provider.name}</h3>
                        <span className="provider-badges">
                          <span className={`provider-badge ${provider.status}`}>
                            {providerStatusLabel(provider.status)}
                          </span>
                          <span
                            className={`provider-badge risk-${provider.risk}`}
                          >
                            {providerRiskLabel(provider.risk)}
                          </span>
                        </span>
                      </span>
                      <p>{provider.description}</p>
                      <p className="provider-note">{provider.bulkWarning}</p>
                    </span>
                  </div>
                ))}
              </div>
              {navidromeStatus?.libraryPath ? (
                <div className="path-readout">
                  <span className="stat-label">Music folder</span>
                  <span>{navidromeStatus.libraryPath}</span>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      ) : (
        <section className="connect-grid">
          <div className="panel connect-panel">
            <p className="eyebrow">Connection</p>
            <h2>Connect Spotify</h2>
            <p className="muted">
              Start by loading the Spotify library you want to preserve locally.
            </p>
            {spotifyAuthConfig?.redirectUri ? (
              <div className="path-readout">
                <span className="stat-label">Spotify redirect URI</span>
                <span>{spotifyAuthConfig.redirectUri}</span>
              </div>
            ) : null}
            {spotifyAuthConfig?.redirectUriWarning ? (
              <div className="alert inline">
                <ShieldCheck size={18} />
                <span>{spotifyAuthConfig.redirectUriWarning}</span>
              </div>
            ) : null}
            <div className="connect-actions">
              <a
                className={`command green ${
                  session?.spotifyClientConfigured === false ? "disabled" : ""
                }`}
                aria-disabled={session?.spotifyClientConfigured === false}
                href="/api/auth/login"
                tabIndex={session?.spotifyClientConfigured === false ? -1 : undefined}
                title="Connect Spotify"
              >
                <LogIn size={18} />
                Connect Spotify
              </a>
              <button
                className="icon-command"
                onClick={() => void loadSession()}
                title="Refresh session"
                type="button"
              >
                <RefreshCw size={18} />
                Refresh
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <ShieldCheck size={20} />
                <div>
                <h2>Backup Pipeline</h2>
                <p className="muted">Spotify source to Navidrome-ready files</p>
                </div>
              </div>
            </div>
            <div className="signal-grid">
              <div className="signal ready">
                <h3>Spotify source</h3>
                <p className="muted">Playlists, songs, albums, and metadata exports</p>
              </div>
              <div className="signal locked">
                <h3>Local backup target</h3>
                <p className="muted">{navidromeStatusLabel}</p>
              </div>
              <div className="signal waiting">
                <h3>Missing track sourcing</h3>
                <p className="muted">YouTube first, then JioSaavn</p>
              </div>
            </div>
          </div>
        </section>
      )}
      <footer className="app-footer">
        <span>SpotifyBU</span>
        <span>v{appInfo?.version ?? "..."}</span>
        <span>{appInfo?.branch ?? "..."} branch</span>
      </footer>
    </main>
  );
}

function redirectToLogin() {
  const nextPath = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams();

  if (nextPath && nextPath !== "/" && !nextPath.startsWith("//")) {
    params.set("next", nextPath);
  }

  window.location.href = params.size ? `/login?${params}` : "/login";
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store"
  });

  return responseJson<T>(response);
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  return responseJson<T>(response);
}

async function postProviderBulkPreviewStream(
  body: unknown,
  onProgress: (event: ProviderBulkPreviewProgressEvent) => void
): Promise<ProviderBulkCandidatePreview> {
  const response = await fetch("/api/providers/download/bulk/preview", {
    body: JSON.stringify({
      ...(isRecord(body) ? body : {}),
      stream: true
    }),
    cache: "no-store",
    headers: {
      Accept: "application/x-ndjson",
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    await responseJson<never>(response);
    throw new Error("Provider preview request failed.");
  }

  if (!response.body) {
    throw new Error("Provider preview did not return progress updates.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingText = "";
  const streamState: {
    preview: ProviderBulkCandidatePreview | null;
  } = {
    preview: null
  };

  const handleLine = (line: string) => {
    const event = parseProviderBulkPreviewStreamEvent(line);

    if (event.type === "progress") {
      onProgress(event);
      return;
    }

    if (event.type === "complete") {
      streamState.preview = event.preview;
      return;
    }

    throw new Error(event.error || "SpotifyBU could not preview candidates.");
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    pendingText += decoder.decode(value, {
      stream: true
    });
    pendingText = consumeProviderBulkPreviewLines(pendingText, handleLine);
  }

  pendingText += decoder.decode();
  consumeProviderBulkPreviewLines(pendingText, handleLine, true);

  if (!streamState.preview) {
    throw new Error("Provider preview finished without candidate results.");
  }

  return streamState.preview;
}

function consumeProviderBulkPreviewLines(
  pendingText: string,
  handleLine: (line: string) => void,
  consumeRemainder = false
) {
  let lineBreakIndex = pendingText.indexOf("\n");

  while (lineBreakIndex !== -1) {
    const line = pendingText.slice(0, lineBreakIndex).trim();

    if (line) {
      handleLine(line);
    }

    pendingText = pendingText.slice(lineBreakIndex + 1);
    lineBreakIndex = pendingText.indexOf("\n");
  }

  if (consumeRemainder) {
    const line = pendingText.trim();

    if (line) {
      handleLine(line);
    }

    return "";
  }

  return pendingText;
}

function parseProviderBulkPreviewStreamEvent(
  line: string
): ProviderBulkPreviewStreamEvent {
  const parsed = JSON.parse(line) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Provider preview returned an invalid progress update.");
  }

  if (parsed.type === "progress") {
    return {
      completedCount: numericStreamValue(parsed.completedCount),
      failedCount: numericStreamValue(parsed.failedCount),
      totalCount: numericStreamValue(parsed.totalCount),
      trackLabel:
        typeof parsed.trackLabel === "string" ? parsed.trackLabel : undefined,
      type: "progress"
    };
  }

  if (parsed.type === "complete" && isRecord(parsed.preview)) {
    return {
      preview: parsed.preview as unknown as ProviderBulkCandidatePreview,
      type: "complete"
    };
  }

  if (parsed.type === "error") {
    return {
      error:
        typeof parsed.error === "string"
          ? parsed.error
          : "SpotifyBU could not preview candidates.",
      type: "error"
    };
  }

  throw new Error("Provider preview returned an unknown progress update.");
}

function numericStreamValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function waitForProviderDownload(
  response: ProviderDownloadResponse,
  onStatus?: (job: ProviderDownloadJob) => void
) {
  if (response.download) {
    return response.download;
  }

  const initialJob = response.job;

  if (!initialJob) {
    throw new Error("Provider download did not return a job.");
  }

  let job: ProviderDownloadJob = initialJob;

  onStatus?.(job);

  for (let attempt = 0; attempt < maxProviderDownloadPollAttempts; attempt += 1) {
    if (job.status === "completed") {
      if (job.download) {
        return job.download;
      }

      throw new Error("Provider download completed without file details.");
    }

    if (job.status === "failed") {
      throw new Error(providerDownloadFailureMessage(job));
    }

    await wait(providerDownloadPollIntervalMs);

    const statusResponse = await fetchJson<ProviderDownloadResponse>(
      `/api/providers/download/status/${encodeURIComponent(job.id)}`
    );

    if (statusResponse.download) {
      return statusResponse.download;
    }

    if (!statusResponse.job) {
      throw new Error("Provider download status response was incomplete.");
    }

    job = statusResponse.job;
    onStatus?.(job);
  }

  throw new Error(
    `Provider download is still running. Diagnostic ID: ${job.diagnosticId}.`
  );
}

function providerDownloadJobLabel(job: ProviderDownloadJob) {
  const trackLabel = job.request.trackPosition
    ? `${job.request.trackPosition}. ${job.request.trackName}`
    : job.request.trackName || providerDisplayName(job.request.providerId);

  return `${providerDownloadJobStatusLabel(job.status)} - ${trackLabel}. Diagnostic ID: ${job.diagnosticId}`;
}

function providerDownloadJobStatusLabel(status: ProviderDownloadJobStatus) {
  if (status === "completed") {
    return "Finalizing";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "queued") {
    return "Queued";
  }

  return "Downloading";
}

function providerDownloadFailureMessage(job: ProviderDownloadJob) {
  return [
    job.error || "Provider download failed.",
    job.diagnosticId ? `Diagnostic ID: ${job.diagnosticId}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

type ResponseBody = Record<string, unknown>;

async function responseJson<T>(response: Response) {
  const rawText = await response.text().catch(() => "");
  const responseBody = parseResponseBody(rawText);

  if (!response.ok) {
    throw new Error(responseErrorMessage(response, responseBody, rawText));
  }

  return responseBody as T;
}

function parseResponseBody(rawText: string): ResponseBody {
  if (!rawText.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ResponseBody)
      : {};
  } catch {
    return {};
  }
}

function responseErrorMessage(
  response: Response,
  responseBody: ResponseBody,
  rawText: string
) {
  const bodyError =
    typeof responseBody.error === "string" ? responseBody.error.trim() : "";
  const diagnosticId =
    typeof responseBody.diagnosticId === "string"
      ? responseBody.diagnosticId.trim()
      : "";
  const statusLabel = `HTTP ${response.status}${
    response.statusText ? ` ${response.statusText}` : ""
  }`;
  const fallbackBody = bodyError ? "" : truncateResponseText(rawText);

  return [
    bodyError || "Request failed.",
    `(${statusLabel})`,
    fallbackBody ? `Response: ${fallbackBody}` : "",
    diagnosticId && !bodyError.includes(diagnosticId)
      ? `Diagnostic ID: ${diagnosticId}.`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function isGatewayTimeoutError(error: unknown) {
  const message = errorMessage(error);

  return message.includes("(HTTP 504") || message.includes("Gateway Time-out");
}

function truncateResponseText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 280
    ? `${normalized.slice(0, 277)}...`
    : normalized;
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function relativeDirectoryFromPath(value: string) {
  const segments = value.split("/").filter(Boolean);

  return segments.length > 1 ? segments.slice(0, -1).join("/") : "";
}

function fileNameFromPath(value: string) {
  return value.split("/").filter(Boolean).at(-1) ?? "Downloaded track";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function parseNavidromePlaylistSyncMode(
  value: string
): NavidromePlaylistSyncMode {
  if (value === "append" || value === "fullsync") {
    return value;
  }

  return "replace";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function canReadPlaylistTracks(
  playlist: PlaylistSummary,
  currentUserId?: string
) {
  return (
    !currentUserId ||
    playlist.ownerId === currentUserId ||
    playlist.collaborative
  );
}

function getPlaylistBackupStatus(
  tracks: BackupTrack[],
  libraryMatches: LibraryMatch[]
): PlaylistBackupStatus {
  const matchesByPosition = new Map(
    libraryMatches.map((match) => [match.trackPosition, match] as const)
  );
  const missingTrackCount = tracks.filter(
    (track) => !matchesByPosition.get(track.position)?.exists
  ).length;

  return {
    backedUp: tracks.length > 0 && missingTrackCount === 0,
    missingTrackCount,
    trackCount: tracks.length
  };
}

function getPlaylistMissingBackupTrackCount(
  playlist: PlaylistSummary,
  backupStatus: PlaylistBackupStatus | undefined,
  metadataBackup: PlaylistMetadataBackup | undefined
) {
  if (backupStatus) {
    return (
      backupStatus.missingTrackCount +
      Math.max(0, playlist.tracksTotal - backupStatus.trackCount)
    );
  }

  if (!metadataBackup) {
    return 0;
  }

  return Math.max(0, playlist.tracksTotal - metadataBackup.trackCount);
}

function playlistMissingBackupTitle(missingTrackCount: number) {
  const trackLabel = missingTrackCount === 1 ? "track is" : "tracks are";

  return `${numberFormatter.format(missingTrackCount)} ${trackLabel} not backed up`;
}

function renderLibraryMatch(
  match: LibraryMatch | undefined,
  libraryIndex: NavidromeLibraryIndexSummary | null,
  options: {
    isOrganizing?: boolean;
    onOrganize?: () => void;
    onSearchMissing?: () => void;
    organizeDisabled?: boolean;
    searchDisabled?: boolean;
  } = {}
) {
  if (!libraryIndex) {
    return <span className="track-status unindexed">No index</span>;
  }

  if (libraryIndex.stale) {
    return (
      <span
        className="track-status stale"
        title="Run Library Index to refresh organization status"
      >
        Index needed
      </span>
    );
  }

  if (!match || !match.exists) {
    if (options.onSearchMissing) {
      return (
        <button
          className="track-status missing actionable"
          disabled={options.searchDisabled}
          onClick={options.onSearchMissing}
          title="Search providers for this track"
          type="button"
        >
          Not backed up
        </button>
      );
    }

    return <span className="track-status missing">Not backed up</span>;
  }

  if (match.needsMove) {
    return (
      <span className="track-status-stack">
        <button
          className="track-status move actionable"
          disabled={options.organizeDisabled}
          onClick={options.onOrganize}
          title={`Orginize into ${
            match.recommendedRelativePath ?? match.expectedFolder
          }`}
          type="button"
        >
          {options.isOrganizing ? (
            <Loader2 className="spin" size={13} />
          ) : (
            <RotateCcw size={13} />
          )}
          {options.isOrganizing ? "Orginizing" : "Orginize"}
        </button>
        <span className="track-note">
          Move to {match.recommendedRelativePath ?? match.expectedFolder}
        </span>
      </span>
    );
  }

  return (
    <span className="track-status-stack">
      <span className="track-status exists">Orginized</span>
      <span className="track-note">
        {match.matchedTrack?.relativePath ?? match.matchedBy ?? "Indexed"}
      </span>
    </span>
  );
}

function formatShortDate(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(parsedDate);
}

function navidromeStatusMessage(status: NavidromeLibraryStatus) {
  if (status.state === "ready") {
    return "Ready for Navidrome library staging";
  }

  if (status.state === "not_configured") {
    return "Set NAVIDROME_LIBRARY_PATH";
  }

  if (status.state === "not_writable") {
    return "Needs write access";
  }

  if (status.state === "not_readable") {
    return "Needs read access";
  }

  if (status.state === "missing") {
    return "Music folder not found";
  }

  return status.message;
}

function sourceKindLabel(sourceKind: SourceKind) {
  if (sourceKind === "album") {
    return "Album";
  }

  if (sourceKind === "track") {
    return "Song";
  }

  if (sourceKind === "track-list") {
    return "Track list";
  }

  return "User playlist";
}

function providerStatusTone(status: ProviderStatus) {
  if (status === "active") {
    return "green";
  }

  if (status === "planned") {
    return "teal";
  }

  return "amber";
}

function providerStatusLabel(status: ProviderStatus) {
  if (status === "active") {
    return "Active";
  }

  if (status === "planned") {
    return "Planned";
  }

  return "User-confirmed";
}

function renderFolderPlanStatusIcon(status: FolderPlanDisplayStatus) {
  if (status === "ready") {
    return <CheckCircle2 size={14} />;
  }

  if (status === "organize") {
    return <RotateCcw size={14} />;
  }

  if (status === "scan") {
    return <Clock3 size={14} />;
  }

  return <Download size={14} />;
}

function summarizeFolderPlans(
  folderPlans: FolderPlan[],
  tracks: BackupTrack[],
  libraryMatchesByPosition: Map<number, LibraryMatch>,
  hasUsableLibraryIndex: boolean
) {
  const tracksByAlbumKey = new Map<string, BackupTrack[]>();

  for (const track of tracks) {
    const key = folderPlanAlbumKey(track);
    const albumTracks = tracksByAlbumKey.get(key) ?? [];

    albumTracks.push(track);
    tracksByAlbumKey.set(key, albumTracks);
  }

  return folderPlans.map((plan) => {
    const albumTracks = tracksByAlbumKey.get(plan.key) ?? [];
    const planTrackCount = albumTracks.length || plan.trackCount;
    const matchedTracks = albumTracks
      .map((track) => libraryMatchesByPosition.get(track.position))
      .filter((match): match is LibraryMatch => Boolean(match?.exists));
    const backedUpCount = hasUsableLibraryIndex ? matchedTracks.length : 0;
    const organizeCount = hasUsableLibraryIndex
      ? matchedTracks.filter((match) => match.needsMove).length
      : 0;
    const organizeTrackPositions = hasUsableLibraryIndex
      ? matchedTracks
          .filter((match) => match.needsMove)
          .map((match) => match.trackPosition)
      : [];
    const missingCount = hasUsableLibraryIndex
      ? Math.max(0, planTrackCount - backedUpCount)
      : 0;
    const { status, statusLabel } = folderPlanStatus(
      plan,
      backedUpCount,
      missingCount,
      organizeCount,
      hasUsableLibraryIndex
    );

    return {
      ...plan,
      backedUpCount,
      countLabel: folderPlanCountLabel(
        planTrackCount,
        backedUpCount,
        missingCount,
        organizeCount,
        hasUsableLibraryIndex
      ),
      missingCount,
      organizeCount,
      organizeTrackPositions,
      status,
      statusLabel
    } satisfies FolderPlanSummary;
  });
}

function folderPlanStatus(
  plan: FolderPlan,
  backedUpCount: number,
  missingCount: number,
  organizeCount: number,
  hasUsableLibraryIndex: boolean
): {
  status: FolderPlanDisplayStatus;
  statusLabel: string;
} {
  if (!hasUsableLibraryIndex) {
    return {
      status: "scan",
      statusLabel: "Index needed"
    };
  }

  if (organizeCount) {
    return {
      status: "organize",
      statusLabel: "Orginize"
    };
  }

  if (backedUpCount && missingCount) {
    return {
      status: "partial",
      statusLabel: "Partly backed up"
    };
  }

  if (backedUpCount) {
    return {
      status: "ready",
      statusLabel: "Orginized"
    };
  }

  if (plan.logged) {
    return {
      status: "folder-ready",
      statusLabel: "Folder ready"
    };
  }

  return {
    status: "download",
    statusLabel: "Download target"
  };
}

function folderPlanCountLabel(
  trackCount: number,
  backedUpCount: number,
  missingCount: number,
  organizeCount: number,
  hasUsableLibraryIndex: boolean
) {
  if (!hasUsableLibraryIndex) {
    return trackCountLabel(trackCount);
  }

  const parts: string[] = [];

  if (backedUpCount) {
    parts.push(`${numberFormatter.format(backedUpCount)} backed up`);
  }

  if (organizeCount) {
    parts.push(`${numberFormatter.format(organizeCount)} to organize`);
  }

  if (missingCount) {
    parts.push(`${numberFormatter.format(missingCount)} missing`);
  }

  return parts.length ? parts.join(", ") : trackCountLabel(trackCount);
}

function trackCountLabel(trackCount: number) {
  return `${numberFormatter.format(trackCount)} ${
    trackCount === 1 ? "track" : "tracks"
  }`;
}

function folderPlanAlbumKey(track: BackupTrack) {
  if (track.albumId) {
    return `spotify:album:${track.albumId}`;
  }

  return `spotify:album-name:${stableFolderSlug(
    `${track.albumArtist || "Unknown Artist"}-${track.album || "Unknown Album"}`
  )}`;
}

function stableFolderSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function providerRiskLabel(risk: ProviderRiskLevel) {
  if (risk === "low") {
    return "Low risk";
  }

  if (risk === "medium") {
    return "Medium risk";
  }

  return "High risk";
}

function providerDisplayName(providerId: string) {
  return (
    SOURCE_PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.name ??
    providerId
  );
}

function buildBulkDownloadItems(preview: ProviderBulkCandidatePreview | null) {
  return (preview?.items ?? [])
    .filter((item) => item.candidate?.url)
    .map((item) => ({
      candidateScore: item.candidate?.score.overall,
      candidateTitle: item.candidate?.title,
      fallbackSources: buildProviderFallbackSources(
        item.candidates,
        item.candidate?.url
      ),
      providerId: item.candidate?.providerId ?? "",
      selectedReason: `SpotifyBU dry-run bulk preview selected ${
        item.candidate?.title ?? "provider candidate"
      } (${item.candidate?.score.overall ?? 0}% match)`,
      sourceUrl: item.candidate?.url ?? "",
      track: item.track
    }));
}

function buildProviderFallbackSources(
  candidates: ProviderSearchCandidate[],
  selectedSourceUrl?: string
) {
  const selectedSourceKey = selectedSourceUrl
    ? providerSourceKey(selectedSourceUrl)
    : "";
  const seenSources = new Set<string>(selectedSourceKey ? [selectedSourceKey] : []);
  const fallbackSources: ProviderDownloadFallbackSource[] = [];

  for (const candidate of candidates) {
    if (!candidate.url) {
      continue;
    }

    const sourceKey = providerSourceKey(candidate.url);

    if (seenSources.has(sourceKey)) {
      continue;
    }

    seenSources.add(sourceKey);
    fallbackSources.push({
      candidateScore: candidate.score.overall,
      candidateTitle: candidate.title,
      providerId: candidate.providerId,
      selectedReason: `SpotifyBU automatically retried fallback provider candidate ${candidate.title} (${candidate.score.overall}% match)`,
      sourceUrl: candidate.url
    });
  }

  return fallbackSources.slice(0, 5);
}

function providerSourceKey(sourceUrl: string) {
  return sourceUrl.trim().toLowerCase();
}

function providerBulkJobProgress(
  job: ProviderBulkDownloadJob
): BulkDownloadProgress {
  const activeItem =
    job.items.find((item) => item.status === "downloading") ??
    job.items.find((item) => item.status === "pending");
  const statusLabel = providerBulkJobStatusLabel(job.status);

  return {
    completedCount: job.completedCount,
    failedCount: job.failedCount,
    phase: statusLabel,
    totalCount: job.totalCount,
    trackLabel: activeItem
      ? `${activeItem.track.position}. ${activeItem.track.name}`
      : job.failedCount
        ? `${job.failedCount} need review`
        : undefined
  };
}

function providerBulkJobStatusLabel(status: ProviderBulkDownloadJobStatus) {
  if (status === "cancelled") {
    return "Cancelled";
  }

  if (status === "cancelling") {
    return "Cancelling";
  }

  if (status === "completed") {
    return "Complete";
  }

  if (status === "failed") {
    return "Needs review";
  }

  if (status === "queued") {
    return "Queued";
  }

  return "Running";
}

function providerBulkJobResultMessage(job: ProviderBulkDownloadJob) {
  const cancelledCount = job.items.filter(
    (item) => item.status === "cancelled"
  ).length;
  const firstFailedItem = job.items.find((item) => item.status === "failed");

  if (job.status === "cancelled") {
    return `Bulk job cancelled after ${numberFormatter.format(
      job.completedCount
    )} of ${numberFormatter.format(job.totalCount)} tracks${
      cancelledCount
        ? `; ${numberFormatter.format(cancelledCount)} were left unfinished`
        : ""
    }.`;
  }

  return `Backed up ${numberFormatter.format(
    job.completedCount
  )} of ${numberFormatter.format(job.totalCount)} previewed tracks${
    job.failedCount
      ? `; ${numberFormatter.format(job.failedCount)} need review${
          firstFailedItem?.error ? ` (${firstFailedItem.error})` : ""
        }`
      : ""
  }.`;
}

function isProviderBulkJobActive(job: ProviderBulkDownloadJob) {
  return (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "cancelling"
  );
}

function isProviderBulkJobTerminal(job: ProviderBulkDownloadJob) {
  return (
    job.status === "cancelled" ||
    job.status === "completed" ||
    job.status === "failed"
  );
}

function bulkPreviewCandidateLabel(item: ProviderBulkCandidatePreviewItem) {
  if (!item.candidate?.url) {
    return item.errors[0]
      ? `${providerDisplayName(item.errors[0].providerId)}: ${item.errors[0].error}`
      : "No candidate found";
  }

  return `${providerDisplayName(item.candidate.providerId)} - ${
    item.candidate.title
  } (${item.candidate.score.overall}%)`;
}

function providerSourceFromUrl(sourceUrl: string) {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be"
  ) {
    return {
      providerId: "youtube",
      sourceUrl
    };
  }

  if (
    hostname === "jiosaavn.com" ||
    hostname === "www.jiosaavn.com" ||
    hostname === "saavn.com" ||
    hostname === "www.saavn.com"
  ) {
    return {
      providerId: "jiosaavn",
      sourceUrl
    };
  }

  return null;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
