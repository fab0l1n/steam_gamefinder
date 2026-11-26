/** Synthetic fixtures shaped like the real Steam responses (captured Nov 2026), with fake IDs. */

export const VIEWER = '76561190000000001';
export const FRIEND = '76561190000000002';
export const PRIVATE_FRIEND = '76561190000000003';
export const GROUP = 'https://steamcommunity.com/groups/TestGroup';

export function membersXml(ids: string[], page = 1, totalPages = 1): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><memberList>
<groupID64>103582791400000000</groupID64>
<groupDetails>
		<groupName><![CDATA[TestGroup]]></groupName>
		<groupURL><![CDATA[TestGroup]]></groupURL>
		<headline><![CDATA[]]></headline>
		<summary><![CDATA[No information given.]]></summary>
		<memberCount>${ids.length}</memberCount>
		<membersInChat>0</membersInChat>
</groupDetails>
<memberCount>${ids.length}</memberCount>
<totalPages>${totalPages}</totalPages>
<currentPage>${page}</currentPage>
<startingMember>0</startingMember>
<members>
${ids.map((id) => `<steamID64>${id}</steamID64>`).join('\n')}
</members>
</memberList>`;
}

export function profileXml(id: string, name: string, privacy = 'public'): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><profile>
	<steamID64>${id}</steamID64>
	<steamID><![CDATA[${name}]]></steamID>
	<onlineState>offline</onlineState>
	<privacyState>${privacy}</privacyState>
	<visibilityState>3</visibilityState>
	<avatarIcon><![CDATA[https://avatars.example/${id}.jpg]]></avatarIcon>
	<avatarMedium><![CDATA[https://avatars.example/${id}_medium.jpg]]></avatarMedium>
</profile>`;
}

/**
 * Mimics the server-rendered games page: a script with an object literal whose
 * `renderContext.queryData` is a JSON *string* holding the react-query cache.
 */
export function gamesPageHtml(steamid: string, games: { appid: number; name: string; playtime_forever: number }[] | null): string {
  const queries: unknown[] = [
    { state: { data: { steamid } }, queryKey: ['PlayerLinkDetails', steamid], queryHash: 'x' },
  ];
  if (games) queries.push({ state: { data: games, status: 'success' }, queryKey: ['OwnedGames', steamid, 'english'], queryHash: 'y' });
  const ssr = {
    loaderData: [],
    bConfig: { WEBSITE_ID: 'Community' },
    renderContext: {
      localizationSettings: { languages: [{ strLanguage: 'english' }] },
      queryData: JSON.stringify({ mutations: [], queries }),
    },
  };
  return `<!DOCTYPE html><html><head><title>Games</title></head><body><div id="root"></div>
<script>window.SSR = ${JSON.stringify(ssr)};</script></body></html>`;
}

/** A GetItems entry as Steam returns it (trimmed to the fields we read). */
export function rawItem(appid: number, over: Record<string, unknown> = {}) {
  return {
    item_type: 0,
    id: appid,
    success: 1,
    visible: true,
    name: `Game ${appid}`,
    store_url_path: `app/${appid}/Game_${appid}`,
    appid,
    type: 0,
    tagids: [122, 4747],
    assets: {
      asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1`,
      small_capsule: 'abc/capsule_231x87.jpg',
      header: 'abc/header.jpg',
    },
    release: { steam_release_date: 1691074826 },
    platforms: { windows: true, mac: false, steam_deck_compat_category: 3 },
    reviews: {
      summary_filtered: { percent_positive: 96, review_count: 765203, review_score: 9, review_score_label: 'Overwhelmingly Positive' },
    },
    best_purchase_option: {
      discount_pct: 30,
      final_price_in_cents: '4199',
      formatted_final_price: '41,99€',
      formatted_original_price: '59,99€',
      hide_discount_pct_for_compliance: false,
    },
    basic_info: { short_description: 'A game.' },
    screenshots: { all_ages_screenshots: [{ filename: `steam/apps/${appid}/ss_1.jpg?t=1`, ordinal: 1 }] },
    ...over,
  };
}
