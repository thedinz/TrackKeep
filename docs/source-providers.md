# Source Provider Notes

SpotifyBU's source-provider layer exists to build a local backup of a Spotify
library for Navidrome. Local Navidrome-folder matching is a dedupe and coverage check, not the main value:
it answers "is this Spotify track already backed up locally?" so the app can
focus sourcing work on missing tracks.

SpotifyBU's source layer should follow the same broad shape as spotDL while keeping provider behavior explicit and auditable:

1. Read Spotify playlist metadata.
2. Match against the mounted Navidrome music folder to skip tracks already backed up.
3. Build a source query for missing tracks from artist, title, album, duration, and ISRC when available.
4. Ask one or more source providers for candidates.
5. Score candidates by title, artist, duration, album, explicit flag, ISRC, and provider confidence.
6. Download only from sources the user is authorized to use.
7. Write the final audio file into `MUSIC_LIBRARY_PATH` inside the container.
8. Record the album folder mapping in `.spotifybu/album-folders.json`.
9. Tag the file and let Navidrome scan it.

## Spotify Playlist Access

SpotifyBU uses Spotify's official playlist item API for direct playlist backup.
Spotify may return `403 Forbidden` for followed playlist items when the connected
Spotify user does not own or collaborate on that playlist. In that case,
SpotifyBU can show playlist metadata but cannot receive the ordered track list
from Spotify's playlist endpoint.

The supported fallback is the `Track list` source type. Users can paste Spotify
song URLs, URIs, or IDs from a playlist export or copied track list. SpotifyBU
then resolves those songs through Spotify's track metadata endpoint and feeds the
result into the same Navidrome matching, provider search, and backup workflow.
This avoids scraping Spotify pages or pretending the playlist permission limit
does not exist.

## spotDL Reference

spotDL is useful as a product and architecture reference because it separates Spotify metadata from audio sourcing. Its published package description says it finds Spotify playlist songs on YouTube and downloads them with album art, lyrics, and metadata.

The spotDL docs expose this provider shape:

- `AudioProvider` is the base provider class and owns common `yt-dlp` handling.
- YouTube and YouTube Music providers return URL candidates.
- The CLI supports provider choices including `youtube`, `youtube-music`, `soundcloud`, `bandcamp`, `slider-kz`, and `piped`.
- YouTube Music Premium users can optionally pass cookies for higher bitrate access.

Useful references:

- https://pypi.org/project/spotdl/
- https://spotdl.github.io/spotify-downloader/usage/
- https://spotdl.github.io/spotify-downloader/reference/providers/audio/base/
- https://spotdl.readthedocs.io/en/latest/reference/providers/audio/index.html

## SpotifyBU Provider Rules

- Providers must declare whether they can search, download, tag, and report provenance.
- Providers must declare their authorization model before any download action is enabled.
- Providers must stage files only through the Navidrome target helper, never by accepting arbitrary output paths.
- Download workers must record successful writes with `recordMusicLibraryAlbumFolders` so later tracks from the same album use the same active artist/album folder.
- Providers should preserve provenance in a sidecar or database record: source name, source URL, candidate score, selected reason, and user confirmation.
- Provider downloads should run as background jobs with retry, cancellation, and a dry-run preview.
- External providers must show a rights confirmation and a bulk-download warning before the first download job.
- Bulk jobs should use conservative rate limits and should make cancellation available at track and playlist scope.
- The current implemented external download path searches YouTube first, then JioSaavn, for one selected Spotify track or for every missing track in a playlist-scale queue. The user still reviews the candidate and confirms download rights before a single-track download starts. If a provider source fails with a source-side error such as a YouTube 403, SpotifyBU can retry alternate reviewed or previewed candidates before marking the track as failed.
- Downloads use Ogg Opus at 192 kbps by default, configurable to 160/192/256 kbps in Settings, with optional MP3 192/256/320 kbps fallback for Opus format/conversion failures and MP3 kept as an explicit legacy compatibility format.
- Opus downloads must write Navidrome-facing Vorbis comments for descriptive, release, compilation, ISRC, and SpotifyBU identity metadata, plus embedded artwork through `METADATA_BLOCK_PICTURE`.
- Existing MP3 and older SpotifyBU M4A backups remain supported for scanning, matching, and migration deletion, but SpotifyBU should not transcode old lossy files as a quality upgrade. Redownload from an authorized source to improve lossy output quality.
- Bulk queues run sequentially with configurable wait between tracks, chunk size, and chunk pause to reduce provider blocking risk. Defaults are intentionally conservative and can still be overridden by request settings.
- Provider work stages temporary files under `.spotifybu/tmp/provider-downloads` inside the mounted Navidrome music folder, then moves completed files into final album folders.
- If a download, conversion, or move fails, stale staging files are cleaned after 10 minutes of provider-download idleness so unfinished media does not accumulate in the container filesystem.
- YouTube Music is not active in the automatic flow because it is closed for reliable unauthenticated search.
- Piped is not active in the automatic flow because it requires a public instance endpoint and mostly mirrors YouTube results.
- SoundCloud and Bandcamp remain planned provider entries rather than active UI choices.

