import type { BackupTrack } from "@/lib/spotify";

export type ProviderAuthorization =
  | "local_files"
  | "user_owned_media"
  | "licensed_catalog"
  | "external_tool";

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

export const SPOTDL_STYLE_PROVIDER_CANDIDATES = [
  {
    authorization: "external_tool",
    id: "youtube-music",
    name: "YouTube Music"
  },
  {
    authorization: "external_tool",
    id: "youtube",
    name: "YouTube"
  },
  {
    authorization: "external_tool",
    id: "soundcloud",
    name: "SoundCloud"
  },
  {
    authorization: "external_tool",
    id: "bandcamp",
    name: "Bandcamp"
  },
  {
    authorization: "external_tool",
    id: "piped",
    name: "Piped"
  }
] as const;
