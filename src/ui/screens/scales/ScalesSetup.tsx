/**
 * Scale practice setup (DESIGN.md §3.7 Settings): keys (the key picked on the circle, all 15 round the circle, or keys
 * chosen on the Key screen), scale types with their step patterns, answer with, direction, write with, show the steps
 * and play each note, then a one-line summary and Start.
 */
import { DEFAULT_SCALE_SETTINGS, SCALE_TYPES, scaleRoundKeys, type Direction, type ScaleInput, type ScaleKeys, type ScaleSettings, type ScaleWrite } from '../../../core/api';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Segmented, SwitchTrack } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { useDocTitle } from '../../hooks';
import { useLearnReturn } from '../../lib/learnReturn';
import { keyName, stepsText } from '../../lib/scaleText';
import { Link, navigate } from '../../router';
import { useStore } from '../../store';
import { useStartScales } from './start';

export function ScalesSetup(): JSX.Element {
  const { state, dispatch } = useStore();
  const start = useStartScales();
  useDocTitle(t('app.docTitle', { page: t('scales.setup.title') }));
  const s = state.scaleSettings;
  const hubKey = state.scaleHub.key;
  const update = (patch: Partial<ScaleSettings>): void => dispatch({ type: 'scaleSettings', settings: { ...s, ...patch } });
  // Opened from Learn chapter 11: Back returns there, also after a visit to the Key screen.
  const { back, carry } = useLearnReturn();

  const keys = scaleRoundKeys(s);
  const count = keys.length * s.types.length;
  const pickKeys = (v: ScaleKeys): void => {
    if (v === 'pick') navigate('/scales/key', { query: carry });
    else update({ keyMode: v, keys: v === 'one' ? [hubKey] : s.keys });
  };
  const keyHint =
    s.keyMode === 'one'
      ? t('scales.setup.hintOne', { major: keyName(keys[0], false), minor: keyName(keys[0], true) })
      : s.keyMode === 'circle'
        ? t('scales.setup.hintCircle')
        : t('scales.setup.hintPicked', { list: keys.map((k) => keyName(k, false)).join(', ') });
  // One key: name the scales the round plays (the key's major, its relative minor, or both).
  const hasMajor = s.types.includes('major');
  const hasMinor = s.types.some((x) => x !== 'major');
  const oneWord = hasMajor && hasMinor ? t('scales.setup.oneWord', { major: keyName(keys[0], false), minor: keyName(keys[0], true) }) : keyName(keys[0], !hasMajor);
  const keysWord = s.keyMode === 'one' ? oneWord : s.keyMode === 'circle' ? t('scales.setup.circleWord') : t('scales.setup.keysWord', { count: keys.length });

  const switchRow = (on: boolean, label: string, sub: string, toggle: () => void): JSX.Element => (
    <button type="button" role="switch" aria-checked={on} className="ssw-row" onClick={toggle}>
      <span className="ssw-text">
        <b>{label}</b>
        <span>{sub}</span>
      </span>
      <SwitchTrack on={on} />
    </button>
  );

  return (
    <ExerciseFrame className="frame--setup" wide>
      <div className="page setup ssetup no-scrollbar">
        <div className="screen-head">
          <Link to={back?.to ?? '/scales'} query={back?.query} aria-label={back ? t('learn.backToChapter', { n: back.chapter }) : t('scales.setup.back')}
            className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <div className="screen-head-text">
            <h1 className="screen-title">{t('scales.setup.title')}</h1>
          </div>
          <button type="button" className="text-btn" onClick={() => update({ ...DEFAULT_SCALE_SETTINGS, keys: [hubKey] })}>
            {t('scales.setup.reset')}
          </button>
        </div>

        <div className="wide">
          <div className="wide-main">
            <div className="field">
              <div className="label">{t('scales.setup.keys')}</div>
              <Segmented<ScaleKeys> label={t('scales.setup.keys')} value={s.keyMode} onChange={pickKeys}
                options={[
                  { value: 'one', label: keyName(s.keyMode === 'one' ? keys[0] : hubKey, false) },
                  { value: 'circle', label: t('scales.setup.circle') },
                  { value: 'pick', label: s.keyMode === 'pick' ? t('scales.setup.keysWord', { count: keys.length }) : t('scales.setup.choose') },
                ]} />
              <span className="muted-text input-hint" aria-live="polite">
                {keyHint}{' '}
                {s.keyMode === 'pick' && (
                  <Link to="/scales/key" query={carry} className="text-link">
                    {t('scales.setup.change')}
                  </Link>
                )}
              </span>
            </div>

            <div className="field">
              <div className="label" id="types-label">
                {t('scales.setup.types')}
              </div>
              <div className="stype-grid" role="group" aria-labelledby="types-label">
                {SCALE_TYPES.map((type) => {
                  const on = s.types.includes(type);
                  return (
                    <button key={type} type="button" aria-pressed={on} className={'stype' + (on ? ' is-on' : '')}
                      onClick={() => {
                        const next = SCALE_TYPES.filter((x) => (x === type ? !on : s.types.includes(x)));
                        if (next.length) update({ types: next });
                      }}>
                      <b>{t('scales.type.' + type)}</b>
                      <span className="stype-steps">{stepsText(type)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <div className="label">{t('scales.setup.answerWith')}</div>
              <Segmented<ScaleInput> label={t('scales.setup.answerWith')} value={s.input} onChange={(v) => update({ input: v })}
                options={[
                  { value: 'piano', label: t('scales.setup.inputPiano') },
                  { value: 'names', label: t('scales.setup.inputNames') },
                  { value: 'mixed', label: t('scales.setup.inputMixed') },
                ]} />
              <span className="muted-text input-hint" aria-live="polite">
                {t(s.input === 'piano' ? 'scales.setup.hintPiano' : s.input === 'names' ? 'scales.setup.hintNames' : 'scales.setup.hintMixed')}
              </span>
            </div>

            <div className="ssetup-pair">
              <div className="field">
                <div className="label">{t('scales.setup.direction')}</div>
                <Segmented<Direction> label={t('scales.setup.direction')} value={s.direction} onChange={(v) => update({ direction: v })} pad={3}
                  options={[
                    { value: 'up', label: t('scales.setup.up') },
                    { value: 'upDown', label: t('scales.setup.upDown') },
                  ]} />
              </div>
              <div className="field">
                <div className="label">{t('scales.setup.write')}</div>
                <Segmented<ScaleWrite> label={t('scales.setup.write')} value={s.write} onChange={(v) => update({ write: v })} pad={3}
                  options={[
                    { value: 'signs', label: t('scales.setup.writeSigns') },
                    { value: 'keySig', label: t('scales.setup.writeKeySig') },
                  ]} />
              </div>
            </div>

            <div className="card ssw">
              {switchRow(s.showSteps, t('scales.setup.steps'), t(s.showSteps ? 'scales.setup.stepsOn' : 'scales.setup.stepsOff'), () => update({ showSteps: !s.showSteps }))}
              {switchRow(s.playNotes, t('scales.setup.sound'), t(s.playNotes ? 'scales.setup.soundOn' : 'scales.setup.soundOff'), () => update({ playNotes: !s.playNotes }))}
            </div>
          </div>

          <div className="wide-side">
            <div className="card ssetup-summary">
              <b>
                {t('scales.setup.summary', {
                  types: s.types.map((x) => t('scales.type.' + x)).join(', '),
                  keys: keysWord,
                  direction: t(s.direction === 'up' ? 'scales.setup.upWord' : 'scales.setup.upDownWord'),
                })}
              </b>
              {/* Going round the circle keeps the circle's order (generateScaleRound); other rounds are shuffled. */}
              <span className="muted-text">{t(count === 1 ? 'scales.setup.summaryOne' : s.keyMode === 'circle' ? 'scales.setup.summaryCircle' : 'scales.setup.summaryMany')}</span>
            </div>

            <button type="button" className="btn btn--accent start-btn" onClick={() => start(s)}>
              {t('scales.setup.start', { count })}
            </button>
          </div>
        </div>
      </div>
    </ExerciseFrame>
  );
}
