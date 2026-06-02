# SpotifyBU

SpotifyBU is a Docker-first web app for turning a Spotify library into a local, Navidrome-ready backup. It connects to a user's Spotify account, reads playlists, resolves Spotify song/album metadata, checks which songs are already backed up locally, stages missing tracks into stable Navidrome folders such as `Artist - Album`, and exports backup metadata.

The point is not to replace Navidrome search. Navidrome already tells you what is in Navidrome. SpotifyBU uses Spotify as the source-of-truth list, uses Navidrome matching only to avoid duplicates, and focuses the workflow on the tracks that would disappear if Spotify went away.

Version `1.0.0` is the first packaged release. It includes the web UI, local app login, Spotify OAuth, playlist/song/album metadata reads, Navidrome library checks, folder planning, Docker packaging, and automatic provider sourcing inspired by spotDL.

SpotifyBU can source audio from files already present in the mounted Navidrome music library and can search YouTube first, then JioSaavn, for missing Spotify tracks. The user reviews SpotifyBU's selected provider candidate, confirms they are authorized to download it, and the app stages the final file into the configured Navidrome library. It supports both single-track backups and throttled playlist-scale backup queues. Provider downloads show bulk-download risk warnings, preserve provenance, and stage files only into the configured Navidrome library.

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
- Backup coverage counts for backed-up and missing Spotify tracks
- Stable album-folder logging for staged download jobs
- Source-provider catalog with active YouTube and JioSaavn sourcing plus planned future providers
- Automatic provider search for missing tracks, with YouTube checked before JioSaavn
- Reviewed single-track source downloads for YouTube and JioSaavn using `yt-dlp`
- Throttled bulk backup queues that search, review the best candidate, and download missing Spotify tracks with per-track waits, chunk pauses, and partial-failure reporting
- Output controls for MP3 or FLAC, with 128 kbps or 320 kbps quality targets
- Navidrome-volume staging with idle cleanup for abandoned failed download/convert temp files
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
      NAVIDROME_USERNAME: your-navidrome-username
      NAVIDROME_PASSWORD: your-navidrome-password
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000
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
http://127.0.0.1:3000
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
| `SPOTIFYBU_APP_SECRET` | Yes | Long random value used to sign SpotifyBU's own login sessions. This is not your Spotify app Client Secret. |
| `SPOTIFYBU_SECURE_COOKIES` | No | Set `true` for HTTPS reverse-proxy installs. Defaults to `false` in the Docker example for Unraid-style HTTP installs. |
| `NAVIDROME_MUSIC_PATH` | Yes | Host path to the music folder Navidrome scans. |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID. SpotifyBU uses Authorization Code with PKCE, so it does not use or ask for the Spotify Client Secret. |
| `NAVIDROME_URL` | No | Navidrome URL as seen by the container. Defaults to `http://host.docker.internal:4533`. |
| `NAVIDROME_USERNAME` | No | Navidrome username. Optional, but required if SpotifyBU should ping Navidrome and request a server-side scan after staging files. |
| `NAVIDROME_PASSWORD` | No | Navidrome password for `NAVIDROME_USERNAME`. Optional, but required with `NAVIDROME_USERNAME` for Navidrome API scan requests. |

Inside the container:

- `/config` stores SpotifyBU settings and changed login credentials.
- `/music` is the mounted Navidrome music library.
- `NAVIDROME_LIBRARY_PATH` is set to `/music`.
- `SPOTIFYBU_CONFIG_DIR` is set to `/config`.

The container runs as UID/GID `1000`. On Linux hosts, make sure the mapped Navidrome music folder is writable by that user.

## Reverse Proxy

SpotifyBU can run directly over HTTP for the local web UI, but Spotify OAuth
redirects now require HTTPS unless the redirect URI uses a loopback IP literal
such as `127.0.0.1` or `[::1]`. A normal Unraid/LAN URL such as
`http://192.168.1.50:3000` can load SpotifyBU in your browser, but it should not
be used as the Spotify redirect URI.

