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
  items: T[];
  next: string | null;
  total: number;
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

type SpotifyPlaylistObject = {
  collaborative: boolean;
  description?: string;
  external_urls?: SpotifyExternalUrls;
  id: string;
  images?: SpotifyImage[];
  name: string;
  owner?: {
    display_name?: string;
    id?: string;
  };
  public: boolean | null;
  tracks: {
    total: number;
  };
};

type SpotifyPlaylistTrackItem = {
  added_at?: string;
  track?: {
    album?: {
      id?: string;
      images?: SpotifyImage[];
      name?: string;
      release_date?: string;
    };
    artists?: SpotifyArtist[];
    duration_ms?: number;
    explicit?: boolean;
    external_ids?: {
      isrc?: string;
    };
    external_urls?: SpotifyExternalUrls;
    id?: string;
    name?: string;
    type?: string;
    uri?: string;
  } | null;
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
  public: boolean | null;
  tracksTotal: number;
};

export type BackupTrack = {
  addedAt?: string;
  album: string;
  albumId?: string;
  artists: string[];
  artistIds: string[];
  durationMs: number;
  explicit: boolean;
  id?: string;
  isrc?: string;
  name: string;
  position: number;
  spotifyUri?: string;
  spotifyUrl?: string;
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

export function getSpotifyClientId() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    throw new Error("Missing SPOTIFY_CLIENT_ID.");
  }

  return clientId;
}

export function getAppBaseUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  return new URL(request.url).origin;
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
    throw new Error(await responseErrorMessage(response));
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
    throw new Error(await responseErrorMessage(response));
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
    "/me/playlists?limit=50"
  );

  return playlists.map(mapPlaylist);
}

export async function getPlaylist(tokenSet: SpotifyTokenSet, playlistId: string) {
  const fields = [
    "collaborative",
    "description",
    "external_urls",
    "id",
    "images",
    "name",
    "owner(display_name,id)",
    "public",
    "tracks(total)"
  ].join(",");

  return mapPlaylist(
    await spotifyFetch<SpotifyPlaylistObject>(
      tokenSet,
      `/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent(
        fields
      )}`
    )
  );
}

export async function getPlaylistTracks(
  tokenSet: SpotifyTokenSet,
  playlistId: string
) {
  const fields = [
    "items(added_at,track(id,name,type,uri,duration_ms,explicit,external_ids(isrc),external_urls(spotify),album(id,name,release_date,images),artists(id,name)))",
    "next",
    "total"
  ].join(",");

  const items = await getAllPages<SpotifyPlaylistTrackItem>(
    tokenSet,
    `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50&fields=${encodeURIComponent(
      fields
    )}`
  );

  return items
    .filter((item) => item.track?.type === "track")
    .map((item, index) => {
      const track = item.track;

      return {
        addedAt: item.added_at,
        album: track?.album?.name ?? "",
        albumId: track?.album?.id,
        artists: track?.artists?.map((artist) => artist.name) ?? [],
        artistIds:
          track?.artists
            ?.map((artist) => artist.id)
            .filter((id): id is string => Boolean(id)) ?? [],
        durationMs: track?.duration_ms ?? 0,
        explicit: Boolean(track?.explicit),
        id: track?.id,
        isrc: track?.external_ids?.isrc,
        name: track?.name ?? "Unknown track",
        position: index + 1,
        spotifyUri: track?.uri,
        spotifyUrl: track?.external_urls?.spotify
      } satisfies BackupTrack;
    });
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

export function backupFilename(playlist: PlaylistSummary, extension: string) {
  const slug =
    playlist.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "spotify-playlist";

  return `${slug}.${extension}`;
}

export function backupTracksToCsv(
  playlist: PlaylistSummary,
  tracks: BackupTrack[]
) {
  const rows = [
    [
      "playlist_id",
      "playlist_name",
      "position",
      "track_id",
      "track_name",
      "artists",
      "album",
      "duration_ms",
      "isrc",
      "spotify_uri",
      "spotify_url",
      "added_at",
      "explicit"
    ],
    ...tracks.map((track) => [
      playlist.id,
      playlist.name,
      String(track.position),
      track.id ?? "",
      track.name,
      track.artists.join("; "),
      track.album,
      String(track.durationMs),
      track.isrc ?? "",
      track.spotifyUri ?? "",
      track.spotifyUrl ?? "",
      track.addedAt ?? "",
      String(track.explicit)
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
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
    throw new Error(await responseErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function getAllPages<T>(tokenSet: SpotifyTokenSet, path: string) {
  const items: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const page: SpotifyPaging<T> = await spotifyFetch(tokenSet, nextUrl);
    items.push(...page.items);
    nextUrl = page.next;
  }

  return items;
}

function mapPlaylist(playlist: SpotifyPlaylistObject) {
  return {
    collaborative: playlist.collaborative,
    description: playlist.description ?? "",
    externalUrl: playlist.external_urls?.spotify,
    id: playlist.id,
    imageUrl: firstImageUrl(playlist.images),
    name: playlist.name,
    owner: playlist.owner?.display_name || playlist.owner?.id || "Spotify",
    public: playlist.public,
    tracksTotal: playlist.tracks.total
  } satisfies PlaylistSummary;
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

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
