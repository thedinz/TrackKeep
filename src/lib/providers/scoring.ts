import type { CandidateScore } from "./types";

export type ProviderCandidateMetadata = {
  album?: string;
  artists: string[];
  durationMs?: number;
  title: string;
  uploadedAt?: string;
  verified?: boolean;
};

export type ProviderTrackMetadata = {
  album?: string;
  albumReleaseDate?: string;
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
const remixTokens = new Set(["remix", "remixed"]);
const remixTitleMismatchPenalty = 35;

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
  const baseOverall = Math.min(
    100,
    Math.round(
      titleScore * 0.48 +
        artistScore * 0.34 +
        durationScore * 0.18 +
        albumScore * 0.08
    )
  );
  const uploadDatePenalty = uploadDatePenaltyFor(track, candidate);
  const overall = Math.max(0, baseOverall - uploadDatePenalty);

  return {
    albumScore,
    artistScore,
    durationDeltaMs,
    overall,
    titleScore,
    ...(uploadDatePenalty ? { uploadDatePenalty } : {})
  } satisfies CandidateScore;
}

function uploadDatePenaltyFor(
  track: ProviderTrackMetadata,
  candidate: ProviderCandidateMetadata
) {
  const uploadedAt = parseProviderDate(candidate.uploadedAt);

  if (!uploadedAt) {
    return 0;
  }

  const officialSource = isOfficialProviderSource(track, candidate);
  const agePenalty = uploadAgePenalty(uploadedAt, officialSource);
  const preReleasePenalty = uploadPreReleasePenalty(
    track.albumReleaseDate,
    uploadedAt,
    officialSource
  );

  return Math.min(
    officialSource ? 3 : 12,
    agePenalty + preReleasePenalty
  );
}

function uploadAgePenalty(uploadedAt: Date, officialSource: boolean) {
  const yearsOld =
    (Date.now() - uploadedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const graceYears = officialSource ? 15 : 8;

  if (yearsOld <= graceYears) {
    return 0;
  }

  return officialSource
    ? Math.min(2, Math.ceil((yearsOld - graceYears) / 4))
    : Math.min(6, Math.ceil((yearsOld - graceYears) / 2));
}

function uploadPreReleasePenalty(
  releaseDateValue: string | undefined,
  uploadedAt: Date,
  officialSource: boolean
) {
  const releaseDate = parseSpotifyReleaseDate(releaseDateValue);

  if (!releaseDate) {
    return 0;
  }

  const daysBeforeRelease =
    (releaseDate.getTime() - uploadedAt.getTime()) / (24 * 60 * 60 * 1000);

  if (daysBeforeRelease <= 180) {
    return 0;
  }

  return officialSource
    ? Math.min(2, Math.ceil(daysBeforeRelease / 730))
    : Math.min(8, 2 + Math.ceil(daysBeforeRelease / 365));
}

function isOfficialProviderSource(
  track: ProviderTrackMetadata,
  candidate: ProviderCandidateMetadata
) {
  if (candidate.verified) {
    return true;
  }

  const sourceText = candidate.artists.join(" ");

  if (/vevo\b/i.test(sourceText)) {
    return true;
  }

  if (/\s-\s*topic\b/i.test(sourceText)) {
    return true;
  }

  return (
    /\bofficial\b/i.test(sourceText) &&
    sourceMatchesTrackArtist(track, sourceText)
  );
}

function sourceMatchesTrackArtist(
  track: ProviderTrackMetadata,
  sourceText: string
) {
  const ignoredSourceTokens = new Set([
    "channel",
    "music",
    "official",
    "topic"
  ]);
  const sourceTokens = tokenSet(sourceText, ignoredSourceTokens);

  return track.artists.some((artist) => {
    const artistTokens = tokenSet(artist);

    return (
      directionalSimilarity(artistTokens, sourceTokens) >= 80 ||
      directionalSimilarity(sourceTokens, artistTokens) >= 80
    );
  });
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

  const similarity = Math.max(
    ...trackTokenSets.map((trackTokens) =>
      bestTitleSegmentScore(trackTokens, candidateTitle)
    ),
    contextualScore
  );

  return Math.max(
    0,
    similarity - remixMismatchPenalty(trackTitle, candidateTitle)
  );
}

function remixMismatchPenalty(trackTitle: string, candidateTitle: string) {
  const trackIsRemix = hasAnyToken(trackTitle, remixTokens);
  const candidateIsRemix = hasAnyToken(candidateTitle, remixTokens);

  return trackIsRemix === candidateIsRemix ? 0 : remixTitleMismatchPenalty;
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

function hasAnyToken(value: string, expectedTokens: Set<string>) {
  const valueTokens = tokenSet(value);

  return [...expectedTokens].some((token) => valueTokens.has(token));
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

function parseProviderDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (compactDate) {
    return utcDate(
      Number(compactDate[1]),
      Number(compactDate[2]),
      Number(compactDate[3])
    );
  }

  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (calendarDate) {
    return utcDate(
      Number(calendarDate[1]),
      Number(calendarDate[2]),
      Number(calendarDate[3])
    );
  }

  return null;
}

function parseSpotifyReleaseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const releaseDate = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);

  if (!releaseDate) {
    return null;
  }

  return utcDate(
    Number(releaseDate[1]),
    releaseDate[2] ? Number(releaseDate[2]) : 1,
    releaseDate[3] ? Number(releaseDate[3]) : 1
  );
}

function utcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
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
