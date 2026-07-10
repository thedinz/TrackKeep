"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Fingerprint,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  SlidersHorizontal
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type AppAuthStatus = {
  authenticated: boolean;
  authMode: "external" | "internal";
  defaultCredentials: boolean;
  username?: string;
};

type OrganizeNamingSettings = {
  artistFolderFormat: string;
  colonReplacementFormat: number;
  mode: "standard";
  multiDiscTrackFormat: string;
  replaceIllegalCharacters: boolean;
  standardTrackFormat: string;
};

type OrganizeSettingsResponse = {
  naming: OrganizeNamingSettings;
};

type MusicLibraryAutoScanSettings = {
  enabled: boolean;
  time: string;
  timeZone: string;
};

type MusicLibraryAutoScanStatus = {
  lastScheduledAt?: string;
  nextRunAt?: string;
  scan: {
    completedAt?: string;
    error?: string;
    startedAt?: string;
    state: "failed" | "idle" | "running" | "succeeded";
  };
  settings: MusicLibraryAutoScanSettings;
};

type MusicLibraryAutoScanResponse = {
  autoScan: MusicLibraryAutoScanStatus;
};

type PlexMusicLibrary = {
  key: string;
  title: string;
};

type PlexStatus = {
  configured: boolean;
  libraries: PlexMusicLibrary[];
  message: string;
  musicLibraryKey?: string;
  musicLibraryTitle?: string;
  serverUrl: string;
  state: "auth_failed" | "disabled" | "error" | "not_configured" | "ready";
};

type PublicPlexSettings = {
  enabled: boolean;
  libraries: PlexMusicLibrary[];
  musicLibraryKey: string;
  musicLibraryTitle?: string;
  serverUrl: string;
  status: PlexStatus;
  tokenConfigured: boolean;
};

type PlexSettingsResponse = {
  plex: PublicPlexSettings;
};

type ProviderDownloadOpusQuality = "160" | "192" | "256";
type ProviderDownloadFallbackFormat = "mp3" | "none";
type ProviderDownloadMp3FallbackQuality = "192" | "256" | "320";

type ProviderDownloadSettings = {
  fallbackFormat: ProviderDownloadFallbackFormat;
  mp3FallbackQuality: ProviderDownloadMp3FallbackQuality;
  opusQuality: ProviderDownloadOpusQuality;
};

type ProviderDownloadSettingsResponse = {
  providerDownload: ProviderDownloadSettings;
};

type MusicLibraryIdentityTagBackfillResult = {
  alreadyTaggedCount: number;
  attemptedCount: number;
  failedCount: number;
  matchedCount: number;
  skippedCount: number;
  snapshotCount: number;
  taggedCount: number;
  trackCount: number;
};

type MusicLibraryIdentityTagBackfillJobStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running";

