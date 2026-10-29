/**
 * Admin: Invite someone (#/admin/invite; BACKEND-PLAN.md §5.1; no board yet): their email, name and roles, then Create
 * invite. The result is the link to send by hand (shown once, with Copy), when it stops working, and a ready-made
 * message in the admin's app language. Needs `accounts.invite`; roles also need `roles.grant`.
 */
import { useEffect, useRef, useState } from 'react';
import type { InviteCreated, Role } from '../../../../shared/api';
import { api } from '../../../api/client';
import { t } from '../../../i18n';
import { useAccount, type UseAccount } from '../../account';
import { FormError, onSubmit, SubmitButton, TextField } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { Section } from '../../components/Rows';
import { SubPage } from '../../components/SubPage';
import { useMounted } from '../../hooks';
import { failureOf, fieldError, formError, nameCharactersError, nameIsBlank, type Failure } from '../../lib/apiErrors';
import { Link } from '../../router';
import { GateMessage, LinkResult, RoleSwitches, useAdminGate } from './AdminParts';

/** Names are 1–80 characters on the server. */
const NAME_MAX = 80;
const EMAIL_MAX = 254;

export function AdminInvite(): JSX.Element {
  const account = useAccount();
  const gate = useAdminGate(account, 'accounts.invite');
  const [created, setCreated] = useState<InviteCreated | null>(null);
  // Invite someone else: a fresh form (a new key), its email field focused.
  const [round, setRound] = useState(0);
  return (
    <SubPage title={t('admin.inviteTitle')} back="/admin" backLabel={t('admin.backToList')}>
      {gate !== 'ok' ? (
        <GateMessage gate={gate} />
      ) : created ? (
        <InviteResult created={created} onAgain={() => {
          setCreated(null);
          setRound((n) => n + 1);
        }} />
      ) : (
        <InviteForm key={round} account={account} focus={round > 0} onCreated={setCreated} />
      )}
    </SubPage>
  );
}

function InviteForm({ account, focus, onCreated }: { account: UseAccount; focus: boolean; onCreated(c: InviteCreated): void }): JSX.Element {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [empty, setEmpty] = useState<{ email?: boolean; name?: boolean }>({});
  const [badName, setBadName] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();
  const canGrant = account.can('roles.grant');

  const submit = async (): Promise<void> => {
    const missing = { email: !email.trim(), name: nameIsBlank(name) };
    const bad = nameCharactersError(name);
    setEmpty(missing);
    setBadName(bad);
    setFail(null);
    if (missing.email || missing.name || bad) {
      (missing.email ? emailRef : nameRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<InviteCreated>('/admin/invites', { email: email.trim(), name: name.trim(), roles });
      if (mounted.current) onCreated(res);
    } catch (e) {
      if (!mounted.current) return;
      const f = failureOf(account.handleError(e));
      setFail(f);
      setBusy(false);
      if (f.field === 'email') emailRef.current?.focus();
    }
  };

  return (
    <form className="acct-stack" noValidate onSubmit={onSubmit(() => void submit(), busy)}>
      <Section id="person" title={t('admin.person')}>
        <div className="card-pad">
          {/* Someone else's address and name: no autofill from the admin's own. */}
          <TextField label={t('admin.email')} type="email" autoComplete="off" inputMode="email" name="invite-email" value={email} onChange={setEmail}
            inputRef={emailRef} autoFocus={focus} maxLength={EMAIL_MAX} error={empty.email ? t('admin.emailEmpty') : fieldError(fail, 'email')} />
          <TextField label={t('admin.name')} autoComplete="off" name="invite-name" value={name} onChange={setName} inputRef={nameRef} maxLength={NAME_MAX}
            error={empty.name ? t('admin.nameEmpty') : badName} />
        </div>
      </Section>
      {canGrant && (
        <Section id="roles" title={t('admin.roles')}>
          <RoleSwitches roles={roles} onChange={(role, on) => setRoles((rs) => (on ? [...rs, role] : rs.filter((r) => r !== role)))} />
          <p className="row-note">{t('admin.rolesNone')}</p>
        </Section>
      )}
      <FormError error={formError(fail)} />
      <SubmitButton label={t('admin.create')} busyLabel={t('admin.creating')} busy={busy} />
    </form>
  );
}

function InviteResult({ created, onAgain }: { created: InviteCreated; onAgain(): void }): JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  // Read out first: the screen changed from the form to its result.
  useEffect(() => heading.current?.focus(), []);
  const { account, link, expiresAt } = created;
  return (
    <>
      <section className="acct-card invite-ready m-in" aria-labelledby="invite-ready">
        <div className="invite-ready-head">
          <Icon name="check" size={22} strokeWidth={2.6} className="tone-good" />
          <h2 id="invite-ready" ref={heading} tabIndex={-1} className="invite-ready-title">
            {t('admin.ready', { name: account.name })}
          </h2>
        </div>
        <p className="acct-sub">{t('admin.readySub')}</p>
        <LinkResult kind="invite" name={account.name} link={link} expiresAt={expiresAt} />
      </section>
      <div className="btn-pair">
        <button type="button" className="btn btn--outline" onClick={onAgain}>
          {t('admin.another')}
        </button>
        <Link to="/admin" className="btn btn--accent">
          {t('admin.done')}
        </Link>
      </div>
    </>
  );
}
