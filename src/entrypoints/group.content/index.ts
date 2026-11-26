import { mount, unmount } from 'svelte';
import App from '@/components/App.svelte';
import { createCache, type KvStore } from '@/lib/cache';
import { loadGroup, loadTags, type BgCall } from '@/lib/loader';
import type { BgEnvelope } from '@/lib/messages';
import { DEFAULT_SETTINGS, type DataSource, type UiSettings } from '@/lib/source';
import { groupBaseFromUrl, readPageContext } from '@/lib/steam/community';
import { createTabSwitch, initialHash, STEAM_HIDE_CSS } from '@/lib/tab-switch';

const TAB_HASH = '#wishlists';
const SETTINGS_KEY = 'sgf:settings';
const PRUNE_KEY = 'sgf:lastPrune';
const presetsKey = (groupBase: string) => `sgf:presets:${groupBase}`;

export default defineContentScript({
  matches: ['https://steamcommunity.com/groups/*', 'https://steamcommunity.com/gid/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const groupBase = groupBaseFromUrl(location.href);
    const tabs = document.querySelector<HTMLElement>('.group_tabs');
    if (!groupBase || !tabs) return;

    // 1. The tab itself (also on group sub-pages such as discussions, where it just links back).
    const tabLink = document.createElement('a');
    tabLink.className = 'group_tab';
    tabLink.id = 'group_tab_wishlists';
    tabLink.href = groupBase + TAB_HASH;
    tabLink.innerHTML = '<span>Wishlists</span>';
    const membersTab = document.getElementById('group_tab_members');
    if (membersTab) membersTab.after(tabLink);
    else (tabs.querySelector('.responsive_hidden') ?? tabs).append(tabLink);

    const select = tabs.querySelector<HTMLSelectElement>('select.responsive_tab_select');
    if (select) {
      const opt = document.createElement('option');
      opt.value = tabLink.href;
      opt.dataset.tabName = 'wishlists';
      opt.textContent = 'Wishlists';
      select.append(opt);
    }

    // 2. Our content area, next to Steam's own tab containers. Only on the group's main page.
    const overview = document.getElementById('group_tab_content_overview');
    if (!overview) return;
    const style = document.createElement('style');
    style.textContent = STEAM_HIDE_CSS;
    document.head.append(style);
    const root = document.createElement('div');
    root.id = 'sgf_wishlists';
    root.className = 'grouppage_content_area';
    root.style.display = 'none';
    const column = document.createElement('div');
    column.className = 'maincontent';
    root.append(column);
    overview.after(root);

    const source = createExtensionSource(groupBase);
    const ui = await createShadowRootUi(ctx, {
      name: 'sgf-wishlists',
      position: 'inline',
      // Keep typing in our inputs (tag search, preset names) away from Steam's page handlers.
      isolateEvents: true,
      anchor: column,
      append: 'last',
      onMount: (container) => mount(App, { target: container, props: { source } }),
      onRemove: (app) => {
        if (app) unmount(app);
      },
    });

    // 3. Switching tabs happens in the page; the loaded list stays mounted while Steam's tabs show.
    const tabSwitch = createTabSwitch({
      win: window,
      groupBase,
      hash: TAB_HASH,
      tabs,
      tabLink,
      select,
      root,
      onShow: () => {
        if (!ui.mounted) ui.mount();
      },
      listen: (target, type, fn, options) =>
        ctx.addEventListener(target as Window, type as keyof WindowEventMap, fn, options),
    });
    ctx.onInvalidated(() => {
      tabSwitch.dispose();
      style.remove();
    });
    tabSwitch.start(initialHash(window));
  },
});

function createExtensionSource(groupBase: string): DataSource {
  const local = browser.storage.local;
  const kv: KvStore = {
    get: (keys) => local.get(keys) as Promise<Record<string, unknown>>,
    set: (items) => local.set(items),
    remove: (keys) => local.remove(keys),
    keys: async () => Object.keys(await local.get(null)),
  };
  const cache = createCache(kv);

  const cfg = document.getElementById('application_config');
  const page = readPageContext({
    configJson: cfg?.getAttribute('data-config'),
    userInfoJson: cfg?.getAttribute('data-userinfo'),
    scriptsText: [...document.scripts]
      .filter((s) => !s.src)
      .map((s) => s.textContent ?? '')
      .join('\n'),
    cookie: document.cookie,
  });

  // Firefox content scripts have `content.fetch`, which behaves like the page's own requests.
  const pageFetch: typeof fetch =
    (globalThis as { content?: { fetch?: typeof fetch } }).content?.fetch?.bind(
      (globalThis as { content?: unknown }).content,
    ) ?? ((input, init) => fetch(input, init));

  const fetchText = async (url: string) => {
    const res = await pageFetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).pathname}`);
    return res.text();
  };

  const bg: BgCall = async (req) => {
    const res = (await browser.runtime.sendMessage(req)) as BgEnvelope<never> | undefined;
    if (!res) throw new Error('The extension background did not answer');
    if (!res.ok) throw new Error(res.error);
    return res.data;
  };

  async function pruneDaily() {
    const last = ((await local.get(PRUNE_KEY))[PRUNE_KEY] as number | undefined) ?? 0;
    if (Date.now() - last < 24 * 60 * 60e3) return;
    // Longer than the longest TTL (co-op counts: 30 days), so nothing is dropped before it expires.
    await cache.prune(31 * 24 * 60 * 60e3);
    await local.set({ [PRUNE_KEY]: Date.now() });
  }

  return {
    async load(force, settings, emit, log, opts) {
      log(`Steam Gamefinder ${browser.runtime.getManifest().version} on ${groupBase}`);
      await loadGroup(
        { groupBase, page, fetchText, bg, cache, log, settings: { loadLibraries: settings.loadLibraries } },
        { force, recheckCoop: opts?.recheckCoop },
        emit,
      );
      pruneDaily().catch(() => {});
    },
    tags: () => loadTags({ bg, cache, page }),
    async getSettings() {
      const s = (await local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<UiSettings> | undefined;
      return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    },
    async saveSettings(s) {
      await local.set({ [SETTINGS_KEY]: s });
    },
    async getPresets() {
      const key = presetsKey(groupBase);
      const p = (await local.get(key))[key];
      return Array.isArray(p) ? p : [];
    },
    async savePresets(p) {
      await local.set({ [presetsKey(groupBase)]: p });
    },
  };
}
