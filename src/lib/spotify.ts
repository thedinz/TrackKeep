import { getAppBaseUrl } from "./app-url";
import { appendDiagnosticLog, diagnosticError } from "./diagnostics";
import { scoreProviderCandidate } from "./providers/scoring";

export type SpotifyTokenSet = {
  access_token: string;
  expires_at: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type SpotifyPaging<T> = {
  items?: Array<T | null>;
  next?: string | null;
  total?: number;
};

type SpotifyImage = {
  height?: number;
  url: string;
  width?: number;
};

type SpotifyExternalUrls = {
  spotify?: string;
};

type SpotifyArtist = {
  id?: string;
  name: string;
};

type SpotifyAlbumSummaryObject = {
  album_type?: string;
  artists?: SpotifyArtist[];
  external_urls?: SpotifyExternalUrls;
  id?: string;
  images?: SpotifyImage[];
  name?: string;
  release_date?: string;
  total_tracks?: number;
};

export type SpotifyTrackObject = {
  album?: SpotifyAlbumSummaryObject;
  artists?: SpotifyArtist[];
  disc_number?: number;
  duration_ms?: number;
  explicit?: boolean;
  external_ids?: {
    isrc?: string;
  };
  external_urls?: SpotifyExternalUrls;
  id?: string;
  is_local?: boolean;
  name?: string;
  track_number?: number;
  type?: string;
  uri?: string;
};

type SpotifyAlbumTrackObject = {
  artists?: SpotifyArtist[];
  disc_number?: number;
  duration_ms?: number;
  explicit?: boolean;
  external_urls?: SpotifyExternalUrls;
  id?: string;
  name?: string;
  track_number?: number;
  type?: string;
  uri?: string;
};

type SpotifyAlbumObject = SpotifyAlbumSummaryObject & {
  tracks?: SpotifyPaging<SpotifyAlbumTrackObject>;
};

type SpotifyPlaylistObject = {
  collaborative?: boolean;
  description?: string;
  external_urls?: SpotifyExternalUrls;
  id?: string;
  images?: SpotifyImage[];
  items?: {
    total?: number;
  };
  name?: string;
  owner?: {
    display_name?: string;
    id?: string;
  };
  public?: boolean | null;
  tracks?: {
    total?: number;
  };
};

type SpotifyPlaylistTrackItem = {
  added_at?: string;
  item?: SpotifyTrackObject | null;
  track?: SpotifyTrackObject | null;
};

type SpotifySearchResponse = {
  tracks?: SpotifyPaging<SpotifyTrackObject>;
};

type PlaylistTrackItem = {
  addedAt: string | undefined;
  metadataStatus?: BackupTrackMetadataStatus;
  metadataWarning?: string;
  track: SpotifyTrackObject;
};

type LocalTrackResolutionEntry = {
  index: number;
  localTrack: SpotifyTrackObject;
  match: SpotifyTrackSearchMatch | null;
};

export type SpotifyTrackSearchMatch = {
  score: ReturnType<typeof scoreProviderCandidate>;
  track: SpotifyTrackObject;
};

export type SpotifyUserProfile = {
  displayName: string;
  email?: string;
  id: string;
  imageUrl?: string;
};

export type PlaylistSummary = {
  collaborative: boolean;
  description: string;
  externalUrl?: string;
  id: string;
  imageUrl?: string;
  name: string;
  owner: string;
  ownerId?: string;
  public: boolean | null;
  tracksTotal: number;
};

export type AlbumSummary = {
  albumType?: string;
  artists: string[];
  artistIds: string[];
  externalUrl?: string;
  id: string;
  imageUrl?: string;
  name: string;
  releaseDate?: string;
  tracksTotal: number;
};

export type BackupTrackMetadataStatus =
  | "spotify"
  | "spotify-local-resolved"
  | "spotify-local-unresolved";

export type BackupTrack = {
  addedAt?: string;
  album: string;
  albumArtist: string;
  albumArtistIds: string[];
  albumId?: string;
  albumImageUrl?: string;
  albumReleaseDate?: string;
  albumTracksTotal?: number;
  albumType?: string;
  artists: string[];
  artistIds: string[];
  discNumber?: number;
  durationMs: number;
  explicit: boolean;
  id?: string;
  isrc?: string;
  metadataStatus?: BackupTrackMetadataStatus;
  metadataWarning?: string;
  name: string;
  position: number;
  spotifyUri?: string;
  spotifyUrl?: string;
  trackNumber?: number;
};

export type BackupPayload = {
  exportedAt: string;
  playlist: PlaylistSummary;
  source: "spotify";
  tracks: BackupTrack[];
  version: 1;
};

export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const spotifyTokenUrl = "https://accounts.spotify.com/api/token";
const spotifyApiBaseUrl = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read"
];

