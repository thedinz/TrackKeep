# SpotifyBU 1.3.0

SpotifyBU 1.3.0 adds an explicit full-sync mode for Navidrome playlists.

## Added

- Navidrome playlist sync now includes `Full sync` alongside `Replace` and
  `Append`.
- Full sync removes stale Navidrome playlist entries before adding the current
  matched Spotify track order, so tracks removed from Spotify can be removed
  from the same-named Navidrome playlist too.
- Full-sync results report stale removals and missing additions in the playlist
  sync confirmation message.

## Changed

- Navidrome playlist sync API requests now preserve all recognized sync modes
  instead of treating unknown non-append values as replace.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Provider matching tests pass under Node 24.14.0.
