import { randomBytes } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  matchMusicLibraryTracks,
  type MusicLibraryIndexedTrack,
  type MusicLibraryPlaylistSyncMode,
  type MusicLibraryPlaylistSyncResult
} from "./music-library";
import {
  isUnresolvedSpotifyLocalBackupTrack,
  unresolvedSpotifyLocalTrackMessage,
  type BackupTrack,
  type PlaylistSummary
} from "./spotify";

export type PlexMusicLibrary = {
  key: string;
  title: string;
};

export type PlexSettings = {
  enabled: boolean;
  musicLibraryKey: string;
  musicLibraryTitle?: string;
  serverUrl: string;
  token: string;
};

export type PlexSettingsUpdate = {
  enabled?: boolean;
  musicLibraryKey?: unknown;
  serverUrl?: unknown;
  token?: unknown;
};

export type PlexStatus = {
  configured: boolean;
  libraries: PlexMusicLibrary[];
  message: string;
  musicLibraryKey?: string;
  musicLibraryTitle?: string;
  serverUrl: string;
  state: "auth_failed" | "disabled" | "error" | "not_configured" | "ready";
};

export type PublicPlexSettings = {
  enabled: boolean;
  libraries: PlexMusicLibrary[];
  musicLibraryKey: string;
  musicLibraryTitle?: string;
  serverUrl: string;
  status: PlexStatus;
  tokenConfigured: boolean;
};

type PlexPlaylistArtworkSyncResult = Pick<
  MusicLibraryPlaylistSyncResult,
  "artworkError" | "artworkUpdated"
>;

type StoredPlexSettings = PlexSettings & {
  updatedAt: string;
  version: 1;
};

type PlexRootResponse = {
  MediaContainer?: {
    friendlyName?: string;
    machineIdentifier?: string;
  };
};

type PlexLibrarySectionsResponse = {
  MediaContainer?: {
    Directory?: PlexLibraryDirectory[] | PlexLibraryDirectory;
  };
};

type PlexLibraryDirectory = {
  key?: string | number;
  title?: string;
  type?: string;
};

type PlexMetadataResponse = {
  MediaContainer?: {
    Hub?: PlexHub[] | PlexHub;
    Metadata?: PlexMetadataItem[] | PlexMetadataItem;
  };
};

type PlexHub = {
  Metadata?: PlexMetadataItem[] | PlexMetadataItem;
};

type PlexMetadataItem = {
  Media?: PlexMedia[] | PlexMedia;
  duration?: number;
  grandparentTitle?: string;
  key?: string;
  leafCount?: number;
  parentTitle?: string;
  playlistItemID?: number | string;
  playlistType?: string;
  ratingKey?: number | string;
  smart?: boolean | number;
  title?: string;
  type?: string;
};

type PlexMedia = {
  Part?: PlexPart[] | PlexPart;
};

type PlexPart = {
  accessible?: boolean | number | string;
  exists?: boolean | number | string;
  file?: string;
};

class PlexApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const defaultPlexServerUrl = "http://localhost:32400";
const plexProduct = "SpotifyBU";
const plexVersion = "1.0";
const plexClientIdentifier = "spotifybu";
const plexLibraryIdentifier = "com.plexapp.plugins.library";
const plexTrackType = "10";
const plexPlaylistType = "15";
const plexRequestTimeoutMs = 15000;
const plexTrackSearchLimit = "25";
const plexRatingKeyChunkSize = 150;

export async function getPublicPlexSettings() {
  const settings = await loadPlexSettings();
  const status = await getPlexStatus(settings);

  return publicPlexSettings(settings, status);
}

export async function updatePlexSettings(update: PlexSettingsUpdate) {
  const current = await loadPlexSettings();
  let next = normalizePlexSettings(current, update);
  let status: PlexStatus | null = null;

  if (next.enabled) {
    if (!next.token) {
      throw new Error("Enter a Plex X-Plex-Token before enabling Plex sync.");
    }

    status = await getPlexStatus(next);

    if (status.state !== "ready") {
      throw new Error(status.message);
    }

    next = {
      ...next,
      musicLibraryKey: status.musicLibraryKey ?? next.musicLibraryKey,
      musicLibraryTitle: status.musicLibraryTitle
    };
  }

  await savePlexSettings(next);

  return publicPlexSettings(next, status ?? (await getPlexStatus(next)));
}

