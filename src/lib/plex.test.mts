import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  createOrUpdatePlexPlaylistFromSpotify,
  updatePlexSettings
} from "./plex.ts";
import type { BackupTrack, PlaylistSummary } from "./spotify.ts";

test("Plex settings save selects the configured music library", async (t) => {
  await withTempEnvironment(t, async ({ configDirectory }) => {
    const server = await startMockPlexServer();

    t.after(async () => {
      await server.close();
    });

    const response = await updatePlexSettings({
      enabled: true,
      serverUrl: server.url,
      token: "test-token"
    });

    assert.equal(response.enabled, true);
    assert.equal(response.musicLibraryKey, "10");
    assert.equal(response.musicLibraryTitle, "Music");
    assert.equal(response.tokenConfigured, true);
    assert.equal(response.status.state, "ready");
    assert.equal(process.env.SPOTIFYBU_CONFIG_DIR, configDirectory);
  });
});

test("Plex playlist sync creates an audio playlist from matched tracks", async (t) => {
  await withTempEnvironment(t, async ({ libraryPath }) => {
    const playlistCreates: string[] = [];
    const server = await startMockPlexServer({
      onCreatePlaylist(uri) {
        playlistCreates.push(uri);
      }
    });

    t.after(async () => {
      await server.close();
    });

    await writeLibraryIndex(libraryPath);
    await updatePlexSettings({
      enabled: true,
      serverUrl: server.url,
      token: "test-token"
    });

    const result = await createOrUpdatePlexPlaylistFromSpotify(
      examplePlaylist,
      [exampleTrack],
      {
        mode: "replace"
      }
    );

    assert.equal(result.name, "Road Mix");
    assert.equal(result.playlistId, "900");
    assert.equal(result.matchedCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.equal(result.songCount, 1);
    assert.equal(result.updated, false);
    assert.deepEqual(playlistCreates, [
      "server://mock-machine/com.plexapp.plugins.library/library/metadata/501"
    ]);
  });
});

async function withTempEnvironment(
  t: TestContext,
  run: (context: { configDirectory: string; libraryPath: string }) => Promise<void>
) {
  const configDirectory = await mkdtemp(path.join(tmpdir(), "spotifybu-config-"));
  const libraryPath = await mkdtemp(path.join(tmpdir(), "spotifybu-library-"));
  const previousConfigDirectory = process.env.SPOTIFYBU_CONFIG_DIR;
  const previousLibraryPath = process.env.MUSIC_LIBRARY_PATH;

  process.env.SPOTIFYBU_CONFIG_DIR = configDirectory;
  process.env.MUSIC_LIBRARY_PATH = libraryPath;

  t.after(async () => {
    restoreEnvironmentValue("SPOTIFYBU_CONFIG_DIR", previousConfigDirectory);
    restoreEnvironmentValue("MUSIC_LIBRARY_PATH", previousLibraryPath);
    await rm(configDirectory, {
      force: true,
      recursive: true
    });
    await rm(libraryPath, {
      force: true,
      recursive: true
    });
  });

  await run({
    configDirectory,
    libraryPath
  });
}

async function startMockPlexServer(options: {
  onAddPlaylistItems?: (uri: string) => void;
  onCreatePlaylist?: (uri: string) => void;
} = {}) {
  let createdPlaylist = false;
  let playlistItemCount = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    response.setHeader("Content-Type", "application/json");

    if (request.headers["x-plex-token"] !== "test-token") {
      response.statusCode = 401;
      response.end(JSON.stringify({}));
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      response.end(
        JSON.stringify({
          MediaContainer: {
            friendlyName: "Mock Plex",
            machineIdentifier: "mock-machine"
          }
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/library/sections/all") {
      response.end(
        JSON.stringify({
          MediaContainer: {
            Directory: [
              {
                key: "1",
                title: "Movies",
                type: "movie"
              },
              {
                key: "10",
                title: "Music",
                type: "artist"
              }
            ]
          }
        })
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/library/sections/10/all"
    ) {
      response.end(
        JSON.stringify({
          MediaContainer: {
            Metadata: [
              {
                Media: [
                  {
                    Part: [
                      {
                        file: "Example Artist/Example Record/01 - Opening.mp3"
                      }
                    ]
                  }
                ],
                duration: exampleTrack.durationMs,
                grandparentTitle: "Example Artist",
                parentTitle: "Example Record",
                ratingKey: "501",
                title: "Opening",
                type: "track"
              }
            ]
          }
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/hubs/search") {
      response.end(
        JSON.stringify({
          MediaContainer: {
            Hub: []
          }
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/playlists") {
      response.end(
        JSON.stringify({
          MediaContainer: {
            Metadata: createdPlaylist
              ? [
                  {
                    leafCount: playlistItemCount,
                    playlistType: "audio",
                    ratingKey: "900",
                    title: "Road Mix",
                    type: "playlist"
                  }
                ]
              : []
          }
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/playlists") {
      const uri = url.searchParams.get("uri") ?? "";

      if (!uri) {
        response.statusCode = 400;
        response.end(
          JSON.stringify({
            error: "Playlist creation requires initial items."
          })
        );
        return;
      }

      options.onCreatePlaylist?.(uri);
      createdPlaylist = true;
      playlistItemCount = uri ? uri.split("/metadata/")[1]?.split(",").length ?? 0 : 0;
      response.end(
        JSON.stringify({
          MediaContainer: {
            Metadata: [
              {
                leafCount: playlistItemCount,
                playlistType: "audio",
                ratingKey: "900",
                title: url.searchParams.get("title") ?? "Road Mix",
                type: "playlist"
              }
            ]
          }
        })
      );
      return;
    }

    if (request.method === "PUT" && url.pathname === "/playlists/900/items") {
      const uri = url.searchParams.get("uri") ?? "";

      options.onAddPlaylistItems?.(uri);
      playlistItemCount = uri ? uri.split("/metadata/")[1]?.split(",").length ?? 0 : 0;
      response.end(
        JSON.stringify({
          MediaContainer: {}
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/playlists/900") {
      response.end(
        JSON.stringify({
          MediaContainer: {
            Metadata: [
              {
                leafCount: playlistItemCount,
                playlistType: "audio",
                ratingKey: "900",
                title: "Road Mix",
                type: "playlist"
              }
            ]
          }
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({}));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Mock Plex server did not bind to a port.");
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    url: `http://127.0.0.1:${address.port}`
  };
}

async function writeLibraryIndex(libraryPath: string) {
  const relativeDirectory = path.join(
    libraryPath,
    "Example Artist",
    "Example Record"
  );

  await mkdir(relativeDirectory, {
    recursive: true
  });
  await writeFile(path.join(relativeDirectory, "01 - Opening.mp3"), "mock", "utf8");
  await mkdir(path.join(libraryPath, ".spotifybu"), {
    recursive: true
  });
  await writeFile(
    path.join(libraryPath, ".spotifybu", "library-index.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date(0).toISOString(),
        libraryPath,
        tracks: [
          {
            album: exampleTrack.album,
            albumArtist: exampleTrack.albumArtist,
            artist: exampleTrack.artists[0],
            artists: exampleTrack.artists,
            durationMs: exampleTrack.durationMs,
            fileName: "01 - Opening.mp3",
            isrc: exampleTrack.isrc,
            mtimeMs: 0,
            relativeDirectory: "Example Artist/Example Record",
            relativePath: "Example Artist/Example Record/01 - Opening.mp3",
            sizeBytes: 1,
            source: "tags",
            title: exampleTrack.name,
            trackNumber: exampleTrack.trackNumber
          }
        ],
        version: 1
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (typeof value === "string") {
    process.env[name] = value;
    return;
  }

  delete process.env[name];
}

const examplePlaylist = {
  collaborative: false,
  description: "",
  id: "spotify-playlist",
  name: "Road Mix",
  owner: "SpotifyBU",
  public: false,
  tracksTotal: 1
} satisfies PlaylistSummary;

const exampleTrack = {
  album: "Example Record",
  albumArtist: "Example Artist",
  artists: ["Example Artist"],
  durationMs: 180000,
  explicit: false,
  id: "spotify-track",
  isrc: "USRC17607839",
  name: "Opening",
  position: 1,
  spotifyUri: "spotify:track:spotify-track",
  trackNumber: 1
} satisfies BackupTrack;
