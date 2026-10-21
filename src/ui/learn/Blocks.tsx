/** Draws the content blocks of a Learn section (chapters.ts): text, tips, lists, staves, the piano and side-by-side pairs. */
import { useMemo, useState, type CSSProperties } from 'react';
import { LETTERS, PPQ, getMeter, letterOf, type ScaleAlter, type Letter, type Meter, type MeterId, type NotatedSymbol, type NoteValue } from '../../core/api';
import { countBar, countText, type CountMark } from '../../render/counting';
import { PitchStaff, type PitchNote } from '../../render/PitchStaff';
import { Staff } from '../../render/Staff';
import { parseBars } from '../../render/notationText';
import { hasMessage, t } from '../../i18n';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useBreakpoint } from '../hooks';
import { letterName, solfegeName } from '../lib/noteText';
import { parsePitch, sectionKey, type Block } from './chapters';

type BlockOf<K extends Block['kind']> = Extract<Block, { kind: K }>;

export function Blocks({ id, blocks }: { id: string; blocks: Block[] }): JSX.Element {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} id={id} block={b} />
      ))}
    </>
  );
}

function BlockView({ id, block: b }: { id: string; block: Block }): JSX.Element {
  const tk = (key: string): string => t(sectionKey(id, key));
  switch (b.kind) {
    case 'text':
      return <p>{tk(b.text)}</p>;
    case 'tip':
      return <div className="learn-aid">{tk(b.text)}</div>;
    case 'list':
      return (
        <ul className="learn-list">
          {b.items.map((key) => (
            <li key={key}>{tk(key)}</li>
          ))}
        </ul>
      );
    case 'tiles':
      return (
        <div className="learn-pair">
          {b.tiles.map((tile) => (
            <div key={tile.title} className="learn-tile">
              <span aria-hidden="true" className="learn-clef">
                {tile.glyph}
              </span>
              <b>{tk(tile.title)}</b>
              <span>{tk(tile.text)}</span>
            </div>
          ))}
        </div>
      );
    case 'staff':
      return <StaffBlock id={id} block={b} />;
    case 'rhythm':
      return <RhythmBlock id={id} block={b} />;
    case 'table':
      return (
        <div className="learn-table">
          {b.rows.map((r) => (
            <div key={r.title} className="learn-table-row">
              {r.glyph && (
                <span aria-hidden="true" className="learn-table-glyph">
                  {r.glyph}
                </span>
              )}
              <span className="learn-table-text">
                <b>{tk(r.title)}</b>
                {r.text && <span>{tk(r.text)}</span>}
              </span>
              {r.value && <span className="mono-accent learn-table-value">{tk(r.value)}</span>}
            </div>
          ))}
        </div>
      );
    case 'accents':
      return <Accents meters={b.meters} />;
    case 'pulse':
      return <Pulse tempos={b.tempos} alt={tk(b.alt)} />;
    case 'timeSig': {
      const [top, bottom] = b.meter.split('/');
      return (
        <div className="learn-timesig">
          <span aria-hidden="true" className="learn-timesig-num">
            <span>{top}</span>
            <span>{bottom}</span>
          </span>
          <span className="learn-timesig-text">
            <span>{tk(b.top)}</span>
            <span>{tk(b.bottom)}</span>
          </span>
        </div>
      );
    }
    case 'beatGrid':
      return <BeatGrid id={id} block={b} />;
    case 'noteTree':
      return <NoteTree />;
    case 'piano':
      return <PianoDiagram alt={tk(b.alt)} marked={b.marked ?? []} />;
    case 'noteNames':
      return (
        <div className="learn-names">
          {LETTERS.map((L) => (
            <div key={L}>
              <b>{letterName(L, 0)}</b>
              <span>{solfegeName(L, 0)}</span>
            </div>
          ))}
        </div>
      );
    case 'pair':
      return (
        <div className={'learn-pair' + (b.variant ? ' learn-pair--' + b.variant : '')}>
          {b.columns.map((col, i) =>
            col.length === 1 && col[0].kind !== 'text' && col[0].kind !== 'list' ? (
              <BlockView key={i} id={id} block={col[0]} />
            ) : (
              <div key={i} className="learn-col">
                <Blocks id={id} blocks={col} />
              </div>
            ),
          )}
        </div>
      );
  }
}

const nameOf = (step: number, octave: boolean, alter: ScaleAlter): string => letterName(letterOf(step), alter) + (octave ? Math.floor(step / 7) : '');

