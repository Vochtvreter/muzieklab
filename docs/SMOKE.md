# Smoke tests of the test site

`npm run smoke` checks a deployed site: https://test.vivanova.app unless `SMOKE_URL` names another. It builds and
starts nothing; it opens the site in Chromium and talks to its API, as a visitor would. The specs are in `e2e/smoke/`
and the settings in `playwright.smoke.config.ts`. `npm run e2e`, `npm run e2e:real` and CI's checks leave them out;
`npm run typecheck` checks their types.

A run takes about two minutes. It runs after every deploy to the test site (*The GitHub workflow* below), and Claude
sessions run it to check the test site.

## What it checks

- **The site** (`site.spec.ts`): `/api/v1/health` answers ok with its database (and, when `SMOKE_COMMIT` is set, as that
  commit); the test site is kept out of search engines (`X-Robots-Tag: noindex`); files in `assets/` are cached for a
  year (a missing one is not) and the page, `sw.js` and the manifest are checked on every visit; the manifest, its icons
  and the service worker are there; an unknown path is a 404.
- **Every screen** (`screens.spec.ts`), signed out, on a phone (390 × 844), a tablet (834 × 1194) and a desktop (1280 ×
  800), light and dark: its heading shows, nothing scrolls sideways, no button cuts its words off, no message key shows
  instead of its text, and nothing fails on the page (an error thrown, an error in the console, or a failed request).
  Then the main screens in Dutch.
- **Offline** (`offline.spec.ts`): once the service worker is installed, the app reloads with no network and opens
  Home, Learn, Read notes, Scales and Settings; online, an address deeper than the app is still the server's 404.
- **The main things to do** (`flows.spec.ts`): rhythm tapped on the keyboard to Results, the daily challenge, a path
  lesson, a Read notes round, a Scales round, a Learn chapter.
- **Accounts** with the real API (`accounts.spec.ts`): the admin's own screens, looked at; an invite made on the admin
  screen and accepted in another browser; a wrong password; signing out with Keep and with Remove; staying signed in
  across reloads, and in several tabs opened and reloaded one after another and at once (one renewal for tabs that
  start together); the account and admin screens at every size, light and dark.
- **Progress on the account** (`sync.spec.ts`): played on a phone, it is on a laptop that signs in; a theme set there
  comes back; Remove on sign-out takes it off the phone.
- **Roles** (`roles.spec.ts`): one account goes through every built-in role in `shared/api.ts` (`BUILT_IN_ROLES`), then
  none, then premium. Each time `/me` has the permissions the site stores for the role (`GET /admin/roles`), and only an
  admin sees Accounts, Feedback and the admin screens; the others see "You don't have access" and get 403 from every
  admin route. An admin cannot change its own roles. Each
  step starts from the roles the account has, so a step that fails does not skip the others: they go on in a new
  worker, with a new account.
- **The admin screens** (`admin.spec.ts`): search and the status filter, a new invite link, canceling an invite,
  renaming, blocking (sign-in refused) and unblocking, a new-password link.
- **Your own account** (`self-service.spec.ts`): change the password, download my data, sign out everywhere, delete
  the account.

## Run it

```sh
export MUZIEKLAB_TEST_EMAIL=…  MUZIEKLAB_TEST_PASSWORD=…   # an admin of the test site
npm run smoke
```

| Variable | What it is |
|---|---|
| `MUZIEKLAB_TEST_EMAIL`, `MUZIEKLAB_TEST_PASSWORD` | An admin account of the site, used only by the smoke tests. Without them the tests that sign in are skipped, and the others run. |
| `SMOKE_URL` | The site, `https://test.vivanova.app/` when not set. |
| `SMOKE_COMMIT` | The commit the API must report in `/api/v1/health`. Not set: the commit is only reported. |
| `PLAYWRIGHT_CHROMIUM_PATH` | A Chromium to use instead of Playwright's own (`npx playwright install chromium`). In a Claude session: `/opt/pw-browsers/chromium`. |

Claude sessions get the two account variables from the environment's secrets, never from a file in the repository.
Run one smoke run at a time from one computer: they share its address's sign-in limits (*Its accounts* below).

**Production.** With `SMOKE_URL=https://vivanova.app/` nothing signs in or changes anything: those tests are skipped,
and so are the checks of the API, which production does not have yet, and the screen checks (`screens.spec.ts`),
which are written for the test site's release and its API. The site checks, the main things to do and offline run.
The suite signs in only on the test site and on this computer (`localhost`, `127.0.0.1`); on any other site it acts
as on production. To sign in on another test site, add it to `ACCOUNT_HOSTS` in `e2e/smoke/helpers.ts`.

## Its accounts

The suite only ever changes accounts it made itself: `smoke-<run>-<test>-<label>@example.invalid`, named "Smoke …". It
never changes any other account.

