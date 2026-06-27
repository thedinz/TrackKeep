# SpotifyBU

SpotifyBU is a Docker-first web app for turning a Spotify library into a local, Navidrome-ready backup. It connects to a user's Spotify account, reads playlists, resolves Spotify song/album metadata, checks which songs are already backed up locally, stages missing tracks into clean Navidrome album folders, and exports backup metadata.

The point is not to replace Navidrome search. Navidrome already tells you what is in Navidrome. SpotifyBU uses Spotify as the source-of-truth list, uses Navidrome matching only to avoid duplicates, and focuses the workflow on the tracks that would disappear if Spotify went away.

Current stable release: `1.4.0`. It includes the web UI, local or external-proxy app auth, Spotify OAuth, playlist/song/album/track-list metadata reads, SQLite-backed metadata backup snapshots, Navidrome library checks, SpotifyBU organize naming, library indexing, matched-file organization, Navidrome playlist sync controls, Docker packaging, and automatic provider sourcing inspired by spotDL.

Download the latest stable release from GitHub: https://github.com/thedinz/SpotifyBU/releases/latest

SpotifyBU can source audio from files already present in the mounted Navidrome music library and can search YouTube first, then JioSaavn, for missing Spotify tracks. Single-track backup lets the user review provider candidates before downloading. Bulk playlist backup now starts with a dry-run candidate preview, then runs as a resumable background job with cancel and retry controls. Provider downloads show authorization and bulk-risk warnings, preserve provenance, and stage files only into the configured Navidrome library.

## Features

- Spotify OAuth using Authorization Code with PKCE
- Local SpotifyBU login with default `admin/admin` credentials
- Settings page for switching between internal login and external reverse-proxy auth
- Settings page for changing the SpotifyBU app username and password
- Settings page with the canonical SpotifyBU organize scheme
- Playlist listing with private and collaborative playlist scopes
- Playlist rail badges for fully backed-up playlists and changed playlists with unbacked-up track counts
- SQLite-backed playlist metadata backup snapshots saved under the SpotifyBU config directory
- Song, album, and pasted track-list metadata lookup from Spotify URLs, URIs, or IDs
- Playlist track preview
- Optional Navidrome playlist creation from matched Spotify playlist tracks
- Navidrome library folder status checks
- Navidrome library indexing for local backup coverage checks
- Navidrome folder planning using clean artist, album, and track paths
- Backup coverage counts for backed-up and missing Spotify tracks
- Track backup table with one-click provider search for missing tracks
- Matched-file organization into clean Navidrome album folders
- Replace, append, or full-sync matching Navidrome playlists from backed-up Spotify playlist tracks
- Skipped-track review after Navidrome playlist sync
- Stable album-folder logging for staged download jobs
- Spotify title, artist, album, and album-cover tagging for staged provider downloads
- Source-provider catalog with active YouTube and JioSaavn sourcing plus planned future providers
- Automatic provider search for missing tracks, with YouTube checked before JioSaavn
- Reviewed single-track source downloads for YouTube and JioSaavn using `yt-dlp`, alternate candidate fallback, and background job polling
- Dry-run bulk candidate previews with live progress before provider downloads
- Resumable background bulk playlist jobs with cancellation, retry, per-track waits, chunk pauses, progress reporting, and partial-failure reporting
- MP3 output with 128 kbps or 320 kbps quality targets
- Navidrome-volume staging with idle cleanup for abandoned failed download/convert temp files
- Docker image with Node.js, `ffmpeg`, prerelease/nightly-channel `yt-dlp[default]`, Python 3, and `pip`
- GitHub Container Registry image publishing for `dev`, `latest`, and version tags

## Docker Quick Start

The stable image built from `main` is:

```text
ghcr.io/thedinz/spotifybu:latest
```

The test image built from the `dev` branch is:

```text
ghcr.io/thedinz/spotifybu:dev
```

Use `latest` for normal installs. Use `dev` while testing changes before they are promoted to `main`. Dev builds may use prerelease versions such as `1.4.0-dev.1`; stable releases use normal version tags such as `1.4.0`. The image tag chooses the branch/release track; no separate runtime `GIT_BRANCH` setting is needed.

For the exact v1.4.0 release, pin one of these tags:

```text
ghcr.io/thedinz/spotifybu:v1.4.0
ghcr.io/thedinz/spotifybu:1.4.0
ghcr.io/thedinz/spotifybu:1.4
```

Create a folder for SpotifyBU and save this Compose template as `docker-compose.yml`:

For stable installs:

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
      NAVIDROME_LIBRARY_PATH: /music
      NAVIDROME_URL: http://host.docker.internal:4533
      NAVIDROME_USERNAME: your-navidrome-username
      NAVIDROME_PASSWORD: your-navidrome-password
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000
      SPOTIFYBU_APP_SECRET: change-this-to-a-long-random-value
      SPOTIFYBU_AUTH_MODE: internal
      SPOTIFYBU_CONFIG_DIR: /config
      SPOTIFY_CLIENT_ID: your-spotify-client-id
    volumes:
      - spotifybu_config:/config
      - /path/to/navidrome/music:/music

volumes:
  spotifybu_config:
```

For testing the `dev` branch, change the image to `ghcr.io/thedinz/spotifybu:dev`.

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

After signing in, open Settings and change the login or switch app access to an
external auth provider.

## Docker Environment

The repository also includes [.env.docker.example](.env.docker.example) and [docker-compose.yml](docker-compose.yml) as a reusable base:

```bash
cp .env.docker.example .env
docker compose up -d
```

Set these values before starting the app:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SPOTIFYBU_IMAGE` | No | Docker image tag to run. The checked-in Docker example defaults to `ghcr.io/thedinz/spotifybu:dev` for testing. Use `ghcr.io/thedinz/spotifybu:latest` for stable installs. |
| `SPOTIFYBU_PORT` | No | Host port for the web UI. Defaults to `3000`. |
| `NEXT_PUBLIC_APP_URL` | No | Public URL for SpotifyBU. Set this for reverse-proxy installs. If blank, SpotifyBU derives it from `X-Forwarded-Host`/`X-Forwarded-Proto` or the request host. |
| `SPOTIFYBU_APP_SECRET` | Yes | Long random value used to sign SpotifyBU's own login sessions. This is not your Spotify app Client Secret. |
| `SPOTIFYBU_DATABASE_PATH` | No | Optional SQLite path. Defaults to `<SPOTIFYBU_CONFIG_DIR>/spotifybu.sqlite`. |
| `SPOTIFYBU_SECURE_COOKIES` | No | Set `true` for HTTPS reverse-proxy installs. Defaults to `false` in the Docker example for Unraid-style HTTP installs. |
| `SPOTIFYBU_AUTH_MODE` | No | Set `external` when Authentik or another trusted reverse proxy protects SpotifyBU. Defaults to `internal`, which keeps the built-in login page enabled. |
| `NAVIDROME_MUSIC_PATH` | Yes | Host path to the music folder Navidrome scans. |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID. SpotifyBU uses Authorization Code with PKCE, so it does not use or ask for the Spotify Client Secret. |
| `NAVIDROME_URL` | No | Navidrome URL as seen by the container. Defaults to `http://host.docker.internal:4533`. |
| `NAVIDROME_USERNAME` | No | Navidrome username. Optional, but required if SpotifyBU should ping Navidrome and request a server-side scan after staging files. |
| `NAVIDROME_PASSWORD` | No | Navidrome password for `NAVIDROME_USERNAME`. Optional, but required with `NAVIDROME_USERNAME` for Navidrome API scan requests. |

Inside the container:

- `/config` stores SpotifyBU settings, changed login credentials, and
  `spotifybu.sqlite` for persisted metadata backups and bulk job snapshots.
- `/config/logs/spotifybu.log` stores focused JSON-line diagnostics for Spotify
  route failures and unusual Spotify playlist payloads.
- `/music` is the mounted Navidrome music library.
- `NAVIDROME_LIBRARY_PATH` is set to `/music`.
- `SPOTIFYBU_CONFIG_DIR` is set to `/config`.

At startup, the container makes `/config` writable by UID/GID `1000`, then runs
the app as that user. On Linux hosts, make sure the mapped Navidrome music
folder is writable by UID/GID `1000`.

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

For reverse-proxy installs, setting `NEXT_PUBLIC_APP_URL` is recommended. You
can leave it blank only when your proxy forwards the original host and scheme
with `X-Forwarded-Host` and `X-Forwarded-Proto`. After signing in to SpotifyBU,
check the Connect Spotify screen and copy the redirect URI it shows into the
Spotify Developer Dashboard. If that URI shows the wrong host or scheme, set
`NEXT_PUBLIC_APP_URL` to the exact public base URL.

