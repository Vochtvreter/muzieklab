# Feedback loop: from a marked spot in the app to a deployed change

Someone with the `feedback.give` permission marks a part of a screen in the app and says what should change. The app
stores that report, and an admin reviews it there. A report the admin accepts becomes a ticket. An agent picks the
ticket up, analyses it and writes a plan. When the plan is approved, an agent builds and tests it, and prepares
evidence for review. When the evidence is approved, the change is merged into `test` and deployed to the test site;
from there it reaches `main` and production with the next release, as every change does (`CLAUDE.md`, Branches).

People decide at three points: which **reports** go on, the **plan** and the **evidence**. Everything between those
points is automatic.

Step 1, capture and review, is built (0.17.0): reports are stored in the app, and admins accept or decline them there.
Sending the accepted reports to GitHub, and steps 2–6, are designed here and come next.

## 1. The loop

```
 ① Capture & review   ② Triage & analysis       ③ Plan review        ④ Build & test           ⑤ Evidence review     ⑥ Merge & deploy
 someone marks a ──▶  agent reproduces it,  ──▶  admin approves  ──▶  agent branches, codes, ──▶  admin approves  ──▶  auto-merge to test,
 spot in the app;     finds the code, checks     or asks for a        tests, screenshots       the PR               the test site deploys,
 it is stored there.  the boards, writes a plan  revision             every size → PR                               the issue is closed
 An admin accepts                 ▲                    │                       ▲                      │
 it → GitHub issue                └──── /revise ───────┘                       └────── /revise ───────┘
```

## 2. Where a report stands: in the app, then on GitHub

A report starts in the app. The API stores it (BACKEND-PLAN.md §3.9) with one of three statuses. Only someone with
`feedback.review` (admins, and any role given it) changes it, on Settings → Account → Feedback (§3):

| Status in the app | Meaning |
|---|---|
| New | Sent from the app; nobody has reviewed it yet |
| Accepted | Picked up: it is to become a ticket (the GitHub step, §3) |
| Declined | Not picked up. It stays, with the reviewer's note, until someone deletes it |

A status can change to any other at any time. The report keeps who changed it last, and when. The person who sent it
does not see the review in the app; their account's export has the status (BACKEND-PLAN.md §7).

The tickets are issues on this repository (`Vochtvreter/muzieklab`). The code, CI (`.github/workflows/ci.yml`), the
deploys (`deploy-test.yml`, `deploy.yml`) and the agents already live on GitHub, so nothing else is needed: no extra
service, account or sync. An issue links to its PR (`Closes #n`), and its history is the audit trail of the rest of the
loop. Only accepted reports become issues, so the issues hold only what the team picked up, and a report that is not
picked up never becomes public.

A ticket's state is one `status:` label. Only the workflows and the administrator change it.

| Label | Meaning | Set by | Next |
|---|---|---|---|
| `status:triage` | New ticket, waiting for the agent | The API, when it opens the issue for an accepted report (step ①, next) | `status:analyzing` |
| `status:analyzing` | The agent is reproducing it and writing the plan | Triage workflow | `status:plan-review`, `status:blocked` |
| `status:plan-review` | The plan is on the issue, waiting for the admin | Triage workflow | `status:approved`, `status:analyzing` (on `/revise`) |
| `status:approved` | The plan is approved; build is queued | Admin (`/approve`) | `status:building` |
| `status:building` | The agent is coding and testing on a branch | Build workflow | `status:evidence-review`, `status:blocked` |
| `status:evidence-review` | The PR, with evidence, waits for the admin | Build workflow | `status:merging`, `status:building` (on `/revise`) |
| `status:merging` | Approved; auto-merge waits for CI | Review workflow | `status:deployed` |
| `status:deployed` | Live on the site; the issue is closed | Deploy workflow | — |
| `status:blocked` | The agent needs a person (question, failing CI it cannot fix) | Any workflow | Back to the step that blocked |

Other labels: `feedback` (every issue made from a report), `type:bug`, `type:change` and `type:idea`.

## 3. Step ① Capture and review (built; sending to GitHub next)

### Who has it

