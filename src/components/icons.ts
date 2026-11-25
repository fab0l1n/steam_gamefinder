/** Inline SVG icons (no external assets, so nothing extra to make web-accessible). */

export const icons = {
  thumbUp:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1 7h3v8H1zm4 0 3.2-6c1.3 0 2 .9 1.8 2.2L9.5 6H14c1 0 1.7.9 1.5 1.9l-1.3 5.8c-.2.8-.9 1.3-1.7 1.3H5z"/></svg>',
  thumbDown:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M15 9h-3V1h3zm-4 0-3.2 6c-1.3 0-2-.9-1.8-2.2L6.5 10H2c-1 0-1.7-.9-1.5-1.9L1.8 2.3C2 1.5 2.7 1 3.5 1H11z"/></svg>',
  /** Mixed reviews: a tilde, like Steam's "~" rating. */
  tilde:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M2 10.2c1.3-2.6 3-3.4 4.7-2.1 1.7 1.3 3.4 2.6 5.1.4.6-.7 1-1.4 1.2-2.2"/></svg>',
  star:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="m8 .8 2.2 4.6 5 .7-3.6 3.5.9 5L8 12.2l-4.5 2.4.9-5L.8 6.1l5-.7z"/></svg>',
  library:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M1 2h14v2.5H1zm0 4.75h14v2.5H1zM1 11.5h14V14H1z"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM2 2l12 12"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="m2.5 8.5 3.5 3.5 7.5-8"/></svg>',
  warn:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 1 15.5 14.5H.5zm-.9 5v4.5h1.8V6zm0 5.6v1.8h1.8v-1.8z"/></svg>',
  refresh:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M13.5 6.5A5.6 5.6 0 0 0 3 5M2.5 9.5A5.6 5.6 0 0 0 13 11"/><path fill="currentColor" d="M2 1.5v4.5h4.5zM14 14.5V10H9.5z"/></svg>',
} as const;

export function reviewTone(score: number): 'positive' | 'mixed' | 'negative' | 'none' {
  if (score >= 7) return 'positive';
  if (score >= 5) return 'mixed';
  if (score >= 1) return 'negative';
  return 'none';
}
