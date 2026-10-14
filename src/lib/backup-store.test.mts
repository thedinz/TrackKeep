import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  diffPlaylistBackupTracks,
  getLatestPlaylistBackupSnapshots,
  getPlaylistBackupExport,
  getPlaylistBackupSnapshotDetail,
  listPlaylistBackupHistory,
  listPlaylistBackupPlaylists,
  persistPlaylistBackup
} from "./backup-store.ts";
import { closeSpotifyBuDatabase, getSpotifyBuDatabase } from "./database.ts";
import type { BackupTrack, PlaylistSummary } from "./spotify.ts";

test("an unchanged playlist refreshes its newest snapshot instead of adding one", async (t) => {
  await useTemporaryDatabase(t);

  const first = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "b")
  });
  const second = persistPlaylistBackup({
    playlist: { ...examplePlaylist, imageUrl: "https://example.test/new.jpg" },
    source: "playlist-load",
    tracks: tracks("a", "b").map((track) => ({
      ...track,
      metadataWarning: "Changed detail that is not part of the track list."
    }))
  });

  assert.ok(first && second);
  assert.equal(second.id, first.id);
  assert.equal(listPlaylistBackupHistory(examplePlaylist.id).totalCount, 1);
  assert.equal(
    getLatestPlaylistBackupSnapshots()[examplePlaylist.id].playlist.imageUrl,
    "https://example.test/new.jpg"
  );
});

test("playlist changes are recorded as history with what changed", async (t) => {
  await useTemporaryDatabase(t);
  // Every save lands in the same millisecond, so ordering has to fall back to
  // the order the snapshots were saved in.
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-01T12:00:00.000Z")
  });

  const original = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "b", "c")
  });

  persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("c", "a", "d")
  });
  persistPlaylistBackup({
    playlist: { ...examplePlaylist, name: "Renamed" },
    source: "playlist-load",
    tracks: tracks("c", "a", "d")
  });

  const reverted = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "b", "c")
  });
  const history = listPlaylistBackupHistory(examplePlaylist.id);

  assert.ok(original && reverted);
  assert.notEqual(reverted.id, original.id);
  assert.equal(history.totalCount, 4);
  assert.deepEqual(
    history.snapshots.map((snapshot) => snapshot.changes),
    [
      { addedCount: 1, removedCount: 1, reordered: true },
      { addedCount: 0, removedCount: 0, reordered: false },
      { addedCount: 1, removedCount: 1, reordered: true },
      null
    ]
  );
  assert.equal(history.snapshots[0].id, reverted.id);
  assert.equal(history.snapshots[1].playlistName, "Renamed");

  const page = listPlaylistBackupHistory(examplePlaylist.id, {
    limit: 1,
    offset: 1
  });

  assert.equal(page.totalCount, 4);
  assert.equal(page.snapshots.length, 1);
  assert.deepEqual(page.snapshots[0].changes, {
    addedCount: 0,
    removedCount: 0,
    reordered: false
  });
  assert.deepEqual(listPlaylistBackupPlaylists(), [
    {
      playlistId: examplePlaylist.id,
      playlistName: examplePlaylist.name,
      snapshotCount: 4,
      trackCount: 3,
      updatedAt: reverted.updatedAt
    }
  ]);
});

test("a snapshot reports what changed since it was taken", async (t) => {
  await useTemporaryDatabase(t);

  const older = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "b", "c")
  });
  const newest = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "c", "d", "e")
  });

  assert.ok(older && newest);

  const olderDetail = getPlaylistBackupSnapshotDetail(older.id);
  const newestDetail = getPlaylistBackupSnapshotDetail(newest.id);

  assert.ok(olderDetail && newestDetail);
  assert.equal(olderDetail.isLatest, false);
  assert.equal(olderDetail.latestTrackCount, 4);
  assert.deepEqual(
    olderDetail.snapshot.tracks.map((track) => track.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    olderDetail.sinceSnapshot.added.map((track) => track.id),
    ["d", "e"]
  );
  assert.deepEqual(
    olderDetail.sinceSnapshot.removed.map((track) => track.id),
    ["b"]
  );
  assert.equal(olderDetail.sinceSnapshot.reordered, false);
  assert.equal(newestDetail.isLatest, true);
  assert.deepEqual(newestDetail.sinceSnapshot, {
    added: [],
    removed: [],
    reordered: false
  });
  assert.equal(getPlaylistBackupSnapshotDetail("pb-missing"), null);

  const exported = getPlaylistBackupExport(older.id);

  assert.ok(exported);
  assert.equal(exported.playlistName, examplePlaylist.name);
  assert.equal(JSON.parse(exported.payloadJson).tracks.length, 3);
  assert.equal(getPlaylistBackupExport("pb-missing"), null);
});

