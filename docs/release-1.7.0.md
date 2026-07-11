# TrackKeep 1.7.0

TrackKeep 1.7.0 promotes Plex playlist sync from the `dev` track to the stable
release. Spotify playlists can now sync matched local tracks into Plex playlists
alongside the existing Navidrome workflow.

## Added

- Settings now stores optional Plex server URL, token, and music library key
  values for playlist sync.
- Playlist views can replace, append, or full-sync a same-named Plex playlist
  from matched Spotify tracks.
- Plex playlist sync now carries Spotify playlist artwork into Plex when
  artwork is available.
- Plex matching checks scanned, accessible, and playable files before adding
  tracks to a playlist, and reports skipped tracks in the UI.
- Music library organize ignores can be added and removed when a matched file
  should intentionally stay outside the canonical layout.

## Changed

- Provider downloads and identity-tag backfills now add Navidrome-compatible
  release tags in addition to TrackKeep identity metadata.
- Identity-tag backfill progress handling is more resilient for existing
  libraries.
- Organize matching is stricter about the expected source and destination paths.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- Unit tests pass with `npm test`.
