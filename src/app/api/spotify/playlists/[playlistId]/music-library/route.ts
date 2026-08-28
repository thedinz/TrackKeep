import { NextResponse } from "next/server";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { createOrUpdateMusicLibraryPlaylistFromSpotify } from "@/lib/music-library";
import { createOrUpdatePlexPlaylistFromSpotify } from "@/lib/plex";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getPlaylist, getPlaylistTracks } from "@/lib/spotify";
import type { MusicLibraryPlaylistSyncMode } from "@/lib/music-library";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

type MusicLibraryPlaylistSyncTarget = "navidrome" | "plex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session,
      request
    );
  }

  try {
    const { playlistId } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | {
          mode?: unknown;
          target?: unknown;
          trackPositions?: unknown;
        }
      | null;
    const mode: MusicLibraryPlaylistSyncMode = parsePlaylistSyncMode(body?.mode);
    const target = parsePlaylistSyncTarget(body?.target);
    const requestedTrackPositions = parseTrackPositions(body?.trackPositions);
    const [playlist, tracks] = await Promise.all([
      getPlaylist(session.token, playlistId),
      getPlaylistTracks(session.token, playlistId)
    ]);
    const syncTracks = requestedTrackPositions.length
      ? tracks.filter((track) => requestedTrackPositions.includes(track.position))
      : tracks;
    const musicLibraryPlaylist =
      target === "plex"
        ? await createOrUpdatePlexPlaylistFromSpotify(playlist, syncTracks, {
            mode
          })
        : await createOrUpdateMusicLibraryPlaylistFromSpotify(playlist, syncTracks, {
            mode
          });

    return withSessionCookie(
      NextResponse.json(
        {
          musicLibraryPlaylist: {
            ...musicLibraryPlaylist,
            target,
            targetName: target === "plex" ? "Plex" : "Navidrome"
          }
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      ),
      session,
      request
    );
  } catch (error) {
    const params = await context.params;

    await appendDiagnosticLog("spotify.playlist_music_library.route_failed", {
      error: diagnosticError(error),
      playlistId: params.playlistId,
      route: "/api/spotify/playlists/[playlistId]/music-library"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "TrackKeep could not sync the playlist."
        },
        {
          status: 400
        }
      ),
      session,
      request
    );
  }
}

function parsePlaylistSyncMode(mode: unknown): MusicLibraryPlaylistSyncMode {
  if (mode === "append" || mode === "fullsync") {
    return mode;
  }

  return "replace";
}

function parsePlaylistSyncTarget(
  target: unknown
): MusicLibraryPlaylistSyncTarget {
  return target === "plex" ? "plex" : "navidrome";
}

function parseTrackPositions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value)].filter(
    (trackPosition): trackPosition is number =>
      typeof trackPosition === "number" &&
      Number.isInteger(trackPosition) &&
      trackPosition >= 0
  );
}
