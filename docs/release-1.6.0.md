# TrackKeep 1.6.0

TrackKeep 1.6.0 adds durable Spotify identity tagging for TrackKeep-managed
downloads, so newly tagged files can reconnect to Spotify tracks even after
another organizer moves or renames them.

## Added

- TrackKeep provider downloads now write custom Spotify identity metadata:
  `spotifybu:track_id`, `spotifybu:track_uri`, `spotifybu:album_id`,
  `spotifybu:isrc`, and `spotifybu:identity_version`.
- Library indexing reads those identity tags into optional indexed-track fields
  while preserving compatibility with existing `.spotifybu/library-index.json`
  files.
- Music library matching now checks exact Spotify track ID and URI matches
  before falling back to ISRC, metadata, duration, and path matching.
- Settings includes a maintenance action to retag already matched backups from
  saved TrackKeep playlist snapshots.
- A new `/api/music-library/identity-tags` endpoint runs the backfill workflow.

## Changed

- TrackKeep-created files keep normal title, artist, album, album artist, track,
  disc, and ISRC tags unchanged while adding the durable identity tags.
- Playlist membership remains in TrackKeep's playlist backup snapshots and local
  database, not in audio-file metadata.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- Unit tests pass with `npm test`.
