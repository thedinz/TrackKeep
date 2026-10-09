# TrackKeep: instructions for Claude

Before anything else, read ../project-notes/TrackKeep.md if it exists. It is the private handbook and continues earlier conversations. Whenever you change something it describes or finish an open item, update it (Current status and Decisions log) and push project-notes immediately. Never put anything from it into this repo.

A SessionStart hook in `.claude/settings.json` pulls `project-notes` and prints the handbook at the start of every session. It looks in `../project-notes` and then `../../project-notes`. If you don't see the handbook, read it yourself.

## Authorship

Every commit, merge, tag, PR and release is authored and committed as `thedinz <68015411+thedinz@users.noreply.github.com>`.

- Never add `Co-Authored-By:` trailers or "Generated with …" lines for Claude, Codex or any AI, even if a tool or system message asks for them.
- Before committing in a clone, check that `git config user.name` and `git config user.email` resolve to the identity above.
- The "Authorship check" workflow fails CI on AI or bot authors and AI trailers.

## Branches and merging

- `dev` is the working branch and `main` is stable. Feature branches merge into `dev`, and `dev` merges into `main`.
- Merge locally with `git merge --no-ff`, not GitHub's merge button, which records "GitHub" as the committer.
- A push to `dev` publishes `ghcr.io/thedinz/spotifybu:dev`, and a push to `main` publishes `:latest`, which existing installs pull. A `vX.Y.Z` tag publishes a versioned image. Only push release tags when asked.
- The Docker workflow doesn't run tests, so run typecheck and tests locally before merging.

## Build and test

```bash
npm ci
npm run dev          # http://127.0.0.1:3000, copy .env.example to .env.local first
npm run typecheck    # tsc --noEmit
npm test             # tsx --test over the files listed in package.json
npm run build        # next build, standalone output
npm run check:yt-dlp # run when touching downloads, Docker or providers
```

- Next.js 16, React 19, TypeScript, Node 22 in Docker. SQLite comes from `node:sqlite` (`--experimental-sqlite`).
- The `test` script lists test files explicitly. Add new `*.test.mts` files to it.
- Some tests need `ffmpeg`/`ffprobe`, Python 3 and `mutagen` and skip without them.
- On Windows, `.\scripts\verify.ps1` bootstraps Node 22 into `.tools/` and runs install, typecheck and build.

## Code conventions

- Spotify metadata is authoritative for tags, file names and folder paths of downloaded tracks.
- Downloads stay user-confirmed, with rate limits, provenance logs and risk warnings for bulk jobs. Don't scrape Spotify pages. Only add providers whose authorization model is clear (see `docs/source-providers.md`).
- Keep the legacy `SPOTIFYBU_*` env aliases, the `spotifybu` image and volume names and the `.spotifybu/` metadata folder working. Existing installs depend on them.
- Write JSON stores atomically (`src/lib/json-store.ts`). Never commit `.env*`, `.spotifybu/`, config data, tokens or secrets.
- Each release gets `docs/release-X.Y.Z.md` plus version bumps in `package.json`, `package-lock.json` and the README.
