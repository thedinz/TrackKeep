import assert from "node:assert/strict";
import test from "node:test";
import {
  pickBestSpotifyTrackSearchMatch,
  spotifyLocalTrackSearchQueries,
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
    "Fuck You All The Time (Shlohmo Remix) Jeremih",
    "Fuck You All The Time (Shlohmo Remix) (video clip) Jeremih"
  ]);
});

test("resolves polluted local playlist metadata to the matching Spotify catalog track", () => {
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

  assert.equal(match?.track.id, "spotify-shlohmo-remix");
  assert.ok(match.score.overall >= 82);
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
