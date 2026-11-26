# steam_gamefinder

I find games for friends.

A browser extension (Firefox and Chromium) that adds a **Wishlists** tab to Steam community group pages.
It merges every member's wishlist into one list that looks like Steam search, so a group can see what
everyone wants, what's on sale, and who already owns it.

## What v0.1 does

- **Wishlists tab** on `steamcommunity.com/groups/<name>` (deep link: `…/groups/<name>#wishlists`).
  Switching between it and Steam's tabs happens in the page, so the list stays loaded; Back and Forward
  work as usual.
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
- **Release dates** like Steam search, including planned ones ("26 Nov, 2026", "December 2026",
  "Q4 2026", "2026") for unreleased games.
- **Review column**: rating icon (thumb up/down, `~` for mixed) with percent positive and number of reviews.
- **Member status strip**: every member with what could be loaded (wishlist and library counts, hidden,
  needs sign-in, cached, failed) and why.
- **Member selection**: click a member to see only their games; Ctrl+click (⌘ on Mac) adds or removes
  members. The *Match: Any / All* switch (next to *Sort by*) decides whether a game must be on the
  wishlist or in the library of *any* selected member (left, default) or of *all* of them (right). With
  *All* and everyone selected you get the games every member has.
- **Presets** above the members: *All*, your saved presets, and *+* to save the current selection under
  a name. Right-click a saved preset to remove it (asks first). Stored per group in your browser.
- **Debug log** at the top (collapsed by default, remembers its state): what was loaded from where (cache
  or Steam), per-member results and every co-op lookup. *Copy* puts it on the clipboard for bug reports.
  Also holds the rarely needed *Load libraries* switch (off = no library pages are read: no owner stacks,
  member filter by wishlist only) and *Re-check co-op*.
- Controls stay usable while co-op counts are still filling in; a reload asked for then starts right after.
- **Hover preview**: the first three screenshots in rotation, reviews, tags, description, who wishlisted
  it since when, who owns it and how long they played. Screenshots use Steam's 600×338 variants (the
  originals are up to 3840 px); the first one is loaded before the preview opens (waits 1.2 s at most).
  Loaded screenshots are remembered in memory for the page session only, nothing is stored.
- **Sorting**: most wishlisted, most owned, most wishlisted/owned (members who have it either way, each
  counted once), discount, price, reviews, release date, name. Each starts with the biggest / highest /
  best / newest first (name: A–Z); the arrow next to *Sort by* reverses it (↓ default, ↑ reversed; the
  tooltip says which way it runs), and picking another option starts it at its default again. Games without
  a price or reviews stay at the bottom either way; undated upcoming games count as the newest.
- **Filter sidebar** like Steam search with Augmented Steam; every section collapses (remembered; a dot
  marks a collapsed section that still filters): review score range, review count, discount
  percent, price range (two knobs), release date (From/To: a year or *Today*; undated "To be announced" /
  "Coming soon" games count as future releases, so they stay in with only *From* set and drop out once
  *To* is set; To = *Any* keeps every dated game), user tags (tick to require, `−` to exclude; counts update
  with the other filters), and last the content options: include DLC & hardware, hide games you own, hide
  games on your wishlist. *Clear all* (top of the sidebar) resets all of them.
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
npm test               # unit tests (parsers, aggregation, loader flow, background handlers, tab switching)
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

- Steam's group page runs its own tabs (it cancels clicks on in-page tabs and ignores the one it thinks is
  open, and drops unknown hashes like `#wishlists` on load). So our tab is an overlay: a class on `<html>`
  hides Steam's content while `#wishlists` is in the URL, and a tiny `document_start` script remembers
  the hash before Steam removes it.
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
src/entrypoints/group-start.content.ts  records the page's hash before Steam removes it
src/lib/tab-switch.ts                switching between our tab and Steam's
src/components/                      Svelte UI (App, MemberStrip, GameRow, AvatarStack, FilterPanel, HoverPreview, Dialog, DebugLog)
src/lib/steam/                       parsers for Steam responses (pure, unit-tested)
src/lib/loader.ts                    load flow and per-member status
src/lib/aggregate.ts                 merge, sort, toolbar options
src/lib/filters.ts                   sidebar filters, tag counts, price steps
src/lib/images.ts                    preview screenshots: small variants, session-only preloading
src/lib/selection.ts                 member selection and presets
src/lib/cache.ts                     TTL cache over storage.local
tests/                               Vitest tests with synthetic fixtures
harness/                             mock-data page for UI screenshots
```