export async function getPlexStatus(
  settings?: PlexSettings
): Promise<PlexStatus> {
  const activeSettings = settings ?? (await loadPlexSettings());

  if (!activeSettings.enabled) {
    return {
      configured: false,
      libraries: [],
      message: "Plex sync is disabled.",
      serverUrl: activeSettings.serverUrl,
      state: "disabled"
    };
  }

  if (!activeSettings.serverUrl || !activeSettings.token) {
    return {
      configured: false,
      libraries: [],
      message: "Enter a Plex server URL and X-Plex-Token.",
      serverUrl: activeSettings.serverUrl,
      state: "not_configured"
    };
  }

  try {
    await getPlexServerIdentity(activeSettings);
    const libraries = await getPlexMusicLibraries(activeSettings);

    if (!libraries.length) {
      return {
        configured: true,
        libraries,
        message: "Connected to Plex, but no music libraries were found.",
        serverUrl: activeSettings.serverUrl,
        state: "error"
      };
    }

    const selectedLibrary =
      libraries.find((library) => library.key === activeSettings.musicLibraryKey) ??
      libraries[0];

    if (
      activeSettings.musicLibraryKey &&
      selectedLibrary.key !== activeSettings.musicLibraryKey
    ) {
      return {
        configured: true,
        libraries,
        message: "The selected Plex music library was not found.",
        musicLibraryKey: activeSettings.musicLibraryKey,
        serverUrl: activeSettings.serverUrl,
        state: "error"
      };
    }

    return {
      configured: true,
      libraries,
      message: `Connected to Plex music library "${selectedLibrary.title}".`,
      musicLibraryKey: selectedLibrary.key,
      musicLibraryTitle: selectedLibrary.title,
      serverUrl: activeSettings.serverUrl,
      state: "ready"
    };
  } catch (error) {
    return {
      configured: true,
      libraries: [],
      message: errorMessage(error),
      serverUrl: activeSettings.serverUrl,
      state: isPlexAuthError(error) ? "auth_failed" : "error"
    };
  }
}

