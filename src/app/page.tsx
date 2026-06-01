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
  artists: string[];
  durationMs: number;
  explicit: boolean;
  id?: string;
  isrc?: string;
  name: string;
  position: number;
  spotifyUrl?: string;
};

type PlaylistResponse = {
  playlists: PlaylistSummary[];
};

type TracksResponse = {
  playlist: PlaylistSummary;
  tracks: BackupTrack[];
};

const numberFormatter = new Intl.NumberFormat("en-US");

export default function Home() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(
    null
  );
  const [tracks, setTracks] = useState<BackupTrack[]>([]);
  const [query, setQuery] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
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
    if (session?.authenticated) {
      void loadPlaylists();
    }
  }, [loadPlaylists, session?.authenticated]);

  useEffect(() => {
    if (!selectedPlaylistId) {
      setSelectedPlaylist(null);
      setTracks([]);
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
  }, [selectedPlaylistId]);

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
                  <h2>Playlists</h2>
                  <p className="muted">
                    {numberFormatter.format(playlists.length)} lists
                  </p>
                </div>
              </div>
              <button
                className="icon-command"
                disabled={isLoadingPlaylists}
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
              <label className="search-box">
                <Search size={18} />
                <input
                  aria-label="Search playlists"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  value={query}
                />
              </label>
            </div>

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
          </aside>

          <section className="panel detail-panel">
            <div className="panel-header">
              <div className="panel-title">
                <Download size={20} />
                <div>
                  <h2>{selectedPlaylist?.name ?? "Select a playlist"}</h2>
                  <p className="muted">
                    {selectedPlaylist ? selectedPlaylist.owner : "Ready"}
                  </p>
                </div>
              </div>
              <div className="detail-actions">
                <a
                  className={`command secondary ${
                    selectedPlaylistId ? "" : "disabled"
                  }`}
                  href={
                    selectedPlaylistId
                      ? `/api/spotify/playlists/${selectedPlaylistId}/export?format=json`
                      : "#"
                  }
                  title="Export JSON"
                >
                  <FileJson size={18} />
                  JSON
                </a>
                <a
                  className={`command secondary ${
                    selectedPlaylistId ? "" : "disabled"
                  }`}
                  href={
                    selectedPlaylistId
                      ? `/api/spotify/playlists/${selectedPlaylistId}/export?format=csv`
                      : "#"
                  }
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
                  <span className="stat-label">Library Tracks</span>
                  <span className="stat-value">
                    {numberFormatter.format(totalTracks)}
                  </span>
                </span>
                <span>
                  <span className="stat-label">Selected Tracks</span>
                  <span className="stat-value">
                    {numberFormatter.format(tracks.length)}
                  </span>
                </span>
                <span>
                  <span className="stat-label">Match Key</span>
                  <span className="stat-value">ISRC</span>
                </span>
              </div>

              {isLoadingTracks ? (
                <div className="loading-state">
                  <Loader2 className="spin" size={28} />
                  <span>Loading tracks</span>
                </div>
              ) : selectedPlaylist ? (
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
                  <span>No playlist selected</span>
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
                  <h3>Licensed sources</h3>
                  <p>Downloads stage into Navidrome only with rights</p>
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
                <p className="muted">Authorized downloads to the music folder</p>
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
