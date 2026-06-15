export type ProviderSearchTrackMetadata = {
  album?: string;
  artists: string[];
  name: string;
};

type ProviderSearchQueryOptions = {
  artistLimit?: number;
  includeAlbum?: boolean;
  suffix?: string;
};

const ignoredAlbumNames = new Set(["unknown album"]);
const maxYoutubeArtistCount = 3;

export function providerSearchQuery(
  track: ProviderSearchTrackMetadata,
  options: ProviderSearchQueryOptions = {}
) {
  const artistLimit = options.artistLimit ?? 2;

  return uniqueSearchParts([
    track.name,
    track.artists.slice(0, artistLimit).join(" "),
    options.includeAlbum ? meaningfulAlbumName(track.album) : "",
    options.suffix ?? ""
  ]).join(" ");
}

export function youtubeProviderSearchQueries(track: ProviderSearchTrackMetadata) {
  return uniqueSearchQueries([
    providerSearchQuery(track, {
      artistLimit: maxYoutubeArtistCount,
      includeAlbum: true
    }),
    providerSearchQuery(track, {
      artistLimit: 2,
      suffix: "official audio"
    })
  ]);
}

function meaningfulAlbumName(album: string | undefined) {
  const normalizedAlbum = normalizeSearchPart(album ?? "");

  if (!normalizedAlbum || ignoredAlbumNames.has(normalizedAlbum.toLowerCase())) {
    return "";
  }

  return normalizedAlbum;
}

function uniqueSearchParts(parts: string[]) {
  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  for (const part of parts) {
    const normalizedPart = normalizeSearchPart(part);
    const key = normalizedPart.toLowerCase();

    if (!normalizedPart || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueParts.push(normalizedPart);
  }

  return uniqueParts;
}

function uniqueSearchQueries(queries: string[]) {
  const seen = new Set<string>();
  const uniqueQueries: string[] = [];

  for (const query of queries) {
    const normalizedQuery = normalizeSearchPart(query);
    const key = normalizedQuery.toLowerCase();

    if (!normalizedQuery || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueQueries.push(normalizedQuery);
  }

  return uniqueQueries;
}

function normalizeSearchPart(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
