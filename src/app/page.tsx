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
  ListMusic,
  Loader2,
  LogIn,
  LogOut,
  Music2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck
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

type SourceKind = "album" | "playlist" | "track";

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
  public: boolean | null;
  tracksTotal: number;
};

type PlaylistBackupStatus = {
  backedUp: boolean;
  trackCount: number;
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
  playlists: PlaylistSummary[];
};

type TracksResponse = {
  folderPlans: FolderPlan[];
  libraryMatches: LibraryMatch[];
  playlist: PlaylistSummary;
  tracks: BackupTrack[];
};

type ResolveResponse = {
  folderPlans: FolderPlan[];
  libraryMatches: LibraryMatch[];
  source: ResolvedSource;
  tracks: BackupTrack[];
  type: "album" | "track";
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
};

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

type ProviderDownloadJobStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running";

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
const providerDownloadPollIntervalMs = 2500;
const maxProviderDownloadPollAttempts = 720;
const mediaSourceProviders: readonly SourceProviderCatalogEntry[] =
  SOURCE_PROVIDER_CATALOG.filter(
    (provider) => downloadEnabledProviderIds.has(provider.id)
  );

export default function Home() {
  const missingBackupActionsRef = useRef<HTMLDivElement | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [spotifyAuthConfig, setSpotifyAuthConfig] =
    useState<SpotifyAuthConfigResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [playlistBackupStatuses, setPlaylistBackupStatuses] = useState<
    Record<string, PlaylistBackupStatus>
  >({});
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(
    null
  );
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
  const [libraryOrganizeProgress, setLibraryOrganizeProgress] =
    useState<string | null>(null);
  const [isCreatingNavidromePlaylist, setIsCreatingNavidromePlaylist] =
    useState(false);
  const [isSearchingProvider, setIsSearchingProvider] = useState(false);
  const [isDownloadingProvider, setIsDownloadingProvider] = useState(false);
  const [isDownloadingBulkProvider, setIsDownloadingBulkProvider] =
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
  const [downloadRightsConfirmed, setDownloadRightsConfirmed] = useState(false);
  const [downloadBulkRiskAccepted, setDownloadBulkRiskAccepted] = useState(false);
  const [providerDownloadMessage, setProviderDownloadMessage] =
    useState<string | null>(null);
  const [providerDownloadStatusLabel, setProviderDownloadStatusLabel] =
    useState<string | null>(null);
  const [bulkDownloadMessage, setBulkDownloadMessage] = useState<string | null>(
    null
  );
  const [bulkDownloadProgress, setBulkDownloadProgress] =
    useState<BulkDownloadProgress | null>(null);
  const [libraryOrganizeMessage, setLibraryOrganizeMessage] =
    useState<string | null>(null);
  const [navidromePlaylistMessage, setNavidromePlaylistMessage] =
    useState<string | null>(null);

  const clearBackupWorkflowState = useCallback(() => {
    setBulkDownloadMessage(null);
    setBulkDownloadProgress(null);
    setProviderDownloadMessage(null);
    setProviderDownloadStatusLabel(null);
    setProviderCandidates([]);
    setSelectedProviderCandidateId("");
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
      setPlaylists(response.playlists);
      setSelectedPlaylistId((current) => current ?? response.playlists[0]?.id ?? null);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, []);

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
      setLibraryMatches([]);
      return;
    }

    const response = await postJson<LibraryMatchesResponse>(
      "/api/navidrome/library/matches",
      {
        tracks: nextTracks
      }
    );

    setLibraryMatches(response.libraryMatches);
  }, [tracks]);

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
      setRequestError(errorMessage(error));
    } finally {
      if (!scanStarted) {
        setIsScanningLibrary(false);
      }
    }
  }, [applyLibraryIndexResponse, refreshLibraryMatches]);

  const organizeLibraryMatches = useCallback(async () => {
    if (!tracks.length) {
      return;
    }

    setIsOrganizingLibrary(true);
    setLibraryOrganizeMessage(null);
    setLibraryOrganizeProgress(null);
    setRequestError(null);

    try {
      const attemptedTrackPositions = new Set<number>();
      let latestLibraryMatches = libraryMatches;
      let totalMovedCount = 0;
      let totalSkippedCount = 0;
      const initialMoveCount = latestLibraryMatches.filter(
        (match) => match.needsMove
      ).length;

      while (true) {
        const batchTrackPositions = latestLibraryMatches
          .filter(
            (match) =>
              match.needsMove && !attemptedTrackPositions.has(match.trackPosition)
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
        setLibraryMatches(response.libraryMatches);
      }

      if (totalMovedCount || totalSkippedCount) {
        setLibraryOrganizeMessage(
          `Organized ${numberFormatter.format(totalMovedCount)} files${
            totalSkippedCount
              ? `; ${numberFormatter.format(totalSkippedCount)} could not be moved`
              : ""
          }.`
        );
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsOrganizingLibrary(false);
      setLibraryOrganizeProgress(null);
    }
  }, [libraryMatches, tracks]);

  const createNavidromePlaylist = useCallback(async () => {
    if (!selectedPlaylistId) {
      return;
    }

    setIsCreatingNavidromePlaylist(true);
    setNavidromePlaylistMessage(null);
    setRequestError(null);

    try {
      const response = await postJson<NavidromePlaylistSyncResponse>(
        `/api/spotify/playlists/${selectedPlaylistId}/navidrome`,
        {}
      );
      const result = response.navidromePlaylist;
      const action = result.updated ? "Updated" : "Created";
      const skipped = result.skippedCount
        ? ` ${numberFormatter.format(result.skippedCount)} unmatched tracks were skipped.`
        : "";

      setNavidromePlaylistMessage(
        `${action} Navidrome playlist "${result.name}" with ${numberFormatter.format(
          result.songCount
        )} tracks.${skipped}`
      );
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsCreatingNavidromePlaylist(false);
    }
  }, [selectedPlaylistId]);

  const searchProviderTrack = useCallback(async (track: BackupTrack) => {
    setDownloadTrackPosition(String(track.position));
    setIsSearchingProvider(true);
    setProviderCandidates([]);
    setSelectedProviderCandidateId("");
    setProviderDownloadMessage(null);
    setProviderDownloadStatusLabel(null);
    setRequestError(null);

    try {
      const response = await postJson<ProviderSearchResponse>(
        "/api/providers/search",
        {
          limit: 4,
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

  const downloadSelectedProviderCandidate = useCallback(async () => {
    const selectedTrack = tracks.find(
      (track) => String(track.position) === downloadTrackPosition
    );
    const selectedCandidate = providerCandidates.find(
      (candidate) => candidate.id === selectedProviderCandidateId
    );

    if (!selectedTrack || !selectedCandidate?.url) {
      setRequestError("Choose a provider search result before downloading.");
      return;
    }

    setIsDownloadingProvider(true);
    setProviderDownloadMessage(null);
    setProviderDownloadStatusLabel("Starting download job");
    setRequestError(null);

    try {
      const response = await postJson<ProviderDownloadResponse>(
        "/api/providers/download",
        {
          bulkRiskAccepted: downloadBulkRiskAccepted,
          providerId: selectedCandidate.providerId,
          quality: downloadQuality,
          rightsConfirmed: downloadRightsConfirmed,
          selectedReason: `User reviewed SpotifyBU provider search result (${selectedCandidate.title})`,
          sourceUrl: selectedCandidate.url,
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
      setProviderDownloadStatusLabel(null);
      setProviderCandidates([]);
      setSelectedProviderCandidateId("");

      try {
        await refreshLibraryMatches();
      } catch (error) {
        setProviderDownloadMessage(
          `${downloadMessage}. SpotifyBU could not refresh the match table automatically (${errorMessage(
            error
          )}). The file is already in the library folder; run Scan library after the server settles.`
        );
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsDownloadingProvider(false);
      setProviderDownloadStatusLabel(null);
    }
  }, [
    downloadBulkRiskAccepted,
    downloadQuality,
    downloadRightsConfirmed,
    downloadTrackPosition,
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
    setResolvedSource(null);
    setTracks([]);
    setFolderPlans([]);
    setShowAllFolderPlans(false);
    setLibraryMatches([]);
    setSelectedPlaylist(null);
  }, [clearBackupWorkflowState]);

  const selectPlaylist = useCallback(
    (playlistId: string) => {
      if (playlistId !== selectedPlaylistId) {
        setLibraryOrganizeMessage(null);
        setNavidromePlaylistMessage(null);
        clearBackupWorkflowState();
        setRequestError(null);
        setSelectedPlaylist(null);
        setTracks([]);
        setFolderPlans([]);
        setShowAllFolderPlans(false);
        setLibraryMatches([]);
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
      setTracks([]);
      setFolderPlans([]);
      setShowAllFolderPlans(false);
      setLibraryMatches([]);
      clearBackupWorkflowState();
      return;
    }

    let cancelled = false;
    const playlistId = selectedPlaylistId;

    async function loadTracks() {
      setIsLoadingTracks(true);
      setLibraryOrganizeMessage(null);
      setNavidromePlaylistMessage(null);
      clearBackupWorkflowState();
      setRequestError(null);
      setSelectedPlaylist(null);
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
  }, [clearBackupWorkflowState, selectedPlaylistId, sourceKind]);

  useEffect(() => {
    if (sourceKind !== "playlist" || !selectedPlaylistId || !tracks.length) {
      return;
    }

    const nextStatus = getPlaylistBackupStatus(tracks, libraryMatches);

    setPlaylistBackupStatuses((current) => {
      const currentStatus = current[selectedPlaylistId];

      if (
        currentStatus?.backedUp === nextStatus.backedUp &&
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
  const visibleFolderPlans = showAllFolderPlans
    ? folderPlans
    : folderPlans.slice(0, folderPlanPreviewLimit);
  const hiddenFolderPlanCount = Math.max(
    0,
    folderPlans.length - visibleFolderPlans.length
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
    setDownloadRightsConfirmed(false);
    setDownloadBulkRiskAccepted(false);
    setProviderDownloadMessage(null);
  }, [downloadTrackOptions, downloadTrackPosition]);
  const canOrganizeLibrary =
    navidromeReady && tracks.length > 0 && moveNeededCount > 0;
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
  const canDownloadProvider =
    Boolean(
      navidromeReady &&
        selectedDownloadTrack &&
        selectedProviderCandidate?.url &&
        downloadRightsConfirmed &&
        downloadBulkRiskAccepted
    ) &&
    !isSearchingProvider &&
    !isDownloadingProvider &&
    !isDownloadingBulkProvider;
  const canDownloadBulkProvider =
    Boolean(
      navidromeReady &&
        downloadTrackOptions.length &&
        !isDownloadingProvider &&
        !isSearchingProvider &&
        !isDownloadingBulkProvider
    );
  const downloadBulkQueue = useCallback(async () => {
    if (!downloadTrackOptions.length) {
      setRequestError("Resolve Spotify tracks with missing backups first.");
      return;
    }

    setIsDownloadingBulkProvider(true);
    setBulkDownloadMessage(null);
    setBulkDownloadProgress({
      completedCount: 0,
      failedCount: 0,
      phase: "Preparing",
      totalCount: downloadTrackOptions.length
    });
    setProviderDownloadMessage(null);
    setRequestError(null);

    let completedCount = 0;
    let failedCount = 0;
    const failedTrackLabels: string[] = [];

    try {
      for (const track of downloadTrackOptions) {
        const trackLabel = `${track.position}. ${track.name}`;

        setBulkDownloadProgress({
          completedCount,
          failedCount,
          phase: "Searching",
          totalCount: downloadTrackOptions.length,
          trackLabel
        });

        try {
          const searchResponse = await postJson<ProviderSearchResponse>(
            "/api/providers/search",
            {
              limit: 4,
              providerIds: providerSearchOrder,
              track
            }
          );
          const candidate = bestProviderCandidate(
            searchResponse.search.candidates
          );

          if (!candidate?.url) {
            throw new Error("No provider candidate found.");
          }

          setBulkDownloadProgress({
            completedCount,
            failedCount,
            phase: `Downloading from ${providerDisplayName(
              candidate.providerId
            )}`,
            totalCount: downloadTrackOptions.length,
            trackLabel
          });

          const downloadResponse = await postJson<ProviderDownloadResponse>(
            "/api/providers/download",
            {
              bulkRiskAccepted: true,
              providerId: candidate.providerId,
              quality: downloadQuality,
              rightsConfirmed: true,
              selectedReason: `SpotifyBU automatic bulk download selected ${candidate.title} (${candidate.score.overall}% match)`,
              sourceUrl: candidate.url,
              track
            }
          );
          const download = await waitForProviderDownload(
            downloadResponse,
            (job) => {
              setBulkDownloadProgress({
                completedCount,
                failedCount,
                phase: `Downloading from ${providerDisplayName(
                  candidate.providerId
                )} (${providerDownloadJobStatusLabel(job.status)})`,
                totalCount: downloadTrackOptions.length,
                trackLabel
              });
            }
          );

          if (download.libraryIndex) {
            setLibraryIndex(download.libraryIndex);
          }

          if (download.relativePath) {
            markDownloadedTrackInLibrary(track, download.relativePath);
          }

          completedCount += 1;
        } catch (error) {
          failedCount += 1;
          failedTrackLabels.push(`${trackLabel}: ${errorMessage(error)}`);

          setBulkDownloadProgress({
            completedCount,
            failedCount,
            phase: "Continuing",
            totalCount: downloadTrackOptions.length,
            trackLabel
          });
        }
      }

      setBulkDownloadProgress({
        completedCount,
        failedCount,
        phase: "Complete",
        totalCount: downloadTrackOptions.length
      });
      const bulkMessage = `Backed up ${completedCount} of ${
        downloadTrackOptions.length
      } missing tracks${
        failedCount
          ? `; ${failedCount} need review${
              failedTrackLabels[0] ? ` (${failedTrackLabels[0]})` : ""
            }`
          : ""
      }.`;

      setBulkDownloadMessage(bulkMessage);

      try {
        await refreshLibraryMatches();
      } catch (error) {
        setBulkDownloadMessage(
          `${bulkMessage} SpotifyBU could not refresh the match table automatically (${errorMessage(
            error
          )}). Run Scan library after the server settles.`
        );
      }
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsDownloadingBulkProvider(false);
    }
  }, [
    downloadTrackOptions,
    downloadQuality,
    markDownloadedTrackInLibrary,
    refreshLibraryMatches
  ]);
  const libraryIndexLabel = libraryIndex
    ? libraryIndex.generatedAt
      ? `${numberFormatter.format(libraryIndex.trackCount)} indexed - scanned ${formatShortDate(
          libraryIndex.generatedAt
        )}${libraryIndex.stale ? " - rescan needed" : ""}${
          libraryIndex.skippedCount
            ? ` - ${numberFormatter.format(libraryIndex.skippedCount)} skipped`
            : ""
        }`
      : "No library scan yet"
    : "Checking index";
  const libraryIndexScanLabel =
    libraryIndexScan?.state === "running"
      ? "Library scan running in the background."
      : libraryIndexScan?.state === "failed"
        ? `Library scan failed: ${
            libraryIndexScan.error ?? "SpotifyBU could not scan the library."
          }`
        : libraryIndexScan?.state === "succeeded"
          ? "Library scan completed."
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

          <a className="icon-command" href="/api/app-auth/logout" title="Sign out">
            <LogOut size={18} />
            Sign out
          </a>
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
                {filteredPlaylists.map((playlist) => (
                  <button
                    className={`playlist-button ${
                      playlist.id === selectedPlaylistId ? "active" : ""
                    }`}
                    key={playlist.id}
                    onClick={() => selectPlaylist(playlist.id)}
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
                        {playlistBackupStatuses[playlist.id]?.backedUp ? (
                          <span
                            className="playlist-backed-up-badge"
                            title="All tracks in this playlist are backed up"
                          >
                            <CheckCircle2 size={14} />
                            Backed up
                          </span>
                        ) : null}
                      </span>
                      <span className="playlist-count">
                        {numberFormatter.format(playlist.tracksTotal)} tracks
                      </span>
                    </span>
                  </button>
                ))}
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
                    Paste a Spotify {sourceKindLabel(sourceKind).toLowerCase()} URL
                    or ID to preview its Navidrome target.
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
                  <button
                    className={`command secondary ${
                      canCreateNavidromePlaylist ? "" : "disabled"
                    }`}
                    disabled={!canCreateNavidromePlaylist}
                    onClick={() => void createNavidromePlaylist()}
                    title={
                      navidromeApiReady
                        ? "Create or update this playlist in Navidrome"
                        : "Connect Navidrome API credentials to create playlists"
                    }
                    type="button"
                  >
                    {isCreatingNavidromePlaylist ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <ListMusic size={18} />
                    )}
                    Create in Navidrome
                  </button>
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
                  disabled={!canOrganizeLibrary || isOrganizingLibrary}
                  onClick={() => void organizeLibraryMatches()}
                  title="Move matched files into Lidarr-style folders"
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
                    : "Organize"}
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
                      : "Scan"}
                  </span>
                </span>
              </div>

              {folderPlans.length ? (
                <div className="folder-plan-section">
                  <div className="section-heading">
                    <span className="stat-label">Navidrome folder destinations</span>
                    <p>
                      Album folders that matched or newly downloaded tracks will use.
                    </p>
                  </div>
                  <div className="folder-plan-list">
                    {visibleFolderPlans.map((plan) => (
                      <div className="folder-plan" key={plan.key}>
                        <HardDrive size={18} />
                        <span>
                          <span className="folder-plan-name">
                            {plan.folderName}
                          </span>
                          <span className="folder-plan-path">
                            {plan.absolutePath ?? plan.relativePath}
                          </span>
                        </span>
                        <span className="folder-plan-count">
                          {numberFormatter.format(plan.trackCount)}{" "}
                          {plan.trackCount === 1 ? "track" : "tracks"}{" "}
                          {plan.logged ? "folder mapped" : "folder planned"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {folderPlans.length > folderPlanPreviewLimit ? (
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
                        target tracks that are still missing from the library scan.
                      </p>
                    </div>
                    <span className="backup-workflow-count">
                      {hasUsableLibraryIndex
                        ? `${numberFormatter.format(missingBackupCount)} missing`
                        : "Scan library"}
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
                            setDownloadRightsConfirmed(false);
                            setDownloadBulkRiskAccepted(false);
                            setProviderDownloadMessage(null);
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
                              setDownloadRightsConfirmed(false);
                              setDownloadBulkRiskAccepted(false);
                              setProviderDownloadMessage(null);
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
                            <a
                              href={selectedProviderCandidate.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Review source
                            </a>
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
                          canDownloadBulkProvider ? "" : "disabled"
                        }`}
                        disabled={!canDownloadBulkProvider}
                        onClick={() => void downloadBulkQueue()}
                        title="Download all missing playlist tracks"
                        type="button"
                      >
                        {isDownloadingBulkProvider ? (
                          <Loader2 className="spin" size={18} />
                        ) : (
                          <Download size={18} />
                        )}
                        Download Missing Tracks
                      </button>
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
                        <p className="provider-success">{bulkDownloadMessage}</p>
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
                              () => void openMissingBackupActions(track),
                              isSearchingProvider ||
                                isDownloadingProvider ||
                                isDownloadingBulkProvider
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
              <div className="provider-row with-action">
                <span
                  className={`provider-icon ${
                    libraryIndex?.trackCount ? "green" : "teal"
                  }`}
                >
                  <HardDrive size={18} />
                </span>
                <span>
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
                </span>
                <button
                  className="icon-command compact"
                  disabled={!navidromeReady || isScanningLibrary}
                  onClick={() => void scanNavidromeLibrary()}
                  title="Scan Navidrome library"
                  type="button"
                >
                  <RefreshCw
                    className={isScanningLibrary ? "spin" : undefined}
                    size={18}
                  />
                </button>
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

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getPlaylistBackupStatus(
  tracks: BackupTrack[],
  libraryMatches: LibraryMatch[]
): PlaylistBackupStatus {
  const matchesByPosition = new Map(
    libraryMatches.map((match) => [match.trackPosition, match] as const)
  );

  return {
    backedUp:
      tracks.length > 0 &&
      tracks.every((track) => matchesByPosition.get(track.position)?.exists),
    trackCount: tracks.length
  };
}

function renderLibraryMatch(
  match: LibraryMatch | undefined,
  libraryIndex: NavidromeLibraryIndexSummary | null,
  onSearchMissing?: () => void,
  searchDisabled = false
) {
  if (!libraryIndex) {
    return <span className="track-status unindexed">No scan</span>;
  }

  if (libraryIndex.stale) {
    return <span className="track-status stale">Scan needed</span>;
  }

  if (!match || !match.exists) {
    if (onSearchMissing) {
      return (
        <button
          className="track-status missing actionable"
          disabled={searchDisabled}
          onClick={onSearchMissing}
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
        <span className="track-status move">Backed up</span>
        <span className="track-note">
          Organize into {match.recommendedRelativePath ?? match.expectedFolder}
        </span>
      </span>
    );
  }

  return (
    <span className="track-status-stack">
      <span className="track-status exists">Backed up</span>
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

function bestProviderCandidate(candidates: ProviderSearchCandidate[]) {
  return candidates
    .filter((candidate) => candidate.url)
    .sort((left, right) => {
      const scoreDelta = right.score.overall - left.score.overall;

      if (scoreDelta) {
        return scoreDelta;
      }

      return (
        providerSearchOrder.indexOf(
          left.providerId as (typeof providerSearchOrder)[number]
        ) -
        providerSearchOrder.indexOf(
          right.providerId as (typeof providerSearchOrder)[number]
        )
      );
    })[0];
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