For a normal Unraid/LAN install, use an HTTPS URL for SpotifyBU:

```text
NEXT_PUBLIC_APP_URL=https://spotifybu.example.com
SPOTIFYBU_SECURE_COOKIES=true
```

The HTTPS endpoint does not have to expose SpotifyBU broadly to the internet.
It only has to be reachable by the browser doing the Spotify login. Common
options are an internal HTTPS reverse proxy with local DNS, a reverse proxy with
DNS-validated certificates, or a private tunnel/VPN hostname that your browser
can resolve.

For local development on the same machine as the browser, use a loopback IP
literal rather than `localhost`:

```text
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
SPOTIFYBU_SECURE_COOKIES=false
```

Then add this Spotify redirect URI:

```text
<NEXT_PUBLIC_APP_URL>/api/auth/callback
```

SpotifyBU also honors standard `X-Forwarded-Host` and `X-Forwarded-Proto` headers when `NEXT_PUBLIC_APP_URL` is not set, but setting `NEXT_PUBLIC_APP_URL` is recommended for reverse-proxy installs because Spotify OAuth redirect URIs must be exact.

Your proxy should forward the original host and scheme. For most proxies, that means passing `X-Forwarded-Host` and `X-Forwarded-Proto` to the container.

## Spotify Setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the app's Client ID into `SPOTIFY_CLIENT_ID`.
3. Leave the Spotify app's Client Secret out of SpotifyBU. SpotifyBU uses
   Authorization Code with PKCE, which exchanges the login code with
   `client_id` and `code_verifier` instead of `client_secret`.
4. Add this redirect URI to the Spotify app:

   ```text
   <NEXT_PUBLIC_APP_URL>/api/auth/callback
   ```

   For same-machine local development, this is commonly:

   ```text
   http://127.0.0.1:3000/api/auth/callback
   ```

Spotify's official PKCE flow docs are here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
Spotify's redirect URI requirements are here: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri

If Spotify shows `redirect_uri: Not matching configuration`, compare the
SpotifyBU connect-screen redirect URI with the Spotify app's redirect URI list.
They must match exactly, including `http` versus `https`, hostname or IP address,
port, path, and the absence of a trailing slash. For example, if SpotifyBU shows:

```text
https://spotifybu.example.com/api/auth/callback
```

that exact value must be added to the Spotify app. A value such as
`http://127.0.0.1:3000/api/auth/callback`,
`https://tower.local:3000/api/auth/callback`, or
`https://192.168.1.50:3000/api/auth/callback` is different to Spotify.

## Navidrome Setup

SpotifyBU is meant to work beside Navidrome. Mount the same host music folder into SpotifyBU that Navidrome scans.

Example:

```yaml
volumes:
  - /srv/navidrome/music:/music
```

SpotifyBU checks whether the configured folder exists and whether the app can read and write it. Verified provider downloads stage authorized audio files into this folder and record album-folder mappings in:

```text
/music/.spotifybu/album-folders.json
```

Provider downloads stage temporary files under:

```text
/music/.spotifybu/tmp/provider-downloads
```

Finished files are moved into their final `Artist - Album` folder before the response completes. If a download, move, or conversion fails, leftover staging files stay on the mounted music volume rather than the container filesystem. After 10 minutes of provider-download idleness, SpotifyBU removes stale staging files older than 10 minutes old.

Navidrome still needs read access to the same host folder and a scan/watch configuration that sees new files.

SpotifyBU's Library Index scan reads the mounted music folder directly. It does
not need a Navidrome username or password for that local index. If
`NAVIDROME_USERNAME` and `NAVIDROME_PASSWORD` are set, SpotifyBU also uses
Navidrome's Subsonic API to ping the server and request a Navidrome-side library
scan after SpotifyBU indexes or stages files. Without those credentials,
SpotifyBU can still write files into `/music`, but Navidrome will pick them up
only through its own startup/watch/scheduled scan behavior.

