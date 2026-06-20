# SpotifyBU 1.4.0

SpotifyBU 1.4.0 adds configurable organize schemes so SpotifyBU, NaviClean,
and Lidarr can agree on library layout.

## Added

- Settings now includes an Organize Scheme section with SpotifyBU default,
  Lidarr, and manual naming modes.
- Lidarr mode can test a Lidarr URL/API key and load naming formats from
  `/api/v1/config/naming`.
- Manual mode supports editable artist, standard-track, and multi-disc track
  templates.

## Changed

- Folder planning, provider download destinations, matched-file organization,
  and playlist match status now use the active organize scheme.
- Changing the organize scheme marks the current library index stale until the
  Library Index action re-checks the mounted library.
- The Library Index action is labeled directly in the operations panel, and
  stale track badges now say `Index needed`.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Provider matching tests pass under Node 24.14.0.
- Production build passes with `next build`.
