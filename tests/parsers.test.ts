import { describe, expect, it } from 'vitest';
import {
  groupBaseFromUrl,
  parseMembersXml,
  parseOwnedGamesPage,
  parseProfileXml,
  readPageContext,
} from '../src/lib/steam/community';
import {
  buildGetItemsUrl,
  formatReleaseDate,
  mapGetItemsResponse,
  mapStoreItem,
  parseUserData,
  parseWishlistResponse,
} from '../src/lib/steam/store';
import { FRIEND, VIEWER, gamesPageHtml, membersXml, profileXml, rawItem } from './fixtures';

describe('community parsers', () => {
  it('parses the member list XML', () => {
    const page = parseMembersXml(membersXml([VIEWER, FRIEND], 1, 3));
    expect(page).toMatchObject({ groupName: 'TestGroup', memberCount: 2, totalPages: 3, currentPage: 1 });
    expect(page.steamIds).toEqual([VIEWER, FRIEND]);
  });

  it('rejects responses that are not a member list', () => {
    expect(() => parseMembersXml('<html>Sorry!</html>')).toThrow(/member list/);
  });

  it('parses profile XML and rejects errors', () => {
    expect(parseProfileXml(profileXml(FRIEND, 'Vitu', 'friendsonly'))).toEqual({
      steamid: FRIEND,
      name: 'Vitu',
      avatar: `https://avatars.example/${FRIEND}_medium.jpg`,
      privacy: 'friendsonly',
    });
    expect(parseProfileXml('<response><error><![CDATA[The specified profile could not be found.]]></error></response>')).toBeNull();
  });

  it('extracts owned games from the server-rendered games page', () => {
    const games = parseOwnedGamesPage(
      gamesPageHtml(FRIEND, [
        { appid: 730, name: 'Counter-Strike 2', playtime_forever: 38340 },
        { appid: 1086940, name: "Baldur's Gate 3", playtime_forever: 9960 },
      ]),
    );
    expect(games).toEqual([
      { appid: 730, name: 'Counter-Strike 2', playtime: 38340 },
      { appid: 1086940, name: "Baldur's Gate 3", playtime: 9960 },
    ]);
  });

  it('returns null when the games page carries no library (logged out / private)', () => {
    expect(parseOwnedGamesPage(gamesPageHtml(FRIEND, null))).toBeNull();
    expect(parseOwnedGamesPage('<html><body>Sign in</body></html>')).toBeNull();
  });

  it('reads viewer, language and country from the page', () => {
    expect(
      readPageContext({
        configJson: JSON.stringify({ LANGUAGE: 'german', COUNTRY: 'DE' }),
        userInfoJson: JSON.stringify({ logged_in: true, steamid: VIEWER, country_code: 'AT' }),
      }),
    ).toEqual({ viewerSteamId: VIEWER, loggedIn: true, language: 'german', country: 'AT' });

    // Fallbacks: inline script globals and the language cookie.
    expect(
      readPageContext({ scriptsText: `var x; g_steamID = "${VIEWER}";`, cookie: 'a=b; Steam_Language=french' }),
    ).toEqual({ viewerSteamId: VIEWER, loggedIn: true, language: 'french', country: null });

    expect(readPageContext({ scriptsText: 'g_steamID = false;' })).toMatchObject({ viewerSteamId: null, loggedIn: false, language: 'english' });
  });

  it('finds the group base URL', () => {
    expect(groupBaseFromUrl('https://steamcommunity.com/groups/Spielpltz#wishlists')).toBe('https://steamcommunity.com/groups/Spielpltz');
    expect(groupBaseFromUrl('https://steamcommunity.com/groups/Spielpltz/discussions/0/')).toBe('https://steamcommunity.com/groups/Spielpltz');
    expect(groupBaseFromUrl('https://steamcommunity.com/gid/103582791476276054')).toBe('https://steamcommunity.com/gid/103582791476276054');
    expect(groupBaseFromUrl('https://steamcommunity.com/id/someone')).toBeNull();
  });
});

