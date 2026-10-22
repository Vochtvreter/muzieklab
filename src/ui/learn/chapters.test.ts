import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS, LETTERS, PPQ, checkSettings, getMeter, sanitizeNoteSettings, sanitizeScaleSettings } from '../../core/api';
import { UNITS } from '../../game/path';
import { parseBars } from '../../render/notationText';
import { hasMessage } from '../../i18n';
import { CHAPTERS, PLANNED_CHAPTERS, parseNoteName, parsePitch, sectionKey, type Block, type Quiz, type Section } from './chapters';

/** Every text key a block uses, relative to its section. */
function blockKeys(b: Block): string[] {
  switch (b.kind) {
    case 'text':
    case 'tip':
      return [b.text];
    case 'list':
      return b.items;
    case 'tiles':
      return b.tiles.flatMap((x) => [x.title, x.text]);
    case 'staff':
      return [b.alt, ...(b.title ? [b.title] : [])];
    case 'rhythm':
      return [b.alt, ...(b.title ? [b.title] : []), ...(b.value ? [b.value] : [])];
    case 'table':
      return b.rows.flatMap((r) => [r.title, ...(r.text ? [r.text] : []), ...(r.value ? [r.value] : [])]);
    case 'timeSig':
      return [b.top, b.bottom];
    case 'beatGrid':
      return [b.alt, ...b.rows.map((r) => r.title)];
    case 'piano':
    case 'pulse':
      return [b.alt];
    case 'noteNames':
    case 'accents':
    case 'noteTree':
      return [];
    case 'pair':
      return b.columns.flat().flatMap(blockKeys);
  }
}

const allBlocks = (blocks: Block[]): Block[] => blocks.flatMap((b) => (b.kind === 'pair' ? [b, ...allBlocks(b.columns.flat())] : [b]));
const sections: Section[] = CHAPTERS.flatMap((c) => c.sections);

