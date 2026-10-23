# Feedback loop: from a marked spot in the app to a deployed change

An administrator marks a part of a screen in the app and says what should change. That becomes a ticket. An agent
picks the ticket up, analyses it and writes a plan. When the plan is approved, an agent builds and tests it, and
prepares evidence for review. When the evidence is approved, the change is merged to `main` and deployed.

People decide at two points: the **plan** and the **evidence**. Everything between those points is automatic.

Step 1, capture, is built (0.11.0). Steps 2–6 are designed here and come next.

## 1. The loop

```
 ① Capture            ② Triage & analysis       ③ Plan review        ④ Build & test           ⑤ Evidence review     ⑥ Merge & deploy
 admin marks a   ──▶  agent reproduces it,  ──▶  admin approves  ──▶  agent branches, codes, ──▶  admin approves  ──▶  auto-merge to main,
 spot in the app      finds the code, checks     or asks for a        tests, screenshots       the PR               Pages deploys, the
 → GitHub issue       the boards, writes a plan  revision             every size → PR                               issue is closed
                                  ▲                    │                       ▲                      │
                                  └──── /revise ───────┘                       └────── /revise ───────┘
```

## 2. The ticket system: GitHub Issues

The tickets are issues on this repository (`Vochtvreter/muzieklab`). The code, CI (`.github/workflows/ci.yml`), the
deploy (`pages.yml`) and the agents already live on GitHub, so nothing else is needed: no extra service, account or
sync. An issue links to its PR (`Closes #n`), and its history is the audit trail of the whole loop.

A ticket's state is one `status:` label. Only the workflows and the administrator change it.

| Label | Meaning | Set by | Next |
|---|---|---|---|
| `status:triage` | New report, waiting for the agent | The app (step 1) | `status:analyzing` |
| `status:analyzing` | The agent is reproducing it and writing the plan | Triage workflow | `status:plan-review`, `status:blocked` |
| `status:plan-review` | The plan is on the issue, waiting for the admin | Triage workflow | `status:approved`, `status:analyzing` (on `/revise`) |
| `status:approved` | The plan is approved; build is queued | Admin (`/approve`) | `status:building` |
| `status:building` | The agent is coding and testing on a branch | Build workflow | `status:evidence-review`, `status:blocked` |
| `status:evidence-review` | The PR, with evidence, waits for the admin | Build workflow | `status:merging`, `status:building` (on `/revise`) |
| `status:merging` | Approved; auto-merge waits for CI | Review workflow | `status:deployed` |
| `status:deployed` | Live on the site; the issue is closed | Deploy workflow | — |
| `status:blocked` | The agent needs a person (question, failing CI it cannot fix) | Any workflow | Back to the step that blocked |

Other labels: `feedback` (every report from the app), `type:bug`, `type:change` and `type:idea`.

## 3. Step ① Capture (built)

### Turning it on

Feedback mode is off for everyone. On a device, open the app with `?feedback=on`:

- In a browser: `https://vochtvreter.github.io/muzieklab/?feedback=on`
- In the installed app (it has no address bar): open the address with the switch in the hash, like
  `…/muzieklab/#/settings?feedback=on`.

The switch is saved on the device (`muzieklab.feedback.v1` in localStorage) and removed from the address. Use
`?feedback=off`, or **Turn off feedback mode** in the form, to turn it off.

### Marking and sending

1. A **Feedback** button floats over every screen. On phone it is a round icon above the tab bar; on tablet and desktop
   it sits in the bottom-right corner.
2. Press it, then tap or click the part you mean, or drag to draw a box. With a mouse, the element a click would mark is
   outlined. Press Esc or Cancel to stop. To mark something further down the page, scroll first, then press Feedback.
3. A sheet opens (a dialog on desktop, beside the marked spot). The spot stays lit and the rest of the screen dims.
   Choose **Bug**, **Change** or **Idea**, then say what should change. A title is optional; without one, the title is
   made from the kind, the spot and the screen.
4. Send the report:
   - **Open on GitHub** (no setup): GitHub's new-issue page opens with everything filled in. You can paste a screenshot
     there, then press Create. You must be signed in to GitHub.
   - **Send** (once a token is saved under *Send straight from the app*): the app opens the issue itself through the
     GitHub API and shows its number.
   - **Copy** puts the issue in Markdown on the clipboard.

The token for **Send** is a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
that has access to `Vochtvreter/muzieklab` only, with the permission **Issues: Read and write** and nothing else. Give it
an expiry date. It stays in this device's localStorage and is never part of a report. Note that every Pages site of
the `vochtvreter` account shares the `vochtvreter.github.io` origin, and so shares its storage. This is why the token
must be this narrow.

