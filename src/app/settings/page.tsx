"use client";

import {
  Activity,
  ArrowLeft,
  CheckCircle2,
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

type NamingMode = "manual" | "lidarr" | "spotifybu";

type OrganizeNamingSettings = {
  artistFolderFormat: string;
  colonReplacementFormat: number;
  lidarr: {
    apiKeySet: boolean;
    baseUrl: string;
  };
  mode: NamingMode;
  multiDiscTrackFormat: string;
  replaceIllegalCharacters: boolean;
  standardTrackFormat: string;
};

type OrganizeSettingsResponse = {
  naming: OrganizeNamingSettings;
};

type LidarrTestResponse = {
  message: string;
  ok: boolean;
};

const defaultOrganizeNamingTemplates = {
  artistFolderFormat: "{Album Artist Name}",
  colonReplacementFormat: 4,
  multiDiscTrackFormat:
    "{Album Artist Name} - {Release Year} - {Album Title}/{medium:00}{track:00} - {Track Title}",
  replaceIllegalCharacters: true,
  standardTrackFormat:
    "{Album Artist Name} - {Release Year} - {Album Title}/{medium:00}{track:00} - {Track Title}"
};

const namingModes: Array<{ id: NamingMode; label: string }> = [
  { id: "spotifybu", label: "SpotifyBU" },
  { id: "lidarr", label: "Lidarr" },
  { id: "manual", label: "Manual" }
];

const colonReplacementOptions = [
  { label: "Remove colon", value: 0 },
  { label: "Dash", value: 1 },
  { label: "Space dash", value: 2 },
  { label: "Spaced dash", value: 3 },
  { label: "Smart dash", value: 4 }
];

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAuthMode, setIsSavingAuthMode] = useState(false);
  const [isSavingNaming, setIsSavingNaming] = useState(false);
  const [isTestingLidarr, setIsTestingLidarr] = useState(false);
  const [lidarrApiKey, setLidarrApiKey] = useState("");
  const [lidarrMessage, setLidarrMessage] = useState<string | null>(null);
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

  const updateNamingSettings = useCallback(
    (update: Partial<OrganizeNamingSettings>) => {
      setNamingSettings((current) =>
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

  const updateLidarrSettings = useCallback(
    (update: Partial<OrganizeNamingSettings["lidarr"]>) => {
      setNamingSettings((current) =>
        current
          ? {
              ...current,
              lidarr: {
                ...current.lidarr,
                ...update
              }
            }
          : current
      );
    },
    []
  );

  const changeNamingMode = useCallback((mode: NamingMode) => {
    setNamingSettings((current) => {
      if (!current) {
        return current;
      }

      if (mode === "spotifybu") {
        return {
          ...current,
          ...defaultOrganizeNamingTemplates,
          mode
        };
      }

      return {
        ...current,
        mode
      };
    });
    setLidarrMessage(null);
    setSuccess(null);
    setError(null);
  }, []);

  const loadLidarrNaming = useCallback(async () => {
    if (!namingSettings) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLidarrMessage(null);
    setIsTestingLidarr(true);

    try {
      const response = await fetch("/api/lidarr/naming/sync", {
        body: JSON.stringify({
          apiKey: lidarrApiKey,
          baseUrl: namingSettings.lidarr.baseUrl
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const body = await readJson<OrganizeSettingsResponse>(response);

      setNamingSettings(body.naming);
      setLidarrApiKey("");
      setSuccess("Loaded Lidarr organize scheme.");
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Could not load Lidarr naming."
      );
    } finally {
      setIsTestingLidarr(false);
    }
  }, [lidarrApiKey, namingSettings]);

  const testLidarr = useCallback(async () => {
    if (!namingSettings) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLidarrMessage(null);
    setIsTestingLidarr(true);

    try {
      const response = await fetch("/api/lidarr/test", {
        body: JSON.stringify({
          apiKey: lidarrApiKey,
          baseUrl: namingSettings.lidarr.baseUrl
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const body = await readJson<LidarrTestResponse>(response);

      setLidarrMessage(body.message);
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Could not test Lidarr."
      );
    } finally {
      setIsTestingLidarr(false);
    }
  }, [lidarrApiKey, namingSettings]);

  const submitNamingSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!namingSettings) {
        return;
      }

      setError(null);
      setSuccess(null);
      setLidarrMessage(null);
      setIsSavingNaming(true);

      try {
        const response = await fetch("/api/organize-settings", {
          body: JSON.stringify({
            naming: {
              artistFolderFormat: namingSettings.artistFolderFormat,
              colonReplacementFormat: namingSettings.colonReplacementFormat,
              lidarr: {
                apiKey: lidarrApiKey,
                baseUrl: namingSettings.lidarr.baseUrl
              },
              mode: namingSettings.mode,
              multiDiscTrackFormat: namingSettings.multiDiscTrackFormat,
              replaceIllegalCharacters: namingSettings.replaceIllegalCharacters,
              standardTrackFormat: namingSettings.standardTrackFormat
            }
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        let body = await readJson<OrganizeSettingsResponse>(response);

        if (body.naming.mode === "lidarr") {
          const syncResponse = await fetch("/api/lidarr/naming/sync", {
            body: JSON.stringify({
              apiKey: lidarrApiKey,
              baseUrl: body.naming.lidarr.baseUrl
            }),
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          });

          body = await readJson<OrganizeSettingsResponse>(syncResponse);
        }

        setNamingSettings(body.naming);
        setLidarrApiKey("");
        setSuccess(
          body.naming.mode === "lidarr"
            ? "Organize scheme saved from Lidarr."
            : "Organize scheme saved."
        );
      } catch (settingsError) {
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save organize settings."
        );
      } finally {
        setIsSavingNaming(false);
      }
    },
    [lidarrApiKey, namingSettings]
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
              <SlidersHorizontal size={20} />
              <div>
                <h2>Organize Scheme</h2>
                <p className="muted">Match SpotifyBU, Lidarr, or a manual layout</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {namingSettings ? (
              <form className="auth-form organize-form" onSubmit={submitNamingSettings}>
                <div
                  aria-label="Organize naming mode"
                  className="segmented-control"
                  role="radiogroup"
                >
                  {namingModes.map((mode) => (
                    <button
                      aria-checked={namingSettings.mode === mode.id}
                      className={namingSettings.mode === mode.id ? "active" : ""}
                      key={mode.id}
                      onClick={() => changeNamingMode(mode.id)}
                      role="radio"
                      type="button"
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {namingSettings.mode === "spotifybu" ? (
                  <div className="auth-note">
                    <CheckCircle2 size={18} />
                    <span>
                      Uses the current SpotifyBU default:
                      Artist / Artist - Release Year - Album /
                      0103 - Track.
                    </span>
                  </div>
                ) : null}

                {namingSettings.mode === "lidarr" ? (
                  <div className="settings-subsection">
                    <label className="form-field">
                      <span className="stat-label">Lidarr URL</span>
                      <input
                        onChange={(event) =>
                          updateLidarrSettings({ baseUrl: event.target.value })
                        }
                        placeholder="http://lidarr:8686"
                        value={namingSettings.lidarr.baseUrl}
                      />
                    </label>

                    <label className="form-field">
                      <span className="stat-label">Lidarr API Key</span>
                      <input
                        autoComplete="off"
                        onChange={(event) => setLidarrApiKey(event.target.value)}
                        placeholder={
                          namingSettings.lidarr.apiKeySet ? "Saved" : "API key"
                        }
                        type="password"
                        value={lidarrApiKey}
                      />
                    </label>

                    <div className="settings-actions">
                      <button
                        className="icon-command"
                        disabled={isTestingLidarr}
                        onClick={() => void testLidarr()}
                        type="button"
                      >
                        {isTestingLidarr ? (
                          <RefreshCw className="spin" size={18} />
                        ) : (
                          <Activity size={18} />
                        )}
                        Test
                      </button>

                      <button
                        className="icon-command"
                        disabled={isTestingLidarr}
                        onClick={() => void loadLidarrNaming()}
                        type="button"
                      >
                        <RefreshCw
                          className={isTestingLidarr ? "spin" : undefined}
                          size={18}
                        />
                        Load from Lidarr
                      </button>
                    </div>

                    {lidarrMessage ? (
                      <div className="auth-note">
                        <Server size={18} />
                        <span>{lidarrMessage}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="settings-subsection">
                  <label className="form-field">
                    <span className="stat-label">Artist Folder Format</span>
                    <input
                      disabled={namingSettings.mode !== "manual"}
                      onChange={(event) =>
                        updateNamingSettings({
                          artistFolderFormat: event.target.value
                        })
                      }
                      value={namingSettings.artistFolderFormat}
                    />
                  </label>

                  <label className="form-field wide-field">
                    <span className="stat-label">Standard Track Format</span>
                    <textarea
                      disabled={namingSettings.mode !== "manual"}
                      onChange={(event) =>
                        updateNamingSettings({
                          standardTrackFormat: event.target.value
                        })
                      }
                      value={namingSettings.standardTrackFormat}
                    />
                  </label>

                  <label className="form-field wide-field">
                    <span className="stat-label">Multi-Disc Track Format</span>
                    <textarea
                      disabled={namingSettings.mode !== "manual"}
                      onChange={(event) =>
                        updateNamingSettings({
                          multiDiscTrackFormat: event.target.value
                        })
                      }
                      value={namingSettings.multiDiscTrackFormat}
                    />
                  </label>

                  <div className="settings-inline-grid">
                    <label className="checkbox-field">
                      <input
                        checked={namingSettings.replaceIllegalCharacters}
                        disabled={namingSettings.mode !== "manual"}
                        onChange={(event) =>
                          updateNamingSettings({
                            replaceIllegalCharacters: event.target.checked
                          })
                        }
                        type="checkbox"
                      />
                      <span>Replace illegal characters</span>
                    </label>

                    <label className="form-field">
                      <span className="stat-label">Colon Replacement</span>
                      <select
                        disabled={namingSettings.mode !== "manual"}
                        onChange={(event) =>
                          updateNamingSettings({
                            colonReplacementFormat: Number(event.target.value)
                          })
                        }
                        value={namingSettings.colonReplacementFormat}
                      >
                        {colonReplacementOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <button
                  className="command green"
                  disabled={isSavingNaming}
                  type="submit"
                >
                  <Save size={18} />
                  Save organize scheme
                </button>
              </form>
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