export async function createOrUpdatePlexPlaylistFromSpotify(
  playlist: PlaylistSummary,
  tracks: BackupTrack[],
  options: {
    mode?: MusicLibraryPlaylistSyncMode;
  } = {}
): Promise<MusicLibraryPlaylistSyncResult> {
  if (!tracks.length) {
    throw new Error("Load Spotify playlist tracks before syncing a Plex playlist.");
  }

  const settings = await loadPlexSettings();

  if (!settings.enabled) {
    throw new Error("Enable Plex sync in settings before syncing playlists.");
  }

  const status = await getPlexStatus(settings);

  if (status.state !== "ready" || !status.musicLibraryKey) {
    throw new Error(status.message);
  }

  const server = await getPlexServerIdentity(settings);
  const mode = normalizePlaylistSyncMode(options.mode);
  const matches = await matchMusicLibraryTracks(tracks);
  const ratingKeys: string[] = [];
  const skipped: MusicLibraryPlaylistSyncResult["skipped"] = [];

  await requestPlexMusicLibraryScan(settings, status.musicLibraryKey).catch(
    () => undefined
  );

  for (const track of tracks) {
    if (isUnresolvedSpotifyLocalBackupTrack(track)) {
      skipped.push({
        reason: track.metadataWarning ?? unresolvedSpotifyLocalTrackMessage,
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    const match = matches.find(
      (candidate) => candidate.trackPosition === track.position
    );

    if (!match?.matchedTrack) {
      skipped.push({
        reason: "Track is not backed up in the local music folder.",
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    const plexTrack = await resolvePlexTrack(
      settings,
      status.musicLibraryKey,
      track,
      match.matchedTrack
    );

    if (!plexTrack?.ratingKey) {
      skipped.push({
        reason:
          "Matched file was not found in Plex. Scan the Plex music library and try again.",
        trackName: track.name,
        trackPosition: track.position
      });
      continue;
    }

    ratingKeys.push(String(plexTrack.ratingKey));
  }

  if (!ratingKeys.length) {
    throw new Error(
      "No backed-up tracks could be resolved to Plex tracks. Scan SpotifyBU and Plex first."
    );
  }

  const name = musicLibraryPlaylistName(playlist);
  const existingPlaylist = await findPlexPlaylistByName(settings, name);
  const existingItems =
    (mode === "append" || mode === "fullsync" || existingPlaylist) &&
    existingPlaylist?.ratingKey
      ? await getPlexPlaylistItems(settings, existingPlaylist.ratingKey)
      : [];
  const existingRatingKeys = existingItems
    .map((item) => item.ratingKey)
    .filter((ratingKey): ratingKey is string | number => Boolean(ratingKey))
    .map(String);
  const existingRatingKeySet = new Set(existingRatingKeys);
  const appendRatingKeys =
    mode === "append"
      ? ratingKeys.filter((ratingKey) => !existingRatingKeySet.has(ratingKey))
      : ratingKeys;

  if (mode === "fullsync" && existingPlaylist?.ratingKey) {
    const addedCount = countPlaylistItemsAdded(existingRatingKeys, ratingKeys);
    const removedCount = countPlaylistItemsRemoved(existingRatingKeys, ratingKeys);

    if (!orderedRatingKeysEqual(existingRatingKeys, ratingKeys)) {
      await replacePlexPlaylistItems(
        settings,
        existingPlaylist.ratingKey,
        server.machineIdentifier,
        ratingKeys
      );
    }

    const updatedPlaylist =
      (await getPlexPlaylist(settings, existingPlaylist.ratingKey)) ??
      existingPlaylist;
    const artwork = await syncPlexPlaylistArtwork(
      settings,
      playlist,
      updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey
    );

    return {
      addedCount,
      ...artwork,
      matchedCount: ratingKeys.length,
      mode,
      name: updatedPlaylist.title ?? name,
      playlistId: String(updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey),
      removedCount,
      skipped,
      skippedCount: skipped.length,
      songCount:
        typeof updatedPlaylist.leafCount === "number"
          ? updatedPlaylist.leafCount
          : ratingKeys.length,
      updated: true
    };
  }

  if (mode === "append" && existingPlaylist?.ratingKey) {
    await addPlexPlaylistItems(
      settings,
      existingPlaylist.ratingKey,
      server.machineIdentifier,
      appendRatingKeys
    );

    const updatedPlaylist =
      (await getPlexPlaylist(settings, existingPlaylist.ratingKey)) ??
      existingPlaylist;
    const artwork = await syncPlexPlaylistArtwork(
      settings,
      playlist,
      updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey
    );

    return {
      appendedCount: appendRatingKeys.length,
      ...artwork,
      matchedCount: ratingKeys.length,
      mode,
      name: updatedPlaylist.title ?? name,
      playlistId: String(updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey),
      skipped,
      skippedCount: skipped.length,
      songCount:
        typeof updatedPlaylist.leafCount === "number"
          ? updatedPlaylist.leafCount
          : existingRatingKeys.length + appendRatingKeys.length,
      updated: true
    };
  }

  if (existingPlaylist?.ratingKey) {
    await replacePlexPlaylistItems(
      settings,
      existingPlaylist.ratingKey,
      server.machineIdentifier,
      ratingKeys
    );
    const updatedPlaylist =
      (await getPlexPlaylist(settings, existingPlaylist.ratingKey)) ??
      existingPlaylist;
    const artwork = await syncPlexPlaylistArtwork(
      settings,
      playlist,
      updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey
    );

    return {
      ...artwork,
      matchedCount: ratingKeys.length,
      mode,
      name: updatedPlaylist.title ?? name,
      playlistId: String(updatedPlaylist.ratingKey ?? existingPlaylist.ratingKey),
      skipped,
      skippedCount: skipped.length,
      songCount:
        typeof updatedPlaylist.leafCount === "number"
          ? updatedPlaylist.leafCount
          : ratingKeys.length,
      updated: true
    };
  }

  const createdPlaylist = await createPlexPlaylist(
    settings,
    name,
    server.machineIdentifier,
    ratingKeys
  );

  if (!createdPlaylist?.ratingKey) {
    throw new Error("Plex created the playlist but did not return its id.");
  }

  const updatedPlaylist =
    (await getPlexPlaylist(settings, createdPlaylist.ratingKey)) ??
    createdPlaylist;
  const artwork = await syncPlexPlaylistArtwork(
    settings,
    playlist,
    updatedPlaylist.ratingKey ?? createdPlaylist.ratingKey
  );

  return {
    addedCount: mode === "fullsync" ? ratingKeys.length : undefined,
    appendedCount: mode === "append" ? appendRatingKeys.length : undefined,
    ...artwork,
    matchedCount: ratingKeys.length,
    mode,
    name: updatedPlaylist.title ?? name,
    playlistId: String(updatedPlaylist.ratingKey ?? createdPlaylist.ratingKey),
    removedCount: mode === "fullsync" ? 0 : undefined,
    skipped,
    skippedCount: skipped.length,
    songCount:
      typeof updatedPlaylist.leafCount === "number"
        ? updatedPlaylist.leafCount
        : ratingKeys.length,
    updated: false
  };
}

async function loadPlexSettings(): Promise<PlexSettings> {
  try {
    const contents = await readFile(getPlexSettingsPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredPlexSettings>;

    if (parsed.version !== 1) {
      throw new Error("Invalid Plex settings file.");
    }

    return normalizePlexSettings(environmentPlexSettings(), parsed);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return environmentPlexSettings();
    }

    throw error;
  }
}

function environmentPlexSettings(): PlexSettings {
  const token = firstConfiguredRawEnvironmentValue("PLEX_TOKEN");
  const serverUrl =
    firstConfiguredEnvironmentValue("PLEX_SERVER_URL", "PLEX_URL") ??
    defaultPlexServerUrl;
  const musicLibraryKey =
    firstConfiguredEnvironmentValue(
      "PLEX_MUSIC_LIBRARY_KEY",
      "PLEX_LIBRARY_KEY"
    ) ?? "";

  return {
    enabled: Boolean(token),
    musicLibraryKey,
    serverUrl: normalizePlexServerUrl(serverUrl),
    token: token ?? ""
  };
}

function normalizePlexSettings(
  fallback: PlexSettings,
  update: PlexSettingsUpdate | Partial<StoredPlexSettings>
): PlexSettings {
  const nextServerUrl =
    typeof update.serverUrl === "string" && update.serverUrl.trim()
      ? normalizePlexServerUrl(update.serverUrl)
      : fallback.serverUrl;
  const nextToken =
    typeof update.token === "string" && update.token.trim()
      ? update.token.trim()
      : fallback.token;

  return {
    enabled:
      typeof update.enabled === "boolean" ? update.enabled : fallback.enabled,
    musicLibraryKey:
      typeof update.musicLibraryKey === "string"
        ? update.musicLibraryKey.trim()
        : fallback.musicLibraryKey,
    musicLibraryTitle:
      typeof (update as Partial<StoredPlexSettings>).musicLibraryTitle === "string"
        ? (update as Partial<StoredPlexSettings>).musicLibraryTitle
        : fallback.musicLibraryTitle,
    serverUrl: nextServerUrl,
    token: nextToken
  };
}

function normalizePlexServerUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Plex server URL must include http:// or https://.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Plex server URL must use http:// or https://.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

async function savePlexSettings(settings: PlexSettings) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });

  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies StoredPlexSettings;
  const settingsPath = getPlexSettingsPath();
  const temporaryPath = `${settingsPath}.${randomBytes(4).toString("hex")}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function publicPlexSettings(
  settings: PlexSettings,
  status: PlexStatus
): PublicPlexSettings {
  return {
    enabled: settings.enabled,
    libraries: status.libraries,
    musicLibraryKey:
      settings.musicLibraryKey || status.musicLibraryKey || "",
    musicLibraryTitle: status.musicLibraryTitle ?? settings.musicLibraryTitle,
    serverUrl: settings.serverUrl,
    status,
    tokenConfigured: Boolean(settings.token)
  };
}

async function getPlexServerIdentity(settings: PlexSettings) {
  const response = await plexApiRequest<PlexRootResponse>(settings, "/", {
    method: "GET"
  });
  const machineIdentifier = response.MediaContainer?.machineIdentifier;

  if (!machineIdentifier) {
    throw new Error("Plex server did not return a machine identifier.");
  }

  return {
    friendlyName: response.MediaContainer?.friendlyName,
    machineIdentifier
  };
}

async function getPlexMusicLibraries(settings: PlexSettings) {
  const response = await plexApiRequest<PlexLibrarySectionsResponse>(
    settings,
    "/library/sections/all",
    {
      method: "GET"
    }
  ).catch(async (error) => {
    if (error instanceof PlexApiError && error.status === 404) {
      return plexApiRequest<PlexLibrarySectionsResponse>(
        settings,
        "/library/sections",
        {
          method: "GET"
        }
      );
    }

    throw error;
  });

  return arrayFrom(response.MediaContainer?.Directory)
    .filter((library) => library.type === "artist")
    .map((library) => ({
      key: String(library.key ?? ""),
      title: library.title?.trim() || `Music library ${library.key ?? ""}`
    }))
    .filter((library) => library.key);
}

async function findPlexPlaylistByName(settings: PlexSettings, name: string) {
  const response = await plexApiRequest<PlexMetadataResponse>(
    settings,
    "/playlists",
    {
      method: "GET",
      query: {
        playlistType: "audio",
        type: plexPlaylistType
      }
    }
  );
  const nameKey = normalizeText(name);

  return plexMetadataItems(response).find(
    (playlist) =>
      playlist.playlistType === "audio" &&
      normalizeText(playlist.title) === nameKey
  );
}

async function getPlexPlaylist(
  settings: PlexSettings,
  playlistId: string | number
) {
  const response = await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/playlists/${encodeURIComponent(String(playlistId))}`,
    {
      method: "GET"
    }
  );

  return plexMetadataItems(response)[0] ?? null;
}

async function getPlexPlaylistItems(
  settings: PlexSettings,
  playlistId: string | number
) {
  const response = await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/playlists/${encodeURIComponent(String(playlistId))}/items`,
    {
      method: "GET",
      query: {
        type: plexTrackType
      }
    }
  );

  return plexMetadataItems(response);
}

async function createPlexPlaylist(
  settings: PlexSettings,
  name: string,
  machineIdentifier: string,
  ratingKeys: string[]
) {
  const response = await plexApiRequest<PlexMetadataResponse>(
    settings,
    "/playlists",
    {
      method: "POST",
      query: {
        smart: "0",
        title: name,
        type: "audio",
        uri: plexLibraryMetadataUri(machineIdentifier, ratingKeys)
      }
    }
  );

  return plexMetadataItems(response)[0] ?? null;
}

async function replacePlexPlaylistItems(
  settings: PlexSettings,
  playlistId: string | number,
  machineIdentifier: string,
  ratingKeys: string[]
) {
  await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/playlists/${encodeURIComponent(String(playlistId))}/items`,
    {
      method: "DELETE"
    }
  );
  await addPlexPlaylistItems(settings, playlistId, machineIdentifier, ratingKeys);
}

async function addPlexPlaylistItems(
  settings: PlexSettings,
  playlistId: string | number,
  machineIdentifier: string,
  ratingKeys: string[]
) {
  for (const chunk of chunkArray(ratingKeys, plexRatingKeyChunkSize)) {
    if (!chunk.length) {
      continue;
    }

    await plexApiRequest<PlexMetadataResponse>(
      settings,
      `/playlists/${encodeURIComponent(String(playlistId))}/items`,
      {
        method: "PUT",
        query: {
          uri: plexLibraryMetadataUri(machineIdentifier, chunk)
        }
      }
    );
  }
}

async function syncPlexPlaylistArtwork(
  settings: PlexSettings,
  playlist: PlaylistSummary,
  playlistId: string | number | undefined
): Promise<PlexPlaylistArtworkSyncResult> {
  const artworkUrl = normalizePlexArtworkUrl(playlist.imageUrl);

  if (!playlistId || !artworkUrl) {
    return {};
  }

  try {
    await updatePlexPlaylistPoster(settings, playlistId, artworkUrl);

    return {
      artworkUpdated: true
    };
  } catch (error) {
    return {
      artworkError: errorMessage(error),
      artworkUpdated: false
    };
  }
}

async function updatePlexPlaylistPoster(
  settings: PlexSettings,
  playlistId: string | number,
  artworkUrl: string
) {
  await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/library/metadata/${encodeURIComponent(String(playlistId))}/posters`,
    {
      method: "POST",
      parseJson: false,
      query: {
        url: artworkUrl
      }
    }
  );
}

async function resolvePlexTrack(
  settings: PlexSettings,
  musicLibraryKey: string,
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack
) {
  const candidates = new Map<string, PlexMetadataItem>();
  const queries = Array.from(
    new Set(
      [
        [track.name, track.artists[0]].filter(Boolean).join(" "),
        [matchedTrack.title, matchedTrack.artist].filter(Boolean).join(" "),
        track.name,
        matchedTrack.title,
        path.posix.parse(matchedTrack.relativePath).name
      ]
        .map((query) => query.trim())
        .filter(Boolean)
    )
  );

  for (const query of queries) {
    for (const candidate of await searchPlexLibraryTracks(
      settings,
      musicLibraryKey,
      query
    )) {
      const ratingKey = candidate.ratingKey;

      if (ratingKey) {
        candidates.set(String(ratingKey), candidate);
      }
    }
  }

  let bestMatch: { score: number; track: PlexMetadataItem } | null = null;

  for (const candidate of candidates.values()) {
    const playableCandidate = await playablePlexTrackCandidate(
      settings,
      candidate,
      matchedTrack
    );

    if (!playableCandidate) {
      continue;
    }

    const score = scorePlexTrackCandidate(track, matchedTrack, playableCandidate);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        track: playableCandidate
      };
    }
  }

  return bestMatch && bestMatch.score >= 60 ? bestMatch.track : null;
}

async function playablePlexTrackCandidate(
  settings: PlexSettings,
  candidate: PlexMetadataItem,
  matchedTrack: MusicLibraryIndexedTrack
) {
  if (plexTrackHasIndexedFile(candidate, matchedTrack)) {
    return candidate;
  }

  const ratingKey = candidate.ratingKey;

  if (!ratingKey) {
    return null;
  }

  const hydratedCandidate = await getPlexMetadataItem(
    settings,
    ratingKey
  ).catch(() => null);

  if (
    hydratedCandidate?.type !== "track" ||
    !hydratedCandidate.ratingKey ||
    !plexTrackHasIndexedFile(hydratedCandidate, matchedTrack)
  ) {
    return null;
  }

  return hydratedCandidate;
}

async function getPlexMetadataItem(
  settings: PlexSettings,
  ratingKey: string | number
) {
  const response = await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/library/metadata/${encodeURIComponent(String(ratingKey))}`,
    {
      method: "GET"
    }
  );

  return plexMetadataItems(response)[0] ?? null;
}

