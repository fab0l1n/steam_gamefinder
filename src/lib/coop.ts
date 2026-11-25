/** co-optimus.com API (`api.co-optimus.com/games.php?search=true&steam=<appid>`), XML responses. */
import type { CoopInfo } from './types';

export const COOPTIMUS_API = 'https://api.co-optimus.com/games.php';

export function coOptimusUrl(appid: number): string {
  return `${COOPTIMUS_API}?search=true&steam=${appid}`;
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

export function coopLabel(c: CoopInfo | null | undefined): string {
  if (!c) return '';
  const n = coopPlayers(c);
  return n > 0 ? `${n} Player Co-op` : 'Co-op';
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
