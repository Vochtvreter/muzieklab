/** Small, pure formatting helpers for the screens. Text always comes from the i18n catalog. */
import { t } from '../../i18n';
import { DIAMOND, MAX_STARS, SHOWN_STARS, type MeterId } from '../../core/api';

/** Tempo word for a BPM (the setup slider label, DESIGN.md §4): a message key under `tempo.`. */
export function tempoWordKey(bpm: number): string {
  if (bpm < 60) return 'tempo.largo';
  if (bpm < 66) return 'tempo.larghetto';
  if (bpm < 76) return 'tempo.adagio';
  if (bpm < 108) return 'tempo.andante';
  if (bpm < 120) return 'tempo.moderato';
  if (bpm < 156) return 'tempo.allegro';
  if (bpm < 168) return 'tempo.vivace';
  return 'tempo.presto';
}

/** Engine difficulty 0–10 → the five-segment meter (1–5). */
export function difficultyLevel(difficulty: number): number {
  if (!Number.isFinite(difficulty)) return 1;
  return Math.max(1, Math.min(5, Math.ceil(difficulty / 2)));
}

/** Signed whole number with a typographic minus: "+38", "−12", "0". */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '−') + Math.abs(r);
}

/** "+38 ms" */
export function signedMs(ms: number): string {
  return t('common.ms', { value: signed(ms) });
}

/** Star slots to draw: three, or four once the 4th star is earned (the diamond is drawn on its own). */
export function starSlots(stars: number): number {
  return stars >= MAX_STARS ? MAX_STARS : SHOWN_STARS;
}

/** "★★☆" for 0–3 stars, "★★★★" for 4 (the diamond, all perfect, is drawn by `StarsMark` in their place). */
export function starsText(stars: number): string {
  const n = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  return '★'.repeat(n) + '☆'.repeat(starSlots(n) - n);
}

/** "2 of 3 stars", the 4th star, or the diamond: for screen readers. */
export function starsLabel(stars: number): string {
  if (stars === DIAMOND) return t('stars.diamond');
  return stars >= MAX_STARS ? t('stars.fourth') : t('stars.of3', { count: Math.max(0, stars) });
}

/** Meters in canonical order, joined with " · " (e.g. "3/4 · 4/4"). */
export function metersLabel(meters: MeterId[]): string {
  const order: MeterId[] = ['2/4', '3/4', '4/4'];
  return order.filter((m) => meters.includes(m)).join(' · ');
}

/** Translated list "a, b or c" from message keys. */
export function orList(keys: string[]): string {
  const items = keys.map((k) => t(k));
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const head = items.slice(0, -1).reduce((a, b) => t('common.commaList', { a, b }));
  return t('common.orList', { a: head, b: items[items.length - 1] });
}

/** A fresh exercise seed (UI only; the engine itself never uses Math.random). */
export function newSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] >>> 1;
  }
  return Math.floor(Math.random() * 0x7fffffff);
}

/** Stable seed for a lesson preview (same picture every visit). */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}
