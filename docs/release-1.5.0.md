# TrackKeep 1.5.0

TrackKeep 1.5.0 hardens Spotify OAuth reconnect handling and adds focused
diagnostics for auth loops.

## Added

- Spotify OAuth flow diagnostics are now written to
  `/config/logs/spotifybu.log` for auth config, login start, callback receipt,
  callback success or failure, and session checks.
- Auth diagnostics include request host, forwarded proxy headers, cookie
  presence, secure-cookie settings, and non-sensitive state fingerprints.

## Changed

- Connect Spotify links now use the canonical app base URL from the auth config
  response, so the OAuth start and callback use the same browser origin.
- Spotify and TrackKeep session cookies now calculate their `Secure` attribute
  from the request context when no explicit `SPOTIFYBU_SECURE_COOKIES` override
  is set.
- OAuth error messages on the connect screen are clearer when callback state is
  missing, mismatched, or token exchange fails.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