If your reverse proxy also handles user authentication, open Settings and set
Authentication Provider to `External proxy auth`, or start the container with:

```text
SPOTIFYBU_AUTH_MODE=external
```

External auth mode disables SpotifyBU's built-in login form and treats requests
that reach the app as already authenticated. Only use it behind a trusted proxy
such as Authentik, Authelia, or another access-control layer.

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

Then add the Spotify redirect URI shown on SpotifyBU's Connect Spotify screen.
When `NEXT_PUBLIC_APP_URL` is set, it will be:

```text
<NEXT_PUBLIC_APP_URL>/api/auth/callback
```

Your proxy should forward the original host and scheme. For most proxies, that means passing `X-Forwarded-Host` and `X-Forwarded-Proto` to the container.

## Spotify Setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the app's Client ID into `SPOTIFY_CLIENT_ID`.
3. Leave the Spotify app's Client Secret out of SpotifyBU. SpotifyBU uses
   Authorization Code with PKCE, which exchanges the login code with
   `client_id` and `code_verifier` instead of `client_secret`.
4. Add the redirect URI shown on SpotifyBU's Connect Spotify screen to the
   Spotify app. When `NEXT_PUBLIC_APP_URL` is set, the URI is:

   ```text
   <NEXT_PUBLIC_APP_URL>/api/auth/callback
   ```

   For same-machine local development, this is commonly:

   ```text
   http://127.0.0.1:3000/api/auth/callback
   ```

Spotify's official PKCE flow docs are here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
Spotify's redirect URI requirements are here: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri

### Followed Playlists And Track Lists

SpotifyBU always tries to read a selected playlist through Spotify's official
playlist item API. Under Spotify's 2026 Development Mode rules, Spotify may
return `403 Forbidden` for playlist items unless the connected Spotify user owns
the playlist or is a collaborator. SpotifyBU can still list followed playlist
metadata because that is a different Spotify API response; the blocked part is
the ordered track list itself.

When a followed playlist is blocked, use the `Track list` source type. Paste
Spotify song URLs, URIs, or IDs from a playlist export or copied track list, and
SpotifyBU resolves each song through Spotify's track metadata API. The rest of
the workflow is the same: Navidrome matching, missing-track provider search,
bulk backup, and local metadata export all work from that resolved track list.

Direct playlist reads are still best when Spotify allows them. Track lists are
the supported fallback for followed playlists that Spotify refuses to expose to
third-party Development Mode apps.

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

Finished files are moved into the active organize scheme before the response completes. The default standard scheme is `Artist/Artist - Album (Year)/Artist - Album (Year) - 01 - Track Title`. Multi-disc albums use `Disc-Track` numbering, for example `02-03`. If a download, move, or conversion fails, leftover staging files stay on the mounted music volume rather than the container filesystem. After 10 minutes of provider-download idleness, SpotifyBU removes stale staging files older than 10 minutes old.

Navidrome still needs read access to the same host folder and a scan/watch configuration that sees new files.

### Organize Matched Files

After a library scan, the Organize action compares matched local files against the same naming scheme used for new SpotifyBU downloads. It moves or renames loose files, older SpotifyBU folder layouts, and other matched tracks that are not exactly in the expected structure. The rendered Spotify-derived target path is canonical, so a different year, folder name, or filename is treated as organization work instead of being accepted as close enough.

Running Organize before backing up missing files is recommended, but not required. It gives SpotifyBU a clean library view first, can repair older organize runs, and reduces the chance of downloading a track that already exists under a messy path. If you skip it, new provider downloads still stage into the active organize layout.

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

When Navidrome API credentials are configured, Spotify playlist views include a
Sync Navidrome action. The action creates or updates a same-named Navidrome
playlist using Spotify tracks that are already matched to songs in the Navidrome
API. Replace rebuilds the playlist from matched Spotify tracks, append only adds
new matches, and full sync removes stale Navidrome entries before adding the
current matched Spotify order. Tracks that are not backed up or not visible to
Navidrome are skipped and reported in the UI, so scan/index the library before
syncing a playlist.

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

