import type { CandidateScore } from "./types";

export type ProviderCandidateMetadata = {
  album?: string;
  artists: string[];
  durationMs?: number;
  title: string;
};

export type ProviderTrackMetadata = {
  album?: string;
  artists: string[];
  durationMs: number;
  name: string;
};

const providerTitleNoiseTokens = new Set([
  "audio",
  "hd",
  "hq",
  "lyric",
  "lyrics",
  "official",
  "video",
  "visualizer"
]);

const albumEditionTokens = new Set([
  "anniversary",
  "deluxe",
  "edition",
  "expanded",
  "live",
  "remaster",
  "remastered"
]);

export function scoreProviderCandidate(
  track: ProviderTrackMetadata,
  candidate: ProviderCandidateMetadata
) {
  const titleScore = titleSimilarity(track.name, candidate.title, track.album);
  const candidateArtistText = candidate.artists.join(" ");
  const artistScore = artistSimilarity(
    track.artists,
    candidateArtistText,
    candidate.title
  );
  const durationDeltaMs =
    typeof candidate.durationMs === "number"
      ? Math.abs(candidate.durationMs - track.durationMs)
      : undefined;
  const durationScore =
    typeof durationDeltaMs === "number"
      ? Math.max(0, 100 - Math.round(durationDeltaMs / 1000) * 3)
      : 50;
  const albumScore = track.album
    ? albumSimilarity(track.album, candidate.album, candidate.title)
    : 0;
  const overall = Math.min(
    100,
    Math.round(
      titleScore * 0.48 +
        artistScore * 0.34 +
        durationScore * 0.18 +
        albumScore * 0.08
    )
  );

  return {
    albumScore,
    artistScore,
    durationDeltaMs,
    overall,
    titleScore
  } satisfies CandidateScore;
}

function titleSimilarity(
  trackTitle: string,
  candidateTitle: string,
  trackAlbum?: string
) {
  const trackTokenSets = [
    tokenSet(trackTitle),
    ...albumQualifiedTitleTokenSets(trackTitle, trackAlbum)
  ];
  const contextualEditionTokens = albumEditionTokensIn(trackAlbum);
  const contextualTrackTokens = contextualEditionTokens.size
    ? tokenSet(trackTitle, contextualEditionTokens)
    : new Set<string>();
  const contextualScore = contextualTrackTokens.size
    ? Math.min(
        90,
        bestTitleSegmentScore(contextualTrackTokens, candidateTitle)
      )
    : 0;

  return Math.max(
    ...trackTokenSets.map((trackTokens) =>
      bestTitleSegmentScore(trackTokens, candidateTitle)
    ),
    contextualScore
  );
}

function bestTitleSegmentScore(
  trackTokens: Set<string>,
  candidateTitle: string
) {
  return Math.max(
    ...titleSegments(candidateTitle).map((segment) =>
      directionalSimilarity(
        trackTokens,
        tokenSet(segment, providerTitleNoiseTokens)
      )
    ),
    0
  );
}

function artistSimilarity(
  trackArtists: string[],
  candidateArtistText: string,
  candidateTitle: string
) {
  const artistScores = trackArtists.map((artist) =>
    Math.max(
      textSimilarity(artist, candidateArtistText),
      metadataSegmentSimilarity(artist, candidateTitle)
    )
  );

  if (!artistScores.length) {
    return 0;
  }

  const bestScore = Math.max(...artistScores);
  const averageScore =
    artistScores.reduce((total, score) => total + score, 0) /
    artistScores.length;

  return Math.round(bestScore * 0.6 + averageScore * 0.4);
}

function albumSimilarity(
  trackAlbum: string,
  candidateAlbum: string | undefined,
  candidateTitle: string
) {
  const trackTokens = tokenSet(trackAlbum, albumEditionTokens);
  const candidateValues = [
    candidateAlbum,
    ...titleSegments(candidateTitle)
  ].filter((value): value is string => Boolean(value));

  return Math.max(
    ...candidateValues.map((value) =>
      directionalSimilarity(trackTokens, tokenSet(value, albumEditionTokens))
    ),
    0
  );
}

function metadataSegmentSimilarity(target: string, candidateValue: string) {
  const targetTokens = tokenSet(target);

  return Math.max(
    ...titleSegments(candidateValue).map((segment) =>
      directionalSimilarity(
        targetTokens,
        tokenSet(segment, providerTitleNoiseTokens)
      )
    ),
    0
  );
}

function textSimilarity(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const intersectionCount = countIntersection(leftTokens, rightTokens);

  return Math.round(
    (intersectionCount / new Set([...leftTokens, ...rightTokens]).size) * 100
  );
}

function directionalSimilarity(
  targetTokens: Set<string>,
  candidateTokens: Set<string>
) {
  if (!targetTokens.size || !candidateTokens.size) {
    return 0;
  }

  const intersectionCount = countIntersection(targetTokens, candidateTokens);
  const coverage = intersectionCount / targetTokens.size;
  const jaccard =
    intersectionCount /
    new Set([...targetTokens, ...candidateTokens]).size;

  return Math.round((coverage * 0.8 + jaccard * 0.2) * 100);
}

function countIntersection(leftTokens: Set<string>, rightTokens: Set<string>) {
  let intersectionCount = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionCount += 1;
    }
  }

  return intersectionCount;
}

function titleSegments(value: string) {
  const segments = splitTitleSegments(value);

  return segments.length > 1 ? [...segments, value] : segments;
}

function splitTitleSegments(value: string) {
  return value
    .split(/\s+[-\u2013\u2014]\s+|\s*[|\u2022\u00b7]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function tokenSet(value: string, ignoredTokens = new Set<string>()) {
  const tokens = normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !ignoredTokens.has(token));

  if (!tokens.length && ignoredTokens.size) {
    return tokenSet(value);
  }

  return new Set(tokens);
}

function albumEditionTokensIn(value: string | undefined) {
  const valueTokens = tokenSet(value ?? "");
  const matchingTokens = [...albumEditionTokens].filter((token) =>
    valueTokens.has(token)
  );

  return new Set(matchingTokens);
}

function albumQualifiedTitleTokenSets(
  trackTitle: string,
  trackAlbum: string | undefined
) {
  const albumTokens = tokenSet(trackAlbum ?? "", albumEditionTokens);

  if (albumTokens.size < 2) {
    return [];
  }

  const segments = splitTitleSegments(trackTitle);

  if (segments.length < 2) {
    return [];
  }

  const retainedSegments = segments.filter(
    (segment) => !isAlbumEquivalentSegment(segment, albumTokens)
  );

  if (!retainedSegments.length || retainedSegments.length === segments.length) {
    return [];
  }

  const retainedTokens = tokenSet(retainedSegments.join(" "));
  const hasNonEditionToken = [...retainedTokens].some(
    (token) => !albumEditionTokens.has(token)
  );

  return hasNonEditionToken ? [retainedTokens] : [];
}

function isAlbumEquivalentSegment(segment: string, albumTokens: Set<string>) {
  const segmentTokens = tokenSet(segment, albumEditionTokens);

  return (
    directionalSimilarity(albumTokens, segmentTokens) >= 90 &&
    directionalSimilarity(segmentTokens, albumTokens) >= 90
  );
}

function normalizeSearchText(value: string) {
  return stripHtmlEntities(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
