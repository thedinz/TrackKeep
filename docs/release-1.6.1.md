# TrackKeep 1.6.1

TrackKeep 1.6.1 restores compatibility between Navidrome-named environment
variables and the generic music-library aliases added around 1.6.0.

## Fixed

- Installs that set `NAVIDROME_USERNAME` and `NAVIDROME_PASSWORD` now continue
  to request Subsonic-compatible server scans.
- Installs that set `NAVIDROME_URL` or `NAVIDROME_LIBRARY_PATH` are accepted
  alongside `MUSIC_LIBRARY_URL` and `MUSIC_LIBRARY_PATH`.
- The checked-in Docker Compose template now bridges old `.env` values such as
  `NAVIDROME_MUSIC_PATH`, `NAVIDROME_URL`, `NAVIDROME_USERNAME`, and
  `NAVIDROME_PASSWORD` to the new generic music-library names.
- UI/API guidance now mentions that `NAVIDROME_USERNAME` and
  `NAVIDROME_PASSWORD` are accepted.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- Unit tests pass with `npm test`.
