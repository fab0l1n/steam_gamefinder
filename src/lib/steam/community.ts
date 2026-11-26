/**
 * Parsers for steamcommunity.com responses. Pure functions (no DOM, no network) so they run in
 * the content script, the background and the unit tests alike.
 */
import type { OwnedGame, SteamId } from '../types';

function xmlTag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1].trim() : null;
}

export interface MembersPage {
  groupId: string | null;
  groupName: string;
  memberCount: number;
  totalPages: number;
  currentPage: number;
  steamIds: SteamId[];
}

/** Parses `/groups/<name>/memberslistxml/?xml=1[&p=N]`. Throws if it isn't a member list. */
export function parseMembersXml(xml: string): MembersPage {
  if (!xml.includes('<memberList>')) {
    throw new Error('Not a group member list (the group may be private or the URL wrong)');
  }
  const steamIds = [...xml.matchAll(/<steamID64>(\d{17})<\/steamID64>/g)].map((m) => m[1]);
  return {
    groupId: xmlTag(xml, 'groupID64'),
    groupName: xmlTag(xml, 'groupName') ?? '',
    memberCount: Number(xmlTag(xml, 'memberCount') ?? steamIds.length) || steamIds.length,
    totalPages: Number(xmlTag(xml, 'totalPages') ?? 1) || 1,
    currentPage: Number(xmlTag(xml, 'currentPage') ?? 1) || 1,
    steamIds,
  };
}

export interface ProfileSummary {
  steamid: SteamId;
  name: string;
  avatar: string | null;
  privacy: 'public' | 'friendsonly' | 'private' | 'unknown';
}

/** Parses `/profiles/<id>/?xml=1`. Returns null for error responses. */
export function parseProfileXml(xml: string): ProfileSummary | null {
  const steamid = xmlTag(xml, 'steamID64');
  if (!steamid || !xml.includes('<profile>')) return null;
  const privacy = xmlTag(xml, 'privacyState');
  return {
    steamid,
    name: xmlTag(xml, 'steamID') ?? steamid,
    avatar: xmlTag(xml, 'avatarMedium') || xmlTag(xml, 'avatarIcon'),
    privacy:
      privacy === 'public' || privacy === 'friendsonly' || privacy === 'private' ? privacy : 'unknown',
  };
}

function isUnescapedQuote(s: string, pos: number): boolean {
  if (s[pos] !== '"') return false;
  let backslashes = 0;
  for (let j = pos - 1; j >= 0 && s[j] === '\\'; j--) backslashes++;
  return backslashes % 2 === 0;
}

/**
 * Steam's profile games page (`/profiles/<id>/games/?tab=all`) is server-rendered and embeds its
 * react-query cache as a JSON string (`"queryData":"{\"mutations\":[],\"queries\":[...]}"`).
 * When the viewer may see the library, that cache holds a query keyed `["OwnedGames", steamid, lang]`.
 *
 * Returns the owned games, or null when the page carries no OwnedGames query (logged out,
 * private library, or Steam changed the page).
 */
export function parseOwnedGamesPage(html: string): OwnedGame[] | null {
  const hit = /queryKey\\*":\[\\*"OwnedGames\\*"/.exec(html);
  if (!hit) return null;

  // Walk out to the JSON string literal that contains the query cache.
  let start = hit.index;
  while (start > 0 && !isUnescapedQuote(html, start)) start--;
  let end = hit.index;
  while (end < html.length && !isUnescapedQuote(html, end)) end++;
  if (start <= 0 || end >= html.length) return null;

  let value: unknown = html.slice(start, end + 1);
  try {
    // The literal may be nested one or more string levels deep; unwrap until we hit an object.
    for (let i = 0; i < 4 && typeof value === 'string'; i++) value = JSON.parse(value);
  } catch {
    return null;
  }
  const queries = (value as { queries?: unknown[] } | null)?.queries;
  if (!Array.isArray(queries)) return null;

  const query = queries.find(
    (q) => Array.isArray((q as { queryKey?: unknown[] }).queryKey) && (q as { queryKey: unknown[] }).queryKey[0] === 'OwnedGames',
  ) as { state?: { data?: unknown } } | undefined;
  const data = query?.state?.data as unknown;
  const list = Array.isArray(data) ? data : (data as { games?: unknown[] } | undefined)?.games;
  if (!Array.isArray(list)) return null;

  return list
    .map((g) => g as { appid?: number; name?: string; playtime_forever?: number })
    .filter((g) => typeof g.appid === 'number')
    .map((g) => ({ appid: g.appid as number, name: g.name ?? '', playtime: g.playtime_forever ?? 0 }));
}

export interface PageContext {
  viewerSteamId: SteamId | null;
  loggedIn: boolean;
  /** Steam language name, e.g. "english", "german". */
  language: string;
  /** ISO country for prices, if Steam told us. */
  country: string | null;
}

/**
 * Reads the viewer, language and country from a Steam page. Works on the raw attribute values of
 * `#application_config` plus the inline scripts, so the content script never needs page globals.
 */
export function readPageContext(input: {
  configJson?: string | null;
  userInfoJson?: string | null;
  scriptsText?: string;
  cookie?: string;
}): PageContext {
  const safeParse = (s?: string | null): Record<string, unknown> => {
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const config = safeParse(input.configJson);
  const user = safeParse(input.userInfoJson);
  const scripts = input.scriptsText ?? '';

  let steamid =
    (typeof user.steamid === 'string' && /^\d{17}$/.test(user.steamid) ? user.steamid : null) ??
    scripts.match(/g_steamID\s*=\s*"(\d{17})"/)?.[1] ??
    null;
  if (user.logged_in === false) steamid = null;

  const cookieLang = input.cookie?.match(/(?:^|;\s*)Steam_Language=([a-z]+)/)?.[1];
  const language =
    (typeof config.LANGUAGE === 'string' && config.LANGUAGE) ||
    scripts.match(/g_strLanguage\s*=\s*"([a-z]+)"/)?.[1] ||
    cookieLang ||
    'english';

  const country =
    (typeof user.country_code === 'string' && user.country_code) ||
    (typeof config.COUNTRY === 'string' && config.COUNTRY) ||
    null;

  return { viewerSteamId: steamid, loggedIn: !!steamid, language, country };
}

/** `https://steamcommunity.com/groups/<name>` or `/gid/<id>` for a URL inside a group, else null. */
export function groupBaseFromUrl(url: string): string | null {
  const u = new URL(url);
  if (u.hostname !== 'steamcommunity.com') return null;
  const m = u.pathname.match(/^\/(groups\/[^/]+|gid\/\d+)/);
  return m ? `https://steamcommunity.com/${m[1]}` : null;
}
