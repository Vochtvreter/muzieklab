import { INTRO_IDS, type Intro } from '../../game/intro';
import { setLocale } from '../../i18n';
import { CHAPTERS } from '../learn/chapters';
import { introFact, introName, introSection } from './intros';

/** Every intro there can be, back from its id. */
const ALL: Intro[] = INTRO_IDS.map((id): Intro => {
  const [kind, v] = id.split(':');
  if (kind === 'meter') return { kind, meter: v as '2/4' };
  if (kind === 'note' || kind === 'rest') return { kind, value: v as 'half' };
  return { kind: kind as 'ties' };
});

afterEach(() => setLocale('en'));

describe('intro texts', () => {
  it('names each new symbol with one short fact, in English and Dutch', () => {
    expect(ALL).toHaveLength(INTRO_IDS.length);
    for (const locale of ['en', 'nl']) {
      setLocale(locale);
      for (const i of ALL) {
        expect(introName(i), JSON.stringify(i)).not.toMatch(/^(intro|noteButton|restButton)\./);
        expect(introFact(i), JSON.stringify(i)).not.toMatch(/^intro\./);
      }
    }
    setLocale('en');
    expect(`${introName({ kind: 'note', value: 'half' })} · ${introFact({ kind: 'note', value: 'half' })}`).toBe('Half note · 2 beats');
    expect(`${introName({ kind: 'rest', value: 'quarter' })} · ${introFact({ kind: 'rest', value: 'quarter' })}`).toBe('Quarter rest · 1 beat of silence');
    expect(`${introName({ kind: 'meter', meter: '3/4' })} · ${introFact({ kind: 'meter', meter: '3/4' })}`).toBe('Three-four · 3 beats in a bar');
  });

  it('links each to a Learn section that exists', () => {
    const sections = new Set(CHAPTERS.flatMap((c) => c.sections.map((s) => s.id)));
    for (const i of ALL) expect(sections, JSON.stringify(i)).toContain(introSection(i));
  });
});
