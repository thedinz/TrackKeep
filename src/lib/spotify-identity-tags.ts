import type { BackupTrack } from "./spotify";

export const spotifyBuIdentityVersion = "1";
export const spotifyBuIdentityCommentPrefix = "TrackKeep identity ";
export const spotifyBuLegacyIdentityCommentPrefix = "SpotifyBU identity ";

export const trackKeepIdentityTags = {
  albumId: "trackkeep:album_id",
  identityVersion: "trackkeep:identity_version",
  isrc: "trackkeep:isrc",
  trackId: "trackkeep:track_id",
  trackUri: "trackkeep:track_uri"
} as const;

export const spotifyBuIdentityTags = {
  albumId: "spotifybu:album_id",
  identityVersion: "spotifybu:identity_version",
  isrc: "spotifybu:isrc",
  trackId: "spotifybu:track_id",
  trackUri: "spotifybu:track_uri"
} as const;

export const spotifyBuIdentityTagAliases = {
  albumId: identityTagAliases("albumId"),
  identityVersion: identityTagAliases("identityVersion"),
  isrc: identityTagAliases("isrc"),
  trackId: identityTagAliases("trackId"),
  trackUri: identityTagAliases("trackUri")
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
  const identityValues = {
    albumId: metadata.spotifyAlbumId,
    identityVersion: metadata.spotifybuIdentityVersion,
    isrc: metadata.spotifyIsrc,
    trackId: metadata.spotifyTrackId,
    trackUri: metadata.spotifyTrackUri
  } as const;

  const entries: Array<[string, string | undefined]> = [
    trackKeepIdentityTags,
    spotifyBuIdentityTags
  ].flatMap((tags) =>
    (Object.keys(identityValues) as Array<keyof typeof identityValues>).map(
      (key) =>
        [tags[key], identityValues[key]] as [string, string | undefined]
    )
  );

  return entries.filter(
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
      identityCommentValue(commentMetadata, "trackUri")
  );
  const spotifyTrackId =
    normalizeSpotifyId(
      tagLookup(spotifyBuIdentityTagAliases.trackId) ??
        identityCommentValue(commentMetadata, "trackId")
    ) ??
    spotifyTrackIdFromUri(spotifyTrackUri);

  return {
    spotifyAlbumId: normalizeSpotifyId(
      tagLookup(spotifyBuIdentityTagAliases.albumId) ??
        identityCommentValue(commentMetadata, "albumId")
    ),
    spotifyIsrc: normalizeIdentityValue(
      tagLookup(spotifyBuIdentityTagAliases.isrc) ??
        identityCommentValue(commentMetadata, "isrc")
    ),
    spotifyTrackId,
    spotifyTrackUri,
    spotifybuIdentityVersion: normalizeIdentityValue(
      tagLookup(spotifyBuIdentityTagAliases.identityVersion) ??
        identityCommentValue(commentMetadata, "identityVersion")
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

function identityTagAliases(key: keyof typeof spotifyBuIdentityTags) {
  return [
    ...tagAliases(trackKeepIdentityTags[key]),
    ...tagAliases(spotifyBuIdentityTags[key])
  ];
}

function identityCommentValue(
  commentMetadata: Record<string, string>,
  key: keyof typeof spotifyBuIdentityTags
) {
  return identityTagAliases(key)
    .map((alias) => commentMetadata[alias])
    .find((value) => typeof value === "string" && value.length > 0);
}

function spotifyBuIdentityMetadataFromComment(value?: string) {
  const trimmedValue = value?.trim();
  const commentPrefix = [
    spotifyBuIdentityCommentPrefix,
    spotifyBuLegacyIdentityCommentPrefix
  ].find((prefix) => trimmedValue?.startsWith(prefix));

  if (!trimmedValue || !commentPrefix) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(
      trimmedValue.slice(commentPrefix.length)
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
