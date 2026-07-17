# TrackKeep

TrackKeep is a Docker-first web app for turning a Spotify library into a Navidrome-ready local backup with optional Navidrome or Plex playlist sync. It connects to a user's Spotify account, reads playlists, resolves Spotify song/album metadata, checks which songs are already backed up in the mounted Navidrome music folder, stages missing tracks into clean album folders, and exports backup metadata.

The point is not to replace Navidrome search. Navidrome already tells you what files exist locally. TrackKeep uses Spotify as the source-of-truth list, uses local library matching only to avoid duplicates, and focuses the workflow on the tracks that would disappear if Spotify went away.

Current stable release: `1.7.0`. It includes the web UI, local or external-proxy app auth, Spotify OAuth diagnostics, playlist/song/album/track-list metadata reads, SQLite-backed metadata backup snapshots, Navidrome folder checks, TrackKeep organize naming, library indexing, durable Spotify identity tags for downloaded files, matched-file organization, Navidrome and Plex playlist sync controls, Docker packaging, and automatic provider sourcing inspired by spotDL.

The existing Docker image name and `.spotifybu` data paths retain their original
identifiers so upgrades keep using the same image and persisted data. New
configuration uses `TRACKKEEP_*` environment variables; matching `SPOTIFYBU_*`
names remain supported as legacy fallbacks.

Download the latest stable release from GitHub: https://github.com/thedinz/TrackKeep/releases/latest

TrackKeep can source audio from files already present in the mounted Navidrome music folder and can search YouTube first, then JioSaavn, for missing Spotify tracks. Single-track backup lets the user review provider candidates before downloading. Bulk playlist backup now starts with a dry-run candidate preview, then runs as a resumable background job with cancel and retry controls. Provider downloads show authorization and bulk-risk warnings, preserve provenance, and stage files only into the configured Navidrome music folder.

## Features

- Spotify OAuth using Authorization Code with PKCE
- Local TrackKeep login with default `admin/admin` credentials
- Settings page for switching between internal login and external reverse-proxy auth
- Settings page for changing the TrackKeep app username and password
- Settings page with the canonical TrackKeep organize scheme
- Playlist listing with private and collaborative playlist scopes
- Playlist rail badges for fully backed-up playlists and changed playlists with unbacked-up track counts
- SQLite-backed playlist metadata backup snapshots saved under the TrackKeep config directory
- Song, album, and pasted track-list metadata lookup from Spotify URLs, URIs, or IDs
- Playlist track preview
- Optional Navidrome or Plex playlist creation from matched Spotify playlist tracks
- Navidrome folder status checks
- Right-sidebar quick and full Navidrome server scans with progress status
- Navidrome music folder indexing for local backup coverage checks
- Navidrome folder planning using clean artist, album, and track paths
- Backup coverage counts for backed-up and missing Spotify tracks
- Track backup table with one-click provider search for missing tracks
- Matched-file organization into clean Navidrome album folders
- Replace, append, or full-sync matching Navidrome or Plex playlists from backed-up Spotify playlist tracks
- Skipped-track review after playlist sync
- Stable album-folder logging for staged download jobs
- Spotify title, artist, album, album-cover, and durable Spotify identity tagging for staged provider downloads
- Source-provider catalog with active YouTube and JioSaavn sourcing plus planned future providers
- Automatic provider search for missing tracks, with YouTube checked before JioSaavn
- Reviewed single-track source downloads for YouTube and JioSaavn using `yt-dlp`, alternate candidate fallback, and background job polling
- Dry-run bulk candidate previews with live progress before provider downloads
- Resumable background bulk playlist jobs with cancellation, retry, per-track waits, chunk pauses, progress reporting, and partial-failure reporting
- Ogg Opus output up to 192 kbps by default, configurable to 160/192/256 kbps caps, with optional MP3 192/256/320 kbps fallback and MP3 kept as a legacy compatibility option
- Navidrome volume staging with idle cleanup for abandoned failed download/convert temp files
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

Use `latest` for normal installs. Use `dev` while testing changes before they are promoted to `main`. Dev builds may use prerelease versions such as `1.7.0-dev.1`; stable releases use normal version tags such as `1.7.0`. The image tag chooses the branch/release track; no separate runtime `GIT_BRANCH` setting is needed.

