# TrackKeep 1.4.0

TrackKeep 1.4.0 adds the canonical organize scheme for staged music library files.

## Added

- Settings now includes an Organize Scheme section for the TrackKeep layout.
- The organize scheme uses the shared clean artist/album/year layout.

## Changed

- Folder planning, provider download destinations, matched-file organization,
  and playlist match status now use the TrackKeep organize scheme.
- The Library Index action is labeled directly in the operations panel, and
  stale track badges now say `Index needed`.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Provider matching tests pass under Node 24.14.0.
- Production build passes with `next build`.
