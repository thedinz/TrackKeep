"use client";

import {
  CheckCircle2,
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
import { useCallback, useEffect, useMemo, useState } from "react";
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
  stale: boolean;
  trackCount: number;
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

type BackupTrack = {
  addedAt?: string;
  album: string;
  albumArtist: string;
  albumId?: string;
  artists: string[];
  discNumber?: number;
  durationMs: number;
  explicit: boolean;
  id?: string;
  isrc?: string;
  name: string;
  position: number;
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
};

type LibraryMatchesResponse = {
  libraryMatches: LibraryMatch[];
};

type LibraryOrganizeResponse = LibraryIndexResponse & LibraryMatchesResponse & {
  movedCount: number;
  skippedCount: number;
};

type ProviderDownloadResponse = {
  download: {
    bytesWritten?: number;
    destinationPath: string;
    format: string;
    providerId: string;
    quality: string;
    provenancePath?: string;
    relativePath?: string;
    sourceUrl: string;
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
const downloadEnabledProviderIds = new Set([
  "jiosaavn",
  "piped",
  "youtube",
  "youtube-music"
]);
const mediaSourceProviders: readonly SourceProviderCatalogEntry[] =
  SOURCE_PROVIDER_CATALOG.filter(
    (provider) => provider.id !== "navidrome-library"
  );
const downloadableProviders = mediaSourceProviders.filter((provider) =>
  downloadEnabledProviderIds.has(provider.id)
);

export default function Home() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [spotifyAuthConfig, setSpotifyAuthConfig] =
    useState<SpotifyAuthConfigResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(
    null
  );
  const [sourceKind, setSourceKind] = useState<SourceKind>("playlist");
  const [lookupInput, setLookupInput] = useState("");
  const [resolvedSource, setResolvedSource] = useState<ResolvedSource | null>(null);
  const [tracks, setTracks] = useState<BackupTrack[]>([]);
  const [folderPlans, setFolderPlans] = useState<FolderPlan[]>([]);
  const [libraryIndex, setLibraryIndex] =
    useState<NavidromeLibraryIndexSummary | null>(null);
  const [libraryMatches, setLibraryMatches] = useState<LibraryMatch[]>([]);
  const [query, setQuery] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [isOrganizingLibrary, setIsOrganizingLibrary] = useState(false);
  const [isDownloadingProvider, setIsDownloadingProvider] = useState(false);
  const [isDownloadingBulkProvider, setIsDownloadingBulkProvider] =
    useState(false);
  const [navidromeStatus, setNavidromeStatus] =
    useState<NavidromeLibraryStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadTrackPosition, setDownloadTrackPosition] = useState("");
  const [downloadProviderId, setDownloadProviderId] = useState("youtube-music");
  const [downloadFormat, setDownloadFormat] = useState("mp3");
  const [downloadQuality, setDownloadQuality] = useState("320");
  const [downloadSourceUrl, setDownloadSourceUrl] = useState("");
  const [downloadRightsConfirmed, setDownloadRightsConfirmed] = useState(false);
  const [downloadBulkRiskAccepted, setDownloadBulkRiskAccepted] = useState(false);
  const [providerDownloadMessage, setProviderDownloadMessage] =
    useState<string | null>(null);
  const [bulkQueueText, setBulkQueueText] = useState("");
  const [bulkChunkSize, setBulkChunkSize] = useState("10");
  const [bulkTrackDelaySeconds, setBulkTrackDelaySeconds] = useState("20");
  const [bulkChunkPauseSeconds, setBulkChunkPauseSeconds] = useState("120");
  const [bulkDownloadMessage, setBulkDownloadMessage] = useState<string | null>(
    null
  );
  const [bulkDownloadProgress, setBulkDownloadProgress] =
    useState<BulkDownloadProgress | null>(null);

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
        state: "error",
        writable: false
      });
    }
  }, []);

  const loadLibraryIndex = useCallback(async () => {
    try {
      const response = await fetchJson<LibraryIndexResponse>(
        "/api/navidrome/library/index"
      );
      setLibraryIndex(response.index);
    } catch {
      setLibraryIndex({
        stale: true,
        trackCount: 0
      });
    }
  }, []);

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

  const scanNavidromeLibrary = useCallback(async () => {
    setIsScanningLibrary(true);
    setRequestError(null);

    try {
      const response = await postJson<LibraryIndexResponse>(
        "/api/navidrome/library/index",
        {}
      );
      setLibraryIndex(response.index);
      await refreshLibraryMatches();
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsScanningLibrary(false);
    }
  }, [refreshLibraryMatches]);

  const organizeLibraryMatches = useCallback(async () => {
    if (!tracks.length) {
      return;
    }

    setIsOrganizingLibrary(true);
    setRequestError(null);

    try {
      const response = await postJson<LibraryOrganizeResponse>(
        "/api/navidrome/library/organize",
        {
          tracks
        }
      );
      setLibraryIndex(response.index);
      setLibraryMatches(response.libraryMatches);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsOrganizingLibrary(false);
    }
  }, [tracks]);

  const downloadVerifiedSource = useCallback(async () => {
    const selectedTrack = tracks.find(
      (track) => String(track.position) === downloadTrackPosition
    );

    if (!selectedTrack) {
      setRequestError("Choose a track before downloading from a provider.");
      return;
    }

    setIsDownloadingProvider(true);
    setProviderDownloadMessage(null);
    setRequestError(null);

    try {
      const response = await postJson<ProviderDownloadResponse>(
        "/api/providers/download",
        {
          bulkRiskAccepted: downloadBulkRiskAccepted,
          format: downloadFormat,
          providerId: downloadProviderId,
          quality: downloadQuality,
          rightsConfirmed: downloadRightsConfirmed,
          selectedReason: "User reviewed and selected provider source URL",
          sourceUrl: downloadSourceUrl,
          track: selectedTrack
        }
      );
      const location =
        response.download.relativePath ?? response.download.destinationPath;
      setProviderDownloadMessage(`Downloaded ${selectedTrack.name} to ${location}`);
      setDownloadSourceUrl("");
      const indexResponse = await postJson<LibraryIndexResponse>(
        "/api/navidrome/library/index",
        {}
      );
      setLibraryIndex(indexResponse.index);
      await refreshLibraryMatches();
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsDownloadingProvider(false);
    }
  }, [
    downloadBulkRiskAccepted,
    downloadFormat,
    downloadProviderId,
    downloadQuality,
    downloadRightsConfirmed,
    downloadSourceUrl,
    downloadTrackPosition,
    refreshLibraryMatches,
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
    setRequestError(null);
    setResolvedSource(null);
    setTracks([]);
    setFolderPlans([]);
    setLibraryMatches([]);
    setSelectedPlaylist(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error) {
      setAuthError(error.replace(/_/g, " "));
      window.history.replaceState({}, "", "/");
    }

    void loadAppInfo();
    void loadSpotifyAuthConfig();
    void loadLibraryIndex();
    void loadSession();
    void loadNavidromeStatus();
  }, [
    loadAppInfo,
    loadLibraryIndex,
    loadNavidromeStatus,
    loadSession,
    loadSpotifyAuthConfig
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
      setLibraryMatches([]);
      return;
    }

    let cancelled = false;

    async function loadTracks() {
      setIsLoadingTracks(true);
      setRequestError(null);

      try {
        const response = await fetchJson<TracksResponse>(
          `/api/spotify/playlists/${selectedPlaylistId}/tracks`
        );

        if (!cancelled) {
          setSelectedPlaylist(response.playlist);
          setTracks(response.tracks);
          setFolderPlans(response.folderPlans);
          setLibraryMatches(response.libraryMatches);
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
  }, [selectedPlaylistId, sourceKind]);

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
  const navidromeStatusLabel = navidromeStatus
    ? navidromeStatusMessage(navidromeStatus)
    : "Checking library target";
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
    setDownloadSourceUrl("");
    setDownloadRightsConfirmed(false);
    setDownloadBulkRiskAccepted(false);
    setProviderDownloadMessage(null);
  }, [downloadTrackOptions, downloadTrackPosition]);
  const canOrganizeLibrary =
    navidromeReady && tracks.length > 0 && moveNeededCount > 0;
  const selectedDownloadProvider =
    downloadableProviders.find((provider) => provider.id === downloadProviderId) ??
    downloadableProviders[0];
  const selectedDownloadTrack =
    downloadTrackOptions.find(
      (track) => String(track.position) === downloadTrackPosition
    ) ??
    downloadTrackOptions[0] ??
    null;
  const canDownloadProvider =
    Boolean(
      navidromeReady &&
        selectedDownloadTrack &&
        downloadSourceUrl.trim() &&
        downloadRightsConfirmed &&
        downloadBulkRiskAccepted
    ) &&
    !isDownloadingProvider &&
    !isDownloadingBulkProvider;
  const parsedBulkQueue = useMemo(
    () =>
      parseBulkDownloadQueue(
        bulkQueueText,
        downloadTrackOptions,
        downloadProviderId
      ),
    [bulkQueueText, downloadProviderId, downloadTrackOptions]
  );
  const canDownloadBulkProvider =
    Boolean(
      navidromeReady &&
        parsedBulkQueue.items.length &&
        !parsedBulkQueue.error &&
        downloadRightsConfirmed &&
        downloadBulkRiskAccepted &&
        !isDownloadingProvider &&
        !isDownloadingBulkProvider
    );
  const downloadBulkQueue = useCallback(async () => {
    if (parsedBulkQueue.error) {
      setRequestError(parsedBulkQueue.error);
      return;
    }

    if (!parsedBulkQueue.items.length) {
      setRequestError("Add reviewed provider URLs to the bulk queue first.");
      return;
    }

    setIsDownloadingBulkProvider(true);
    setBulkDownloadMessage(null);
    setBulkDownloadProgress({
      completedCount: 0,
      failedCount: 0,
      phase: "Preparing",
      totalCount: parsedBulkQueue.items.length
    });
    setProviderDownloadMessage(null);
    setRequestError(null);

    const chunkSize = boundedInteger(bulkChunkSize, 10, 1, 50);
    const chunkPauseMs = secondsToMilliseconds(bulkChunkPauseSeconds);
    const delayMs = secondsToMilliseconds(bulkTrackDelaySeconds);
    let completedCount = 0;
    let failedCount = 0;
    const failedTrackLabels: string[] = [];

    try {
      for (const [index, item] of parsedBulkQueue.items.entries()) {
        const trackLabel = `${item.track.position}. ${item.track.name}`;

        setBulkDownloadProgress({
          completedCount,
          failedCount,
          phase: "Downloading",
          totalCount: parsedBulkQueue.items.length,
          trackLabel
        });

        try {
          await postJson<ProviderDownloadResponse>("/api/providers/download", {
            bulkRiskAccepted: downloadBulkRiskAccepted,
            format: downloadFormat,
            providerId: item.providerId,
            quality: downloadQuality,
            rightsConfirmed: downloadRightsConfirmed,
            selectedReason: item.selectedReason,
            sourceUrl: item.sourceUrl,
            track: item.track
          });
          completedCount += 1;
        } catch (error) {
          failedCount += 1;
          failedTrackLabels.push(`${trackLabel}: ${errorMessage(error)}`);
        }

        const isLastItem = index === parsedBulkQueue.items.length - 1;

        if (!isLastItem) {
          const isChunkBoundary = (index + 1) % chunkSize === 0;
          const waitMs = isChunkBoundary ? chunkPauseMs : delayMs;

          setBulkDownloadProgress({
            completedCount,
            failedCount,
            phase: isChunkBoundary ? "Chunk pause" : "Waiting",
            totalCount: parsedBulkQueue.items.length,
            trackLabel
          });

          if (waitMs > 0) {
            await wait(waitMs);
          }
        }
      }

      setBulkDownloadProgress({
        completedCount,
        failedCount,
        phase: "Complete",
        totalCount: parsedBulkQueue.items.length
      });
      setBulkDownloadMessage(
        `Backed up ${completedCount} of ${parsedBulkQueue.items.length} queued tracks${
          failedCount
            ? `; ${failedCount} need review${
                failedTrackLabels[0] ? ` (${failedTrackLabels[0]})` : ""
              }`
            : ""
        }.`
      );
      const indexResponse = await postJson<LibraryIndexResponse>(
        "/api/navidrome/library/index",
        {}
      );
      setLibraryIndex(indexResponse.index);
      await refreshLibraryMatches();
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setIsDownloadingBulkProvider(false);
    }
  }, [
    bulkChunkPauseSeconds,
    bulkChunkSize,
    bulkTrackDelaySeconds,
    downloadBulkRiskAccepted,
    downloadFormat,
    downloadQuality,
    downloadRightsConfirmed,
    parsedBulkQueue,
    refreshLibraryMatches
  ]);
  const libraryIndexLabel = libraryIndex
    ? libraryIndex.trackCount > 0
      ? `${numberFormatter.format(libraryIndex.trackCount)} indexed${
          libraryIndex.generatedAt
            ? ` - scanned ${formatShortDate(libraryIndex.generatedAt)}`
            : ""
        }${libraryIndex.stale ? " - rescan needed" : ""}`
      : "No library scan yet"
    : "Checking index";
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
                    onClick={() => setSelectedPlaylistId(playlist.id)}
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
                      <span className="playlist-name">{playlist.name}</span>
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
                  title="Move matched files into Artist - Album folders"
                  type="button"
                >
                  {isOrganizingLibrary ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <HardDrive size={18} />
                  )}
                  Organize
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
                <div className="folder-plan-list">
                  {folderPlans.map((plan) => (
                    <div className="folder-plan" key={plan.key}>
                      <HardDrive size={18} />
                      <span>
                        <span className="folder-plan-name">{plan.folderName}</span>
                        <span className="folder-plan-path">
                          {plan.absolutePath ?? plan.relativePath}
                        </span>
                      </span>
                      <span className="folder-plan-count">
                        {numberFormatter.format(plan.trackCount)} tracks
                        {plan.logged ? " logged" : " planned"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {isLoadingTracks ? (
                <div className="loading-state">
                  <Loader2 className="spin" size={28} />
                  <span>Loading tracks</span>
                </div>
              ) : activeSource ? (
                <div className="track-table">
                  <div className="track-row track-head">
                    <span>#</span>
                    <span>Track</span>
                    <span className="track-cell">Album</span>
                    <span className="track-cell">Backup</span>
                    <span className="track-cell">Time</span>
                  </div>
                  {tracks.map((track) => {
                    const libraryMatch = libraryMatchesByPosition.get(track.position);

                    return (
                      <div
                        className="track-row"
                        key={`${track.position}-${track.id}`}
                      >
                        <span className="track-cell">{track.position}</span>
                        <span>
                          <span className="track-title">{track.name}</span>
                          <span className="track-subtitle">
                            {track.artists.join(", ") || "Unknown artist"}
                          </span>
                        </span>
                        <span className="track-cell">{track.album || "Unknown"}</span>
                        <span className="track-cell library-cell">
                          {renderLibraryMatch(libraryMatch, libraryIndex)}
                        </span>
                        <span className="track-cell">
                          {formatDuration(track.durationMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
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
                    Missing tracks can be staged after source review and
                    authorization. Bulk jobs can trigger provider blocking.
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
              <div className="provider-download">
                <div>
                  <h3>Back up missing track</h3>
                  <p>
                    Choose a Spotify track that is not backed up, paste the
                    reviewed source URL, then stage it into Navidrome.
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
                      setDownloadSourceUrl("");
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
                <label className="provider-field">
                  <span>Provider</span>
                  <select
                    disabled={isDownloadingProvider || isDownloadingBulkProvider}
                    onChange={(event) => {
                      setDownloadProviderId(event.target.value);
                      setDownloadSourceUrl("");
                      setDownloadRightsConfirmed(false);
                      setDownloadBulkRiskAccepted(false);
                      setProviderDownloadMessage(null);
                      setBulkDownloadMessage(null);
                      setBulkDownloadProgress(null);
                    }}
                    value={selectedDownloadProvider?.id ?? downloadProviderId}
                  >
                    {downloadableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="provider-throttle-grid">
                  <label className="provider-field">
                    <span>Format</span>
                    <select
                      disabled={isDownloadingProvider || isDownloadingBulkProvider}
                      onChange={(event) => {
                        setDownloadFormat(event.target.value);
                        setDownloadRightsConfirmed(false);
                        setDownloadBulkRiskAccepted(false);
                        setProviderDownloadMessage(null);
                        setBulkDownloadMessage(null);
                        setBulkDownloadProgress(null);
                      }}
                      value={downloadFormat}
                    >
                      <option value="mp3">MP3</option>
                      <option value="flac">FLAC</option>
                    </select>
                  </label>
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
                <label className="provider-field">
                  <span>Verified source URL</span>
                  <input
                    disabled={isDownloadingProvider || isDownloadingBulkProvider}
                    onChange={(event) => {
                      setDownloadSourceUrl(event.target.value);
                      setDownloadRightsConfirmed(false);
                      setDownloadBulkRiskAccepted(false);
                      setProviderDownloadMessage(null);
                    }}
                    placeholder={providerUrlPlaceholder(downloadProviderId)}
                    value={downloadSourceUrl}
                  />
                </label>
                <label className="provider-check">
                  <input
                    checked={downloadRightsConfirmed}
                    disabled={isDownloadingProvider || isDownloadingBulkProvider}
                    onChange={(event) =>
                      setDownloadRightsConfirmed(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>I am authorized to download this selected source.</span>
                </label>
                <label className="provider-check">
                  <input
                    checked={downloadBulkRiskAccepted}
                    disabled={isDownloadingProvider || isDownloadingBulkProvider}
                    onChange={(event) =>
                      setDownloadBulkRiskAccepted(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>I understand provider throttling and blocking risk.</span>
                </label>
                <button
                  className={`command secondary ${
                    canDownloadProvider ? "" : "disabled"
                  }`}
                  disabled={!canDownloadProvider}
                  onClick={() => void downloadVerifiedSource()}
                  title="Download reviewed provider source"
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
                      <span>
                        {downloadFormat.toUpperCase()} {downloadQuality}
                      </span>
                    </div>
                    <div
                      aria-label="Provider download in progress"
                      className="download-progress-bar"
                      role="progressbar"
                    >
                      <span className="download-progress-fill indeterminate" />
                    </div>
                    <p className="download-progress-note">
                      {selectedDownloadTrack
                        ? `${selectedDownloadTrack.position}. ${selectedDownloadTrack.name}`
                        : "Preparing source"}
                    </p>
                  </div>
                ) : null}
                {providerDownloadMessage ? (
                  <p className="provider-success">{providerDownloadMessage}</p>
                ) : null}
                <div className="provider-divider" />
                <div>
                  <h3>Back up playlist queue</h3>
                  <p>
                    Queue reviewed source URLs for many missing tracks at once.
                    Each line uses: track position | provider | URL.
                  </p>
                </div>
                <label className="provider-field">
                  <span>Bulk queue</span>
                  <textarea
                    disabled={isDownloadingBulkProvider}
                    onChange={(event) => {
                      setBulkQueueText(event.target.value);
                      setBulkDownloadMessage(null);
                      setBulkDownloadProgress(null);
                    }}
                    placeholder={`12 | youtube-music | https://music.youtube.com/watch?v=...\n13 | youtube | https://www.youtube.com/watch?v=...\n14 | https://www.jiosaavn.com/song/...`}
                    value={bulkQueueText}
                  />
                </label>
                {parsedBulkQueue.error ? (
                  <p className="provider-error">{parsedBulkQueue.error}</p>
                ) : parsedBulkQueue.items.length ? (
                  <p className="provider-queue-note">
                    {numberFormatter.format(parsedBulkQueue.items.length)} queued
                    missing tracks
                  </p>
                ) : null}
                <div className="provider-throttle-grid">
                  <label className="provider-field">
                    <span>Chunk tracks</span>
                    <input
                      disabled={isDownloadingBulkProvider}
                      min="1"
                      onChange={(event) => {
                        setBulkChunkSize(event.target.value);
                        setBulkDownloadProgress(null);
                      }}
                      type="number"
                      value={bulkChunkSize}
                    />
                  </label>
                  <label className="provider-field">
                    <span>Track waits</span>
                    <input
                      disabled={isDownloadingBulkProvider}
                      min="1"
                      onChange={(event) => {
                        setBulkTrackDelaySeconds(event.target.value);
                        setBulkDownloadProgress(null);
                      }}
                      type="number"
                      value={bulkTrackDelaySeconds}
                    />
                  </label>
                  <label className="provider-field">
                    <span>Chunk pauses</span>
                    <input
                      disabled={isDownloadingBulkProvider}
                      min="5"
                      onChange={(event) => {
                        setBulkChunkPauseSeconds(event.target.value);
                        setBulkDownloadProgress(null);
                      }}
                      type="number"
                      value={bulkChunkPauseSeconds}
                    />
                  </label>
                </div>
                <button
                  className={`command secondary ${
                    canDownloadBulkProvider ? "" : "disabled"
                  }`}
                  disabled={!canDownloadBulkProvider}
                  onClick={() => void downloadBulkQueue()}
                  title="Run throttled playlist backup queue"
                  type="button"
                >
                  {isDownloadingBulkProvider ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <Download size={18} />
                  )}
                  Run Queue
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
                <p className="muted">YouTube Music, YouTube, Piped, JioSaavn</p>
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

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed."
    );
  }

  return body as T;
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
  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof responseBody.error === "string"
        ? responseBody.error
        : "Request failed."
    );
  }

  return responseBody as T;
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

function renderLibraryMatch(
  match: LibraryMatch | undefined,
  libraryIndex: NavidromeLibraryIndexSummary | null
) {
  if (!libraryIndex) {
    return <span className="track-status unindexed">No scan</span>;
  }

  if (libraryIndex.stale) {
    return <span className="track-status stale">Scan needed</span>;
  }

  if (!match || !match.exists) {
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

  return "Authorization required";
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

function providerUrlPlaceholder(providerId: string) {
  if (providerId === "youtube-music") {
    return "https://music.youtube.com/watch?v=...";
  }

  if (providerId === "youtube") {
    return "https://www.youtube.com/watch?v=...";
  }

  if (providerId === "piped") {
    return "https://piped.video/watch?v=...";
  }

  if (providerId === "jiosaavn") {
    return "https://www.jiosaavn.com/song/...";
  }

  return "https://...";
}

function parseBulkDownloadQueue(
  value: string,
  missingTracks: BackupTrack[],
  defaultProviderId: string
) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: Array<{
    providerId: string;
    selectedReason: string;
    sourceUrl: string;
    track: BackupTrack;
  }> = [];

  for (const [index, line] of lines.entries()) {
    const parts = line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2 || parts.length > 3) {
      return {
        error:
          "Bulk queue lines must be: track position | provider | URL, or track position | URL.",
        items
      };
    }

    const [positionValue, providerOrUrl, maybeUrl] = parts;
    const track = missingTracks.find(
      (candidate) => String(candidate.position) === positionValue
    );

    if (!track) {
      return {
        error: `Line ${index + 1}: track ${positionValue} is not missing from this backup source.`,
        items
      };
    }

    const providerId = normalizeProviderId(maybeUrl ? providerOrUrl : defaultProviderId);

    if (!providerId) {
      return {
        error: `Line ${index + 1}: choose YouTube Music, YouTube, Piped, or JioSaavn.`,
        items
      };
    }

    const sourceUrl = maybeUrl ?? providerOrUrl;

    if (!sourceUrl.startsWith("https://")) {
      return {
        error: `Line ${index + 1}: source URL must start with https://.`,
        items
      };
    }

    items.push({
      providerId,
      selectedReason: "User queued reviewed provider source URL for bulk backup",
      sourceUrl,
      track
    });
  }

  return {
    items
  };
}

function normalizeProviderId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  const aliases = new Map([
    ["jiosaavn", "jiosaavn"],
    ["jio-saavn", "jiosaavn"],
    ["piped", "piped"],
    ["youtube", "youtube"],
    ["yt", "youtube"],
    ["youtube-music", "youtube-music"],
    ["yt-music", "youtube-music"],
    ["ytmusic", "youtube-music"]
  ]);
  const providerId = aliases.get(normalized);

  return providerId && downloadEnabledProviderIds.has(providerId)
    ? providerId
    : null;
}

function secondsToMilliseconds(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : 0;
}

function boundedInteger(
  value: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
