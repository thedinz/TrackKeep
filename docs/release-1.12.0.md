# TrackKeep 1.12.0

TrackKeep 1.12.0 adds a playlist backup history. Every change to a playlist
is kept as a snapshot you can browse, export, and restore to Navidrome or
Plex, even after Spotify has changed or removed the playlist. It also stops
TrackKeep from saving a duplicate copy of a playlist every time it is opened.

## Added

- A **Backup History** page, linked as Backups in the dashboard header,
  lists every playlist TrackKeep has backed up. It reads only TrackKeep's own
  database, so it works without a Spotify connection and for playlists
  Spotify no longer shows.
- Each playlist's history has one entry per change to its name or track
  list, with how many tracks were added or removed and whether the order
  changed.
- Opening a snapshot shows its full track list and what has changed in the
  playlist since that snapshot was taken.
- **Export JSON** downloads any snapshot.
- **Restore to Navidrome** and **Restore to Plex** create the server
  playlist from a snapshot, or replace the contents of a same-named playlist,
  using the existing playlist sync in Replace mode. Tracks that are not in
  the music library are listed as skipped.

## Fixed

- Opening a playlist saved a full new snapshot every time, even when nothing
  had changed, so the database grew with each visit. TrackKeep now saves a
  snapshot only when the playlist's name or track list changes, and otherwise
  refreshes the newest one.
- Two snapshots saved in the same millisecond could be put in the wrong
  order, so the newest one was misread.

## Changed

- **One-time cleanup on upgrade.** The first time 1.12.0 reads the playlist
  backups, it folds each run of identical consecutive snapshots into a single
  entry that keeps the date the state was first seen and the newest saved
  data. Snapshots with different track lists are never removed, and
  unreadable entries are left as they are. The container log reports how many
  duplicates were removed. The database file does not shrink; SQLite reuses
  the freed space.
- TrackKeep remains read-only on Spotify. Restoring a playlist to Spotify
  itself is not supported.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- The Windows release run reports 124 passing tests and 7 expected skips for
  multimedia tools and the Unix-style fake-executable harness, on both
  Node 22 and Node 26. The Linux CI run passes.
- The upgrade cleanup was run against a database seeded with 15 snapshots in
  the old format, which it reduced to 5.
- The Backup History page, change summaries, snapshot view, JSON export, and
  restore error handling were checked in a browser against that database.
- The configured yt-dlp release channel check passes.
