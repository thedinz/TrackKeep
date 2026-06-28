# SpotifyBU 1.6.1

SpotifyBU 1.6.1 restores compatibility with older Navidrome-named environment
variables after the 1.6.0 music-library naming cleanup.

## Fixed

- Existing installs that still set `NAVIDROME_USERNAME` and
  `NAVIDROME_PASSWORD` now continue to request Subsonic-compatible music server
  scans.
- Existing installs that still set `NAVIDROME_URL` or `NAVIDROME_LIBRARY_PATH`
  are accepted as legacy aliases for `MUSIC_LIBRARY_URL` and
  `MUSIC_LIBRARY_PATH`.
- The checked-in Docker Compose template now bridges old `.env` values such as
  `NAVIDROME_MUSIC_PATH`, `NAVIDROME_URL`, `NAVIDROME_USERNAME`, and
  `NAVIDROME_PASSWORD` to the new generic music-library names.
- UI/API guidance now mentions that legacy `NAVIDROME_USERNAME` and
  `NAVIDROME_PASSWORD` are still accepted.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- Unit tests pass with `npm test`.