async function requestPlexMusicLibraryScan(
  settings: PlexSettings,
  musicLibraryKey: string
) {
  await plexApiRequest<PlexMetadataResponse>(
    settings,
    `/library/sections/${encodeURIComponent(musicLibraryKey)}/refresh`,
    {
      method: "GET",
      parseJson: false
    }
  );
}

async function searchPlexLibraryTracks(
  settings: PlexSettings,
  musicLibraryKey: string,
  query: string
) {
  const [sectionResponse, hubResponse] = await Promise.all([
    plexApiRequest<PlexMetadataResponse>(
      settings,
      `/library/sections/${encodeURIComponent(musicLibraryKey)}/all`,
      {
        method: "GET",
        query: {
          "X-Plex-Container-Size": plexTrackSearchLimit,
          title: query,
          type: plexTrackType
        }
      }
    ).catch(() => null),
    plexApiRequest<PlexMetadataResponse>(settings, "/hubs/search", {
      method: "GET",
      query: {
        limit: plexTrackSearchLimit,
        query,
        sectionId: musicLibraryKey
      }
    }).catch(() => null)
  ]);
  const candidates = new Map<string, PlexMetadataItem>();

  for (const item of [
    ...plexMetadataItems(sectionResponse),
    ...plexMetadataItems(hubResponse)
  ]) {
    if (item.type !== "track" || !item.ratingKey) {
      continue;
    }

    candidates.set(String(item.ratingKey), item);
  }

  return Array.from(candidates.values());
}

