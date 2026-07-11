# TrackKeep 1.2.6

TrackKeep 1.2.6 improves playlist backup visibility when a Spotify playlist
changes after it was previously backed up.

## Changed

- Playlist rail status now shows a red `N not backed up` badge when Spotify's
  current playlist total is higher than the latest saved backup snapshot.
- Playlist rail status now rebuilds saved snapshot coverage against the current
  music library index on page load, so persisted missing and backed-up badges appear
  without opening each playlist first.
- Opened playlists use exact music library match state for their missing backup
  count, so the rail updates from snapshot-based status to precise coverage
  after the playlist loads.
- Fully covered playlists still show the green `Backed up` badge, and saved
  metadata snapshots continue to show `DB saved`.

## Verified

- Provider matching tests pass under Node 22.22.3.
- TypeScript check passes with `tsc --noEmit`.
