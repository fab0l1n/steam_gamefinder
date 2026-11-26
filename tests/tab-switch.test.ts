import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { ACTIVE_CLASS, createTabSwitch, initialHash, INITIAL_HASH_ATTR, type TabSwitch, type Win } from '../src/lib/tab-switch';

const BASE = 'https://steamcommunity.com/groups/Test';
const HASH = '#wishlists';

const PAGE = `<!doctype html><html><head></head><body>
<div class="group_tabs">
  <div class="responsive_hidden">
    <a class="group_tab active" id="group_tab_overview" href="#"><span>Overview</span></a>
    <a class="group_tab" id="group_tab_discussions" href="${BASE}/discussions"><span>Discussions</span></a>
    <a class="group_tab" id="group_tab_members" href="${BASE}#members"><span>Members</span></a>
    <a class="group_tab" id="group_tab_wishlists" href="${BASE}${HASH}"><span>Wishlists</span></a>
  </div>
  <select class="responsive_tab_select">
    <option value="#" data-tab-name="overview">Overview</option>
    <option value="${BASE}#members" data-tab-name="members">Members</option>
    <option value="${BASE}${HASH}" data-tab-name="wishlists">Wishlists</option>
  </select>
</div>
<a id="lang" href="?l=german" onclick="return false;">Deutsch</a>
<div class="pagecontent">
  <div id="group_tab_content_overview">overview</div>
  <div id="group_page_dynamic_content" style="display: none"></div>
  <div id="sgf_wishlists" style="display: none"></div>
</div>
</body></html>`;

/**
 * A small stand-in for Steam's group.js tab handling (InitGroupPage, OnGroupHashChange, LoadURL,
 * FlipToTab), with the behaviour that matters here: in-page links are cancelled, a click on the
 * view Steam already shows does nothing, other views get their own pushState entry.
 */
function fakeSteam(win: Win) {
  const doc = win.document;
  const supported = /^(?:events|members|comments)(?:\W|$)/;
  const overview = doc.getElementById('group_tab_content_overview')!;
  const dynamic = doc.getElementById('group_page_dynamic_content')!;
  const steam = { activeURL: '', activeTab: 'overview', calls: [] as string[] };

  const isSupported = (url: string) => {
    const i = url.search(/[?#]/);
    const path = i === -1 ? url : url.slice(0, i);
    return /^[a-zA-Z0-9_\-/]+$/.test(path) && supported.test(path);
  };
  const flip = (tab: string) => {
    doc.getElementById(`group_tab_${steam.activeTab}`)?.classList.remove('active');
    doc.getElementById(`group_tab_${tab}`)?.classList.add('active');
    steam.activeTab = tab;
  };
  const load = (tab: string, url: string) => {
    if (url === '') {
      overview.style.display = '';
      dynamic.style.display = 'none';
      steam.activeURL = '';
      flip('overview');
      return;
    }
    flip(tab);
    overview.style.display = 'none';
    dynamic.style.display = '';
    dynamic.textContent = url;
    steam.activeURL = url;
  };
  const onGroupHashChange = (groupUrl: string, popState = false) => {
    steam.calls.push(groupUrl);
    let url = groupUrl.match(/^[^^]*/)?.[0] ?? '';
    const tab = url ? (url.match(/^[a-zA-Z]*/)?.[0] ?? '') : 'overview';
    if (url === '/' || url === 'overview') url = '';
    if (url !== '' && !isSupported(url)) return; // e.g. "#wishlists": "Failed to load URL"
    if (url === steam.activeURL) return; // already showing it: nothing happens
    if (!popState) win.history.pushState({ group_url: url }, '', url ? `${BASE}/${url}` : BASE);
    load(tab, url);
  };

  doc.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a');
    if (!a || !a.href.startsWith(BASE)) return;
    const i = a.href.indexOf('#');
    const groupUrl = i !== -1 ? a.href.slice(i + 1) : a.href.slice(BASE.length + 1);
    if (!groupUrl || supported.test(groupUrl)) {
      e.preventDefault();
      onGroupHashChange(groupUrl);
    }
  });
  win.addEventListener('popstate', (e) => {
    const state = (e as PopStateEvent).state as { group_url?: string } | null;
    onGroupHashChange(state?.group_url || '', true);
  });
  win.addEventListener('hashchange', () => onGroupHashChange(win.location.hash));
  doc.querySelector('select')!.addEventListener('change', (e) => {
    win.location.href = (e.target as HTMLSelectElement).value;
  });
  return steam;
}

let switches: TabSwitch[] = [];

function setup(url = BASE, recordedHash: string | null = null) {
  const dom = new JSDOM(PAGE, { url });
  const win = dom.window as unknown as Win;
  const doc = win.document;
  if (recordedHash !== null) doc.documentElement.setAttribute(INITIAL_HASH_ATTR, recordedHash);
  const steam = fakeSteam(win);
  // InitGroupPage(): an unknown hash is replaced with the plain group URL.
  if (win.location.hash) win.history.replaceState({ group_url: '' }, '', BASE);
  let shows = 0;
  const tabs = doc.querySelector<HTMLElement>('.group_tabs')!;
  const tabLink = doc.getElementById('group_tab_wishlists') as HTMLAnchorElement;
  const sw = createTabSwitch({
    win,
    groupBase: BASE,
    hash: HASH,
    tabs,
    tabLink,
    select: doc.querySelector('select'),
    root: doc.getElementById('sgf_wishlists')!,
    onShow: () => shows++,
  });
  switches.push(sw);
  const tick = () => new Promise((r) => win.setTimeout(r, 5));
  /** Waits for jsdom's asynchronous navigation events (hashchange, popstate), however busy the machine. */
  const until = async (cond: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error('timed out waiting for the page');
      await new Promise((r) => win.setTimeout(r, 2));
    }
  };
  const click = async (id: string, init: MouseEventInit = {}) => {
    const el = doc.getElementById(id)!;
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    await tick();
  };
  /** Click our tab and wait for the hash navigation to open it. */
  const open = async () => {
    await click('group_tab_wishlists');
    await until(() => sw.isActive());
  };
  const activeTabs = () => [...doc.querySelectorAll('.group_tab.active')].map((t) => t.id);
  const ourViewShown = () =>
    doc.documentElement.classList.contains(ACTIVE_CLASS) &&
    doc.getElementById('sgf_wishlists')!.style.display === '';
  return { win, doc, steam, sw, tick, until, click, open, activeTabs, ourViewShown, shows: () => shows };
}

