/** The Progress tab (v1.5): placeholder until the screen is built. */
import { t } from '../../../i18n';
import { useBreakpoint, useDocTitle } from '../../hooks';
import { AppShell } from '../../components/AppShell';

export function ProgressScreen(): JSX.Element {
  const bp = useBreakpoint();
  useDocTitle(t('app.docTitle', { page: t('nav.progress') }));
  return (
    <AppShell bp={bp} active="/progress">
      <div className="page">
        <h1 className="page-title">{t('nav.progress')}</h1>
      </div>
    </AppShell>
  );
}
