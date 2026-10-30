import { DEFAULT_SETTINGS } from '../core/defaults';
import { DEFAULT_NOTE_SETTINGS } from '../core/noteRound';
import { ALL_SCALES, scaleId } from '../core/scale';
import { hasMessage, LOCALES, setLocale, t, translateParams } from '../i18n';
import { CHAPTERS } from '../ui/learn/chapters';
import {
  ctaOf,
  echoPreset,
  focusOf,
  gainOf,
  historyOf,
  levelChecks,
  levelName,
  notesPreset,
  passSkills,
  reviewOf,
  skillContext,
  skillLevel,
  SKILLS,
  type Check,
  type Label,
} from './skills';
import { defaultProgress, defaultStats, shiftDay, type DayStats, type Progress, type SkillId } from './storage';

const TODAY = '2026-10-25';
const progress = (patch: Partial<Progress> = {}, stats: Partial<Progress['stats']> = {}): Progress => ({ ...defaultProgress(), ...patch, stats: { ...defaultStats(), ...stats } });
const checks = (p: Progress, skill: SkillId, n: number): Check[] => levelChecks(skillContext(p, TODAY), skill, n);
const lessons = (ids: string[], stars: 0 | 1 | 2 | 3 | 4 | 5 = 2): Progress['lessons'] => Object.fromEntries(ids.map((id) => [id, { stars, bestAccuracy: 90 }]));
const day = (cells: DayStats['cells']): DayStats => ({ sec: 60, rounds: 1, acc: 90, off: 0, hits: 1, cells });
/** Skill levels passed: skill → levels 1…n, on `on`. */
const passed = (levels: Partial<Record<SkillId, number>>, on = '2026-10-01'): Record<string, string> =>
  Object.fromEntries(Object.entries(levels).flatMap(([s, n]) => Array.from({ length: n }, (_, i) => [`${s}:${i + 1}`, on])));

describe('rhythm reading', () => {
  it('checks a unit’s lessons, its skill-map cell and its review, with the Learning path’s lesson numbers', () => {
    const c = checks(progress(), 'rhythm', 1);
    expect(c.map((x) => x.label)).toEqual([
      { key: 'skills.check.lessons', params: { first: '2.1', last: '2.4' } },
      { key: 'skills.check.cell', params: { cell: 'skills.cell.half', pct: 85 } },
      { key: 'skills.check.review', params: { id: '2.5' } },
    ]);
    expect(c.map((x) => x.done)).toEqual([false, false, false]);
    expect(c[0].now).toEqual({ key: 'skills.now.count', params: { done: 0, total: 4 } });
    expect(c[1].now).toBeNull();
    expect(c[2].now).toBeNull();
    // Unit 3 (three-four, whole notes) has no cell to check.
    expect(checks(progress(), 'rhythm', 3)).toHaveLength(2);
    // Levels 9 and 10 come later.
    expect(checks(progress(), 'rhythm', 9)).toEqual([]);
  });

  it('passes level 1 with the lessons at ★★, the half notes at 85% and the review at ★★★', () => {
    const p = progress({ lessons: { ...lessons(['1.1', '1.2', '1.3']), '1.4': { stars: 1, bestAccuracy: 60 }, '1.5': { stars: 2, bestAccuracy: 80 } } }, { days: { [TODAY]: day({ half: [880, 1100] }) } });
    const c = checks(p, 'rhythm', 1);
    expect(c.map((x) => x.done)).toEqual([false, false, false]);
    expect(c[0]).toMatchObject({ now: { params: { done: 3 } }, w: 0.75 });
    // 11 half notes: not enough for an accuracy yet.
    expect(c[1]).toMatchObject({ now: null, w: 0 });
    expect(c[2]).toMatchObject({ now: { key: 'skills.now.stars', params: { count: 2 } } });
    expect(c[2].w).toBeCloseTo(2 / 3);
    const better = progress({ lessons: { ...lessons(['1.1', '1.2', '1.3', '1.4']), '1.5': { stars: 3, bestAccuracy: 92 } } }, { days: { [TODAY]: day({ half: [1020, 1200] }) } });
    expect(checks(better, 'rhythm', 1).map((x) => x.done)).toEqual([true, true, true]);
    expect(checks(better, 'rhythm', 1)[1].now).toEqual({ key: 'skills.now.percent', params: { value: 85 } });
    const { progress: after, added } = passSkills(better, TODAY);
    expect(added).toEqual(['rhythm:1']);
    expect(after.skills).toEqual({ 'rhythm:1': TODAY });
    expect(skillLevel(after, 'rhythm')).toBe(1);
  });

  it('passes levels in order: a level met after a level not met waits', () => {
    // Unit 3 (no cell) done, unit 1 not.
    const p = progress({ lessons: { ...lessons(['3.1', '3.2', '3.3', '3.4']), '3.5': { stars: 3, bestAccuracy: 95 } } });
    expect(checks(p, 'rhythm', 3).every((c) => c.done)).toBe(true);
    expect(passSkills(p, TODAY).added).toEqual([]);
    // Once 1 and 2 are passed, 3 passes too.
    const q = { ...p, skills: passed({ rhythm: 2 }) };
    expect(passSkills(q, TODAY).added).toEqual(['rhythm:3']);
  });
});