For the exact v1.7.0 release, pin one of these tags:

```text
ghcr.io/thedinz/spotifybu:v1.7.0
ghcr.io/thedinz/spotifybu:1.7.0
ghcr.io/thedinz/spotifybu:1.7
```

Create a folder for TrackKeep and save this Compose template as `docker-compose.yml`:

For stable installs:

```yaml
services:
  trackkeep:
    image: ghcr.io/thedinz/spotifybu:latest
    pull_policy: always
    container_name: trackkeep
    restart: unless-stopped
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "3000:3000"
    environment:
      MUSIC_LIBRARY_PATH: /music
      NAVIDROME_URL: http://host.docker.internal:4533
      NAVIDROME_USERNAME: your-navidrome-username
      NAVIDROME_PASSWORD: your-navidrome-password
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000
      PGID: "1000"
      PUID: "1000"
      TRACKKEEP_APP_SECRET: change-this-to-a-long-random-value
      TRACKKEEP_AUTH_MODE: internal
      TRACKKEEP_CHOWN_MUSIC: "false"
      TRACKKEEP_CONFIG_DIR: /config
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

The default TrackKeep web login is:

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
| `TRACKKEEP_IMAGE` | No | Docker image tag to run. The checked-in Docker example defaults to `ghcr.io/thedinz/spotifybu:dev` for testing. Use `ghcr.io/thedinz/spotifybu:latest` for stable installs. |
| `TRACKKEEP_PORT` | No | Host port for the web UI. Defaults to `3000`. |
| `NEXT_PUBLIC_APP_URL` | No | Public URL for TrackKeep. Set this for reverse-proxy installs. If blank, TrackKeep derives it from `X-Forwarded-Host`/`X-Forwarded-Proto` or the request host. |
| `TRACKKEEP_APP_SECRET` | Yes | Long random value used to sign TrackKeep's own login sessions. This is not your Spotify app Client Secret. |
| `TRACKKEEP_DATABASE_PATH` | No | Optional SQLite path. Defaults to `<TRACKKEEP_CONFIG_DIR>/spotifybu.sqlite`. |
| `PUID` | No | User ID used by the TrackKeep process inside the container. Defaults to `1000` for compatibility with older images. On Unraid, set this to match NaviClean/Navidrome, commonly `99`. |
| `PGID` | No | Group ID used by the TrackKeep process inside the container. Defaults to `1000` for compatibility with older images. On Unraid, set this to match NaviClean/Navidrome, commonly `100`. |
| `TRACKKEEP_CHOWN_MUSIC` | No | Advanced opt-in repair switch. Set `true` only if you intentionally want container startup to recursively chown the mounted music library to `PUID:PGID`. Defaults to `false`. |
| `TRACKKEEP_SECURE_COOKIES` | No | Set `true` for HTTPS reverse-proxy installs. Defaults to `false` in the Docker example for Unraid-style HTTP installs. |
| `TRACKKEEP_AUTH_MODE` | No | Set `external` when Authentik or another trusted reverse proxy protects TrackKeep. Defaults to `internal`, which keeps the built-in login page enabled. |
| `NAVIDROME_MUSIC_PATH` | Yes | Host path to the Navidrome music folder. |
| `MUSIC_LIBRARY_HOST_PATH` | No | Generic equivalent accepted by the checked-in Compose file. |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID. TrackKeep uses Authorization Code with PKCE, so it does not use or ask for the Spotify Client Secret. |
| `NAVIDROME_URL` | No | Navidrome URL as seen by the TrackKeep container. Defaults to `http://host.docker.internal:4533`. |
| `NAVIDROME_USERNAME` | No | Navidrome username. Optional, but required if TrackKeep should ping Navidrome and request a server-side scan after staging files. |
| `NAVIDROME_PASSWORD` | No | Navidrome password for `NAVIDROME_USERNAME`. Optional, but required with `NAVIDROME_USERNAME` for Navidrome scan and playlist sync requests. |
| `PLEX_SERVER_URL` | No | Optional Plex Media Server URL for playlist sync, such as `http://host.docker.internal:32400`. Can also be saved from Settings. |
| `PLEX_TOKEN` | No | Optional Plex `X-Plex-Token` for playlist sync. Can also be saved from Settings. |
| `PLEX_MUSIC_LIBRARY_KEY` | No | Optional Plex music library key. If blank, TrackKeep auto-selects the first Plex music library it can see. |
| `MUSIC_LIBRARY_URL` | No | Generic equivalent for `NAVIDROME_URL`. |
| `MUSIC_LIBRARY_USERNAME` | No | Generic equivalent for `NAVIDROME_USERNAME`. |
| `MUSIC_LIBRARY_PASSWORD` | No | Generic equivalent for `NAVIDROME_PASSWORD`. |

