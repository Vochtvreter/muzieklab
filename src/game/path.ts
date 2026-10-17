import type { Settings } from '../core/types';

export interface Lesson {
  id: string; // "7.3"
  title: string; // message key or plain title
  settings: Partial<Settings>; // preset on top of the unit's base
}

export interface Unit {
  id: number; // 1–8 in the MVP path
  titleKey: string;
  glyph: string; // Noto Music glyph or short text like "3/4"
  base: Partial<Settings>;
  lessons: Lesson[];
}

/** Learning Path units 1–8 (§8.2). A lesson unlocks when the previous one has 2 stars. */
export const UNITS: Unit[] = [];
