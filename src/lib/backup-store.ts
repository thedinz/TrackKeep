import { createHash, randomBytes } from "crypto";
import { getSpotifyBuDatabase } from "./database";
import {
  buildBackupPayload,
  type BackupPayload,
  type BackupTrack,
  type PlaylistSummary
} from "./spotify";

export type PersistedPlaylistBackupSummary = {
  exportedAt: string;
  id: string;
  playlistId: string;
  playlistName: string;
  source: string;
  trackCount: number;
  updatedAt: string;
};

export type PersistedPlaylistBackupSnapshot = PersistedPlaylistBackupSummary & {
  playlist: PlaylistSummary;
  tracks: BackupTrack[];
};

type PlaylistBackupRow = {
  exported_at: string;
  id: string;
  playlist_id: string;
  playlist_name: string;
  source: string;
  track_count: number;
  updated_at: string;
};

type PlaylistBackupSnapshotRow = PlaylistBackupRow & {
  payload_json: string;
};

export function persistPlaylistBackup({
  playlist,
  source,
  tracks
}: {
  playlist: PlaylistSummary;
  source: "export" | "playlist-load";
  tracks: BackupTrack[];
}) {
  const db = getSpotifyBuDatabase();
  const payload = buildBackupPayload(playlist, tracks);
  const payloadJson = JSON.stringify(payload);
  const snapshotHash = createHash("sha256").update(payloadJson).digest("hex");
  const now = new Date().toISOString();
  const id = playlistBackupId();

  db.prepare(
    `
      INSERT INTO playlist_backups (
        id,
        playlist_id,
        playlist_name,
        owner_name,
        owner_id,
        track_count,
        exported_at,
        snapshot_hash,
        source,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (playlist_id, snapshot_hash) DO UPDATE SET
        playlist_name = excluded.playlist_name,
        owner_name = excluded.owner_name,
        owner_id = excluded.owner_id,
        track_count = excluded.track_count,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
  ).run(
    id,
    playlist.id,
    playlist.name,
    playlist.owner,
    playlist.ownerId ?? null,
    tracks.length,
    payload.exportedAt,
    snapshotHash,
    source,
    payloadJson,
    now,
    now
  );

  const row = db.prepare(
    `
      SELECT
        exported_at,
        id,
        playlist_id,
        playlist_name,
        source,
        track_count,
        updated_at
      FROM playlist_backups
      WHERE playlist_id = ? AND snapshot_hash = ?
      LIMIT 1
    `
  ).get(playlist.id, snapshotHash) as PlaylistBackupRow | undefined;

  return row ? playlistBackupSummaryFromRow(row) : null;
}

export function getLatestPlaylistBackupSummaries(playlistIds?: string[]) {
  const allowedPlaylistIds = playlistIds?.length ? new Set(playlistIds) : null;
  const summaries = getLatestPlaylistBackupRows()
    .map(playlistBackupSummaryFromRow)
    .filter((summary) => !allowedPlaylistIds || allowedPlaylistIds.has(summary.playlistId));

  return Object.fromEntries(
    summaries.map((summary) => [summary.playlistId, summary])
  ) as Record<string, PersistedPlaylistBackupSummary>;
}

export function getLatestPlaylistBackupSnapshots(playlistIds?: string[]) {
  const allowedPlaylistIds = playlistIds?.length ? new Set(playlistIds) : null;
  const snapshots = getLatestPlaylistBackupRows({
    includePayload: true
  })
    .filter((row) => !allowedPlaylistIds || allowedPlaylistIds.has(row.playlist_id))
    .map(playlistBackupSnapshotFromRow)
    .filter(
      (snapshot): snapshot is PersistedPlaylistBackupSnapshot =>
        Boolean(snapshot)
    );

  return Object.fromEntries(
    snapshots.map((snapshot) => [snapshot.playlistId, snapshot])
  ) as Record<string, PersistedPlaylistBackupSnapshot>;
}

function getLatestPlaylistBackupRows(): PlaylistBackupRow[];
function getLatestPlaylistBackupRows(options: {
  includePayload: true;
}): PlaylistBackupSnapshotRow[];
function getLatestPlaylistBackupRows(options?: { includePayload?: boolean }) {
  const db = getSpotifyBuDatabase();
  const payloadColumn = options?.includePayload ? ",\n        payload_json" : "";

  const rows = db.prepare(
    `
      SELECT
        exported_at,
        id,
        playlist_id,
        playlist_name,
        source,
        track_count,
        updated_at${payloadColumn}
      FROM playlist_backups AS backup
      WHERE backup.id = (
        SELECT latest.id
        FROM playlist_backups AS latest
        WHERE latest.playlist_id = backup.playlist_id
        ORDER BY latest.created_at DESC, latest.id DESC
        LIMIT 1
      )
      ORDER BY playlist_name COLLATE NOCASE ASC
    `
  ).all() as PlaylistBackupRow[];

  return rows;
}

function playlistBackupSummaryFromRow(
  row: PlaylistBackupRow
): PersistedPlaylistBackupSummary {
  return {
    exportedAt: row.exported_at,
    id: row.id,
    playlistId: row.playlist_id,
    playlistName: row.playlist_name,
    source: row.source,
    trackCount: row.track_count,
    updatedAt: row.updated_at
  };
}

function playlistBackupSnapshotFromRow(
  row: PlaylistBackupSnapshotRow
): PersistedPlaylistBackupSnapshot | null {
  let payload: Partial<BackupPayload>;

  try {
    payload = JSON.parse(row.payload_json) as Partial<BackupPayload>;
  } catch {
    return null;
  }

  if (
    payload.version !== 1 ||
    !payload.playlist ||
    !Array.isArray(payload.tracks)
  ) {
    return null;
  }

  return {
    ...playlistBackupSummaryFromRow(row),
    playlist: payload.playlist,
    tracks: payload.tracks
  };
}

function playlistBackupId() {
  return `pb-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}
