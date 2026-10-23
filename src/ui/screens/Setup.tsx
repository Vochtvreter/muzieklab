/** Practice setup (DESIGN.md §4): every setting on one screen, live preview, difficulty meter and validation (§4.1). */
import { useMemo, useState } from 'react';
import { checkSettings, DEFAULT_SETTINGS, METER_IDS, NOTE_VALUES, type Density, type MeterId, type Mode, type NoteValue, type RestAmount, type Settings } from '../../core/api';
import { t } from '../../i18n';
import { Chip, Segmented, SwitchTrack } from '../components/Controls';
import { ExerciseFrame } from '../components/AppShell';
import { StaffBox } from '../components/Bits';
import { Icon } from '../components/Icon';
import { exerciseView } from '../exerciseView';
import { useDocTitle } from '../hooks';
import { difficultyLevel, newSeed, tempoWordKey } from '../lib/format';
import { describeBars } from '../lib/notation';
import { useLearnReturn } from '../lib/learnReturn';
import { NO_NOTES_HINT_ID, meterHintId, setupHints, startBlockedKey } from '../lib/setupHints';
import { Link } from '../router';
import { makeRun, practiceHoldPatch, practiceSettings, useStore } from '../store';
import { useStartPractice } from './start';

const NOTE_GLYPH: Record<NoteValue, string> = { whole: '𝅝', half: '𝅗𝅥', quarter: '𝅘𝅥', eighth: '𝅘𝅥𝅮', sixteenth: '𝅘𝅥𝅯' };
const REST_GLYPH: Record<NoteValue, string> = { whole: '𝄻', half: '𝄼', quarter: '𝄽', eighth: '𝄾', sixteenth: '𝄿' };

const toggle = <T,>(list: T[], v: T, order: readonly T[]): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : order.filter((x) => x === v || list.includes(x));

export function Setup(): JSX.Element {
  const { state, dispatch } = useStore();
  const start = useStartPractice();
  const [previewSeed, setPreviewSeed] = useState(() => newSeed());
  const [more, setMore] = useState(false);
  // Opened from a Learn section: Back returns there.
  const { back } = useLearnReturn();
  useDocTitle(t('app.docTitle', { page: t('setup.title') }));

  const s: Settings = practiceSettings(state, state.settings);
  const hold = s.hold;
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
  const blockedKey = startBlockedKey(s, feas);

  const preview = useMemo(() => {
    if (!feas.ok) return null;
    const run = makeRun(s, previewSeed, null);
    const view = run ? exerciseView(run.exercise) : null;
    return run && view ? { run, bars: view.bars.slice(0, 1) } : null;
  }, [feas, previewSeed]);
  const level = preview ? difficultyLevel(preview.run.exercise.difficulty) : 0;

  return (
    <ExerciseFrame className="frame--setup">
      <div className="page setup no-scrollbar">
        <div className="screen-head">
          <Link to={back?.to ?? '/'} query={back?.query} aria-label={back ? t('learn.backToChapter', { n: back.chapter }) : t('common.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('setup.title')}</h1>
          </div>
          <button type="button" className="text-btn" onClick={() => update({ ...DEFAULT_SETTINGS, mode: s.mode, hold })}>
            {t('setup.reset')}
          </button>
        </div>

        <div className="mode-field">
          <Segmented<Mode> label={t('setup.mode')} value={s.mode} onChange={(v) => update({ mode: v })}
            options={[
              { value: 'tap', label: t('setup.modeTap') },
              { value: 'echo', label: t('setup.modeEcho') },
            ]} />
          <span className="muted-text" aria-live="polite">
            {t(s.mode === 'echo' ? 'setup.hintEcho' : 'setup.hintTap')}
          </span>
        </div>

        <button type="button" role="switch" aria-checked={hold} className="switch-row"
          onClick={() => dispatch({ type: 'prefs', patch: practiceHoldPatch(state, !hold) })}>
          <span className="switch-row-text">
            <b>{t('setup.holdTitle')}</b>
            <span className="muted-text">{t(hold ? 'setup.holdOn' : 'setup.holdOff')}</span>
          </span>
          <SwitchTrack on={hold} />
        </button>

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
            <div className="hint-box m-in" role="status">
              {hints.map((h) => (
                <span key={h.id} id={h.id}>
                  {h.text}
                </span>
              ))}
            </div>
          )}
        </div>

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
            <Chip on={s.ties} className="chip--text" onToggle={() => update({ ties: !s.ties })}>
              {t('setup.ties')}
            </Chip>
            <Chip on={s.triplets} className="chip--text" onToggle={() => update({ triplets: !s.triplets })}>
              {t('setup.triplets')}
            </Chip>
          </div>
        </div>

        <div className="bars-tempo">
          <div className="field">
            <div className="label" id="bars-label">
              {t('setup.bars')}
            </div>
            <div className="stepper" role="group" aria-labelledby="bars-label">
              <button type="button" aria-label={t('setup.fewerBars')} disabled={s.bars <= 1} onClick={() => update({ bars: Math.max(1, s.bars - 1) })}>
                −
              </button>
              <span aria-live="polite">{s.bars}</span>
              <button type="button" aria-label={t('setup.moreBars')} disabled={s.bars >= 16} onClick={() => update({ bars: Math.min(16, s.bars + 1) })}>
                +
              </button>
            </div>
          </div>
          <div className="field field--grow">
            <label htmlFor="tempo" className="label label--split">
              {t('setup.tempo')}
              <span className="label-value">{t('setup.tempoValue', { bpm: s.tempo, word: t(tempoWordKey(s.tempo)) })}</span>
            </label>
            <input id="tempo" type="range" min={40} max={200} value={s.tempo} className="tempo-range"
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
            <StaffBox bars={preview.bars} meter={preview.run.exercise.meter} barsPerRow={1} label={describeBars(preview.bars, preview.run.exercise.meter.id)} />
          ) : (
            <p className="preview-none">{t('setup.previewNone')}</p>
          )}
        </div>

        {blockedKey ? (
          <button type="button" className="btn btn--blocked start-btn" disabled>
            {t(blockedKey)}
          </button>
        ) : (
          <button type="button" className="btn btn--accent start-btn" onClick={() => start(s)}>
            {t('setup.start', { bars: t('common.bars', { count: s.bars }) })}
          </button>
        )}
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
