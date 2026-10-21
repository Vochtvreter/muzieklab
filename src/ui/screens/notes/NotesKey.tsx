/**
 * Key (DESIGN.md §3.5 Keys): the 15 key signatures as small treble staves, C on top and then sharps beside flats by
 * count, each with its major key and relative minor. One key, or Mix keys (several; a new key every 5 notes). Scales
 * uses the same screen for *Choose…* (§3.7), through KeyScreen.
 */
import { useState } from 'react';
import { KEY_ORDER, keySigns, roundKeys, type KeyId } from '../../../core/api';
import { PitchStaff } from '../../../render/PitchStaff';
import { t } from '../../../i18n';
import { ExerciseFrame } from '../../components/AppShell';
import { Segmented } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { useDocTitle } from '../../hooks';
import { keySignsAria, letterName, majorName, minorName } from '../../lib/noteText';
import { Link, navigate, type Route } from '../../router';
import { useStore } from '../../store';

export function NotesKey(): JSX.Element {
  const { state, dispatch } = useStore();
  const s = state.noteSettings;
  return (
    <KeyScreen keys={roundKeys(s)} mix={s.mixKeys && s.keys.length > 1} back="/notes" mixText={t('notes.keys.mixText')}
      onUse={(keys, mix) => {
        dispatch({ type: 'noteSettings', settings: { ...s, keys, mixKeys: mix } });
        navigate('/notes', { replace: true });
      }} />
  );
}

interface KeyScreenProps {
  /** The keys chosen so far; the first is the one key. */
  keys: KeyId[];
  mix: boolean;
  back: Route;
  /** What Mix keys does, for the summary line. */
  mixText: string;
  onUse(keys: KeyId[], mix: boolean): void;
}

export function KeyScreen({ keys, mix: mixed, back, mixText, onUse }: KeyScreenProps): JSX.Element {
  useDocTitle(t('app.docTitle', { page: t('notes.keys.title') }));
  // A draft until Use: Back leaves the setup as it was.
  const [mix, setMix] = useState(mixed);
  const [chosen, setChosen] = useState<KeyId[]>(() => (mixed ? keys : keys.slice(0, 1)));

  const toggle = (id: KeyId): void => {
    if (!mix) return setChosen([id]);
    if (chosen.includes(id)) {
      if (chosen.length > 1) setChosen(chosen.filter((x) => x !== id));
    } else {
      setChosen([...chosen, id]);
    }
  };
  const use = (): void => onUse(chosen, mix);

  const first = chosen[0];
  const signs = keySigns(first);
  const summaryTitle = mix ? t('notes.keys.summaryMix', { count: chosen.length }) : t('notes.keys.summaryOne', { major: majorName(first), minor: minorName(first) });
  const summary = mix
    ? mixText
    : signs.length === 0
      ? t('notes.keys.summaryNone')
      : t('notes.keys.summarySigns', {
          letters: signs.map((x) => t('notes.letter.' + x.letter)).join(', '),
          names: signs.map((x) => letterName(x.letter, x.alter)).join(', '),
        });

  const item = (id: KeyId, wide = false): JSX.Element => {
    const on = chosen.includes(id);
    return (
      <button key={id} type="button" aria-pressed={on} className={'key-btn' + (on ? (mix ? ' is-on' : ' is-picked') : '') + (wide ? ' key-btn--wide' : '')}
        aria-label={t('notes.keys.aria', { major: majorName(id), minor: minorName(id), signs: keySignsAria(id) })} onClick={() => toggle(id)}>
        <span className="key-thumb">
          <PitchStaff clef="treble" keyId={id} notes={[]} slots={0} room={1.5} />
        </span>
        <span className="key-btn-text">
          <b>{majorName(id)}</b>
          <span>{minorName(id)}</span>
        </span>
        {wide && <span className="key-btn-note">{t('notes.keyNone')}</span>}
      </button>
    );
  };

  return (
    <ExerciseFrame className="frame--setup">
      <div className="page setup nkeys no-scrollbar">
        <div className="screen-head">
          <Link to={back} aria-label={t('notes.keys.back')} className="icon-btn icon-btn--edge">
            <Icon name="back" />
          </Link>
          <h1 className="screen-title">{t('notes.keys.title')}</h1>
          <Link to="/learn/10" query="s=10.1" className="text-btn text-btn--link">
            {t('notes.keys.what')}
          </Link>
        </div>

        <Segmented<'one' | 'mix'> label={t('notes.keys.title')} value={mix ? 'mix' : 'one'}
          onChange={(v) => {
            setMix(v === 'mix');
            if (v === 'one') setChosen([chosen[0]]);
          }}
          options={[
            { value: 'one', label: t('notes.keys.one') },
            { value: 'mix', label: t('notes.keys.mix') },
          ]} />

        <div role="group" aria-label={t('notes.keys.group')} className="key-list">
          {item('C', true)}
          <div className="key-cols" aria-hidden="true">
            <span>{t('notes.keys.sharps')}</span>
            <span>{t('notes.keys.flats')}</span>
          </div>
          <div className="key-grid">{KEY_ORDER.slice(1).map((id) => item(id))}</div>
        </div>

        <div className="key-summary" aria-live="polite">
          <b>{summaryTitle}</b> {summary}
        </div>

        <button type="button" className="btn btn--accent start-btn" onClick={use}>
          {mix ? t('notes.keys.useMix', { count: chosen.length }) : t('notes.keys.use', { major: majorName(first) })}
        </button>
      </div>
    </ExerciseFrame>
  );
}
