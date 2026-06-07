# SpotifyBU 1.2.1

SpotifyBU 1.2.1 adds external reverse-proxy authentication mode for installs
that already use Authentik, Authelia, or another access-control layer.

## Added

- Settings control for switching the app between internal SpotifyBU login and
  external proxy auth.
- `SPOTIFYBU_AUTH_MODE=external` startup option for proxy-protected installs.

## Changed

- External auth mode disables the built-in login form and blocks credential
  login requests.
- The dashboard no longer shows SpotifyBU's internal sign-out action while
  external auth is enabled.
