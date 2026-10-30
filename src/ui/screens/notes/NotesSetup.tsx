/**
 * Read notes setup (DESIGN.md §3.5 Settings): clefs, key, answer with, range, extra signs, notes per round and time,
 * and whether the notes sound.
 */
import { CLEFS, DEFAULT_NOTE_SETTINGS, MAX_NOTES, MIN_NOTES, rangeSteps, roundExtras, roundHasSigns, roundKeys, type Clef, type Extras, type NoteInput, type NoteSettings, type NoteTimer, type Range } from '../../../core/api';
import { PitchStaff } from '../../../render/PitchStaff';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Segmented, SwitchTrack } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { useDocTitle } from '../../hooks';
import { useLearnReturn } from '../../lib/learnReturn';
import { keyPairName, keySignsText, majorName } from '../../lib/noteText';
import { keySpoken } from '../../lib/scaleText';
import { Link } from '../../router';
import { useStore } from '../../store';
import { useStartNotes } from './start';

const CLEF_GLYPH: Record<Clef, string> = { treble: '𝄞', bass: '𝄢' };
const STEP = 10;

export function NotesSetup(): JSX.Element {
  const { state, dispatch } = useStore();
  const start = useStartNotes();
  useDocTitle(t('app.docTitle', { page: t('notes.setup.title') }));
  const s = state.noteSettings;
  const update = (patch: Partial<NoteSettings>): void => dispatch({ type: 'noteSettings', settings: { ...s, ...patch } });
  // Opened from a Learn section: Back returns there, also after a visit to the Key screen.
  const { back, carry } = useLearnReturn();

  const keys = roundKeys(s);
  const mixed = keys.length > 1;
  const key = keys[0];
  const keyName = mixed ? t('notes.setup.keysMix', { count: keys.length }) : keyPairName(key);
  const keySub = mixed ? t('notes.setup.keysMixSub') : keySignsText(key);
  // The row's name says the key in words ("F sharp major"): a screen reader reads a sign as a symbol or skips it.
  const keySaid = mixed ? keyName : t('notes.keyPair', { major: keySpoken(key, false), minor: keySpoken(key, true) });
  const keySubSaid = mixed ? keySub : keySignsText(key, true);
  const clefsWord = s.clefs.length > 1 ? t('notes.setup.clefsBoth') : t(s.clefs[0] === 'treble' ? 'notes.setup.clefsTreble' : 'notes.setup.clefsBass');
  // The summary's second line as written ("… · C♯ major"), and in words for screen readers ("… · C sharp major").
  const poolOf = (major: string): string => {
    const pool = t('notes.setup.pool', { count: rangeSteps('treble', s.range).length, key: mixed ? t('notes.done.keysMix', { count: keys.length }) : major });
    // Sharps in C♯ major adds none: every letter is sharp already.
    return roundExtras(s) === 'none' ? pool : t('notes.setup.poolExtras', { pool });
  };

  return (
    <ExerciseFrame className="frame--setup" wide>
      <div className="page setup nsetup no-scrollbar">
        <div className="screen-head">
          <Link to={back?.to ?? '/'} query={back?.query} aria-label={back ? t('learn.backToChapter', { n: back.chapter }) : t('common.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('notes.setup.title')}</h1>
          </div>
          <button type="button" className="text-btn" onClick={() => update({ ...DEFAULT_NOTE_SETTINGS })}>
            {t('notes.setup.reset')}
          </button>
        </div>

        <div className="wide">
          <div className="wide-main">
            <div className="field">
              <div className="label" id="clefs-label">
                {t('notes.setup.clefs')}
              </div>
              <div className="clef-grid" role="group" aria-labelledby="clefs-label">
                {CLEFS.map((c) => {
                  const on = s.clefs.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} className={'clef-btn' + (on ? ' is-on' : '')}
                      onClick={() => {
                        const next = on ? s.clefs.filter((x) => x !== c) : CLEFS.filter((x) => x === c || s.clefs.includes(x));
                        if (next.length) update({ clefs: next });
                      }}>
                      <span aria-hidden="true" className="clef-glyph">
                        {CLEF_GLYPH[c]}
                      </span>
                      <span className="clef-text">
                        <b>{t('notes.clef.' + c)}</b>
                        <span>{t('notes.clefSub.' + c)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <div className="label">{t('notes.setup.key')}</div>
              <Link to="/notes/key" query={carry} className="key-row" aria-label={t('notes.setup.keyAria', { name: keySaid, sub: keySubSaid })}>
                <span className="key-thumb">
                  <PitchStaff clef="treble" keyId={key} notes={[]} slots={0} room={1.5} />
                </span>
                <span className="key-row-text">
                  <b>{keyName}</b>
                  <span>{keySub}</span>
                </span>
                <Icon name="chevron" size={20} className="row-chevron" />
              </Link>
            </div>

            <div className="field">
              <div className="label">{t('notes.setup.answerWith')}</div>
              <Segmented<NoteInput> label={t('notes.setup.answerWith')} value={s.input} onChange={(v) => update({ input: v })}
                options={[
                  { value: 'names', label: t('notes.setup.inputNames') },
                  { value: 'piano', label: t('notes.setup.inputPiano') },
                  { value: 'mixed', label: t('notes.setup.inputMixed') },
                ]} />
              <span className="muted-text input-hint" aria-live="polite">
                {/* No ♭ ♮ ♯ keys to mention when no note of the round can have a sign. */}
                {t(s.input === 'piano' ? 'notes.setup.hintPiano' : s.input === 'mixed' ? 'notes.setup.hintMixed' : roundHasSigns(s) ? 'notes.setup.hintNames' : 'notes.setup.hintNamesPlain')}
              </span>
            </div>

            <div className="field">
              <div className="label">{t('notes.setup.range')}</div>
              <Segmented<Range> label={t('notes.setup.range')} value={s.range} onChange={(v) => update({ range: v })} className="seg--chips" pad={0} gap={8}
                options={[
                  { value: 'staff', label: t('notes.setup.rangeStaff') },
                  { value: 'ledger1', label: t('notes.setup.rangeLedger1') },
                  { value: 'ledger2', label: t('notes.setup.rangeLedger2') },
                ]} />
            </div>

            <div className="field">
              <div className="label">{t('notes.setup.extras')}</div>
              <Segmented<Extras> label={t('notes.setup.extras')} value={s.extras} onChange={(v) => update({ extras: v })} className="seg--chips" pad={0} gap={8}
                options={[
                  { value: 'none', label: t('notes.setup.extrasNone') },
                  { value: 'sharps', label: t('notes.setup.extrasSharps') },
                  { value: 'both', label: t('notes.setup.extrasBoth') },
                ]} />
            </div>

            <div className="bars-tempo">
              <div className="field">
                <div className="label" id="count-label">
                  {t('notes.setup.count')}
                </div>
                {/* A step at its end has nothing to do: aria-disabled, as disabled drops the focus to the page. */}
                <div className="stepper" role="group" aria-labelledby="count-label">
                  <button type="button" aria-label={t('notes.setup.fewer')} aria-disabled={s.count <= MIN_NOTES || undefined}
                    onClick={() => {
                      if (s.count > MIN_NOTES) update({ count: Math.max(MIN_NOTES, s.count - STEP) });
                    }}>
                    −
                  </button>
                  <span aria-live="polite">{s.count}</span>
                  <button type="button" aria-label={t('notes.setup.more')} aria-disabled={s.count >= MAX_NOTES || undefined}
                    onClick={() => {
                      if (s.count < MAX_NOTES) update({ count: Math.min(MAX_NOTES, s.count + STEP) });
                    }}>
                    +
                  </button>
                </div>
              </div>
              <div className="field field--grow">
                <div className="label">{t('notes.setup.timer')}</div>
                <Segmented<NoteTimer> label={t('notes.setup.timer')} value={s.timer} onChange={(v) => update({ timer: v })} className="seg--chips" pad={0} gap={6}
                  options={[
                    { value: 0, label: t('notes.setup.timerOff') },
                    { value: 5, label: t('notes.setup.timerSec', { count: 5 }) },
                    { value: 3, label: t('notes.setup.timerSec', { count: 3 }) },
                  ]} />
              </div>
            </div>

            {/* As in the Scales setup; a path lesson keeps this choice too. */}
            <div className="card ssw">
              <button type="button" role="switch" aria-checked={s.playNotes} className="ssw-row" onClick={() => update({ playNotes: !s.playNotes })}>
                <span className="ssw-text">
                  <b>{t('notes.setup.sound')}</b>
                  <span>{t(s.playNotes ? 'notes.setup.soundOn' : 'notes.setup.soundOff')}</span>
                </span>
                <SwitchTrack on={s.playNotes} />
              </button>
            </div>
          </div>

          <div className="wide-side">
            <div className="nsetup-summary">
              <span aria-hidden="true" className="nsetup-glyphs">
                {s.clefs.map((c) => CLEF_GLYPH[c]).join('')}
              </span>
              <span className="nsetup-summary-text">
                <b>{t('notes.setup.summary', { clefs: clefsWord, input: t('notes.setup.inputWord.' + s.input) })}</b>
                <span>
                  <span aria-hidden="true">{poolOf(majorName(key))}</span>
                  <span className="sr-only">{poolOf(keySpoken(key, false))}</span>
                </span>
              </span>
            </div>

            {/* Opened from Learn (?from=8): the round and its Round done keep the way back, as Round done's do. */}
            <button type="button" className="btn btn--accent start-btn" onClick={() => start(s, [], { query: carry })}>
              {t('notes.setup.start', { count: s.count })}
            </button>
          </div>
        </div>
      </div>
    </ExerciseFrame>
  );
}