describe('rhythm by ear', () => {
  it('counts Echo rounds and the best 4-bar stars with a unit’s material or later', () => {
    const p = progress({}, { echo: { '3': [2, 3], '5': [1, 2] } });
    const one = checks(p, 'ear', 1);
    expect(one.map((c) => c.label)).toEqual([
      { key: 'skills.check.echoRounds', params: { count: 3, material: 'skills.material.1' } },
      { key: 'skills.check.echoBars', params: { bars: 4, material: 'skills.material.1' } },
    ]);
    expect(one.map((c) => c.done)).toEqual([true, true]);
    const four = checks(p, 'ear', 4);
    expect(four.map((c) => c.done)).toEqual([false, false]);
    expect(four[0]).toMatchObject({ now: { params: { done: 1, total: 3 } } });
    expect(four[1]).toMatchObject({ now: { params: { count: 2 } } });
    expect(passSkills(p, TODAY).added).toEqual(['ear:1', 'ear:2', 'ear:3']);
    expect(checks(p, 'ear', 9)).toEqual([]);
  });
});

describe('treble and bass clef', () => {
  it('needs a round that covers the level at 90%, and from level 4 a quick average', () => {
    const p = progress({}, { reading: { 'treble:1': [92, 1800], 'treble:4': [95, 2100], 'bass:10': [96, 1400], 'bass:9': [96, 1600] } });
    expect(checks(p, 'treble', 1)).toEqual([
      { label: { key: 'skills.check.read', params: { what: 'skills.what.treble.1', pct: 90 } }, done: true, now: { key: 'skills.now.percent', params: { value: 92 } }, w: 1 },
    ]);
    const four = checks(p, 'treble', 4);
    expect(four.map((c) => c.done)).toEqual([true, false]);
    expect(four[1].label).toEqual({ key: 'skills.check.speed', params: { seconds: 2 } });
    expect(four[1].now).toEqual({ key: 'skills.now.seconds', params: { value: 2.1 } });
    // As the board writes them: one decimal, also for whole seconds.
    expect(t(four[1].label.key, four[1].label.params)).toBe('Average answer under 2.0 s');
    expect(t('skills.now.seconds', { value: 2 })).toBe('now 2.0 s');
    expect(t(checks(p, 'bass', 10)[1].label.key, checks(p, 'bass', 10)[1].label.params)).toBe('Average answer under 1.5 s');
    setLocale('nl');
    try {
      expect(t(four[1].label.key, four[1].label.params)).toBe('Gemiddeld antwoord onder 2,0 s');
    } finally {
      setLocale('en');
    }
    expect(four[1].w).toBeCloseTo(2000 / 2100);
    expect(checks(p, 'treble', 2)[0]).toMatchObject({ done: false, now: null, w: 0 });
    // Level 10: under 1.5 s.
    expect(checks(p, 'bass', 10).map((c) => c.done)).toEqual([true, true]);
    expect(checks(p, 'bass', 10)[1].label.params).toEqual({ seconds: 1.5 });
    expect(checks(p, 'bass', 9).map((c) => c.done)).toEqual([true, true]);
    expect(passSkills(p, TODAY).added).toEqual(['treble:1']);
  });

  it('never shows an average that misses the target as the target', () => {
    const speed = (ms: number): Check => checks(progress({}, { reading: { 'treble:4': [95, ms] } }), 'treble', 4)[1];
    // Just over 2.0 s: not met, so it reads 2.1 s, with the bar short of full.
    for (const ms of [2001, 2049]) {
      expect(speed(ms)).toMatchObject({ done: false, now: { key: 'skills.now.seconds', params: { value: 2.1 } } });
      expect(Math.round(speed(ms).w * 100)).toBeLessThan(100);
    }
    expect(speed(2000)).toMatchObject({ done: true, w: 1 });
    expect(speed(1951).now).toEqual({ key: 'skills.now.seconds', params: { value: 2 } });
  });
});

