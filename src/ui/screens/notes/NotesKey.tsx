/**
 * Key (DESIGN.md §3.5 Keys): the 15 key signatures as small treble staves, C on top and then sharps beside flats by
 * count, each with its major key and relative minor. One key, or Mix keys (several; a new key every 5 notes).
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
import { Link, navigate } from '../../router';
import { useStore } from '../../store';

export function NotesKey(): JSX.Element {
  const { state, dispatch } = useStore();
  useDocTitle(t('app.docTitle', { page: t('notes.keys.title') }));
  const s = state.noteSettings;
  // A draft until Use: Back leaves the setup as it was.
  const [mix, setMix] = useState(s.mixKeys && s.keys.length > 1);
  const [chosen, setChosen] = useState<KeyId[]>(() => roundKeys(s));

  const toggle = (id: KeyId): void => {
    if (!mix) return setChosen([id]);
    if (chosen.includes(id)) {
      if (chosen.length > 1) setChosen(chosen.filter((x) => x !== id));
    } else {
      setChosen([...chosen, id]);
    }
  };
  const use = (): void => {
    dispatch({ type: 'noteSettings', settings: { ...s, keys: chosen, mixKeys: mix } });
    navigate('/notes', { replace: true });
  };

  const first = chosen[0];
  const signs = keySigns(first);
  const summaryTitle = mix ? t('notes.keys.summaryMix', { count: chosen.length }) : t('notes.keys.summaryOne', { major: majorName(first), minor: minorName(first) });
  const summary = mix
    ? t('notes.keys.mixText')
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
          <Link to="/notes" aria-label={t('notes.keys.back')} className="icon-btn icon-btn--edge">
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
