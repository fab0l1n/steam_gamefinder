/**
 * Member selection and presets. A selection is a list of steamids; "all members" is the default.
 * Rules: a plain click selects only that member (clicking the only selected member again goes back
 * to all); Ctrl/⌘+click adds or removes a member; the selection is never empty.
 */
import type { SteamId } from './types';

export interface Preset {
  id: string;
  name: string;
  steamids: SteamId[];
}

export function isAllSelected(selection: SteamId[], all: SteamId[]): boolean {
  return all.length > 0 && all.every((id) => selection.includes(id));
}

/** Keeps member order and drops ids that are no longer in the group. */
function normalize(ids: SteamId[], all: SteamId[]): SteamId[] {
  return all.filter((id) => ids.includes(id));
}

export function clickMember(current: SteamId[], id: SteamId, additive: boolean, all: SteamId[]): SteamId[] {
  const cur = normalize(current, all);
  if (!additive) return cur.length === 1 && cur[0] === id ? [...all] : [id];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return next.length ? normalize(next, all) : [...all];
}

export function presetSelection(p: Preset, all: SteamId[]): SteamId[] {
  const sel = normalize(p.steamids, all);
  return sel.length ? sel : [...all];
}

export function sameSelection(a: SteamId[], b: SteamId[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function newPreset(name: string, steamids: SteamId[], now = Date.now()): Preset {
  return { id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim().slice(0, 40), steamids: [...steamids] };
}
