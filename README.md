# SpotifyBU

SpotifyBU is a web UI for backing up a person's own Spotify library data into a Navidrome-ready music library. The first milestone connects to Spotify, reads playlists, previews tracks, checks the configured Navidrome library folder, and exports playlist metadata as JSON or CSV.

This project intentionally does not rip audio from YouTube or other services. Future source providers should only handle media the user is authorized to download or already owns, such as local files, purchased libraries, licensed catalogs, or royalty-free sources.

## Current Slice

- Spotify OAuth using Authorization Code with PKCE
- Playlist listing with private and collaborative playlist scopes
- Playlist track preview
- JSON and CSV exports with track title, artists, album, ISRC, duration, Spotify URI, and Spotify URL
- Navidrome library target status using `NAVIDROME_LIBRARY_PATH`
- Provider-ready UI for legal media backup sources

## Local Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add this redirect URI to the Spotify app:

   ```text
   http://localhost:3000/api/auth/callback
   ```

3. Copy `.env.example` to `.env.local`.
4. Set `SPOTIFY_CLIENT_ID`.
5. Set `NAVIDROME_LIBRARY_PATH` to the music folder Navidrome scans. If Navidrome is in Docker, this should be the host path mounted into the container.
6. Optionally set `NAVIDROME_URL` if your Navidrome server is not at `http://localhost:4533`.
7. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

Spotify's official docs for the auth flow are here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

Navidrome's getting-started docs note that Navidrome scans its configured music folder and that the Navidrome process needs read access to it: https://www.navidrome.org/docs/getting-started/

Navidrome multi-library support can also point additional libraries at separate folders: https://www.navidrome.org/docs/usage/features/multi-library/

## Navidrome Target

SpotifyBU is designed to stage authorized audio files into a Navidrome library folder, usually with a structure like:

```text
Artist/Album/01 - Track.ext
```

The app currently checks whether the configured folder exists and whether the SpotifyBU server process can read and write it. Navidrome still needs read access to the same folder and a scan/watch configuration that sees new files.

## Architecture Notes

- Access and refresh tokens are stored in an HTTP-only cookie for the local prototype. Before production, move tokens into an encrypted server-side session store.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/navidrome.ts` owns Navidrome library path checks and safe target directory creation.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and token-session handling.
- Source providers should expose match/search/download capability only for authorized sources.

## Roadmap

- Persist backups in a database
- Add background backup jobs
- Stage authorized downloads into the configured Navidrome music folder
- Add local/Navidrome-file matching by ISRC, artist, title, and duration
- Add provider plugin contracts for authorized media sources
- Add import/recreate-playlist workflows