Two permissions (BACKEND-PLAN.md §4): `feedback.give` sends reports, and `feedback.review` reviews them. Admins have
both. An admin gives them to others through a role: one with `roles.manage` makes a role with `feedback.give` (for
example *Testers*, `POST /admin/roles`), and gives that role to accounts on Settings → Accounts. `feedback.review` is
given the same way (for example to a *Reviewers* role), by someone who has it. Players without an account never see the
tool, and their app sends no request for it.

The tool shows only in **feedback mode**, which an admin turns on and off for everyone with the **Feedback mode** switch
above the reports (Settings → Account → Feedback; `PUT /admin/feedback-mode`, `feedback.review`). It starts off, so
nobody sees the button until an admin turns it on, for a round of testing for example. The app learns it with the
account (`Me.feedbackMode`, from GET /me when the app starts, on any screen: every account kept on the device asks,
also one kept while the mode was off), so others see the change the next time they open the app; the admin who
switched it sees it at once.

While it is on, a signed-in account with `feedback.give` sees the tool on every screen. **Settings → Account → Feedback
button** turns it off on one device (and on again); the form's *Hide the feedback button on this device* does the same.
While feedback mode is off, that switch is not shown either. An account with `feedback.review` has a **Feedback** row
there too, which opens the reports.

### Marking and sending

1. A **Feedback** button floats over every screen. On phone it is a round icon above the tab bar; on tablet and desktop
   it sits in the bottom-right corner. Screens without the tab bar or header (an exercise, its setup and results, a
   form on its own) have their controls low on the screen, so there it is a tab on the right edge: halfway down, 30%
   of the way down while an exercise is played (above its answers), and three quarters down on a form on its own. A
   phone in landscape has it on the left edge, as its answers are on the right.