## Provider Catalog

The provider catalog lives in `src/lib/providers/types.ts` and is exposed by `/api/providers`.

| Provider | Status | Authorization model | Notes |
| --- | --- | --- | --- |
| Navidrome library | Active | Local files | Matches Spotify metadata against existing mounted audio files. |
| YouTube | User-confirmed | External tool | First active automatic search provider. Downloads reviewed single-video candidates through `yt-dlp`. |
| JioSaavn | User-confirmed | External tool | Second active automatic search provider and fallback candidate source. Downloads reviewed song candidates through `yt-dlp`. |
| YouTube Music | Planned | External tool | Future candidate only if a reliable user-controlled provider path is added. |
| Piped | Planned | External tool | Future alternative YouTube frontend path if a reliable instance is configured. |
| SoundCloud | Planned | External tool | Future candidate matching and authorized staging. |
| Bandcamp | Planned | External tool | Should be limited to purchases, free downloads, or explicit permission. |

## Bulk Download Risks

SpotifyBU explains that large playlist jobs can trigger throttling, captchas, temporary service blocks, provider account action, regional failures, or service-term issues. The app does not treat this warning as a substitute for authorization; it is a preflight confirmation alongside provider configuration, dry-run candidate review, rate limits, retry controls, cancellation, and provenance logging.

The current routes intentionally block provider playlists with `--no-playlist` and UI copy. Playlist-scale backups are represented as missing Spotify tracks, previewed one item at a time with automatic provider search, and then processed by a persisted background job with conservative throttling, cancellation, retry, fallback candidates, and partial-failure reporting. The app checks YouTube first, then JioSaavn, and skips tracks where no candidate can be found.

## yt-dlp Maintenance

SpotifyBU Docker images install `yt-dlp[default]` with prerelease updates enabled so the matching EJS challenge scripts stay current with yt-dlp. When provider or Docker behavior changes, run `npm run check:yt-dlp` and include any needed yt-dlp update or image rebuild work in the same change.

## First Provider Candidates

1. Local/Navidrome matcher
   - Match existing files by ISRC, MusicBrainz IDs, title, artist, album, and duration.
   - No download risk and immediately useful for deduplication.

2. Purchased or user-owned folder importer
   - Ingest from another folder the user owns.
   - Copy or hardlink into the Navidrome folder structure.

3. External tool adapter
   - Wrap a tool such as spotDL or `yt-dlp` only when the user has confirmed they have rights to download the selected media.
   - Start with YouTube and JioSaavn as explicit provider targets.
   - Search YouTube first, then JioSaavn, and keep provider ranking/provenance visible to the user.
   - Keep command arguments generated by SpotifyBU and constrain output to the Navidrome staging path.

4. Licensed/royalty-free catalog provider
   - Search and download from catalogs whose terms explicitly permit downloading.
