import type { BackupTrack } from "./spotify";

export const spotifyBuIdentityVersion = "1";
export const spotifyBuIdentityCommentPrefix = "SpotifyBU identity ";

export const spotifyBuIdentityTags = {
  albumId: "spotifybu:album_id",
  identityVersion: "spotifybu:identity_version",
  isrc: "spotifybu:isrc",
  trackId: "spotifybu:track_id",
  trackUri: "spotifybu:track_uri"
} as const;

export const spotifyBuIdentityTagAliases = {
  albumId: tagAliases(spotifyBuIdentityTags.albumId),
  identityVersion: tagAliases(spotifyBuIdentityTags.identityVersion),
  isrc: tagAliases(spotifyBuIdentityTags.isrc),
  trackId: tagAliases(spotifyBuIdentityTags.trackId),
  trackUri: tagAliases(spotifyBuIdentityTags.trackUri)
} as const;

export type SpotifyBuIdentityMetadata = {
  spotifyAlbumId?: string;
  spotifyIsrc?: string;
  spotifyTrackId?: string;
  spotifyTrackUri?: string;
  spotifybuIdentityVersion?: string;
};

export function spotifyBuIdentityMetadataForTrack(
  track: Pick<
    BackupTrack,
    "albumId" | "id" | "isrc" | "metadataStatus" | "spotifyUri"
  >
): SpotifyBuIdentityMetadata {
  const catalogIdentityAllowed =
    track.metadataStatus !== "spotify-local-unresolved";
  const spotifyTrackUriFromTrack = catalogIdentityAllowed
    ? normalizeSpotifyTrackUri(track.spotifyUri)
    : undefined;
  const spotifyTrackId = catalogIdentityAllowed
    ? normalizeSpotifyId(track.id) ?? spotifyTrackIdFromUri(spotifyTrackUriFromTrack)
    : undefined;
  const spotifyTrackUri = catalogIdentityAllowed
    ? spotifyTrackUriFromTrack ?? spotifyTrackUriFromId(spotifyTrackId)
    : undefined;

  return {
    spotifyAlbumId: catalogIdentityAllowed
      ? normalizeSpotifyId(track.albumId)
      : undefined,
    spotifyIsrc: normalizeIdentityValue(track.isrc),
    spotifyTrackId,
    spotifyTrackUri,
    spotifybuIdentityVersion: spotifyBuIdentityVersion
  };
}

export function spotifyBuIdentityMetadataEntries(
  metadata: SpotifyBuIdentityMetadata
) {
  return [
    [spotifyBuIdentityTags.trackId, metadata.spotifyTrackId],
    [spotifyBuIdentityTags.trackUri, metadata.spotifyTrackUri],
    [spotifyBuIdentityTags.albumId, metadata.spotifyAlbumId],
    [spotifyBuIdentityTags.isrc, metadata.spotifyIsrc],
    [spotifyBuIdentityTags.identityVersion, metadata.spotifybuIdentityVersion]
  ].filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0
  );
}

export function spotifyBuIdentityMetadataFromTagLookup(
  tagLookup: (keys: readonly string[]) => string | undefined
): SpotifyBuIdentityMetadata {
  const commentMetadata = spotifyBuIdentityMetadataFromComment(
    tagLookup(["comment"])
  );
  const spotifyTrackUri = normalizeSpotifyTrackUri(
    tagLookup(spotifyBuIdentityTagAliases.trackUri) ??
      commentMetadata[spotifyBuIdentityTags.trackUri]
  );
  const spotifyTrackId =
    normalizeSpotifyId(
      tagLookup(spotifyBuIdentityTagAliases.trackId) ??
        commentMetadata[spotifyBuIdentityTags.trackId]
    ) ??
    spotifyTrackIdFromUri(spotifyTrackUri);

  return {
    spotifyAlbumId: normalizeSpotifyId(
      tagLookup(spotifyBuIdentityTagAliases.albumId) ??
        commentMetadata[spotifyBuIdentityTags.albumId]
    ),
    spotifyIsrc: normalizeIdentityValue(
      tagLookup(spotifyBuIdentityTagAliases.isrc) ??
        commentMetadata[spotifyBuIdentityTags.isrc]
    ),
    spotifyTrackId,
    spotifyTrackUri,
    spotifybuIdentityVersion: normalizeIdentityValue(
      tagLookup(spotifyBuIdentityTagAliases.identityVersion) ??
        commentMetadata[spotifyBuIdentityTags.identityVersion]
    )
  };
}

export function spotifyBuIdentityMetadataHasTrackIdentity(
  metadata: SpotifyBuIdentityMetadata
) {
  return Boolean(metadata.spotifyTrackId || metadata.spotifyTrackUri);
}

export function spotifyBuIdentityKeyForTrack(
  track: Pick<
    BackupTrack,
    "albumId" | "id" | "isrc" | "metadataStatus" | "spotifyUri"
  >
) {
  const metadata = spotifyBuIdentityMetadataForTrack(track);

  if (metadata.spotifyTrackId) {
    return `track-id:${metadata.spotifyTrackId}`;
  }

  if (metadata.spotifyTrackUri) {
    return `track-uri:${metadata.spotifyTrackUri}`;
  }

  return "";
}

export function spotifyTrackIdFromUri(value?: string) {
  const match = value?.trim().match(/^spotify:track:([A-Za-z0-9]{6,})$/i);

  return match?.[1];
}

function spotifyTrackUriFromId(value?: string) {
  return value ? `spotify:track:${value}` : undefined;
}

function normalizeSpotifyTrackUri(value?: string) {
  const trimmedValue = normalizeIdentityValue(value);

  return spotifyTrackIdFromUri(trimmedValue) ? trimmedValue : undefined;
}

function normalizeSpotifyId(value?: string) {
  const trimmedValue = normalizeIdentityValue(value);

  if (!trimmedValue || !/^[A-Za-z0-9]{6,}$/.test(trimmedValue)) {
    return undefined;
  }

  return trimmedValue;
}

function normalizeIdentityValue(value?: string) {
  const trimmedValue = value?.trim();

  return trimmedValue || undefined;
}

function tagAliases(tagName: string) {
  return [
    tagName,
    tagName.replace(/:/g, "_"),
    `----:com.apple.itunes:${tagName}`
  ];
}

function spotifyBuIdentityMetadataFromComment(value?: string) {
  const trimmedValue = value?.trim();

  if (!trimmedValue?.startsWith(spotifyBuIdentityCommentPrefix)) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(
      trimmedValue.slice(spotifyBuIdentityCommentPrefix.length)
    ) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {} as Record<string, string>;
  }
}