describe('store parsers', () => {
  it('maps a full GetItems entry', () => {
    const g = mapStoreItem(rawItem(1086940), 1086940);
    expect(g).toMatchObject({
      appid: 1086940,
      available: true,
      name: 'Game 1086940',
      storeUrl: 'https://store.steampowered.com/app/1086940/Game_1086940',
      capsule: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/abc/capsule_231x87.jpg?t=1',
      releaseText: '3 Aug, 2023',
      comingSoon: false,
      review: { score: 9, label: 'Overwhelmingly Positive', percent: 96, count: 765203 },
      price: { isFree: false, final: '41,99€', original: '59,99€', discountPct: 30, finalCents: 4199 },
      platforms: { windows: true, mac: false, linux: false, deck: 3 },
    });
    expect(g.screenshots).toEqual(['https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_1.jpg?t=1']);
  });

  it('handles free, coming-soon, undiscounted and missing apps', () => {
    const free = mapStoreItem(rawItem(730, { is_free: true, best_purchase_option: undefined }), 730);
    expect(free.price).toEqual({ isFree: true, final: 'Free', original: null, discountPct: 0, finalCents: 0 });

    const soon = mapStoreItem(
      rawItem(4031890, {
        release: { is_coming_soon: true, custom_release_date_message: 'To be announced', coming_soon_display: 'text_tba' },
        best_purchase_option: undefined,
        reviews: undefined,
      }),
      4031890,
    );
    expect(soon).toMatchObject({ comingSoon: true, releaseDate: null, releaseText: 'To be announced', price: null, review: null });

    const full = mapStoreItem(rawItem(1, { best_purchase_option: { formatted_final_price: '19,99€', discount_pct: 0 } }), 1);
    expect(full.price).toMatchObject({ final: '19,99€', original: null, discountPct: 0 });

    const gone = mapGetItemsResponse({ response: { store_items: [{ id: 5, success: 2 }] } }, [5, 6]);
    expect(gone.map((g) => [g.appid, g.available, g.name])).toEqual([
      [5, false, 'App 5 (not on the store)'],
      [6, false, 'App 6 (not on the store)'],
    ]);
  });

  it('keeps a 200-app GetItems URL under the length Steam accepts', () => {
    const ids = Array.from({ length: 200 }, (_, i) => 4_000_000 + i);
    expect(buildGetItemsUrl(ids, 'english', 'DE').length).toBeLessThan(7600);
  });

  it('parses wishlists and store user data', () => {
    expect(parseWishlistResponse({ response: {} })).toEqual([]);
    expect(parseWishlistResponse({ response: { items: [{ appid: 10, priority: 0, date_added: 5 }] } })).toEqual([{ appid: 10, addedAt: 5 }]);
    expect(parseUserData({ rgWishlist: [], rgOwnedApps: [], rgOwnedPackages: [] }).loggedIn).toBe(false);
    expect(parseUserData({ rgWishlist: [1], rgOwnedApps: [2, 3], rgOwnedPackages: [] })).toEqual({ loggedIn: true, owned: [2, 3], wishlist: [1] });
  });

  it('formats release dates like Steam search', () => {
    expect(formatReleaseDate(1691074826)).toBe('3 Aug, 2023');
  });
});

describe('release dates', () => {
  // Values as Steam returned them for coming-soon games (25 Nov 2026).
  it('keeps planned dates and shows them like Steam search', async () => {
    const { mapRelease } = await import('../src/lib/steam/store');
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'date_full', steam_release_date: 1795651200 }, true)).toEqual({
      releaseDate: 1795651200,
      releaseText: '26 Nov, 2026',
      comingSoon: true,
    });
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'date_month', steam_release_date: 1798704000 }, true).releaseText).toBe('December 2026');
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'date_quarter', steam_release_date: 1798704000 }, true).releaseText).toBe('Q4 2026');
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'date_year', steam_release_date: 1798704000 }, true).releaseText).toBe('2026');
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'text_tba', custom_release_date_message: 'To be announced' }, true)).toEqual({
      releaseDate: null,
      releaseText: 'To be announced',
      comingSoon: true,
    });
    expect(mapRelease({ is_coming_soon: true, coming_soon_display: 'text_comingsoon' }, true).releaseText).toBe('Coming soon');
    expect(mapRelease({ steam_release_date: 1691074826 }, true)).toEqual({ releaseDate: 1691074826, releaseText: '3 Aug, 2023', comingSoon: false });
  });
});
