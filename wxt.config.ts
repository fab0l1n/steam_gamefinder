import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Steam Gamefinder',
    description:
      "Adds a Wishlists tab to Steam community groups: every member's wishlist in one list, with prices, reviews and who owns what.",
    permissions: ['storage'],
    host_permissions: [
      'https://steamcommunity.com/*',
      'https://store.steampowered.com/*',
      'https://api.steampowered.com/*',
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'steam-gamefinder@fab0l1n',
              strict_min_version: '115.0',
              // Required by addons.mozilla.org for new extensions; we collect nothing.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
