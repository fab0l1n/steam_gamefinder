/** What the UI needs from the outside world. The extension and the UI harness each provide one. */
import type { SortKey } from './aggregate';
import type { LoadSnapshot } from './types';

export interface UiSettings {
  sort: SortKey;
  includeExtras: boolean;
  hideOwned: boolean;
  loadLibraries: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = {
  sort: 'wishlisted',
  includeExtras: false,
  hideOwned: false,
  loadLibraries: true,
};

export interface DataSource {
  load(force: boolean, settings: UiSettings, emit: (s: LoadSnapshot) => void): Promise<void>;
  tags(): Promise<Record<number, string>>;
  getSettings(): Promise<UiSettings>;
  saveSettings(s: UiSettings): Promise<void>;
}