function scorePlexTrackCandidate(
  track: BackupTrack,
  matchedTrack: MusicLibraryIndexedTrack,
  candidate: PlexMetadataItem
) {
  if (!candidate.ratingKey || candidate.type !== "track") {
    return 0;
  }

  const candidateFiles = plexPartFiles(candidate).map(normalizeRelativePathKey);
  const matchedRelativePath = normalizeRelativePathKey(matchedTrack.relativePath);
  const matchedBaseName = normalizeText(path.posix.parse(matchedTrack.fileName).name);
  const candidateTitle = normalizeText(candidate.title);
  const trackTitle = normalizeText(track.name);
  const matchedTitle = normalizeText(matchedTrack.title);
  let score = 0;

  if (
    candidateFiles.some(
      (file) => file === matchedRelativePath || file.endsWith(`/${matchedRelativePath}`)
    )
  ) {
    score += 100;
  } else if (
    candidateFiles.some(
      (file) => normalizeText(path.posix.parse(file).name) === matchedBaseName
    )
  ) {
    score += 35;
  }

  if (
    candidateTitle &&
    (candidateTitle === trackTitle || candidateTitle === matchedTitle)
  ) {
    score += 40;
  } else if (
    candidateTitle &&
    (titleTokenCoverage(candidateTitle, trackTitle) >= 0.85 ||
      titleTokenCoverage(trackTitle, candidateTitle) >= 0.85 ||
      titleTokenCoverage(candidateTitle, matchedTitle) >= 0.85 ||
      titleTokenCoverage(matchedTitle, candidateTitle) >= 0.85)
  ) {
    score += 25;
  }

  if (
    hasArtistOverlap(
      new Set(
        [track.albumArtist, ...track.artists]
          .flatMap(splitArtists)
          .map(normalizeText)
          .filter(Boolean)
      ),
      new Set(
        [candidate.grandparentTitle, matchedTrack.albumArtist, matchedTrack.artist]
          .flatMap(splitArtists)
          .map(normalizeText)
          .filter(Boolean)
      )
    )
  ) {
    score += 25;
  }

  if (normalizeText(candidate.parentTitle) === normalizeText(track.album)) {
    score += 15;
  }

  if (
    typeof candidate.duration === "number" &&
    durationCloseEnough(track.durationMs, candidate.duration)
  ) {
    score += 15;
  }

  return score;
}

