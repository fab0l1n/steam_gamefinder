/** Shared data model. Everything here is plain data so it can cross the extension message boundary. */

export type SteamId = string;

/** Load state of one data source (wishlist or library) for one member. */
export type SourceState =
  | 'loading'
  | 'ok'
  /** Steam returned nothing: private / friends-only, or genuinely empty. */
  | 'hidden'
  /** Needs the viewer to be signed in to Steam. */
  | 'signin'
  | 'error'
  /** Not requested (e.g. library loading switched off). */
  | 'skipped';

export interface SourceStatus {
  state: SourceState;
  count?: number;
  /** How the data was obtained. */
  via?: 'public' | 'login' | 'store';
  fetchedAt?: number;
  /** Served from cache because the refresh failed. */
  stale?: boolean;
  error?: string;
}

export interface Member {
  steamid: SteamId;
  name: string;
  avatar: string | null;
  profilePrivacy: 'public' | 'friendsonly' | 'private' | 'unknown';
  isViewer: boolean;
  wishlist: SourceStatus;
  library: SourceStatus;
}

export interface WishlistEntry {
  appid: number;
  /** Unix seconds; 0 when unknown (e.g. taken from the viewer's store data). */
  addedAt: number;
}

export interface OwnedGame {
  appid: number;
  name: string;
  /** Minutes. */
  playtime: number;
}

/** Steam store item type (EStoreAppType). */
export const StoreAppType = {
  Game: 0,
  Demo: 1,
  Mod: 2,
  Movie: 3,
  Dlc: 4,
  Guide: 5,
  Software: 6,
  Video: 7,
  Series: 8,
  Episode: 9,
  Hardware: 10,
  Music: 11,
  Beta: 12,
  Tool: 13,
  Advertising: 14,
} as const;

export interface ReviewSummary {
  /** 1 (overwhelmingly negative) .. 9 (overwhelmingly positive); 0 = no score. */
  score: number;
  label: string;
  percent: number;
  count: number;
}

export interface PriceInfo {
  isFree: boolean;
  final: string | null;
  original: string | null;
  discountPct: number;
  /** For sorting, in the currency's minor unit. */
  finalCents: number | null;
}

/** Compact, display-ready store data for one app. */
export interface GameInfo {
  appid: number;
  available: boolean;
  name: string;
  type: number;
  storeUrl: string;
  capsule: string | null;
  header: string | null;
  /** Unix seconds; null when unreleased. */
  releaseDate: number | null;
  releaseText: string;
  comingSoon: boolean;
  review: ReviewSummary | null;
  price: PriceInfo | null;
  platforms: { windows: boolean; mac: boolean; linux: boolean; deck: number };
  tagids: number[];
  screenshots: string[];
  shortDescription: string;
}

export interface ViewerStoreData {
  loggedIn: boolean;
  owned: number[];
  wishlist: number[];
}

export interface GameRow {
  info: GameInfo;
  wishlistedBy: { steamid: SteamId; addedAt: number }[];
  /** Playtime in minutes (0 when unknown, e.g. the viewer's own store data). */
  ownedBy: { steamid: SteamId; playtime: number }[];
  viewerOwns: boolean;
  viewerWishlisted: boolean;
}

export interface LoadSnapshot {
  phase: 'members' | 'wishlists' | 'details' | 'done' | 'error';
  message: string;
  groupName: string;
  members: Member[];
  rows: GameRow[];
  viewer: { steamid: SteamId | null; loggedIn: boolean };
  updatedAt: number | null;
  error?: string;
}