Every documented `TRACKKEEP_*` setting also accepts the matching legacy
`SPOTIFYBU_*` name. If both are set, `TRACKKEEP_*` takes precedence. This lets
existing Unraid and Compose installs upgrade without editing their current
configuration while new installs use the TrackKeep names.

TrackKeep is Navidrome-first, but it still accepts the generic
`MUSIC_LIBRARY_*` names for existing installs and for anyone pointing the same
Subsonic-compatible workflow at another server. You do not need to rename a
working install; new Navidrome installs can use the `NAVIDROME_*` names shown in
the example.

Inside the container:

- `/config` stores TrackKeep settings, changed login credentials, and
  `spotifybu.sqlite` for persisted metadata backups and bulk job snapshots.
- `/config/logs/spotifybu.log` stores focused JSON-line diagnostics for Spotify
  route failures and unusual Spotify playlist payloads.
- `/music` is the mounted Navidrome music folder.
- `MUSIC_LIBRARY_PATH` is set to `/music`.
- `TRACKKEEP_CONFIG_DIR` is set to `/config`.

At startup, the container creates `/config`, makes it writable by `PUID:PGID`,
then runs the app as that UID/GID. Existing installs that do not set `PUID` or
`PGID` keep the previous `1000:1000` behavior. TrackKeep does not recursively
change ownership of `/music` by default. On large libraries, that can be slow and
risky, so `TRACKKEEP_CHOWN_MUSIC=true` is an explicit repair option only.

### Unraid Shared Library Permissions