describe('scales', () => {
  const stars = (ids: Record<string, number>): Progress => progress({ scales: { settings: null, stars: ids } });

  it('checks each major scale of levels 1–5 at ★★', () => {
    const p = stars({ 'C-major': 3, 'G-major': 2, 'F-major': 1 });
    expect(checks(p, 'scales', 1).map((c) => c.done)).toEqual([true]);
    const two = checks(p, 'scales', 2);
    expect(two.map((c) => c.label)).toEqual([
      { key: 'skills.check.major', params: { tonic: 'G' } },
      { key: 'skills.check.major', params: { tonic: 'F' } },
    ]);
    expect(two.map((c) => [c.done, c.w])).toEqual([[true, 1], [false, 0.5]]);
    expect(checks(p, 'scales', 3).map((c) => c.label.params.tonic)).toEqual(['D', 'B♭']);
    // The tonic as a note too, so a screen reader can be given it in words (B flat).
    expect(checks(p, 'scales', 3).map((c) => c.tonic)).toEqual([{ letter: 'D', alter: 0 }, { letter: 'B', alter: -1 }]);
    expect(passSkills(p, TODAY).added).toEqual(['scales:1']);
  });

  it('counts all 15 majors, checks each of the five minors of each form, then all 60 at ★★★', () => {
    const majors = Object.fromEntries(ALL_SCALES.filter((s) => s.type === 'major').map((s) => [scaleId(s), 2]));
    const p = stars({ ...majors, 'A-natural': 2, 'E-natural': 2, 'D-natural': 3, 'B-natural': 2, 'G-natural': 2, 'A-harmonic': 2 });
    expect(checks(p, 'scales', 6)).toEqual([
      { label: { key: 'skills.check.scaleCount', params: { count: 15, type: 'scales.typeLower.major' } }, done: true, now: { key: 'skills.now.count', params: { done: 15, total: 15 } }, w: 1 },
    ]);
    expect(checks(p, 'scales', 7).map((c) => c.done)).toEqual([true, true, true, true, true]);
    const eight = checks(p, 'scales', 8);
    expect(eight.map((c) => [c.done, c.w])).toEqual([[true, 1], [false, 0], [false, 0], [false, 0], [false, 0]]);
    expect(eight[0]).toMatchObject({ label: { key: 'skills.check.scale', params: { scale: 'scales.name.harmonic', tonic: 'A' } }, tonic: { letter: 'A', alter: 0 }, now: { key: 'skills.now.stars', params: { count: 2 } } });
    expect(passSkills(p, TODAY).added).toEqual(['scales:1', 'scales:2', 'scales:3', 'scales:4', 'scales:5', 'scales:6', 'scales:7']);
    const all = stars(Object.fromEntries(ALL_SCALES.map((s) => [scaleId(s), 3])));
    expect(checks(all, 'scales', 10)[0]).toMatchObject({ label: { key: 'skills.check.allScales', params: { count: 60 } }, done: true });
    expect(passSkills(all, TODAY).added).toHaveLength(10);
  });

  // Only A, E, D, B and G minor count for levels 7–9 (DESIGN.md §8.6): each check names its scale, so five other
  // harmonic minors at ★★★ no longer read as "5 harmonic minor scales at ★★" beside "now 0 of 5".
  it("levels 7–9 name the minor scale each check counts, in the player's language", () => {
    const p = stars({ 'C-harmonic': 3, 'F-harmonic': 3, 'Bb-harmonic': 3, 'Eb-harmonic': 3, 'F#-harmonic': 3 });
    const text = (c: Check): string => t(c.label.key, translateParams(c.label.params));
    expect(checks(p, 'scales', 7).map(text)).toEqual(['A natural minor at ★★', 'E natural minor at ★★', 'D natural minor at ★★', 'B natural minor at ★★', 'G natural minor at ★★']);
    const eight = checks(p, 'scales', 8);
    expect(eight.map(text)).toEqual(['A harmonic minor at ★★', 'E harmonic minor at ★★', 'D harmonic minor at ★★', 'B harmonic minor at ★★', 'G harmonic minor at ★★']);
    expect(eight.some((c) => c.done)).toBe(false);
    expect(text(checks(p, 'scales', 9)[4])).toBe('G melodic minor at ★★');
    setLocale('nl');
    try {
      expect(text(eight[0])).toBe('A harmonisch mineur op ★★');
    } finally {
      setLocale('en');
    }
  });
});

