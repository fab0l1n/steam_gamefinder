import { createBackgroundHandlers } from '@/lib/background-handlers';
import type { BgEnvelope, BgRequest } from '@/lib/messages';

const KNOWN = new Set<BgRequest['type']>(['viewerStore', 'wishlist', 'storeItems', 'tags', 'coop']);

function isRequest(msg: unknown): msg is BgRequest {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (!KNOWN.has(m.type as BgRequest['type'])) return false;
  if (m.type === 'wishlist') return typeof m.steamid === 'string' && /^\d{17}$/.test(m.steamid);
  if (m.type === 'storeItems') return Array.isArray(m.appids) && m.appids.every((a) => Number.isInteger(a)) && typeof m.language === 'string';
  if (m.type === 'coop')
    return (
      Array.isArray(m.items) &&
      m.items.length <= 50 &&
      m.items.every((i) => Number.isInteger(i?.appid) && typeof i?.name === 'string' && i.name.length <= 300)
    );
  if (m.type === 'tags') return typeof m.language === 'string' && /^[a-z]+$/.test(m.language);
  return true;
}

export default defineBackground(() => {
  const { handle } = createBackgroundHandlers();

  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: BgEnvelope<unknown>) => void) => {
    // Only answer our own content scripts.
    if (sender.id !== browser.runtime.id || !isRequest(msg)) return false;
    handle(msg as never).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true; // keep the channel open for the async answer
  });
});