The Navidrome API credentials are regular Navidrome user credentials. SpotifyBU
generates the Subsonic token/salt request parameters at request time; it does not
need a separate Navidrome API key.

If Library Index fails, check the mounted folder first:

- `NAVIDROME_MUSIC_PATH` must be the host music folder Navidrome scans, not the
  Navidrome appdata/config folder.
- Inside the SpotifyBU container, `NAVIDROME_LIBRARY_PATH` should normally be
  `/music`.
- The container user must be able to read the music folder and write
  `/music/.spotifybu/library-index.json`.
- A bad or unreadable nested file should be skipped and reported in the UI; a
  top-level mount or permission problem still stops the scan.

Navidrome docs:

- https://www.navidrome.org/docs/getting-started/
- https://www.navidrome.org/docs/usage/features/multi-library/
- https://www.navidrome.org/docs/developers/subsonic-api/

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
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NAVIDROME_LIBRARY_PATH=/path/to/navidrome/music
SPOTIFYBU_APP_SECRET=change-this-to-a-long-random-value
NAVIDROME_USERNAME=
NAVIDROME_PASSWORD=
```

Then open:

```text
http://127.0.0.1:3000
```

## Building The Image Locally

To build from source instead of using GHCR:

```bash
docker build -t spotifybu:local .
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 \
  -e SPOTIFYBU_APP_SECRET=change-this-to-a-long-random-value \
  -e SPOTIFY_CLIENT_ID=your-spotify-client-id \
  -e NAVIDROME_LIBRARY_PATH=/music \
  -e NAVIDROME_USERNAME=your-navidrome-username \
  -e NAVIDROME_PASSWORD=your-navidrome-password \
  -v spotifybu_config:/config \
  -v /path/to/navidrome/music:/music \
  spotifybu:local
```

## Architecture

- `src/lib/app-auth.ts` owns the local SpotifyBU web login, session cookie signing, and persisted credential updates.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/navidrome.ts` owns Navidrome library path checks, safe target directory creation, folder planning, and album-folder logging.
- `src/lib/providers/types.ts` defines the source-provider contract and provider catalog for matching, downloading, tagging, and provenance.
- `src/lib/providers/download.ts` searches provider candidates, validates selected provider URLs, calls `yt-dlp`, stages files on the Navidrome volume, tags downloads with Spotify metadata, records provenance, and cleans abandoned staging files after idle.
- `src/app/api/providers/route.ts` exposes the provider catalog and provider risk/status metadata.
- `src/app/api/providers/search/route.ts` searches YouTube first, then JioSaavn, for candidate sources.
- `src/app/api/providers/download/route.ts` handles confirmed single-track provider download requests.
- `src/app/api/providers/download/batch/route.ts` supports confirmed throttled provider download queues.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and Spotify token-session handling.
- `.github/workflows/docker-image.yml` publishes GHCR images for `main` and `v*` tags.

## Source Providers

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. SpotifyBU keeps a similar provider-oriented shape, but the active automatic sourcing flow intentionally uses direct YouTube search first and JioSaavn second. YouTube Music, Piped, SoundCloud, and Bandcamp remain planned/future provider entries rather than active UI choices. The implemented download path searches provider candidates for a selected missing track or for every missing track in a playlist-scale queue, then processes downloads sequentially with configured wait between tracks and longer pauses between chunks.

Bulk playlist sourcing can trigger provider throttling, captchas, temporary blocks, account action, or service-term issues. SpotifyBU should show those risks before starting large jobs and should use conservative rate limits, cancellation, retries, and dry-run previews.

See [docs/source-providers.md](docs/source-providers.md).

## Roadmap

- Persist backups in a database
- Add background backup jobs
- Stage authorized downloads into the configured Navidrome music folder
- Add local/Navidrome-file matching by ISRC, artist, title, and duration
- Add provider adapters inspired by spotDL's source-provider model
- Add import/recreate-playlist workflows