describe('theory', () => {
  it('checks every section of a level’s chapters: 1–9 one chapter each, 10 chapters 10 and 11', () => {
    const p = progress({ learnRead: ['1.1', '1.2', '1.3', '2.1'] });
    expect(checks(p, 'theory', 1).map((c) => [c.label, c.done])).toEqual([
      [{ key: 'skills.check.section', params: { id: '1.1', title: 'learn.ch1.s1.title' } }, true],
      [{ key: 'skills.check.section', params: { id: '1.2', title: 'learn.ch1.s2.title' } }, true],
      [{ key: 'skills.check.section', params: { id: '1.3', title: 'learn.ch1.s3.title' } }, true],
    ]);
    const ten = checks(p, 'theory', 10).map((c) => c.label.params.id);
    expect(ten).toEqual(CHAPTERS.filter((c) => c.n >= 10).flatMap((c) => c.sections.map((s) => s.id)));
    expect(passSkills(p, TODAY).added).toEqual(['theory:1']);
  });
});

describe('levels, review, gains and history', () => {
  it('names each level', () => {
    expect(levelName('rhythm', 7)).toBe('path.u7.title');
    expect(levelName('ear', 9)).toBe('skills.level.rhythm.9');
    expect(levelName('bass', 2)).toBe('skills.level.bass.2');
    expect(levelName('treble', 6)).toBe('skills.level.notes.6');
    expect(levelName('scales', 10)).toBe('skills.level.scales.10');
    expect(levelName('theory', 9)).toBe('learn.chapters.9.title');
    expect(levelName('theory', 10)).toBe('skills.level.theory.10');
  });

  it('counts the level up to the first gap', () => {
    expect(skillLevel(progress({ skills: { 'bass:1': TODAY, 'bass:2': TODAY, 'bass:4': TODAY } }), 'bass')).toBe(2);
    expect(skillLevel(progress({ skills: passed({ scales: 10 }) }), 'scales')).toBe(10);
  });

  it('is due for review 14 days after the skill was last practised, with a level', () => {
    const p = (seen: string, level = 1): Progress => progress({ skills: passed({ treble: level }) }, { seen: { treble: seen } });
    expect(reviewOf(p(shiftDay(TODAY, -14)), 'treble', TODAY)).toEqual({ due: true, days: 14 });
    expect(reviewOf(p(shiftDay(TODAY, -13)), 'treble', TODAY)).toEqual({ due: false, days: 13 });
    expect(reviewOf(p(shiftDay(TODAY, -30), 0), 'treble', TODAY)).toEqual({ due: false, days: 30 });
    expect(reviewOf(progress({ skills: passed({ treble: 2 }) }), 'treble', TODAY)).toEqual({ due: false, days: null });
    // A day after today (another device's time zone, or a clock set wrong) counts as today, never as days to come.
    expect(reviewOf(p(shiftDay(TODAY, 1)), 'treble', TODAY)).toEqual({ due: false, days: 0 });
    expect(reviewOf(p('2027-01-15'), 'treble', TODAY)).toEqual({ due: false, days: 0 });
  });

  it('counts levels passed in the last 30 days, and the level at the end of each of the last 12 weeks', () => {
    // Today is a Sunday (2026-10-25); weeks run Monday to Sunday.
    const p = progress({ skills: { 'rhythm:1': '2026-08-01', 'rhythm:2': shiftDay(TODAY, -29), 'rhythm:3': shiftDay(TODAY, -6), 'rhythm:4': TODAY } });
    expect(gainOf(p, 'rhythm', TODAY)).toBe(3);
    expect(gainOf(p, 'rhythm', shiftDay(TODAY, 1))).toBe(2);
    // Level 2 on Saturday Sep 26: the week ending Sunday Sep 27 (5 weeks back) has it.
    expect(historyOf(p, 'rhythm', TODAY)).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4]);
    // Midweek, this week’s bar is today’s level: one passed on a day after today counts as today, as in the level.
    expect(historyOf(p, 'rhythm', '2026-10-21')).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4]);
  });

  it('counts a level passed on a day after today (another device a time zone ahead) as passed today', () => {
    const p = progress({ skills: { 'scales:1': shiftDay(TODAY, 1) } });
    expect(skillLevel(p, 'scales')).toBe(1);
    expect(gainOf(p, 'scales', TODAY)).toBe(1);
    expect(historyOf(p, 'scales', TODAY).slice(-2)).toEqual([0, 1]);
  });
});

