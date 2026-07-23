import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlaylistTracks,
  getTracks,
  getUserPlaylists,
  pickBestSpotifyTrackSearchMatch,
  spotifyLocalTrackSearchQueries,
  spotifyTrackNeedsCatalogResolution,
  unresolvedSpotifyLocalTrackMessage,
  type SpotifyTrackObject
} from "./spotify.ts";

test("builds local Spotify track search queries without video clip noise", () => {
  const queries = spotifyLocalTrackSearchQueries(
    spotifyTrack({
      album: spotifyAlbum("ClipConverter.cc"),
      artists: [spotifyArtist("Jeremih")],
      duration_ms: 250_000,
      is_local: true,
      name: "Fuck You All The Time (Shlohmo Remix) (video clip)",
      uri: "spotify:local:Jeremih:ClipConverter.cc:Fuck%20You%20All%20The%20Time:250"
    })
  );

  assert.deepEqual(queries, [
    "Fuck You All The Time Jeremih",
    "track:\"Fuck You All The Time\" artist:\"Jeremih\"",
    "artist:\"Jeremih\" track:\"Fuck You All The Time\"",
    "Fuck U All The Time Jeremih",
    "track:\"Fuck U All The Time\" artist:\"Jeremih\"",
    "artist:\"Jeremih\" track:\"Fuck U All The Time\""
  ]);
});

