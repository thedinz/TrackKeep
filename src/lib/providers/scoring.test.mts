import assert from "node:assert/strict";
import test from "node:test";
import { scoreProviderCandidate } from "./scoring.ts";

test("ranks the matching Victory recording above the shorter alternate recording", () => {
  const track = {
    album: "Victory (Live)",
    artists: ["Bethel Music", "Jenn Johnson"],
    durationMs: 295_000,
    name: "Goodness of God (Live)"
  };
  const alternateRecording = scoreProviderCandidate(track, {
    artists: ["Jenn Johnson - Topic"],
    durationMs: 236_000,
    title: "Goodness of God"
  });
  const victoryRecording = scoreProviderCandidate(track, {
    artists: ["Bethel Music"],
    durationMs: 295_000,
    title:
      "Goodness of God (Official Lyric Video) - Bethel Music & Jenn Johnson | VICTORY"
  });

  assert.ok(victoryRecording.overall >= alternateRecording.overall + 20);
  assert.equal(victoryRecording.titleScore, 90);
  assert.equal(victoryRecording.albumScore, 100);
});

test("ignores ordinary YouTube title decorations", () => {
  const score = scoreProviderCandidate(
    {
      album: "Rumours",
      artists: ["Fleetwood Mac"],
      durationMs: 257_000,
      name: "Dreams"
    },
    {
      artists: ["Fleetwood Mac"],
      durationMs: 257_000,
      title: "Dreams (Official Audio)"
    }
  );

  assert.equal(score.titleScore, 100);
  assert.equal(score.overall, 100);
});

test("uses an artist named in the video title when uploader metadata is generic", () => {
  const score = scoreProviderCandidate(
    {
      album: "Example Album",
      artists: ["Actual Artist"],
      durationMs: 180_000,
      name: "Example Song"
    },
    {
      artists: ["Music Uploads"],
      durationMs: 180_000,
      title: "Example Song - Actual Artist"
    }
  );

  assert.equal(score.artistScore, 100);
});

test("preserves matching for group names split across provider artist fields", () => {
  const score = scoreProviderCandidate(
    {
      album: "Sounds of Silence",
      artists: ["Simon & Garfunkel"],
      durationMs: 185_000,
      name: "The Sound of Silence"
    },
    {
      artists: ["Simon", "Garfunkel"],
      durationMs: 185_000,
      title: "The Sound of Silence"
    }
  );

  assert.equal(score.artistScore, 67);
});

test("keeps recording qualifiers meaningful", () => {
  const track = {
    album: "Concert",
    artists: ["Example Artist"],
    durationMs: 240_000,
    name: "Midnight (Live)"
  };
  const liveScore = scoreProviderCandidate(track, {
    artists: ["Example Artist"],
    durationMs: 240_000,
    title: "Midnight (Live)"
  });
  const remixScore = scoreProviderCandidate(track, {
    artists: ["Example Artist"],
    durationMs: 240_000,
    title: "Midnight (Remix)"
  });

  assert.ok(liveScore.titleScore > remixScore.titleScore);
  assert.ok(liveScore.overall > remixScore.overall);
});

test("prefers the album-matching featured artist recording over a same-title cover", () => {
  const track = {
    album: "Church Moments",
    artists: ["Gateway Worship", "Matthew Harris", "Jessie Harris"],
    durationMs: 422_000,
    name: "Open The Eyes Of My Heart"
  };
  const coverScore = scoreProviderCandidate(track, {
    artists: ["7 Hills Worship"],
    durationMs: 182_000,
    title: "Open The Eyes Of My Heart | 7 Hills Worship"
  });
  const churchMomentsScore = scoreProviderCandidate(track, {
    artists: ["Gateway Worship"],
    durationMs: 422_000,
    title:
      "Open The Eyes Of My Heart (Church Moments) | feat. Matthew & Jessie Harris | Gateway Worship"
  });

  assert.ok(churchMomentsScore.overall >= coverScore.overall + 30);
  assert.ok(churchMomentsScore.albumScore >= 80);
  assert.ok(churchMomentsScore.artistScore >= 90);
});

test("prefers a matching featured artist over a same-channel live alternate", () => {
  const track = {
    album: "Elohim (Live)",
    artists: ["Bethel Music", "Noah Paul Harrison"],
    durationMs: 446_000,
    name: "Elohim - Live"
  };
  const alternateFeaturedArtistScore = scoreProviderCandidate(track, {
    artists: ["Bethel Music"],
    durationMs: 448_000,
    title: "Elohim (Live From Church) - @BethelMusic , Aubree Archibeck"
  });
  const matchingFeaturedArtistScore = scoreProviderCandidate(track, {
    artists: ["Bethel Music"],
    durationMs: 446_000,
    title: "Elohim - Bethel Music, Noah Paul Harrison"
  });

  assert.ok(
    matchingFeaturedArtistScore.overall >
      alternateFeaturedArtistScore.overall
  );
  assert.ok(
    matchingFeaturedArtistScore.artistScore >
      alternateFeaturedArtistScore.artistScore
  );
  assert.equal(matchingFeaturedArtistScore.albumScore, 100);
});