test("track diffs handle repeated tracks and tracks without Spotify ids", () => {
  const localTrack = { ...track("local"), id: undefined, name: "Local File" };
  const diff = diffPlaylistBackupTracks(
    [track("a"), track("a"), track("b"), localTrack],
    [track("b"), track("a"), localTrack, track("c")]
  );

  assert.deepEqual(
    diff.added.map((item) => item.id),
    ["c"]
  );
  assert.deepEqual(
    diff.removed.map((item) => item.id),
    ["a"]
  );
  assert.equal(diff.reordered, true);
});

test("duplicate snapshots from older versions are folded together once", async (t) => {
  await useTemporaryDatabase(t);

  insertLegacyBackup("pb-1", 50, tracks("a", "b"));
  insertLegacyBackup("pb-2", 40, tracks("a", "b"));
  insertLegacyBackup("pb-3", 30, tracks("a", "b"));
  insertLegacyBackup("pb-4", 20, tracks("a", "b", "c"));
  insertLegacyBackup("pb-5", 10, tracks("a", "b"));
  insertLegacyBackup("pb-6", 5, tracks("a", "b"));
  insertLegacyBackup("pb-broken", 45, null);
  insertLegacyBackup("pb-other", 15, tracks("a", "b"), "playlist-other");

  const history = listPlaylistBackupHistory(examplePlaylist.id);

  assert.deepEqual(
    history.snapshots.map((snapshot) => snapshot.id),
    ["pb-5", "pb-4", "pb-2", "pb-broken", "pb-1"]
  );

  const newestRun = history.snapshots[0];

  assert.equal(newestRun.firstSeenAt, legacyTimestamp(10));
  assert.equal(newestRun.updatedAt, legacyTimestamp(5));
  assert.equal(newestRun.exportedAt, legacyTimestamp(5));
  assert.equal(listPlaylistBackupHistory("playlist-other").totalCount, 1);

  const database = getSpotifyBuDatabase();
  const { user_version: version } = database
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };

  assert.equal(version, 1);

  const refreshed = persistPlaylistBackup({
    playlist: examplePlaylist,
    source: "playlist-load",
    tracks: tracks("a", "b")
  });

  assert.equal(refreshed?.id, "pb-5");
  assert.equal(listPlaylistBackupHistory(examplePlaylist.id).totalCount, 5);
});

const examplePlaylist = {
  collaborative: false,
  description: "",
  id: "playlist-example",
  name: "Example Playlist",
  owner: "Example Owner",
  public: false,
  tracksTotal: 3
} satisfies PlaylistSummary;

function track(id: string): BackupTrack {
  return {
    album: "Example Record",
    albumArtist: "Example Artist",
    albumArtistIds: [],
    artists: ["Example Artist"],
    artistIds: [],
    durationMs: 180000,
    explicit: false,
    id,
    name: `Track ${id}`,
    position: 1
  };
}

function tracks(...ids: string[]) {
  return ids.map((id, index) => ({
    ...track(id),
    position: index + 1
  }));
}

function legacyTimestamp(ageDays: number) {
  return new Date(Date.UTC(2026, 0, 100 - ageDays)).toISOString();
}

// Writes a row the way releases before 1.12.0 did: a hash that is unique per
// save, and no schema version on the database.
function insertLegacyBackup(
  id: string,
  ageDays: number,
  backupTracks: BackupTrack[] | null,
  playlistId: string = examplePlaylist.id
) {
  const timestamp = legacyTimestamp(ageDays);

  getSpotifyBuDatabase()
    .prepare(
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
    )
    .run(
      id,
      playlistId,
      examplePlaylist.name,
      examplePlaylist.owner,
      null,
      backupTracks?.length ?? 0,
      timestamp,
      `legacy-${id}`,
      "playlist-load",
      backupTracks
        ? JSON.stringify({
            exportedAt: timestamp,
            playlist: { ...examplePlaylist, id: playlistId },
            source: "spotify",
            tracks: backupTracks,
            version: 1
          })
        : "{not json",
      timestamp,
      timestamp
    );
}

async function useTemporaryDatabase(t: TestContext) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "spotifybu-backups-"));
  const previousPath = process.env.TRACKKEEP_DATABASE_PATH;

  closeSpotifyBuDatabase();
  process.env.TRACKKEEP_DATABASE_PATH = path.join(tempRoot, "backups.sqlite");

  t.after(async () => {
    closeSpotifyBuDatabase();

    if (typeof previousPath === "string") {
      process.env.TRACKKEEP_DATABASE_PATH = previousPath;
    } else {
      delete process.env.TRACKKEEP_DATABASE_PATH;
    }

    await rm(tempRoot, {
      force: true,
      recursive: true
    });
  });
}
