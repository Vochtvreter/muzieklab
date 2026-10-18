/** Draws the content blocks of a Learn section (chapters.ts): text, tips, lists, staves, the piano and side-by-side pairs. */
import { useMemo, type CSSProperties } from 'react';
import { LETTERS, getMeter, letterOf, type Alter, type Letter } from '../../core/api';
import { PitchStaff, type PitchNote } from '../../render/PitchStaff';
import { Staff } from '../../render/Staff';
import { parseBars } from '../../render/notationText';
import { t } from '../../i18n';
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

const nameOf = (step: number, octave: boolean, alter: Alter): string => letterName(letterOf(step), alter) + (octave ? Math.floor(step / 7) : '');

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
  if (b.slots === 0) {
    return (
      <div className="learn-sig">
        <PitchStaff clef={b.clef} keyId={keyId} notes={[]} slots={0} room={b.room ?? 1.2} label={alt} />
        {b.value && <span className="mono-accent">{b.value}</span>}
      </div>
    );
  }
  const staff = <PitchStaff clef={b.clef} keyId={keyId} notes={notes} slots={b.slots} scale={1.2} room={b.room ?? 1.6} label={alt} />;
  if (!b.title) return staff;
  return (
    <div className="learn-example">
      <div className="learn-example-head">
        <b>{t(sectionKey(id, b.title))}</b>
        {b.value && <span className="mono-accent">{b.value}</span>}
      </div>
      {staff}
    </div>
  );
}

function RhythmBlock({ id, block: b }: { id: string; block: BlockOf<'rhythm'> }): JSX.Element {
  const bp = useBreakpoint();
  const meter = getMeter(b.meter);
  const bars = useMemo(() => parseBars(meter, b.bars), [meter, b.bars]);
  return (
    <div className="learn-rhythm">
      <Staff bars={bars} meter={meter} barsPerRow={Math.min(bars.length, bp === 'phone' ? 2 : 4)} label={t(sectionKey(id, b.alt))} />
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
