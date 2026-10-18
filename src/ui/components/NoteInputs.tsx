/**
 * Read notes answers (DESIGN.md §3.5): the sign row (♭ ♮ ♯) and seven name buttons (do re mi in scale order, or letters
 * A–G with the do re mi name in small type), and the one-octave piano (7 white, 5 black keys, optional labels).
 * Desktop shows each control's computer key.
 */
import type { CSSProperties } from 'react';
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

/** ♭ · ♮ · ♯, picked before the name (♮, no sign, is the default). A radio group with a sliding highlight. */
export function SignRow({ value, onChange, disabled, kbd }: SignRowProps): JSX.Element {
  const i = SIGNS.indexOf(value);
  const blob = { '--i': i } as CSSProperties;
  return (
    <div className="sign-row">
      <span className="label sign-row-label" aria-hidden="true">
        {t('notes.play.signLabel')}
      </span>
      <div role="radiogroup" aria-label={t('notes.play.signGroup')} className="sign-group" style={blob}>
        {SIGNS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={a === value} aria-label={signWord(a)} disabled={disabled}
            className={'sign-btn' + (a === value ? ' is-on' : '')} onClick={() => onChange(a)}>
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
  marks: Partial<Record<Letter, KeyMark>>;
  onPick(letter: Letter): void;
  disabled?: boolean;
  kbd?: boolean;
}

/** Seven name buttons showing the chosen sign: do re mi … in scale order, or A B C … in alphabetical order. */
export function NameButtons({ system, sign, marks, onPick, disabled, kbd }: NameButtonsProps): JSX.Element {
  const order = system === 'solfege' ? LETTERS : ALPHA;
  return (
    <div className={'name-grid' + (system === 'solfege' ? ' name-grid--solfege' : '')} role="group" aria-label={t('notes.play.names')}>
      {order.map((L) => {
        const mark = marks[L];
        const main = system === 'solfege' ? solfegeName(L, sign) : letterName(L, sign);
        const sub = system === 'solfege' ? letterName(L, sign) : solfegeName(L, sign);
        const aria = system === 'solfege' ? `${solfegeName(L, 0)}, ${spokenName(L, sign)}` : spokenName(L, sign);
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

/** One octave, C to B. Black keys answer sharps and flats; both their names are on the key. */
export function Piano({ labels, marks, onPick, disabled, kbd }: PianoProps): JSX.Element {
  const name = (L: Letter, a: Alter): string => (labels === 'solfege' ? solfegeName(L, a) : letterName(L, a));
  return (
    <div className={'piano' + (kbd ? ' piano--kbd' : '')} role="group" aria-label={t('notes.play.piano')}>
      {WHITE_KEYS.map((L, i) => {
        const pc = WHITE_PC[L];
        const aria = `${spokenName(L, 0)}, ${solfegeName(L, 0)}`;
        return (
          <button key={L} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: WHITE_KBD[i] }) : aria}
            className={'piano-white' + (marks[pc] ? ' is-' + marks[pc] : '')} onClick={() => onPick(pc)}>
            {labels !== 'off' && <span className="piano-label">{name(L, 0)}</span>}
            {kbd && <kbd className="kbd kbd--cap">{WHITE_KBD[i]}</kbd>}
          </button>
        );
      })}
      {BLACK_KEYS.map((b, i) => {
        const aria = t('notes.play.blackKey', { sharp: spokenName(b.sharp, 1), flat: spokenName(b.flat, -1) });
        return (
          <button key={b.pc} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: BLACK_KBD[i] }) : aria}
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
      })}
    </div>
  );
}
