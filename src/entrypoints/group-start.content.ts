import { INITIAL_HASH_ATTR } from '@/lib/tab-switch';

/**
 * Runs before Steam's own scripts. Steam's InitGroupPage() replaces an unknown hash such as
 * `#wishlists` with the plain group URL as the page loads, so record the hash the page was opened
 * with for the main content script, which runs later.
 */
export default defineContentScript({
  matches: ['https://steamcommunity.com/groups/*', 'https://steamcommunity.com/gid/*'],
  runAt: 'document_start',
  main() {
    // Without the root element (shouldn't happen) the main script falls back to the navigation entry.
    document.documentElement?.setAttribute(INITIAL_HASH_ATTR, location.hash);
  },
});
