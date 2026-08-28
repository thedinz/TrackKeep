import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlaylistBackupStatus,
  playlistBackupSnapshotNeedsRefresh
} from "./playlist-backup-status.ts";
import type { MusicLibraryTrackMatch } from "./music-library.ts";
import type { BackupTrack } from "./spotify.ts";

test("playlist backup status excludes unavailable tracks", () => {
  const status = getPlaylistBackupStatus(
    [backupTrack(1), backupTrack(2, "spotify-unavailable")],
    [libraryMatch(1, true)]
  );

  assert.deepEqual(status, {
    backedUp: true,
    missingTrackCount: 0,
    trackCount: 1,
    unavailableTrackCount: 1
  });
});

test("a playlist containing only unavailable rows has no missing backup", () => {
  const status = getPlaylistBackupStatus(
    [backupTrack(1, "spotify-unavailable")],
    []
  );

  assert.deepEqual(status, {
    backedUp: true,
    missingTrackCount: 0,
    trackCount: 0,
    unavailableTrackCount: 1
  });
});

test("playlist revisions invalidate persisted status when the track count is unchanged", () => {
  assert.equal(
    playlistBackupSnapshotNeedsRefresh(
      { snapshotId: "current-revision", tracksTotal: 10 },
      { snapshotId: "saved-revision", tracksTotal: 10 }
    ),
    true
  );
});

test("matching playlist revisions keep persisted status current", () => {
  assert.equal(
    playlistBackupSnapshotNeedsRefresh(
      { snapshotId: "same-revision", tracksTotal: 10 },
      { snapshotId: "same-revision", tracksTotal: 10 }
    ),
    false
  );
});

function backupTrack(
  position: number,
  metadataStatus: BackupTrack["metadataStatus"] = "spotify"
): BackupTrack {
  return {
    album: "Album",
    albumArtist: "Artist",
    albumArtistIds: [],
    artists: ["Artist"],
    artistIds: [],
    durationMs: 180_000,
    explicit: false,
    id: `track-${position}`,
    metadataStatus,
    name: `Track ${position}`,
    position
  };
}

function libraryMatch(
  trackPosition: number,
  exists: boolean
): MusicLibraryTrackMatch {
  return {
    exists,
    expectedFolder: "Artist/Album",
    needsMove: false,
    trackPosition
  };
}
