/**
 * Switching between Steam's group tabs and our Wishlists tab, without reloading the page.
 *
 * Steam's group page (group.js) runs its own tabs, and two of its habits shape this module:
 * - A delegated click handler on every link into the group. For in-page tabs (Overview `#`,
 *   `#members`, `#events`, …) it cancels the browser's navigation and calls OnGroupHashChange(),
 *   which does nothing when that view is already Steam's current one. Steam never learns about our
 *   tab, so while ours is open it still thinks Overview is showing: clicking Overview did nothing.
 * - InitGroupPage() replaces an unknown hash such as `#wishlists` with the plain group URL on load.
 *
 * So we leave Steam's view state alone and lay our tab over it: a class on <html> hides Steam's
 * content areas, and removing it shows whatever Steam displays by then. The URL hash is the single
 * source of truth: `#wishlists` means our tab is open, anything else means Steam's.
 */

export const ACTIVE_CLASS = 'sgf-wishlists-active';

/** Set on <html> by the document_start script: the hash the page was loaded with. */
export const INITIAL_HASH_ATTR = 'data-sgf-initial-hash';

/** Hides Steam's tab contents while ours is open, whatever inline display Steam sets on them. */
export const STEAM_HIDE_CSS =
  `html.${ACTIVE_CLASS} #group_tab_content_overview,` +
  `html.${ACTIVE_CLASS} #group_page_dynamic_content { display: none !important; }`;

type Listen = (
  target: EventTarget,
  type: string,
  fn: (e: Event) => void,
  options?: AddEventListenerOptions,
) => void;

/** The page's window, with its constructors (MutationObserver, …). */
export type Win = Window & typeof globalThis;

export interface TabSwitchOptions {
  win: Win;
  /** `https://steamcommunity.com/groups/<name>` (or `/gid/<id>`). */
  groupBase: string;
  /** Our tab's hash, `#wishlists`. */
  hash: string;
  /** Steam's `.group_tabs` bar. */
  tabs: HTMLElement;
  /** Our tab link inside it. */
  tabLink: HTMLAnchorElement;
  /** The tab dropdown Steam shows on narrow screens. */
  select: HTMLSelectElement | null;
  /** Our content area. */
  root: HTMLElement;
  /** Called every time our tab opens (mount the UI the first time). */
  onShow: () => void;
  /** addEventListener; the content script passes ctx.addEventListener so listeners die with it. */
  listen?: Listen;
}

export interface TabSwitch {
  /** Opens our tab if the page was loaded with its hash (pass the hash captured at document_start). */
  start(initialHash?: string | null): void;
  isActive(): boolean;
  dispose(): void;
}