export const unresolvedSpotifyLocalTrackMessage =
  "Spotify returned this playlist row as a local file instead of a catalog track. Remove and re-add the Spotify catalog track before backing it up.";

export function isUnresolvedSpotifyLocalBackupTrack(
  track: Pick<BackupTrack, "metadataStatus">
) {
  return track.metadataStatus === "spotify-local-unresolved";
}

const playlistMetadataFields = [
  "collaborative",
  "description",
  "external_urls",
  "id",
  "images",
  "name",
  "owner(display_name,id)",
  "public"
].join(",");

const playlistSummaryFields = [
  playlistMetadataFields,
  "items(total)",
  "tracks(total)"
].join(",");

const userPlaylistsFields = [
  `items(${playlistSummaryFields})`,
  "next",
  "total"
].join(",");

export function getSpotifyClientId() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    throw new Error("Missing SPOTIFY_CLIENT_ID.");
  }

  return clientId;
}

export function getSpotifyRedirectUri(request: Request) {
  return `${getAppBaseUrl(request)}/api/auth/callback`;
}

export async function exchangeCodeForToken({
  code,
  codeVerifier,
  redirectUri
}: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const formData = new URLSearchParams({
    client_id: getSpotifyClientId(),
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const response = await fetch(spotifyTokenUrl, {
    body: formData,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new SpotifyApiError(
      await responseErrorMessage(response),
      response.status,
      spotifyTokenUrl
    );
  }

  return tokenSetFromResponse(await response.json());
}

export async function refreshAccessToken(tokenSet: SpotifyTokenSet) {
  if (!tokenSet.refresh_token) {
    throw new Error("Missing refresh token.");
  }

  const formData = new URLSearchParams({
    client_id: getSpotifyClientId(),
    grant_type: "refresh_token",
    refresh_token: tokenSet.refresh_token
  });

  const response = await fetch(spotifyTokenUrl, {
    body: formData,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new SpotifyApiError(
      await responseErrorMessage(response),
      response.status,
      spotifyTokenUrl
    );
  }

  return tokenSetFromResponse(await response.json(), tokenSet.refresh_token);
}

export async function getCurrentUser(tokenSet: SpotifyTokenSet) {
  const profile = await spotifyFetch<{
    display_name?: string;
    email?: string;
    id: string;
    images?: SpotifyImage[];
  }>(tokenSet, "/me");

  return {
    displayName: profile.display_name || profile.id,
    email: profile.email,
    id: profile.id,
    imageUrl: firstImageUrl(profile.images)
  } satisfies SpotifyUserProfile;
}

export async function getUserPlaylists(tokenSet: SpotifyTokenSet) {
  const playlists = await getAllPages<SpotifyPlaylistObject>(
    tokenSet,
    `/me/playlists?limit=50&fields=${encodeURIComponent(userPlaylistsFields)}`
  );
  const hydratedPlaylists = await hydrateMissingPlaylistTotals(
    tokenSet,
    playlists
  );

  return hydratedPlaylists.map(mapPlaylist).filter((playlist) => playlist.id);
}

export async function getPlaylist(tokenSet: SpotifyTokenSet, playlistId: string) {
  return mapPlaylist(await fetchPlaylistSummary(tokenSet, playlistId));
}

export async function getPlaylistTracks(
  tokenSet: SpotifyTokenSet,
  playlistId: string
) {
  let items: SpotifyPlaylistTrackItem[];

  try {
    items = await getAllPages<SpotifyPlaylistTrackItem>(
      tokenSet,
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`
    );
  } catch (error) {
    if (isSpotifyApiStatus(error, 403)) {
      throw new Error(
        "Spotify only exposes playlist tracks for playlists owned by or collaborated on by the connected Spotify user. Choose an owned or collaborative playlist, or copy this playlist into that user's account first."
      );
    }

    throw error;
  }

  const playlistTracks = items
    .map((item) => ({
      addedAt: item.added_at,
      track: item.item ?? item.track
    }))
    .filter((item): item is PlaylistTrackItem => item.track?.type === "track");
  const resolvedTracks = await resolveLocalPlaylistTracks(
    tokenSet,
    playlistTracks
  );

  return resolvedTracks.map((item, index) =>
    mapTrackObject(
      item.track,
      index,
      item.addedAt,
      item.metadataStatus,
      item.metadataWarning
    )
  );
}

async function resolveLocalPlaylistTracks(
  tokenSet: SpotifyTokenSet,
  playlistTracks: PlaylistTrackItem[]
) {
  const localEntries = playlistTracks
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => spotifyTrackNeedsCatalogResolution(item.track));

  if (!localEntries.length) {
    return playlistTracks;
  }

  const resolvedEntries: LocalTrackResolutionEntry[] = await mapWithConcurrency(
    localEntries,
    4,
    async ({ index, item }) => ({
      index,
      localTrack: item.track,
      match: await resolveLocalSpotifyTrack(tokenSet, item.track)
    })
  );
  const resolvedByIndex = new Map(
    resolvedEntries
      .filter(hasSpotifyTrackSearchMatch)
      .map((entry) => [entry.index, entry.match.track] as const)
  );
  const replacementByIndex = new Map(
    resolvedEntries.map((entry) => [
      entry.index,
      {
        metadataStatus: entry.match
          ? "spotify-local-resolved"
          : "spotify-local-unresolved",
        metadataWarning: entry.match ? undefined : unresolvedSpotifyLocalTrackMessage,
        track: entry.match?.track ?? sanitizeUnresolvedLocalSpotifyTrack(entry.localTrack)
      } satisfies Pick<
        PlaylistTrackItem,
        "metadataStatus" | "metadataWarning" | "track"
      >
    ] as const)
  );

  await appendDiagnosticLog("spotify.playlist.local_track_resolution", {
    examples: resolvedEntries.slice(0, 5).map((entry) => ({
      localAlbum: entry.localTrack.album?.name,
      localArtists: spotifyTrackArtistNames(entry.localTrack),
      localDurationMs: spotifyTrackDurationMs(entry.localTrack),
      localName: entry.localTrack.name,
      localRawDurationMs: entry.localTrack.duration_ms,
      localUri: entry.localTrack.uri,
      resolutionReasons: spotifyTrackCatalogResolutionReasons(entry.localTrack),
      resolvedAlbum: entry.match?.track.album?.name,
      resolvedArtists: entry.match
        ? spotifyTrackArtistNames(entry.match.track)
        : undefined,
      resolvedName: entry.match?.track.name,
      resolvedScore: entry.match?.score.overall,
      resolvedTrackId: entry.match?.track.id,
      sanitizedFallback: !entry.match
    })),
    localTrackCount: localEntries.length,
    resolvedTrackCount: resolvedByIndex.size,
    sanitizedFallbackCount: resolvedEntries.length - resolvedByIndex.size
  });

  if (!replacementByIndex.size) {
    return playlistTracks;
  }

  return playlistTracks.map((item, index) => {
    const replacement = replacementByIndex.get(index);

    return replacement
      ? {
          ...item,
          metadataStatus: replacement.metadataStatus,
          metadataWarning: replacement.metadataWarning,
          track: replacement.track
        }
      : item;
  });
}

function hasSpotifyTrackSearchMatch(
  entry: LocalTrackResolutionEntry
): entry is LocalTrackResolutionEntry & { match: SpotifyTrackSearchMatch } {
  return Boolean(entry.match);
}

async function resolveLocalSpotifyTrack(
  tokenSet: SpotifyTokenSet,
  track: SpotifyTrackObject
) {
  const searchQueries = spotifyLocalTrackSearchQueries(track);

  try {
    const searchResults: SpotifyTrackObject[] = [];

    for (const query of searchQueries) {
      const response = await spotifyFetch<SpotifySearchResponse>(
        tokenSet,
        `/search?type=track&limit=50&q=${encodeURIComponent(query)}`
      );
      const candidates = response.tracks?.items ?? [];

      searchResults.push(
        ...candidates.filter(
          (candidate): candidate is SpotifyTrackObject =>
            candidate?.type === "track"
        )
      );
    }

    const uniqueCandidates = uniqueSpotifyTracks(searchResults);
    const rankedMatches = rankSpotifyTrackSearchMatches(track, uniqueCandidates);
    const match = rankedMatches.find(isConfidentSpotifyTrackSearchMatch) ?? null;

    if (!match) {
      await appendDiagnosticLog("spotify.playlist.local_track_unresolved", {
        candidateCount: uniqueCandidates.length,
        localAlbum: track.album?.name,
        localArtists: spotifyTrackArtistNames(track),
        localDurationMs: spotifyTrackDurationMs(track),
        localName: track.name,
        localRawDurationMs: track.duration_ms,
        localUri: track.uri,
        searchQueries,
        topCandidates: rankedMatches
          .slice(0, 5)
          .map(formatSpotifyTrackSearchMatch)
      });
    }

    return match;
  } catch (error) {
    await appendDiagnosticLog("spotify.playlist.local_track_resolve_failed", {
      error: diagnosticError(error),
      localAlbum: track.album?.name,
      localArtists: spotifyTrackArtistNames(track),
      localDurationMs: spotifyTrackDurationMs(track),
      localName: track.name,
      localRawDurationMs: track.duration_ms,
      localUri: track.uri,
      searchQueries
    });

    return null;
  }
}

function formatSpotifyTrackSearchMatch(match: SpotifyTrackSearchMatch) {
  return {
    album: match.track.album?.name,
    artists: spotifyTrackArtistNames(match.track),
    durationDeltaMs: match.score.durationDeltaMs,
    durationMs: spotifyTrackDurationMs(match.track),
    id: match.track.id,
    name: match.track.name,
    score: match.score.overall,
    titleScore: match.score.titleScore,
    uri: match.track.uri
  };
}

function sanitizeUnresolvedLocalSpotifyTrack(
  track: SpotifyTrackObject
): SpotifyTrackObject {
  const sanitizedName = spotifySanitizedLocalTrackTitle(track);

  return {
    ...track,
    album: hasProviderPollutedSpotifyMetadata(track) ? undefined : track.album,
    duration_ms: spotifyTrackDurationMs(track),
    name: sanitizedName || track.name
  };
}

export function rankSpotifyTrackSearchMatches(
  localTrack: SpotifyTrackObject,
  candidates: SpotifyTrackObject[]
) {
  const localTitles = spotifyCatalogRecoveryTitleVariants(localTrack);
  const localArtists = spotifyTrackArtistNames(localTrack);

  if (!localTitles.length || !localArtists.length) {
    return [];
  }

  return candidates
    .filter(
      (candidate) =>
        isCatalogSpotifyTrack(candidate) &&
        !isProviderPollutedRecoveryVariant(localTrack, candidate)
    )
    .map((candidate): SpotifyTrackSearchMatch | null => {
      const candidateMetadata = {
        album: candidate.album?.name,
        artists: spotifyTrackArtistNames(candidate),
        durationMs: spotifyTrackDurationMs(candidate),
        title: candidate.name ?? ""
      };
      const score = localTitles
        .map((localTitle) =>
          scoreProviderCandidate(
            {
              artists: localArtists,
              durationMs:
                spotifyTrackDurationMs(localTrack) ??
                spotifyTrackDurationMs(candidate) ??
                0,
              name: localTitle
            },
            candidateMetadata
          )
        )
        .sort(compareCandidateScores)[0];

      if (!score) {
        return null;
      }

      return {
        score,
        track: candidate
      };
    })
    .filter((match): match is SpotifyTrackSearchMatch => Boolean(match))
    .sort(compareSpotifyTrackSearchMatches);
}

export function pickBestSpotifyTrackSearchMatch(
  localTrack: SpotifyTrackObject,
  candidates: SpotifyTrackObject[]
): SpotifyTrackSearchMatch | null {
  const bestMatch = rankSpotifyTrackSearchMatches(localTrack, candidates)[0];

  return bestMatch && isConfidentSpotifyTrackSearchMatch(bestMatch)
    ? bestMatch
    : null;
}

function spotifyTrackDurationMs(track: SpotifyTrackObject) {
  if (typeof track.duration_ms === "number" && Number.isFinite(track.duration_ms)) {
    if (
      track.duration_ms > 0 &&
      track.duration_ms < 3_000 &&
      spotifyTrackNeedsCatalogResolution(track)
    ) {
      return track.duration_ms * 1000;
    }

    return track.duration_ms;
  }

  const localUriDurationSeconds = spotifyLocalUriDurationSeconds(track.uri);

  return localUriDurationSeconds ? localUriDurationSeconds * 1000 : undefined;
}

function spotifyLocalUriDurationSeconds(uri: string | undefined) {
  if (!uri?.startsWith("spotify:local:")) {
    return null;
  }

  const durationValue = uri.split(":").at(-1);
  const durationSeconds = durationValue ? Number(durationValue) : Number.NaN;

  return Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds < 24 * 60 * 60
    ? durationSeconds
    : null;
}

export function spotifyLocalTrackSearchQueries(track: SpotifyTrackObject) {
  const artistNames = spotifyTrackArtistNames(track).slice(0, 2);
  const artistText = artistNames.join(" ");
  const primaryArtist = artistNames[0];
  const searchQueries = spotifyCatalogRecoveryTitleVariants(track).flatMap(
    (titleVariant) => [
      [titleVariant, artistText].filter(Boolean).join(" "),
      primaryArtist
        ? `track:"${titleVariant}" artist:"${primaryArtist}"`
        : "",
      primaryArtist
        ? `artist:"${primaryArtist}" track:"${titleVariant}"`
        : ""
    ]
  );

  return uniqueSpotifySearchQueries(searchQueries);
}

export async function getTrack(tokenSet: SpotifyTokenSet, trackId: string) {
  return mapTrackObject(
    await spotifyFetch<SpotifyTrackObject>(
      tokenSet,
      `/tracks/${encodeURIComponent(trackId)}`
    ),
    0
  );
}

export async function getTracks(tokenSet: SpotifyTokenSet, trackIds: string[]) {
  const trackObjects = await getTracksByIds(tokenSet, trackIds);
  const tracks: BackupTrack[] = [];

  trackObjects.forEach((track, index) => {
    if (track) {
      tracks.push(mapTrackObject(track, index));
    }
  });

  if (!tracks.length) {
    throw new Error("TrackKeep could not resolve any Spotify songs from that list.");
  }

  return tracks;
}

export async function getAlbum(tokenSet: SpotifyTokenSet, albumId: string) {
  const album = await spotifyFetch<SpotifyAlbumObject>(
    tokenSet,
    `/albums/${encodeURIComponent(albumId)}`
  );

  return mapAlbum(album);
}

export async function getAlbumTracks(
  tokenSet: SpotifyTokenSet,
  albumId: string
) {
  const simplifiedTracks = await getAllPages<SpotifyAlbumTrackObject>(
    tokenSet,
    `/albums/${encodeURIComponent(albumId)}/tracks?limit=50`
  );
  const trackIds = simplifiedTracks
    .map((track) => track.id)
    .filter((id): id is string => Boolean(id));
  const fullTracks = await getTracksByIds(tokenSet, trackIds);
  const fullTrackById = new Map(
    fullTracks
      .filter((track): track is SpotifyTrackObject => Boolean(track?.id))
      .map((track) => [track.id, track])
  );

  return simplifiedTracks.map((track, index) =>
    mapTrackObject(
      track.id ? fullTrackById.get(track.id) ?? track : track,
      index
    )
  );
}

export function buildBackupPayload(
  playlist: PlaylistSummary,
  tracks: BackupTrack[]
) {
  return {
    exportedAt: new Date().toISOString(),
    playlist,
    source: "spotify",
    tracks,
    version: 1
  } satisfies BackupPayload;
}

export type SpotifyItemType = "album" | "playlist" | "track";

export function parseSpotifyItemId(input: string, expectedType: SpotifyItemType) {
  const trimmedInput = input.trim();
  const uriMatch = trimmedInput.match(/^spotify:(album|playlist|track):([A-Za-z0-9]+)$/);

  if (uriMatch) {
    const [, type, id] = uriMatch;

    if (type !== expectedType) {
      throw new Error(`Expected a Spotify ${expectedType}, got ${type}.`);
    }

    return id;
  }

  try {
    const url = new URL(trimmedInput);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const typeIndex = pathSegments.findIndex(
      (segment) => segment === expectedType
    );
    const id = typeIndex >= 0 ? pathSegments[typeIndex + 1] : undefined;

    if (url.hostname.endsWith("spotify.com") && id) {
      return id;
    }
  } catch {
    // Fall through to raw ID parsing.
  }

  if (/^[A-Za-z0-9]{22}$/.test(trimmedInput)) {
    return trimmedInput;
  }

  throw new Error(`Enter a Spotify ${expectedType} URL, URI, or ID.`);
}

export function parseSpotifyTrackIds(input: string) {
  const trackIds: string[] = [];
  const candidates = input
    .split(/[\s,]+/)
    .map((candidate) =>
      candidate.trim().replace(/^[<"'([]+|[>"')\].]+$/g, "")
    )
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      trackIds.push(parseSpotifyItemId(candidate, "track"));
    } catch {
      // Ignore non-track text in pasted CSV or copied playlist snippets.
    }
  }

  if (!trackIds.length) {
    throw new Error("Paste at least one Spotify song URL, URI, or ID.");
  }

  if (trackIds.length > 500) {
    throw new Error("Track lists are limited to 500 Spotify songs at a time.");
  }

  return trackIds;
}

async function spotifyFetch<T>(
  tokenSet: SpotifyTokenSet,
  pathOrUrl: string,
  init: RequestInit = {}
) {
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `${spotifyApiBaseUrl}${pathOrUrl}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${tokenSet.access_token}`);

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers
  });

  if (!response.ok) {
    throw new SpotifyApiError(
      await responseErrorMessage(response),
      response.status,
      url
    );
  }

  return (await response.json()) as T;
}

async function getAllPages<T>(tokenSet: SpotifyTokenSet, path: string) {
  const items: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const page: SpotifyPaging<T> = await spotifyFetch(tokenSet, nextUrl);
    const pageItems = Array.isArray(page.items)
      ? page.items.filter((item): item is T => item !== null)
      : [];

    items.push(...pageItems);
    nextUrl = page.next || null;
  }

  return items;
}

function mapPlaylist(playlist: SpotifyPlaylistObject) {
  const ownerId = playlist.owner?.id;

  return {
    collaborative: Boolean(playlist.collaborative),
    description: playlist.description ?? "",
    externalUrl: playlist.external_urls?.spotify,
    id: playlist.id ?? "",
    imageUrl: firstImageUrl(playlist.images),
    name: playlist.name ?? "Untitled playlist",
    owner: playlist.owner?.display_name || ownerId || "Spotify",
    ownerId,
    public: playlist.public ?? null,
    tracksTotal: playlist.items?.total ?? playlist.tracks?.total ?? 0
  } satisfies PlaylistSummary;
}

async function hydrateMissingPlaylistTotals(
  tokenSet: SpotifyTokenSet,
  playlists: SpotifyPlaylistObject[]
) {
  const missingTrackTotalPlaylists = playlists.filter(
    (playlist): playlist is SpotifyPlaylistObject & { id: string } =>
      Boolean(playlist.id) && !hasPlaylistTrackTotal(playlist)
  );

  if (!missingTrackTotalPlaylists.length) {
    return playlists;
  }

  await appendDiagnosticLog("spotify.playlists.missing_track_totals", {
    count: missingTrackTotalPlaylists.length,
    examples: missingTrackTotalPlaylists.slice(0, 8).map((playlist) => ({
      id: playlist.id,
      name: playlist.name ?? "Untitled playlist",
      itemKeys: playlist.items ? Object.keys(playlist.items) : [],
      trackKeys: playlist.tracks ? Object.keys(playlist.tracks) : []
    }))
  });

  const hydratedEntries = await mapWithConcurrency(
    missingTrackTotalPlaylists,
    5,
    async (playlist) => {
      try {
        return {
          id: playlist.id,
          playlist: await fetchPlaylistSummaryWithTrackTotal(
            tokenSet,
            playlist.id
          )
        };
      } catch (error) {
        await appendDiagnosticLog("spotify.playlists.hydrate_failed", {
          error: diagnosticError(error),
          playlistId: playlist.id,
          playlistName: playlist.name ?? "Untitled playlist"
        });

        return null;
      }
    }
  );
  const hydratedById = new Map(
    hydratedEntries
      .filter(
        (entry): entry is { id: string; playlist: SpotifyPlaylistObject } =>
          Boolean(entry)
      )
      .map((entry) => [entry.id, entry.playlist])
  );

  return playlists.map((playlist) =>
    playlist.id && hydratedById.has(playlist.id)
      ? {
          ...playlist,
          ...hydratedById.get(playlist.id)
        }
      : playlist
  );
}

function hasPlaylistTrackTotal(playlist: SpotifyPlaylistObject) {
  return (
    typeof playlist.items?.total === "number" ||
    typeof playlist.tracks?.total === "number"
  );
}

async function fetchPlaylistSummary(
  tokenSet: SpotifyTokenSet,
  playlistId: string
) {
  return spotifyFetch<SpotifyPlaylistObject>(
    tokenSet,
    `/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent(
      playlistMetadataFields
    )}`
  );
}

async function fetchPlaylistSummaryWithTrackTotal(
  tokenSet: SpotifyTokenSet,
  playlistId: string
) {
  return spotifyFetch<SpotifyPlaylistObject>(
    tokenSet,
    `/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent(
      playlistSummaryFields
    )}`
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    results.push(
      ...(await Promise.all(items.slice(index, index + concurrency).map(mapper)))
    );
  }

  return results;
}

export function spotifyTrackNeedsCatalogResolution(track: SpotifyTrackObject) {
  return spotifyTrackCatalogResolutionReasons(track).length > 0;
}

function spotifyTrackCatalogResolutionReasons(track: SpotifyTrackObject) {
  const reasons: string[] = [];

  if (isExplicitLocalSpotifyTrack(track)) {
    reasons.push("local-track");
  }

  if (!track.id) {
    reasons.push("missing-catalog-id");
  }

  if (hasProviderPollutedSpotifyMetadata(track)) {
    reasons.push("provider-polluted-metadata");
  }

  return reasons;
}

function isExplicitLocalSpotifyTrack(track: SpotifyTrackObject) {
  return track.is_local === true || track.uri?.startsWith("spotify:local:");
}

function isCatalogSpotifyTrack(
  track: SpotifyTrackObject
): track is SpotifyTrackObject & { id: string; name: string } {
  return Boolean(track.id && track.name && !isExplicitLocalSpotifyTrack(track));
}

function hasProviderPollutedSpotifyMetadata(track: SpotifyTrackObject) {
  const albumKey = normalizeSpotifyMetadataKey(track.album?.name ?? "");

  return (
    albumKey.includes("clipconverter") ||
    albumKey.includes("youtube") ||
    albumKey.includes("ytmp3") ||
    albumKey.includes("y2mate") ||
    albumKey.includes("soundcloud") ||
    /\bvideo\s+clip\b/i.test(track.name ?? "")
  );
}

function isConfidentSpotifyTrackSearchMatch(match: SpotifyTrackSearchMatch) {
  const durationDeltaMs = match.score.durationDeltaMs;

  return (
    match.score.overall >= 82 &&
    match.score.titleScore >= 72 &&
    match.score.artistScore >= 55 &&
    (typeof durationDeltaMs !== "number" || durationDeltaMs <= 45_000)
  );
}

function compareCandidateScores(
  left: SpotifyTrackSearchMatch["score"],
  right: SpotifyTrackSearchMatch["score"]
) {
  return (
    right.overall - left.overall ||
    right.titleScore - left.titleScore ||
    right.artistScore - left.artistScore ||
    (left.durationDeltaMs ?? Number.MAX_SAFE_INTEGER) -
      (right.durationDeltaMs ?? Number.MAX_SAFE_INTEGER)
  );
}

function compareSpotifyTrackSearchMatches(
  left: SpotifyTrackSearchMatch,
  right: SpotifyTrackSearchMatch
) {
  return (
    right.score.overall - left.score.overall ||
    right.score.titleScore - left.score.titleScore ||
    right.score.artistScore - left.score.artistScore ||
    durationDeltaForSort(left) - durationDeltaForSort(right)
  );
}

function durationDeltaForSort(match: SpotifyTrackSearchMatch) {
  return match.score.durationDeltaMs ?? Number.MAX_SAFE_INTEGER;
}

function uniqueSpotifyTracks(candidates: SpotifyTrackObject[]) {
  const seen = new Set<string>();
  const uniqueCandidates: SpotifyTrackObject[] = [];

  for (const candidate of candidates) {
    const key = spotifyTrackIdentity(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function spotifyTrackIdentity(track: SpotifyTrackObject) {
  return (
    track.id ||
    track.uri ||
    [
      normalizeSpotifySearchValue(track.name ?? "").toLowerCase(),
      spotifyTrackArtistNames(track)
        .map((artist) => artist.toLowerCase())
        .join("|"),
      track.duration_ms ?? ""
    ].join("::")
  );
}

function spotifyTrackArtistNames(track: SpotifyTrackObject) {
  return (track.artists ?? [])
    .map((artist) => artist.name.trim())
    .filter(Boolean);
}

function spotifyCatalogRecoveryTitleVariants(track: SpotifyTrackObject) {
  const title = normalizeSpotifySearchValue(track.name ?? "");
  const cleanedTitle = normalizeSpotifySearchValue(
    stripLocalTrackTitleNoise(title)
  );
  const fallbackTitle = spotifySanitizedLocalTrackTitle(track);

  return spotifyTitleSearchVariants(fallbackTitle || cleanedTitle || title);
}

function spotifySanitizedLocalTrackTitle(track: SpotifyTrackObject) {
  const title = normalizeSpotifySearchValue(
    stripLocalTrackTitleNoise(track.name ?? "")
  );

  if (!title) {
    return track.name;
  }

  if (!hasProviderPollutedSpotifyMetadata(track)) {
    return title;
  }

  return stripTrailingTitleQualifiers(title) || title;
}

function spotifyTitleSearchVariants(value: string | undefined) {
  const normalizedValue = normalizeSpotifySearchValue(value);
  const plainValue = normalizeSpotifySearchValue(
    normalizedValue.replace(/[()[\]{}]/g, " ")
  );
  const baseValues = uniqueSpotifySearchValues([normalizedValue, plainValue]);
  const variants: string[] = [];

  for (const baseValue of baseValues) {
    variants.push(baseValue);

    for (const spellingVariant of spotifyTitleSpellingVariants(baseValue)) {
      variants.push(spellingVariant);
    }
  }

  return uniqueSpotifySearchValues(variants);
}

function isProviderPollutedRecoveryVariant(
  localTrack: SpotifyTrackObject,
  candidate: SpotifyTrackObject
) {
  return (
    hasProviderPollutedSpotifyMetadata(localTrack) &&
    hasTrailingTitleQualifier(candidate.name ?? "")
  );
}

function hasTrailingTitleQualifier(value: string) {
  const normalizedValue = normalizeSpotifySearchValue(value);

  return Boolean(normalizedValue) &&
    stripTrailingTitleQualifiers(normalizedValue) !== normalizedValue;
}

function stripTrailingTitleQualifiers(value: string) {
  let strippedValue = value;

  for (;;) {
    const nextValue = strippedValue
      .replace(
        /\s*[\[(]\s*[^()[\]{}]*(?:audio|clip|edit|live|mix|remaster(?:ed)?|remix|version|video|visualizer)[^()[\]{}]*[\])]\s*$/i,
        ""
      )
      .replace(
        /\s+[-\u2013\u2014]\s*[^-\u2013\u2014]*(?:audio|clip|edit|live|mix|remaster(?:ed)?|remix|version|video|visualizer)[^-]*$/i,
        ""
      )
      .trim();

    if (nextValue === strippedValue) {
      return strippedValue;
    }

    strippedValue = nextValue;
  }
}

function spotifyTitleSpellingVariants(value: string) {
  const variants: string[] = [];
  const youToU = value.replace(/\byou\b/gi, "U");
  const uToYou = value.replace(/\bu\b/gi, "You");

  if (youToU !== value) {
    variants.push(youToU);
  }

  if (uToYou !== value) {
    variants.push(uToYou);
  }

  return variants;
}

function uniqueSpotifySearchValues(values: string[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalizedValue = normalizeSpotifySearchValue(value);
    const key = normalizedValue.toLowerCase();

    if (!normalizedValue || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

function uniqueSpotifySearchQueries(queries: string[]) {
  const seen = new Set<string>();
  const uniqueQueries: string[] = [];

  for (const query of queries) {
    const normalizedQuery = normalizeSpotifySearchValue(query);
    const key = normalizedQuery.toLowerCase();

    if (!normalizedQuery || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueQueries.push(normalizedQuery);
  }

  return uniqueQueries;
}

function stripLocalTrackTitleNoise(value: string) {
  return value
    .replace(
      /\s*[\[(]\s*(?:official\s+)?(?:(?:music|lyric)\s+)?(?:video\s+clip|video|audio|lyrics?|visualizer|clip)\s*[\])]\s*/gi,
      " "
    )
    .replace(
      /\b(?:video\s+clip|official\s+video|music\s+video|official\s+audio)\b/gi,
      " "
    );
}

function normalizeSpotifySearchValue(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSpotifyMetadataKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mapAlbum(album: SpotifyAlbumObject) {
  const artists = album.artists ?? [];

  return {
    albumType: album.album_type,
    artists: artists.map((artist) => artist.name),
    artistIds: artists
      .map((artist) => artist.id)
      .filter((id): id is string => Boolean(id)),
    externalUrl: album.external_urls?.spotify,
    id: album.id ?? "",
    imageUrl: firstImageUrl(album.images),
    name: album.name ?? "Unknown album",
    releaseDate: album.release_date,
    tracksTotal: album.total_tracks ?? album.tracks?.total ?? 0
  } satisfies AlbumSummary;
}

function mapTrackObject(
  track: SpotifyTrackObject | SpotifyAlbumTrackObject | null | undefined,
  index: number,
  addedAt?: string,
  metadataStatus: BackupTrackMetadataStatus = "spotify",
  metadataWarning?: string
) {
  const fullTrack = track as SpotifyTrackObject | null | undefined;
  const album = fullTrack?.album;
  const artists = track?.artists ?? [];
  const albumArtists = album?.artists ?? artists;
  const albumArtistNames = albumArtists.map((artist) => artist.name);
  const fallbackArtistName = artists[0]?.name ?? "Unknown Artist";

  return {
    addedAt,
    album: album?.name ?? "Unknown Album",
    albumArtist: albumArtistNames.join(", ") || fallbackArtistName,
    albumArtistIds: albumArtists
      .map((artist) => artist.id)
      .filter((id): id is string => Boolean(id)),
    albumId: album?.id,
    albumImageUrl: firstImageUrl(album?.images),
    albumReleaseDate: album?.release_date,
    albumTracksTotal: album?.total_tracks,
    albumType: album?.album_type,
    artists: artists.map((artist) => artist.name),
    artistIds: artists
      .map((artist) => artist.id)
      .filter((id): id is string => Boolean(id)),
    discNumber: track?.disc_number,
    durationMs: track?.duration_ms ?? 0,
    explicit: Boolean(track?.explicit),
    id: track?.id,
    isrc: fullTrack?.external_ids?.isrc,
    metadataStatus,
    metadataWarning,
    name: track?.name ?? "Unknown track",
    position: index + 1,
    spotifyUri: track?.uri,
    spotifyUrl: track?.external_urls?.spotify,
    trackNumber: track?.track_number
  } satisfies BackupTrack;
}

async function getTracksByIds(tokenSet: SpotifyTokenSet, trackIds: string[]) {
  return mapWithConcurrency(trackIds, 8, async (trackId) => {
    try {
      return await spotifyFetch<SpotifyTrackObject>(
        tokenSet,
        `/tracks/${encodeURIComponent(trackId)}`
      );
    } catch (error) {
      await appendDiagnosticLog("spotify.track.fetch_failed", {
        error: diagnosticError(error),
        trackId
      });

      return null;
    }
  });
}

function firstImageUrl(images?: SpotifyImage[]) {
  return images?.[0]?.url;
}

function tokenSetFromResponse(
  tokenResponse: SpotifyTokenResponse,
  refreshTokenFallback?: string
) {
  return {
    access_token: tokenResponse.access_token,
    expires_at: Date.now() + tokenResponse.expires_in * 1000,
    refresh_token: tokenResponse.refresh_token ?? refreshTokenFallback,
    scope: tokenResponse.scope,
    token_type: tokenResponse.token_type
  } satisfies SpotifyTokenSet;
}

async function responseErrorMessage(response: Response) {
  const text = await response.text();

  try {
    const body = JSON.parse(text) as {
      error?: { message?: string };
      error_description?: string;
    };

    return (
      body.error?.message ||
      body.error_description ||
      `Spotify request failed with ${response.status}.`
    );
  } catch {
    return text || `Spotify request failed with ${response.status}.`;
  }
}

class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

function isSpotifyApiStatus(error: unknown, status: number) {
  return error instanceof SpotifyApiError && error.status === status;
}
