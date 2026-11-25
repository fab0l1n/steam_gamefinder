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
- **Avatar stacks** on every row: the *owner stack* (who has it in their library, green) and the
  *wishlist stack* (who wants it, blue); up to 5 round avatars, the total count when there are more.
- **Co-op column** left of the release date: "X Player Co-op" from co-optimus.com (online count, else
  LAN/couch), looked up only for games Steam lists as co-op and cached for 30 days. Shown only when
  co-optimus has a player count; otherwise the column stays empty. Details in the tooltip and hover preview.
  Lookup order: co-optimus API by Steam AppID → API by title → the co-optimus website (the API misses
  newer games): `/related-news/<title-slug>` → the game page, accepted only if it links the same Steam
  app. Website requests are paced 1 s apart as their robots.txt asks.
- **Review column**: rating icon (thumb up/down, `~` for mixed) with percent positive and number of reviews.
- **Member status strip**: every member with what could be loaded (wishlist and library counts, hidden,
  needs sign-in, cached, failed) and why.
- **Member selection**: click a member to see only their games; Ctrl+click (⌘ on Mac) adds or removes
  members. The list shows games any selected member has on their wishlist or in their library.
- **Presets** above the members: *All*, your saved presets, and *+* to save the current selection under
  a name. Right-click a saved preset to remove it (asks first). Stored per group in your browser.
- **Debug log** at the top (collapsed by default, remembers its state): what was loaded from where (cache or Steam), per-member results and every
  co-op lookup. *Copy* puts it on the clipboard for bug reports.
- **Hover preview**: screenshot, reviews, tags, description, who wishlisted it since when, who owns it
  and how long they played.
- **Sorting** (most wishlisted, discount, price, rating, release date, name) and toggles for DLC/hardware,
  hiding games you own, and loading libraries.
- **Filter sidebar** like Steam search with Augmented Steam: review score range, review count, discount
  percent, price range (two knobs), and user tags (tick to require, `−` to exclude; counts update with the other filters).
  The view is wider than Steam's group column (up to 1240 px) to fit the sidebar; below 1100 px the
  filters move above the list.

Next ideas: a "playable together" filter (co-op count ≥ group size), saved filters.

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
                                             ├─ api.co-optimus.com/games.php?steam=<appid>  (co-op counts, 2 at a time)
                                             └─ www.co-optimus.com (fallback for newer games, 1 request/s)
```

- steamcommunity.com only allows the page to talk to Steam hosts (CSP), and store cookies are third-party
  there, so cookie-bound and cross-site calls run in the background worker.
- Your Steam web token is fetched and used only inside the background worker and only sent to Steam.
- Everything is cached in `browser.storage.local`: members 1 h, wishlists 1 h, libraries 24 h, game details
  3 h, your store data 10 min, tag names 7 days, co-op counts 30 days. *Refresh* ignores the Steam caches but keeps co-op counts;
  *Re-check co-op* in the debug log looks those up again.
- No data leaves your browser except requests to Steam and co-optimus (only Steam AppIDs). No analytics.

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
src/components/                      Svelte UI (App, MemberStrip, GameRow, AvatarStack, FilterPanel, HoverPreview, Dialog, DebugLog)
src/lib/steam/                       parsers for Steam responses (pure, unit-tested)
src/lib/loader.ts                    load flow and per-member status
src/lib/aggregate.ts                 merge, sort, toolbar options
src/lib/filters.ts                   sidebar filters, tag counts, price steps
src/lib/selection.ts                 member selection and presets
src/lib/cache.ts                     TTL cache over storage.local
tests/                               Vitest tests with synthetic fixtures
harness/                             mock-data page for UI screenshots
```
