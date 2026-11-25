/** Typed messages between the content script and the background worker. */
import type { CoopInfo, GameInfo, ViewerStoreData, WishlistEntry } from './types';

export type BgRequest =
  | { type: 'viewerStore' }
  | { type: 'wishlist'; steamid: string; tryLogin: boolean }
  | { type: 'storeItems'; appids: number[]; language: string; country: string | null }
  | { type: 'tags'; language: string }
  | { type: 'coop'; items: { appid: number; name: string }[] };

export interface CoopResult {
  /** appid -> counts, or null when co-optimus doesn't list it. */
  found: Record<number, CoopInfo | null>;
  /** appids whose lookup failed (not cached, retried next time). */
  failed: number[];
  lastError?: string;
  /** One line per app describing which source answered (for the debug log). */
  trace: string[];
}

export interface WishlistResult {
  entries: WishlistEntry[];
  /** 'public' = keyless call worked, 'login' = needed the viewer's Steam login, null = nothing visible. */
  via: 'public' | 'login' | null;
  /** Whether a logged-in attempt was possible (viewer signed in to the store). */
  loginAvailable: boolean;
}

export type BgResponseMap = {
  viewerStore: ViewerStoreData;
  wishlist: WishlistResult;
  storeItems: GameInfo[];
  tags: Record<number, string>;
  coop: CoopResult;
};

export type BgEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };
