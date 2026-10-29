/**
 * Scales answers (DESIGN.md §3.7): the degree boxes with the W / H steps between them, the 9-white-key piano window
 * that starts on the tonic (its white keys always show their letters), and the sign buttons for spelling (♭ ♮ ♯, and 𝄪 where a scale needs it). Desktop shows each
 * control's computer key.
 */
import type { CSSProperties } from 'react';
import { pianoWindow, type Letter, type Scale, type ScaleAlter, type StepName } from '../../core/api';
import { t } from '../../i18n';
import { letterName, signGlyph, signKey, signWord, spokenName } from '../lib/noteText';
import { stepLabel } from '../lib/scaleText';
import type { KeyMark } from './NoteInputs';

/** The home row plays the white keys; a black key is the letter above the gap between its two white keys. */
export const SCALE_WHITE_KBD = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'] as const;
export const SCALE_GAP_KBD = ['W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O'] as const;
/** − ♭, 0 ♮, = ♯ (as Read notes), X 𝄪. */
export const SCALE_SIGN_KBD: Record<ScaleAlter, string> = { [-2]: '', [-1]: '−', 0: '0', 1: '=', 2: 'X' };

const WHITE_LETTER: Record<number, Letter> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
const pc = (midi: number): number => ((midi % 12) + 12) % 12;

/** "D", "D♯ or E♭": the names of a piano key (for feedback and screen readers). */
export function keyNames(midi: number, spoken = false): string {
  const p = pc(midi);
  const name = spoken ? spokenName : letterName;
  if (WHITE_LETTER[p]) return name(WHITE_LETTER[p], 0);
  return t('notes.play.blackKey', { sharp: name(WHITE_LETTER[p - 1], 1), flat: name(WHITE_LETTER[p + 1], -1) });
}

export interface DegreeCell {
  degree: number;
  /** The box's text: the note once answered; before, the given letter when spelling, or "?" for the next key to play. */
  text: string;
  /** The note once answered, as it is said ("F double sharp"): a screen reader reads F𝄪's sign as a symbol or skips it. */
  spoken?: string;
  /** The given letter, when spelling. */
  given?: string;
  state: 'done' | 'current' | 'next';
}

/**
 * What a screen reader hears for a box, as its colour shows it: the note once answered, else "now" or "not yet", after
 * the letter given when spelling (a given F must not sound like an answer, nor the piano's "?").
 */
function degreeName(c: DegreeCell): string {
  if (c.state === 'done') return c.spoken ?? c.text;
  const when = t(c.state === 'current' ? 'scales.play.now' : 'scales.play.unknown');
  return c.given ? t('common.commaList', { a: c.given, b: when }) : when;
}