test("treats polluted playlist metadata as needing catalog resolution without a local flag", () => {
  assert.equal(
    spotifyTrackNeedsCatalogResolution(
      spotifyTrack({
        album: spotifyAlbum("ClipConverter.cc"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 250_000,
        name: "Fuck You All The Time (Shlohmo Remix) (video clip)"
      })
    ),
    true
  );

  assert.equal(
    spotifyTrackNeedsCatalogResolution(
      spotifyTrack({
        album: spotifyAlbum("Late Nights with Jeremih"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 250_000,
        id: "spotify-track-id",
        name: "Fuck U All the Time",
        uri: "spotify:track:spotify-track-id"
      })
    ),
    false
  );
});

test("treats missing Spotify catalog ids as needing catalog resolution", () => {
  assert.equal(
    spotifyTrackNeedsCatalogResolution(
      spotifyTrack({
        album: spotifyAlbum("Imported Album"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 250_000,
        name: "Fuck You All The Time (Shlohmo Remix)"
      })
    ),
    true
  );
});

test("resolves you/u title spelling differences to the original catalog track", () => {
  const match = pickBestSpotifyTrackSearchMatch(
    spotifyTrack({
      album: spotifyAlbum("ClipConverter.cc"),
      artists: [spotifyArtist("Jeremih")],
      duration_ms: 250_000,
      name: "Fuck You All The Time (Shlohmo Remix) (video clip)"
    }),
    [
      spotifyTrack({
        album: spotifyAlbum("Late Nights with Jeremih"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 248_000,
        id: "spotify-original",
        name: "Fuck U All the Time",
        uri: "spotify:track:spotify-original"
      })
    ]
  );

  assert.equal(match?.track.id, "spotify-original");
});

test("treats local Spotify URI duration values as seconds during catalog resolution", () => {
  const match = pickBestSpotifyTrackSearchMatch(
    spotifyTrack({
      album: spotifyAlbum("ClipConverter.cc"),
      artists: [spotifyArtist("Jeremih")],
      duration_ms: 250,
      is_local: true,
      name: "Fuck You All The Time (Shlohmo Remix) (video clip)",
      uri: "spotify:local:Jeremih:ClipConverter.cc:Fuck+You+All+The+Time+%28Shlohmo+Remix%29+%28video+clip%29:250"
    }),
    [
      spotifyTrack({
        album: spotifyAlbum("Late Nights with Jeremih"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 250_000,
        id: "spotify-original",
        name: "Fuck U All The Time",
        uri: "spotify:track:spotify-original"
      })
    ]
  );

  assert.equal(match?.track.id, "spotify-original");
});

test("does not treat ordinary catalog tracks as needing catalog resolution", () => {
  assert.equal(
    spotifyTrackNeedsCatalogResolution(
      spotifyTrack({
        album: spotifyAlbum("Example Album"),
        artists: [spotifyArtist("Example Artist")],
        duration_ms: 180_000,
        id: "spotify-track-id",
        name: "Example Song",
        uri: "spotify:track:spotify-track-id"
      })
    ),
    false
  );
});

test("prefers the original Spotify catalog track over a polluted remix local title", () => {
  const localTrack = spotifyTrack({
    album: spotifyAlbum("ClipConverter.cc"),
    artists: [spotifyArtist("Jeremih")],
    duration_ms: 250_000,
    is_local: true,
    name: "Fuck You All The Time (Shlohmo Remix) (video clip)",
    uri: "spotify:local:Jeremih:ClipConverter.cc:Fuck%20You%20All%20The%20Time:250"
  });
  const nonRemixCandidate = spotifyTrack({
    album: spotifyAlbum("Late Nights with Jeremih"),
    artists: [spotifyArtist("Jeremih")],
    duration_ms: 248_000,
    id: "spotify-original",
    name: "Fuck U All the Time",
    uri: "spotify:track:spotify-original"
  });
  const remixCandidate = spotifyTrack({
    album: spotifyAlbum("Fuck You All The Time (Shlohmo Remix)"),
    artists: [spotifyArtist("Jeremih")],
    duration_ms: 264_000,
    id: "spotify-shlohmo-remix",
    name: "Fuck You All The Time - Shlohmo Remix",
    uri: "spotify:track:spotify-shlohmo-remix"
  });

  const match = pickBestSpotifyTrackSearchMatch(localTrack, [
    nonRemixCandidate,
    remixCandidate
  ]);

  assert.equal(match?.track.id, "spotify-original");
  assert.ok(match.score.overall >= 82);
});

test("does not resolve polluted local metadata to a remix variation", () => {
  const match = pickBestSpotifyTrackSearchMatch(
    spotifyTrack({
      album: spotifyAlbum("ClipConverter.cc"),
      artists: [spotifyArtist("Jeremih")],
      duration_ms: 250_000,
      is_local: true,
      name: "Fuck You All The Time (Shlohmo Remix) (video clip)"
    }),
    [
      spotifyTrack({
        album: spotifyAlbum("Fuck You All The Time (Shlohmo Remix)"),
        artists: [spotifyArtist("Jeremih")],
        duration_ms: 264_000,
        id: "spotify-shlohmo-remix",
        name: "Fuck You All The Time - Shlohmo Remix",
        uri: "spotify:track:spotify-shlohmo-remix"
      })
    ]
  );

  assert.equal(match, null);
});

test("does not resolve a local playlist track to a weak catalog match", () => {
  const match = pickBestSpotifyTrackSearchMatch(
    spotifyTrack({
      artists: [spotifyArtist("Jeremih")],
      duration_ms: 250_000,
      is_local: true,
      name: "Fuck You All The Time (Shlohmo Remix)"
    }),
    [
      spotifyTrack({
        album: spotifyAlbum("Different Album"),
        artists: [spotifyArtist("Another Artist")],
        duration_ms: 250_000,
        id: "different-song",
        name: "Different Song"
      })
    ]
  );

  assert.equal(match, null);
});

test("marks unresolved local playlist tracks as not safe to download", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.includes("/playlists/playlist-id/items")) {
      return jsonResponse({
        items: [
          {
            added_at: "2018-09-01T00:00:00Z",
            track: spotifyTrack({
              album: spotifyAlbum("ClipConverter.cc"),
              artists: [spotifyArtist("Jeremih")],
              duration_ms: 250,
              is_local: true,
              name: "Fuck You All The Time (Shlohmo Remix) (video clip)",
              uri: "spotify:local:Jeremih:ClipConverter.cc:Fuck+You+All+The+Time+%28Shlohmo+Remix%29+%28video+clip%29:250"
            })
          }
        ],
        next: null
      });
    }

    if (url.includes("/search?")) {
      return jsonResponse({
        tracks: {
          items: [],
          next: null
        }
      });
    }

    throw new Error(`Unexpected Spotify test request: ${url}`);
  }) as typeof fetch;

  try {
    const tracks = await getPlaylistTracks(
      {
        access_token: "token",
        expires_at: Date.now() + 60_000,
        token_type: "Bearer"
      },
      "playlist-id"
    );

    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].metadataStatus, "spotify-local-unresolved");
    assert.equal(tracks[0].metadataWarning, unresolvedSpotifyLocalTrackMessage);
    assert.equal(tracks[0].album, "Unknown Album");
    assert.equal(tracks[0].name, "Fuck You All The Time");
    assert.ok(requestedUrls.some((url) => url.includes("/search?")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("paginates Spotify search ten results at a time and stops after a confident match", async () => {
  const originalFetch = globalThis.fetch;
  const searchUrls: URL[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/playlists/playlist-id/items")) {
      return jsonResponse({
        items: [
          {
            added_at: "2018-09-01T00:00:00Z",
            item: spotifyTrack({
              album: spotifyAlbum("ClipConverter.cc"),
              artists: [spotifyArtist("Jeremih")],
              duration_ms: 250_000,
              is_local: true,
              name: "Fuck You All The Time (Shlohmo Remix) (video clip)"
            })
          }
        ],
        next: null
      });
    }

    if (url.pathname.endsWith("/search")) {
      searchUrls.push(url);
      const offset = Number(url.searchParams.get("offset"));

      if (offset === 0) {
        return jsonResponse({
          tracks: {
            items: Array.from({ length: 10 }, (_, index) =>
              spotifyTrack({
                album: spotifyAlbum("Different Album"),
                artists: [spotifyArtist("Different Artist")],
                duration_ms: 180_000,
                id: `weak-${index}`,
                name: `Different Song ${index}`
              })
            ),
            next: "https://api.spotify.com/v1/search?offset=10"
          }
        });
      }

      if (offset === 10) {
        return jsonResponse({
          tracks: {
            items: [
              spotifyTrack({
                album: spotifyAlbum("Late Nights with Jeremih"),
                artists: [spotifyArtist("Jeremih")],
                duration_ms: 248_000,
                id: "spotify-original",
                name: "Fuck U All the Time",
                uri: "spotify:track:spotify-original"
              })
            ],
            next: null
          }
        });
      }
    }

    throw new Error(`Unexpected Spotify test request: ${url}`);
  }) as typeof fetch;

  try {
    const tracks = await getPlaylistTracks(
      {
        access_token: "token",
        expires_at: Date.now() + 60_000,
        token_type: "Bearer"
      },
      "playlist-id"
    );

    assert.equal(tracks[0].id, "spotify-original");
    assert.equal(tracks[0].metadataStatus, "spotify-local-resolved");
    assert.deepEqual(
      searchUrls.map((url) => ({
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset")
      })),
      [
        { limit: "10", offset: "0" },
        { limit: "10", offset: "10" }
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries Spotify rate limits using Retry-After", async () => {
  const originalFetch = globalThis.fetch;
  let playlistRequestCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (!url.includes("/playlists/playlist-id/items")) {
      throw new Error(`Unexpected Spotify test request: ${url}`);
    }

    playlistRequestCount += 1;

    if (playlistRequestCount === 1) {
      return jsonResponse(
        { error: { message: "Too many requests" } },
        {
          headers: { "Retry-After": "0" },
          status: 429
        }
      );
    }

    return jsonResponse({
      items: [
        {
          item: spotifyTrack({
            album: spotifyAlbum("Example Album"),
            artists: [spotifyArtist("Example Artist")],
            duration_ms: 180_000,
            id: "spotify-track-id",
            name: "Example Song",
            uri: "spotify:track:spotify-track-id"
          })
        }
      ],
      next: null
    });
  }) as typeof fetch;

  try {
    const tracks = await getPlaylistTracks(
      {
        access_token: "token",
        expires_at: Date.now() + 60_000,
        token_type: "Bearer"
      },
      "playlist-id"
    );

    assert.equal(playlistRequestCount, 2);
    assert.equal(tracks[0].id, "spotify-track-id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a partially resolved pasted Spotify track list", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/tracks/good-track")) {
      return jsonResponse(
        spotifyTrack({
          artists: [spotifyArtist("Example Artist")],
          duration_ms: 180_000,
          id: "good-track",
          name: "Example Song"
        })
      );
    }

    if (url.endsWith("/tracks/missing-track")) {
      return jsonResponse(
        { error: { message: "Not found" } },
        { status: 404 }
      );
    }

    throw new Error(`Unexpected Spotify test request: ${url}`);
  }) as typeof fetch;

  try {
    await assert.rejects(
      getTracks(
        {
          access_token: "token",
          expires_at: Date.now() + 60_000,
          token_type: "Bearer"
        },
        ["good-track", "missing-track"]
      ),
      /Spotify returned metadata for 1 of 2 songs/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to legacy playlist total fields when Spotify rejects items", async () => {
  const originalFetch = globalThis.fetch;
  const requestedFields: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const fields = url.searchParams.get("fields") ?? "";

    requestedFields.push(fields);

    if (fields.includes("items(total)")) {
      return jsonResponse(
        { error: { message: "Invalid fields" } },
        { status: 400 }
      );
    }

    return jsonResponse({
      items: [
        {
          id: "playlist-id",
          name: "Legacy Playlist",
          tracks: { total: 12 }
        }
      ],
      next: null
    });
  }) as typeof fetch;

  try {
    const playlists = await getUserPlaylists({
      access_token: "token",
      expires_at: Date.now() + 60_000,
      token_type: "Bearer"
    });

    assert.equal(requestedFields.length, 2);
    assert.ok(requestedFields[0].includes("items(total)"));
    assert.ok(requestedFields[1].includes("tracks(total)"));
    assert.equal(playlists[0].tracksTotal, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function spotifyTrack(track: Partial<SpotifyTrackObject>): SpotifyTrackObject {
  return {
    type: "track",
    ...track
  };
}

function spotifyAlbum(name: string) {
  return {
    name
  };
}

function spotifyArtist(name: string) {
  return {
    name
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
    status: init.status ?? 200
  });
}
