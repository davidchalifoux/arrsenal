export type InstanceKind = "radarr" | "sonarr";
export type MediaKind = "movie" | "series";
export type MediaStatus = "available" | "partial" | "missing" | "downloading";

export interface InstanceSummary {
  id: string;
  name: string;
  kind: InstanceKind;
  url: string;
  hasApiKey: boolean;
  connected: boolean;
  version?: string;
  error?: string;
}

export interface MediaTarget {
  instanceId: string;
  instanceName: string;
  remoteId: number;
  qualityProfileId: number;
  qualityProfile: string;
  quality: string;
  status: MediaStatus;
  monitored: boolean;
  sizeOnDisk: number;
  episodeCount?: number;
  episodeFileCount?: number;
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  year: number;
  overview: string;
  poster: string;
  backdrop?: string;
  genres: string[];
  rating?: number;
  runtime?: number;
  tmdbId?: number;
  tvdbId?: number;
  added: string;
  status: MediaStatus;
  targets: MediaTarget[];
}

export interface ServiceError {
  instanceId: string;
  instanceName: string;
  message: string;
}

export interface LibraryResponse {
  items: MediaItem[];
  demo: boolean;
  errors: ServiceError[];
}

export interface InstanceOptions {
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string; freeSpace?: number }[];
}

export interface QueueItem {
  id: number;
  instanceId: string;
  instanceName: string;
  title: string;
  mediaTitle: string;
  kind: MediaKind;
  poster?: string;
  quality: string;
  size: number;
  sizeleft: number;
  status: string;
  timeleft?: string;
  downloadClient?: string;
  downloadId?: string;
  warnings: string[];
}

export interface QueueResponse {
  items: QueueItem[];
  demo: boolean;
  errors: ServiceError[];
}

export interface Release {
  guid: string;
  indexerId: number;
  title: string;
  quality: string;
  size: number;
  age: number;
  seeders?: number;
  protocol: string;
  indexer: string;
  approved: boolean;
  rejections: string[];
}

export interface AddMediaRequest {
  media: MediaItem;
  targets: {
    instanceId: string;
    qualityProfileId: number;
    rootFolderPath: string;
  }[];
  search: boolean;
}

export interface ActionResponse {
  success: boolean;
  message: string;
  errors?: ServiceError[];
}
