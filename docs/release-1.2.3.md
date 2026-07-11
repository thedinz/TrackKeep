# TrackKeep 1.2.3

TrackKeep 1.2.3 improves provider candidate selection and makes the
music library album organization targets easier to understand.

## Changed

- Provider candidate scoring now lives in a shared scoring helper with focused
  tests, so automatic matching favors better title, artist, and duration
  signals.
- The music library folder destination section is now labeled as album
  organization targets and explains whether tracks are backed up, need
  organizing, are partly backed up, or still need download targets.
- Existing backed-up tracks are no longer described as `folder planned` just
  because the TrackKeep folder log did not create that folder originally.

## Verified

- TypeScript check passes with `npm run typecheck`.
- Provider scoring tests pass with `npm test`.
