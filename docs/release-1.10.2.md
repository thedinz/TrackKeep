# TrackKeep 1.10.2

TrackKeep 1.10.2 keeps locally backed-up music useful and visible when Spotify
temporarily or permanently marks the corresponding playlist item unavailable.

## Added

- Unavailable playlist rows now show a green **Local copy** badge when
  TrackKeep confirms that the matching audio file still exists in the mounted
  music library.
- The Local copy badge tooltip identifies the indexed file path so users can
  verify which file TrackKeep matched.

## Changed

- Navidrome and Plex playlist sync now attempt to match unavailable Spotify
  rows against physical local files instead of excluding every unavailable row.
- A matched unavailable track remains in Replace and Full Sync results when the
  target server can resolve the local file.
- An unavailable track without a local match is omitted by Replace or Full Sync
  and is reported with a specific skipped-track reason. Append retains its
  existing non-removing behavior.
- The unavailable-track panel and help guide now explain the relationship
  between Spotify availability, local ownership, and playlist sync.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- All 111 automated tests pass.
- The configured yt-dlp release channel check passes.
