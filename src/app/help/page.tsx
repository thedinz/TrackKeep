import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  CircleHelp,
  Download,
  FileSearch,
  FolderSync,
  HardDrive,
  ListChecks,
  ListMusic,
  RefreshCw,
  Server,
  Settings,
  Tags
} from "lucide-react";

export const metadata: Metadata = {
  title: "How TrackKeep Works",
  description:
    "A practical guide to TrackKeep scans, unavailable tracks, downloads, organization, and playlist sync."
};

const scanChoices = [
  {
    accent: "green",
    icon: HardDrive,
    name: "Run Index",
    purpose: "Teach TrackKeep what is actually in the mounted music folder.",
    detail:
      "This is TrackKeep's reindex scan. It reads the audio files and their tags, rebuilds its own matching index, and then requests a normal Navidrome scan when API credentials are available.",
    useWhen:
      "Use after adding, moving, retagging, or deleting files outside TrackKeep—or whenever an existing file is shown as missing."
  },
  {
    accent: "teal",
    icon: RefreshCw,
    name: "Quick",
    purpose: "Ask Navidrome to run its normal incremental scan.",
    detail:
      "This refreshes Navidrome, not TrackKeep's file index. It is the everyday choice after TrackKeep downloads or organizes files.",
    useWhen:
      "Use when a new or changed file is already known to TrackKeep but has not appeared correctly in Navidrome yet."
  },
  {
    accent: "amber",
    icon: Server,
    name: "Full",
    purpose: "Ask Navidrome to inspect the whole music library again.",
    detail:
      "A full scan is more thorough and can take much longer on a large library. It still does not rebuild TrackKeep's own index.",
    useWhen:
      "Use when Quick did not fix stale Navidrome results, after broad external changes, or when you suspect Navidrome missed something."
  }
];

const quickAnswers = [
  ["#scans", "Which scan do I run?"],
  ["#unavailable", "Why is a track unavailable?"],
  ["#audio", "What quality gets downloaded?"],
  ["#workflow", "What order should I use?"],
  ["#matching", "How does matching work?"],
  ["#sync", "How does playlist sync work?"],
  ["#faq", "Fix a common problem"]
] as const;

