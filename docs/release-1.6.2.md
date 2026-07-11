# TrackKeep 1.6.2

TrackKeep 1.6.2 restores Navidrome-first product language after the generic
music-library wording in the 1.6.x cleanup made the intended target less clear.

## Changed

- README, Docker examples, and `.env.docker.example` now present
  `NAVIDROME_*` variables as the natural setup path for Navidrome installs.
- UI and API status messages now refer to the Navidrome folder, Navidrome API,
  Navidrome scans, and Navidrome playlist syncs where that is what users are
  configuring.
- The generic `MUSIC_LIBRARY_*` names remain accepted equivalents for existing
  installs and non-Navidrome Subsonic-compatible setups.
- Direct non-Docker installs can now use `NAVIDROME_MUSIC_PATH` as another alias
  for the local music folder path.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- Unit tests pass with `npm test`.
