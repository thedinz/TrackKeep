# TrackKeep

**TrackKeep keeps a local copy of your Spotify music.** It reads your Spotify
playlists, checks which songs you already have as real audio files, finds the
ones you are missing, and saves them into your own music folder, neatly named
and tagged. Those files are then played through **Navidrome**, a self-hosted
music server that works like a private Spotify.

If Spotify removes a song, loses a licence, or you cancel your subscription, your
playlists and the music in them are still on your own drive.

Current stable release: `1.10.4` —
[download / release notes](https://github.com/thedinz/TrackKeep/releases/latest)

> **New here? Read this first.** TrackKeep is not a standalone music player. It
> is a helper that sits next to Navidrome and fills its music folder. You need
> three things working, in this order:
>
> 1. **Navidrome** installed and able to play music from a folder
> 2. A free **Spotify Developer app** (takes about five minutes)
> 3. **TrackKeep** running in Docker, pointed at the same music folder
>
> The [Installation Guide](#installation-guide) below walks through each one.

## Contents

- [How the pieces fit together](#how-the-pieces-fit-together)
- [Before you start](#before-you-start)
- [Installation Guide](#installation-guide)
  - [Step 1 — Install Navidrome](#step-1--install-navidrome)
  - [Step 2 — Create a Spotify Developer app](#step-2--create-a-spotify-developer-app)
  - [Step 3 — Install TrackKeep](#step-3--install-trackkeep)
  - [Step 4 — First run](#step-4--first-run)
- [Troubleshooting](#troubleshooting)
- [What TrackKeep does (and doesn't)](#what-trackkeep-does-and-doesnt)
- [Features](#features)
- [Reference](#reference) — every setting, reverse proxy, Plex, Homepage, Unraid, development

## How the pieces fit together

```text
 ┌───────────┐   playlists &    ┌───────────┐   writes audio   ┌──────────────┐
 │  Spotify  │ ───────────────▶ │ TrackKeep │ ───────────────▶ │ Music folder │
 │ (account) │   song details   │ (web app) │   files into     │ on your disk │
 └───────────┘                  └─────┬─────┘                  └──────┬───────┘
                                      │  asks Navidrome to rescan     │ reads
                                      │  and builds playlists         ▼
                                      └──────────────────────▶ ┌────────────────┐
                                                               │   Navidrome    │ ◀── phone / desktop
                                                               │ (music server) │     music apps
                                                               └────────────────┘
```

- **Spotify** is the checklist: it tells TrackKeep which songs belong in each
  playlist.
- **The music folder** is the actual backup. TrackKeep and Navidrome both use
  the *same* folder.
- **TrackKeep** compares the checklist to the folder, fills the gaps, and keeps
  file names tidy.
- **Navidrome** is what you actually listen through. It can also hold playlists
  that TrackKeep copies over from Spotify.

TrackKeep can optionally sync playlists to **Plex** as well, but the music folder
and the install steps are built around Navidrome.

## Before you start

You will need:

| What | Why | Notes |
| --- | --- | --- |
| A computer or server that stays on | Runs Navidrome and TrackKeep | A home server, NAS, Unraid box, or your own PC all work. |
| [Docker](https://docs.docker.com/get-docker/) | TrackKeep only ships as a Docker image | On Windows or macOS install **Docker Desktop**. On Linux install Docker Engine plus the Compose plugin. Unraid has Docker built in. |
| A Spotify account **with Premium** | Spotify requires Premium for the owner of a developer app | Up to five Spotify accounts can use one developer app. |
| A folder for your music | Where the backup lives | Can be empty to start. Example: `/srv/music`, `/mnt/user/music`, or `C:\Music`. |
| Basic comfort with a terminal | You will copy/paste a few commands | Every command is given in full below. |

**One decision to make up front — where will you open TrackKeep from?**
Spotify only allows logins to return to an `https://` address *or* to
`http://127.0.0.1`. That gives two setups:

- **Setup A — "same computer":** Docker runs on the computer you browse from
  (for example your Windows or Mac desktop). You open TrackKeep at
  `http://127.0.0.1:3000`. This is the easiest option and needs nothing extra.
- **Setup B — "home server":** Docker runs on another machine (a NAS, Unraid,
  a mini PC). You open TrackKeep from a different computer, so you need an
  `https://` address for it, such as a reverse proxy with a certificate or a
  [Tailscale Serve](https://tailscale.com/kb/1312/serve) URL. See
  [Reverse Proxy](#reverse-proxy). A plain LAN address like
  `http://192.168.1.50:3000` will load the page but **Spotify will refuse to
  log in through it.**

If you are unsure, start with Setup A to try everything out. You can move to a
server later.

## Installation Guide

### Step 1 — Install Navidrome

#### What is Navidrome?

[Navidrome](https://www.navidrome.org/) is a free, open-source music server. You
point it at a folder of audio files and it gives you a web player plus an
account you can log into from phone and desktop apps — your own personal
Spotify, playing music you own. It speaks the Subsonic API, so it works with
many apps, for example:

- **Android:** Symfonium, Tempo, Ultrasonic
- **iPhone / iPad:** Amperfy, play:Sub, Substreamer
- **Desktop / web:** Navidrome's built-in web player, Feishin

TrackKeep depends on Navidrome because it is where your backed-up music is
actually played, and TrackKeep uses Navidrome's API to trigger library rescans
and to create matching playlists.

#### Ways to install Navidrome

Pick whichever matches your machine. The official guide covers all of them in
detail: <https://www.navidrome.org/docs/installation/>

| Your setup | Recommended way |
| --- | --- |
| Any machine with Docker (Linux, Windows, macOS) | **Docker Compose** — see below. Easiest to run next to TrackKeep. |
| Unraid | **Apps** tab (Community Applications) → search **Navidrome** → Install. Set the music path to your music share. |
| Synology / QNAP / TrueNAS / other NAS | Use the NAS's Docker / Container Manager app with the Compose file below, or the NAS app catalogue if it lists Navidrome. |
| Windows without Docker | Windows installer (`.msi`) from the [Navidrome releases page](https://github.com/navidrome/navidrome/releases). |
| Linux without Docker | `.deb` / `.rpm` packages or the binary from the [releases page](https://github.com/navidrome/navidrome/releases); see the [Linux guide](https://www.navidrome.org/docs/installation/linux/). |
| Don't want to host it yourself | Hosted options such as [PikaPods](https://www.pikapods.com/) run Navidrome for you, **but** TrackKeep needs direct access to the same music folder, so hosted Navidrome is generally not a good fit. |

> TrackKeep itself only runs in Docker. If Navidrome is installed without
> Docker, that's fine — you just mount the same music folder into the
> TrackKeep container.

#### Recommended: Navidrome + TrackKeep in one Compose file

If you are starting from scratch with Docker, this is the simplest path: one
file that runs both apps against the same music folder. Complete
[Step 2](#step-2--create-a-spotify-developer-app) first so you have your Spotify
Client ID, or fill it in afterwards.

1. Make a folder for the stack, for example `~/trackkeep` (Linux/macOS) or
   `C:\trackkeep` (Windows), and create a file called `docker-compose.yml` in it:

   ```yaml
   services:
     navidrome:
       image: deluan/navidrome:latest
       container_name: navidrome
       user: "1000:1000"            # must match PUID/PGID below
       restart: unless-stopped
       ports:
         - "4533:4533"
       volumes:
         - ./navidrome-data:/data
         - /path/to/your/music:/music:ro   # <-- CHANGE THIS

     trackkeep:
       image: ghcr.io/thedinz/spotifybu:latest
       pull_policy: always
       container_name: trackkeep
       restart: unless-stopped
       depends_on:
         - navidrome
       ports:
         - "3000:3000"
       environment:
         PUID: "1000"
         PGID: "1000"
         MUSIC_LIBRARY_PATH: /music
         TRACKKEEP_CONFIG_DIR: /config
         NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000   # Setup B: your https:// address
         SPOTIFY_CLIENT_ID: paste-your-spotify-client-id
         TRACKKEEP_APP_SECRET: paste-a-long-random-value
         NAVIDROME_URL: http://navidrome:4533
         NAVIDROME_USERNAME: your-navidrome-username  # the admin you create in Navidrome
         NAVIDROME_PASSWORD: your-navidrome-password
       volumes:
         - ./trackkeep-config:/config
         - /path/to/your/music:/music     # <-- SAME folder as above
   ```

2. Replace `/path/to/your/music` in **both** places with your real music folder.
   - Linux example: `/srv/music:/music`
   - Windows example: `C:/Users/you/Music:/music` (use forward slashes)
   - macOS example: `/Users/you/Music/TrackKeep:/music`

3. In the same folder, create the two data folders so they are owned by you
   rather than by Docker:

   ```bash
   mkdir navidrome-data trackkeep-config
   ```

4. Start just Navidrome first so you can create its login:

   ```bash
   docker compose up -d navidrome
   ```

5. Open <http://127.0.0.1:4533> (or `http://SERVER-IP:4533`). The first visit
   asks you to **create an admin user**. Pick a username and password — these
   are what go into `NAVIDROME_USERNAME` / `NAVIDROME_PASSWORD`.

6. Continue with Step 2 and Step 3 to fill in the rest.

If you installed Navidrome another way (Unraid app, Windows installer, etc.),
just make sure you know three things before moving on:

- the **folder path** Navidrome reads music from,
- the **URL** Navidrome runs at (default port `4533`),
- a Navidrome **username and password**.

### Step 2 — Create a Spotify Developer app

TrackKeep reads your playlists through Spotify's official API, which needs a
(free) developer app registered to your account. You only do this once.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and log in with the Spotify account that has Premium.
2. Click **Create app**.
   - **App name / description:** anything, e.g. `TrackKeep`.
   - **Redirect URI:** this must exactly match where you open TrackKeep, plus
     `/api/auth/callback`:
     - Setup A (same computer): `http://127.0.0.1:3000/api/auth/callback`
     - Setup B (home server): `https://your-trackkeep-address/api/auth/callback`

     Use `127.0.0.1`, **not** `localhost` — Spotify treats them differently.
   - **Which API/SDKs:** tick **Web API**.
   - Accept the terms and **Save**.
3. Open the app's **Settings** and copy the **Client ID**. You will paste it
   into `SPOTIFY_CLIENT_ID`.
   You do **not** need the Client Secret — TrackKeep never asks for it.
4. Open **User Management** in the app and add the name and email of every
   Spotify account that will log in to TrackKeep, **including your own**. New
   apps are in Development Mode, which only allows accounts on this list (up to
   five).

Don't worry about getting the redirect URI perfect now — after TrackKeep starts,
its **Connect Spotify** screen shows the exact URI it expects, and you can paste
that into the dashboard.

### Step 3 — Install TrackKeep

TrackKeep is published as a Docker image. (It was originally called
*SpotifyBU*, so the image is still named `ghcr.io/thedinz/spotifybu` — that is
the right image.)

| Tag | Use it for |
| --- | --- |
| `ghcr.io/thedinz/spotifybu:latest` | Normal installs. Built from `main`. |
| `ghcr.io/thedinz/spotifybu:dev` | Testing upcoming changes. Built from `dev`, may be unstable. |
| `ghcr.io/thedinz/spotifybu:1.10.4` | Pinning an exact release. |

#### Option 1 — Docker Compose (recommended)

**If you used the combined Compose file in Step 1**, open it again and fill in:

- `SPOTIFY_CLIENT_ID` — from Step 2.
- `TRACKKEEP_APP_SECRET` — any long random string. This protects TrackKeep's
  own login cookies (it is *not* a Spotify value). Generate one with:

  ```bash
  openssl rand -hex 32
  ```

  or on Windows PowerShell:

  ```powershell
  -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  ```

- `NAVIDROME_USERNAME` / `NAVIDROME_PASSWORD` — the Navidrome login from Step 1.
- `NEXT_PUBLIC_APP_URL` — leave as `http://127.0.0.1:3000` for Setup A, or set
  your `https://` address for Setup B.

Then start everything:

```bash
docker compose up -d
```

**If Navidrome is already installed separately**, create a folder for TrackKeep
with this `docker-compose.yml`:

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

- `/path/to/navidrome/music` must be the folder Navidrome reads music from —
  **not** Navidrome's data/config folder.
- `NAVIDROME_URL` is Navidrome's address *as seen from inside the TrackKeep
  container*. `http://host.docker.internal:4533` means "port 4533 on this same
  machine". If Navidrome is on a different machine, use its IP, e.g.
  `http://192.168.1.20:4533`.
- `PUID` / `PGID` should match the user that owns your music files (and the
  user Navidrome runs as), otherwise TrackKeep may not be able to write or move
  files. On Linux, `id` shows your numbers; on Unraid it is usually `99` / `100`.

Start it:

```bash
docker compose up -d
```

Prefer an `.env` file instead of editing the Compose file? The repository
includes [docker-compose.yml](docker-compose.yml) and
[.env.docker.example](.env.docker.example): copy the example to `.env`, fill it
in, and run `docker compose up -d`. Note that the example defaults to the `dev`
image — change `TRACKKEEP_IMAGE` to `ghcr.io/thedinz/spotifybu:latest` for a
stable install.

#### Option 2 — Unraid

Add the container using the template in
[thedinz/unraid-templates](https://github.com/thedinz/unraid-templates/blob/main/templates/spotifybu.xml).
Fill in the same values as above, and point the music path at the same share
Navidrome uses. Set `PUID=99` and `PGID=100` (or whatever your Navidrome
container uses). Because you will browse to the server from another computer,
Unraid installs are **Setup B** and need an `https://` address — see
[Reverse Proxy](#reverse-proxy).

### Step 4 — First run

1. Open TrackKeep at the address you chose: `http://127.0.0.1:3000` (Setup A)
   or your `https://` address (Setup B). Always use this *same* address —
   switching between an IP, a hostname, and `127.0.0.1` breaks the Spotify
   login.
2. Sign in with the default login **`admin` / `admin`**, then open
   **Settings** and change the password straight away.
3. Click **Connect Spotify**. The screen shows the exact **Spotify redirect
   URI** TrackKeep expects. If Spotify reports a redirect error, copy that URI
   into your Spotify app's settings and try again.
4. Approve access on Spotify's page. You are sent back to TrackKeep and your
   playlists appear in the left rail.
5. Pick a playlist, then click **Run Index** so TrackKeep scans your music
   folder. Songs you already have are marked backed up; the rest show as
   missing.
6. *(Recommended)* Run **Organize** to rename and move matched files into the
   clean `Artist/Artist - Album (Year)/…` layout. This also uncovers songs
   hiding under messy file names so they are not downloaded twice.
7. Back up missing songs — one at a time (you review the source match before
   downloading) or the whole playlist as a background job with a preview first.
8. Use the right sidebar to quick-scan Navidrome, then choose **Sync library**
   to create the same playlist in Navidrome. Turn on **Auto Sync** if you want
   future backups added to it automatically.

The in-app **Help** page repeats this workflow and explains each button.

## Troubleshooting

| Problem | Likely cause and fix |
| --- | --- |
| Spotify says **`INVALID_CLIENT: Invalid redirect URI`** or **`redirect_uri: Not matching configuration`** | The redirect URI in the Spotify dashboard doesn't *exactly* match TrackKeep's. Copy the one shown on TrackKeep's **Connect Spotify** screen. `http` vs `https`, `127.0.0.1` vs `localhost` vs an IP, the port, and a trailing `/` all count as different. |
| Spotify login works on the server but not from my laptop / phone | You are on Setup B using a plain `http://192.168…` address. Spotify requires `https://` for anything except `127.0.0.1`. Set up a reverse proxy or Tailscale Serve and set `NEXT_PUBLIC_APP_URL` to that address. See [Reverse Proxy](#reverse-proxy). |
| Spotify says the user **is not registered** / **403** right after logging in | Add that Spotify account under **User Management** in your Spotify developer app. |
| A followed playlist shows but its tracks fail to load (**403**) | Spotify blocks track lists for playlists you don't own or collaborate on. Use the **Track list** source and paste the song links instead — see [Followed Playlists And Track Lists](#followed-playlists-and-track-lists). |
| `docker compose up` stops with **Set TRACKKEEP_APP_SECRET in .env** | You are using the repository's `.env`-based Compose file and left `TRACKKEEP_APP_SECRET` empty. Generate one (see Step 3). |
| **Run Index** fails or finds zero songs | The music mount is wrong. The left side of `/path:/music` must be the host folder that holds your audio files, and it must be the same folder Navidrome uses. |
| Organize reports files that **could not be moved** | Permission mismatch. Set `PUID`/`PGID` to the owner of your music files (same as Navidrome). See [Unraid Shared Library Permissions](#unraid-shared-library-permissions). |
| New songs don't appear in Navidrome | Set `NAVIDROME_USERNAME` and `NAVIDROME_PASSWORD` so TrackKeep can trigger scans, and check `NAVIDROME_URL` is reachable *from the container* (`http://navidrome:4533` in the combined Compose file, `http://host.docker.internal:4533` for Navidrome on the same host). |
| Playlist sync skips tracks | Only songs that are backed up *and* already scanned by Navidrome can be added. Quick-scan Navidrome, wait for it to finish, then sync again. |
| Can't log in to TrackKeep over HTTP after enabling HTTPS settings | `TRACKKEEP_SECURE_COOKIES=true` only works over `https://`. Keep it `false` for plain-HTTP access. |

Diagnostics are written to `/config/logs/spotifybu.log` inside the container
(`docker logs trackkeep` also helps). If you are still stuck, open an
[issue](https://github.com/thedinz/TrackKeep/issues) with what you tried.

## What TrackKeep does (and doesn't)

TrackKeep does not replace Navidrome search. Navidrome already knows what files
exist locally. TrackKeep uses Spotify as the source-of-truth list, uses local
library matching only to avoid duplicates, and focuses on the tracks that would
disappear if Spotify went away.

For missing songs it can use files already in the music folder, or search
YouTube first and then JioSaavn. Single-track backup lets you review source
candidates before downloading. Bulk playlist backup starts with a dry-run
preview, then runs as a resumable background job with cancel and retry
controls. Provider downloads show authorization and bulk-risk warnings,
preserve provenance, and are only written into the configured music folder.
Only download music you are authorized to keep.

The Docker image name and `.spotifybu` data paths keep their original
identifiers so upgrades keep using the same image and persisted data. New
configuration uses `TRACKKEEP_*` environment variables; matching `SPOTIFYBU_*`
names remain supported as legacy fallbacks.

## Features

- Spotify OAuth using Authorization Code with PKCE
- Local TrackKeep login with default `admin/admin` credentials
- Settings page for switching between internal login and external reverse-proxy auth
- Settings page for changing the TrackKeep app username and password
- Settings page with the canonical TrackKeep organize scheme
- Playlist listing with private and collaborative playlist scopes
- Playlist rail badges for fully backed-up playlists and changed playlists with unbacked-up track counts
- API-key-protected Homepage custom API widget statistics
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
- Docker image with Node.js, `ffmpeg`, prerelease/nightly-channel `yt-dlp[default]`, Python 3, Mutagen (for preserving Opus artwork during organization), and `pip`
- GitHub Container Registry image publishing for `dev`, `latest`, and version tags

## Reference

Detailed documentation for every setting and feature. You don't need any of
this for a basic install.

### Docker Environment

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
| `TRACKKEEP_APP_SECRET` | Yes | Long random value used to sign TrackKeep's own login sessions. This is not your Spotify app Client Secret. If it is blank or left as the documented placeholder, TrackKeep generates a random secret in `<TRACKKEEP_CONFIG_DIR>/app-secret` instead of signing sessions with a public value. |
| `TRACKKEEP_DATABASE_PATH` | No | Optional SQLite path. Defaults to `<TRACKKEEP_CONFIG_DIR>/spotifybu.sqlite`. |
| `TRACKKEEP_HOMEPAGE_API_KEY` | No | Enables the read-only Homepage stats endpoint when set. Use a separate long random value; do not reuse `TRACKKEEP_APP_SECRET`. |
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

#### Homepage Widget

TrackKeep exposes an optional read-only endpoint for a
[Homepage Custom API widget](https://gethomepage.dev/widgets/services/customapi/).
The TrackKeep logo is already hosted in this repository and can be used directly
by Homepage:

```text
https://raw.githubusercontent.com/thedinz/TrackKeep/main/assets/trackkeep.png
```

To add the widget:

1. Generate a separate random key. Do not reuse `TRACKKEEP_APP_SECRET`:

   ```sh
   openssl rand -hex 32
   ```

2. Configure the generated value for your installation type:

   - **Docker Compose:** put it in TrackKeep's `.env`, then recreate or restart
     the TrackKeep container so it receives the new environment variable:

     ```text
     TRACKKEEP_HOMEPAGE_API_KEY=PASTE_THE_GENERATED_KEY_HERE
     ```

   - **Unraid:** edit the TrackKeep container, find the optional
     `Homepage API Key` field, and paste the generated value there. That field
     sets the container variable `TRACKKEEP_HOMEPAGE_API_KEY`. Click **Apply**
     to recreate the container with the new variable.

     If an older Unraid template does not show `Homepage API Key`, add a new
     Variable with these values, then apply the container changes:

     ```text
     Name: Homepage API Key
     Key: TRACKKEEP_HOMEPAGE_API_KEY
     Value: PASTE_THE_GENERATED_KEY_HERE
     Mask: Yes
     ```

3. Open TrackKeep once after connecting Spotify so TrackKeep can save the current
   playlist catalog.

4. Paste the following block into Homepage's `services.yaml`. Replace both
   occurrences of `http://TRACKKEEP-IP:3000` with the same TrackKeep URL and
   port, and replace `PASTE_THE_SAME_KEY_HERE` with the key from step 1:

   ```yaml
   - Media:
       - TrackKeep:
           icon: https://raw.githubusercontent.com/thedinz/TrackKeep/main/assets/trackkeep.png
           href: http://TRACKKEEP-IP:3000
           description: Spotify playlist backups
           widget:
             type: customapi
             url: http://TRACKKEEP-IP:3000/api/homepage/stats
             refreshInterval: 60000
             headers:
               X-API-Key: PASTE_THE_SAME_KEY_HERE
             mappings:
               - field: fullyBackedUp
                 label: Backed up
                 format: number
               - field: needsBackup
                 label: Needs backup
                 format: number
               - field: totalPlaylists
                 label: Total
                 format: number
   ```

For example, if TrackKeep opens at `http://192.168.1.50:3000`, replace
`http://TRACKKEEP-IP:3000` with `http://192.168.1.50:3000` in both places. Use
an address that is reachable from both your browser and the Homepage container.
If the widget reports an API error, confirm that Homepage can reach this URL and
that its `X-API-Key` exactly matches `TRACKKEEP_HOMEPAGE_API_KEY`.

`Backed up` counts playlists whose latest saved TrackKeep snapshot has every
track in the current music-library index and still matches Spotify's current
playlist revision. TrackKeep checks revisions when the playlist view loads,
every minute while it stays open, and when the browser regains focus; changed
playlists are refreshed without requiring them to be opened individually.
`Needs backup` includes playlists with missing tracks and playlists that have
not been loaded into TrackKeep yet.
`Total` is the most recent Spotify playlist count saved when TrackKeep loaded
the playlist list. The endpoint also returns `updatedAt` if you want to add a
fourth mapping later.

#### Unraid Shared Library Permissions

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

### Reverse Proxy

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

### Spotify Development Mode

Spotify Development Mode requires the app owner to have Spotify Premium and
limits each app to five authorized users. Add every Spotify account that will
connect to TrackKeep in the app's **User Management** settings. New
Development Mode apps also receive Spotify's reduced 2026 endpoint and response
set. TrackKeep uses the replacement playlist item endpoints, fetches removed
batch metadata endpoints one item at a time, paginates search in groups of 10,
and honors Spotify's `Retry-After` response when a request is rate limited.

TrackKeep uses Authorization Code with PKCE, which exchanges the login code with
`client_id` and `code_verifier` instead of `client_secret`, so the Spotify
Client Secret is never needed.

Spotify's official docs: [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow),
[redirect URI requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).

#### Followed Playlists And Track Lists

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

### Navidrome Music Folder Details

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
matched backups from saved playlist snapshots. TrackKeep also records downloaded
and organized files in `/music/.spotifybu/managed-tracks.json`, allowing that
maintenance action to restore tags even when a file did not come from a saved
playlist snapshot. Existing provider-download history remains supported.

Navidrome still needs read access to the same host folder and a scan/watch configuration that sees new files.

#### Organize Matched Files

After a library scan, the Organize action compares matched local files against the same naming scheme used for new TrackKeep downloads. It moves or renames loose files, older TrackKeep folder layouts, and other matched tracks that are not exactly in the expected structure. The rendered Spotify-derived target path is canonical, so a different year, folder name, or filename is treated as organization work instead of being accepted as close enough.

Before moving a matched file, Organize writes the same dual TrackKeep and legacy
SpotifyBU identity tags used by provider downloads. If tagging fails, TrackKeep
leaves the file at its original path and reports the failure instead of moving an
untagged file that NaviClean could process again.

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
so scan/index the folder before syncing a playlist. Spotify-unavailable tracks
remain in the synced playlist when their local files can still be matched; an
unmatched unavailable row is omitted by Replace or Full Sync.

#### Plex Playlist Sync

Plex playlist sync uses the same backed-up Spotify track matching as Navidrome.
Open Settings, check `Sync playlists to Plex`, then enter the Plex server URL
and an `X-Plex-Token`. TrackKeep does not store a Plex username or password; it
stores the token in the TrackKeep config directory so it can call the Plex Media
Server API. After saving, TrackKeep lists Plex music libraries and selects the
first one unless you choose another.

On the playlist page, use the target dropdown to switch between Navidrome and
Plex. Replace, append, and full sync have the same meaning for both targets.
Auto Sync is saved separately for each Spotify playlist and target. When it is
checked, TrackKeep requests the target server scan it needs and appends each
newly completed single or bulk backup as soon as the server can resolve it. You
can enable Auto Sync for Navidrome, Plex, or both; automatic updates never remove
playlist entries.
Tracks that are not backed up locally or cannot be found in Plex are skipped and
reported in the UI. Spotify-unavailable tracks follow the same local-file rule
as Navidrome. Scan Plex's music library after adding or organizing files before
syncing playlists.

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

### Local Development

For local non-Docker development:

Install `ffmpeg`/`ffprobe` and Python 3 on your PATH. Opus organization and
metadata backfill also require `python3 -m pip install 'mutagen>=1.47,<2'`
(use `python` on Windows). Docker includes these dependencies.

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

### Building The Image Locally

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

### Architecture

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
- `.github/workflows/ci.yml` runs `npm run typecheck` and `npm test` (with ffmpeg and mutagen installed) on pull requests. The Docker workflow calls it first, so an image is only published after the checks pass.

### Source Providers

spotDL is a useful comparison point: it resolves Spotify metadata to audio candidates from providers such as YouTube Music and then downloads through `yt-dlp`. TrackKeep keeps a similar provider-oriented shape, but the active automatic sourcing flow intentionally uses direct YouTube search first and JioSaavn second. YouTube Music, Piped, SoundCloud, and Bandcamp remain planned/future provider entries rather than active UI choices. The implemented download path searches provider candidates for a selected missing track, or dry-runs candidate selection for each missing track in a playlist-scale queue before starting a persisted background job with configured waits between tracks and longer pauses between chunks. If a download fails with a source-side provider error such as a YouTube 403, TrackKeep retries other reviewed or previewed candidates before marking the track as needing review.

Bulk playlist sourcing can trigger provider throttling, captchas, temporary blocks, account action, or service-term issues. TrackKeep shows those risks before starting large jobs and uses conservative rate limits, chunk pauses, background status polling, partial-failure reporting, dry-run previews, cancellation, retry controls, and provenance logs.

### Maintenance Checks

Run `npm run check:yt-dlp` during code-change passes that touch downloads, Docker, provider behavior, release packaging, or deployment docs. TrackKeep images intentionally install `yt-dlp[default]` with `--pre --upgrade` so fresh image builds pick up the newest available yt-dlp/EJS support; the check script makes that release-channel state visible before publishing.

See [docs/source-providers.md](docs/source-providers.md).

### Roadmap

- Add long-term backup history browsing and restore flows
- Add owned-file import workflows for music the user already has outside the Navidrome folder
- Add more provider adapters where the user's authorization model is clear
- Add richer bulk job history filtering and cleanup controls
