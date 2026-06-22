# SpotifyBU 1.2.4

SpotifyBU 1.2.4 makes matched-file organization clearer and adds targeted
organization actions throughout the track workflow.

## Added

- Red `Orginize` actions for individual matched tracks that are outside their
  planned album folder.
- Album-target organization buttons that move only the tracks belonging to
  that destination.

## Changed

- Tracks already in their planned location now show a green `Orginized`
  status instead of `Backed up`.
- The whole-source organization action and targeted actions share the same
  batching, progress, library-index refresh, and match-refresh behavior.
- Organization controls lock while files are moving to avoid conflicting
  rename operations.

## Verified

- TypeScript check passes with `npm run typecheck`.
- Provider scoring tests pass with `npm test`.
- Production build passes with `npm run build`.
- The local production route responds successfully after the build.
