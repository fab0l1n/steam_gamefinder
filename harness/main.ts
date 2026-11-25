import { mount } from 'svelte';
import App from '../src/components/App.svelte';
import { buildRows } from '../src/lib/aggregate';
import { DEFAULT_SETTINGS, type DataSource, type UiSettings } from '../src/lib/source';
import type { GameInfo, LoadSnapshot, Member } from '../src/lib/types';

/** Placeholder art (the harness runs without network access to Steam's CDN). */
function art(label: string, hue: number, w = 231, h = 87): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,35%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,18%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="56%" fill="white" font-family="Arial" font-size="${h / 4}" font-weight="bold" text-anchor="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const ME = '76561190000000001';
const VITU = '76561190000000002';
const SHY = '76561190000000003';
const KAI = '76561190000000004';
const MO = '76561190000000005';
const LU = '76561190000000006';
const RIN = '76561190000000007';

const members: Member[] = [
  { steamid: ME, name: 'fab0l1n', avatar: art('F', 200, 64, 64), profilePrivacy: 'friendsonly', isViewer: true,
    wishlist: { state: 'ok', count: 4, via: 'login', fetchedAt: Date.now() }, library: { state: 'ok', count: 2054, via: 'store', fetchedAt: Date.now() } },
  { steamid: VITU, name: 'Vitu', avatar: art('V', 20, 64, 64), profilePrivacy: 'public', isViewer: false,
    wishlist: { state: 'ok', count: 5, via: 'public', fetchedAt: Date.now() }, library: { state: 'ok', count: 230, via: 'login', fetchedAt: Date.now() } },
  { steamid: KAI, name: 'Kai', avatar: art('K', 120, 64, 64), profilePrivacy: 'public', isViewer: false,
    wishlist: { state: 'ok', count: 2, via: 'public', fetchedAt: Date.now() }, library: { state: 'ok', count: 310, via: 'login', fetchedAt: Date.now() } },
  { steamid: MO, name: 'Mo', avatar: art('M', 330, 64, 64), profilePrivacy: 'friendsonly', isViewer: false,
    wishlist: { state: 'ok', count: 1, via: 'login', fetchedAt: Date.now() }, library: { state: 'ok', count: 95, via: 'login', fetchedAt: Date.now() } },
  { steamid: LU, name: 'Lu', avatar: art('L', 50, 64, 64), profilePrivacy: 'public', isViewer: false,
    wishlist: { state: 'ok', count: 1, via: 'public', fetchedAt: Date.now() }, library: { state: 'ok', count: 40, via: 'login', fetchedAt: Date.now() } },
  { steamid: RIN, name: 'Rin', avatar: art('R', 240, 64, 64), profilePrivacy: 'public', isViewer: false,
    wishlist: { state: 'ok', count: 1, via: 'public', fetchedAt: Date.now() }, library: { state: 'ok', count: 512, via: 'login', fetchedAt: Date.now() } },
  { steamid: SHY, name: 'ShyPlayer', avatar: art('S', 280, 64, 64), profilePrivacy: 'private', isViewer: false,
    wishlist: { state: 'hidden', error: 'Steam returned no wishlist, even with your login: private, friends-only (and you are not friends), or empty.' },
    library: { state: 'hidden', error: 'Steam showed no games: game details are private or friends-only.' } },
];

function g(appid: number, name: string, hue: number, o: Partial<GameInfo> = {}): GameInfo {
  return {
    appid, available: true, name, type: 0, storeUrl: `https://store.steampowered.com/app/${appid}`,
    capsule: art(name.split(' ')[0], hue), header: art(name, hue, 460, 215),
    releaseDate: 1691074826, releaseText: '3 Aug, 2023', comingSoon: false,
    review: { score: 9, label: 'Overwhelmingly Positive', percent: 96, count: 765203 },
    price: { isFree: false, final: '59,99€', original: null, discountPct: 0, finalCents: 5999 },
    platforms: { windows: true, mac: false, linux: false, deck: 3 },
    tagids: [1, 2, 3, 4], screenshots: [art(name, hue + 20, 640, 360)],
    shortDescription: 'A story-rich, party-based RPG where your choices shape a tale of fellowship and betrayal.',
    ...o,
  };
}

