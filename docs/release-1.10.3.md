# TrackKeep 1.10.3

TrackKeep 1.10.3 keeps playlist backup status current automatically and can
append newly backed-up tracks to Navidrome or Plex without a separate manual
sync.

## Added

- Auto Sync can be enabled independently for each Spotify playlist and for each
  Navidrome or Plex target.
- Completed single-track and bulk backups can request the needed target-server
  scan and append the new track once the server resolves it.
- Playlist revisions are checked when the playlist view loads, every minute
  while it remains open, and when the browser regains focus.

## Changed

- Changed Spotify playlists refresh their saved backup status without requiring
  each playlist to be opened individually.
- Homepage counts only consider a playlist fully backed up when the saved
  status matches Spotify's current playlist revision.
- Playlist sidebar status badges use cleaner, consistent rows and clearer
  backed-up or changed-state presentation.
- Automatic playlist updates remain append-only and never remove existing
  Navidrome or Plex playlist entries.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build` on the supported Node 22 runtime.
- All playlist-revision, Homepage-status, and Spotify mapping tests pass.
- The full Windows release run reports 102 passing tests and 11 expected
  multimedia skips; one Unix-style fake-executable harness case is not runnable
  on Windows.
- The configured yt-dlp release channel check passes.
