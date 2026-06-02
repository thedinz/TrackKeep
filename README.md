# SpotifyBU

SpotifyBU is a Docker-first web app for backing up your own Spotify library metadata and preparing a Navidrome-ready music library. It connects to a user's Spotify account, reads playlists, resolves Spotify song/album metadata, previews playlist tracks, exports backup metadata, and plans stable Navidrome folder paths such as `Artist - Album`.

Version `1.0.0` is the first packaged release. It includes the web UI, local app login, Spotify OAuth, playlist/song/album metadata reads, Navidrome library checks, folder planning, Docker packaging, and a provider-ready architecture inspired by spotDL.

SpotifyBU does not currently rip audio from Spotify, YouTube, or other services. Future download providers should only handle media the user is authorized to download or already owns, such as local files, purchased libraries, licensed catalogs, or royalty-free sources.

## Features

- Spotify OAuth using Authorization Code with PKCE
- Local SpotifyBU login with default `admin/admin` credentials
- Settings page for changing the SpotifyBU app username and password
- Playlist listing with private and collaborative playlist scopes
- Song and album metadata lookup from Spotify URLs, URIs, or IDs
- Playlist track preview
- JSON and CSV metadata exports
- Navidrome library folder status checks
- Navidrome folder planning using `Artist - Album`
- Stable album-folder logging design for future download jobs
- Docker image with Node.js, `ffmpeg`, `yt-dlp`, Python 3, and `pip`
- GitHub Container Registry image publishing for `latest` and version tags

## Docker Quick Start

The published image is:

```text
ghcr.io/thedinz/spotifybu:latest
```

For the exact v1.0 release, pin one of these tags:

```text
ghcr.io/thedinz/spotifybu:v1.0.0
ghcr.io/thedinz/spotifybu:1.0.0
ghcr.io/thedinz/spotifybu:1.0
```

Create a folder for SpotifyBU and save this Compose template as `docker-compose.yml`:

```yaml
services:
  spotifybu:
    image: ghcr.io/thedinz/spotifybu:latest
    pull_policy: always
    container_name: spotifybu
    restart: unless-stopped
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "3000:3000"
    environment:
      GIT_BRANCH: main
      NAVIDROME_LIBRARY_PATH: /music
      NAVIDROME_URL: http://host.docker.internal:4533
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      SPOTIFYBU_APP_SECRET: change-this-to-a-long-random-value
      SPOTIFYBU_CONFIG_DIR: /config
      SPOTIFY_CLIENT_ID: your-spotify-client-id
    volumes:
      - spotifybu_config:/config
      - /path/to/navidrome/music:/music

volumes:
  spotifybu_config:
```

Then start it:

```bash
docker compose up -d
```

Open:

```text
http://localhost:3000
```

The default SpotifyBU web login is:

```text
Username: admin
Password: admin
```

After signing in, open Settings and change the login.

## Docker Environment

The repository also includes [.env.docker.example](.env.docker.example) and [docker-compose.yml](docker-compose.yml) as a reusable base:

```bash
cp .env.docker.example .env
docker compose up -d
```

Set these values before starting the app:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SPOTIFYBU_IMAGE` | No | Docker image tag to run. Defaults to `ghcr.io/thedinz/spotifybu:latest`. |
| `SPOTIFYBU_PORT` | No | Host port for the web UI. Defaults to `3000`. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL for SpotifyBU. Must match the Spotify redirect base URL. |
| `SPOTIFYBU_APP_SECRET` | Yes | Long random value used to sign SpotifyBU login sessions. |
| `SPOTIFYBU_SECURE_COOKIES` | No | Set `true` for HTTPS reverse-proxy installs. Defaults to `false` in the Docker example for Unraid-style HTTP installs. |
| `NAVIDROME_MUSIC_PATH` | Yes | Host path to the music folder Navidrome scans. |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID. |
| `NAVIDROME_URL` | No | Navidrome URL as seen by the container. Defaults to `http://host.docker.internal:4533`. |

Inside the container:

- `/config` stores SpotifyBU settings and changed login credentials.
- `/music` is the mounted Navidrome music library.
- `NAVIDROME_LIBRARY_PATH` is set to `/music`.
- `SPOTIFYBU_CONFIG_DIR` is set to `/config`.

The container runs as UID/GID `1000`. On Linux hosts, make sure the mapped Navidrome music folder is writable by that user.

## Spotify Setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the app's Client ID into `SPOTIFY_CLIENT_ID`.
3. Add this redirect URI to the Spotify app:

   ```text
   http://localhost:3000/api/auth/callback
   ```

   If `NEXT_PUBLIC_APP_URL` is different, use:

   ```text
   <NEXT_PUBLIC_APP_URL>/api/auth/callback
   ```

Spotify's official PKCE flow docs are here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

## Navidrome Setup

SpotifyBU is meant to work beside Navidrome. Mount the same host music folder into SpotifyBU that Navidrome scans.

Example:

```yaml
volumes:
  - /srv/navidrome/music:/music
```

SpotifyBU currently checks whether the configured folder exists and whether the app can read and write it. Future download jobs will stage authorized audio files into this folder and record album-folder mappings in:

```text
/music/.spotifybu/album-folders.json
```

Navidrome still needs read access to the same host folder and a scan/watch configuration that sees new files.

Navidrome docs:

- https://www.navidrome.org/docs/getting-started/
- https://www.navidrome.org/docs/usage/features/multi-library/

## Local Development

For local non-Docker development:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set at least:

```text
SPOTIFY_CLIENT_ID=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NAVIDROME_LIBRARY_PATH=/path/to/navidrome/music
SPOTIFYBU_APP_SECRET=change-this-to-a-long-random-value
```

Then open:

```text
http://localhost:3000
```

## Building The Image Locally

To build from source instead of using GHCR:

```bash
docker build -t spotifybu:local .
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  -e SPOTIFYBU_APP_SECRET=change-this-to-a-long-random-value \
  -e SPOTIFY_CLIENT_ID=your-spotify-client-id \
  -e NAVIDROME_LIBRARY_PATH=/music \
  -v spotifybu_config:/config \
  -v /path/to/navidrome/music:/music \
  spotifybu:local
```

## Architecture

- `src/lib/app-auth.ts` owns the local SpotifyBU web login, session cookie signing, and persisted credential updates.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/navidrome.ts` owns Navidrome library path checks, safe target directory creation, folder planning, and album-folder logging.
- `src/lib/providers/types.ts` defines the source-provider contract for matching, downloading, tagging, and provenance.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and Spotify token-session handling.
- `.github/workflows/docker-image.yml` publishes GHCR images for `main` and `v*` tags.

## Source Providers

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. SpotifyBU keeps a similar provider-oriented shape, but download-capable providers must be configured for media the user is authorized to download.

See [docs/source-providers.md](docs/source-providers.md).

## Roadmap

- Persist backups in a database
- Add background backup jobs
- Stage authorized downloads into the configured Navidrome music folder
- Add local/Navidrome-file matching by ISRC, artist, title, and duration
- Add provider adapters inspired by spotDL's source-provider model
- Add import/recreate-playlist workflows
