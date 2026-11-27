/** Practice setup (DESIGN.md §4): every setting on one screen, live preview, difficulty meter and validation (§4.1). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkSettings, DEFAULT_SETTINGS, MAX_BARS, MAX_TEMPO, METER_IDS, NOTE_VALUES, type Density, type MeterId, type Mode, type NoteValue, type RestAmount, type Settings, type WriteKind } from '../../core/api';
import { DEFAULT_MELODY, LISTEN_MAX_BARS, MELODY_DEGREES, melodyStart, writesMelody, writesNotesOnly } from '../../core/dictation';
import { t } from '../../i18n';
import { Chip, Segmented, SwitchTrack } from '../components/Controls';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { exerciseView } from '../exerciseView';
import { useDocTitle } from '../hooks';
import { announce } from '../lib/announce';
import { difficultyLevel, newSeed, tempoWordKey } from '../lib/format';
import { describeBars } from '../lib/notation';
import { degreeName, degreeSub } from '../lib/listenText';
import { useLearnReturn } from '../lib/learnReturn';
import { NO_NOTES_HINT_ID, meterHintId, setupHints, startBlockedKey } from '../lib/setupHints';
import { Link } from '../router';
import { makeRun, practiceHoldPatch, practiceSettings, useStore } from '../store';
import { useStartPractice } from './start';

const NOTE_GLYPH: Record<NoteValue, string> = { whole: '𝅝', half: '𝅗𝅥', quarter: '𝅘𝅥', eighth: '𝅘𝅥𝅮', sixteenth: '𝅘𝅥𝅯' };
const REST_GLYPH: Record<NoteValue, string> = { whole: '𝄻', half: '𝄼', quarter: '𝄽', eighth: '𝄾', sixteenth: '𝄿' };

/** The hint under the greyed Ties and Triplets chips in Listen (aria-describedby). */
const LISTEN_EXTRAS_HINT_ID = 'listen-extras-hint';
const WRITE_HINT: Record<WriteKind, string> = { rhythm: 'setup.hintRhythm', notes: 'setup.hintNotes', melody: 'setup.hintMelody' };

const MODE_HINT: Record<Mode, string> = { tap: 'setup.hintTap', echo: 'setup.hintEcho', listen: 'setup.hintListen' };

const toggle = <T,>(list: T[], v: T, order: readonly T[]): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : order.filter((x) => x === v || list.includes(x));