export function createTabSwitch(o: TabSwitchOptions): TabSwitch {
  const { win, hash, tabs, tabLink, select, root } = o;
  const html = win.document.documentElement;
  const base = o.groupBase.toLowerCase().replace(/\/+$/, '');
  const listen: Listen = o.listen ?? ((t, type, fn, opts) => t.addEventListener(type, fn, opts));

  let active = false;
  /** The tab Steam marks as current: we take its highlight while open and give it back after. */
  let steamTab: Element | null = null;

  const steamActiveTabs = () =>
    [...tabs.querySelectorAll('.group_tab.active')].filter((t) => t !== tabLink);

  function claimTabs() {
    for (const t of steamActiveTabs()) {
      steamTab = t;
      t.classList.remove('active');
    }
    // Guarded: classList.add() on a present class still writes the attribute and would wake the
    // observer below again and again.
    if (!tabLink.classList.contains('active')) tabLink.classList.add('active');
    if (select && select.value !== tabLink.href) select.value = tabLink.href;
  }

  function activate() {
    if (active) return;
    active = true;
    html.classList.add(ACTIVE_CLASS);
    root.style.display = '';
    claimTabs();
    o.onShow();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    html.classList.remove(ACTIVE_CLASS);
    root.style.display = 'none';
    tabLink.classList.remove('active');
    if (steamTab && steamActiveTabs().length === 0) steamTab.classList.add('active');
    if (select && steamTab) {
      const href = steamTab.getAttribute('href');
      const opt = [...select.options].find((op) => op.value === href);
      if (opt) select.value = opt.value;
    }
  }

  const sync = () => (win.location.hash === hash ? activate() : deactivate());

  /** The hash that stands for Steam's current view: '' for Overview, `members` for Members, … */
  function steamFragment(): string {
    if (!steamTab || steamTab.id === 'group_tab_overview') return '';
    const href = steamTab.getAttribute('href') ?? '';
    const i = href.indexOf('#');
    return i === -1 ? '' : href.slice(i + 1);
  }

  /** A plain link into this group that Steam may handle in the page. */
  function isGroupLink(a: HTMLAnchorElement): boolean {
    if (a === tabLink || a.hasAttribute('onclick') || a.hasAttribute('download')) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.protocol !== 'https:' && a.protocol !== 'http:') return false;
    if (a.search) return false; // e.g. the language menu (?l=german)
    const path = `${a.origin}${a.pathname}`.toLowerCase().replace(/\/+$/, '');
    return path === base || path.startsWith(`${base}/`);
  }

  /** The click that just closed our tab, until Steam's handler has seen it. */
  let leaving: Event | null = null;

  // When Steam switches views it also updates the URL. When it was already showing the view the
  // link points to (Overview, usually) it cancels the click and does nothing else, so the address
  // bar would keep saying #wishlists. Steam ignores hashes it doesn't know, like `#` or `#members`.
  function finishLeave() {
    const e = leaving;
    leaving = null;
    if (e?.defaultPrevented && !active && win.location.hash === hash) {
      win.location.hash = steamFragment();
    }
  }

  // Capture phase: runs before Steam's own handler, which is delegated on the document.
  listen(
    win.document,
    'click',
    (ev) => {
      const e = ev as MouseEvent;
      if (!active || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
      if (!a || !isGroupLink(a)) return;
      deactivate();
      leaving = e;
      win.setTimeout(finishLeave, 0); // in case something stops the click before it reaches window
    },
    { capture: true },
  );
  // Bubble phase on window: after Steam's document handler, still inside the same click.
  listen(win, 'click', finishLeave);

  listen(win, 'hashchange', sync);
  listen(win, 'popstate', sync);
  listen(win, 'pageshow', sync); // back to a page restored from the back/forward cache

  // Steam can flip its own tab highlight while ours is open (back/forward into our entry makes it
  // load Overview again). Keep ours highlighted and remember which one Steam considers current.
  const observer = new win.MutationObserver(() => {
    if (active) claimTabs();
  });
  observer.observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });

  function restoreHash() {
    if (active && win.location.hash !== hash) {
      win.location.replace(win.location.href.split('#')[0] + hash);
    }
  }

  return {
    start(initialHash) {
      // Steam replaces `#wishlists` with the plain group URL as the page loads, so the tab was asked
      // for if the page was *loaded* with it, even when the address bar no longer shows it.
      if (win.location.hash !== hash && initialHash !== hash) return;
      activate();
      // Put the hash back (replace: no extra history entry) so a reload stays on our tab.
      restoreHash();
      if (win.document.readyState !== 'complete') {
        listen(win, 'load', () => win.setTimeout(restoreHash, 0), { once: true });
      }
    },
    isActive: () => active,
    dispose() {
      observer.disconnect();
      deactivate();
    },
  };
}

/** The hash the page was loaded with: recorded at document_start, else the navigation entry. */
export function initialHash(win: Win): string | null {
  const recorded = win.document.documentElement.getAttribute(INITIAL_HASH_ATTR);
  if (recorded !== null) return recorded;
  try {
    const nav = win.performance.getEntriesByType('navigation')[0];
    return nav ? new URL(nav.name).hash : null;
  } catch {
    return null;
  }
}
