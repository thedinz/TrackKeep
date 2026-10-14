import { createHash, randomBytes } from "crypto";
import type { DatabaseSync } from "node:sqlite";
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

export type PlaylistBackupChanges = {
  addedCount: number;
  removedCount: number;
  reordered: boolean;
};

export type PlaylistBackupTrackDiff = {
  added: BackupTrack[];
  removed: BackupTrack[];
  reordered: boolean;
};

export type PlaylistBackupPlaylistSummary = {
  playlistId: string;
  playlistName: string;
  snapshotCount: number;
  trackCount: number;
  updatedAt: string;
};

export type PlaylistBackupHistoryEntry = PersistedPlaylistBackupSummary & {
  changes: PlaylistBackupChanges | null;
  firstSeenAt: string;
};

export type PlaylistBackupHistory = {
  snapshots: PlaylistBackupHistoryEntry[];
  totalCount: number;
};

export type PlaylistBackupSnapshotDetail = {
  isLatest: boolean;
  latestTrackCount: number;
  sinceSnapshot: PlaylistBackupTrackDiff;
  snapshot: PersistedPlaylistBackupSnapshot & {
    firstSeenAt: string;
  };
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

type PlaylistBackupHistoryRow = PlaylistBackupSnapshotRow & {
  created_at: string;
};

const maxPlaylistBackupHistoryPageSize = 50;
const playlistBackupSchemaVersion = 1;
const compactedPlaylistBackupDatabases = new WeakSet<DatabaseSync>();
const playlistBackupHistoryColumns = `
  created_at,
  exported_at,
  id,
  playlist_id,
  playlist_name,
  source,
  track_count,
  updated_at,
  payload_json
`;

export function persistPlaylistBackup({
  playlist,
  source,
  tracks
}: {
  playlist: PlaylistSummary;
  source: "export" | "playlist-load";
  tracks: BackupTrack[];
}) {
  const db = getPlaylistBackupDatabase();
  const payload = buildBackupPayload(playlist, tracks);
  const payloadJson = JSON.stringify(payload);
  const contentHash = playlistBackupContentHash(playlist.name, tracks);
  const now = new Date().toISOString();
  const latest = db
    .prepare(
      `
        SELECT id, snapshot_hash
        FROM playlist_backups
        WHERE playlist_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `
    )
    .get(playlist.id) as { id: string; snapshot_hash: string } | undefined;
  let id = latest?.id ?? "";

  // An unchanged playlist refreshes its newest snapshot instead of adding a
  // copy. Only the newest one is compared, so a playlist that changes and
  // then changes back still records each step.
  if (latest?.snapshot_hash.startsWith(`${contentHash}:`)) {
    db.prepare(
      `
        UPDATE playlist_backups
        SET
          playlist_name = ?,
          owner_name = ?,
          owner_id = ?,
          track_count = ?,
          exported_at = ?,
          source = ?,
          payload_json = ?,
          updated_at = ?
        WHERE id = ?
      `
    ).run(
      playlist.name,
      playlist.owner,
      playlist.ownerId ?? null,
      tracks.length,
      payload.exportedAt,
      source,
      payloadJson,
      now,
      id
    );
  } else {
    id = playlistBackupId();
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
      `
    ).run(
      id,
      playlist.id,
      playlist.name,
      playlist.owner,
      playlist.ownerId ?? null,
      tracks.length,
      payload.exportedAt,
      playlistBackupSnapshotHash(contentHash, id),
      source,
      payloadJson,
      now,
      now
    );
  }

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
      WHERE id = ?
      LIMIT 1
    `
  ).get(id) as PlaylistBackupRow | undefined;

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

export function listPlaylistBackupPlaylists(): PlaylistBackupPlaylistSummary[] {
  const rows = getPlaylistBackupDatabase()
    .prepare(
      `
        SELECT
          backup.playlist_id,
          backup.playlist_name,
          backup.track_count,
          backup.updated_at,
          (
            SELECT COUNT(*)
            FROM playlist_backups AS counted
            WHERE counted.playlist_id = backup.playlist_id
          ) AS snapshot_count
        FROM playlist_backups AS backup
        WHERE backup.id = (
          SELECT latest.id
          FROM playlist_backups AS latest
          WHERE latest.playlist_id = backup.playlist_id
          ORDER BY latest.created_at DESC, latest.rowid DESC
          LIMIT 1
        )
        ORDER BY playlist_name COLLATE NOCASE ASC
      `
    )
    .all() as Array<{
    playlist_id: string;
    playlist_name: string;
    snapshot_count: number;
    track_count: number;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    playlistId: row.playlist_id,
    playlistName: row.playlist_name,
    snapshotCount: row.snapshot_count,
    trackCount: row.track_count,
    updatedAt: row.updated_at
  }));
}

