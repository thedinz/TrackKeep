# SpotifyBU 1.2.2

SpotifyBU 1.2.2 makes bulk provider candidate previews report live progress
while each missing Spotify track is checked.

## Changed

- Bulk preview candidate checks now stream per-track progress back to the UI.
- The existing bulk progress bar fills during the dry run instead of jumping
  from `0/total` to complete at the end.

## Verified

- TypeScript check passes with `npm run typecheck`.
- The bulk preview API emits a `progress` event before the final `complete`
  event.