2. Press it, then tap or click the part you mean, or drag to draw a box. With a mouse, the element a click would mark is
   outlined. With the keyboard, the arrow keys pick the screen's parts in turn, the hint bar names the one picked, and
   Enter marks it. A tap or click marks the same parts: one on a control's icon or a word in it marks the control. The
   hint bar sits at the top; tap it to move it to the bottom (and back) when it is over what you mean. Press Esc or
   Cancel to stop. To mark something further down the page, scroll first, then press Feedback.
   However the tool closes (Esc, Cancel, or the sheet's X or Close), the focus goes back to the Feedback button.
3. A sheet opens (a dialog on desktop, beside the marked spot). The spot stays lit and the rest of the screen dims.
   Choose **Bug**, **Change** or **Idea**, then say what should change (at most 5000 characters). A title is
   optional; without one, the review screens name the report by its kind and screen (*Bug on #/settings*), and its
   issue by the kind, the spot and the screen. **Mark again** marks another spot for the same report and keeps what is
   typed; Esc or Cancel then goes back to the form as it was.
4. Send the report:
   - **Send**: the app sends the report to the API (`POST /api/v1/feedback`), which stores it as New. The sheet then
     says *Saved for review*: an admin reads it in Settings → Account → Feedback, and picks what goes on to GitHub.
     For someone who also has `feedback.review`, **Review it** opens the report there.
   - **Copy** puts the report on the clipboard in Markdown: the GitHub issue it would become. It says *Copied* for 2 s,
     or until the report changes. Where the clipboard is not allowed, the Markdown shows in a field to copy by hand.
   - When sending fails (no connection, the server busy, too many reports in an hour), the sheet says why and keeps
     the form as it is, so Send tries again.

Nothing goes to GitHub from the app or the API yet, so no GitHub token is needed anywhere (DEPLOY.md). The report is
stored with the account that sent it, so whoever reviews it sees who that was, and the audit log records it
(`feedback.send`). The GitHub issue it may become will not name them, as the repository is public; the form says so.
The API takes at most 30 reports an hour from one account. When someone deletes their own account, the reports they
sent are deleted with it, whether or not they keep an anonymous copy; when an admin deletes an account, its reports stay
without the name (BACKEND-PLAN.md §3.9). The privacy statement in the app says what a report holds and how long it is
kept.

### Reviewing

For an account with `feedback.review`, from Settings → Account → Feedback (DESIGN.md §9.2 has the screens). Above the
list, **Feedback mode** turns the Feedback button on and off for everyone (*Who has it*, above).

1. **Feedback** (`#/admin/feedback`) lists the reports, newest first, with a filter by status that counts each:
   New 3 · Accepted 1 · Declined 0 · All 4. It starts on New, the reports nobody has reviewed yet. A row shows the
   title (or, without one, a title made from the kind and the screen: *Bug on #/settings*), the kind, the marked spot,
   who sent it (or *A deleted account*) and the day.
2. **One report** (`#/admin/feedback/<id>`) shows everything it holds (below): what should change, where (with *Open
   this screen*), the device, and who sent it when.
3. **Review:** New, Accepted or Declined, saved at once, with who reviewed it last and when. A **note** for the team
   (at most 2000 characters) says why, or what to do next. The person who sent the report does not see it.
4. **Copy as Markdown** gives the issue's title and body (`buildIssue`), to open an issue on GitHub by hand until the
   API does it (below).
5. **Delete report** removes it for everyone: for a report that is only noise, such as a test or a duplicate.

### Sending to GitHub (next)

The rest of this step opens a GitHub issue for each accepted report. It is designed, not built:

- The API builds the issue from the stored report (`buildIssue` in `shared/feedback.ts`: the title, the body with the
  JSON block, and the labels `feedback`, `type:<kind>` and `status:triage`), so its format and labels are the
  server's. It opens it with its own token: a fine-grained token with **Issues: Read and write** on this repository
  only, in the API's settings file. DEPLOY.md gets the steps for it then. No device holds one, and it is never in the
  code or the build.
- The report keeps the issue's number and link, and its screen links to the issue. The issue does not name who sent
  the report; the app and the audit log do.
- When GitHub refuses or does not answer, the report stays accepted and says that it was not sent, so it can be sent
  again.

Until then, Copy as Markdown is the way: paste it into a new issue on GitHub. Step ② only picks up an issue opened by
hand when its author is on the allowlist (§4).

### What a report holds

Each report holds (`shared/feedback.ts`; stored as it was sent, less a link's token and what was typed in a field,
`withoutSecrets`, BACKEND-PLAN.md §3.9):

- **What should change:** the kind, the title and the description.
- **Where:** the route (`#/settings`) and the marked element: its CSS selector, a readable name (`button “Start”`, a
  field by its label: `field “New password”`; in English whatever the app's language, as the issue is), its text (its
  parts apart, as it reads) and its markup (shortened). What was typed in a field is never in it: React keeps it in the
  field's `value` attribute (a password too), and a text area's in its text, so both are left out. An invite or
  new-password link's token is left out too, `:token` in its place (`#/reset/:token`), in the route and address of its
  screen and in the marked element's name, text and markup (an admin's link card shows the link): whoever has a token
  can claim the account, and a report is read by its reviewers and may become a public issue. The app leaves these
  out, and the API again, both when it stores a report and when it hands one out (for a report kept before it did,
  `withoutSecrets` in `shared/feedback.ts`). It also holds the marked box in CSS
  pixels and the page's scroll offset: how far the boxes around the element are scrolled (a screen scrolls inside the
  page, not the window), leaving out scroll that does not move it (a sticky part, such as Settings' side column, counts
  only how far it went along before it stuck; a fixed one stays put whatever scrolls), so the box plus the offset is
  where the spot is on the page scrolled to its top.
- **Device:** the viewport and pixel ratio, the breakpoint (phone, tablet or desktop), the orientation, touch or mouse,
  the theme (setting and shown), the language, the app version and the user agent.
- **State:** the player's preferences (`muzieklab.prefs.v1`), so the agent can seed them and see the same screen.
  Progress is not sent.

The GitHub issue it becomes has a readable part with all of this, and a JSON block for the agent, with the
`<!-- muzieklab-feedback:v1 -->` marker. The agent only acts on issues that have it.

The app takes no screenshot itself (§10). The triage step renders the screen again from the report and draws the box
(§4), and someone who opens an issue by hand can paste their own.

### Code

| File | What it does |
|---|---|
| `shared/feedback.ts` | Report types; the review's statuses and bodies; the issue (title, body, labels); reading a report back from an issue. Used by the app and the API |
| `src/feedback/dom.ts` | The selector, the readable name and the markup of the marked element; the device context |
| `src/ui/feedback/FeedbackTool.tsx` | Shows the tool in feedback mode, for an account with `feedback.give`; loads it in its own chunk |
| `src/ui/feedback/FeedbackOn.tsx` | The button, the marking layer and the form, which sends to the API |
| `src/styles/feedback.css` | Their styles |
| `src/ui/screens/admin/AdminFeedback.tsx` | Feedback: the Feedback mode switch, and the reports, with the status filter |
| `src/ui/screens/admin/AdminFeedbackReport.tsx` | One report: everything it holds, the review (status and note), Copy as Markdown and Delete report |
| `server/src/routes/feedback.ts` | `POST /feedback`: checks the report and stores it; `/admin/feedback`: the list, one report, the review and Delete (`feedback.review`); `PUT /admin/feedback-mode`: feedback mode on or off |
| `server/src/accounts/remove.ts` | What becomes of the reports when an account is deleted (BACKEND-PLAN.md §3.9) |
| `server/src/routes/roles.ts` | The roles: which permissions each has, `feedback.give` and `feedback.review` among them |
| `e2e/layout.spec.ts`, `e2e/real-api.spec.ts` | *feedback* tests at every size in `e2e/helpers.ts`; a role with `feedback.give` against the real API |

## 4. Step ② Triage and analysis (next)

A workflow, `.github/workflows/feedback-triage.yml`, runs on `issues: [opened, labeled]` when an issue has
`status:triage` and the report marker. It runs Claude Code through
[`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) with a fixed prompt, kept in
`.github/prompts/triage.md`. It works as follows:

1. **Gate.** It continues only if the issue's author is on the allowlist: the GitHub account the API's token belongs
   to (so every issue the API opens for a report an admin accepted in the app), and the people in a `FEEDBACK_ADMINS`
   variable (issues opened by hand, from Copy as Markdown). Otherwise it does nothing: anyone can open an issue on a
   public repository, and only the API and those people are trusted.
2. Set `status:analyzing`.
3. **Read the report** with `parseIssueBody`.
4. **Reproduce.** Build the app and open the route at the report's viewport, with its theme and language, and with
   its preferences seeded (`seed()` in `e2e/helpers.ts`). Find the element by its selector, or else by its box. Take a
   screenshot with the box drawn on it. Also take one at each size in `VIEWPORTS`, if the report is about layout.
5. **Analyse.** Find the code behind the spot. Read the screen's boards on both canvases and in `DESIGN.md`, as the
   *Designs first* rules in `CLAUDE.md` require. Say whether the report is a bug in the build, a change to the design,
   or a conflict between the designs.
6. **Post the plan** as one comment, in this form:
   - **Summary**: the issue in one or two sentences.
   - **Reproduced**: yes or no, with the screenshots.
   - **Cause**: for a bug.
   - **Proposed change**: the files to change, and what each change does.
   - **Designs**: the boards that need updating, and any conflicts between the designs. A person updates the canvases.
   - **Version**: patch or minor, and the line for the changelog.
   - **Tests**: the unit tests and the `e2e/layout.spec.ts` tests to add or change.
   - **Risks and questions.**
7. Set `status:plan-review`. If the agent cannot go on, set `status:blocked` and post its question instead.

The screenshots are committed to an orphan branch, `feedback-evidence`, at `issues/<n>/…png`, and shown in the
comment by their raw URL. Images in a public repository need no other hosting.

## 5. Step ③ Plan review

The administrator answers on the issue:

- `/approve` sets `status:approved`, which starts step ④.
- `/revise <what to change>` sets `status:analyzing`. The agent updates the plan, taking the note into account.
- To drop a report, close the issue.

A small workflow (`feedback-commands.yml`, on `issue_comment`) reads these commands. It only acts on comments from an
author on the allowlist.

## 6. Step ④ Build and test

When an issue gets `status:approved`, `feedback-build.yml` runs Claude Code with the approved plan:

1. Set `status:building`. Create a branch named `feedback/<n>-<slug>`.
2. Make the change. Add or update its tests. Bump the version and add the changelog entry, as the *Versioning* rules
   in `CLAUDE.md` require.
3. Run `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e`. Fix the code until they pass. After 3
   failed rounds, set `status:blocked`.
4. **Evidence.** Take before and after screenshots of the changed screen at every size in `VIEWPORTS`, in light and
   dark, and commit them to `feedback-evidence` at `issues/<n>/pr/…`. Record the test results.
5. Open a PR into `test` (never `main`, `CLAUDE.md` Branches) with `Closes #<n>`. Its description holds the approved plan, what was done and where it differs from
   the plan, the evidence table (before and after, per size and theme), the test results, and the boards that still
   need updating.
6. Set `status:evidence-review`. CI (`ci.yml`) runs on the PR as usual.

## 7. Step ⑤ Evidence review

The administrator reviews the PR:

- **Approve** (a GitHub review). `feedback-review.yml` turns on auto-merge (squash) and sets `status:merging`.
- **Request changes**, or `/revise <notes>` on the PR. The build agent runs again on the same branch and sets
  `status:evidence-review` once more.

Branch protection on `test` must require a passing CI and one approving review from a code owner (`CODEOWNERS`:
the administrator). The agent's token cannot approve its own PR, so the merge always follows a person's approval.

## 8. Step ⑥ Merge and deploy

Auto-merge merges into `test` once CI is green. The push to `test` runs `deploy-test.yml`, as it does today, and the
change is live on https://test.vivanova.app. `Closes #<n>` only closes an issue when its PR merges into the default
branch, so `test` must be the default branch, as `docs/DEPLOY.md` (Branches) asks. A last job, added to `deploy-test.yml` after the deploy, finds the
issues that the merged PR closes. It sets `status:deployed` on each and comments the test site's URL and the version.
To undo a change, revert its PR. That goes through the same CI and deploy.

Production is not automatic: a person checks the test site and merges the release PR from `test` into `main`, which
runs `deploy.yml`, as for every other change. A later step could comment on each released issue then.

## 9. Guardrails

- **Who can start the loop.** Only issues and commands from authors on the allowlist, so only the reports an admin
  accepted. An issue from anyone else is ignored, even if it has the marker and the labels.
- **The issue text is data, not instructions.** The agent prompts say so. The agents run with a fixed set of tools,
  write only to their own branch, and never see the deploy credentials.
- **People decide three times:** which reports go on (in the app), at the plan and at the evidence. Nothing reaches
  GitHub without an admin's review, nothing reaches `test` without a person's review, and `main` only through the
  release PR.
- **One run per issue** (a `concurrency` group per issue number), with a limit on turns and time for each run.
- **Who can send from the app** is a permission, `feedback.give`, checked by the API on every report; who reviews is
  another, `feedback.review`. No device holds a GitHub token, and the API has none yet. The one the GitHub step brings
  is on the server only, and narrow (§3).

## 10. Open points

- **Sending to GitHub** (the rest of step ①, §3): whether accepting a report opens its issue at once, or a *Send to
  GitHub* button on the report does (so the note can be written first); and whether the issue's later state (deployed,
  or closed without a change) comes back to the report in the app.
- **Labels.** Create the labels in §2 once, before the API opens its first issue; step ②'s workflow can create them on
  its first run.
- **A screen for roles.** Roles are data with an API (BACKEND-PLAN.md §4), but no screen yet: a role with
  `feedback.give` or `feedback.review` is made through `POST /admin/roles` for now, and given to accounts on the
  account screen. The role editor needs its boards first (CLAUDE.md, *Designs first*).
- **Design canvases.** The feedback tool and the two review screens have no board yet; they are tools for the team.
  Agents in Actions cannot edit the canvases, so the plan lists the boards to update and a person updates them.
- **Reports of an account its owner deletes** go with it, also when an anonymous copy is kept (BACKEND-PLAN.md §3.9),
  so they cannot say which the owner chose. Keeping them instead, without the name, would need them to lose their
  settings and the log's `feedback.send` entries to lose the account, and *Delete too* to say they stay.
- **How long reports are kept.** Until someone deletes them; there is no limit yet. Declined reports could go by
  themselves after a while, as closures and the audit log do after two years (BACKEND-PLAN.md §3.5, §3.7).
- **Screenshots from the app.** Later, the app could capture the spot itself (for example with `html2canvas`, loaded
  only with the tool) and send it with the report. The API would keep it with the report, and put it on the
  `feedback-evidence` branch when the report goes to GitHub. That needs the server's token to have Contents: write as
  well, which is wider than Issues only.
