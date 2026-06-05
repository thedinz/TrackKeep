# SpotifyBU 1.1.8

SpotifyBU 1.1.8 handles Spotify's 2026 playlist API limits more clearly and
adds a fallback for followed playlists that Spotify refuses to expose through
the playlist item API.

## What's Changed

- Switched direct playlist track reads to Spotify's current
  `/playlists/{id}/items` endpoint.
- Added `Track list` backup sources for pasted Spotify song URLs, URIs, or IDs.
- Kept followed playlists selectable while marking ones that Spotify may limit.
- Added clearer Spotify `403 Forbidden` messages for playlist item access.
- Resolved album track metadata through per-track requests instead of the removed
  batch track endpoint.
- Documented followed-playlist limits and the track-list fallback in the README
  and source-provider notes.

## Notes

Direct playlist reads still work best for playlists owned by, or collaborated on
by, the connected Spotify user. If Spotify blocks a followed playlist, paste the
track links into the `Track list` source type and continue the same backup
workflow from the resolved song metadata.
