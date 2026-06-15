# SpotifyBU 1.2.5

SpotifyBU 1.2.5 improves automatic YouTube candidate discovery for tracks
whose best source depends on album, live/session, or featured-artist metadata.

## Changed

- YouTube provider search now starts with a richer query that includes the
  track title, up to three Spotify artists, and the album name before falling
  back to the older official-audio query.
- YouTube candidates are de-duped across query variants and re-ranked by the
  existing scorer, so album-aware matching can choose better recordings when a
  broader search finds them.
- Provider query construction now has focused tests to protect album and
  featured-artist search behavior.

## Fixed

- Improved matching for same-title worship recordings where a high-ranked
  YouTube result is a different artist/version and the expected recording is
  discoverable only when album or featured-artist text is included.

## Verified

- Provider matching tests pass under Node 22.22.3.
- TypeScript check passes with `npm run typecheck`.
- Production build passes under Node 22.22.3.
