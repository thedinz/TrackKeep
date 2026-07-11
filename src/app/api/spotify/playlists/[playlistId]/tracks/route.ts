import { NextResponse } from "next/server";
import { matchMusicLibraryTracks, planMusicLibraryAlbumFolders } from "@/lib/music-library";
import { persistPlaylistBackup } from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import {
  getPlaylist,
  getPlaylistTracks,
  isUnresolvedSpotifyLocalBackupTrack
} from "@/lib/spotify";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
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
    const [playlist, tracks] = await Promise.all([
      getPlaylist(session.token, playlistId),
      getPlaylistTracks(session.token, playlistId)
    ]);
    const playlistWithTrackTotal =
      playlist.tracksTotal || !tracks.length
        ? playlist
        : {
            ...playlist,
            tracksTotal: tracks.length
          };
    const folderPlanTracks = tracks.filter(
      (track) => !isUnresolvedSpotifyLocalBackupTrack(track)
    );
    const [folderPlans, libraryMatches] = await Promise.all([
      planMusicLibraryAlbumFolders(folderPlanTracks),
      matchMusicLibraryTracks(tracks)
    ]);
    const metadataBackup = persistPlaylistBackup({
      playlist: playlistWithTrackTotal,
      source: "playlist-load",
      tracks
    });

    return withSessionCookie(
      NextResponse.json({
        folderPlans,
        libraryMatches,
        metadataBackup,
        playlist: playlistWithTrackTotal,
        tracks
      }),
      session,
      request
    );
  } catch (error) {
    const params = await context.params;

    await appendDiagnosticLog("spotify.playlist_tracks.route_failed", {
      error: diagnosticError(error),
      playlistId: params.playlistId,
      route: "/api/spotify/playlists/[playlistId]/tracks"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "TrackKeep could not load this Spotify playlist."
        },
        { status: 502 }
      ),
      session,
      request
    );
  }
}