type MusicLibraryIdentityTagBackfillJob = {
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

type MusicLibraryIdentityTagBackfillResponse = {
  job: MusicLibraryIdentityTagBackfillJob;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const identityBackfillJobStorageKey = "spotifybu.identityBackfillJobId";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAuthMode, setIsSavingAuthMode] = useState(false);
  const [isSavingAutoScan, setIsSavingAutoScan] = useState(false);
  const [isSavingPlex, setIsSavingPlex] = useState(false);
  const [isSavingProviderDownload, setIsSavingProviderDownload] =
    useState(false);
  const [isBackfillingIdentityTags, setIsBackfillingIdentityTags] =
    useState(false);
  const [autoScan, setAutoScan] = useState<MusicLibraryAutoScanStatus | null>(null);
  const [identityBackfill, setIdentityBackfill] =
    useState<MusicLibraryIdentityTagBackfillResult | null>(null);
  const [identityBackfillJob, setIdentityBackfillJob] =
    useState<MusicLibraryIdentityTagBackfillJob | null>(null);
  const [namingSettings, setNamingSettings] =
    useState<OrganizeNamingSettings | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [authMode, setAuthMode] = useState<"external" | "internal">("internal");
  const [plexSettings, setPlexSettings] = useState<PublicPlexSettings | null>(
    null
  );
  const [providerDownloadSettings, setProviderDownloadSettings] =
    useState<ProviderDownloadSettings | null>(null);
  const [plexToken, setPlexToken] = useState("");
  const [status, setStatus] = useState<AppAuthStatus | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  useEffect(() => {
    void fetch("/api/app-auth/session")
      .then((response) => response.json())
      .then((sessionStatus: AppAuthStatus) => {
        setStatus(sessionStatus);
        setAuthMode(sessionStatus.authMode);
        setUsername(sessionStatus.username ?? "");
      })
      .catch(() => {
        setError("Could not load settings.");
      });

    void fetch("/api/organize-settings")
      .then(readJson<OrganizeSettingsResponse>)
      .then((response) => {
        setNamingSettings(response.naming);
      })
      .catch(() => {
        setError("Could not load organize settings.");
      });

    void fetch("/api/music-library/auto-scan")
      .then(readJson<MusicLibraryAutoScanResponse>)
      .then((response) => {
        setAutoScan(withBrowserTimeZoneDefault(response.autoScan));
      })
      .catch(() => {
        setError("Could not load Navidrome auto scan settings.");
      });

    void fetch("/api/plex/settings")
      .then(readJson<PlexSettingsResponse>)
      .then((response) => {
        setPlexSettings(response.plex);
      })
      .catch(() => {
        setError("Could not load Plex settings.");
      });

    void fetch("/api/providers/download/settings")
      .then(readJson<ProviderDownloadSettingsResponse>)
      .then((response) => {
        setProviderDownloadSettings(response.providerDownload);
      })
      .catch(() => {
        setError("Could not load provider download settings.");
      });
  }, []);

  const submitSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      setIsSaving(true);

      try {
        const response = await fetch("/api/app-auth/settings", {
          body: JSON.stringify({
            currentPassword,
            newPassword,
            username
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Could not save settings."
          );
        }

        setCurrentPassword("");
        setNewPassword("");
        setStatus({
          authenticated: true,
          authMode: body.authMode === "external" ? "external" : "internal",
          defaultCredentials: false,
          username: body.username
        });
        setSuccess("Login settings updated.");
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save settings."
        );
      } finally {
        setIsSaving(false);
      }
    },
    [currentPassword, newPassword, username]
  );

  const submitAuthMode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      setIsSavingAuthMode(true);

      try {
        const response = await fetch("/api/app-auth/settings", {
          body: JSON.stringify({
            authMode
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Could not save settings."
          );
        }

        setStatus({
          authenticated: true,
          authMode: body.authMode === "external" ? "external" : "internal",
          defaultCredentials: Boolean(body.defaultCredentials),
          username: body.username
        });
        setUsername(typeof body.username === "string" ? body.username : "");
        setSuccess(
          body.authMode === "external"
            ? "External auth enabled. Built-in login is disabled."
            : "Internal SpotifyBU login enabled."
        );
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save settings."
        );
      } finally {
        setIsSavingAuthMode(false);
      }
    },
    [authMode]
  );

  const updateAutoScanSettings = useCallback(
    (update: Partial<MusicLibraryAutoScanSettings>) => {
      setAutoScan((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                ...update
              }
            }
          : current
      );
    },
    []
  );

  const submitAutoScanSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!autoScan) {
        return;
      }

      setError(null);
      setSuccess(null);
      setIsSavingAutoScan(true);

      try {
        const response = await fetch("/api/music-library/auto-scan", {
          body: JSON.stringify({
            autoScan: autoScan.settings
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await readJson<MusicLibraryAutoScanResponse>(response);

        setAutoScan(withBrowserTimeZoneDefault(body.autoScan));
        setSuccess("Navidrome auto scan schedule saved.");
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save Navidrome auto scan settings."
        );
      } finally {
        setIsSavingAutoScan(false);
      }
    },
    [autoScan]
  );

  const updatePlexSettingsState = useCallback(
    (update: Partial<PublicPlexSettings>) => {
      setPlexSettings((current) =>
        current
          ? {
              ...current,
              ...update
            }
          : current
      );
    },
    []
  );

  const submitPlexSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!plexSettings) {
        return;
      }

      setError(null);
      setSuccess(null);
      setIsSavingPlex(true);

      try {
        const response = await fetch("/api/plex/settings", {
          body: JSON.stringify({
            plex: {
              enabled: plexSettings.enabled,
              musicLibraryKey: plexSettings.musicLibraryKey,
              serverUrl: plexSettings.serverUrl,
              token: plexToken
            }
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await readJson<PlexSettingsResponse>(response);

        setPlexSettings(body.plex);
        setPlexToken("");
        setSuccess(
          body.plex.enabled
            ? `Plex playlist sync saved. ${body.plex.status.message}`
            : "Plex playlist sync disabled."
        );
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save Plex settings."
        );
      } finally {
        setIsSavingPlex(false);
      }
    },
    [plexSettings, plexToken]
  );

  const updateProviderDownloadSettingsState = useCallback(
    (update: Partial<ProviderDownloadSettings>) => {
      setProviderDownloadSettings((current) =>
        current
          ? {
              ...current,
              ...update
            }
          : current
      );
    },
    []
  );

  const submitProviderDownloadSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!providerDownloadSettings) {
        return;
      }

      setError(null);
      setSuccess(null);
      setIsSavingProviderDownload(true);

      try {
        const response = await fetch("/api/providers/download/settings", {
          body: JSON.stringify({
            providerDownload: providerDownloadSettings
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await readJson<ProviderDownloadSettingsResponse>(response);

        setProviderDownloadSettings(body.providerDownload);
        setSuccess(providerDownloadSettingsSavedMessage(body.providerDownload));
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save provider download settings."
        );
      } finally {
        setIsSavingProviderDownload(false);
      }
    },
    [providerDownloadSettings]
  );

  const applyIdentityBackfillJob = useCallback(
    (job: MusicLibraryIdentityTagBackfillJob) => {
      setIdentityBackfillJob(job);
      setIsBackfillingIdentityTags(isIdentityBackfillJobActive(job));

      if (!isIdentityBackfillJobTerminal(job)) {
        return;
      }

      try {
        window.localStorage.removeItem(identityBackfillJobStorageKey);
      } catch {
        // Ignore localStorage failures in private browsing modes.
      }

      if (job.status === "completed" && job.result) {
        setIdentityBackfill(job.result);
        setSuccess(identityBackfillSummary(job.result));
        return;
      }

      if (job.status === "failed") {
        setError(job.error ?? "Could not backfill Spotify metadata tags.");
      }
    },
    []
  );

  const loadIdentityBackfillJob = useCallback(
    async (jobId: string) => {
      const response = await fetch(
        `/api/music-library/identity-tags/${encodeURIComponent(jobId)}`
      );
      const body =
        await readJson<MusicLibraryIdentityTagBackfillResponse>(response);

      applyIdentityBackfillJob(body.job);

      return body.job;
    },
    [applyIdentityBackfillJob]
  );

  const backfillIdentityTags = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIdentityBackfill(null);
    setIdentityBackfillJob(null);
    setIsBackfillingIdentityTags(true);

    try {
      const response = await fetch("/api/music-library/identity-tags", {
        method: "POST"
      });
      const body =
        await readJson<MusicLibraryIdentityTagBackfillResponse>(response);

      try {
        window.localStorage.setItem(identityBackfillJobStorageKey, body.job.id);
      } catch {
        // Progress still works during this page session.
      }

      applyIdentityBackfillJob(body.job);
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Could not backfill Spotify metadata tags."
      );
      setIsBackfillingIdentityTags(false);
    }
  }, [applyIdentityBackfillJob]);

  useEffect(() => {
    let storedJobId = "";

    try {
      storedJobId =
        window.localStorage.getItem(identityBackfillJobStorageKey) ?? "";
    } catch {
      return;
    }

    if (!storedJobId || identityBackfillJob?.id === storedJobId) {
      return;
    }

    let cancelled = false;

    void loadIdentityBackfillJob(storedJobId).catch(() => {
      if (cancelled) {
        return;
      }

      try {
        window.localStorage.removeItem(identityBackfillJobStorageKey);
      } catch {
        // Ignore localStorage cleanup failures.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [identityBackfillJob?.id, loadIdentityBackfillJob]);

  useEffect(() => {
    if (!identityBackfillJob || !isIdentityBackfillJobActive(identityBackfillJob)) {
      return;
    }

    let cancelled = false;
    const jobId = identityBackfillJob.id;
    const refreshJob = () => {
      void loadIdentityBackfillJob(jobId).catch((settingsError) => {
        if (cancelled) {
          return;
        }

        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not load Spotify metadata tag progress."
        );
        setIsBackfillingIdentityTags(false);
      });
    };
    const interval = window.setInterval(refreshJob, 1250);

    refreshJob();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    identityBackfillJob?.id,
    identityBackfillJob?.status,
    loadIdentityBackfillJob
  ]);

  const identityBackfillTotalCount = identityBackfillJob?.totalCount ?? 0;
  const identityBackfillProcessedCount = identityBackfillJob
    ? Math.min(identityBackfillJob.processedCount, identityBackfillTotalCount)
    : 0;
  const identityBackfillProgressPercent = identityBackfillTotalCount
    ? Math.round(
        (identityBackfillProcessedCount / identityBackfillTotalCount) * 100
      )
    : 0;
  const internalAuthEnabled = authMode === "internal";

  return (
    <main className="app-shell settings-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-note">BU</span>
          </div>
          <div>
            <p className="eyebrow">SpotifyBU</p>
            <h1>Settings</h1>
          </div>
        </div>

        <a className="icon-command" href="/" title="Back to dashboard">
          <ArrowLeft size={18} />
          Dashboard
        </a>
      </header>

      <section className="settings-grid">
        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <LockKeyhole size={20} />
              <div>
                <h2>App Authentication</h2>
                <p className="muted">Internal login or external reverse-proxy auth</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {status?.defaultCredentials && internalAuthEnabled ? (
              <div className="alert">
                <LockKeyhole size={18} />
                <span>You are still using the default admin/admin login.</span>
              </div>
            ) : null}

            {!internalAuthEnabled ? (
              <div className="alert">
                <LockKeyhole size={18} />
                <span>
                  Built-in login is disabled. Make sure Authentik or another
                  trusted proxy protects SpotifyBU before exposing this app.
                </span>
              </div>
            ) : null}

            {error ? (
              <div className="alert danger">
                <LockKeyhole size={18} />
                <span>{error}</span>
              </div>
            ) : null}

            {success ? (
              <div className="alert success">
                <CheckCircle2 size={18} />
                <span>{success}</span>
              </div>
            ) : null}

            <form className="auth-form" onSubmit={submitAuthMode}>
              <label className="form-field">
                <span className="stat-label">Authentication Provider</span>
                <select
                  onChange={(event) =>
                    setAuthMode(
                      event.target.value === "external" ? "external" : "internal"
                    )
                  }
                  value={authMode}
                >
                  <option value="internal">Internal SpotifyBU login</option>
                  <option value="external">External proxy auth</option>
                </select>
              </label>

              <button
                className="command green"
                disabled={isSavingAuthMode || authMode === status?.authMode}
                type="submit"
              >
                <Save size={18} />
                Save auth mode
              </button>
            </form>

            <form className="auth-form" onSubmit={submitSettings}>
              <label className="form-field">
                <span className="stat-label">Username</span>
                <input
                  autoComplete="username"
                  disabled={!internalAuthEnabled}
                  onChange={(event) => setUsername(event.target.value)}
                  value={username}
                />
              </label>

              <label className="form-field">
                <span className="stat-label">Current Password</span>
                <input
                  autoComplete="current-password"
                  disabled={!internalAuthEnabled}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                  type="password"
                  value={currentPassword}
                />
              </label>

              <label className="form-field">
                <span className="stat-label">New Password</span>
                <input
                  autoComplete="new-password"
                  disabled={!internalAuthEnabled}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={newPassword}
                />
              </label>

              <button
                className="command green"
                disabled={
                  !internalAuthEnabled ||
                  isSaving ||
                  !username.trim() ||
                  !currentPassword ||
                  newPassword.length < 8
                }
                type="submit"
              >
                <Save size={18} />
                Save internal login
              </button>
            </form>
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Server size={20} />
              <div>
                <h2>Plex Playlist Sync</h2>
                <p className="muted">Server URL and X-Plex-Token access</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {plexSettings ? (
              <form className="auth-form" onSubmit={submitPlexSettings}>
                <label className="checkbox-field">
                  <input
                    checked={plexSettings.enabled}
                    onChange={(event) =>
                      updatePlexSettingsState({
                        enabled: event.target.checked
                      })
                    }
                    type="checkbox"
                  />
                  <span>Sync playlists to Plex</span>
                </label>

                {plexSettings.enabled ? (
                  <div className="settings-subsection">
                    <label className="form-field">
                      <span className="stat-label">Plex Server URL</span>
                      <input
                        onChange={(event) =>
                          updatePlexSettingsState({
                            serverUrl: event.target.value
                          })
                        }
                        placeholder="http://localhost:32400"
                        value={plexSettings.serverUrl}
                      />
                    </label>

                    <label className="form-field">
                      <span className="stat-label">X-Plex-Token</span>
                      <input
                        autoComplete="off"
                        onChange={(event) => setPlexToken(event.target.value)}
                        placeholder={
                          plexSettings.tokenConfigured
                            ? "Saved token on file"
                            : "Plex token"
                        }
                        type="password"
                        value={plexToken}
                      />
                    </label>

                    <label className="form-field">
                      <span className="stat-label">Music Library</span>
                      <select
                        disabled={!plexSettings.libraries.length}
                        onChange={(event) =>
                          updatePlexSettingsState({
                            musicLibraryKey: event.target.value
                          })
                        }
                        value={plexSettings.musicLibraryKey}
                      >
                        {plexSettings.libraries.length ? null : (
                          <option value={plexSettings.musicLibraryKey}>
                            {plexSettings.musicLibraryKey
                              ? "Selected library unavailable"
                              : "Save to load libraries"}
                          </option>
                        )}
                        {plexSettings.libraries.map((library) => (
                          <option key={library.key} value={library.key}>
                            {library.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div
                      className={`auth-note ${
                        plexSettings.status.state === "ready" ? "success" : ""
                      }`}
                    >
                      {plexSettings.status.state === "ready" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Server size={18} />
                      )}
                      <span>{plexSettings.status.message}</span>
                    </div>
                  </div>
                ) : null}

                <button
                  className="command green"
                  disabled={
                    isSavingPlex ||
                    (plexSettings.enabled &&
                      (!plexSettings.serverUrl.trim() ||
                        (!plexSettings.tokenConfigured && !plexToken.trim())))
                  }
                  type="submit"
                >
                  {isSavingPlex ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <Save size={18} />
                  )}
                  Save Plex
                </button>
              </form>
            ) : (
              <div className="auth-note">
                <RefreshCw className="spin" size={18} />
                <span>Loading Plex settings</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Download size={20} />
              <div>
                <h2>Provider Downloads</h2>
                <p className="muted">Default Ogg Opus quality cap for new backups</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {providerDownloadSettings ? (
              <form
                className="auth-form"
                onSubmit={submitProviderDownloadSettings}
              >
                <div className="settings-inline-grid">
                  <label className="form-field">
                    <span className="stat-label">Opus Quality Cap</span>
                    <select
                      disabled={isSavingProviderDownload}
                      onChange={(event) => {
                        const opusQuality = opusQualityFromValue(
                          event.target.value
                        );

                        updateProviderDownloadSettingsState({
                          opusQuality
                        });
                      }}
                      value={providerDownloadSettings.opusQuality}
                    >
                      <option value="192">192 kbps</option>
                      <option value="160">160 kbps</option>
                      <option value="256">256 kbps</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <span className="stat-label">MP3 Fallback</span>
                    <select
                      disabled={isSavingProviderDownload}
                      onChange={(event) =>
                        updateProviderDownloadSettingsState(
                          fallbackSettingsFromValue(event.target.value)
                        )
                      }
                      value={providerDownloadFallbackValue(
                        providerDownloadSettings
                      )}
                    >
                      <option value="mp3:320">MP3 320 kbps</option>
                      <option value="mp3:256">MP3 256 kbps</option>
                      <option value="mp3:192">MP3 192 kbps</option>
                      <option value="none">Off</option>
                    </select>
                  </label>
                </div>

                <div className="auth-note">
                  <Download size={18} />
                  <span>
                    SpotifyBU requests up to the selected Opus quality and keeps
                    lower-bitrate provider audio at source quality instead of
                    upconverting it. If Opus cannot be written, SpotifyBU can
                    fall back to the selected MP3 quality; FLAC is not used as a
                    fallback.
                  </span>
                </div>

                <button
                  className="command green"
                  disabled={isSavingProviderDownload}
                  type="submit"
                >
                  {isSavingProviderDownload ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <Save size={18} />
                  )}
                  Save downloads
                </button>
              </form>
            ) : (
              <div className="auth-note">
                <RefreshCw className="spin" size={18} />
                <span>Loading provider download settings</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Fingerprint size={20} />
              <div>
                <h2>Spotify Metadata Tags</h2>
                <p className="muted">Maintenance for matched local backups</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            <div className="auth-note">
              <Fingerprint size={18} />
              <span>
                Add SpotifyBU identity, release date, and compilation tags to
                matched files from saved playlist snapshots.
              </span>
            </div>

            <button
              className="command secondary"
              disabled={isBackfillingIdentityTags}
              onClick={() => void backfillIdentityTags()}
              type="button"
            >
              {isBackfillingIdentityTags ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <Fingerprint size={18} />
              )}
              Retag matched backups
            </button>

            {identityBackfillJob ? (
              <div className="download-progress">
                <div className="download-progress-meta">
                  <span>{identityBackfillJobStatusLabel(identityBackfillJob)}</span>
                  <strong>
                    {identityBackfillTotalCount
                      ? `${numberFormatter.format(
                          identityBackfillProcessedCount
                        )}/${numberFormatter.format(identityBackfillTotalCount)}`
                      : "Preparing"}
                  </strong>
                </div>
                <div
                  aria-label="Spotify metadata tag progress"
                  aria-valuemax={identityBackfillTotalCount || 100}
                  aria-valuemin={0}
                  aria-valuenow={
                    identityBackfillTotalCount
                      ? identityBackfillProcessedCount
                      : undefined
                  }
                  className="download-progress-bar"
                  role="progressbar"
                >
                  <span
                    className={`download-progress-fill${
                      !identityBackfillTotalCount &&
                      isIdentityBackfillJobActive(identityBackfillJob)
                        ? " indeterminate"
                        : ""
                    }`}
                    style={
                      identityBackfillTotalCount
                        ? { width: `${identityBackfillProgressPercent}%` }
                        : undefined
                    }
                  />
                </div>
                <p className="download-progress-note">
                  {identityBackfillJobProgressNote(identityBackfillJob)}
                </p>
              </div>
            ) : null}

            {identityBackfill ? (
              <div className="auth-note">
                <CheckCircle2 size={18} />
                <span>{identityBackfillSummary(identityBackfill)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Clock size={20} />
              <div>
                <h2>Navidrome Auto Scan</h2>
                <p className="muted">Daily SpotifyBU index and Navidrome rescan</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {autoScan ? (
              <form className="auth-form" onSubmit={submitAutoScanSettings}>
                <label className="checkbox-field">
                  <input
                    checked={autoScan.settings.enabled}
                    onChange={(event) =>
                      updateAutoScanSettings({
                        enabled: event.target.checked,
                        timeZone: autoScan.settings.timeZone || browserTimeZone()
                      })
                    }
                    type="checkbox"
                  />
                  <span>Run daily scan</span>
                </label>

                <div className="settings-inline-grid">
                  <label className="form-field">
                    <span className="stat-label">Scan Time</span>
                    <input
                      onChange={(event) =>
                        updateAutoScanSettings({
                          time: event.target.value
                        })
                      }
                      type="time"
                      value={autoScan.settings.time}
                    />
                  </label>

                  <label className="form-field">
                    <span className="stat-label">Time Zone</span>
                    <input readOnly value={autoScan.settings.timeZone} />
                  </label>
                </div>

                <div className="auth-note">
                  <Clock size={18} />
                  <span>{autoScanScheduleLabel(autoScan)}</span>
                </div>

                <button
                  className="command green"
                  disabled={isSavingAutoScan || !autoScan.settings.time}
                  type="submit"
                >
                  <Save size={18} />
                  Save auto scan
                </button>
              </form>
            ) : (
              <div className="auth-note">
                <RefreshCw className="spin" size={18} />
                <span>Loading auto scan settings</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">
              <SlidersHorizontal size={20} />
              <div>
                <h2>Organize Layout</h2>
                <p className="muted">Informational view of the fixed Navidrome file layout</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {namingSettings ? (
              <div className="auth-form organize-form">
                <div className="auth-note">
                  <CheckCircle2 size={18} />
                  <span>
                    SpotifyBU uses this fixed Spotify metadata layout for organized
                    Navidrome files.
                  </span>
                </div>

                <div className="settings-subsection">
                  <label className="form-field">
                    <span className="stat-label">Artist Folder Format</span>
                    <input
                      readOnly
                      value={namingSettings.artistFolderFormat}
                    />
                  </label>

                  <label className="form-field wide-field">
                    <span className="stat-label">Standard Track Format</span>
                    <textarea
                      readOnly
                      value={namingSettings.standardTrackFormat}
                    />
                  </label>

                  <label className="form-field wide-field">
                    <span className="stat-label">Multi-Disc Track Format</span>
                    <textarea
                      readOnly
                      value={namingSettings.multiDiscTrackFormat}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="auth-note">
                <RefreshCw className="spin" size={18} />
                <span>Loading organize settings</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : "Request failed."
    );
  }

  return body as T;
}

function withBrowserTimeZoneDefault(
  autoScan: MusicLibraryAutoScanStatus
): MusicLibraryAutoScanStatus {
  const timeZone =
    !autoScan.settings.enabled && autoScan.settings.timeZone === "UTC"
      ? browserTimeZone()
      : autoScan.settings.timeZone || browserTimeZone();

  return {
    ...autoScan,
    settings: {
      ...autoScan.settings,
      timeZone
    }
  };
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function opusQualityFromValue(value: string): ProviderDownloadOpusQuality {
  return value === "160" || value === "256" ? value : "192";
}

function fallbackSettingsFromValue(
  value: string
): Pick<ProviderDownloadSettings, "fallbackFormat" | "mp3FallbackQuality"> {
  if (value === "none") {
    return {
      fallbackFormat: "none",
      mp3FallbackQuality: "320"
    };
  }

  return {
    fallbackFormat: "mp3",
    mp3FallbackQuality: mp3FallbackQualityFromValue(value.replace(/^mp3:/, ""))
  };
}

function mp3FallbackQualityFromValue(
  value: string
): ProviderDownloadMp3FallbackQuality {
  return value === "192" || value === "256" ? value : "320";
}

function providerDownloadFallbackValue(settings: ProviderDownloadSettings) {
  return settings.fallbackFormat === "mp3"
    ? `mp3:${settings.mp3FallbackQuality}`
    : "none";
}

function providerDownloadSettingsSavedMessage(
  settings: ProviderDownloadSettings
) {
  return settings.fallbackFormat === "mp3"
    ? `Provider downloads will request Opus up to ${settings.opusQuality} kbps with MP3 ${settings.mp3FallbackQuality} kbps fallback.`
    : `Provider downloads will request Opus up to ${settings.opusQuality} kbps without MP3 fallback.`;
}

function autoScanScheduleLabel(autoScan: MusicLibraryAutoScanStatus) {
  if (!autoScan.settings.enabled) {
    return "Daily scan is off.";
  }

  if (autoScan.scan.state === "running") {
    return autoScan.scan.startedAt
      ? `Library scan running since ${formatSettingsDateTime(
          autoScan.scan.startedAt
        )}.`
      : "Library scan is running.";
  }

  if (autoScan.scan.state === "failed" && autoScan.scan.error) {
    return `Last scan failed: ${autoScan.scan.error}`;
  }

  if (autoScan.nextRunAt) {
    return `Next scan ${formatSettingsDateTime(autoScan.nextRunAt)}.`;
  }

  return "Next scan will be scheduled after saving.";
}

function identityBackfillJobStatusLabel(
  job: MusicLibraryIdentityTagBackfillJob
) {
  if (job.status === "completed") {
    return "Complete";
  }

  if (job.status === "failed") {
    return "Failed";
  }

  if (job.status === "queued") {
    return "Queued";
  }

  return "Running";
}

function identityBackfillJobProgressNote(
  job: MusicLibraryIdentityTagBackfillJob
) {
  if (job.status === "failed") {
    return job.error ?? "SpotifyBU could not backfill Spotify metadata tags.";
  }

  if (job.currentTrackName && isIdentityBackfillJobActive(job)) {
    const position =
      typeof job.currentTrackPosition === "number"
        ? `${numberFormatter.format(job.currentTrackPosition)}. `
        : "";

    return `${position}${job.currentTrackName}`;
  }

  return `${numberFormatter.format(job.taggedCount)} tagged, ${numberFormatter.format(
    job.alreadyTaggedCount
  )} already tagged, ${numberFormatter.format(job.skippedCount)} skipped${
    job.failedCount ? `, ${numberFormatter.format(job.failedCount)} failed` : ""
  }.`;
}

function isIdentityBackfillJobActive(
  job: MusicLibraryIdentityTagBackfillJob
) {
  return job.status === "queued" || job.status === "running";
}

function isIdentityBackfillJobTerminal(
  job: MusicLibraryIdentityTagBackfillJob
) {
  return job.status === "completed" || job.status === "failed";
}

function identityBackfillSummary(
  backfill: MusicLibraryIdentityTagBackfillResult
) {
  const parts = [
    `${numberFormatter.format(backfill.taggedCount)} tagged`,
    `${numberFormatter.format(backfill.alreadyTaggedCount)} already tagged`,
    `${numberFormatter.format(backfill.skippedCount)} skipped`
  ];

  if (backfill.failedCount) {
    parts.push(`${numberFormatter.format(backfill.failedCount)} failed`);
  }

  return `Metadata backfill checked ${numberFormatter.format(
    backfill.trackCount
  )} tracks from ${numberFormatter.format(
    backfill.snapshotCount
  )} snapshots: ${parts.join(", ")}.`;
}

function formatSettingsDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