afterEach(() => {
  switches.forEach((s) => s.dispose());
  switches = [];
});

describe('tab switching', () => {
  it('opens our tab from the tab link', async () => {
    const t = setup();
    t.sw.start(initialHash(t.win));
    expect(t.sw.isActive()).toBe(false);
    await t.open();
    expect(t.win.location.hash).toBe(HASH);
    expect(t.sw.isActive()).toBe(true);
    expect(t.ourViewShown()).toBe(true);
    expect(t.activeTabs()).toEqual(['group_tab_wishlists']);
    expect(t.doc.querySelector('select')!.value).toBe(`${BASE}${HASH}`);
    expect(t.shows()).toBe(1);
  });

  it('Overview brings back the overview, although Steam thinks it is still showing it', async () => {
    const t = setup();
    await t.open();
    await t.click('group_tab_overview');
    expect(t.steam.calls).toContain(''); // Steam got the click and did nothing with it
    expect(t.sw.isActive()).toBe(false);
    expect(t.ourViewShown()).toBe(false);
    expect(t.activeTabs()).toEqual(['group_tab_overview']);
    expect(t.doc.getElementById('group_tab_content_overview')!.style.display).toBe('');
    // The address bar no longer says #wishlists, so a reload stays on the overview…
    expect(t.win.location.hash).toBe('');
    expect(t.win.location.pathname).toBe('/groups/Test');
    expect(t.doc.querySelector('select')!.value).toBe('#');
    // …and Back returns to the list without reloading it.
    t.win.history.back();
    await t.until(() => t.sw.isActive());
    expect(t.sw.isActive()).toBe(true);
    expect(t.ourViewShown()).toBe(true);
    expect(t.shows()).toBe(2);
  });

  it('other in-page tabs are left to Steam', async () => {
    const t = setup();
    await t.open();
    await t.click('group_tab_members');
    expect(t.sw.isActive()).toBe(false);
    expect(t.win.location.pathname).toBe('/groups/Test/members');
    expect(t.doc.getElementById('group_page_dynamic_content')!.style.display).toBe('');
    expect(t.activeTabs()).toEqual(['group_tab_members']);
    // Back: Steam loads the overview for that entry, our tab covers it again.
    t.win.history.back();
    await t.until(() => t.sw.isActive());
    expect(t.win.location.hash).toBe(HASH);
    expect(t.steam.activeTab).toBe('overview');
    expect(t.sw.isActive()).toBe(true);
    expect(t.ourViewShown()).toBe(true);
    expect(t.activeTabs()).toEqual(['group_tab_wishlists']);
  });

  it('opens on load with #wishlists, after Steam has removed it from the URL', async () => {
    const t = setup(`${BASE}${HASH}`, HASH);
    expect(t.win.location.hash).toBe(''); // what InitGroupPage leaves behind
    const before = t.win.history.length;
    t.sw.start(initialHash(t.win));
    expect(t.sw.isActive()).toBe(true);
    expect(t.win.location.hash).toBe(HASH); // put back, so reloading stays here
    expect(t.win.history.length).toBe(before); // without an extra history entry
    // The reported bug: Overview right after opening the tab.
    await t.click('group_tab_overview');
    expect(t.sw.isActive()).toBe(false);
    expect(t.activeTabs()).toEqual(['group_tab_overview']);
  });

  it('stays closed when loaded without the hash', () => {
    const t = setup(BASE, '');
    t.sw.start(initialHash(t.win));
    expect(t.sw.isActive()).toBe(false);
    expect(t.ourViewShown()).toBe(false);
  });

  it('ignores Ctrl+click and links Steam does not handle in the page', async () => {
    const t = setup();
    await t.open();
    await t.click('group_tab_overview', { ctrlKey: true });
    expect(t.sw.isActive()).toBe(true);
    await t.click('lang');
    expect(t.sw.isActive()).toBe(true);
    expect(t.win.location.hash).toBe(HASH);
  });

  it('follows the tab dropdown on narrow screens', async () => {
    const t = setup();
    const select = t.doc.querySelector('select')!;
    select.value = `${BASE}${HASH}`;
    select.dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await t.until(() => t.sw.isActive());
    select.value = '#';
    select.dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await t.until(() => !t.sw.isActive());
    expect(t.activeTabs()).toEqual(['group_tab_overview']);
  });

  it('dispose hands the page back to Steam', async () => {
    const t = setup();
    await t.open();
    t.sw.dispose();
    expect(t.ourViewShown()).toBe(false);
    expect(t.activeTabs()).toEqual(['group_tab_overview']);
  });
});
