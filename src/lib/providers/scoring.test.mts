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

test("does not treat a remix as the original recording", () => {
  const track = {
    album: "False Idols",
    artists: ["Theis Thaws"],
    durationMs: 247_000,
    name: "Where Are You Lately"
  };
  const originalScore = scoreProviderCandidate(track, {
    artists: ["Theis Thaws"],
    durationMs: 247_000,
    title: "Theis Thaws - Where Are You Lately [False Idols]"
  });
  const remixScore = scoreProviderCandidate(track, {
    artists: ["Theis Thaws"],
    durationMs: 247_000,
    title: "Where Are You Lately (Batu Remix)"
  });

  assert.ok(originalScore.titleScore >= remixScore.titleScore + 30);
  assert.ok(originalScore.overall >= remixScore.overall + 15);
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

test("treats an album suffix in the Spotify title as secondary context", () => {
  const track = {
    album: "Break Open",
    artists: ["Pat Barrett"],
    durationMs: 250_000,
    name: "Stories - Break Open"
  };
  const albumTitleScore = scoreProviderCandidate(track, {
    artists: ["Pat Barrett"],
    durationMs: 385_000,
    title: "Pat Barrett - Break Open (Live)"
  });
  const officialLyricScore = scoreProviderCandidate(track, {
    artists: ["Pat Barrett"],
    durationMs: 250_000,
    title: "Pat Barrett - Stories (Official Lyric Video)"
  });

  assert.ok(officialLyricScore.overall > albumTitleScore.overall);
  assert.equal(officialLyricScore.titleScore, 100);
  assert.equal(officialLyricScore.overall, 100);
});

test("nudges old unofficial uploads below newer equivalent candidates", () => {
  const track = {
    album: "Example Album",
    albumReleaseDate: "2008-04-01",
    artists: ["Example Artist"],
    durationMs: 240_000,
    name: "Example Song"
  };
  const oldUnofficialScore = scoreProviderCandidate(track, {
    artists: ["Random Uploads"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2008-04-02"
  });
  const newerUnofficialScore = scoreProviderCandidate(track, {
    artists: ["Random Uploads"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2022-04-02"
  });

  assert.ok((oldUnofficialScore.uploadDatePenalty ?? 0) > 0);
  assert.ok(newerUnofficialScore.overall > oldUnofficialScore.overall);
});

test("keeps old official uploads from taking the full age penalty", () => {
  const track = {
    album: "Example Album",
    albumReleaseDate: "2008-04-01",
    artists: ["Example Artist"],
    durationMs: 240_000,
    name: "Example Song"
  };
  const oldUnofficialScore = scoreProviderCandidate(track, {
    artists: ["Random Uploads"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2008-04-02"
  });
  const oldOfficialScore = scoreProviderCandidate(track, {
    artists: ["Example Artist - Topic"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2008-04-02"
  });

  assert.ok(
    (oldUnofficialScore.uploadDatePenalty ?? 0) >
      (oldOfficialScore.uploadDatePenalty ?? 0)
  );
  assert.ok(oldOfficialScore.overall > oldUnofficialScore.overall);
});

test("penalizes uploads that substantially predate the Spotify release", () => {
  const track = {
    album: "Example Album",
    albumReleaseDate: "2020-05-01",
    artists: ["Example Artist"],
    durationMs: 240_000,
    name: "Example Song"
  };
  const preReleaseScore = scoreProviderCandidate(track, {
    artists: ["Random Uploads"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2012-01-01"
  });
  const releaseWindowScore = scoreProviderCandidate(track, {
    artists: ["Random Uploads"],
    durationMs: 240_000,
    title: "Example Song - Example Artist",
    uploadedAt: "2020-05-02"
  });

  assert.ok((preReleaseScore.uploadDatePenalty ?? 0) >= 8);
  assert.ok(releaseWindowScore.overall > preReleaseScore.overall);
});
