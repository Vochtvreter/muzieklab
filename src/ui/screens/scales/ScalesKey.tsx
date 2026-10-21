/** Scales · Choose…: the Read notes Key screen (§3.7). One key sets the circle's key; Mix keys practises each chosen key. */
import { scaleRoundKeys } from '../../../core/api';
import { t } from '../../../i18n';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { KeyScreen } from '../notes/NotesKey';

export function ScalesKey(): JSX.Element {
  const { state, dispatch } = useStore();
  const s = state.scaleSettings;
  const keys = s.keyMode === 'circle' ? [state.scaleHub.key] : scaleRoundKeys(s);
  return (
    <KeyScreen keys={keys} mix={s.keyMode !== 'one' || keys.length > 1} back="/scales/setup" mixText={t('scales.setup.mixText')}
      onUse={(chosen, mix) => {
        if (mix && chosen.length > 1) {
          dispatch({ type: 'scaleSettings', settings: { ...s, keyMode: 'pick', keys: chosen } });
        } else {
          dispatch({ type: 'scaleSettings', settings: { ...s, keyMode: 'one', keys: chosen.slice(0, 1) } });
          dispatch({ type: 'scaleHub', hub: { ...state.scaleHub, key: chosen[0] } });
        }
        navigate('/scales/setup', { replace: true });
      }} />
  );
}