export default function HelpPage() {
  return (
    <main className="app-shell help-shell">
      <header className="topbar">
        <a className="brand" href="/" title="TrackKeep dashboard">
          <div className="brand-mark" aria-hidden="true">
            <img alt="" src="/icon.svg" />
          </div>
          <div>
            <p className="eyebrow">TrackKeep</p>
            <h1>How it works</h1>
          </div>
        </a>

        <div className="topbar-actions">
          <a className="icon-command" href="/settings" title="Settings">
            <Settings size={18} />
            Settings
          </a>
          <a className="icon-command" href="/" title="Back to dashboard">
            <ArrowLeft size={18} />
            Dashboard
          </a>
        </div>
      </header>

      <article className="help-content">
        <section className="panel help-hero">
          <div className="help-hero-copy">
            <span className="help-kicker">
              <CircleHelp size={16} />
              The useful details, in plain English
            </span>
            <h2>Know what TrackKeep is doing—and which button to press next.</h2>
            <p>
              TrackKeep connects a Spotify list to audio you control. It saves the
              list, finds matching files in your music folder, helps fill the gaps,
              and gets those files ready for Navidrome. This guide covers the small
              but important details that are easy to learn only after trial and error.
            </p>
          </div>
          <div className="help-hero-mark" aria-hidden="true">
            <span><ListChecks size={31} /></span>
            <i />
            <span><HardDrive size={31} /></span>
            <i />
            <span><Server size={31} /></span>
          </div>
        </section>

        <nav aria-label="Help topics" className="help-topic-nav">
          {quickAnswers.map(([href, label]) => (
            <a href={href} key={href}>{label}</a>
          ))}
        </nav>

        <section className="help-section" id="workflow">
          <div className="help-section-heading">
            <span className="help-section-icon green"><ListChecks size={21} /></span>
            <div>
              <p className="eyebrow">The reliable workflow</p>
              <h2>Spotify is the checklist; your folder is the backup.</h2>
            </div>
          </div>

          <div className="help-steps">
            <div className="help-step">
              <span>01</span>
              <h3>Load a source</h3>
              <p>
                Choose a playlist, album, song, or pasted track list. For playlists,
                TrackKeep saves a metadata snapshot so it can remember what belonged
                there even if Spotify changes later.
              </p>
            </div>
            <div className="help-step">
              <span>02</span>
              <h3>Run Index</h3>
              <p>
                Let TrackKeep inspect the mounted music folder. Existing matches are
                marked backed up; genuine gaps remain missing.
              </p>
            </div>
            <div className="help-step">
              <span>03</span>
              <h3>Organize, then fill gaps</h3>
              <p>
                Organizing first can reveal files hiding under messy names and avoids
                duplicates. Review provider matches before downloading anything you
                are authorized to keep.
              </p>
            </div>
            <div className="help-step">
              <span>04</span>
              <h3>Refresh and sync</h3>
              <p>
                Quick-scan Navidrome after file changes, then sync the playlist. Only
                tracks that exist locally and are visible to the chosen server can be
                added.
              </p>
            </div>
          </div>

          <div className="help-callout tip">
            <CheckCircle2 size={20} />
            <p>
              <strong>A good default:</strong> Run Index → Organize → back up missing
              tracks → Quick scan → sync the playlist. You do not need a Full scan
              every time.
            </p>
          </div>
        </section>

        <section className="help-section" id="scans">
          <div className="help-section-heading">
            <span className="help-section-icon teal"><FolderSync size={21} /></span>
            <div>
              <p className="eyebrow">The three scan buttons</p>
              <h2>They scan two different views of the same folder.</h2>
            </div>
          </div>
          <p className="help-intro">
            TrackKeep and Navidrome keep separate catalogs. A Navidrome scan cannot
            update TrackKeep's match results, and Run Index is the button that
            refreshes TrackKeep.
          </p>

          <div className="scan-choice-grid">
            {scanChoices.map(({ accent, detail, icon: Icon, name, purpose, useWhen }) => (
              <article className="scan-choice" key={name}>
                <div className="scan-choice-title">
                  <span className={`help-section-icon ${accent}`}><Icon size={20} /></span>
                  <h3>{name}</h3>
                </div>
                <strong>{purpose}</strong>
                <p>{detail}</p>
                <div><span>Best used when</span>{useWhen}</div>
              </article>
            ))}
          </div>

          <div className="help-decision-list">
            <div><span>I copied files into the folder myself</span><strong>Run Index</strong></div>
            <div><span>TrackKeep downloaded or organized a file</span><strong>Quick</strong></div>
            <div><span>A file exists but TrackKeep says “missing”</span><strong>Run Index</strong></div>
            <div><span>Navidrome is still stale after Quick</span><strong>Full</strong></div>
          </div>

          <div className="help-callout">
            <RefreshCw size={20} />
            <p>
              <strong>Automatic scan:</strong> the daily setting runs TrackKeep's
              library index and then requests a normal Navidrome scan. It is useful
              if other tools also change your music folder.
            </p>
          </div>
        </section>

        <section className="help-split-section">
          <section className="help-section" id="unavailable">
            <div className="help-section-heading compact">
              <span className="help-section-icon amber"><AlertTriangle size={21} /></span>
              <div>
                <p className="eyebrow">Unavailable tracks</p>
                <h2>Not the same as missing.</h2>
              </div>
            </div>
            <p>
              <strong>Missing</strong> means Spotify supplied a normal track, but
              TrackKeep cannot find a matching audio file in your folder.
              <strong> Unavailable</strong> means Spotify no longer supplies usable
              metadata for that playlist row—often because a release was removed,
              relicensed, replaced, or is unavailable in the account's market.
            </p>
            <p>
              TrackKeep keeps unavailable rows visible so they do not silently vanish
              from your record. It excludes them from backup, download, organization,
              and playlist-sync totals because there is not enough trustworthy
              identity data to choose the right recording.
            </p>
            <div className="help-callout warning">
              <AlertTriangle size={19} />
              <p>
                A playlist can still count as fully backed up when every available
                track is present. Unavailable rows are shown separately and are not
                treated as failed backups.
              </p>
            </div>
          </section>

          <section className="help-section" id="audio">
            <div className="help-section-heading compact">
              <span className="help-section-icon green"><AudioLines size={21} /></span>
              <div>
                <p className="eyebrow">Audio quality</p>
                <h2>A ceiling, not an invented upgrade.</h2>
              </div>
            </div>
            <p>
              New backups prefer Ogg Opus. The quality selected in Settings—192 kbps
              by default—is a <strong>maximum</strong>. TrackKeep asks for the best
              provider audio available at or below that cap, with a best-audio
              fallback when providers do not publish reliable bitrate information.
            </p>
            <p>
              If the result is already Opus below the cap, TrackKeep keeps it at its
              source bitrate. It does not turn 128 kbps audio into a larger 192 kbps
              file and pretend it gained detail. Conversion happens when the source
              codec/container must change, or when audio is materially above the cap.
            </p>
            <div className="audio-cap-line" aria-label="Audio quality cap illustration">
              <span>source quality</span><i /><strong>your Opus cap</strong>
            </div>
            <p className="muted help-small-copy">
              MP3 fallback is optional. Existing MP3 and older TrackKeep M4A files
              remain valid; TrackKeep does not transcode old lossy files as a
              “quality upgrade.” Redownload from a better source if you need one.
            </p>
          </section>
        </section>

        <section className="help-section" id="matching">
          <div className="help-section-heading">
            <span className="help-section-icon teal"><FileSearch size={21} /></span>
            <div>
              <p className="eyebrow">Matching and organization</p>
              <h2>Why tags matter more than filenames.</h2>
            </div>
          </div>
          <div className="help-feature-grid">
            <article>
              <Tags size={22} />
              <h3>Identity survives a move</h3>
              <p>
                TrackKeep writes Spotify track ID, URI, album ID, and ISRC tags into
                managed files. Run Index reads these first, so a renamed or moved file
                can still reconnect to the right Spotify track.
              </p>
            </article>
            <article>
              <FolderSync size={22} />
              <h3>Organize is intentionally exact</h3>
              <p>
                A file can be backed up but still need organization. The Organize
                action moves matched files into TrackKeep's canonical artist, album,
                year, disc, track, and title layout without changing their audio.
              </p>
            </article>
            <article>
              <Download size={22} />
              <h3>Provider matches need review</h3>
              <p>
                Search results are scored guesses, not Spotify audio. Single downloads
                let you review the candidate; bulk backup previews the queue first and
                retries alternate candidates when a source fails.
              </p>
            </article>
            <article>
              <ListChecks size={22} />
              <h3>Matching protects the playlist</h3>
              <p>
                TrackKeep resolves each Spotify row to a specific local file before
                asking Navidrome or Plex for its server-side track ID. A filename that
                merely looks close is not enough to enter a synced playlist.
              </p>
            </article>
          </div>
        </section>

        <section className="help-section sync-guide" id="sync">
          <div className="help-section-heading">
            <span className="help-section-icon green"><ListMusic size={21} /></span>
            <div>
              <p className="eyebrow">Navidrome and Plex playlist sync</p>
              <h2>Turn a Spotify playlist into a playlist your own server can play.</h2>
            </div>
          </div>
          <p className="help-intro">
            The <strong>Sync library</strong> button does not download, move, or copy
            audio. It creates or updates a same-named playlist in Navidrome or Plex
            using tracks that already exist locally and that the chosen server can
            actually see.
          </p>

          <div className="sync-pipeline" aria-label="Playlist sync flow">
            <div>
              <span><ListChecks size={20} /></span>
              <small>Spotify</small>
              <strong>Playlist order</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span><HardDrive size={20} /></span>
              <small>TrackKeep</small>
              <strong>Local match</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span><FileSearch size={20} /></span>
              <small>Your server</small>
              <strong>Track identity</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span><ListMusic size={20} /></span>
              <small>Result</small>
              <strong>Playable playlist</strong>
            </div>
          </div>

          <div className="sync-truth-strip">
            <div>
              <strong>It references</strong>
              <span>the audio already indexed by your server</span>
            </div>
            <div>
              <strong>It never deletes</strong>
              <span>music files from the mounted library</span>
            </div>
            <div>
              <strong>It reports</strong>
              <span>tracks that could not safely be included</span>
            </div>
          </div>

          <div className="sync-target-grid">
            <article className="sync-target-card navidrome">
              <div className="sync-target-heading">
                <span className="help-section-icon green"><Server size={20} /></span>
                <div>
                  <p className="eyebrow">Target one</p>
                  <h3>Navidrome</h3>
                </div>
              </div>
              <p>
                TrackKeep uses the Navidrome/Subsonic API to find each matched song
                and create or update the playlist. Configure a regular Navidrome
                username and password; no separate API key is needed.
              </p>
              <ul>
                <li>Run Index so TrackKeep knows the local files.</li>
                <li>Quick-scan Navidrome so its API knows those same files.</li>
                <li>Select <strong>Navidrome</strong>, choose a mode, then sync.</li>
              </ul>
              <div className="sync-target-note">
                If a local match is missing from Navidrome, TrackKeep skips it and
                tells you to scan Navidrome before trying again.
              </div>
            </article>

            <article className="sync-target-card plex">
              <div className="sync-target-heading">
                <span className="help-section-icon teal"><Server size={20} /></span>
                <div>
                  <p className="eyebrow">Target two</p>
                  <h3>Plex</h3>
                </div>
              </div>
              <p>
                Enable Plex sync in Settings, enter the Plex server URL and an
                <strong> X-Plex-Token</strong>, then choose the music library. The
                target remains shown as “Plex off” until that setup is enabled.
              </p>
              <ul>
                <li>Make sure Plex can access and play the matched local files.</li>
                <li>Scan the Plex music library after adding or organizing audio.</li>
                <li>Select <strong>Plex</strong>, choose a mode, then sync.</li>
              </ul>
              <div className="sync-target-note">
                TrackKeep asks Plex to refresh the selected library during sync and
                also attempts to copy the Spotify playlist artwork.
              </div>
            </article>
          </div>

          <div className="sync-mode-heading">
            <p className="eyebrow">Choose the behavior</p>
            <h3>Replace, Append, and Full Sync answer different questions.</h3>
          </div>

          <div className="sync-mode-grid">
            <article>
              <span className="sync-mode-number">01</span>
              <h3>Replace</h3>
              <strong>“Make it from what is matched right now.”</strong>
              <p>
                Creates the playlist if it does not exist. If a same-named playlist
                already exists, its contents are replaced with the currently matched
                Spotify tracks in Spotify order.
              </p>
              <small>Good default when TrackKeep should rebuild the playlist.</small>
            </article>
            <article>
              <span className="sync-mode-number">02</span>
              <h3>Append</h3>
              <strong>“Keep what is there and add anything new.”</strong>
              <p>
                Preserves existing playlist entries and adds matched Spotify tracks
                that are not already present. It does not remove stale entries or
                rearrange the playlist to Spotify order.
              </p>
              <small>Best when the server playlist also has your own additions.</small>
            </article>
            <article className="full-sync-mode">
              <span className="sync-mode-number">03</span>
              <h3>Full Sync</h3>
              <strong>“Mirror the current resolvable Spotify playlist.”</strong>
              <p>
                Adds missing matches, removes stale playlist entries, and restores
                the current Spotify order. “Current” means the tracks TrackKeep can
                safely resolve in both the local library and target server.
              </p>
              <small>Removes entries from the playlist—never the audio files.</small>
            </article>
          </div>

          <div className="sync-skipped-panel">
            <div>
              <span className="help-section-icon amber"><AlertTriangle size={20} /></span>
              <div>
                <p className="eyebrow">Why tracks get skipped</p>
                <h3>A Spotify row has to clear both matching steps.</h3>
              </div>
            </div>
            <ul>
              <li><strong>Missing locally:</strong> TrackKeep has no backed-up file to reference.</li>
              <li><strong>Not in the server:</strong> the file exists, but Navidrome or Plex has not indexed it.</li>
              <li><strong>Unresolved local Spotify row:</strong> the identity is too uncertain to sync safely.</li>
              <li><strong>Unavailable on Spotify:</strong> the row lacks dependable metadata and is excluded.</li>
            </ul>
            <p>
              TrackKeep shows the skipped count and reasons after syncing. Fix the
              file or scan state, then sync again; you do not need to recreate the
              Spotify playlist.
            </p>
          </div>

          <div className="help-callout tip sync-best-order">
            <CheckCircle2 size={20} />
            <p>
              <strong>The dependable order:</strong> load the Spotify playlist → Run
              Index → back up or organize tracks → scan the target server → choose
              Navidrome or Plex → choose the sync mode → Sync library.
            </p>
          </div>
        </section>

        <section className="help-section" id="faq">
          <div className="help-section-heading">
            <span className="help-section-icon green"><CircleHelp size={21} /></span>
            <div>
              <p className="eyebrow">Fast fixes</p>
              <h2>Questions you should not need a forum thread to answer.</h2>
            </div>
          </div>

          <div className="faq-list">
            <details>
              <summary>My download finished, but I cannot see it in Navidrome.</summary>
              <p>
                Run a Quick Navidrome scan. If it still does not appear, confirm
                Navidrome can read the same host folder mounted at <code>/music</code>
                in TrackKeep, then try Full. Run Index only if TrackKeep itself also
                fails to see the file.
              </p>
            </details>
            <details>
              <summary>The file is on disk, but TrackKeep calls it missing.</summary>
              <p>
                Run Index. If it remains missing, inspect the file's title, artist,
                album, duration, ISRC, and TrackKeep identity tags. A very different
                version—live, remaster, clean, explicit, or remix—may correctly avoid
                matching the Spotify row.
              </p>
            </details>
            <details>
              <summary>Why did playlist sync skip some tracks?</summary>
              <p>
                Sync only uses tracks that are backed up and resolvable in the target
                server. Run Index, scan Navidrome or Plex, and retry. Unavailable
                Spotify rows and genuinely missing files are intentionally skipped.
              </p>
            </details>
            <details>
              <summary>Can Replace or Full Sync delete my music files?</summary>
              <p>
                No. These modes only change entries inside the same-named Navidrome
                or Plex playlist. Full Sync can remove a stale playlist entry, but it
                never deletes, moves, or retags the underlying audio file.
              </p>
            </details>
            <details>
              <summary>Why does the target menu say “Plex off”?</summary>
              <p>
                Plex playlist sync must first be enabled in Settings with a reachable
                Plex server URL, an X-Plex-Token, and a selected music library. Save
                those settings, confirm the Plex status is ready, then return to the
                playlist and select Plex as the target.
              </p>
            </details>
            <details>
              <summary>Should I organize before downloading missing tracks?</summary>
              <p>
                Usually, yes. Organize can expose an existing match under a messy path
                and reduce duplicate downloads. It is not mandatory: new TrackKeep
                downloads always use the current organized layout.
              </p>
            </details>
            <details>
              <summary>Does a metadata backup contain the audio?</summary>
              <p>
                No. A metadata snapshot preserves the Spotify list and track details.
                A track is backed up only when TrackKeep matches it to an audio file in
                the mounted music folder.
              </p>
            </details>
            <details>
              <summary>Why does TrackKeep need both folder access and Navidrome login?</summary>
              <p>
                Folder access lets TrackKeep read, index, tag, organize, and stage
                files. Navidrome credentials let it request server scans and create or
                update Navidrome playlists. TrackKeep can manage the folder without
                those credentials, but Navidrome must then discover changes through
                its own scanner.
              </p>
            </details>
          </div>
        </section>

        <footer className="help-footer panel">
          <div>
            <p className="eyebrow">Ready to continue?</p>
            <h2>Start with Run Index and let the results guide the next step.</h2>
          </div>
          <a className="command green" href="/">
            Open dashboard
            <ArrowLeft className="help-footer-arrow" size={18} />
          </a>
        </footer>
      </article>
    </main>
  );
}
