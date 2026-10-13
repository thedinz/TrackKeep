# TrackKeep 1.11.0

TrackKeep 1.11.0 adds a bulk job history. Past bulk backup jobs are now listed
in the app, where you can filter them, retry unfinished tracks, and delete the
jobs you no longer need.

## Added

- A **Bulk job history** section under Missing backup actions lists past bulk
  jobs for every playlist, newest first, with each job's status, track counts,
  and start and finish times.
- History filters for status (running or queued, complete, needs review,
  cancelled) and for playlist.
- Per-job actions: show the tracks that failed with their source links, retry
  the unfinished tracks, or delete a finished job.
- **Clear Finished** deletes every finished job that matches the current
  filters, optionally only jobs last updated more than 7, 30, or 90 days ago.
- New bulk jobs record the playlist they were started from. Jobs created
  before this release appear as "No playlist recorded".

## Changed

- Cleanup is manual only. TrackKeep never prunes bulk job history on its own.
- Running and queued jobs cannot be deleted; cancel a job and let it stop
  first.
- Deleting a job removes only its history entry. Downloaded files and the
  provenance log in the music folder are not touched.
- A bulk job that belongs to a different playlist than the one on screen no
  longer marks rows in the visible track table.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- The Windows release run reports 119 passing tests and 7 expected skips for
  multimedia tools and the Unix-style fake-executable harness. The Linux CI
  run passes.
- The history list, filters, paging, single delete, and Clear Finished
  endpoints were exercised over HTTP with seeded jobs, including the rejected
  requests for active jobs, unknown statuses, and unauthenticated callers.
- The configured yt-dlp release channel check passes.
