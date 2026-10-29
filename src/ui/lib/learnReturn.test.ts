import { calibrateBackQuery, calibrateQuery, learnReturn } from './learnReturn';

const q = (s: string): URLSearchParams => new URLSearchParams(s);

describe('learnReturn', () => {
  it('goes back to the section a Practice link came from', () => {
    expect(learnReturn(q('from=3.1'))).toEqual({ to: '/learn/3', query: 's=3.1', chapter: 3 });
    expect(learnReturn(q('from=10.2'))).toEqual({ to: '/learn/10', query: 's=10.2', chapter: 10 });
  });

  it("goes back to the chapter's end from its Practice button there, and to the chapter when the section is not one of its", () => {
    expect(learnReturn(q('from=8'))).toEqual({ to: '/learn/8', query: 's=check', chapter: 8 });
    expect(learnReturn(q('from=3.9'))).toEqual({ to: '/learn/3', chapter: 3 });
  });

  it('is null when the setup was not opened from Learn, or the chapter does not exist', () => {
    expect(learnReturn(q(''))).toBeNull();
    expect(learnReturn(q('from=99'))).toBeNull();
    expect(learnReturn(q('from=home'))).toBeNull();
    expect(learnReturn(q('from=3.1.2'))).toBeNull();
  });
});

describe('Calibrate from Results', () => {
  it('passes Results\' Learn return on, and gives it back when it returns to Results', () => {
    expect(calibrateQuery('from=7.3')).toBe('from=results&learn=7.3');
    expect(calibrateQuery('from=7')).toBe('from=results&learn=7');
    expect(calibrateBackQuery(q(calibrateQuery('from=7.3')))).toBe('from=7.3');
    expect(calibrateBackQuery(q(calibrateQuery('from=7')))).toBe('from=7');
  });

  it('without one, Results is plain', () => {
    expect(calibrateQuery(undefined)).toBe('from=results');
    expect(calibrateBackQuery(q('from=results'))).toBeUndefined();
    expect(calibrateBackQuery(q('from=results&learn=99'))).toBeUndefined();
  });
});
