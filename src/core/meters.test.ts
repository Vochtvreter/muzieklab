import { getMeter, isCadencePosition } from './meters';

describe('getMeter', () => {
  it('describes 2/4, 3/4 and 4/4', () => {
    expect(getMeter('2/4')).toMatchObject({ barTicks: 96, beatTicks: 48, beatsPerBar: 2, beamGroups: [48, 48] });
    expect(getMeter('3/4')).toMatchObject({ barTicks: 144, beatsPerBar: 3, beamGroups: [48, 48, 48] });
    expect(getMeter('4/4')).toMatchObject({ barTicks: 192, beatsPerBar: 4, beamGroups: [48, 48, 48, 48] });
  });

  it('uses the 4/4 weights of §5.2', () => {
    const m = getMeter('4/4');
    const row = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144].map((t) => m.weightAt(t));
    expect(row).toEqual([4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2]);
  });

  it('gives 3/4 and 2/4 a strong downbeat and equal other beats', () => {
    const w3 = getMeter('3/4').weightAt;
    expect([0, 24, 48, 72, 96, 108].map(w3)).toEqual([3, 1, 2, 1, 2, 0]);
    const w2 = getMeter('2/4').weightAt;
    expect([0, 12, 24, 48, 96].map(w2)).toEqual([3, 0, 1, 2, 3]);
  });

  it('gives triplet positions weight 0 and returns a stable object', () => {
    expect(getMeter('4/4').weightAt(16)).toBe(0);
    expect(getMeter('3/4')).toBe(getMeter('3/4'));
  });

  it('knows cadence positions', () => {
    expect(isCadencePosition(getMeter('4/4'), 96)).toBe(true);
    expect(isCadencePosition(getMeter('4/4'), 48)).toBe(false);
    expect(isCadencePosition(getMeter('3/4'), 48)).toBe(true);
  });
});