The Unraid template lives in
[thedinz/unraid-templates](https://github.com/thedinz/unraid-templates/blob/main/templates/spotifybu.xml).
When TrackKeep shares a mounted music library with NaviClean and Navidrome, set
TrackKeep's `PUID` and `PGID` to the same values used by those containers. Many
Unraid installs use `PUID=99` and `PGID=100`, but the right values are the ones
already writing your music files.

If NaviClean creates or moves folders as `99:100` while TrackKeep runs as
`1000:1000`, TrackKeep may still read and index the files but fail to rename or
move them during Organize. In the UI this shows up as files that "could not be
moved." Matching `PUID`/`PGID` lets both apps create and move files with the
same ownership model. Keep `TRACKKEEP_CHOWN_MUSIC=false` unless you have
intentionally decided TrackKeep should take ownership of the whole mounted
library at startup.

## Reverse Proxy

TrackKeep can run directly over HTTP for the local web UI, but Spotify OAuth
redirects now require HTTPS unless the redirect URI uses a loopback IP literal
such as `127.0.0.1` or `[::1]`. A normal Unraid/LAN URL such as
`http://192.168.1.50:3000` can load TrackKeep in your browser, but it should not
be used as the Spotify redirect URI.

For a normal Unraid/LAN install, use an HTTPS URL for TrackKeep:

```text
NEXT_PUBLIC_APP_URL=https://spotifybu.example.com
TRACKKEEP_SECURE_COOKIES=true
```

For reverse-proxy installs, setting `NEXT_PUBLIC_APP_URL` is recommended. You
can leave it blank only when your proxy forwards the original host and scheme
with `X-Forwarded-Host` and `X-Forwarded-Proto`. After signing in to TrackKeep,
check the Connect Spotify screen and copy the redirect URI it shows into the
Spotify Developer Dashboard. If that URI shows the wrong host or scheme, set
`NEXT_PUBLIC_APP_URL` to the exact public base URL.

If your reverse proxy also handles user authentication, open Settings and set
Authentication Provider to `External proxy auth`, or start the container with:

```text
TRACKKEEP_AUTH_MODE=external
```

External auth mode disables TrackKeep's built-in login form and treats requests
that reach the app as already authenticated. Only use it behind a trusted proxy
such as Authentik, Authelia, or another access-control layer.

The HTTPS endpoint does not have to expose TrackKeep broadly to the internet.
It only has to be reachable by the browser doing the Spotify login. Common
options are an internal HTTPS reverse proxy with local DNS, a reverse proxy with
DNS-validated certificates, or a private tunnel/VPN hostname that your browser
can resolve.

For local development on the same machine as the browser, use a loopback IP
literal rather than `localhost`:

```text
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
TRACKKEEP_SECURE_COOKIES=false
```

Then add the Spotify redirect URI shown on TrackKeep's Connect Spotify screen.
When `NEXT_PUBLIC_APP_URL` is set, it will be:

```text
<NEXT_PUBLIC_APP_URL>/api/auth/callback
```

Your proxy should forward the original host and scheme. For most proxies, that means passing `X-Forwarded-Host` and `X-Forwarded-Proto` to the container.

## Spotify Setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the app's Client ID into `SPOTIFY_CLIENT_ID`.
3. Leave the Spotify app's Client Secret out of TrackKeep. TrackKeep uses
   Authorization Code with PKCE, which exchanges the login code with
   `client_id` and `code_verifier` instead of `client_secret`.
4. Add the redirect URI shown on TrackKeep's Connect Spotify screen to the
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

TrackKeep always tries to read a selected playlist through Spotify's official
playlist item API. Under Spotify's 2026 Development Mode rules, Spotify may
return `403 Forbidden` for playlist items unless the connected Spotify user owns
the playlist or is a collaborator. TrackKeep can still list followed playlist
metadata because that is a different Spotify API response; the blocked part is
the ordered track list itself.

When a followed playlist is blocked, use the `Track list` source type. Paste
Spotify song URLs, URIs, or IDs from a playlist export or copied track list, and
TrackKeep resolves each song through Spotify's track metadata API. The rest of
the workflow is the same: Navidrome matching, missing-track provider search,
bulk backup, and local metadata export all work from that resolved track list.

Direct playlist reads are still best when Spotify allows them. Track lists are
the supported fallback for followed playlists that Spotify refuses to expose to
third-party Development Mode apps.

If Spotify shows `redirect_uri: Not matching configuration`, compare the
TrackKeep connect-screen redirect URI with the Spotify app's redirect URI list.
They must match exactly, including `http` versus `https`, hostname or IP address,
port, path, and the absence of a trailing slash. For example, if TrackKeep shows:

```text
https://spotifybu.example.com/api/auth/callback
```

that exact value must be added to the Spotify app. A value such as
`http://127.0.0.1:3000/api/auth/callback`,
`https://tower.local:3000/api/auth/callback`, or
`https://192.168.1.50:3000/api/auth/callback` is different to Spotify.

## Navidrome Setup

TrackKeep is built to work beside Navidrome. Mount the host Navidrome music
folder into TrackKeep so it can index existing backups and stage new files.
Navidrome's Subsonic-compatible API is used only when TrackKeep needs to request
a server scan or create/update playlists.

Example:

```yaml
volumes:
  - /srv/navidrome/music:/music
```

TrackKeep checks whether the configured folder exists and whether the app can read and write it. Verified provider downloads stage authorized audio files into this folder and record album-folder mappings in:

```text
/music/.spotifybu/album-folders.json
```

Provider downloads stage temporary files under:

```text
/music/.spotifybu/tmp/provider-downloads
```

Finished files are moved into the active organize scheme before the response
completes. New provider downloads request Ogg Opus up to 192 kbps by default,
can be changed in Settings to 160/192/256 kbps caps, and write `.opus` files
with Navidrome-facing Vorbis comments and embedded artwork. Lower-bitrate
provider audio is kept at source quality instead of being upconverted. If Opus
cannot be written for a format/conversion reason, Settings can allow an MP3
fallback at 192, 256, or the default/recommended 320 kbps; MP3 also remains
available as a legacy compatibility format. Existing MP3 and older TrackKeep M4A
files are left in place and continue to scan/match normally.
TrackKeep does not transcode old lossy files as a quality upgrade, because
transcoding lossy audio cannot recover quality; redownload the source if you
want the improved default output. The default standard scheme is `Artist/Artist - Album
(Year)/Artist - Album (Year) - 01 - Track Title`. Multi-disc albums use
`Disc-Track` numbering, for example `02-03`. If a download, move, or conversion
fails, leftover staging files stay on the mounted music volume rather than the
container filesystem. After 10 minutes of provider-download idleness, TrackKeep
removes stale staging files older than 10 minutes old.

Newly tagged TrackKeep provider downloads include Spotify identity metadata in
both the current `trackkeep:*` namespace and the legacy `spotifybu:*` namespace,
including `track_id`, `track_uri`, `album_id`, `isrc`, and `identity_version`.
Dual-writing keeps existing NaviClean releases able to exclude TrackKeep-managed
files, while TrackKeep reads either namespace (including underscore, iTunes, and
legacy M4A comment forms). Opus downloads store these as normal Vorbis comments
alongside title, artist, album artist, album, track, disc, release date, ISRC,
compilation, and embedded artwork. Library indexing reads these tags first so a
file can still reconnect to its Spotify track after another organizer moves or
renames it. Playlist membership is not written into audio files; it continues
to come from TrackKeep playlist backup snapshots and the local database.
Settings includes a maintenance action to add these identity tags to already
matched backups from saved playlist snapshots.

Navidrome still needs read access to the same host folder and a scan/watch configuration that sees new files.

### Organize Matched Files

After a library scan, the Organize action compares matched local files against the same naming scheme used for new TrackKeep downloads. It moves or renames loose files, older TrackKeep folder layouts, and other matched tracks that are not exactly in the expected structure. The rendered Spotify-derived target path is canonical, so a different year, folder name, or filename is treated as organization work instead of being accepted as close enough.

Running Organize before backing up missing files is recommended, but not required. It gives TrackKeep a clean Navidrome-folder view first, can repair older organize runs, and reduces the chance of downloading a track that already exists under a messy path. If you skip it, new provider downloads still stage into the active organize layout.

TrackKeep's Library Index scan reads the mounted music folder directly. It does
not need a Navidrome username or password for that local index. If
`NAVIDROME_USERNAME` and `NAVIDROME_PASSWORD` are set, the right sidebar also
offers quick and full Navidrome server scans with progress status, using the
same Subsonic-compatible API NaviClean uses. TrackKeep can also request a
server-side library scan after it indexes or stages files. Without those credentials,
TrackKeep can still write files into `/music`, but Navidrome will pick them up
only through its own startup/watch/scheduled scan behavior. The generic
`MUSIC_LIBRARY_USERNAME` and `MUSIC_LIBRARY_PASSWORD` names are accepted too.

The API credentials are regular Navidrome user credentials. TrackKeep generates
the Subsonic token/salt request parameters at request time; it does not need a
separate API key.

When Navidrome API credentials are configured, Spotify playlist views include a
Sync library action. Choose Navidrome as the target to create or update a
same-named Navidrome playlist using Spotify tracks that are already matched to
songs in the Navidrome API. Replace rebuilds the playlist from matched Spotify
tracks, append only adds new matches, and full sync removes stale Navidrome
playlist entries before adding the current matched Spotify order. Tracks that
are not backed up or not visible to Navidrome are skipped and reported in the UI,
so scan/index the folder before syncing a playlist.

### Plex Playlist Sync

Plex playlist sync uses the same backed-up Spotify track matching as Navidrome.
Open Settings, check `Sync playlists to Plex`, then enter the Plex server URL
and an `X-Plex-Token`. TrackKeep does not store a Plex username or password; it
stores the token in the TrackKeep config directory so it can call the Plex Media
Server API. After saving, TrackKeep lists Plex music libraries and selects the
first one unless you choose another.

On the playlist page, use the target dropdown to switch between Navidrome and
Plex. Replace, append, and full sync have the same meaning for both targets.
Tracks that are not backed up locally or cannot be found in Plex are skipped and
reported in the UI. Scan Plex's music library after adding or organizing files
before syncing playlists.

If Library Index fails, check the mounted folder first:

- `NAVIDROME_MUSIC_PATH` must be the host music folder, not the Navidrome
  appdata/config folder.
- Inside the TrackKeep container, `MUSIC_LIBRARY_PATH` should normally be
  `/music`.
- The container user must be able to read the music folder and write
  `/music/.spotifybu/library-index.json`.
- A bad or unreadable nested file should be skipped and reported in the UI; a
  top-level mount or permission problem still stops the scan.

Navidrome uses the Subsonic API:

- http://www.subsonic.org/pages/api.jsp

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
TRACKKEEP_APP_SECRET=change-this-to-a-long-random-value
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
  -e PUID=1000 \
  -e PGID=1000 \
  -e TRACKKEEP_APP_SECRET=change-this-to-a-long-random-value \
  -e TRACKKEEP_CHOWN_MUSIC=false \
  -e SPOTIFY_CLIENT_ID=your-spotify-client-id \
  -e MUSIC_LIBRARY_PATH=/music \
  -e NAVIDROME_USERNAME=your-navidrome-username \
  -e NAVIDROME_PASSWORD=your-navidrome-password \
  -v spotifybu_config:/config \
  -v /path/to/navidrome/music:/music \
  spotifybu:local
```

## Architecture

- `src/lib/app-auth.ts` owns internal/external app auth mode, local TrackKeep web login, session cookie signing, and persisted credential updates.
- `src/lib/database.ts` opens the local SQLite database under `TRACKKEEP_CONFIG_DIR`.
- `src/lib/backup-store.ts` persists deduplicated playlist metadata backup snapshots.
- `src/lib/spotify.ts` owns Spotify API calls and export shaping.
- `src/lib/music-library.ts` owns Navidrome music path checks, safe target directory creation, folder planning, library indexing, local matching, matched-file organization, album-folder logging, and Navidrome playlist replace, append, and full-sync modes.
- `src/lib/plex.ts` owns saved Plex settings, Plex status checks, music-library discovery, track resolution, and Plex playlist replace, append, and full-sync modes.
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
- `src/app/api/music-library/organize/route.ts` moves or renames matched local files into their planned Navidrome album paths in small batches.
- `src/app/api/plex/settings/route.ts` reads and saves Plex playlist sync settings.
- `src/app/api/spotify/playlists/[playlistId]/music-library/route.ts` replaces, appends, or full-syncs a matching Navidrome or Plex playlist from backed-up Spotify tracks.
- `src/lib/session.ts` and `src/lib/server-session.ts` own PKCE cookie and Spotify token-session handling.
- `.github/workflows/docker-image.yml` publishes GHCR images for `dev`, `main`, and `v*` tags. The `dev` branch publishes `dev`; `main` and version tags publish stable tags such as `latest`. The workflow runs `npm run check:yt-dlp` so image builds record the current yt-dlp release channel before publishing.

## Source Providers

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. TrackKeep keeps a similar provider-oriented shape, but the active automatic sourcing flow intentionally uses direct YouTube search first and JioSaavn second. YouTube Music, Piped, SoundCloud, and Bandcamp remain planned/future provider entries rather than active UI choices. The implemented download path searches provider candidates for a selected missing track, or dry-runs candidate selection for each missing track in a playlist-scale queue before starting a persisted background job with configured waits between tracks and longer pauses between chunks. If a download fails with a source-side provider error such as a YouTube 403, TrackKeep retries other reviewed or previewed candidates before marking the track as needing review.

Bulk playlist sourcing can trigger provider throttling, captchas, temporary blocks, account action, or service-term issues. TrackKeep shows those risks before starting large jobs and uses conservative rate limits, chunk pauses, background status polling, partial-failure reporting, dry-run previews, cancellation, retry controls, and provenance logs.

## Maintenance Checks

Run `npm run check:yt-dlp` during code-change passes that touch downloads, Docker, provider behavior, release packaging, or deployment docs. TrackKeep images intentionally install `yt-dlp[default]` with `--pre --upgrade` so fresh image builds pick up the newest available yt-dlp/EJS support; the check script makes that release-channel state visible before publishing.

See [docs/source-providers.md](docs/source-providers.md).

## Roadmap

- Add long-term backup history browsing and restore flows
- Add owned-file import workflows for music the user already has outside the Navidrome folder
- Add more provider adapters where the user's authorization model is clear
- Add richer bulk job history filtering and cleanup controls
