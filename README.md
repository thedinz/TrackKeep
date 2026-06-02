# SpotifyBU

SpotifyBU is a web UI for backing up a person's own Spotify library data into a Navidrome-ready music library. The first milestone connects to Spotify, reads playlists, resolves albums and songs, previews tracks, checks the configured Navidrome library folder, and exports playlist metadata as JSON or CSV.

This project intentionally does not rip audio from YouTube or other services. Future source providers should only handle media the user is authorized to download or already owns, such as local files, purchased libraries, licensed catalogs, or royalty-free sources.

## Current Slice

- Spotify OAuth using Authorization Code with PKCE
- Playlist listing with private and collaborative playlist scopes
- Song and album metadata lookup from Spotify URLs, URIs, or IDs
- Playlist track preview
- JSON and CSV exports with track title, artists, album, ISRC, duration, Spotify URI, and Spotify URL
- Local app login with changeable credentials
- Docker image with the Next.js app plus `ffmpeg`, `yt-dlp`, and Python for future media-provider adapters
- Navidrome library target status using `NAVIDROME_LIBRARY_PATH`
- Navidrome folder planning using `Artist - Album`
- Provider-ready UI and type contract for legal media backup sources

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
7. Set `SPOTIFYBU_APP_SECRET` to a long random value for signing SpotifyBU login sessions.
8. Optionally set `SPOTIFYBU_CONFIG_DIR` to a persistent folder for SpotifyBU app settings. If unset, changed login credentials are stored in `.spotifybu/app-auth.json` in the project folder.
9. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

The default SpotifyBU web login is:

```text
Username: admin
Password: admin
```

After signing in, open Settings and change the login before exposing the app on a server.

## Docker Setup

SpotifyBU is intended to run as a Docker app. The image builds the Next.js server and includes the runtime prerequisites planned for source-provider work:

- Node.js 22
- `ffmpeg`
- `yt-dlp`
- Python 3 and `pip`

To run it with Docker Compose:

1. Copy the Docker environment example:

   ```bash
   cp .env.docker.example .env
   ```

2. Edit `.env`.
3. Set `SPOTIFYBU_APP_SECRET` to a long random value.
4. Set `NAVIDROME_MUSIC_PATH` to the host music folder Navidrome scans.
5. Set `SPOTIFY_CLIENT_ID`.
6. Set `NAVIDROME_URL` to the Navidrome URL as seen by the container. If Navidrome runs on the Docker host, `http://host.docker.internal:4533` is usually right.
7. Add this redirect URI to your Spotify app:

   ```text
   http://localhost:3000/api/auth/callback
   ```

   If `NEXT_PUBLIC_APP_URL` points at a different host or port, use that base URL instead.

8. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

The Compose file mounts:

```text
/config
```

for SpotifyBU settings and changed login credentials, and:

```text
/music
```

for the Navidrome library path. Inside the container, `NAVIDROME_LIBRARY_PATH` is set to `/music` and `SPOTIFYBU_CONFIG_DIR` is set to `/config`.

The container runs as UID/GID `1000`. On Linux hosts, make sure the mapped Navidrome music folder is writable by that user, or adjust the host folder permissions before starting the container.

Spotify's official docs for the auth flow are here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

Navidrome's getting-started docs note that Navidrome scans its configured music folder and that the Navidrome process needs read access to it: https://www.navidrome.org/docs/getting-started/

Navidrome multi-library support can also point additional libraries at separate folders: https://www.navidrome.org/docs/usage/features/multi-library/

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. SpotifyBU keeps that same provider-oriented shape, but download-capable providers must be configured for media the user is authorized to download. See `docs/source-providers.md`.

## Navidrome Target

SpotifyBU is designed to stage authorized audio files into a Navidrome library folder, usually with a structure like:

```text
Artist - Album/01 - Track.ext
```

The app currently checks whether the configured folder exists and whether the SpotifyBU server process can read and write it. Navidrome still needs read access to the same folder and a scan/watch configuration that sees new files.

SpotifyBU plans every track through its Spotify album metadata, so a single song still resolves to the album artist and album folder. Future download jobs should call `recordNavidromeAlbumFolders` after a successful write. That stores stable album folder mappings in:

```text
NAVIDROME_LIBRARY_PATH/.spotifybu/album-folders.json
```

If another song from the same Spotify album is downloaded later, SpotifyBU reuses the logged folder instead of guessing a new path.

## Architecture Notes

- `src/lib/app-auth.ts` owns the local SpotifyBU web login, session cookie signing, and persisted credential updates.
- Access and refresh tokens are stored in an HTTP-only cookie for the local prototype. Before production, move tokens into an encrypted server-side session store.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/navidrome.ts` owns Navidrome library path checks, safe target directory creation, folder planning, and album-folder logging.
- `src/lib/providers/types.ts` defines the source-provider contract for matching, downloading, tagging, and provenance.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and token-session handling.
- Source providers should expose match/search/download capability only for authorized sources.

## Roadmap

- Persist backups in a database
- Add background backup jobs
- Stage authorized downloads into the configured Navidrome music folder
- Add local/Navidrome-file matching by ISRC, artist, title, and duration
- Add provider adapters inspired by spotDL's source-provider model
- Add import/recreate-playlist workflows
