import { NextRequest, NextResponse } from "next/server";
import { matchNavidromeTracks, planNavidromeAlbumFolders } from "@/lib/navidrome";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import {
  getAlbum,
  getAlbumTracks,
  getTrack,
  getTracks,
  parseSpotifyItemId,
  parseSpotifyTrackIds,
  type SpotifyItemType
} from "@/lib/spotify";

const resolvableTypes = new Set<SpotifyItemType>(["album", "track"]);
const trackListType = "track-list";

export async function GET(request: NextRequest) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  const type = request.nextUrl.searchParams.get("type");
  const input = request.nextUrl.searchParams.get("input") ?? "";

  if (
    !type ||
    (type !== trackListType && !resolvableTypes.has(type as SpotifyItemType))
  ) {
    return withSessionCookie(
      NextResponse.json(
        {
          error:
            "Choose song, album, or track list before resolving Spotify metadata."
        },
        { status: 400 }
      ),
      session
    );
  }

  try {
    if (type === trackListType) {
      const trackIds = parseSpotifyTrackIds(input);
      const tracks = await getTracks(session.token, trackIds);
      const [folderPlans, libraryMatches] = await Promise.all([
        planNavidromeAlbumFolders(tracks),
        matchNavidromeTracks(tracks)
      ]);

      return withSessionCookie(
        NextResponse.json({
          folderPlans,
          libraryMatches,
          source: {
            name: "Imported Spotify songs",
            subtitle: `${tracks.length} songs from pasted Spotify links`,
            tracksTotal: tracks.length,
            type
          },
          tracks,
          type
        }),
        session
      );
    }

    const spotifyItemType = type as SpotifyItemType;
    const id = parseSpotifyItemId(input, spotifyItemType);

    if (spotifyItemType === "track") {
      const track = await getTrack(session.token, id);
      const [folderPlans, libraryMatches] = await Promise.all([
        planNavidromeAlbumFolders([track]),
        matchNavidromeTracks([track])
      ]);

      return withSessionCookie(
        NextResponse.json({
          folderPlans,
          libraryMatches,
          source: {
            id: track.id,
            imageUrl: track.albumImageUrl,
            name: track.name,
            subtitle: `${track.artists.join(", ") || "Unknown Artist"} - ${
              track.album || "Unknown Album"
            }`,
            tracksTotal: 1,
            type: spotifyItemType
          },
          tracks: [track],
          type: spotifyItemType
        }),
        session
      );
    }

    const [album, tracks] = await Promise.all([
      getAlbum(session.token, id),
      getAlbumTracks(session.token, id)
    ]);
    const [folderPlans, libraryMatches] = await Promise.all([
      planNavidromeAlbumFolders(tracks),
      matchNavidromeTracks(tracks)
    ]);

    return withSessionCookie(
      NextResponse.json({
        folderPlans,
        libraryMatches,
        source: {
          externalUrl: album.externalUrl,
          id: album.id,
          imageUrl: album.imageUrl,
          name: album.name,
          subtitle: album.artists.join(", ") || "Unknown Artist",
          tracksTotal: album.tracksTotal,
          type: spotifyItemType
        },
        tracks,
        type: spotifyItemType
      }),
      session
    );
  } catch (error) {
    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Spotify metadata lookup failed."
        },
        { status: 400 }
      ),
      session
    );
  }
}