function StaffBlock({ id, block: b }: { id: string; block: BlockOf<'staff'> }): JSX.Element {
  const notes = useMemo<PitchNote[]>(
    () =>
      b.notes
        .split(/\s+/)
        .filter(Boolean)
        .map((text) => {
          const p = parsePitch(text)!;
          return b.labels ? { ...p, label: nameOf(p.step, b.labels === 'nameOctave', p.sign ?? 0) } : p;
        }),
    [b.notes, b.labels],
  );
  const names = notes.map((n) => nameOf(n.step, false, n.sign ?? 0)).join(', ');
  const alt = t(sectionKey(id, b.alt), { names });
  const keyId = b.keyId ?? 'C';
  // A value is shown as written ('F C G D A E B'), or from the catalog when it names a text of the section (a step
  // pattern reads W W H in English and 1 1 ½ in Dutch).
  const value = b.value && hasMessage(sectionKey(id, b.value)) ? t(sectionKey(id, b.value)) : b.value;
  if (b.slots === 0) {
    return (
      <div className="learn-sig">
        <PitchStaff clef={b.clef} keyId={keyId} notes={[]} slots={0} room={b.room ?? 1.2} label={alt} />
        {value && <span className="mono-accent">{value}</span>}
      </div>
    );
  }
  const staff = <PitchStaff clef={b.clef} keyId={keyId} notes={notes} slots={b.slots} scale={1.2} room={b.room ?? 1.6} barlines={b.barlines} label={alt} />;
  if (!b.title) return staff;
  return (
    <div className="learn-example">
      <div className="learn-example-head">
        <b>{t(sectionKey(id, b.title))}</b>
        {value && <span className="mono-accent">{value}</span>}
      </div>
      {staff}
    </div>
  );
}

/** The word for a count under the notes, in the player's language: "1", "&", "trip". */
const syllable = (m: CountMark): string => (m.part === 'beat' ? t('count.beat', { beat: m.beat }) : t('count.' + m.part));

/** Room for the clef and time signature, and the width a bar needs per beat, note and count, on tablet and desktop. */
const RHYTHM_START = 48;
const barWidth = (meter: Meter, symbols: NotatedSymbol[]): number =>
  Math.max(meter.beatsPerBar * 64, symbols.length * 30, countBar(meter, symbols).length * 34) + 16;

function RhythmBlock({ id, block: b }: { id: string; block: BlockOf<'rhythm'> }): JSX.Element {
  const bp = useBreakpoint();
  const meter = getMeter(b.meter);
  const bars = useMemo(() => parseBars(meter, b.bars), [meter, b.bars]);
  // On wider screens an example is as wide as its notes need, as on the canvas, not the whole column.
  const fit = bp === 'phone' ? undefined : RHYTHM_START + bars.reduce((w, bar) => w + barWidth(meter, bar.symbols), 0);
  const staff = (
    <div className="learn-rhythm" style={{ maxWidth: fit }}>
      <Staff bars={bars} meter={meter} barsPerRow={Math.min(bars.length, bp === 'phone' ? 2 : 4)} label={t(sectionKey(id, b.alt))}
        countText={syllable} timeSig={b.common ? 'C' : undefined} />
    </div>
  );
  if (!b.title && !b.verdict) return staff;
  return (
    <div className="learn-example">
      {b.verdict && (
        <span className={'learn-verdict is-' + b.verdict}>
          <Icon name={b.verdict === 'write' ? 'check' : 'close'} size={14} strokeWidth={3} />
          {t('learn.' + b.verdict)}
        </span>
      )}
      {b.title && (
        <div className="learn-example-head">
          <b>{t(sectionKey(id, b.title))}</b>
          {b.value && <span className="mono-accent">{t(sectionKey(id, b.value))}</span>}
        </div>
      )}
      {staff}
    </div>
  );
}

type Accent = 'strong' | 'medium' | 'weak';
/** Beat 1 is strong; a beat with more metric weight than the others (beat 3 of 4/4) is medium; the rest are weak. */
function accentsOf(id: MeterId): Accent[] {
  const m = getMeter(id);
  return Array.from({ length: m.beatsPerBar }, (_, i) => {
    if (i === 0) return 'strong';
    return m.weightAt(i * m.beatTicks) > m.weightAt(m.beatTicks) ? 'medium' : 'weak';
  });
}

