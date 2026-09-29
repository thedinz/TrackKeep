# TrackKeep 1.10.4

TrackKeep 1.10.4 is a security and reliability release. It closes an
authentication bypass, hardens login sessions, protects library metadata files
from concurrent writes, and makes bulk backups survive container restarts.
Upgrading is recommended for every install.

## Security

- Fixed an authentication bypass. When `NEXT_PUBLIC_APP_URL` was blank, the
  login check could be redirected by a client-supplied `X-Forwarded-Host`
  header, letting an unauthenticated request reach protected endpoints. The
  check now runs inside TrackKeep and no longer depends on request headers.
- Login sessions are no longer signed with a public value when
  `TRACKKEEP_APP_SECRET` is blank or left as the documented placeholder.
  TrackKeep now generates a random secret in `<TRACKKEEP_CONFIG_DIR>/app-secret`
  instead. Installs in that situation will be asked to log in once after
  upgrading.
- The built-in login locks for 30 seconds after five consecutive failed
  attempts, doubling up to 15 minutes. A successful login resets it.
- The dashboard warns while the default `admin/admin` login is still in use.

## Fixed

- `provider-downloads.json` could be reset to empty, losing download history,
  when it was read during a concurrent write or after an interrupted write. An
  unreadable history file is now preserved beside the original instead of
  being overwritten.
- The library index, album-folder log, organize ignores, and managed-track
  store are written atomically, so a crash or concurrent reader never sees a
  half-written file.
- Tracks that finish downloading while Organize or identity-tag backfill is
  running are no longer dropped from the library index.
- Organizing Opus files keeps embedded artwork while writing identity tags.
- Plex playlist creation waits up to about three seconds for Plex to show a
  new playlist before reporting that creation failed, avoiding false errors on
  slower servers.

## Changed

- Bulk backup jobs interrupted by a container restart resume automatically
  when TrackKeep starts, instead of waiting for a browser to poll them.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- The Windows release run reports 110 passing tests and 15 expected skips for
  multimedia tools and the Unix-style fake-executable harness.
- The auth bypass was reproduced against 1.10.3 and confirmed closed; startup
  bulk-job resume and login lockout were exercised against the production
  build.
- The configured yt-dlp release channel check passes.
