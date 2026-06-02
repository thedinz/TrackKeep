"use client";

import { LockKeyhole, LogIn, Music2 } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type AppInfo = {
  branch: string;
  version: string;
};

export default function LoginPage() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    void fetch("/api/app-info")
      .then((response) => response.json())
      .then(setAppInfo)
      .catch(() =>
        setAppInfo({
          branch: "unknown",
          version: "unknown"
        })
      );
  }, []);

  const submitLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);

      try {
        const response = await fetch("/api/app-auth/login", {
          body: JSON.stringify({
            password,
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
            typeof body.error === "string" ? body.error : "Login failed."
          );
        }

        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href =
          next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      } catch (loginError) {
        setError(
          loginError instanceof Error ? loginError.message : "Login failed."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, username]
  );

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-note">BU</span>
          </div>
          <div>
            <p className="eyebrow">SpotifyBU</p>
            <h1>Sign in</h1>
          </div>
        </div>

        {error ? (
          <div className="alert danger">
            <LockKeyhole size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={submitLogin}>
          <label className="form-field">
            <span className="stat-label">Username</span>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              value={username}
            />
          </label>

          <label className="form-field">
            <span className="stat-label">Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="admin"
              type="password"
              value={password}
            />
          </label>

          <button
            className="command green"
            disabled={isSubmitting || !username || !password}
            type="submit"
          >
            <LogIn size={18} />
            Sign in
          </button>
        </form>

        <div className="auth-note">
          <Music2 size={18} />
          <span>Default login is admin/admin. Change it in Settings after signing in.</span>
        </div>
      </section>

      <footer className="app-footer auth-footer">
        <span>SpotifyBU</span>
        <span>v{appInfo?.version ?? "..."}</span>
        <span>{appInfo?.branch ?? "..."} branch</span>
      </footer>
    </main>
  );
}