describe('Learn chapters', () => {
  it('are numbered in order, with sections n.1, n.2, … and room in the plan', () => {
    CHAPTERS.forEach((c, i) => {
      if (i > 0) expect(c.n).toBeGreaterThan(CHAPTERS[i - 1].n);
      expect(c.sections.length).toBeGreaterThan(0);
      expect(c.sections.map((s) => s.id)).toEqual(c.sections.map((_, k) => `${c.n}.${k + 1}`));
    });
    expect(Math.max(...CHAPTERS.map((c) => c.n))).toBeLessThanOrEqual(PLANNED_CHAPTERS);
  });

  it('build only on earlier chapters, and name Path units that exist', () => {
    for (const c of CHAPTERS) {
      (c.builds ?? []).forEach((n) => expect(CHAPTERS.some((x) => x.n === n) && n < c.n, `chapter ${c.n} builds on ${n}`).toBe(true));
      (c.units ?? []).forEach((u) => expect(UNITS.some((x) => x.id === u), `chapter ${c.n}: Path unit ${u}`).toBe(true));
    }
  });

  it('have every text they use in the catalog', () => {
    const missing: string[] = [];
    const need = (key: string): void => {
      if (!hasMessage(key)) missing.push(key);
    };
    for (const c of CHAPTERS) {
      ['title', 'sub'].forEach((k) => need(`learn.chapters.${c.n}.${k}`));
      ['intro', 'quiz.question', 'quiz.right', 'quiz.wrong'].forEach((k) => need(`learn.ch${c.n}.${k}`));
      c.quiz.answers.forEach((a) => 'text' in a && need(`learn.ch${c.n}.quiz.${a.text}`));
    }
    for (const s of sections) {
      need(sectionKey(s.id, 'title'));
      ['question', 'right', 'wrong'].forEach((k) => need(sectionKey(s.id, 'check.' + k)));
      s.check.answers.forEach((a) => 'text' in a && need(sectionKey(s.id, 'check.' + a.text)));
      if (s.practice) need(sectionKey(s.id, 'practice'));
      s.blocks.flatMap(blockKeys).forEach((k) => need(sectionKey(s.id, k)));
    }
    expect(missing).toEqual([]);
  });

  it('have a quick check per chapter and per section, each with one right answer among real note names', () => {
    const quizzes: [string, Quiz][] = [...CHAPTERS.map((c): [string, Quiz] => [`chapter ${c.n}`, c.quiz]), ...sections.map((s): [string, Quiz] => [s.id, s.check])];
    for (const [where, quiz] of quizzes) {
      expect(quiz.answers.length, where).toBeGreaterThanOrEqual(2);
      expect(quiz.right, where).toBeGreaterThanOrEqual(0);
      expect(quiz.right, where).toBeLessThan(quiz.answers.length);
      quiz.answers.forEach((a) => 'note' in a && expect(parseNoteName(a.note), `${where} ${a.note}`).not.toBeNull());
      const names = quiz.answers.map((a) => ('note' in a ? a.note : a.text));
      expect(new Set(names).size, where).toBe(names.length);
    }
  });

  it('write notes, rhythms and piano keys that parse', () => {
    for (const s of sections) {
      for (const b of allBlocks(s.blocks)) {
        if (b.kind === 'staff') b.notes.split(/\s+/).filter(Boolean).forEach((n) => expect(parsePitch(n), `${s.id} ${n}`).not.toBeNull());
        if (b.kind === 'piano') (b.marked ?? []).forEach((L) => expect(LETTERS as readonly string[]).toContain(L));
        if (b.kind === 'beatGrid') {
          // Each row fills exactly one beat.
          for (const r of b.rows) {
            const [bar] = parseBars(getMeter('4/4'), [r.beat]);
            expect(bar.symbols.reduce((sum, x) => sum + x.duration, 0), `${s.id} ${r.beat}`).toBeCloseTo(PPQ);
          }
        }
        // A playable staff has notes to play; a rhythm plays at a tempo the game can play.
        if (b.kind === 'staff' && b.play) expect(b.notes.trim(), s.id).not.toBe('');
        if (b.kind === 'rhythm') {
          if (b.tempo !== undefined) expect(b.tempo >= 40 && b.tempo <= 200, `${s.id} tempo ${b.tempo}`).toBe(true);
          if (b.common) expect(b.meter, s.id).toBe('4/4');
          const meter = getMeter(b.meter);
          // Each bar is exactly full.
          for (const bar of parseBars(meter, b.bars)) {
            expect(bar.symbols.reduce((sum, x) => sum + x.duration, 0), s.id).toBeCloseTo(meter.barTicks);
          }
        }
      }
    }
  });

  it('link to practice that can be played as set up', () => {
    for (const s of sections) {
      if (!s.practice) continue;
      if ('notes' in s.practice) {
        const settings = { ...DEFAULT_NOTE_SETTINGS, ...s.practice.notes };
        expect(sanitizeNoteSettings(settings), s.id).toEqual(settings);
        if (settings.mixKeys) expect(settings.keys.length, s.id).toBeGreaterThan(1);
      } else if ('scales' in s.practice) {
        const settings = { ...DEFAULT_SCALE_SETTINGS, ...s.practice.scales };
        expect(sanitizeScaleSettings(settings), s.id).toEqual(settings);
        if (settings.keyMode === 'pick') expect(settings.keys.length, s.id).toBeGreaterThan(1);
      } else {
        const settings = { ...DEFAULT_SETTINGS, ...s.practice.rhythm };
        expect(checkSettings(settings).playable.length, s.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('parsePitch', () => {
  it('reads letter, sign and octave as a staff step (C4 = 28)', () => {
    expect(parsePitch('C4')).toEqual({ step: 28, sign: null });
    expect(parsePitch('F#4')).toEqual({ step: 31, sign: 1 });
    expect(parsePitch('Bb4')).toEqual({ step: 34, sign: -1 });
    expect(parsePitch('Fn5')).toEqual({ step: 38, sign: 0 });
    expect(parsePitch('H4')).toBeNull();
  });
});
