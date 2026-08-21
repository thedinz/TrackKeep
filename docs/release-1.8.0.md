# TrackKeep 1.8.0

TrackKeep 1.8.0 completes the product rebrand and promotes the latest backup,
organization, and dashboard improvements from `dev` to the stable release.

## Added

- Navidrome quick and full scan controls now expose live scan status and
  progress from the dashboard.
- Provider downloads now support configurable Opus quality with an optional
  MP3 fallback when Opus encoding is unavailable.
- TrackKeep identity tags distinguish managed files and preserve Spotify track
  identity when files move through the library.
- Provider matching now considers upload age and release context when ranking
  otherwise similar sources.

## Changed

- The SpotifyBU product and documentation are now TrackKeep, while legacy
  environment variables and identity tags remain compatible.
- Spotify metadata remains authoritative for downloaded audio tags, artwork,
  and canonical Navidrome album organization.
- Opus is now the preferred backup format, with quality caps that avoid
  upconverting lower-bitrate sources.
- The dashboard workspace has been reorganized to give backup and organization
  work more room, with consistent status cards and responsive layouts.
- Album organization targets now collapse into a compact attention summary and
  disappear when every target is fully organized.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- All 97 unit tests pass with `npm test`.
