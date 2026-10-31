/**
 * Read notes answers (DESIGN.md §3.5): the sign row (♭ ♮ ♯) and seven name buttons (do re mi in scale order, or letters
 * A–G with the do re mi name in small type), and the one-octave piano (7 white, 5 black keys, optional labels).
 * Desktop shows each control's computer key.
 */
import { Fragment, type CSSProperties, type KeyboardEvent } from 'react';
import { BLACK_KEYS, LETTERS, WHITE_KEYS, type Alter, type Letter } from '../../core/api';
import { t } from '../../i18n';
import { letterName, signGlyph, signKey, signWord, solfegeName, spokenName, type NameSystem } from '../lib/noteText';

export type KeyMark = 'right' | 'wrong';

/** Common computer-keyboard piano: the home row plays the white keys, the row above the black keys. */
export const WHITE_KBD = ['A', 'S', 'D', 'F', 'G', 'H', 'J'] as const;
export const BLACK_KBD = ['W', 'E', 'T', 'Y', 'U'] as const;
/** − ♭, 0 ♮, = ♯ (§3.5). */
export const SIGN_KBD: Record<Alter, string> = { [-1]: '−', 0: '0', 1: '=' };

const SIGNS: Alter[] = [-1, 0, 1];
const ALPHA: readonly Letter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

interface SignRowProps {
  value: Alter;
  onChange(a: Alter): void;
  disabled?: boolean;
  kbd?: boolean;
}

/** The arrow keys that go to the next sign (1) or the one before (−1). */
const ARROWS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** ♭ · ♮ · ♯, picked before the name (♮, no sign, is the default). A radio group with a sliding highlight. */
export function SignRow({ value, onChange, disabled, kbd }: SignRowProps): JSX.Element {
  const i = SIGNS.indexOf(value);
  const blob = { '--i': i } as CSSProperties;
  // As a radio group does (a screen reader says so): one Tab stop, on the sign picked, and the arrow keys pick and
  // focus the next sign, round the ends, Home and End the first and last. Alt with an arrow stays the browser's Back.
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? SIGNS.length - 1 : e.key in ARROWS ? (i + ARROWS[e.key] + SIGNS.length) % SIGNS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(SIGNS[to]);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  };
  return (
    <div className="sign-row">
      <span className="label sign-row-label" aria-hidden="true">
        {t('notes.play.signLabel')}
      </span>
      <div role="radiogroup" aria-label={t('notes.play.signGroup')} className="sign-group" style={blob} onKeyDown={onKey}>
        {SIGNS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={a === value} aria-label={signWord(a)} disabled={disabled}
            tabIndex={a === value ? 0 : -1} className={'sign-btn' + (a === value ? ' is-on' : '')} onClick={() => onChange(a)}>
            <span className="sign-glyph">{signGlyph(a)}</span>
            <span className="sign-word">{t('notes.signButton.' + signKey(a))}</span>
            {kbd && <kbd className="kbd kbd--cap">{SIGN_KBD[a]}</kbd>}
          </button>
        ))}
        <span aria-hidden="true" className="sign-thumb" />
      </div>
    </div>
  );
}

interface NameButtonsProps {
  system: NameSystem;
  sign: Alter;
  /** A button's own sign instead of `sign` (after a miss, the right answer shows its full name). */
  signs?: Partial<Record<Letter, Alter>>;
  marks: Partial<Record<Letter, KeyMark>>;
  onPick(letter: Letter): void;
  disabled?: boolean;
  kbd?: boolean;
  /** Only these names (a path lesson: the notes learned so far); default all seven. */
  letters?: readonly Letter[];
}

/** Seven name buttons (or the round's own, fewer) showing the chosen sign: do re mi … in scale order, or A B C … in alphabetical order. */
export function NameButtons({ system, sign, signs, marks, onPick, disabled, kbd, letters }: NameButtonsProps): JSX.Element {
  const order = (system === 'solfege' ? LETTERS : ALPHA).filter((L) => !letters || letters.includes(L));
  const few = order.length < 7;
  return (
    <div className={'name-grid' + (system === 'solfege' ? ' name-grid--solfege' : '') + (few ? ' name-grid--few' : '')} role="group"
      aria-label={t('notes.play.names')} style={few ? { gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))`, maxWidth: order.length * 96 } : undefined}>
      {order.map((L) => {
        const mark = marks[L];
        const a = signs?.[L] ?? sign;
        const main = system === 'solfege' ? solfegeName(L, a) : letterName(L, a);
        const sub = system === 'solfege' ? letterName(L, a) : solfegeName(L, a);
        const aria = system === 'solfege' ? `${solfegeName(L, 0)}, ${spokenName(L, a)}` : spokenName(L, a);
        return (
          <button key={L} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: L }) : aria}
            className={'name-btn' + (mark ? ' is-' + mark : '')} onClick={() => onPick(L)}>
            <span className="name-main">{main}</span>
            {kbd ? <kbd className="kbd kbd--cap">{L}</kbd> : <span className="name-sub">{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface PianoProps {
  labels: 'letters' | 'solfege' | 'off';
  /** Marks by pitch class (0–11). */
  marks: Partial<Record<number, KeyMark>>;
  onPick(pc: number): void;
  disabled?: boolean;
  kbd?: boolean;
}

const WHITE_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * One octave, C to B. Black keys answer sharps and flats; both their names are on the key. Each comes after the white
 * key it follows, so Tab and a screen reader go along the keyboard, low to high, as it is drawn.
 */
export function Piano({ labels, marks, onPick, disabled, kbd }: PianoProps): JSX.Element {
  const name = (L: Letter, a: Alter): string => (labels === 'solfege' ? solfegeName(L, a) : letterName(L, a));
  const blackKey = (i: number): JSX.Element => {
    const b = BLACK_KEYS[i];
    const aria = t('notes.play.blackKey', { sharp: spokenName(b.sharp, 1), flat: spokenName(b.flat, -1) });
    return (
      <button type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: BLACK_KBD[i] }) : aria}
        className={'piano-black' + (marks[b.pc] ? ' is-' + marks[b.pc] : '')} style={{ '--after': b.after } as CSSProperties} onClick={() => onPick(b.pc)}>
        {labels !== 'off' && (
          <span className="piano-label">
            {name(b.sharp, 1)}
            <br />
            {name(b.flat, -1)}
          </span>
        )}
        {kbd && <kbd className="kbd kbd--cap kbd--dark">{BLACK_KBD[i]}</kbd>}
      </button>
    );
  };
  return (
    <div className={'piano' + (kbd ? ' piano--kbd' : '')} role="group" aria-label={t('notes.play.piano')}>
      {WHITE_KEYS.map((L, i) => {
        const pc = WHITE_PC[L];
        const aria = `${spokenName(L, 0)}, ${solfegeName(L, 0)}`;
        const black = BLACK_KEYS.findIndex((b) => b.after === i + 1);
        return (
          <Fragment key={L}>
            <button type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: WHITE_KBD[i] }) : aria}
              className={'piano-white' + (marks[pc] ? ' is-' + marks[pc] : '')} onClick={() => onPick(pc)}>
              {labels !== 'off' && <span className="piano-label">{name(L, 0)}</span>}
              {kbd && <kbd className="kbd kbd--cap">{WHITE_KBD[i]}</kbd>}
            </button>
            {black >= 0 && blackKey(black)}
          </Fragment>
        );
      })}
    </div>
  );
}