/** One line of degree boxes with the steps between them; `steps[i]` sits between boxes i and i + 1. */
export function DegreeRow({ cells, steps, known, label }: { cells: DegreeCell[]; steps: (StepName | null)[]; known: number; label: string }): JSX.Element {
  return (
    <div role="list" aria-label={label} className="degrees" style={{ '--n': cells.length } as CSSProperties}>
      {cells.map((c, i) => (
        <span key={i} className="degree-pair">
          <span role="listitem" className={'degree is-' + c.state} aria-label={t('scales.play.degreeAria', { degree: c.degree, name: degreeName(c) })}
            aria-current={c.state === 'current' ? 'step' : undefined}>
            <span className="degree-n" aria-hidden="true">
              {c.degree}
            </span>
            <span className="degree-name" aria-hidden="true">
              {c.text}
            </span>
          </span>
          {i < cells.length - 1 && (
            <span aria-hidden="true" className={'degree-step' + (i < known ? ' is-known is-' + steps[i] : '')}>
              {steps[i] ? stepLabel(steps[i]!) : ''}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

interface PianoProps {
  scale: Scale;
  /** Marks by MIDI number. */
  marks: Partial<Record<number, KeyMark>>;
  /** Keys already played in this scale get a dot. */
  played: number[];
  onPick(midi: number): void;
  disabled?: boolean;
  kbd?: boolean;
}

/**
 * 9 white keys from the tonic (or the white key below a black tonic), with the black keys between them. The white keys
 * always show A–G, whatever Read notes' label setting: the window moves with every scale, so the letters find the keys.
 */
export function ScalePiano({ scale, marks, played, onPick, disabled, kbd }: PianoProps): JSX.Element {
  const w = pianoWindow(scale);
  const first = WHITE_LETTER[pc(w.whites[0])];
  const last = WHITE_LETTER[pc(w.whites[w.whites.length - 1])];
  // Some keys are in the window twice, an octave apart (its first two white keys, often a black key): say which is which.
  const all = [...w.whites, ...w.blacks.map((b) => b.midi)];
  const octave = (midi: number, name: string): string =>
    all.includes(midi + 12) ? t('scales.play.keyLow', { name }) : all.includes(midi - 12) ? t('scales.play.keyHigh', { name }) : name;
  return (
    <div className={'piano spiano' + (kbd ? ' piano--kbd' : '')} role="group" aria-label={t('scales.play.piano', { from: letterName(first, 0), to: letterName(last, 0) })}>
      {w.whites.map((m, i) => {
        const L = WHITE_LETTER[pc(m)];
        const aria = octave(m, spokenName(L, 0));
        return (
          <button key={m} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key: SCALE_WHITE_KBD[i] }) : aria}
            className={'piano-white' + (marks[m] ? ' is-' + marks[m] : '')} onClick={() => onPick(m)}>
            <span aria-hidden="true" className={'spiano-dot' + (played.includes(m) ? ' is-on' : '')} />
            <span className="piano-label">{letterName(L, 0)}</span>
            {kbd && <kbd className="kbd kbd--cap">{SCALE_WHITE_KBD[i]}</kbd>}
          </button>
        );
      })}
      {w.blacks.map((b) => {
        const key = SCALE_GAP_KBD[b.after - 1];
        const aria = octave(b.midi, keyNames(b.midi, true));
        return (
          <button key={b.midi} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: aria, key }) : aria}
            className={'piano-black' + (marks[b.midi] ? ' is-' + marks[b.midi] : '')} style={{ '--after': b.after } as CSSProperties} onClick={() => onPick(b.midi)}>
            <span aria-hidden="true" className={'spiano-dot' + (played.includes(b.midi) ? ' is-on' : '')} />
            {kbd && <kbd className="kbd kbd--cap kbd--dark">{key}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

interface SignProps {
  letter: Letter;
  choices: ScaleAlter[];
  wrong: ScaleAlter | null;
  onPick(a: ScaleAlter): void;
  disabled?: boolean;
  kbd?: boolean;
}

/** The given letter with each sign: "D♭ flat", "D♮ natural", "D♯ sharp" (and "D𝄪 double sharp" when needed). */
export function SignButtons({ letter, choices, wrong, onPick, disabled, kbd }: SignProps): JSX.Element {
  return (
    <div className="ssigns" role="group" aria-label={t('scales.play.signFor', { letter: t('notes.letter.' + letter) })} style={{ '--n': choices.length } as CSSProperties}>
      {choices.map((a) => {
        // "D natural" too, not just "D": the natural is an answer of its own here.
        const spoken = a === 0 ? t('notes.spoken', { letter: t('notes.letter.' + letter), sign: signWord(0) }) : spokenName(letter, a);
        return (
        <button key={a} type="button" disabled={disabled} aria-label={kbd ? t('notes.play.withKey', { name: spoken, key: SCALE_SIGN_KBD[a] }) : spoken}
          className={'ssign' + (wrong === a ? ' is-wrong' : '')} onClick={() => onPick(a)}>
          <span className="ssign-main" aria-hidden="true">
            {t('notes.letter.' + letter) + signGlyph(a)}
          </span>
          <span className="ssign-word" aria-hidden="true">
            {t('notes.signButton.' + signKey(a))}
          </span>
          {kbd && <kbd className="kbd kbd--cap">{SCALE_SIGN_KBD[a]}</kbd>}
        </button>
        );
      })}
    </div>
  );
}