async function plexApiRequest<T>(
  settings: PlexSettings,
  endpoint: string,
  options: {
    method: "DELETE" | "GET" | "POST" | "PUT";
    parseJson?: boolean;
    query?: Record<string, string | number>;
  }
) {
  const url = new URL(
    `${settings.serverUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`
  );

  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Plex-Client-Identifier": plexClientIdentifier,
      "X-Plex-Device": "Server",
      "X-Plex-Device-Name": plexProduct,
      "X-Plex-Platform": "Web",
      "X-Plex-Product": plexProduct,
      "X-Plex-Token": settings.token,
      "X-Plex-Version": plexVersion,
      accepts: "application/json"
    },
    method: options.method,
    signal: AbortSignal.timeout(plexRequestTimeoutMs)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PlexApiError(
        "Plex rejected the token. Check the X-Plex-Token in settings.",
        response.status
      );
    }

    throw new PlexApiError(`Plex API returned HTTP ${response.status}.`, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (options.parseJson === false) {
    return {} as T;
  }

  const text = await response.text();

  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Plex API response was not JSON. Check the Plex server URL.");
  }
}

function plexMetadataItems(response: PlexMetadataResponse | null) {
  const metadata = arrayFrom(response?.MediaContainer?.Metadata);
  const hubMetadata = arrayFrom(response?.MediaContainer?.Hub).flatMap((hub) =>
    arrayFrom(hub.Metadata)
  );

  return [...metadata, ...hubMetadata];
}