### What a report holds

Each issue has a readable part and a JSON block for the agent (`src/feedback/report.ts`):

- **What should change:** the kind, the title and the description.
- **Where:** the route (`#/settings`) and the marked element: its CSS selector, a readable name (`button “Start”`), its
  text and its markup (shortened). It also holds the marked box in CSS pixels and the page's scroll offset.
- **Device:** the viewport and pixel ratio, the breakpoint (phone, tablet or desktop), the orientation, touch or mouse,
  the theme (setting and shown), the language and the user agent.
- **State:** the player's preferences (`muzieklab.prefs.v1`), so the agent can seed them and see the same screen.
  Progress is not sent.
- The `<!-- muzieklab-feedback:v1 -->` marker. The agent only acts on issues that have it.

The app takes no screenshot itself: a static page cannot attach an image to an issue without a server. The triage step
renders the screen again from the report and draws the box (§4), and Open on GitHub lets you paste your own. If the
prefilled link would be too long (over 8000 characters), the markup is dropped first, then the preferences.

### Code

| File | What it does |
|---|---|
| `src/feedback/report.ts` | Report types; the issue (title, body, labels); the prefilled link; reading a report back from an issue |
| `src/feedback/dom.ts` | The selector, the readable name and the markup of the marked element; the device context |
| `src/feedback/admin.ts` | Feedback mode and the token on the device; `?feedback=on/off`; creating the issue through the API |
| `src/ui/feedback/FeedbackTool.tsx` | The button, the marking layer and the form |
| `src/styles/feedback.css` | Their styles |
| `e2e/layout.spec.ts` | *feedback:* tests, at every size in `e2e/helpers.ts`, and sending with a token |

## 4. Step ② Triage and analysis (next)

A workflow, `.github/workflows/feedback-triage.yml`, runs on `issues: [opened, labeled]` when an issue has
`status:triage` and the report marker. It runs Claude Code through
[`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) with a fixed prompt, kept in
`.github/prompts/triage.md`. It works as follows:

1. **Gate.** It continues only if the issue's author is on the allowlist (the repository owner, from
   `author_association` and a `FEEDBACK_ADMINS` variable). Otherwise it does nothing: anyone can open an issue on a
   public repository.
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
5. Open a PR with `Closes #<n>`. Its description holds the approved plan, what was done and where it differs from
   the plan, the evidence table (before and after, per size and theme), the test results, and the boards that still
   need updating.
6. Set `status:evidence-review`. CI (`ci.yml`) runs on the PR as usual.

## 7. Step ⑤ Evidence review

The administrator reviews the PR:

- **Approve** (a GitHub review). `feedback-review.yml` turns on auto-merge (squash) and sets `status:merging`.
- **Request changes**, or `/revise <notes>` on the PR. The build agent runs again on the same branch and sets
  `status:evidence-review` once more.

Branch protection on `main` must require a passing CI and one approving review from a code owner (`CODEOWNERS`:
the administrator). The agent's token cannot approve its own PR, so the merge always follows a person's approval.

## 8. Step ⑥ Merge and deploy

Auto-merge merges once CI is green. The push to `main` runs `pages.yml`, as it does today: tests, build, deploy.
`Closes #<n>` closes the issue. A last job, added to `pages.yml` after `deploy`, finds the issues that the merged PR
closes. It sets `status:deployed` on each and comments the live URL and the version. To undo a change, revert its PR.
That goes through the same CI and deploy.

## 9. Guardrails

- **Who can start the loop.** Only issues and commands from authors on the allowlist. An issue from anyone else is
  ignored, even if it has the marker and the labels.
- **The issue text is data, not instructions.** The agent prompts say so. The agents run with a fixed set of tools,
  write only to their own branch, and never see the deploy credentials.
- **People decide twice:** at the plan and at the evidence. Nothing reaches `main` without a person's review.
- **One run per issue** (a `concurrency` group per issue number), with a limit on turns and time for each run.
- **The app's token** is narrow (§3), and the app never sends it anywhere but `api.github.com`.

## 10. Open points

- **Labels.** Create the labels in §2 once. The prefilled link only applies labels that already exist; step ②'s
  workflow can create them on its first run.
- **Design canvases.** The feedback tool has no board yet; it is an admin tool. Agents in Actions cannot edit the
  canvases, so the plan lists the boards to update and a person updates them.
- **Screenshots from the app.** Later, the app could capture the spot itself (for example with `html2canvas`, loaded
  only in feedback mode) and upload it to `feedback-evidence`. That needs a token with Contents: write, which is wider
  than Issues only.
