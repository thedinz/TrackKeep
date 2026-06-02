"use client";

import { ArrowLeft, CheckCircle2, LockKeyhole, Save } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type AppAuthStatus = {
  authenticated: boolean;
  defaultCredentials: boolean;
  username?: string;
};

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<AppAuthStatus | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  useEffect(() => {
    void fetch("/api/app-auth/session")
      .then((response) => response.json())
      .then((sessionStatus: AppAuthStatus) => {
        setStatus(sessionStatus);
        setUsername(sessionStatus.username ?? "");
      })
      .catch(() => {
        setError("Could not load settings.");
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
                <h2>App Login</h2>
                <p className="muted">Local SpotifyBU credentials</p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {status?.defaultCredentials ? (
              <div className="alert">
                <LockKeyhole size={18} />
                <span>You are still using the default admin/admin login.</span>
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

            <form className="auth-form" onSubmit={submitSettings}>
              <label className="form-field">
                <span className="stat-label">Username</span>
                <input
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  value={username}
                />
              </label>

              <label className="form-field">
                <span className="stat-label">Current Password</span>
                <input
                  autoComplete="current-password"
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
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={newPassword}
                />
              </label>

              <button
                className="command green"
                disabled={
                  isSaving ||
                  !username.trim() ||
                  !currentPassword ||
                  newPassword.length < 8
                }
                type="submit"
              >
                <Save size={18} />
                Save login
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
