import assert from "node:assert/strict";
import test from "node:test";
import type { BackupTrack } from "../spotify.ts";
import { providerTrackWithSpotifyMetadata } from "./spotify-metadata.ts";

test("provider downloads keep Spotify metadata authoritative", () => {
  const requestedTrack = {
    addedAt: "2026-07-24T12:00:00Z",
    album: "Provider Search Album",
    albumArtist: "Provider Search Artist",
    albumArtistIds: [],
    albumImageUrl: "https://provider.example/remix.jpg",
    albumReleaseDate: "2025-01-01",
    artists: ["Provider Search Artist"],
    artistIds: [],
    durationMs: 300_000,
    explicit: false,
    id: "1234567890123456789012",
    name: "Where Are You Lately (Batu Remix)",
    position: 37
  } satisfies BackupTrack;
  const spotifyTrack = {
    album: "False Idols",
    albumArtist: "Theis Thaws",
    albumArtistIds: ["spotify-album-artist"],
    albumImageUrl: "https://i.scdn.co/image/original.jpg",
    albumReleaseDate: "2014-03-03",
    artists: ["Theis Thaws"],
    artistIds: ["spotify-track-artist"],
    discNumber: 1,
    durationMs: 247_000,
    explicit: false,
    id: "1234567890123456789012",
    isrc: "GBBKS1400001",
    name: "Where Are You Lately",
    position: 1,
    spotifyUri: "spotify:track:1234567890123456789012",
    spotifyUrl: "https://open.spotify.com/track/1234567890123456789012",
    trackNumber: 4
  } satisfies BackupTrack;

  const track = providerTrackWithSpotifyMetadata(
    requestedTrack,
    spotifyTrack
  );

  assert.equal(track.name, "Where Are You Lately");
  assert.equal(track.album, "False Idols");
  assert.equal(track.albumArtist, "Theis Thaws");
  assert.deepEqual(track.artists, ["Theis Thaws"]);
  assert.equal(track.albumReleaseDate, "2014-03-03");
  assert.equal(track.albumImageUrl, "https://i.scdn.co/image/original.jpg");
  assert.equal(track.durationMs, 247_000);
  assert.equal(track.isrc, "GBBKS1400001");
  assert.equal(track.trackNumber, 4);
  assert.equal(track.position, 37);
  assert.equal(track.addedAt, "2026-07-24T12:00:00Z");
});