For repeatable Windows/PowerShell verification, run:

```powershell
.\scripts\verify.ps1
```

The script bootstraps a portable Node.js 22 runtime into the ignored `.tools`
folder when needed, installs locked dependencies with `npm ci`, then runs
`npm run typecheck` and `npm run build`. If dependencies are already current,
use `.\scripts\verify.ps1 -SkipInstall`.

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

- `src/lib/app-auth.ts` owns internal/external app auth mode, local SpotifyBU web login, session cookie signing, and persisted credential updates.
- `src/lib/database.ts` opens the local SQLite database under `SPOTIFYBU_CONFIG_DIR`.
- `src/lib/backup-store.ts` persists deduplicated playlist metadata backup snapshots.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/navidrome.ts` owns Navidrome library path checks, safe target directory creation, folder planning, library indexing, local matching, matched-file organization, album-folder logging, and Navidrome playlist replace, append, and full-sync modes.
- `src/lib/providers/types.ts` defines the source-provider contract and provider catalog for matching, downloading, tagging, and provenance.
- `src/lib/providers/download.ts` searches provider candidates, validates selected provider URLs, calls `yt-dlp`, retries alternate provider candidates for source-side failures, stages files on the Navidrome volume, tags downloads with Spotify metadata, records provenance, and cleans abandoned staging files after idle.
- `src/app/api/providers/route.ts` exposes the provider catalog and provider risk/status metadata.
- `src/app/api/providers/search/route.ts` searches YouTube first, then JioSaavn, for candidate sources.
- `src/app/api/providers/download/route.ts` starts confirmed single-track provider download jobs.
- `src/app/api/providers/download/status/[jobId]/route.ts` reports provider download job status for UI polling.
- `src/app/api/providers/download/batch/route.ts` supports confirmed throttled provider download queues.
- `src/app/api/providers/download/bulk/preview/route.ts` dry-runs provider candidate selection for missing tracks.
- `src/app/api/providers/download/bulk/route.ts` starts persisted background bulk provider jobs.
- `src/app/api/providers/download/bulk/[jobId]/route.ts` reports, cancels, and retries bulk provider jobs.
- `src/app/api/navidrome/library/organize/route.ts` moves or renames matched local files into their planned Navidrome album paths in small batches.
- `src/app/api/spotify/playlists/[playlistId]/navidrome/route.ts` replaces, appends, or full-syncs a matching Navidrome playlist from backed-up Spotify tracks.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and Spotify token-session handling.
- `.github/workflows/docker-image.yml` publishes GHCR images for `dev`, `main`, and `v*` tags. The `dev` branch publishes `dev`; `main` and version tags publish stable tags such as `latest`. The workflow runs `npm run check:yt-dlp` so image builds record the current yt-dlp release channel before publishing.

## Source Providers

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. SpotifyBU keeps a similar provider-oriented shape, but the active automatic sourcing flow intentionally uses direct YouTube search first and JioSaavn second. YouTube Music, Piped, SoundCloud, and Bandcamp remain planned/future provider entries rather than active UI choices. The implemented download path searches provider candidates for a selected missing track, or dry-runs candidate selection for each missing track in a playlist-scale queue before starting a persisted background job with configured waits between tracks and longer pauses between chunks. If a download fails with a source-side provider error such as a YouTube 403, SpotifyBU retries other reviewed or previewed candidates before marking the track as needing review.

Bulk playlist sourcing can trigger provider throttling, captchas, temporary blocks, account action, or service-term issues. SpotifyBU shows those risks before starting large jobs and uses conservative rate limits, chunk pauses, background status polling, partial-failure reporting, dry-run previews, cancellation, retry controls, and provenance logs.

## Maintenance Checks

Run `npm run check:yt-dlp` during code-change passes that touch downloads, Docker, provider behavior, release packaging, or deployment docs. SpotifyBU images intentionally install `yt-dlp[default]` with `--pre --upgrade` so fresh image builds pick up the newest available yt-dlp/EJS support; the check script makes that release-channel state visible before publishing.

See [docs/source-providers.md](docs/source-providers.md).

## Roadmap

- Add long-term backup history browsing and restore flows
- Add owned-file import workflows for music the user already has outside Navidrome
- Add more provider adapters where the user's authorization model is clear
- Add richer bulk job history filtering and cleanup controls
