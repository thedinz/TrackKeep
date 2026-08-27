# TrackKeep 1.10.1

TrackKeep 1.10.1 expands the in-app help guide with a complete explanation of
Navidrome and Plex playlist sync and polishes the new sync-flow layout.

## Changed

- The help guide now explains how Spotify order, TrackKeep local matching,
  target-server identity, and the resulting playable playlist fit together.
- Dedicated Navidrome and Plex guidance covers prerequisites, server scans,
  authentication, and the reasons a track can be skipped during sync.
- Replace, Append, and Full Sync now have detailed behavior and safety notes,
  including that playlist changes never delete underlying music files.
- The playlist-sync flow uses more consistent spacing and handles constrained
  text widths more reliably.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build` on the supported Node 22 runtime.
- The automated suite reports 97 passing tests and 11 expected multimedia
  skips in the Windows release environment; one Unix-style fake-executable
  harness case is not runnable on Windows.
- The configured yt-dlp release channel check passes.