export function listPlaylistBackupHistory(
  playlistId: string,
  {
    limit,
    offset
  }: {
    limit?: number;
    offset?: number;
  } = {}
): PlaylistBackupHistory {
  const db = getPlaylistBackupDatabase();
  const pageSize = Math.min(
    Math.max(Math.round(Number(limit) || maxPlaylistBackupHistoryPageSize), 1),
    maxPlaylistBackupHistoryPageSize
  );
  const pageOffset = Math.max(Math.round(Number(offset) || 0), 0);
  // One extra row gives the oldest entry on the page a snapshot to compare
  // against.
  const rows = db
    .prepare(
      `
        SELECT ${playlistBackupHistoryColumns}
        FROM playlist_backups
        WHERE playlist_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(playlistId, pageSize + 1, pageOffset) as PlaylistBackupHistoryRow[];
  const total = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM playlist_backups
        WHERE playlist_id = ?
      `
    )
    .get(playlistId) as { count: number };
  const trackLists = rows.map(
    (row) => playlistBackupSnapshotFromRow(row)?.tracks ?? null
  );

  return {
    snapshots: rows.slice(0, pageSize).map((row, index) => {
      const tracks = trackLists[index];
      const previousTracks = trackLists[index + 1];
      const diff =
        tracks && previousTracks
          ? diffPlaylistBackupTracks(previousTracks, tracks)
          : null;

      return {
        ...playlistBackupSummaryFromRow(row),
        changes: diff
          ? {
              addedCount: diff.added.length,
              removedCount: diff.removed.length,
              reordered: diff.reordered
            }
          : null,
        firstSeenAt: row.created_at
      };
    }),
    totalCount: total.count
  };
}