- **One guard.** Every change the suite's admin makes, through the API or the admin screens, goes through one guard
  (`Admin` in `e2e/smoke/helpers.ts`). It refuses any account this run did not make, and any invite without a smoke
  email. A refused change fails the test. Before it presses anything on an account's admin screen, a test checks that
  the screen shows that account's email.
- **The admin.** Each worker signs it in once, through the API, and signs it out when it ends, so its "Devices signed
  in" does not grow. It never changes itself: not its name, email, password or roles, and not its progress (the admin's
  browser drops its own progress saves). It never signs out everywhere. If its sign-in in global setup fails, the run
  stops, and global teardown does not sign in: a wrong password is tried once a run. A sign-in that works, but not as
  an admin, is signed out again.
- **Wrong passwords** are only typed for the suite's own accounts: two a run. Three links that do not work (two made up,
  one replaced by a newer one) are opened a run. The API lets 50 of each through per address in 15 minutes.
- **Clean-up.** Each test removes its accounts when it ends, also when it fails. An invite that was not accepted is
  canceled, which leaves nothing behind. An account that was accepted deletes itself with its password and all of its
  data. One that cannot (blocked, or its password is not known) is deleted by the admin. After the run, global teardown
  removes anything of this run still there. Before a run, global setup removes smoke accounts older than two hours that
  a crashed run left behind.
- **A run stopped halfway** (Ctrl-C, a killed job) may leave its accounts until a run at least two hours later sweeps
  them, and the admin's sessions of that run stay signed in: they end after 90 days, or when the account has more than
  20 and the ones used longest ago end.

**What stays.** Every deleted account that was accepted leaves an entry in the admin screen *Deleted accounts*, kept for
two years: about nine a run. Those an account deleted itself say "[smoke test] run <id>". Those the admin deleted (a
blocked account, one whose password is not known, and the leftovers of a crashed run) cannot be marked: they look like
any account an admin deleted. The API cannot remove these entries, and the screen shows only the newest 500, so after
some 45 more runs the smoke entries push older real ones off it. Before the workflow runs after every deploy, that needs
a change to the app (leave out, or remove, the entries of `@example.invalid` accounts). The admin actions stay in the
audit log, with the names and emails of deleted accounts taken out. The admin's "Last signed in" moves with every run.

**Passwords.** The suite records nothing that could hold one: no traces (they keep every request body and every typed
value), no videos, and no page snapshot when a test fails (it lists what is typed in every field). With tracing
turned on anyway (`npm run smoke -- --trace on`), the tests that sign in are skipped, and say why. A request that
gets no answer at all is reported with the first line of Playwright's error only: the rest lists the request's
headers, its session cookies too. Screenshots of a failure stay on the computer that ran it (`test-results/smoke/`,
never committed); CI takes none and uploads nothing. A failure message can show an invite or new-password link; by
the end of the run its account is deleted, so the link no longer works.

## The GitHub workflow

`.github/workflows/smoke-test.yml` (*Smoke test*) runs after every *Deploy to test* that went through, and by hand
(*Actions → Smoke test → Run workflow*). After a deploy it checks out the deployed commit and asks the API to report
that commit.

- **Secrets:** add `MUZIEKLAB_TEST_EMAIL` and `MUZIEKLAB_TEST_PASSWORD` under *Settings → Secrets and variables →
  Actions → Secrets*. Without them the run is skipped, with a notice, and stays green.
- **The site** is the `TEST_URL` variable (`https://test.vivanova.app/` if it is not set). The suite refuses to sign
  in on production, whatever that variable says.
- **When it starts:** GitHub starts a workflow like this from the copy on the default branch (`main`), so it runs once
  the workflow is on `main` (after a release), or sooner if `test` is made the default branch (*Branches* in
  [DEPLOY.md](DEPLOY.md)). A branch deployed by hand that is older than the smoke tests has no `npm run smoke`, and its
  run fails.
- **One check at a time:** a newer deploy's check waits for the running one and replaces one still waiting; a running
  check is never canceled, as it would leave its accounts behind. A deploy that does not go through starts no check.
- **A newer deploy during a check:** deploys do not wait for checks. When a check fails and the site reports another
  commit than the one it checked, a newer deploy replaced the release meanwhile: the check ends with a notice, and the
  newer deploy's own check counts.
- **Nothing is uploaded:** this repository is public, and GitHub masks secrets in logs but not in artifacts.
- **Before adding the secrets,** read *What stays*: each run adds about nine entries to *Deleted accounts*.

## Known app bugs

No app bug is known.

A done scale looked up the step after its last note until 0.17.2 (the console said `[i18n] missing message:
scales.how.undefined`): `scales: a G major round played on the computer keyboard, three stars` checks it now, as every
test fails on a missing message. Several tabs opened at once was the other one until 0.17.1 (tabs that started together
each renewed the session, and one could sign itself out): `staying signed in: tabs opened one after another, and at
once…` checks it now.