function plexPartFiles(item: PlexMetadataItem) {
  return arrayFrom(item.Media).flatMap((media) =>
    arrayFrom(media.Part)
      .filter(plexPartIsAvailable)
      .map((part) => part.file)
      .filter((file): file is string => Boolean(file))
      .map(normalizeRelativePath)
  );
}

function plexTrackHasIndexedFile(
  item: PlexMetadataItem,
  matchedTrack: MusicLibraryIndexedTrack
) {
  const matchedRelativePath = normalizeRelativePathKey(matchedTrack.relativePath);

  return plexPartFiles(item)
    .map(normalizeRelativePathKey)
    .some(
      (file) => file === matchedRelativePath || file.endsWith(`/${matchedRelativePath}`)
    );
}

function plexPartIsAvailable(part: PlexPart) {
  return (
    !plexFlagIsFalse(part.accessible) &&
    !plexFlagIsFalse(part.exists)
  );
}

function plexFlagIsFalse(value: boolean | number | string | undefined) {
  return (
    value === false ||
    value === 0 ||
    (typeof value === "string" &&
      ["0", "false", "no"].includes(value.trim().toLowerCase()))
  );
}

function plexLibraryMetadataUri(
  machineIdentifier: string,
  ratingKeys: string[]
) {
  return `server://${machineIdentifier}/${plexLibraryIdentifier}/library/metadata/${ratingKeys.join(
    ","
  )}`;
}

