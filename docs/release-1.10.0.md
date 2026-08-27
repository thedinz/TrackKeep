# TrackKeep 1.10.0

TrackKeep 1.10.0 makes backup status more trustworthy, adds a read-only
Homepage widget, and puts the practical operating guide directly inside the
app.

## Added

- A polished **How it works** guide explains the recommended backup workflow,
  unavailable tracks, TrackKeep reindexing, Navidrome quick and full scans,
  Opus quality caps, organization, matching, playlist sync, and common fixes.
- An API-key-protected Homepage Custom API endpoint reports fully backed-up,
  needs-backup, and total playlist counts from TrackKeep's saved catalog and
  current library index.
- Spotify playlist rows that are removed, restricted, or unavailable in the
  connected account's market remain visible in a dedicated unavailable section
  instead of silently disappearing.
- Unavailable-track reasons cover market, subscription, explicit-content, and
  general Spotify availability restrictions when Spotify exposes them.

## Changed

- Playlist backup totals exclude unavailable rows from missing-track,
  organization, provider download, and playlist-sync work while continuing to
  display and monitor them separately.
- A playlist can be fully backed up when all currently available tracks are
  present; unavailable rows no longer create a permanent false failure.
- Persisted playlist backup status is shared by the dashboard and Homepage
  widget so both surfaces use the same matching rules.
- The dashboard header now links to Help beside Settings, and the Settings page
  links to the same guide.
- Spotify playlist reads request availability information so TrackKeep can
  distinguish inaccessible rows from ordinary tracks more reliably.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build` on the supported Node 22 runtime.
- All 109 unit tests pass on the supported Node 22 runtime.
- The configured yt-dlp release channel check passes.
- The help guide was checked at desktop and mobile widths with no browser
  errors or horizontal overflow.
