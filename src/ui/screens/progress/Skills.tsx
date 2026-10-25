/** Progress → Skill levels: placeholder until the screen is built. */
import { t } from '../../../i18n';
import { useBreakpoint, useDocTitle } from '../../hooks';
import { AppShell } from '../../components/AppShell';

export function Skills(): JSX.Element {
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('skills.title') }));
  return (
    <AppShell bp={bp} active="/progress">
      <div className="page">
        <h1 className="page-title">{t('skills.title')}</h1>
      </div>
    </AppShell>
  );
}
