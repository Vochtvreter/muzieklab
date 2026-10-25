/** Progress → Skill levels → one skill: placeholder until the screen is built. */
import type { SkillId } from '../../../game/storage';
import { t } from '../../../i18n';
import { useBreakpoint, useDocTitle } from '../../hooks';
import { AppShell } from '../../components/AppShell';

export function SkillDetail({ skill }: { skill: SkillId }): JSX.Element {
  const bp = useBreakpoint();
  const name = t(`skills.name.${skill}`);
  useDocTitle(t('app.docTitle', { page: name }));
  return (
    <AppShell bp={bp} active="/progress">
      <div className="page">
        <h1 className="page-title">{name}</h1>
      </div>
    </AppShell>
  );
}
