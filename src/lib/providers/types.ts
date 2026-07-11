import type { BackupTrack } from "@/lib/spotify";

export type ProviderAuthorization =
  | "local_files"
  | "user_owned_media"
  | "licensed_catalog"
  | "external_tool";

export type ProviderRiskLevel = "low" | "medium" | "high";

export type ProviderStatus = "active" | "planned" | "requires_authorization";

export type ProviderCapability =
  | "search"
  | "match"
  | "download"
  | "tag"
  | "provenance";

export type CandidateScore = {
  albumScore?: number;
  artistScore: number;
  durationDeltaMs?: number;
  isrcMatch?: boolean;
  overall: number;
  titleScore: number;
  uploadDatePenalty?: number;
};

export type SourceCandidate = {
  album?: string;
  artists: string[];
  durationMs?: number;
  id: string;
  isrc?: string;
  providerId: string;
  score: CandidateScore;
  title: string;
  url?: string;
  uploadedAt?: string;
  verified: boolean;
};

export type ProviderDownloadRequest = {
  candidate: SourceCandidate;
  destinationSegments: string[];
  track: BackupTrack;
};

export type ProviderDownloadResult = {
  bytesWritten?: number;
  destinationPath: string;
  mimeType?: string;
  providerId: string;
  sourceUrl?: string;
};

export type SourceProvider = {
  authorization: ProviderAuthorization;
  capabilities: ProviderCapability[];
  description: string;
  id: string;
  name: string;
  search(track: BackupTrack): Promise<SourceCandidate[]>;
  download?(
    request: ProviderDownloadRequest
  ): Promise<ProviderDownloadResult>;
};

export type SourceProviderCatalogEntry = {
  authorization: ProviderAuthorization;
  bulkWarning: string;
  capabilities: readonly ProviderCapability[];
  description: string;
  id: string;
  name: string;
  risk: ProviderRiskLevel;
  status: ProviderStatus;
};

export const SOURCE_PROVIDER_CATALOG = [
  {
    authorization: "local_files",
    bulkWarning: "No network service involved; matching is limited to mounted files.",
    capabilities: ["match", "tag", "provenance"],
    description:
      "Matches Spotify metadata against audio files already present in the mounted Navidrome music folder.",
    id: "music-library",
    name: "Navidrome library",
    risk: "low",
    status: "active"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "YouTube Music is closed for reliable unauthenticated search, so TrackKeep does not use it in the automatic backup flow yet.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "Future candidate if a reliable user-controlled provider path is added.",
    id: "youtube-music",
    name: "YouTube Music",
    risk: "high",
    status: "planned"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "Large playlist jobs can trigger throttling, captchas, or temporary blocks from YouTube.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "SpotDL-style matching against YouTube candidates through a constrained external downloader.",
    id: "youtube",
    name: "YouTube",
    risk: "high",
    status: "requires_authorization"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "Piped needs a known public instance and mirrors YouTube results, so TrackKeep uses direct YouTube search first.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "Future alternative YouTube frontend path if a reliable instance is configured.",
    id: "piped",
    name: "Piped",
    risk: "high",
    status: "planned"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "JioSaavn access patterns and regional availability vary; bulk jobs may be blocked or violate service terms.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "JioSaavn matching path for tracks the user is authorized to download or has licensed access to.",
    id: "jiosaavn",
    name: "JioSaavn",
    risk: "high",
    status: "requires_authorization"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "Large playlist jobs can trigger throttling or temporary blocks from the provider.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "SpotDL-style matching against SoundCloud candidates through a constrained external downloader.",
    id: "soundcloud",
    name: "SoundCloud",
    risk: "medium",
    status: "planned"
  },
  {
    authorization: "external_tool",
    bulkWarning:
      "Bandcamp downloads should be limited to purchases, free downloads, or content with explicit permission.",
    capabilities: ["search", "download", "tag", "provenance"],
    description:
      "Provider path for purchased, free, or otherwise authorized Bandcamp downloads.",
    id: "bandcamp",
    name: "Bandcamp",
    risk: "medium",
    status: "planned"
  }
] as const satisfies readonly SourceProviderCatalogEntry[];

export const SPOTDL_STYLE_PROVIDER_CANDIDATES = SOURCE_PROVIDER_CATALOG.filter(
  (provider) => provider.authorization === "external_tool"
);
