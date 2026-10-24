/**
 * Settings → About → Privacy (#/privacy, also linked from Sign in; BACKEND-PLAN.md §8): the privacy statement in plain
 * words, in English and Dutch. No board yet; Settings' sections and cards.
 *
 * LEGAL REVIEW: this text (privacy.* in src/i18n/en.json and nl.json) is a draft written from BACKEND-PLAN.md §8 and
 * still needs a legal check (GDPR / AVG) before the first invite goes out. Change PRIVACY_UPDATED with the text.
 */
import { formatLongDate, t } from '../../../i18n';
import { Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { hashQuery, useHash } from '../../router';

/** The day the statement last changed (yyyy-mm-dd). */
export const PRIVACY_UPDATED = '2026-10-23';

export function Privacy(): JSX.Element {
  const fromSignIn = hashQuery(useHash()).get('from') === 'signin';
  return (
    <SubPage title={t('privacy.title')} back={fromSignIn ? '/signin' : '/settings'} backLabel={t(fromSignIn ? 'privacy.backSignIn' : 'privacy.back')}
      className="privacy">
      <p className="acct-lead">{t('privacy.intro')}</p>
      <Section id="p-device" title={t('privacy.deviceTitle')}>
        <div className="prose">
          <p>{t('privacy.device')}</p>
        </div>
      </Section>
      <Section id="p-account" title={t('privacy.accountTitle')}>
        <div className="prose">
          <p>{t('privacy.accountIntro')}</p>
          <ul>
            <li>{t('privacy.accountEmail')}</li>
            <li>{t('privacy.accountPassword')}</li>
            <li>{t('privacy.accountDevices')}</li>
            <li>{t('privacy.accountRoles')}</li>
            <li>{t('privacy.accountLog')}</li>
          </ul>
        </div>
      </Section>
      <Section id="p-why" title={t('privacy.whyTitle')}>
        <div className="prose">
          <p>{t('privacy.why')}</p>
        </div>
      </Section>
      <Section id="p-where" title={t('privacy.whereTitle')}>
        <div className="prose">
          <p>{t('privacy.where')}</p>
          <p>{t('privacy.cookie')}</p>
        </div>
      </Section>
      <Section id="p-keep" title={t('privacy.keepTitle')}>
        <div className="prose">
          <ul>
            <li>{t('privacy.keepAccount')}</li>
            <li>{t('privacy.keepDevices')}</li>
            <li>{t('privacy.keepLog')}</li>
            <li>{t('privacy.keepBackups')}</li>
          </ul>
        </div>
      </Section>
      <Section id="p-rights" title={t('privacy.rightsTitle')}>
        <div className="prose">
          <p>{t('privacy.rights')}</p>
        </div>
      </Section>
      <Section id="p-age" title={t('privacy.ageTitle')}>
        <div className="prose">
          <p>{t('privacy.age')}</p>
        </div>
      </Section>
      <p className="privacy-updated">{t('privacy.updated', { date: formatLongDate(PRIVACY_UPDATED) })}</p>
    </SubPage>
  );
}
