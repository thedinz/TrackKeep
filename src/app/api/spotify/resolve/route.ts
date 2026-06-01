import { NextRequest, NextResponse } from "next/server";
import { planNavidromeAlbumFolders } from "@/lib/navidrome";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import {
  getAlbum,
  getAlbumTracks,
  getTrack,
  parseSpotifyItemId,
  type SpotifyItemType
} from "@/lib/spotify";

const resolvableTypes = new Set<SpotifyItemType>(["album", "track"]);

export async function GET(request: NextRequest) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  const type = request.nextUrl.searchParams.get("type") as SpotifyItemType | null;
  const input = request.nextUrl.searchParams.get("input") ?? "";

  if (!type || !resolvableTypes.has(type)) {
    return withSessionCookie(
      NextResponse.json(
        { error: "Choose song or album before resolving Spotify metadata." },
        { status: 400 }
      ),
      session
    );
  }

  try {
    const id = parseSpotifyItemId(input, type);

    if (type === "track") {
      const track = await getTrack(session.token, id);
      const folderPlans = await planNavidromeAlbumFolders([track]);

      return withSessionCookie(
        NextResponse.json({
          folderPlans,
          source: {
            id: track.id,
            imageUrl: track.albumImageUrl,
            name: track.name,
            subtitle: `${track.artists.join(", ") || "Unknown Artist"} - ${
              track.album || "Unknown Album"
            }`,
            tracksTotal: 1,
            type
          },
          tracks: [track],
          type
        }),
        session
      );
    }

    const [album, tracks] = await Promise.all([
      getAlbum(session.token, id),
      getAlbumTracks(session.token, id)
    ]);
    const folderPlans = await planNavidromeAlbumFolders(tracks);

    return withSessionCookie(
      NextResponse.json({
        folderPlans,
        source: {
          externalUrl: album.externalUrl,
          id: album.id,
          imageUrl: album.imageUrl,
          name: album.name,
          subtitle: album.artists.join(", ") || "Unknown Artist",
          tracksTotal: album.tracksTotal,
          type
        },
        tracks,
        type
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