export function Setup(): JSX.Element {
  const { state, dispatch } = useStore();
  const start = useStartPractice();
  const [previewSeed, setPreviewSeed] = useState(() => newSeed());
  const [more, setMore] = useState(false);
  // Opened from a Learn section or a chapter's Practice button: Back returns there, and the run Start begins keeps it.
  const { back, carry } = useLearnReturn();
  useDocTitle(t('app.docTitle', { page: t('setup.title') }));

  const s: Settings = practiceSettings(state, state.settings);
  const hold = s.hold;
  // Listen (§3.2): nothing is tapped, ties and triplets are not in it yet, and it plays at most 8 bars. The player's own
  // choices stay in the setup, so Tap and Echo get them back.
  const listen = s.mode === 'listen';
  const melody = writesMelody(s);
  // Write · Melody: the notes alone, every one a quarter, so the rhythm's choices (note values, rests, extras) do not
  // apply and are left out.
  const notesOnly = writesNotesOnly(s);
  // Mix 8ths & 16ths: only a choice when both are on (and the rhythm is written).
  const bothSmall = s.notes.includes('eighth') && s.notes.includes('sixteenth') && !notesOnly;
  const mix = s.mixSixteenths !== false;
  const degrees = s.melody ?? DEFAULT_MELODY;
  const bars = listen ? Math.min(LISTEN_MAX_BARS, s.bars) : s.bars;
  const maxBars = listen ? LISTEN_MAX_BARS : MAX_BARS;
  const names = state.prefs.noteNames;
  // Starts on: the note picked for the melody to start on, or undefined for Any.
  const startNote = melodyStart({ melody: degrees, startNote: s.startNote });
  const update = (patch: Partial<Settings>): void => {
    dispatch({ type: 'settings', settings: { ...s, ...patch } });
    setPreviewSeed(newSeed());
  };

  const feas = useMemo(() => {
    try {
      return checkSettings(s);
    } catch (e) {
      console.error('checkSettings failed', e);
      return { playable: [], blocked: {}, ok: false };
    }
  }, [JSON.stringify(s)]);
  const hints = setupHints(s, feas);
  const blockedKey = startBlockedKey(s, feas) ?? (melody && degrees.length < 2 ? 'setup.blockedMelody' : null);
  // A change that brings a hint (the last note value off, which turns Start off) has it read out through the app's one
  // live region (ui/lib/announce.ts): a role="status" put in already holding its text is not read by every screen
  // reader. The hints a setup opens with are read with the page. Each is a line of its own on screen, so a sentence
  // break between them ("… eighth note. 3/4 needs …").
  const hintText = hints.map((h) => h.text).join('. ');
  const hintsBefore = useRef(hintText);
  useEffect(() => {
    if (hintsBefore.current === hintText) return;
    hintsBefore.current = hintText;
    announce(hintText);
  }, [hintText]);

  const preview = useMemo(() => {
    if (!feas.ok) return null;
    const run = makeRun(s, previewSeed, null);
    const view = run ? exerciseView(run.exercise) : null;
    return run && view ? { run, bars: view.bars.slice(0, 1) } : null;
  }, [feas, previewSeed]);
  const level = preview ? difficultyLevel(preview.run.exercise.difficulty) : 0;

  return (
    <ExerciseFrame className="frame--setup" wide>
      <div className="page setup no-scrollbar">
        <div className="screen-head">
          <Link to={back?.to ?? '/'} query={back?.query} aria-label={back?.label ?? t('common.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('setup.title')}</h1>
          </div>
          <button type="button" className="text-btn" onClick={() => update({ ...DEFAULT_SETTINGS, mode: s.mode, hold, mixSixteenths: undefined, ...(listen ? { bars: 2, write: s.write } : {}) })}>
            {t('setup.reset')}
          </button>
        </div>

        <div className="wide">
          <div className="wide-main">
            <div className="mode-field">
              <Segmented<Mode> label={t('setup.mode')} value={s.mode} onChange={(v) => update({ mode: v })}
                options={[
                  { value: 'tap', label: t('setup.modeTap') },
                  { value: 'listen', label: t('setup.modeListen') },
                  { value: 'echo', label: t('setup.modeEcho') },
                ]} />
              <span className="muted-text" aria-live="polite">
                {t(MODE_HINT[s.mode])}
              </span>
            </div>

            {listen ? (
              <>
                <div className="mode-field">
                  <Segmented<WriteKind> label={t('setup.write')} value={s.write ?? 'rhythm'} onChange={(v) => update({ write: v, ...(v !== 'rhythm' && !s.melody ? { melody: [...DEFAULT_MELODY] } : {}) })}
                    options={[
                      { value: 'rhythm', label: t('setup.writeRhythm') },
                      { value: 'notes', label: t('setup.writeNotes') },
                      { value: 'melody', label: t('setup.writeBoth') },
                    ]} />
                  <span className="muted-text" aria-live="polite">
                    {t(WRITE_HINT[s.write ?? 'rhythm'])}
                  </span>
                </div>
                {melody && (
                  <div className="field">
                    <div className="label" id="melody-notes-label">
                      {t('setup.melodyNotes')}
                    </div>
                    <div className="chip-row melody-chips" role="group" aria-labelledby="melody-notes-label">
                      {MELODY_DEGREES.map((d) => (
                        <Chip key={d} on={degrees.includes(d)} className="chip--note" label={degreeName(d, names)}
                          // A note taken out of the melody can no longer be the one it starts on: back to Any.
                          onToggle={() => update({ melody: toggle(degrees, d, MELODY_DEGREES), ...(s.startNote === d && degrees.includes(d) ? { startNote: undefined } : {}) })}>
                          <span className="chip-note-main">{degreeName(d, names)}</span>
                          <span className="chip-note-sub" aria-hidden="true">{degreeSub(d, names)}</span>
                        </Chip>
                      ))}
                    </div>
                    <span className="muted-text">
                      {startNote === undefined ? t('setup.melodyHint') : t('setup.melodyHintStart', { note: degreeName(startNote, names) })}
                    </span>
                  </div>
                )}
                {melody && (
                  <div className="field">
                    <div className="label" id="melody-start-label">
                      {t('setup.startsOn')}
                    </div>
                    {/* One choice: Any, or one of the notes picked. The melody starts on it, and it sounds before every play. */}
                    <div className="chip-row melody-chips melody-start" role="radiogroup" aria-labelledby="melody-start-label">
                      <button type="button" role="radio" aria-checked={startNote === undefined} className={'chip chip--note' + (startNote === undefined ? ' is-on' : '')}
                        onClick={() => update({ startNote: undefined })}>
                        <span className="chip-note-main">{t('setup.startsOnAny')}</span>
                      </button>
                      {degrees.filter((d) => MELODY_DEGREES.includes(d as (typeof MELODY_DEGREES)[number])).map((d) => (
                        <button key={d} type="button" role="radio" aria-checked={startNote === d} aria-label={degreeName(d, names)}
                          className={'chip chip--note' + (startNote === d ? ' is-on' : '')} onClick={() => update({ startNote: d })}>
                          <span className="chip-note-main">{degreeName(d, names)}</span>
                          <span className="chip-note-sub" aria-hidden="true">
                            {degreeSub(d, names)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button type="button" role="switch" aria-checked={hold} className="switch-row"
                onClick={() => dispatch({ type: 'prefs', patch: practiceHoldPatch(state, !hold) })}>
                <span className="switch-row-text">
                  <b>{t('setup.holdTitle')}</b>
                  <span className="muted-text">{t(hold ? 'setup.holdOn' : 'setup.holdOff')}</span>
                </span>
                <SwitchTrack on={hold} />
              </button>
            )}

            <div className="field">
              <div className="label">{t('setup.meters')}</div>
              <div className="chip-row">
                {METER_IDS.map((m: MeterId) => {
                  const on = s.meters.includes(m);
                  const blocked = s.notes.length === 0 || !!feas.blocked[m];
                  return (
                    <Chip key={m} on={on} blocked={blocked} className="chip--meter" onToggle={() => update({ meters: toggle(s.meters, m, METER_IDS) })}
                      describedBy={on && blocked ? (s.notes.length === 0 ? NO_NOTES_HINT_ID : meterHintId(m)) : undefined}>
                      {m}
                    </Chip>
                  );
                })}
              </div>
              {hints.length > 0 && (
                <div className="hint-box m-in">
                  {hints.map((h) => (
                    <span key={h.id} id={h.id}>
                      {h.text}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!notesOnly && (
            <>
            <div className="field">
              <div className="label">{t('setup.notes')}</div>
              <div className="glyph-grid">
                {NOTE_VALUES.map((v) => (
                  <Chip key={v} on={s.notes.includes(v)} className="chip--glyph" label={t('noteButton.' + v)} onToggle={() => update({ notes: toggle(s.notes, v, NOTE_VALUES) })}>
                    {NOTE_GLYPH[v]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="label">{t('setup.rests')}</div>
              <div className="glyph-grid">
                {NOTE_VALUES.map((v) => (
                  <Chip key={v} on={s.rests.includes(v)} className="chip--glyph" label={t('restButton.' + v)} onToggle={() => update({ rests: toggle(s.rests, v, NOTE_VALUES) })}>
                    {REST_GLYPH[v]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="label">{t('setup.extras')}</div>
              <div className="chip-row">
                <Chip on={s.dotted} className="chip--text" onToggle={() => update({ dotted: !s.dotted })}>
                  {t('setup.dotted')}
                </Chip>
                <Chip on={s.ties && !listen} blocked={listen} describedBy={listen ? LISTEN_EXTRAS_HINT_ID : undefined} className="chip--text"
                  onToggle={() => !listen && update({ ties: !s.ties })}>
                  {t('setup.ties')}
                </Chip>
                <Chip on={s.triplets && !listen} blocked={listen} describedBy={listen ? LISTEN_EXTRAS_HINT_ID : undefined} className="chip--text"
                  onToggle={() => !listen && update({ triplets: !s.triplets })}>
                  {t('setup.triplets')}
                </Chip>
                {bothSmall && (
                  <Chip on={mix} className="chip--text" onToggle={() => update({ mixSixteenths: !mix })}>
                    {t('setup.mixSixteenths')}
                  </Chip>
                )}
              </div>
              {listen && (
                <span id={LISTEN_EXTRAS_HINT_ID} className="muted-text">
                  {t('setup.listenExtras')}
                </span>
              )}
              {bothSmall && !mix && <span className="muted-text">{t('setup.mixSixteenthsOff')}</span>}
            </div>
            </>
            )}

            <div className="bars-tempo">
              <div className="field">
                <div className="label" id="bars-label">
                  {t('setup.bars')}
                </div>
                {/* A step at its end has nothing to do: aria-disabled, as disabled drops the focus to the page. */}
                <div className="stepper" role="group" aria-labelledby="bars-label">
                  <button type="button" aria-label={t('setup.fewerBars')} aria-disabled={bars <= 1 || undefined}
                    onClick={() => {
                      if (bars > 1) update({ bars: Math.max(1, bars - 1) });
                    }}>
                    −
                  </button>
                  <span aria-live="polite">{bars}</span>
                  <button type="button" aria-label={t('setup.moreBars')} aria-disabled={bars >= maxBars || undefined}
                    onClick={() => {
                      if (bars < maxBars) update({ bars: Math.min(maxBars, bars + 1) });
                    }}>
                    +
                  </button>
                </div>
              </div>
              <div className="field field--grow">
                <label htmlFor="tempo" className="label label--split">
                  {t('setup.tempo')}
                  <span className="label-value">{t('setup.tempoValue', { bpm: s.tempo, word: t(tempoWordKey(s.tempo)) })}</span>
                </label>
                <input id="tempo" type="range" min={40} max={MAX_TEMPO} value={s.tempo} className="tempo-range"
                  aria-valuetext={t('setup.tempoValue', { bpm: s.tempo, word: t(tempoWordKey(s.tempo)) })}
                  onChange={(e) => update({ tempo: Number(e.target.value) })} />
              </div>
            </div>

            <div className="more">
              <button type="button" className="more-toggle" aria-expanded={more} aria-controls="setup-more" onClick={() => setMore(!more)}>
                {t('setup.more')}
                <Icon name="chevronSmall" size={18} className={'more-chevron' + (more ? ' is-open' : '')} />
              </button>
              <div id="setup-more" className={'m-acc' + (more ? ' is-open' : '')}>
                <div>
                  <div className="more-grid">
                    <MoreRow label={t('setup.metronome')}>
                      <Segmented label={t('setup.metronome')} value={s.metronome} onChange={(v) => update({ metronome: v })}
                        options={[
                          { value: 'on', label: t('setup.metronomeOn') },
                          { value: 'accent', label: t('setup.metronomeAccent') },
                          { value: 'off', label: t('setup.metronomeOff') },
                        ]} />
                    </MoreRow>
                    <MoreRow label={t('setup.countIn')}>
                      <Segmented label={t('setup.countIn')} value={s.countIn} onChange={(v) => update({ countIn: v })}
                        options={([0, 1, 2] as const).map((n) => ({ value: n, label: t('setup.countInValue', { count: n }) }))} />
                    </MoreRow>
                    <MoreRow label={t('setup.density')}>
                      <Segmented<Density> label={t('setup.density')} value={s.density} onChange={(v) => update({ density: v })}
                        options={[
                          { value: 'sparse', label: t('setup.densitySparse') },
                          { value: 'balanced', label: t('setup.densityBalanced') },
                          { value: 'busy', label: t('setup.densityBusy') },
                        ]} />
                    </MoreRow>
                    <MoreRow label={t('setup.restAmount')}>
                      <Segmented<RestAmount> label={t('setup.restAmount')} value={s.restAmount} onChange={(v) => update({ restAmount: v })}
                        options={[
                          { value: 'few', label: t('setup.restFew') },
                          { value: 'some', label: t('setup.restSome') },
                          { value: 'many', label: t('setup.restMany') },
                        ]} />
                    </MoreRow>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="wide-side">
            <div className={'preview-card' + (preview ? '' : ' is-empty')}>
              <div className="preview-head">
                <span>{t('setup.preview')}</span>
                <span className="difficulty" role="img" aria-label={t('setup.difficultyLabel', { level })}>
                  <span aria-hidden="true">{t('setup.difficulty')}</span>
                  <span className="difficulty-bars" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={i <= level ? 'is-on' : ''} />
                    ))}
                  </span>
                </span>
              </div>
              {preview ? (
                // With Triplets on, room for a 3 whether or not this bar has one: the card keeps one height.
                <StaffBox bars={preview.bars} meter={preview.run.exercise.meter} barsPerRow={1} label={describeBars(preview.bars, preview.run.exercise.meter.id)}
                  tupletSpace={s.triplets && !listen} clef={melody ? 'treble' : undefined} />
              ) : (
                <p className="preview-none">{t('setup.previewNone')}</p>
              )}
            </div>

            {blockedKey ? (
              <button type="button" className="btn btn--blocked start-btn" disabled>
                {t(blockedKey)}
              </button>
            ) : (
              <button type="button" className="btn btn--accent start-btn" onClick={() => start(s, { query: carry, shows: state.setupShows })}>
                {t('setup.start', { bars: t('common.bars', { count: bars }) })}
              </button>
            )}
          </div>
        </div>
      </div>
    </ExerciseFrame>
  );
}

function MoreRow({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="more-row">
      <span className="more-label">{label}</span>
      {children}
    </div>
  );
}