function Accents({ meters }: { meters: MeterId[] }): JSX.Element {
  return (
    <div className="learn-accents">
      {meters.map((id) => {
        const accents = accentsOf(id);
        const beats = accents.map((a, i) => t('learn.accent.beat', { n: i + 1, level: t('learn.accent.' + a) })).join(', ');
        return (
          <div key={id} className="learn-accent-row" role="img" aria-label={t('learn.accent.alt', { meter: id, beats })}>
            <b aria-hidden="true" className="mono-accent">
              {id}
            </b>
            <span aria-hidden="true" className="learn-accent-beats">
              {accents.map((a, i) => (
                <span key={i} className={'learn-accent is-' + a}>
                  <span className="learn-accent-bar" />
                  <span>
                    <b>{i + 1}</b> {t('learn.accent.' + a)}
                  </span>
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const PULSE_SECONDS = 4;

/** Four seconds of beats per tempo: one dot per beat on a time line. */
function Pulse({ tempos, alt }: { tempos: number[]; alt: string }): JSX.Element {
  return (
    <div className="learn-pulse" role="img" aria-label={alt}>
      {tempos.map((bpm) => (
        <div key={bpm} className="learn-pulse-row" aria-hidden="true">
          <span className="mono-muted">{t('learn.pulse.bpm', { bpm })}</span>
          <span className="learn-pulse-track">
            {Array.from({ length: Math.round((bpm * PULSE_SECONDS) / 60) }, (_, i) => (
              <span key={i} className="learn-pulse-dot" style={{ left: ((i * 60) / bpm / PULSE_SECONDS) * 100 + '%' }} />
            ))}
          </span>
        </div>
      ))}
      <div className="learn-pulse-row learn-pulse-axis" aria-hidden="true">
        <span className="mono-muted">{t('learn.pulse.time')}</span>
        <span className="learn-pulse-track">
          {Array.from({ length: PULSE_SECONDS }, (_, s) => (
            <span key={s} style={{ left: (s / PULSE_SECONDS) * 100 + '%' }}>
              {t('learn.pulse.sec', { s })}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Columns in the beat grid: 12 holds halves, thirds and quarters of the beat. */
const GRID = 12;
const ONE_BEAT = { beatTicks: PPQ, beatsPerBar: 1 };

/** One beat, divided: each row's counts in a shared grid, so "1 &", "1 trip let" and "1 e & a" line up. */
function BeatGrid({ id, block: b }: { id: string; block: BlockOf<'beatGrid'> }): JSX.Element {
  const rows = useMemo(
    () =>
      b.rows.map((r) => {
        const marks = countBar(ONE_BEAT, parseBars(getMeter('4/4'), [r.beat])[0].symbols);
        const texts = countText(marks, syllable);
        return {
          title: r.title,
          cells: marks.map((m, i) => ({
            text: texts[i],
            held: m.held,
            from: (m.tick / PPQ) * GRID,
            to: ((marks[i + 1]?.tick ?? PPQ) / PPQ) * GRID,
          })),
        };
      }),
    [b.rows],
  );
  return (
    <div className="learn-grid" role="img" aria-label={t(sectionKey(id, b.alt))}>
      <span className="eyebrow" aria-hidden="true">
        {t('learn.grid.beat')}
      </span>
      {rows.map((r) => (
        <div key={r.title} className="learn-grid-row" aria-hidden="true">
          <span className="learn-grid-title">{t(sectionKey(id, r.title))}</span>
          <span className="learn-grid-cells">
            {r.cells.map((c, i) => (
              <span key={i} className={'learn-grid-cell' + (c.held ? ' is-held' : '')} style={{ gridColumn: `${c.from + 1} / ${c.to + 1}` }}>
                {c.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

const TREE: { value: NoteValue; count: number; notes: string; rests: string }[] = [
  { value: 'whole', count: 1, notes: 'w', rests: 'W' },
  { value: 'half', count: 2, notes: 'h h', rests: 'hr hr' },
  { value: 'quarter', count: 4, notes: 'q q q q', rests: 'qr qr qr qr' },
  { value: 'eighth', count: 8, notes: '[8 8] [8 8] [8 8] [8 8]', rests: Array(8).fill('8r').join(' ') },
  { value: 'sixteenth', count: 16, notes: Array(4).fill('[16 16 16 16]').join(' '), rests: Array(16).fill('16r').join(' ') },
];

/** The note tree (DESIGN.md §9.1, chapter 2): each row one bar of 4/4, with a Notes | Rests switch. */
function NoteTree(): JSX.Element {
  const [kind, setKind] = useState<'notes' | 'rests'>('notes');
  const meter = getMeter('4/4');
  const rows = useMemo(() => TREE.map((r) => ({ ...r, bars: parseBars(meter, [r[kind]]) })), [meter, kind]);
  return (
    <div className="learn-tree">
      <Segmented<'notes' | 'rests'> label={t('learn.tree.label')} value={kind} onChange={setKind}
        options={[{ value: 'notes', label: t('learn.tree.notes') }, { value: 'rests', label: t('learn.tree.rests') }]} />
      <span className="muted-text">{t('learn.tree.bar')}</span>
      {rows.map((r) => {
        const name = t((kind === 'notes' ? 'value.' : 'rest.') + r.value);
        return (
          <div key={r.value} className="learn-example learn-tree-row">
            <div className="learn-example-head">
              <b className="learn-tree-name">{name}</b>
              <span className="mono-accent">{t('learn.tree.len.' + r.value)}</span>
            </div>
            <Staff bars={r.bars} meter={meter} barsPerRow={1} label={t('learn.tree.alt', { count: r.count, name })} />
          </div>
        );
      })}
    </div>
  );
}

/** One piano octave, C to B, labelled with letters; `marked` white keys are tinted. */
function PianoDiagram({ alt, marked }: { alt: string; marked: string[] }): JSX.Element {
  return (
    <div className="piano piano--diagram" role="img" aria-label={alt}>
      {LETTERS.map((L: Letter) => (
        <span key={L} className={'piano-white' + (marked.includes(L) ? ' is-marked' : '')} aria-hidden="true">
          <span className="piano-label">{letterName(L, 0)}</span>
        </span>
      ))}
      {[1, 2, 4, 5, 6].map((after) => (
        <span key={after} className="piano-black" aria-hidden="true" style={{ '--after': after } as CSSProperties} />
      ))}
    </div>
  );
}
