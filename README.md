# steam_gamefinder

I find games for friends.

A browser extension (Firefox and Chromium) that adds a **Wishlists** tab to Steam community group pages.
It merges every member's wishlist into one list that looks like Steam search, so a group can see what
everyone wants, what's on sale, and who already owns it.

## What v0.1 does

- **Wishlists tab** on `steamcommunity.com/groups/<name>` (deep link: `…/groups/<name>#wishlists`).
- **One merged list**: cover, name, platforms, release date, review rating, discount, original and current
  price (in your store region and Steam language).
- **Your highlights**: green background = in your library, blue = on your wishlist, with a small indicator
  on the cover (same colours as Augmented Steam).
- **Wishlisted by / owned by**: member avatars on every row.
- **Member status strip**: every member with what could be loaded (wishlist and library counts, hidden,
  needs sign-in, cached, failed) and why. Click a member to see only their wishlist.
- **Hover preview**: screenshot, reviews, tags, description, who wishlisted it since when, who owns it
  and how long they played.
- **Sorting** (most wishlisted, discount, price, rating, release date, name) and toggles for DLC/hardware,
  hiding games you own, and loading libraries.

Not yet: co-op player counts (co-optimus) and the filter panel. See the concept doc's roadmap.

## Install for development

```sh
npm install
npm run dev            # opens Chrome with the extension loaded and hot reload
npm run dev:firefox    # same for Firefox
```

Build and package:

```sh
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv2
npm run zip            # .output/steam-gamefinder-<version>-chrome.zip
npm run zip:firefox    # Firefox zip + sources zip (needed for addons.mozilla.org)
```

Load a build by hand:

- **Chrome/Edge/Brave**: `chrome://extensions` → Developer mode → *Load unpacked* → pick `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick the Firefox zip
  (or `.output/firefox-mv2/manifest.json`). Temporary add-ons are removed when Firefox restarts; a permanent
  install needs a signed build from addons.mozilla.org (unlisted is fine).

Checks:

```sh
npm test               # unit tests (parsers, aggregation, loader flow, background handlers)
npm run check          # svelte-check / TypeScript
npm run harness        # builds harness-dist/: the UI with mock data, for visual checks without Steam
```

## How it works

```
group page (content script)                 background worker
  ├─ adds the tab, renders the UI (Svelte,   ├─ store.steampowered.com/dynamicstore/userdata   (your owned + wishlist)
  │  in a shadow root)                       ├─ IWishlistService/GetWishlist                    (keyless, then your login)
  ├─ /groups/<name>/memberslistxml           ├─ IStoreBrowseService/GetItems                    (200 apps per call)
  ├─ /profiles/<id>/?xml=1                   └─ store /tagdata/populartags                      (tag names)
  └─ /profiles/<id>/games/?tab=all  (libraries; needs you signed in)
```

- steamcommunity.com only allows the page to talk to Steam hosts (CSP), and store cookies are third-party
  there, so cookie-bound and cross-site calls run in the background worker.
- Your Steam web token is fetched and used only inside the background worker and only sent to Steam.
- Everything is cached in `browser.storage.local`: members 1 h, wishlists 1 h, libraries 24 h, game details
  3 h, your store data 10 min, tag names 7 days. *Refresh* ignores the cache.
- No data leaves your browser except requests to Steam. No analytics.

## Privacy settings that matter

A member's wishlist and library follow their Steam **Game details** privacy setting:

- **Public**: everyone in the group sees them.
- **Friends only**: the extension retries with *your* Steam login, so it should work if you are friends
  with that member (not yet confirmed in a real run).
- **Private**: hidden; the member strip says so and how to change it.

## Project layout

```
src/entrypoints/background.ts        message handler (validates requests from our content script)
src/entrypoints/group.content/       tab injection + mounting the UI
src/components/                      Svelte UI (App, MemberStrip, GameRow, HoverPreview)
src/lib/steam/                       parsers for Steam responses (pure, unit-tested)
src/lib/loader.ts                    load flow and per-member status
src/lib/aggregate.ts                 merge, sort, filter
src/lib/cache.ts                     TTL cache over storage.local
tests/                               Vitest tests with synthetic fixtures
harness/                             mock-data page for UI screenshots
```
