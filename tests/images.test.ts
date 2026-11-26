import { describe, expect, it } from 'vitest';
import { previewImages, smallScreenshot } from '../src/lib/images';

const BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/892970/';

describe('preview images', () => {
  it("uses Steam's 600×338 screenshot variant, for both filename styles", () => {
    expect(smallScreenshot(`${BASE}5a31/ss_5a31.jpg?t=1791544831`)).toBe(`${BASE}5a31/ss_5a31.600x338.jpg?t=1791544831`);
    expect(smallScreenshot(`${BASE}ss_cd02.jpg`)).toBe(`${BASE}ss_cd02.600x338.jpg`);
  });
  it('leaves other images alone', () => {
    expect(smallScreenshot(`${BASE}header.jpg?t=1`)).toBe(`${BASE}header.jpg?t=1`);
    expect(smallScreenshot('data:image/svg+xml,x')).toBe('data:image/svg+xml,x');
  });
  it('takes the first three screenshots, with the original as fallback', () => {
    const shots = ['a', 'b', 'c', 'd'].map((x) => `${BASE}ss_${x}.jpg`);
    expect(previewImages({ screenshots: shots, header: 'h' })).toEqual([
      { src: `${BASE}ss_a.600x338.jpg`, fallback: `${BASE}ss_a.jpg` },
      { src: `${BASE}ss_b.600x338.jpg`, fallback: `${BASE}ss_b.jpg` },
      { src: `${BASE}ss_c.600x338.jpg`, fallback: `${BASE}ss_c.jpg` },
    ]);
  });
  it('falls back to the header image, or nothing', () => {
    expect(previewImages({ screenshots: [], header: 'h.jpg' })).toEqual([{ src: 'h.jpg' }]);
    expect(previewImages({ screenshots: [], header: '' })).toEqual([]);
  });
});
