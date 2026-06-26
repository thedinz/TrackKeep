"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  LockKeyhole,
  RefreshCw,
  Save,
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

type NavidromeAutoScanSettings = {
  enabled: boolean;
  time: string;
  timeZone: string;
};

type NavidromeAutoScanStatus = {
  lastScheduledAt?: string;
  nextRunAt?: string;
  scan: {
    completedAt?: string;
    error?: string;
    startedAt?: string;
    state: "failed" | "idle" | "running" | "succeeded";
  };
  settings: NavidromeAutoScanSettings;
};

type NavidromeAutoScanResponse = {
  autoScan: NavidromeAutoScanStatus;
};

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAuthMode, setIsSavingAuthMode] = useState(false);
  const [isSavingAutoScan, setIsSavingAutoScan] = useState(false);
  const [autoScan, setAutoScan] = useState<NavidromeAutoScanStatus | null>(null);
  const [namingSettings, setNamingSettings] =
    useState<OrganizeNamingSettings | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [authMode, setAuthMode] = useState<"external" | "internal">("internal");
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

    void fetch("/api/navidrome/library/auto-scan")
      .then(readJson<NavidromeAutoScanResponse>)
      .then((response) => {
        setAutoScan(withBrowserTimeZoneDefault(response.autoScan));
      })
      .catch(() => {
        setError("Could not load Navidrome auto scan settings.");
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
    (update: Partial<NavidromeAutoScanSettings>) => {
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
        const response = await fetch("/api/navidrome/library/auto-scan", {
          body: JSON.stringify({
            autoScan: autoScan.settings
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const body = await readJson<NavidromeAutoScanResponse>(response);

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
              <Clock size={20} />
              <div>
                <h2>Navidrome Auto Scan</h2>
                <p className="muted">Daily library index and server rescan</p>
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
                <h2>Organize Scheme</h2>
                <p className="muted">Choose how SpotifyBU stages organized Navidrome files</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {namingSettings ? (
              <div className="auth-form organize-form">
                <div className="auth-note">
                  <CheckCircle2 size={18} />
                  <span>
                    SpotifyBU uses one Spotify metadata layout for organized
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
  autoScan: NavidromeAutoScanStatus
): NavidromeAutoScanStatus {
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

function autoScanScheduleLabel(autoScan: NavidromeAutoScanStatus) {
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