const games = new Map<number, GameInfo>([
  [1086940, g(1086940, "Baldur's Gate 3", 20, { tagids: [1, 2, 3, 4, 8], price: { isFree: false, final: '41,99€', original: '59,99€', discountPct: 30, finalCents: 4199 } })],
  [892970, g(892970, 'Valheim', 160, { tagids: [5, 2, 7, 9], releaseText: '2 Feb, 2021', review: { score: 8, label: 'Very Positive', percent: 93, count: 490441 }, price: { isFree: false, final: '19,99€', original: null, discountPct: 0, finalCents: 1999 } })],
  [3065800, g(3065800, 'Marathon', 120, { tagids: [6, 7, 2], releaseText: '5 Mar, 2026', review: { score: 6, label: 'Mixed', percent: 62, count: 18003 }, price: { isFree: false, final: '26,99€', original: '59,99€', discountPct: 55, finalCents: 2699 } })],
  [4244510, g(4244510, 'Pratfall', 300, { tagids: [7, 2, 10], releaseText: '7 Sep, 2026', review: { score: 8, label: 'Very Positive', percent: 88, count: 2004 }, price: { isFree: false, final: '7,49€', original: null, discountPct: 0, finalCents: 749 }, platforms: { windows: true, mac: true, linux: true, deck: 3 } })],
  [4031890, g(4031890, 'Palworld: Palfarm', 90, { tagids: [5, 9, 2], releaseDate: null, releaseText: 'To be announced', comingSoon: true, review: null, price: null })],
  [730, g(730, 'Counter-Strike 2', 40, { tagids: [6, 7], releaseText: '21 Aug, 2012', price: { isFree: true, final: 'Free', original: null, discountPct: 0, finalCents: 0 } })],
  [2627260, g(2627260, 'NINJA GAIDEN 4', 0, { tagids: [8, 4], releaseText: '21 Oct, 2025', review: { score: 3, label: 'Mostly Negative', percent: 31, count: 4100 }, price: { isFree: false, final: '34,99€', original: '69,99€', discountPct: 50, finalCents: 3499 } })],
]);

const wishlists = new Map([
  [ME, [{ appid: 892970, addedAt: 1700000000 }, { appid: 3065800, addedAt: 1745000000 }, { appid: 4244510, addedAt: 1757000000 }, { appid: 2627260, addedAt: 1742000000 }]],
  [KAI, [{ appid: 3065800, addedAt: 1746000000 }, { appid: 4244510, addedAt: 1758000000 }]],
  [MO, [{ appid: 3065800, addedAt: 1747000000 }]],
  [LU, [{ appid: 3065800, addedAt: 1748000000 }]],
  [RIN, [{ appid: 3065800, addedAt: 1749000000 }]],
  [VITU, [{ appid: 3065800, addedAt: 1745500000 }, { appid: 4244510, addedAt: 1757200000 }, { appid: 4031890, addedAt: 1772500000 }, { appid: 1086940, addedAt: 1740000000 }, { appid: 730, addedAt: 1600000000 }]],
]);
const libraries = new Map([
  [ME, new Map([[1086940, 0]])],
  [VITU, new Map([[892970, 4140], [1086940, 9960]])],
  [KAI, new Map([[1086940, 3000], [892970, 600], [730, 12000]])],
  [MO, new Map([[1086940, 50], [892970, 1200]])],
  [LU, new Map([[1086940, 700]])],
  [RIN, new Map([[1086940, 4400]])],
]);
const rows = buildRows({ members, wishlists, libraries, games, viewer: { loggedIn: true, owned: [1086940, 730], wishlist: [892970, 3065800, 4244510, 2627260] } });

const done: LoadSnapshot = {
  phase: 'done', message: '', groupName: 'Spielpltz', members, rows,
  viewer: { steamid: ME, loggedIn: true }, updatedAt: Date.now() - 4 * 60e3,
};

let settings: UiSettings = { ...DEFAULT_SETTINGS };
const source: DataSource = {
  async load(_force, _s, emit) {
    emit({ ...done, phase: 'wishlists', message: 'Loaded 1 of 3 members…', rows: [] });
    await new Promise((r) => setTimeout(r, 150));
    emit(done);
  },
  async tags() {
    return { 1: 'RPG', 2: 'Online Co-Op', 3: 'Story Rich', 4: 'Fantasy', 5: 'Survival', 6: 'Shooter', 7: 'Multiplayer', 8: 'Singleplayer', 9: 'Open World', 10: 'Party Game' };
  },
  async getSettings() {
    return settings;
  },
  async saveSettings(s) {
    settings = s;
  },
};

mount(App, { target: document.getElementById('app')!, props: { source } });
