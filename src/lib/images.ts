/** Screenshots for the hover preview: small variants, preloaded and remembered for this page only. */
import type { GameInfo } from './types';

export interface PreviewImage {
  src: string;
  /** Tried when `src` fails (the full-size original). */
  fallback?: string;
}

export const PREVIEW_SHOTS = 3;

/**
 * Steam serves every store screenshot also as `….600x338.jpg` (what its own store page carousel
 * uses). The preview is about 300 px wide, and the originals are up to 3840 px: ~1 s to load
 * instead of a few dozen ms.
 */
export function smallScreenshot(url: string): string {
  return /\/ss_[^/]+\.jpg(\?|$)/.test(url) ? url.replace(/\.jpg(\?|$)/, '.600x338.jpg$1') : url;
}

/** The first screenshots of a game, or its header image when it has none. */
export function previewImages(info: Pick<GameInfo, 'screenshots' | 'header'>, max = PREVIEW_SHOTS): PreviewImage[] {
  const shots = info.screenshots.slice(0, max).map((u) => {
    const src = smallScreenshot(u);
    return src === u ? { src } : { src, fallback: u };
  });
  if (shots.length) return shots;
  return info.header ? [{ src: info.header }] : [];
}

/**
 * Load results for this page session, in memory only: nothing goes to extension storage, and it is
 * gone when the page is closed or reloaded. (The browser's own image cache works as for any page.)
 */
const results = new Map<string, Promise<string | null>>();
const settled = new Map<string, string | null>();
/** Recently shown images stay referenced so the browser keeps them decoded. */
const recent: HTMLImageElement[] = [];
const KEEP_DECODED = 30;

function loadOne(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // decode() so the first paint in the preview doesn't stutter; a failure there is harmless.
      img.decode().catch(() => {}).finally(() => {
        recent.push(img);
        if (recent.length > KEEP_DECODED) recent.shift();
        resolve(true);
      });
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Loads an image (or its fallback) once per session; resolves to the URL that worked, or null. */
export function preloadImage(image: PreviewImage): Promise<string | null> {
  let p = results.get(image.src);
  if (!p) {
    p = loadOne(image.src)
      .then((ok) => (ok ? image.src : image.fallback ? loadOne(image.fallback).then((ok2) => (ok2 ? image.fallback! : null)) : null))
      .then((url) => {
        settled.set(image.src, url);
        return url;
      });
    results.set(image.src, p);
  }
  return p;
}

/** The loaded URL if this image has finished loading already (undefined while unknown). */
export function loadedImage(image: PreviewImage): string | null | undefined {
  return settled.get(image.src);
}

/** Resolves after `ms` at the latest. */
export const atMost = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
