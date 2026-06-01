"use client";

import {
  CheckCircle2,
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
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  playlist: PlaylistSummary;
  tracks: BackupTrack[];
};

type ResolveResponse = {
  folderPlans: FolderPlan[];
  source: ResolvedSource;
  tracks: BackupTrack[];
  type: "album" | "track";
};

const numberFormatter = new Intl.NumberFormat("en-US");

export default function Home() {
  const [session, setSession] = useState<SessionResponse | null>(null);
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
  const [query, setQuery] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [navidromeStatus, setNavidromeStatus] =
    useState<NavidromeLibraryStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

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
    setSelectedPlaylist(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error) {
      setAuthError(error.replace(/_/g, " "));
      window.history.replaceState({}, "", "/");
    }

    void loadSession();
    void loadNavidromeStatus();
  }, [loadNavidromeStatus, loadSession]);

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Music2 size={26} />
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
              Disconnect
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
        </div>
      </header>

      {authError ? (
        <div className="alert danger">
          <ShieldCheck size={18} />
          <span>{authError}</span>
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
              </div>
            </div>

            <div className="detail-body">
              <div className="summary-strip">
                <span>
                  <span className="stat-label">
                    {sourceKind === "playlist" ? "Library Tracks" : "Source Tracks"}
                  </span>
                  <span className="stat-value">
                    {numberFormatter.format(
                      sourceKind === "playlist"
                        ? totalTracks
                        : activeSource?.tracksTotal ?? 0
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
                  <span className="stat-label">Folder Rule</span>
                  <span className="stat-value">Artist - Album</span>
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
                    <span className="track-cell">Time</span>
                  </div>
                  {tracks.map((track) => (
                    <div className="track-row" key={`${track.position}-${track.id}`}>
                      <span className="track-cell">{track.position}</span>
                      <span>
                        <span className="track-title">{track.name}</span>
                        <span className="track-subtitle">
                          {track.artists.join(", ") || "Unknown artist"}
                        </span>
                      </span>
                      <span className="track-cell">{track.album || "Unknown"}</span>
                      <span className="track-cell">
                        {formatDuration(track.durationMs)}
                      </span>
                    </div>
                  ))}
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
                  <p className="muted">Provider readiness</p>
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
                  <p>Connected through Web API scopes</p>
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
              <div className="provider-row">
                <span className="provider-icon amber">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <h3>SpotDL-style sources</h3>
                  <p>Provider matching, then authorized Navidrome staging</p>
                </span>
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
              Playlist metadata exports are available after account approval.
            </p>
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
                  <h2>Backup Surface</h2>
                  <p className="muted">Metadata first, media rights respected</p>
                </div>
              </div>
            </div>
            <div className="signal-grid">
              <div className="signal ready">
                <h3>Playlist reads</h3>
                <p className="muted">Private and collaborative scopes</p>
              </div>
              <div className="signal locked">
                <h3>Navidrome target</h3>
                <p className="muted">{navidromeStatusLabel}</p>
              </div>
              <div className="signal waiting">
                <h3>Media providers</h3>
                <p className="muted">SpotDL-style matching with explicit rights</p>
              </div>
            </div>
          </div>
        </section>
      )}
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
