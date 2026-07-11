# TrackKeep 1.2.0

TrackKeep 1.2.0 adds the next backup workflow layer: durable metadata
snapshots, safer bulk provider jobs, explicit music library playlist sync modes,
and a real browser tab icon.

## Added

- Persisted playlist metadata backup snapshots in `/config/spotifybu.sqlite`.
- Dry-run previews for bulk provider candidate selection.
- Resumable background bulk provider jobs with cancel and retry controls.
- Music library playlist sync mode selection for replace or append.
- Skipped-track review after music library playlist sync.
- Site icon for browser tabs.

## Changed

- Bulk provider downloads now require previewed candidates and explicit
  authorization/risk confirmation before the background job starts.
- README and provider docs now describe persisted jobs, dry-run previews, and
  the local SQLite database.
