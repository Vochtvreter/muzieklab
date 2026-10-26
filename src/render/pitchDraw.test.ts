// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Clef, KeyId } from '../core/pitch';
import { drawPitchStaff, type DrawPitchOptions, type PitchNote } from './pitchDraw';
import type { StaffPalette } from './staffDraw';

const PALETTE: StaffPalette = { ink: '#161b1c', staff: '#8f9b9b', hit: '#1f8a5b', early: '#b07a12', miss: '#c23b3b', cursor: '#2f6669' };
const SIGN: Record<string, PitchNote['sign']> = { '': null, '#': 1, b: -1, n: 0, '##': 2, bb: -2 };

/** 'F#4 Bb4 C5' → whole notes (C4 = 28, as in core/pitch), each labelled with its name when `labels`. */
const pitches = (text: string, labels = false): PitchNote[] =>
  text.split(' ').map((p) => {
    const [, letter, sign, octave] = /^([A-G])(#{0,2}|b{0,2}|n)(\d)$/.exec(p)!;
    return { step: Number(octave) * 7 + 'CDEFGAB'.indexOf(letter), sign: SIGN[sign], ...(labels ? { label: p } : {}) };
  });

/** The x numbers of a path (VexFlow writes absolute M, L, C and Q commands: every number pairs up, x first). */
const xs = (p: Element): number[] => (p.getAttribute('d')!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);

/** Where a group draws, left to right (its paths, ledger lines and signs included). */
function span(g: Element): [number, number] {
  const all = [...g.querySelectorAll('path')].flatMap(xs);
  return [Math.min(...all), Math.max(...all)];
}

function draw(o: Partial<DrawPitchOptions> & { notes: (PitchNote | null)[] }) {
  const host = document.createElement('div');
  const size = drawPitchStaff(host, { clef: 'treble', key: 'C', slots: o.notes.length, width: 334, scale: 1.45, room: 1.5, palette: PALETTE, ...o });
  const svg = host.querySelector('svg')!;
  const bars = [...new Set([...svg.querySelectorAll('.vf-stavebarline rect')].map((r) => Number(r.getAttribute('x') ?? 0)))].sort((a, b) => a - b);
  const cursor = svg.querySelector(':scope > rect');
  return {
    size,
    /** The drawing's width in its own units: anything right of it is cut off. */
    width: Number(svg.getAttribute('viewBox')!.split(' ')[2]),
    bars,
    notes: [...svg.querySelectorAll('.vf-stavenote')].map(span),
    signature: [...svg.querySelectorAll('.vf-clef, .vf-keysignature')].map(span).reduce((a, b) => Math.max(a, b[1]), 0),
    cursor: cursor && [Number(cursor.getAttribute('x')), Number(cursor.getAttribute('x')) + Number(cursor.getAttribute('width'))],
    /** The note or slot the cursor marks. */
    cursorAt: o.cursor ?? null,
    // 12 px JetBrains Mono, centred: 0.6 em a letter.
    labels: [...svg.querySelectorAll('text')].map((t) => {
      const x = Number(t.getAttribute('x'));
      const half = (t.textContent!.length * 7.2) / 2;
      return [x - half, x + half];
    }),
  };
}

/**
 * Each note between its own two bar lines, clear of the clef and key signature, and inside the drawing; the cursor
 * around its note, in the same bar (a bar line is 1 unit wide, from its x).
 */
function expectInOwnBars(s: ReturnType<typeof draw>, where: string): void {
  expect(s.bars, `${where}: a bar line after each note`).toHaveLength(s.notes.length + 1);
  s.notes.forEach(([l, r], i) => {
    expect(l, `${where}: note ${i + 1} starts after its bar line`).toBeGreaterThan(i === 0 ? s.signature : s.bars[i] + 1);
    expect(r, `${where}: note ${i + 1} ends before the next bar line`).toBeLessThan(s.bars[i + 1]);
  });
  if (s.cursor && s.cursorAt !== null) {
    const i = s.cursorAt;
    const [l, r] = s.cursor;
    expect(l, `${where}: the cursor on note ${i + 1} starts in its bar`).toBeGreaterThanOrEqual(i === 0 ? s.signature : s.bars[i] + 1);
    expect(r, `${where}: the cursor on note ${i + 1} ends in its bar`).toBeLessThanOrEqual(s.bars[i + 1]);
    expect(l <= s.notes[i][0] && r >= s.notes[i][1], `${where}: the cursor holds note ${i + 1}`).toBe(true);
  }
  expect(s.bars[s.bars.length - 1] + 1, `${where}: the last bar line is in the drawing`).toBeLessThanOrEqual(s.width);
  for (const [l, r] of s.labels) expect(l >= 0 && r <= s.width, `${where}: a label is cut off`).toBe(true);
}

/** Notes side by side without bar lines: in order, not touching, clear of the clef and key, and inside the drawing. */
function expectInOneBar(s: ReturnType<typeof draw>, where: string): void {
  s.notes.forEach(([l, r], i) => {
    expect(l, `${where}: note ${i + 1} is clear of the note before`).toBeGreaterThan(i === 0 ? s.signature : s.notes[i - 1][1]);
    expect(r, `${where}: note ${i + 1} is inside the drawing`).toBeLessThanOrEqual(s.width);
  });
  if (s.cursor) expect(s.cursor[0] >= 0 && s.cursor[1] <= s.width, `${where}: the cursor is inside the drawing`).toBe(true);
  for (const [l, r] of s.labels) expect(l >= 0 && r <= s.width, `${where}: a label is cut off`).toBe(true);
}

describe('drawPitchStaff', () => {
  it('keeps every whole note in its own bar on a phone, whatever the key signature and signs (Read notes)', () => {
    const plain = pitches('G4 B4 E5 F5 C5 A4');
    const signed = pitches('G#4 Bb4 En5 F#5 Cb5 A#4');
    // The phone's staff card (390 and 320 px wide) and a phone on its side, at the phone's size.
    for (const width of [334, 264, 348]) {
      for (const key of ['C', 'G', 'A', 'E', 'C#', 'Cb'] as KeyId[]) {
        for (const notes of [plain, signed]) {
          for (const clef of ['treble', 'bass'] as Clef[]) {
            const s = draw({ clef, key, notes: clef === 'bass' ? notes.map((n) => ({ ...n, step: n.step - 12 })) : notes, width });
            expectInOwnBars(s, `${width} px, ${clef}, ${key} major, ${notes === signed ? 'signs' : 'no signs'}`);
          }
        }
      }
    }
  });

  it('keeps the cursor in the bar of the note it marks, a sign and all (Read notes)', () => {
    const signed = pitches('G#4 Bb4 En5 F#5 Cb5 A#4');
    // A phone's staff card (390 and 320 px) and a tablet's, where narrow bars give up VexFlow's padding before their note.
    for (const [width, scale] of [[334, 1.45], [264, 1.45], [722, 2]]) {
      for (const key of ['G', 'A', 'C#'] as KeyId[]) {
        for (let cursor = 0; cursor < signed.length; cursor++) expectInOwnBars(draw({ key, notes: signed, cursor, width, scale }), `${width} px, ${key} major`);
      }
    }
  });

  it('keeps its size when its notes fit, and draws smaller only to fit', () => {
    // A tablet's staff card, and a phone's: C major has room at the full size (a narrow bar gives up VexFlow's padding).
    const wide = draw({ notes: pitches('G4 B4 E5 F5 C5 A4'), width: 722, scale: 2 });
    expect(wide.width).toBeCloseTo(361);
    expect(wide.size).toEqual({ width: 722, height: 140 });
    expect(draw({ notes: pitches('G4 B4 E5 F5 C5 A4') }).size).toEqual({ width: 334, height: 102 });
    // A major's three sharps leave each bar room for a note at the phone's full size (the path's 24.x lessons).
    expect(draw({ key: 'A', notes: pitches('G4 B4 E5 F5 C5 A4') }).size).toEqual({ width: 334, height: 102 });
    const narrow = draw({ key: 'C#', notes: pitches('G#4 Bb4 En5 F#5 Cb5 A#4'), width: 334, scale: 1.45 });
    expect(narrow.size.width).toBe(334);
    expect(narrow.size.height).toBeLessThan(Math.ceil(70 * 1.45));
    // D major with its signs on a phone's Scales staff, at every note.
    const d = pitches('D4 E4 F#4 G4 A4 B4 C#5 D5');
    for (let pos = 0; pos <= d.length; pos++) {
      const s = draw({ notes: d.slice(0, pos), slots: 8, cursor: pos < 8 ? pos : null, barlines: false, room: 2.2, width: 342, scale: 1.25, fitNotes: d });
      expect(s.size, `D major, after ${pos} notes`).toEqual({ width: 342, height: Math.ceil(84 * 1.25) });
    }
    // Learn 11's scales in a 390 px phone's column: the size of C major and A natural minor next to them.
    for (const text of ['C4 D4 E4 F4 G4 A4 B4 C5', 'G4 A4 B4 C5 D5 E5 F#5 G5', 'A4 B4 C5 D5 E5 F5 G#5 A5', 'A4 B4 C5 D5 E5 F#5 G#5 A5']) {
      expect(draw({ notes: pitches(text, true), barlines: false, room: 1.6, width: 318, scale: 1.2 }).size, text).toEqual({ width: 318, height: 108 });
    }
  });

  it('keeps one size while notes are hidden or come in, sized for the notes it was given room for', () => {
    const all = pitches('G#4 Bb4 En5 F#5 Cb5 A#4');
    const shown = draw({ key: 'A', notes: all });
    for (let n = 0; n < all.length; n++) {
      const s = draw({ key: 'A', notes: all.map((p, i) => (i < n ? p : null)), fitNotes: all, cursor: n });
      expect(s.size, `${n} notes shown`).toEqual(shown.size);
      expect(s.bars, `${n} notes shown`).toEqual(shown.bars);
    }
  });

  it('fits a scale with its signs on a phone, with the next note\'s place inside the drawing (Scales)', () => {
    const scales: [KeyId, string][] = [
      ['C', 'C#4 D#4 E#4 F#4 G#4 A#4 B#4 C#5'],
      ['C', 'C4 D4 E4 F4 G4 A4 B4 C5'],
      // A♯ melodic minor with the key signature (C♯ major's): only F𝄪 and G𝄪 carry a sign.
      ['C#', 'A#4 B#4 C#5 D#5 E#5 F##5 G##5 A#5'],
    ];
    // The phone's staff card at 390 px, 1.25, and at 320 px on a short screen, 1.1.
    for (const [width, scale] of [[342, 1.25], [272, 1.1]]) {
      for (const [key, text] of scales) {
        const page = pitches(text).map((p) => (key === 'C' || p.sign === 2 ? p : { ...p, sign: null }));
        const sizes = new Set<string>();
        for (let pos = 0; pos <= page.length; pos++) {
          const s = draw({ key, notes: page.slice(0, pos), slots: 8, cursor: pos < 8 ? pos : null, barlines: false, room: 2.2, width, scale, fitNotes: page });
          expectInOneBar(s, `${width} px, ${text}, after ${pos} notes`);
          sizes.add(JSON.stringify(s.size));
        }
        expect([...sizes], `${text}: one size as the notes come in`).toHaveLength(1);
      }
    }
  });

  it('fits the Learn examples in a 320 px phone\'s column, labels and all (Learn)', () => {
    const learn = { width: 248, scale: 1.2 };
    expectInOwnBars(draw({ ...learn, notes: pitches('A3 B3 C4 A5 B5 C6', true), room: 3 }), 'ledger lines (8.4)');
    for (const text of ['G4 A4 B4 C5 D5 E5 F#5 G5', 'A4 B4 C5 D5 E5 F5 G#5 A5', 'A4 B4 C5 D5 E5 F#5 G#5 A5']) {
      expectInOneBar(draw({ ...learn, notes: pitches(text, true), barlines: false, room: 1.6 }), text);
    }
  });
});
