/**
 * The Scales hub's circle of fifths (DESIGN.md §3.7): 12 positions clockwise from C, major keys on the outer ring and
 * their relative minors on the inner one. The ring in front (Major / Minor) is filled by progress; the other one is
 * drawn faint and switches when tapped. The three positions at the bottom have two spellings: each shows the one
 * selected, else the one with more progress on the ring in front, on both rings, and tapping the selected one again
 * switches spelling. The centre shows the selected key signature. Sizes are fractions of the circle, so it scales from a
 * 320 px phone to the 520 px desktop board.
 */
import type { CSSProperties } from 'react';
import { CIRCLE, circlePosition, keySigns, majorLevel, minorLevel, type KeyId, type ScaleStars } from '../../core/api';
import { t } from '../../i18n';
import { PitchStaff } from '../../render/PitchStaff';
import { keySignsAria, letterName } from '../lib/noteText';
import { circleLabel, keySpoken } from '../lib/scaleText';

export type Ring = 'major' | 'minor';

/** Ring radii and button sizes, as fractions of the circle's width (the 358 px phone board). */
const R = { major: 0.408, minor: 0.246 };
const SIZE = { major: { on: 0.14, off: 0.112 }, minor: { on: 0.117, off: 0.089 } };
const HALO = 0.028;

const at = (pos: number, r: number): { left: string; top: string } => {
  const a = (pos * Math.PI) / 6;
  return { left: (50 + r * 100 * Math.sin(a)).toFixed(2) + '%', top: (50 - r * 100 * Math.cos(a)).toFixed(2) + '%' };
};

interface Props {
  tab: Ring;
  selected: KeyId;
  stars: ScaleStars;
  onPick(key: KeyId, tab: Ring): void;
  className?: string;
}

export function CircleOfFifths({ tab, selected, stars, onPick, className }: Props): JSX.Element {
  const selPos = circlePosition(selected);
  const signs = keySigns(selected);
  const sigText = signs.length ? signs.map((s) => letterName(s.letter, s.alter)).join(' ') : t('scales.hub.noSigns');
  const levelOf = (which: Ring, k: KeyId): number => (which === 'major' ? majorLevel(stars, k) : minorLevel(stars, k));
  // The spelling shown at each position: the selected one when it is here, else the one with more progress on the ring
  // in front (the first on a tie), so the key is filled whichever spelling earned it, as on Round done's circle. Both
  // rings take it, so the faint ring still holds the relative minor (C♭ over a♭), never the other spelling's (g♯).
  const shownAt = CIRCLE.map((keys) =>
    keys.includes(selected) ? selected : keys.reduce((best, k) => (levelOf(tab, k) > levelOf(tab, best) ? k : best)),
  );

  const ring = (which: Ring): JSX.Element[] =>
    CIRCLE.map((keys, pos) => {
      const active = which === tab;
      const shown = shownAt[pos];
      const other = keys.find((k) => k !== shown);
      const level = levelOf(which, shown);
      const size = SIZE[which][active ? 'on' : 'off'];
      const on = active && pos === selPos;
      const style = { ...at(pos, R[which]), width: size * 100 + '%', height: size * 100 + '%' } as CSSProperties;
      // Named as said ("G sharp minor"): a screen reader reads a sign as a symbol or skips it.
      const name = keySpoken(shown, which === 'minor');
      const aria = t(which === 'major' ? 'scales.hub.majorAria' : 'scales.hub.minorAria', { name, level }) + (other ? t('scales.hub.alsoAria', { other: keySpoken(other, which === 'minor') }) : '');
      const pick = (): void => {
        if (!active) onPick(shown, which);
        else if (on && other) onPick(other, which);
        else onPick(shown, which);
      };
      return (
        <button key={which + pos} type="button" aria-pressed={on} aria-label={aria} style={style} onClick={pick}
          className={'circle-key circle-key--' + which + (active ? ' is-l' + level : ' is-off') + (on ? ' is-sel' : '')}>
          <span className="circle-key-name">{circleLabel(shown, which === 'minor')}</span>
          {other && <span className="circle-key-alt">{circleLabel(other, which === 'minor')}</span>}
        </button>
      );
    });

  const halo = SIZE[tab].on + HALO;
  const haloStyle = { ...at(selPos, R[tab]), width: halo * 100 + '%', height: halo * 100 + '%' } as CSSProperties;

  return (
    <div role="group" aria-label={t(tab === 'major' ? 'scales.hub.circleMajor' : 'scales.hub.circleMinor')} className={'circle' + (className ? ' ' + className : '')}>
      <div aria-hidden="true" className="circle-ring" />
      <div aria-hidden="true" className="circle-disc" />
      <div className="circle-centre" role="img" aria-label={t('scales.hub.sigAria', { signs: keySignsAria(selected) })}>
        <PitchStaff clef="treble" keyId={selected} notes={[]} slots={0} room={1.4} />
        <span className="circle-sig">{sigText}</span>
      </div>
      <div aria-hidden="true" className="circle-halo m-ease" style={haloStyle} />
      {/* One order whatever the tab (the rings do not overlap): swapping them would remount all 24 keys, and a faint
          key that switches the ring would lose the focus. */}
      {ring('major')}
      {ring('minor')}
    </div>
  );
}
