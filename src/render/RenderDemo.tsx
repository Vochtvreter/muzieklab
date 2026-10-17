import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { LengthLane } from './LengthLane';
import { Staff, type NoteMark } from './Staff';
import { DEMO_34, DEMO_44, DEMO_BARS_34, DEMO_BARS_44, DEMO_LESSON, demoPlay, demoTimeline } from './demoFixtures';

/*
 * Dev-only route: the renderers on hand-written fixtures, in light and dark. Not user-facing, so its strings
 * are not translated. The theme tokens are set on the demo's own wrapper, so it works before the app theme exists.
 */

const THEMES: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--ground': '#eef1f0', '--paper': '#ffffff', '--ink': '#161b1c', '--muted': '#5a6667', '--staff': '#9aa5a5',
    '--good': '#1f8a5b', '--gold': '#b7791f', '--miss': '#d64545', '--slate': '#2f6669',
    '--lane-note': '#dde4e3', '--lane-grid': '#e3e8e7', '--lane-bar': '#b9c3c2',
  },
  dark: {
    '--ground': '#101415', '--paper': '#191f20', '--ink': '#e8eeed', '--muted': '#9aa7a7', '--staff': '#5d6a6b',
    '--good': '#4cc38a', '--gold': '#f0b429', '--miss': '#ff6b6b', '--slate': '#8fbfc1',
    '--lane-note': '#222a2b', '--lane-grid': '#262e2f', '--lane-bar': '#4a5657',
  },
};

const MARKS_BY_JUDGEMENT = (judgements: (NoteMark | undefined)[]): Record<number, NoteMark> =>
  Object.fromEntries(judgements.flatMap((j, i) => (j ? [[i, j]] : [])));

function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <section style={{ background: 'var(--paper)', borderRadius: 20, padding: '14px 8px 10px', width: wide ? 1056 : 358, maxWidth: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 4px 8px', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  );
}

export function RenderDemo({ initialTheme = 'light' }: { initialTheme?: 'light' | 'dark' }): JSX.Element {
  const [theme, setTheme] = useState(initialTheme);
  const lessonTimeline = useMemo(() => demoTimeline(DEMO_44, DEMO_LESSON, 80), []);
  const done = useMemo(() => demoPlay(lessonTimeline, null), [lessonTimeline]);
  const liveNow = lessonTimeline.notes[9].onset + 0.16; // first eighth of bar 3, still held
  const live = useMemo(() => demoPlay(lessonTimeline, liveNow), [lessonTimeline, liveNow]);
  const marksOf = (r: typeof done.result) => MARKS_BY_JUDGEMENT(r.notes.reduce<(NoteMark | undefined)[]>((a, n) => ((a[n.index] = n.judgement), a), []));
  const fixtureTimeline = useMemo(() => demoTimeline(DEMO_44, DEMO_BARS_44, 80), []);

  const style = { ...THEMES[theme], background: 'var(--ground)', color: 'var(--ink)', minHeight: '100vh', padding: 16, boxSizing: 'border-box', fontFamily: 'Figtree, system-ui, sans-serif' } as CSSProperties;

  return (
    <div style={style} data-demo-theme={theme}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Render demo</h1>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? 'Dark' : 'Light'}</button>
      </div>
      <div key={theme} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Fixtures 4/4: beams, dotted, tie over beat 3, rests, whole-bar rest, triplet, tie across rows">
          <Staff bars={DEMO_BARS_44} meter={DEMO_44} barsPerRow={2} label="Fixture exercise in 4/4" />
          <LengthLane timeline={fixtureTimeline} barTicks={DEMO_44.barTicks} barsPerRow={2} taps={[]} />
        </Card>
        <Card title="3/4: centred whole-bar rest">
          <Staff bars={DEMO_BARS_34} meter={DEMO_34} barsPerRow={2} label="Fixture exercise in 3/4" />
        </Card>
        <Card title="Play (phone): cursor, live marks, lane with playhead">
          <Staff bars={DEMO_LESSON} meter={DEMO_44} barsPerRow={2} marks={marksOf(live.result)} cursor={9} label="Lesson exercise, playing" />
          <LengthLane timeline={lessonTimeline} barTicks={DEMO_44.barTicks} barsPerRow={4} taps={live.taps} result={live.result} now={liveNow} />
        </Card>
        <Card title="Results (phone): judged notes and the timing and length lane">
          <Staff bars={DEMO_LESSON} meter={DEMO_44} barsPerRow={2} marks={marksOf(done.result)} label="Lesson exercise, judged" />
          <LengthLane timeline={lessonTimeline} barTicks={DEMO_44.barTicks} barsPerRow={2} taps={done.taps} result={done.result} />
        </Card>
        <Card title="Play (desktop): four bars per row" wide>
          <Staff bars={DEMO_LESSON} meter={DEMO_44} barsPerRow={4} marks={marksOf(live.result)} cursor={9} label="Lesson exercise, playing" />
          <LengthLane timeline={lessonTimeline} barTicks={DEMO_44.barTicks} barsPerRow={4} taps={live.taps} result={live.result} now={liveNow} />
        </Card>
      </div>
    </div>
  );
}
