import { setLocale } from '../../i18n';
import { calibrateBackQuery, calibrateQuery, learnReturn } from './learnReturn';

const q = (s: string): URLSearchParams => new URLSearchParams(s);

describe('learnReturn', () => {
  it('goes back to the section a Practice link came from', () => {
    expect(learnReturn(q('from=3.1'))).toEqual({ to: '/learn/3', query: 's=3.1', label: 'Back to chapter 3', tab: '/learn' });
    expect(learnReturn(q('from=10.2'))).toEqual({ to: '/learn/10', query: 's=10.2', label: 'Back to chapter 10', tab: '/learn' });
  });

  it("goes back to the chapter's end from its Practice button there, and to the chapter when the section is not one of its", () => {
    expect(learnReturn(q('from=8'))).toEqual({ to: '/learn/8', query: 's=check', label: 'Back to chapter 8', tab: '/learn' });
    expect(learnReturn(q('from=3.9'))).toEqual({ to: '/learn/3', label: 'Back to chapter 3', tab: '/learn' });
  });

  it('goes back to Progress, Skill levels or the skill a practice button there came from, with Progress current', () => {
    expect(learnReturn(q('from=progress'))).toEqual({ to: '/progress', label: 'Back to Progress', tab: '/progress' });
    expect(learnReturn(q('from=skills'))).toEqual({ to: '/progress/skills', label: 'Back to Skill levels', tab: '/progress' });
    expect(learnReturn(q('from=skills.treble'))).toEqual({ to: '/progress/skills/treble', label: 'Back to Treble clef in Skill levels', tab: '/progress' });
    setLocale('nl');
    expect(learnReturn(q('from=skills.ear'))?.label).toBe('Terug naar Ritme op gehoor in Vaardigheden');
    setLocale('en');
  });

  it('is null when the setup was not opened from Learn or Progress, or the chapter or skill does not exist', () => {
    expect(learnReturn(q(''))).toBeNull();
    expect(learnReturn(q('from=99'))).toBeNull();
    expect(learnReturn(q('from=home'))).toBeNull();
    expect(learnReturn(q('from=3.1.2'))).toBeNull();
    expect(learnReturn(q('from=skills.nope'))).toBeNull();
    expect(learnReturn(q('from=skills.'))).toBeNull();
  });
});

describe('Calibrate from Results', () => {
  it('passes Results\' Learn return on, and gives it back when it returns to Results', () => {
    expect(calibrateQuery('from=7.3')).toBe('from=results&learn=7.3');
    expect(calibrateQuery('from=7')).toBe('from=results&learn=7');
    expect(calibrateBackQuery(q(calibrateQuery('from=7.3')))).toBe('from=7.3');
    expect(calibrateBackQuery(q(calibrateQuery('from=7')))).toBe('from=7');
  });

  it('passes a Progress return on too', () => {
    expect(calibrateBackQuery(q(calibrateQuery('from=skills.ear')))).toBe('from=skills.ear');
  });

  it('without one, Results is plain', () => {
    expect(calibrateQuery(undefined)).toBe('from=results');
    expect(calibrateBackQuery(q('from=results'))).toBeUndefined();
    expect(calibrateBackQuery(q('from=results&learn=99'))).toBeUndefined();
  });
});
