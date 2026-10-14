"use client";

import {
  ArrowLeft,
  CircleHelp,
  Download,
  History,
  ListMusic,
  Loader2,
  RotateCcw
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type BackupPlaylist = {
  playlistId: string;
  playlistName: string;
  snapshotCount: number;
  trackCount: number;
  updatedAt: string;
};

type BackupHistoryEntry = {
  changes: {
    addedCount: number;
    removedCount: number;
    reordered: boolean;
  } | null;
  exportedAt: string;
  firstSeenAt: string;
  id: string;
  playlistId: string;
  playlistName: string;
  trackCount: number;
  updatedAt: string;
};

type BackupHistory = {
  snapshots: BackupHistoryEntry[];
  totalCount: number;
};

type BackupTrack = {
  album: string;
  artists: string[];
  id?: string;
  name: string;
  position: number;
};

type BackupSnapshotDetail = {
  isLatest: boolean;
  latestTrackCount: number;
  sinceSnapshot: {
    added: BackupTrack[];
    removed: BackupTrack[];
    reordered: boolean;
  };
  snapshot: {
    firstSeenAt: string;
    id: string;
    playlistId: string;
    playlistName: string;
    trackCount: number;
    tracks: BackupTrack[];
    updatedAt: string;
  };
};

type RestoreTarget = "navidrome" | "plex";

type RestoreResult = {
  matchedCount: number;
  name: string;
  skipped: Array<{
    reason: string;
    trackName: string;
    trackPosition: number;
  }>;
  skippedCount: number;
  songCount: number;
  targetName: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const historyPageSize = 20;

export default function BackupsPage() {
  const historyRequestRef = useRef(0);
  const [playlists, setPlaylists] = useState<BackupPlaylist[] | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [history, setHistory] = useState<BackupHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [detail, setDetail] = useState<BackupSnapshotDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [restoringTarget, setRestoringTarget] = useState<RestoreTarget | null>(
    null
  );
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaylists() {
      try {
        const response = await fetchJson<{ playlists: BackupPlaylist[] }>(
          "/api/playlist-backups"
        );

        if (cancelled) {
          return;
        }

        const requestedPlaylistId =
          new URLSearchParams(window.location.search).get("playlistId") ?? "";

        setPlaylists(response.playlists);
        setSelectedPlaylistId(
          response.playlists.some(
            (playlist) => playlist.playlistId === requestedPlaylistId
          )
            ? requestedPlaylistId
            : (response.playlists[0]?.playlistId ?? "")
        );
      } catch (loadError) {
        if (!cancelled) {
          setPlaylists([]);
          setError(errorMessage(loadError));
        }
      }
    }

    void loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlaylistId) {
      setHistory(null);
      return;
    }

    const requestId = historyRequestRef.current + 1;
    const params = new URLSearchParams({
      limit: String(historyPageSize),
      offset: String(historyPage * historyPageSize),
      playlistId: selectedPlaylistId
    });

    historyRequestRef.current = requestId;

    void fetchJson<BackupHistory>(`/api/playlist-backups?${params.toString()}`)
      .then((response) => {
        if (historyRequestRef.current === requestId) {
          setHistory(response);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (historyRequestRef.current === requestId) {
          setError(errorMessage(loadError));
        }
      });
  }, [historyPage, selectedPlaylistId]);

  const openSnapshot = useCallback(async (backupId: string) => {
    setIsLoadingDetail(true);
    setRestoreResult(null);

    try {
      setDetail(
        await fetchJson<BackupSnapshotDetail>(
          `/api/playlist-backups/${encodeURIComponent(backupId)}`
        )
      );
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const restoreSnapshot = useCallback(
    async (target: RestoreTarget) => {
      if (!detail) {
        return;
      }

      const targetName = target === "plex" ? "Plex" : "Navidrome";

      if (
        !window.confirm(
          `Restore "${detail.snapshot.playlistName}" to ${targetName} from the snapshot saved ${formatDateTime(
            detail.snapshot.firstSeenAt
          )}?\n\nIf ${targetName} already has a playlist with this name, its contents are replaced. Only tracks found in your music library can be included.`
        )
      ) {
        return;
      }

      setRestoringTarget(target);
      setRestoreResult(null);
      setError(null);

      try {
        const response = await fetch(
          `/api/playlist-backups/${encodeURIComponent(detail.snapshot.id)}/restore`,
          {
            body: JSON.stringify({ target }),
            cache: "no-store",
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          }
        );
        const result = await readJson<{ musicLibraryPlaylist: RestoreResult }>(
          response
        );

        setRestoreResult(result.musicLibraryPlaylist);
      } catch (restoreError) {
        setError(errorMessage(restoreError));
      } finally {
        setRestoringTarget(null);
      }
    },
    [detail]
  );

  const historyPageCount = Math.max(
    1,
    Math.ceil((history?.totalCount ?? 0) / historyPageSize)
  );

  return (
    <main className="app-shell settings-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img alt="" src="/icon.svg" />
          </div>
          <div>
            <p className="eyebrow">TrackKeep</p>
            <h1>Backup History</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <a className="icon-command" href="/help" title="How TrackKeep works">
            <CircleHelp size={18} />
            Help
          </a>
          <a className="icon-command" href="/" title="Back to dashboard">
            <ArrowLeft size={18} />
            Dashboard
          </a>
        </div>
      </header>

      {error ? (
        <div className="alert danger" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="backups-grid">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <History size={20} />
              <div>
                <h2>Snapshots</h2>
                <p className="muted">
                  One entry each time a playlist's name or track list changed
                </p>
              </div>
            </div>
          </div>

          <div className="settings-body">
            {playlists === null ? (
              <p className="muted">Loading playlist backups</p>
            ) : playlists.length ? (
              <>
                <label className="provider-field">
                  <span>Playlist</span>
                  <select
                    onChange={(event) => {
                      setSelectedPlaylistId(event.target.value);
                      setHistoryPage(0);
                      setDetail(null);
                      setRestoreResult(null);
                    }}
                    value={selectedPlaylistId}
                  >
                    {playlists.map((playlist) => (
                      <option key={playlist.playlistId} value={playlist.playlistId}>
                        {playlist.playlistName} (
                        {numberFormatter.format(playlist.snapshotCount)})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="backups-snapshot-list">
                  {(history?.snapshots ?? []).map((snapshot, index) => (
                    <button
                      aria-pressed={detail?.snapshot.id === snapshot.id}
                      className={`backups-snapshot ${
                        detail?.snapshot.id === snapshot.id ? "selected" : ""
                      }`}
                      key={snapshot.id}
                      onClick={() => void openSnapshot(snapshot.id)}
                      type="button"
                    >
                      <strong>
                        {formatDateTime(snapshot.firstSeenAt)}
                        {historyPage === 0 && index === 0 ? " - newest" : ""}
                      </strong>
                      <span>
                        {snapshot.playlistName} -{" "}
                        {numberFormatter.format(snapshot.trackCount)} tracks
                      </span>
                      <span>{snapshotChangesLabel(snapshot.changes)}</span>
                      {snapshot.updatedAt !== snapshot.firstSeenAt ? (
                        <span>
                          Unchanged until {formatDateTime(snapshot.updatedAt)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                {history && history.totalCount > historyPageSize ? (
                  <div className="backups-pager">
                    <button
                      className="command secondary compact"
                      disabled={historyPage <= 0}
                      onClick={() => setHistoryPage((page) => page - 1)}
                      type="button"
                    >
                      Newer
                    </button>
                    <span className="muted">
                      Page {historyPage + 1} of {historyPageCount}
                    </span>
                    <button
                      className="command secondary compact"
                      disabled={historyPage >= historyPageCount - 1}
                      onClick={() => setHistoryPage((page) => page + 1)}
                      type="button"
                    >
                      Older
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">
                No playlist backups yet. Open a playlist on the dashboard and
                TrackKeep saves its first snapshot.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <ListMusic size={20} />
              <div>
                <h2>{detail?.snapshot.playlistName ?? "Snapshot"}</h2>
                <p className="muted">
                  {detail
                    ? `Saved ${formatDateTime(
                        detail.snapshot.firstSeenAt
                      )} - ${numberFormatter.format(
                        detail.snapshot.tracks.length
                      )} tracks`
                    : isLoadingDetail
                      ? "Loading snapshot"
                      : "Choose a snapshot to view it"}
                </p>
              </div>
            </div>
          </div>

          {detail ? (
            <div className="settings-body">
              <p className="backups-comparison">
                {snapshotComparisonLabel(detail)}
              </p>

              {detail.sinceSnapshot.removed.length ? (
                <BackupTrackList
                  title="In this snapshot, gone from the playlist now"
                  tracks={detail.sinceSnapshot.removed}
                />
              ) : null}
              {detail.sinceSnapshot.added.length ? (
                <BackupTrackList
                  title="Added to the playlist since this snapshot"
                  tracks={detail.sinceSnapshot.added}
                />
              ) : null}

              <div className="backups-actions">
                <a
                  className="command secondary compact"
                  download
                  href={`/api/playlist-backups/${encodeURIComponent(
                    detail.snapshot.id
                  )}?download=1`}
                >
                  <Download size={16} />
                  Export JSON
                </a>
                {(["navidrome", "plex"] as const).map((target) => (
                  <button
                    className="command secondary compact"
                    disabled={Boolean(restoringTarget)}
                    key={target}
                    onClick={() => void restoreSnapshot(target)}
                    title="Create or replace the server playlist from this snapshot"
                    type="button"
                  >
                    {restoringTarget === target ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    Restore to {target === "plex" ? "Plex" : "Navidrome"}
                  </button>
                ))}
              </div>

              {restoreResult ? (
                <div className="backups-restore-result" role="status">
                  <strong>
                    Restored "{restoreResult.name}" to {restoreResult.targetName}{" "}
                    with {numberFormatter.format(restoreResult.songCount)} of{" "}
                    {numberFormatter.format(detail.snapshot.tracks.length)}{" "}
                    tracks.
                  </strong>
                  {restoreResult.skipped.length ? (
                    <>
                      <span>
                        {numberFormatter.format(restoreResult.skippedCount)}{" "}
                        skipped because they are not in the music library:
                      </span>
                      <ul>
                        {restoreResult.skipped.map((skipped) => (
                          <li key={skipped.trackPosition}>
                            {skipped.trackPosition}. {skipped.trackName} -{" "}
                            {skipped.reason}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              <BackupTrackList
                showPosition
                title="Tracks in this snapshot"
                tracks={detail.snapshot.tracks}
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function BackupTrackList({
  showPosition = false,
  title,
  tracks
}: {
  showPosition?: boolean;
  title: string;
  tracks: BackupTrack[];
}) {
  return (
    <div className="backups-track-section">
      <span className="stat-label">
        {title} - {numberFormatter.format(tracks.length)}
      </span>
      <ol className="backups-track-list">
        {tracks.map((track, index) => (
          <li key={`${track.position}-${track.id ?? track.name}-${index}`}>
            <strong>
              {showPosition ? `${track.position}. ` : ""}
              {track.name}
            </strong>
            <span>
              {(track.artists ?? []).join(", ")}
              {track.album ? ` - ${track.album}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function snapshotChangesLabel(changes: BackupHistoryEntry["changes"]) {
  if (!changes) {
    return "Earliest snapshot shown";
  }

  const parts = [
    changes.addedCount
      ? `${numberFormatter.format(changes.addedCount)} added`
      : "",
    changes.removedCount
      ? `${numberFormatter.format(changes.removedCount)} removed`
      : "",
    changes.reordered ? "order changed" : ""
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Renamed, same tracks";
}

function snapshotComparisonLabel(detail: BackupSnapshotDetail) {
  if (detail.isLatest) {
    return "This is the newest snapshot of the playlist.";
  }

  const { added, removed, reordered } = detail.sinceSnapshot;
  const parts = [
    added.length ? `${numberFormatter.format(added.length)} added` : "",
    removed.length ? `${numberFormatter.format(removed.length)} removed` : "",
    reordered ? "order changed" : ""
  ].filter(Boolean);

  return `Since this snapshot: ${
    parts.length ? parts.join(", ") : "no track changes"
  }. The newest snapshot has ${numberFormatter.format(
    detail.latestTrackCount
  )} tracks.`;
}

async function fetchJson<T>(url: string) {
  return readJson<T>(
    await fetch(url, {
      cache: "no-store"
    })
  );
}

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed."
    );
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