function musicLibraryPlaylistName(playlist: PlaylistSummary) {
  return playlist.name.trim().slice(0, 120) || `Spotify playlist ${playlist.id}`;
}

function normalizePlexArtworkUrl(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : null;
}

function normalizePlaylistSyncMode(
  mode?: MusicLibraryPlaylistSyncMode
): MusicLibraryPlaylistSyncMode {
  if (mode === "append" || mode === "fullsync") {
    return mode;
  }

  return "replace";
}

function orderedRatingKeysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((ratingKey, index) => ratingKey === right[index])
  );
}

function countPlaylistItemsAdded(
  existingRatingKeys: string[],
  desiredRatingKeys: string[]
) {
  return countPlaylistItemDifference(desiredRatingKeys, existingRatingKeys);
}

function countPlaylistItemsRemoved(
  existingRatingKeys: string[],
  desiredRatingKeys: string[]
) {
  return countPlaylistItemDifference(existingRatingKeys, desiredRatingKeys);
}

function countPlaylistItemDifference(source: string[], comparison: string[]) {
  const comparisonCounts = new Map<string, number>();
  let count = 0;

  for (const ratingKey of comparison) {
    comparisonCounts.set(ratingKey, (comparisonCounts.get(ratingKey) ?? 0) + 1);
  }

  for (const ratingKey of source) {
    const remainingCount = comparisonCounts.get(ratingKey) ?? 0;

    if (remainingCount > 0) {
      comparisonCounts.set(ratingKey, remainingCount - 1);
      continue;
    }

    count += 1;
  }

  return count;
}

function arrayFrom<T>(value: T[] | T | null | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeRelativePathKey(value: string) {
  return normalizeRelativePath(value).toLowerCase();
}

function normalizeText(value?: string) {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokenCoverage(left: string, right: string) {
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));

  if (!leftTokens.length || !rightTokens.size) {
    return 0;
  }

  const matchingTokens = leftTokens.filter((token) => rightTokens.has(token)).length;

  return matchingTokens / leftTokens.length;
}

function splitArtists(value?: string) {
  return (value ?? "")
    .split(/\s+(?:feat\.?|featuring|ft\.?|with|and|&)\s+|[,;/]+/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function hasArtistOverlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) {
    return true;
  }

  for (const leftArtist of left) {
    for (const rightArtist of right) {
      if (artistKeysCompatible(leftArtist, rightArtist)) {
        return true;
      }
    }
  }

  return false;
}

function artistKeysCompatible(left: string, right: string) {
  const leftKey = canonicalArtistKey(left);
  const rightKey = canonicalArtistKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey === rightKey) {
    return true;
  }

  const leftTokenCount = leftKey.split(/\s+/).filter(Boolean).length;
  const rightTokenCount = rightKey.split(/\s+/).filter(Boolean).length;

  return (
    leftTokenCount >= 2 &&
    rightTokenCount >= 2 &&
    (titleTokenCoverage(leftKey, rightKey) === 1 ||
      titleTokenCoverage(rightKey, leftKey) === 1)
  );
}

function canonicalArtistKey(value: string) {
  return value.replace(/^the\s+/, "").trim();
}

function durationCloseEnough(leftMs: number, rightMs?: number) {
  return typeof rightMs === "number" && Math.abs(leftMs - rightMs) <= 3000;
}

function firstConfiguredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function firstConfiguredRawEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getPlexSettingsPath() {
  return path.join(
    /* turbopackIgnore: true */ getConfigDirectory(),
    "plex-settings.json"
  );
}

function getConfigDirectory() {
  const configuredDirectory = process.env.SPOTIFYBU_CONFIG_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ configuredDirectory);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".spotifybu");
}

function isPlexAuthError(error: unknown) {
  return (
    error instanceof PlexApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Plex error.";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
