import {
  getTrack,
  getTracks,
  parseSpotifyItemId,
  type BackupTrack,
  type SpotifyTokenSet
} from "@/lib/spotify";

export async function refreshProviderDownloadTrackFromSpotify(
  tokenSet: SpotifyTokenSet,
  track: BackupTrack
) {
  const trackId = providerDownloadSpotifyTrackId(track);
  const spotifyTrack = await getTrack(tokenSet, trackId);

  return providerTrackWithSpotifyMetadata(track, spotifyTrack);
}

export async function refreshProviderDownloadTracksFromSpotify(
  tokenSet: SpotifyTokenSet,
  tracks: BackupTrack[]
) {
  if (!tracks.length) {
    return [];
  }

  const trackIds = tracks.map(providerDownloadSpotifyTrackId);
  const spotifyTracks = await getTracks(tokenSet, trackIds);

  return spotifyTracks.map((spotifyTrack, index) =>
    providerTrackWithSpotifyMetadata(tracks[index], spotifyTrack)
  );
}

export function providerTrackWithSpotifyMetadata(
  requestedTrack: BackupTrack,
  spotifyTrack: BackupTrack
) {
  return {
    ...spotifyTrack,
    addedAt: requestedTrack.addedAt,
    position: requestedTrack.position
  } satisfies BackupTrack;
}

function providerDownloadSpotifyTrackId(track: BackupTrack) {
  if (!track || typeof track.id !== "string" || !track.id.trim()) {
    throw new Error(
      "Spotify track metadata is required before downloading from a provider."
    );
  }

  try {
    return parseSpotifyItemId(track.id, "track");
  } catch {
    throw new Error(
      "TrackKeep could not verify this Spotify track before downloading."
    );
  }
}
