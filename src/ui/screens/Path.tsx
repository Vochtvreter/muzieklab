/** Learning path: units with their lessons' stars, the current unit highlighted, later units locked. */
import { isUnlocked, lessonSettings, pathStars, UNITS } from '../../game/path';
import { t, tx } from '../../i18n';
import { AppShell } from '../components/AppShell';
import { StarsMark } from '../components/Bits';
import { Icon } from '../components/Icon';
import { useBreakpoint, useDocTitle } from '../hooks';
import { starsLabel, starsText } from '../lib/format';
import { continueLesson, lessonNumber, lessonStars, unitStates } from '../lib/lessons';
import { useStore } from '../store';
import { useStartLesson } from './start';

export function PathScreen(): JSX.Element {
  const { state } = useStore();
  const bp = useBreakpoint();
  const startLesson = useStartLesson();
  useDocTitle(t('app.docTitle', { page: t('path.title') }));
  const p = state.progress;
  const states = unitStates(p);
  const totals = pathStars(p);
  const cont = continueLesson(p);

  return (
    <AppShell bp={bp} active="/path">
      <div className="page path">
        <div className="path-head">
          <h1 className="page-title">{t('path.title')}</h1>
          <span className="mono-muted" aria-label={t('path.totalsLabel', { stars: totals.earned, total: totals.max })}>
            {t('path.totals', { stars: totals.earned, total: totals.max })}
          </span>
        </div>

        <ol className="units m-scroll">
          {UNITS.map((u, i) => {
            const st = states[i];
            const curLesson = st === 'current' && cont && !cont.done ? cont.lesson : null;
            const isText = /[0-9]/.test(u.glyph);
            return (
              <li key={u.id} className={'unit unit--' + st}>
                <div className="unit-rail">
                  <div aria-hidden="true" className={'unit-node unit-node--' + st + (isText ? ' unit-node--text' : '')}>
                    {u.glyph}
                  </div>
                  <div className={'unit-spine' + (i === UNITS.length - 1 ? ' is-last' : st === 'done' ? ' is-done' : '')} />
                </div>
                <div className="unit-body">
                  <div className="unit-title">{t('path.unitTitle', { id: u.id, title: tx(u.titleKey) })}</div>
                  {st !== 'locked' && (
                    <div className="unit-stars">
                      {u.lessons.map((l) => {
                        const n = lessonStars(p, l.id);
                        const label = t('path.playLesson', { id: l.id, stars: starsLabel(n) });
                        // Unlocked lessons can be played again, e.g. to turn two stars into three.
                        return isUnlocked(p, l.id) ? (
                          <button key={l.id} type="button" className={'lesson-stars' + (n ? ' has-stars' : '')} title={label}
                            aria-label={label} onClick={() => startLesson(l.id)}>
                            <StarsMark stars={n} />
                          </button>
                        ) : (
                          <span key={l.id} role="img" className="lesson-stars is-locked" aria-label={t('path.lockedLesson', { id: l.id })}>
                            {starsText(n)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {curLesson && (
                    <div className="unit-sub">
                      {t('path.next', { lesson: lessonNumber(curLesson.id), title: tx(curLesson.title), bpm: lessonSettings(curLesson.id).tempo })}
                    </div>
                  )}
                  {st === 'locked' && (
                    <div className="unit-sub">
                      <Icon name="lock" size={13} strokeWidth={2.4} />
                      <span>{t('path.unlocks', { unit: UNITS[i - 1]?.id ?? u.id })}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {cont && (
          <button type="button" className="btn btn--accent path-start" onClick={() => startLesson(cont.lesson.id)}>
            {t('path.start', { id: cont.lesson.id })}
          </button>
        )}
      </div>
    </AppShell>
  );
}
