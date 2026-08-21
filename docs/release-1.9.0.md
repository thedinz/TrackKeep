# TrackKeep 1.9.0

TrackKeep 1.9.0 makes the dashboard easier to scan and adds a confidence
boundary for safer automatic bulk downloads.

## Added

- Bulk provider downloads now require a match confidence of at least 68%.
- Below-threshold bulk candidates remain visible as manual-review results
  instead of being queued automatically.
- Bulk eligibility is enforced when a queue is created, when fallbacks are
  selected, and when a persisted job resumes.

## Changed

- Navidrome scan counts and timestamps now use separate rows so the status card
  uses its available space and reads more clearly.
- Single-track downloads remain fully user-directed: any selected result can be
  downloaded regardless of its confidence score.
- Bulk preview summaries now distinguish ready, review, and no-match results.

## Verified

- TypeScript check passes with `tsc --noEmit`.
- Production build passes with `next build`.
- All 99 unit tests pass with `npm test`.
- The configured yt-dlp release channel check passes.