describe('focus next', () => {
  const at = (levels: Record<SkillId, number>): Progress => progress({ skills: passed(levels) });

  it('is the lowest skill, compared with its pair when that is higher, else with the highest skill', () => {
    const f = focusOf(at({ rhythm: 6, ear: 4, treble: 5, bass: 3, scales: 3, theory: 4 }));
    expect(f).toMatchObject({ skill: 'bass', level: 3, other: 'treble', behind: 2 });
    expect(f.label).toEqual({ key: 'skills.focus.behind', params: { skill: 'skills.name.bass', level: 3, count: 2, other: 'skills.nameLower.treble' } });
    expect(f.cta.target).toEqual({ kind: 'notes', clef: 'bass', to: '/notes' });
    expect(focusOf(at({ rhythm: 6, ear: 4, treble: 5, bass: 4, scales: 2, theory: 4 }))).toMatchObject({ skill: 'scales', other: 'rhythm', behind: 4 });
    // The pair is level too: the highest skill.
    expect(focusOf(at({ rhythm: 2, ear: 2, treble: 5, bass: 4, scales: 3, theory: 4 }))).toMatchObject({ skill: 'rhythm', other: 'treble', behind: 3 });
  });

  it('says so when every skill is at one level', () => {
    const f = focusOf(progress());
    expect(f).toMatchObject({ skill: 'rhythm', level: 0, other: null, behind: 0, label: { key: 'skills.focus.equal', params: { level: 0 } } });
  });
});

