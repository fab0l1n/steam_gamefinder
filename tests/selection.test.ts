import { describe, expect, it } from 'vitest';
import { applyView } from '../src/lib/aggregate';
import { clickMember, isAllSelected, newPreset, presetSelection, sameSelection } from '../src/lib/selection';
import { mapStoreItem } from '../src/lib/steam/store';
import type { GameRow } from '../src/lib/types';
import { rawItem } from './fixtures';

const ALL = ['a', 'b', 'c', 'd'];

describe('member selection', () => {
  it('plain click selects only that member; clicking it again returns to all', () => {
    expect(clickMember(ALL, 'b', false, ALL)).toEqual(['b']);
    expect(clickMember(['b'], 'c', false, ALL)).toEqual(['c']);
    expect(clickMember(['b'], 'b', false, ALL)).toEqual(ALL);
  });

  it('ctrl+click adds and removes, keeps member order, never empties', () => {
    expect(clickMember(['c'], 'a', true, ALL)).toEqual(['a', 'c']);
    expect(clickMember(['a', 'c'], 'a', true, ALL)).toEqual(['c']);
    expect(clickMember(['c'], 'c', true, ALL)).toEqual(ALL);
    expect(clickMember(ALL, 'b', true, ALL)).toEqual(['a', 'c', 'd']);
  });

  it('applies presets against the current members', () => {
    expect(presetSelection({ id: 'x', name: 'Crew', steamids: ['d', 'a', 'gone'] }, ALL)).toEqual(['a', 'd']);
    expect(presetSelection({ id: 'y', name: 'Old', steamids: ['gone'] }, ALL)).toEqual(ALL);
    expect(isAllSelected(['d', 'c', 'b', 'a'], ALL)).toBe(true);
    expect(sameSelection(['a', 'd'], ['d', 'a'])).toBe(true);
    expect(newPreset('  Friday night  ', ['a'])).toMatchObject({ name: 'Friday night', steamids: ['a'] });
  });

  it('filters rows to games wishlisted by any selected member', () => {
    const row = (appid: number, by: string[]): GameRow => ({
      info: mapStoreItem(rawItem(appid), appid),
      wishlistedBy: by.map((steamid) => ({ steamid, addedAt: 0 })),
      ownedBy: [],
      viewerOwns: false,
      viewerWishlisted: false,
    });
    const rows = [row(1, ['a']), row(2, ['b']), row(3, ['c', 'd'])];
    const ids = (members: string[] | null) =>
      applyView(rows, { sort: 'name', includeExtras: true, hideOwned: false, members }).map((r) => r.info.appid);
    expect(ids(null)).toEqual([1, 2, 3]);
    expect(ids(['a', 'd'])).toEqual([1, 3]);
  });
});

describe('member filter includes libraries', () => {
  it('shows games a selected member wishlisted or owns', () => {
    const row = (appid: number, by: string[], owners: string[]): GameRow => ({
      info: mapStoreItem(rawItem(appid), appid),
      wishlistedBy: by.map((steamid) => ({ steamid, addedAt: 0 })),
      ownedBy: owners.map((steamid) => ({ steamid, playtime: 0 })),
      viewerOwns: false,
      viewerWishlisted: false,
    });
    const rows = [row(1, ['a'], []), row(2, ['b'], ['c']), row(3, ['d'], [])];
    const ids = applyView(rows, { sort: 'name', includeExtras: true, hideOwned: false, members: ['c'] }).map((r) => r.info.appid);
    expect(ids).toEqual([2]);
  });
});