export function getPlaylistBackupSnapshotDetail(
  backupId: string
): PlaylistBackupSnapshotDetail | null {
  const db = getPlaylistBackupDatabase();
  const row = db
    .prepare(
      `
        SELECT ${playlistBackupHistoryColumns}
        FROM playlist_backups
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(backupId) as PlaylistBackupHistoryRow | undefined;
  const snapshot = row ? playlistBackupSnapshotFromRow(row) : null;

  if (!row || !snapshot) {
    return null;
  }

  const latestRow = db
    .prepare(
      `
        SELECT ${playlistBackupHistoryColumns}
        FROM playlist_backups
        WHERE playlist_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `
    )
    .get(row.playlist_id) as PlaylistBackupHistoryRow | undefined;
  const latestTracks =
    (latestRow && latestRow.id !== row.id
      ? playlistBackupSnapshotFromRow(latestRow)?.tracks
      : null) ?? snapshot.tracks;

  return {
    isLatest: !latestRow || latestRow.id === row.id,
    latestTrackCount: latestTracks.length,
    sinceSnapshot: diffPlaylistBackupTracks(snapshot.tracks, latestTracks),
    snapshot: {
      ...snapshot,
      firstSeenAt: row.created_at
    }
  };
}

export function getPlaylistBackupExport(backupId: string) {
  const row = getPlaylistBackupDatabase()
    .prepare(
      `
        SELECT created_at, payload_json, playlist_name
        FROM playlist_backups
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(backupId) as
    | { created_at: string; payload_json: string; playlist_name: string }
    | undefined;

  return row
    ? {
        firstSeenAt: row.created_at,
        payloadJson: row.payload_json,
        playlistName: row.playlist_name
      }
    : null;
}

export function diffPlaylistBackupTracks(
  before: BackupTrack[],
  after: BackupTrack[]
): PlaylistBackupTrackDiff {
  const unmatched = new Map<string, number>();

  for (const track of before) {
    const key = playlistBackupTrackKey(track);

    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const added: BackupTrack[] = [];
  const keptAfter: string[] = [];

  for (const track of after) {
    const key = playlistBackupTrackKey(track);
    const count = unmatched.get(key) ?? 0;

    if (count > 0) {
      unmatched.set(key, count - 1);
      keptAfter.push(key);
    } else {
      added.push(track);
    }
  }

  const removed: BackupTrack[] = [];
  const keptBefore: string[] = [];

  // Whatever is still unmatched was removed. Walking backwards drops the
  // later copies of a track that appears more than once.
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const key = playlistBackupTrackKey(before[index]);
    const count = unmatched.get(key) ?? 0;

    if (count > 0) {
      unmatched.set(key, count - 1);
      removed.unshift(before[index]);
    } else {
      keptBefore.unshift(key);
    }
  }

  return {
    added,
    removed,
    reordered: keptBefore.some((key, index) => key !== keptAfter[index])
  };
}

function getLatestPlaylistBackupRows(): PlaylistBackupRow[];
function getLatestPlaylistBackupRows(options: {
  includePayload: true;
}): PlaylistBackupSnapshotRow[];
function getLatestPlaylistBackupRows(options?: { includePayload?: boolean }) {
  const db = getPlaylistBackupDatabase();
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
        ORDER BY latest.created_at DESC, latest.rowid DESC
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

function getPlaylistBackupDatabase() {
  const db = getSpotifyBuDatabase();

  if (!compactedPlaylistBackupDatabases.has(db)) {
    compactedPlaylistBackupDatabases.add(db);
    compactLegacyPlaylistBackups(db);
  }

  return db;
}

// Before 1.12.0 the snapshot hash covered the export timestamp, so every
// playlist load stored another full copy. This runs once per database and
// folds each run of identical consecutive snapshots into a single row that
// keeps the first-seen date and the newest payload.
function compactLegacyPlaylistBackups(db: DatabaseSync) {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };

  if (version >= playlistBackupSchemaVersion) {
    return;
  }

  const runs: Array<{
    contentHash: string;
    duplicateIds: string[];
    firstId: string;
    playlistId: string;
  }> = [];
  const rows = db
    .prepare(
      `
        SELECT id, playlist_id, payload_json
        FROM playlist_backups
        ORDER BY playlist_id ASC, created_at ASC, rowid ASC
      `
    )
    .iterate() as Iterable<{
    id: string;
    payload_json: string;
    playlist_id: string;
  }>;

  for (const row of rows) {
    const contentHash = playlistBackupContentHashFromPayload(row.payload_json);
    const currentRun = runs[runs.length - 1];

    if (
      contentHash &&
      currentRun?.playlistId === row.playlist_id &&
      currentRun.contentHash === contentHash
    ) {
      currentRun.duplicateIds.push(row.id);
    } else {
      // An unreadable payload never matches its neighbours and is kept as is.
      runs.push({
        contentHash: contentHash ?? "",
        duplicateIds: [],
        firstId: row.id,
        playlistId: row.playlist_id
      });
    }
  }

  const adoptNewest = db.prepare(
    `
      UPDATE playlist_backups
      SET (
        playlist_name,
        owner_name,
        owner_id,
        track_count,
        exported_at,
        source,
        payload_json,
        updated_at
      ) = (
        SELECT
          playlist_name,
          owner_name,
          owner_id,
          track_count,
          exported_at,
          source,
          payload_json,
          updated_at
        FROM playlist_backups
        WHERE id = ?
      )
      WHERE id = ?
    `
  );
  const deleteRow = db.prepare("DELETE FROM playlist_backups WHERE id = ?");
  const setHash = db.prepare(
    "UPDATE playlist_backups SET snapshot_hash = ? WHERE id = ?"
  );
  let removedCount = 0;

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const run of runs) {
      if (!run.contentHash) {
        continue;
      }

      if (run.duplicateIds.length) {
        adoptNewest.run(
          run.duplicateIds[run.duplicateIds.length - 1],
          run.firstId
        );

        for (const duplicateId of run.duplicateIds) {
          deleteRow.run(duplicateId);
          removedCount += 1;
        }
      }

      setHash.run(
        playlistBackupSnapshotHash(run.contentHash, run.firstId),
        run.firstId
      );
    }

    db.exec(`PRAGMA user_version = ${playlistBackupSchemaVersion}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    console.warn("[trackkeep.backup-store] could not compact playlist backups", {
      error
    });
    return;
  }

  if (removedCount) {
    console.info("[trackkeep.backup-store] compacted duplicate playlist backups", {
      removedCount
    });
  }
}

function playlistBackupContentHashFromPayload(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as Partial<BackupPayload>;

    if (!payload.playlist || !Array.isArray(payload.tracks)) {
      return null;
    }

    return playlistBackupContentHash(payload.playlist.name, payload.tracks);
  } catch {
    return null;
  }
}

// Covers only what makes two snapshots the same playlist state: the name and
// the ordered track list. Timestamps, artwork URLs and availability flags are
// left out so they cannot make an unchanged playlist look new.
function playlistBackupContentHash(playlistName: string, tracks: BackupTrack[]) {
  return createHash("sha256")
    .update(JSON.stringify([playlistName, tracks.map(playlistBackupTrackKey)]))
    .digest("hex");
}

// The row id keeps the stored value unique, so a playlist that returns to an
// earlier state can be recorded again.
function playlistBackupSnapshotHash(contentHash: string, id: string) {
  return `${contentHash}:${id}`;
}

function playlistBackupTrackKey(track: BackupTrack) {
  return (
    track.id ??
    track.spotifyUri ??
    [
      track.name,
      Array.isArray(track.artists) ? track.artists.join(", ") : "",
      track.album
    ].join("\u0000")
  );
}

function playlistBackupId() {
  return `pb-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}