describe('buttons', () => {
  it('goes where each skill is practised', () => {
    expect(ctaOf(progress(), 'rhythm')).toEqual({ label: { key: 'skills.cta.rhythm', params: { unit: 2 } }, target: { kind: 'route', to: '/path' } });
    expect(ctaOf(progress({ skills: passed({ rhythm: 6 }) }), 'rhythm').label.params).toEqual({ unit: 14 });
    expect(ctaOf(progress({ skills: passed({ rhythm: 8 }) }), 'rhythm')).toEqual({ label: { key: 'skills.cta.rhythmFree', params: {} }, target: { kind: 'route', to: '/setup' } });
    expect(ctaOf(progress(), 'ear').target).toEqual({ kind: 'echo', to: '/setup' });
    expect(ctaOf(progress(), 'treble').target).toEqual({ kind: 'notes', clef: 'treble', to: '/notes' });
    expect(ctaOf(progress(), 'scales').target).toEqual({ kind: 'route', to: '/scales' });
    expect(ctaOf(progress(), 'theory')).toEqual({ label: { key: 'skills.cta.theory', params: { n: 1 } }, target: { kind: 'route', to: '/learn/1' } });
    const ch1 = progress({ learnRead: ['1.1', '1.2', '1.3'], skills: passed({ theory: 1 }) });
    expect(ctaOf(ch1, 'theory').target).toEqual({ kind: 'route', to: '/learn/2' });
    const all = progress({ learnRead: CHAPTERS.flatMap((c) => c.sections.map((s) => s.id)), skills: passed({ theory: 10 }) });
    expect(ctaOf(all, 'theory')).toEqual({ label: { key: 'skills.cta.theoryDone', params: {} }, target: { kind: 'route', to: '/learn' } });
  });

  it('puts Echo mode or one clef on the setup, the rest as it was', () => {
    expect(echoPreset({ ...DEFAULT_SETTINGS, tempo: 70 })).toEqual({ ...DEFAULT_SETTINGS, tempo: 70, mode: 'echo' });
    // A setup the player left without a time signature: one Start plays (weakSpots' playableSetup).
    expect(echoPreset({ ...DEFAULT_SETTINGS, meters: [] })).toEqual({ ...DEFAULT_SETTINGS, mode: 'echo' });
    expect(notesPreset({ ...DEFAULT_NOTE_SETTINGS, clefs: ['treble', 'bass'], keys: ['G'] }, 'bass')).toEqual({ ...DEFAULT_NOTE_SETTINGS, clefs: ['bass'], keys: ['G'] });
  });
});

describe('texts', () => {
  /** A Label's key, and its params that are message keys, are in the catalog. */
  const known = (l: Label | null): void => {
    if (!l) return;
    expect(hasMessage(l.key), l.key).toBe(true);
    for (const v of Object.values(l.params)) if (typeof v === 'string' && /^[a-z]+\.[A-Za-z0-9.]+$/.test(v) && !/^\d/.test(v)) expect(hasMessage(v), v).toBe(true);
  };

  it('has every level name, check, button and focus text', () => {
    const p = progress({}, { reading: { 'treble:4': [80, 2500] }, echo: { '2': [1, 1] } });
    for (const skill of SKILLS) {
      for (let n = 1; n <= 10; n++) {
        expect(hasMessage(levelName(skill, n)), `${skill} ${n}`).toBe(true);
        for (const c of checks(p, skill, n)) {
          known(c.label);
          known(c.now);
        }
      }
      known(ctaOf(p, skill).label);
      expect(hasMessage(`skills.name.${skill}`) && hasMessage(`skills.nameLower.${skill}`)).toBe(true);
    }
    known(focusOf(p).label);
    known(focusOf(progress({ skills: passed({ rhythm: 1 }) })).label);
    for (const k of ['skills.chip.review', 'skills.chip.gain', 'skills.review.title', 'skills.review.text', 'skills.later', 'skills.title']) expect(hasMessage(k), k).toBe(true);
  });

  // A screen reader reads ♯ and ♭ as a symbol or skips them: Skill levels says these names in words (skills.levelSpoken).
  it('has a level name in words for every one that writes a sign, and for no other, in every language', () => {
    try {
      for (const { code } of LOCALES) {
        setLocale(code);
        for (const skill of SKILLS) {
          for (let n = 1; n <= 10; n++) {
            const name = levelName(skill, n);
            const spoken = name.replace(/^skills\.level\./, 'skills.levelSpoken.');
            const sign = /[♯♭𝄪𝄫]/u.test(t(name));
            expect(spoken !== name && hasMessage(spoken), `${code} ${name}`).toBe(sign);
            if (sign) expect(t(spoken), `${code} ${spoken}`).not.toMatch(/[♯♭𝄪𝄫]/u);
          }
        }
      }
    } finally {
      setLocale('en');
    }
  });
});
