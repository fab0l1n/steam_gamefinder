/** co-optimus.com API (`api.co-optimus.com/games.php?search=true&steam=<appid>`), XML responses. */
import type { CoopInfo } from './types';

export const COOPTIMUS_API = 'https://api.co-optimus.com/games.php';
export const COOPTIMUS_SITE = 'https://www.co-optimus.com';

export function coOptimusUrl(appid: number): string {
  return `${COOPTIMUS_API}?search=true&steam=${appid}`;
}

export function coOptimusNameUrl(name: string): string {
  return `${COOPTIMUS_API}?search=true&systemName=PC&name=${encodeURIComponent(name)}`;
}

/** "Bellwright" -> "bellwright", "Baldur's Gate 3" -> "baldur-s-gate-3" (co-optimus URL slugs). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Loose title key for comparing Steam and co-optimus names. */
export function titleKey(name: string): string {
  return slugify(name.replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')).replace(/-/g, '');
}

function tag(xml: string, name: string): string {
  return xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1].trim() ?? '';
}

/**
 * Picks the PC entry for `appid` from a games.php response (a search can also return console
 * versions of the same game). Returns null when co-optimus doesn't list the game.
 * Regex-based on purpose: the background service worker has no DOMParser.
 */
export function parseCoOptimus(xml: string, appid: number): CoopInfo | null {
  const games = [...xml.matchAll(/<game>([\s\S]*?)<\/game>/g)].map((m) => m[1]);
  const pick =
    games.find((g) => tag(g, 'steam') === String(appid)) ??
    games.find((g) => tag(g, 'system') === 'PC' && !tag(g, 'steam'));
  if (!pick || tag(pick, 'steam') !== String(appid)) return null;
  const n = (name: string) => Number.parseInt(tag(pick, name), 10) || 0;
  return {
    source: 'co-optimus',
    online: n('online'),
    local: n('local'),
    lan: n('lan'),
    splitscreen: n('splitscreen') > 0,
    dropIn: n('dropindropout') > 0,
    campaign: n('campaign') > 0,
    url: tag(pick, 'url') || null,
  };
}

/** The headline number for "X Player Co-op": online first, else the bigger of LAN and couch. */
export function coopPlayers(c: CoopInfo): number {
  return c.online > 0 ? c.online : Math.max(c.lan, c.local);
}

/** "X Player Co-op", or '' unless co-optimus gave us a player count. */
export function coopLabel(c: CoopInfo | null | undefined): string {
  if (!c || c.source !== 'co-optimus') return '';
  const n = coopPlayers(c);
  return n > 0 ? `${n} Player Co-op` : '';
}

export function coopDetails(c: CoopInfo): string {
  if (c.source === 'steam') return 'Steam lists this game as co-op; co-optimus has no player counts for it.';
  const parts = [
    c.online ? `Online ${c.online}` : '',
    c.lan ? `LAN ${c.lan}` : '',
    c.local ? `Couch ${c.local}` : '',
    c.splitscreen ? 'split screen' : '',
    c.dropIn ? 'drop-in/drop-out' : '',
    c.campaign ? 'campaign co-op' : '',
  ].filter(Boolean);
  return `${parts.join(' · ')} (co-optimus.com)`;
}

/** API search by name: the PC entry whose title matches the Steam name (the API ignores AppIDs it lacks). */
export function parseCoOptimusByName(xml: string, name: string): CoopInfo | null {
  const want = titleKey(name);
  const games = [...xml.matchAll(/<game>([\s\S]*?)<\/game>/g)].map((m) => m[1]);
  const pick = games.find((g) => tag(g, 'system') === 'PC' && titleKey(tag(g, 'title')) === want);
  if (!pick) return null;
  const n = (k: string) => Number.parseInt(tag(pick, k), 10) || 0;
  return {
    source: 'co-optimus',
    online: n('online'),
    local: n('local'),
    lan: n('lan'),
    splitscreen: n('splitscreen') > 0,
    dropIn: n('dropindropout') > 0,
    campaign: n('campaign') > 0,
    url: tag(pick, 'url') || null,
  };
}

/**
 * Website fallback, step 1: `/related-news/<slug>` links to the game's own page(s). Prefers the PC
 * page whose slug equals ours; otherwise the first PC page (verified by Steam AppID in step 2).
 */
export function findSiteGamePath(html: string, slug: string): string | null {
  const paths = [...new Set([...html.matchAll(/\/game\/(\d+)\/pc\/([a-z0-9-]+)\.html/gi)].map((m) => m[0].toLowerCase()))];
  return paths.find((p) => p.endsWith(`/${slug}.html`)) ?? paths[0] ?? null;
}

function players(text: string): number {
  const nums = (text.match(/\d+/g) ?? []).map(Number);
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Website fallback, step 2: parse a game page (`/game/<id>/pc/<slug>.html`). Its "Core Features"
 * list reads e.g. "Online Co-Op: 4 Players", "Local Co-Op: Not Supported". Returns null when the
 * page links a different Steam app than `appid`.
 */
export function parseSiteGamePage(html: string, appid: number, url: string): { coop: CoopInfo | null; steamId: number | null } {
  const steamId = Number(html.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1] ?? NaN) || null;
  if (steamId != null && steamId !== appid) return { coop: null, steamId };
  const start = html.indexOf('id="coop-features"');
  if (start < 0) return { coop: null, steamId };
  const block = html.slice(start, html.indexOf('</dl>', start));
  const features = new Map<string, string>();
  for (const m of block.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    features.set(m[1].replace(/<[^>]+>/g, '').trim().toLowerCase(), m[2].replace(/<[^>]+>/g, ' ').trim());
  }
  const get = (prefix: string) => [...features].find(([k]) => k.startsWith(prefix))?.[1] ?? '';
  const coop: CoopInfo = {
    source: 'co-optimus',
    online: players(get('online co-op')),
    local: players(get('local co-op')),
    lan: players(get('lan')),
    splitscreen: false,
    dropIn: false,
    campaign: false,
    url,
  };
  return { coop: coop.online || coop.local || coop.lan ? coop : null, steamId };
}
