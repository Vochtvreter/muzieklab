import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_NOTE_SETTINGS, generateRound, type NoteSettings } from '../src/core/noteRound';
import { letterOf } from '../src/core/pitch';
import { pianoWindow, scaleNotes, type Scale } from '../src/core/scale';
import { noteLessonSettings } from '../src/game/notesPath';
import { lessonSettings } from '../src/game/path';
import { CHAPTERS } from '../src/ui/learn/chapters';
import type { Me, RoleInfo } from '../shared/api';
import type { FeedbackReport } from '../shared/feedback';
import {
  ACCOUNTS, accountDetail, ADMIN, adminApi, announcer, apiError, calibrateAlong, ME_ADMIN, expectClickable, expectFieldsFit, expectFits, expectFocusRing, expectHitHeight, expectNoClippedLabels, expectNoOverlap,
  expectNoPageScroll, expectNoSideScroll, expectNotSqueezed, expectScrollbarAtEdge, expectStavesFit, expectTouchHeight, FEEDBACK, feedbackServer, INVITE_LINK_CREATED, ME_MEMBER, MEMBER, mockApi,
  pad, pathUpTo,
  QUARTERS, RESET_LINK_CREATED, seed, seedAccount, signedInAs, SIGNED_OUT, SOL_DONE, tabTo, tapLate, TOKEN, VIEWPORTS, type MockRoutes, type ViewportName,
} from './helpers';
import { emptyProgress, PROGRESS_CLOCK, PROGRESS_PREFS, richProgress } from './progressFixture';

/**
 * The status filter's chips sit in rows of the same size: all four on one line, or two and two as an even grid (the
 * second line's chips under the first's, as wide), never three and a lone one that reads as a separate wide button.
 */
async function expectEvenChipRows(page: Page, where = '', group = 'Status'): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const lines = await page.getByRole('group', { name: group }).getByRole('button').evaluateAll((els) => {
    const byTop = new Map<number, { left: number; width: number }[]>();
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const top = Math.round(r.top);
      byTop.set(top, [...(byTop.get(top) ?? []), { left: r.left, width: r.width }]);
    }
    return [...byTop.values()];
  });
  const counts = lines.map((l) => l.length).join(' + ');
  expect(lines.length === 1 || (lines.length === 2 && lines.every((l) => l.length === 2)), `${where} chips per line: ${counts}`.trim()).toBe(true);
  if (lines.length === 2) {
    const [a, b] = lines;
    const off = Math.max(...a.map((c, i) => Math.max(Math.abs(c.left - b[i].left), Math.abs(c.width - b[i].width))));
    expect(off, `${where} two and two is an even grid`.trim()).toBeLessThanOrEqual(1);
  }
}

/** An invite link that works (POST /auth/invite/check), for the account screens. */
const INVITE_LINK = { email: 'lies@example.com', name: 'Lies Bakker', expiresAt: '2026-10-29T10:00:00.000Z' };

/**
 * Admins name and describe custom roles: a one-word name of 80 characters (the most it may be) and a one-word
 * description, each wider than the words of the row or note that shows them, at every size.
 */
const LONG_ROLE: RoleInfo = { id: 'coordinators', name: 'Muziekschoolleerkrachtencoördinatorenvergaderingsvoorzittersplaatsvervangerschap',
  description: 'Leerkrachtencoördinatorenvergaderingsvoorzittersplaatsvervangersbevoegdhedenoverzichtsbeheerderstoegangsrechtenbeheer',
  permissions: ['accounts.read'], builtIn: false, accounts: 1 };

/**
 * Known layout bugs from the MVP QA, fixed in the follow-up layout PR. `test.fail` keeps CI green while they are open
 * and turns red the moment one starts passing, so the entry gets removed with its fix.
 */
const KNOWN: Record<string, string> = {};
const known = (vp: string, screen: string): void => {
  const why = KNOWN[`${vp}/${screen}`];
  test.fail(!!why, why);
};

/**
 * Tablet and desktop: a wide screen's side panel (summary and main button) is beside its main column, not under it.
 * Wait for the screen first: right after a link to another screen, both locators can still find the old one.
 */
async function expectBeside(main: Locator, side: Locator): Promise<void> {
  // From the top: further down the side panel stays in view while the main column scrolls on.
  await main.evaluate((el) => el.closest('.page')?.scrollTo(0, 0));
  const [m, s] = [(await main.boundingBox())!, (await side.boundingBox())!];
  expect(s.x, 'the side panel is right of the main column').toBeGreaterThanOrEqual(m.x + m.width - 1);
  expect(Math.abs(s.y - m.y), 'the side panel starts level with the main column').toBeLessThan(40);
}

/**
 * One account after a second New password link press that got no answer (DESIGN.md, One account): why takes the place
 * of "New link ready…", and the earlier link and its message stay in their place, dimmed and not usable. `button` is
 * the button's name, `alert` the whole error.
 */
async function failedSecondLink(page: Page, button: string, alert: string): Promise<void> {
  let made = 0;
  await mockApi(page, { ...adminApi(), 'POST /admin/accounts/:id/reset-link': () => (made++ === 0 ? { json: RESET_LINK_CREATED } : { status: 502 }) });
  await page.goto('./#/admin/account/' + ACCOUNTS[1].id);
  const press = page.getByRole('button', { name: new RegExp('^' + button) });
  await press.click();
  await expect(page.locator('.link-result .form-done')).toBeVisible();
  await press.click();
  await expect(page.getByRole('alert')).toHaveText(alert);
  await expect(page.locator('.link-result .form-done')).toHaveCount(0);
  await expect(page.locator('.link-result-body')).toHaveAttribute('inert', '');
  await expect(page.locator('.link-result-body')).toHaveCSS('opacity', '0.45');
  // Why is shown whole, right under the button, which can be pressed again.
  await expectNotSqueezed(page.getByRole('alert'));
  await expectNoOverlap(press, page.getByRole('alert'));
  await expectClickable(press);
  await expect(page.getByRole('alert')).toBeInViewport();
  await expectNotSqueezed(page.locator('.link-result textarea'));
  for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
  await expectFieldsFit(page);
  await expectNoClippedLabels(page);
  await expectNoSideScroll(page);
}

/**
 * A row link's words stay in their column, left of the chevron (a switch row's, `.toggle-row-text`, left of its
 * switch; a note's, `.row-note`, in its card): a long name or email with no break point wraps instead of running under
 * the chevron and out of the card.
 */
async function expectWordsInRow(row: Locator, column = '.row-link-text'): Promise<void> {
  await row.evaluate(() => document.fonts.ready.then(() => undefined));
  const m = await row.evaluate((el, column) => {
    const text = el.querySelector(column)!;
    const range = document.createRange();
    range.selectNodeContents(text);
    return { words: Math.max(...[...range.getClientRects()].map((r) => r.right)), column: text.getBoundingClientRect().right };
  }, column);
  expect(m.words, 'the words run out of their column').toBeLessThanOrEqual(m.column + 0.5);
}

/**
 * A feedback report's facts (the label, and its value beside or under it), its description and who reviewed it stay
 * inside their cards: a long value (the selector, the browser, a word with no spaces) wraps instead of running out of
 * the card or being cut.
 */
async function expectFactsInCards(page: Page): Promise<void> {
  const out = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.facts dt, .facts dd, .report-quote, .review-choice .tfield-hint')]
      .filter((el) => el.offsetParent !== null)
      .flatMap((el) => {
        const card = el.closest('.set-card')?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const name = (el.textContent ?? '').slice(0, 40);
        if (!card) return [`${name}: not in a card`];
        if (r.left < card.left - 0.5 || r.right > card.right + 0.5) return [`${name}: runs out of its card`];
        return el.scrollWidth > el.clientWidth + 1 ? [`${name}: cut off`] : [];
      }),
  );
  expect(out, 'report facts').toEqual([]);
}

/**
 * The counts under Learn's rhythm examples stay apart (DESIGN.md §9.1): no two side by side overlap, also on a 320 px
 * phone and in Dutch ("en" for "&"), where the staff is drawn smaller to make room.
 */
async function expectCountsApart(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.learn-rhythm:not(:has(svg))').count(), { message: 'every example is drawn' }).toBe(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const out = await page.locator('.learn-rhythm').evaluateAll((els) =>
    els.flatMap((el, k) => {
      const counts = [...el.querySelectorAll('.staff-counts text')].map((t) => ({ r: t.getBoundingClientRect(), text: t.textContent ?? '' }));
      return counts.flatMap((c, i) => {
        const a = counts[i - 1];
        const over = a && Math.abs(a.r.top - c.r.top) < 1 ? a.r.right - c.r.left : 0;
        return over > 0.5 ? [`example ${k + 1}: "${a.text}" and "${c.text}" overlap by ${over.toFixed(1)} px`] : [];
      });
    }),
  );
  expect(out, 'counts that overlap').toEqual([]);
}

/**
 * Learn's tables and diagrams keep their words apart (DESIGN.md §9.1), also on a 320 px phone and in Dutch: a table
 * row's name stays in its column, clear of its value (5.2's "Gepunteerde" ran over "2 + 1 = 3 tellen"); each beat's
 * word in 1.3 stays in its column ("halfzwaar" ran into "licht"); a step pattern or a row of letters stays on one line
 * inside its card (11.4's "W H W W W W" left its "H" alone below); and each count of a beat grid stays in its cell
 * (5.3's Dutch "(en)" ran over its outline).
 */
async function expectLearnWordsApart(page: Page, where = ''): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const out = await page.evaluate(() => {
    const lines = (el: Element): DOMRect[] => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].filter((r) => r.width > 0);
    };
    const left = (el: Element): number => Math.min(...lines(el).map((r) => r.left));
    const right = (el: Element): number => Math.max(...lines(el).map((r) => r.right));
    const table = [...document.querySelectorAll('.learn-table-row')].flatMap((row) => {
      const text = row.querySelector('.learn-table-text')!;
      const value = row.querySelector('.learn-table-value');
      const name = text.querySelector('b')!.textContent;
      if (right(text) > text.getBoundingClientRect().right + 0.5) return [`table: "${name}" runs out of its column`];
      return value && right(text) > left(value) - 2 ? [`table: "${name}" runs into "${value.textContent}"`] : [];
    });
    const beats = [...document.querySelectorAll('.learn-accent-row')].flatMap((row) => {
      const words = [...row.querySelectorAll('.learn-accent > span:last-child')];
      return words.flatMap((word, i) => {
        if (right(word) > word.parentElement!.getBoundingClientRect().right + 0.5) return [`beats: "${word.textContent}" runs out of its column`];
        return words[i + 1] && right(word) > left(words[i + 1]) - 2 ? [`beats: "${word.textContent}" runs into "${words[i + 1].textContent}"`] : [];
      });
    });
    const values = [...document.querySelectorAll('.learn-example-head .mono-accent, .learn-sig .mono-accent')].flatMap((value) => {
      const card = value.closest('.learn-section')!;
      const inside = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
      if (new Set(lines(value).map((r) => Math.round(r.top))).size > 1) return [`"${value.textContent}" breaks onto a second line`];
      return right(value) > inside + 0.5 ? [`"${value.textContent}" runs out of its card`] : [];
    });
    const grid = [...document.querySelectorAll('.learn-grid-cell')].flatMap((cell) => {
      const box = cell.getBoundingClientRect();
      return left(cell) < box.left + 1 || right(cell) > box.right - 1 ? [`beat grid: "${cell.textContent}" runs over its cell`] : [];
    });
    // A chapter's title in the previous / next cards wraps inside the card's padding (Dutch "herstellingstekens" ran
    // 10 px into it at 320 px).
    const nav = [...document.querySelectorAll('.learn-nav-link b')].flatMap((title) => {
      const card = title.closest('.learn-nav-link')!;
      const box = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      return left(title) < box.left + parseFloat(style.paddingLeft) - 0.5 || right(title) > box.right - parseFloat(style.paddingRight) + 0.5
        ? [`chapter link: "${title.textContent}" runs into its card's padding`]
        : [];
    });
    return [...table, ...beats, ...values, ...grid, ...nav];
  });
  expect(out, `${where} Learn words that run into each other`.trim()).toEqual([]);
}

/**
 * A side menu that scrolls on its own (DESIGN.md §9 Scrolling) shows the whole focus ring of each item, from the first
 * to the last with Tab and back with Shift+Tab. Tab scrolls the menu just far enough to show the item's box, and the
 * ring lies outside it (Learn's 11.5 lost its bottom edge on a 1280 × 800 screen).
 */
async function expectRingsInSideMenu(menu: Locator): Promise<void> {
  const items = menu.locator('a, button');
  const n = await items.count();
  await items.first().focus();
  for (const key of [...Array<string>(n - 1).fill('Tab'), ...Array<string>(n - 1).fill('Shift+Tab')]) {
    await menu.page().keyboard.press(key);
    const cut = await menu.evaluate((box) => {
      const el = document.activeElement!;
      if (!box.contains(el)) return 'the focus left the menu';
      const style = getComputedStyle(el);
      const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
      const r = el.getBoundingClientRect();
      const top = box.getBoundingClientRect().top + box.clientTop;
      return r.top - ring < top - 0.5 || r.bottom + ring > top + box.clientHeight + 0.5 ? `${el.textContent}: its ring is cut off` : null;
    });
    expect(cut, key).toBeNull();
  }
}

/**
 * A page that scrolls (DESIGN.md §9 Scrolling) shows the whole focus ring of each control on it, from the first to the
 * last with Tab and back with Shift+Tab. Tab scrolls the page just far enough to show the control's box, and the ring
 * lies outside it: Settings' Privacy row lost the bottom edge of its ring, and the language buttons the top edge on the
 * way back up. No box around the control cuts the ring off, on any side. The controls are those in the shell's main
 * box, which is what scrolls on some screens (the Scales hub on a phone on its side, desktop Home).
 */
async function expectRingsOnPage(page: Page): Promise<void> {
  await page.locator('main.shell-main').locator('a[href], button:not(:disabled)').first().focus();
  const check = (): Promise<string | null> =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el?.closest('main.shell-main')) return 'left';
      if (!el.matches(':focus-visible')) return null;
      const style = getComputedStyle(el);
      const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
      const r = el.getBoundingClientRect();
      for (let box = el.parentElement; box; box = box.parentElement) {
        const o = getComputedStyle(box);
        const b = box.getBoundingClientRect();
        const [left, top] = [b.left + box.clientLeft, b.top + box.clientTop];
        const cut =
          (o.overflowX !== 'visible' && (r.left - ring < left - 0.5 || r.right + ring > left + box.clientWidth + 0.5)) ||
          (o.overflowY !== 'visible' && (r.top - ring < top - 0.5 || r.bottom + ring > top + box.clientHeight + 0.5));
        if (cut) return `${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)}: its ring is cut off by ${box.tagName.toLowerCase()}.${box.className}`;
      }
      return null;
    });
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press(key);
      const cut = await check();
      if (cut === 'left') break;
      expect(cut, key).toBeNull();
    }
  }
}

/**
 * A screen's head keeps its title whole beside what is next to it (DESIGN.md §9): the title's words fit its box, and
 * nothing in the head runs past its right edge (Dutch on a 320 px phone: "Toonladders" beside "Over toonladders", and
 * Progress's streak chip beside "Voortgang").
 */
async function expectHeadFits(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const out = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen-head, .prog-title-row')]
      .filter((head) => head.offsetParent !== null)
      .flatMap((head) => {
        const right = head.getBoundingClientRect().right;
        return [...head.querySelectorAll<HTMLElement>(':scope > *, .screen-title')].flatMap((el) => {
          const name = (el.textContent ?? '').trim() || el.tagName.toLowerCase();
          if (el.scrollWidth > el.clientWidth + 1) return [`${name}: runs out of its box`];
          return el.getBoundingClientRect().right > right + 0.5 ? [`${name}: runs past the head`] : [];
        });
      }),
  );
  expect(out, 'screen heads').toEqual([]);
}

/**
 * A number stays on the line of the word after it where a Progress line wraps: an achievement's name in its narrow
 * column ("Played at 160" over "BPM" once) and the Skill levels link ("· 1" over "review due", Dutch "· 6" over
 * "vaardigheden").
 */
async function expectCountsWithWords(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const out = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.prog-badge-name, .prog-skills-text > span')]
      .filter((el) => el.offsetParent !== null)
      .flatMap((el) => {
        const split: string[] = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walk.nextNode() as Text | null; node; node = walk.nextNode() as Text | null) {
          // The number's last digit and the first letter of the word after it: on one line, or the number ends a line.
          for (const m of node.data.matchAll(/\d+\s(?=\S)/g)) {
            const top = (at: number): number => {
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + 1);
              return range.getBoundingClientRect().top;
            };
            const end = m.index + m[0].length;
            if (Math.abs(top(end - 2) - top(end)) > 1) split.push(`"${el.textContent}": ${m[0].trim()} ends a line`);
          }
        }
        return split;
      }),
  );
  expect(out, 'numbers split from their words').toEqual([]);
}

/**
 * What's new keeps its words in their boxes: each kind chip holds its word (Dutch OPGELOST is longer than FIXED), each
 * row of the desktop list holds its title and line (in Dutch a line on two lines ran into the next row), and the
 * latest card's title keeps clear of the staff drawing in its corner.
 */
async function expectChangelogFits(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const out = await page.evaluate(() => {
    const chips = [...document.querySelectorAll<HTMLElement>('.cl-kind')]
      .filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `chip ${el.textContent}: wider than its box`);
    const rows = [...document.querySelectorAll<HTMLElement>('.cl-nav-item')].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const text = el.querySelector('.cl-release-text')!.getBoundingClientRect();
      return text.top < r.top - 0.5 || text.bottom > r.bottom + 0.5 ? [`row ${el.querySelector('.cl-ver')!.textContent}: its text runs out of the row`] : [];
    });
    const staff = document.querySelector('.cl-card-staff')?.getBoundingClientRect();
    const head = document.querySelector<HTMLElement>('.cl-card--latest .cl-card-head');
    const end = head ? head.getBoundingClientRect().right - parseFloat(getComputedStyle(head).paddingRight) : 0;
    return [...chips, ...rows, ...(staff && end > staff.left + 0.5 ? [`the latest title can run ${(end - staff.left).toFixed(0)} px under the staff`] : [])];
  });
  expect(out, "what's new").toEqual([]);
}

/** Nothing on a staff is cut off at the top of its svg, such as a triplet's 3 over the first row. */
async function expectStaffNotCut(svg: Locator): Promise<void> {
  const top = (): Promise<number> =>
    svg.evaluate((el) => Math.min(...[...el.querySelectorAll('path, rect')].map((p) => (p as SVGGraphicsElement).getBBox().y)));
  await expect.poll(top, { message: 'the top of the notation, in the svg' }).toBeGreaterThanOrEqual(0);
}

/**
 * Every bar of a rhythm staff has room for its notes (DESIGN.md §9): each note, with its dot and flag, ends before the
 * bar line that closes its bar, and nothing runs past the drawing's edge, where the svg cuts it off.
 */
async function expectBarsFit(svg: Locator): Promise<void> {
  const wrong = (): Promise<string[]> =>
    svg.evaluate((el) => {
      const right = (g: Element): number => {
        const b = (g as SVGGraphicsElement).getBBox();
        return b.x + b.width;
      };
      const width = (el as SVGSVGElement).viewBox.baseVal.width;
      const out = new Set<string>();
      let bar = 0;
      let lines = 0;
      let line = width;
      for (const g of el.children) {
        if (g.matches('.vf-stave')) [bar, lines] = [bar + 1, 0];
        // Each stave draws the bar line that opens its bar, then the one closing it (the final barline: its thin line).
        else if (g.matches('.vf-stavebarline') && ++lines === 2) line = Number(g.querySelector('rect')?.getAttribute('x'));
        else if (g.matches('.vf-stavenote') && right(g) >= line) out.add(`bar ${bar}: a note runs into its bar line`);
        if (g.matches('.vf-stavenote, .vf-beam, .vf-tuplet') && right(g) > width) out.add(`bar ${bar}: cut off at the staff's edge`);
      }
      return [...out];
    });
  await expect.poll(wrong, { message: 'notes outside their bars' }).toEqual([]);
}

/** A free-practice run that Play restores (sessionStorage): the same exercise every time for one seed. */
async function seedRun(page: Page, settings: object, runSeed: number, prefs: object = {}): Promise<void> {
  await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap', ...prefs } });
  await page.addInitScript((run) => sessionStorage.setItem('muzieklab.run.v1', JSON.stringify(run)), { settings, seed: runSeed, lessonId: null, daily: null });
}

/**
 * Each key's names on the Key screen fit beside its key signature (DESIGN.md §11): the bold major name and the minor
 * name under it end inside their box, before the button's padding ("C♭ majeur" once ran into the border at 320 px).
 */
async function expectKeyNamesFit(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const over = await page.locator('.key-btn-text > *').evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => `${el.textContent}: ${el.scrollWidth} px in ${el.clientWidth}`),
  );
  expect(over, 'key names wider than their box').toEqual([]);
}

/**
 * The Scales hub's key signature, under the small staff in the circle's centre, reads whole: no sign of it sits under a
 * key of the inner ring or the selected key's halo (seven signs once ran under the minor ring's f and c♯).
 */
async function expectSigUncovered(page: Page): Promise<void> {
  // Once the halo has moved to the new key (it slides across the centre) and the keys have their new size.
  await page.evaluate(() => Promise.all([document.fonts.ready, ...document.getAnimations().map((a) => a.finished)]).then(() => undefined));
  const covered = await page.locator('.circle-sig').evaluate((sig) => {
    sig.scrollIntoView({ block: 'center' });
    const text = sig.firstChild as Text;
    const out: string[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text.data[i] === ' ') continue;
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const r = range.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top?.closest('.circle-key, .circle-halo')) out.push(`${text.data[i]} (${i})`);
    }
    return out;
  });
  expect(covered, 'signs under a key of the circle').toEqual([]);
}

/**
 * Every key of the circle, on both rings, takes taps 44 px across and down through its middle (DESIGN.md §11), or,
 * where its ring has no room for that (the inner ring on a phone under 390 px wide), as far as the next key; and its
 * middle is its own. Counted px by px, as expectHitHeight does.
 */
async function expectCircleTargets(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all([document.fonts.ready, ...document.getAnimations().map((a) => a.finished)]).then(() => undefined));
  const short = await page.locator('.circle').evaluate((circle) => {
    const out: string[] = [];
    for (const ring of ['major', 'minor']) {
      const keys = [...circle.querySelectorAll<HTMLElement>('.circle-key--' + ring)];
      keys.forEach((key, i) => {
        key.scrollIntoView({ block: 'center', inline: 'center' });
        const mid = (el: Element): { x: number; y: number } => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const c = mid(key);
        const next = mid(keys[(i + 1) % keys.length]);
        const need = Math.min(44, Math.floor(Math.hypot(next.x - c.x, next.y - c.y)));
        const on = (x: number, y: number): boolean => {
          const top = document.elementFromPoint(x, y);
          return !!top && (top === key || key.contains(top));
        };
        let across = 0;
        let down = 0;
        for (let d = -40; d < 40; d++) {
          if (on(c.x + d + 0.5, c.y)) across++;
          if (on(c.x, c.y + d + 0.5)) down++;
        }
        const name = key.getAttribute('aria-label')!.split(':')[0];
        if (!on(c.x, c.y)) out.push(`${ring} ${name}: its middle is another's`);
        else if (Math.min(across, down) < need - 1) out.push(`${ring} ${name}: ${Math.min(across, down)} px of ${need}`);
      });
    }
    return out;
  });
  expect(short, 'circle keys that take taps over too small an area').toEqual([]);
}

/**
 * The computer keys that answer a scale up and down: the piano's (A S D … on the white keys, W E R … on the black) or
 * the signs' (− 0 = X).
 */
function upDownKeys(s: Scale, input: string): string[] {
  const w = pianoWindow(s);
  return scaleNotes(s, 'upDown').map((n) =>
    input !== 'piano' ? ['-', '0', '=', 'x'][n.alter + 1] : w.whites.includes(n.midi) ? 'ASDFGHJKL'[w.whites.indexOf(n.midi)] : 'WERTYUIO'[w.blacks.find((b) => b.midi === n.midi)!.after - 1],
  );
}

/**
 * A Scales round of one scale up and down, just started, answered to the end: the first note wrong, a Hint, the second
 * note wrong (a why of two lines on a phone), then the rest, and the done line with all 15 notes. Each time the
 * feedback changes, a portrait phone or tablet fits with the answer buttons in view (DESIGN.md §9), so does a desktop
 * window 800 px tall or more, and a phone in landscape fits too, with the feedback and Skip to summary whole in its left
 * column and room under Skip for its focus ring.
 */
async function answerUpAndDown(page: Page, name: ViewportName, scale: Scale, input: string, words: { hint: string; next: RegExp; skip: string }): Promise<void> {
  const { width, height } = VIEWPORTS[name];
  const portrait = width < 1100 && height > width;
  const landscape = width < 1100 && height < width;
  // Desktop fits from 800 px tall; a laptop's shorter window scrolls (DESIGN.md §9).
  const desk = width >= 1100 && height >= 800;
  const inPlace = { scroll: !portrait };
  const feedback = page.locator('.nfeedback');
  const hint = page.getByRole('button', { name: words.hint, exact: true });
  const check = async (): Promise<void> => {
    if (portrait || desk) await expectFits(page);
    // A phone on its side fits too, with the feedback and Skip to summary in its left column.
    if (landscape) {
      await expectFits(page);
      await expect(feedback, 'the feedback is in view').toBeInViewport({ ratio: 1 });
      await expectSkipWhole(page, words.skip);
    }
    if (input !== 'piano') await expectClickable(hint, inPlace);
  };
  const keys = upDownKeys(scale, input);
  const wrong = (k: string): string => (input === 'piano' ? (k === 'A' ? 'S' : 'A') : k === '-' ? '0' : '-');
  await page.keyboard.press(wrong(keys[0]));
  await expect(feedback).toHaveClass(/is-wrong/);
  await check();
  if (input !== 'piano') {
    await hint.click();
    await expect(feedback).toHaveClass(/is-hint/);
    await check();
  }
  await page.keyboard.press(keys[0]);
  await page.keyboard.press(wrong(keys[1]));
  await expect(feedback).toHaveClass(/is-wrong/);
  await check();
  for (const k of keys.slice(1)) await page.keyboard.press(k);
  await expect(feedback).toHaveClass(/is-right/);
  // The done line names the 15 notes (where the degree rows show them instead, not on screen; screen readers hear them
  // in the line said, beside it).
  await expect(feedback.locator('.nfeedback-notes')).toHaveText(/^(\S+ ){14}\S+$/);
  await expect(page.locator('.nfeedback + [aria-live]')).toHaveText(/\. ([^,]+, ){14}[^,]+$/);
  await check();
  // With its mistakes the scale comes back at the end of the round: the main button is Next scale.
  await expectClickable(page.getByRole('button', { name: words.next }), inPlace);
}

/**
 * Skip to summary is whole on the screen without scrolling, with room under it for its focus ring (3 px, 2 px away): in
 * a phone's landscape column Scales ran past the screen and cut it, and Tab scrolled it flush with the edge.
 */
async function expectSkipWhole(page: Page, label = 'Skip to summary'): Promise<void> {
  const skip = page.getByRole('button', { name: label });
  await expectClickable(skip, { scroll: false });
  const room = await skip.evaluate((el) => el.closest('.page')!.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
  expect(room, 'room under Skip to summary for its focus ring').toBeGreaterThanOrEqual(5);
}

/**
 * A phone 360 px tall on its side (740 × 360) still scrolls Scales' left column a little (DESIGN.md §9): Tab to Skip to
 * summary scrolls it to its end, with room under Skip for its focus ring. The scroll ended flush with Skip's bottom
 * edge, which cut the ring's lower 5 px. The test's own size again after.
 */
async function expectSkipRingOnShorterPhone(page: Page, label = 'Skip to summary'): Promise<void> {
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 740, height: 360 });
  const skip = page.getByRole('button', { name: label });
  await tabTo(page, skip);
  const room = await skip.evaluate((el) => Math.min(el.closest('.page')!.getBoundingClientRect().bottom, window.innerHeight) - el.getBoundingClientRect().bottom);
  expect(room, 'room under Skip to summary for its focus ring at 740 × 360').toBeGreaterThanOrEqual(5);
  await skip.blur();
  await page.setViewportSize(size);
}

/**
 * Tablet Play with 16 bars on a tablet on its side in Safari, under its bars: a 9.7" iPad (1024 × 694) and a 10.2" one
 * (1080 × 736) get the tablet layout, under 760 px tall. Two staff rows, a timing lane of four and the pad fit, with Skip
 * to results in view; it was under the window's edge, where nothing scrolls (DESIGN.md §9).
 */
async function expectShortTabletFits(page: Page): Promise<void> {
  for (const size of [{ width: 1080, height: 736 }, { width: 1024, height: 694 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('.tplay-staff')).toBeInViewport({ ratio: 1 });
    await expectClickable(pad(page), { scroll: false });
    await expectTouchHeight(pad(page));
    await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
    await expectFits(page);
  }
}

/** Every screen's main action can be reached and tapped, at every supported size, with no sideways scroll. */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(name, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });

    const desktopLayout = VIEWPORTS[name].width >= 1100;
    const tabletLayout = VIEWPORTS[name].width >= 700 && !desktopLayout;
    /**
     * Phone and tablet in portrait, a phone browser's short screen too: Read notes and Scales fit, so their controls are
     * checked where they are, without scrolling (DESIGN.md §9). A phone in landscape lays them out in two columns, which
     * the tests that need it check on their own (`name === 'phone-landscape'`); desktop has its own layout.
     */
    const portraitLayout = !desktopLayout && VIEWPORTS[name].height > VIEWPORTS[name].width;
    const inPlace = { scroll: !portraitLayout };
    /**
     * Desktop Read notes and Scales fit a window 800 px tall or more (1280 × 800, a tablet on its side); a laptop's
     * shorter one scrolls (DESIGN.md §9, Short desktop windows).
     */
    const deskFits = desktopLayout && VIEWPORTS[name].height >= 800;

    test('home: start the first lesson and free practice', async ({ page }) => {
      known(name, 'home');
      await page.goto('./');
      // Nothing played yet: the card starts lesson 1.1, sol (no "Continue"), with the note on the staff and no meter,
      // bars or tempo.
      await expect(page.getByText('Unit 1 · Lesson 1 of 5', { exact: true })).toBeVisible();
      await expect(page.locator('.continue-card')).not.toContainText('BPM');
      // A new English player reads letters: sol is G.
      await expect(page.getByRole('img', { name: 'The notes so far: G' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Start lesson' }));
      // It is the one filled button on Home: the daily challenge's is outlined.
      await expect(page.locator('.home-desk, .home').locator('.btn--accent, .btn--ink')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Play the daily challenge for / })).toHaveClass(/btn--outline/);
      await expectClickable(page.getByRole('link', { name: /^Rhythm/ }));
      await expectClickable(page.getByRole('link', { name: /^Read notes/ }));
      await expectClickable(page.getByRole('link', { name: /^Scales/ }));
      // Tablet and desktop: the tabs sit in a top header (DESIGN.md §9), on desktop too, not in a sidebar.
      if (VIEWPORTS[name].width >= 700) await expect(page.getByRole('banner').getByRole('navigation', { name: 'Main' })).toBeVisible();
      // Tablet: the staff box keeps the height of its one line of notes instead of stretching down the tall screen.
      if (tabletLayout) expect((await page.locator('.continue-staff').boundingBox())!.height).toBeLessThan(200);
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.continue-card'));
      await expectNoSideScroll(page);
    });

    test('home: the level chip and its sheet, and the daily challenge', async ({ page }) => {
      known(name, 'home-daily');
      await page.goto('./');
      await expectClickable(page.getByRole('button', { name: /^Play the daily challenge for / }));
      await expect(page.locator('.daily-card')).toContainText('4 bars · new every day');
      await expectNoOverlap(page.locator('.continue-card'), page.locator('.daily-card'));
      await expectNoOverlap(page.locator('.daily-card'), page.locator('.free'));
      await expectNotSqueezed(page.locator('.daily-card'));
      if (desktopLayout) {
        // Desktop keeps its level card (DESIGN.md §9), with one label under the XP bar.
        await expect(page.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
        await expect(page.getByText('100 XP to level 2')).toBeVisible();
      } else {
        // Phone and tablet: a level chip beside the streak opens the level details.
        await expect(page.getByRole('img', { name: /^XP bar/ })).toHaveCount(0);
        const chip = page.getByRole('button', { name: 'Level 1' });
        await expectClickable(chip);
        await chip.click();
        const sheet = page.getByRole('dialog', { name: 'Level 1 · Tick' });
        await expect(sheet.getByText('Count at level 3')).toBeVisible();
        await expect(sheet.getByRole('img', { name: 'XP bar: 0 of 100' })).toBeVisible();
        await expect(sheet.getByText('100 XP to level 2')).toBeVisible();
        await expectClickable(sheet.getByRole('button', { name: 'Close' }));
        await expectNoClippedLabels(page);
        await sheet.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(chip).toBeFocused();
      }
      await expect(page.getByText(/\/ 100 XP/)).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test("home: the level sheet's rank ladder has a › between ranks, never at the start of a line or on the current rank's pill", async ({ page }) => {
      test.skip(desktopLayout, 'desktop has the level card instead of the chip and its sheet');
      for (const language of ['en', 'nl'] as const) {
        // Level 8, Groove: the current rank in the middle of a ladder that wraps on a phone.
        await seed(page, { progress: { xp: 1780 }, prefs: { language } });
        await page.goto('about:blank');
        await page.goto('./');
        await page.locator('.level-chip').click();
        const ranks = page.getByRole('dialog').locator('.ranks');
        await expect(ranks.locator('[aria-current="step"]')).toHaveText('Groove');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const wrong = await ranks.evaluate((ol) => {
          const out: string[] = [];
          const items = [...ol.children] as HTMLElement[];
          items.forEach((li, i) => {
            // Nothing but its words in a rank's box (the pill of the current one): a › drawn in it before them starts
            // the line it wraps to, and sits on the pill.
            const s = getComputedStyle(li);
            const box = li.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(li);
            const words = range.getBoundingClientRect();
            const before = words.left - box.left - parseFloat(s.paddingLeft);
            const after = box.right - parseFloat(s.paddingRight) - words.right;
            if (before > 1 || after > 1) out.push(`${li.textContent}: ${Math.round(before)} px before its words, ${Math.round(after)} px after them`);
            const sep = getComputedStyle(li, '::after').content;
            if (i < items.length - 1 && !sep.includes('›')) out.push(`${li.textContent}: no › after it`);
          });
          return out;
        });
        expect(wrong, `${language}: the ladder's ranks`).toEqual([]);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      }
    });

    test('home: the daily challenge card once it is played, in English and Dutch: every word inside its column', async ({ page }) => {
      known(name, 'home-daily-done');
      await page.clock.setFixedTime(new Date('2026-10-27T10:00:00'));
      // 31 Perfect and 1 Great: 99.69% shows 99%, rounded down, as 100% is only the diamond's (§6.3).
      const progress = { lessons: {}, practiceDays: ['2026-10-27'], daily: { day: '2026-10-27', tier: 1, stars: 4, accuracy: 99.6875 } };
      for (const [language, again, done] of [['en', 'Play again', 'Done today · 99%'], ['nl', 'Nog een keer', 'Vandaag gedaan · 99%']] as const) {
        await seed(page, { prefs: { language }, progress });
        await page.goto('./');
        await expect(page.locator('.daily-done')).toHaveText(done);
        // The longer label: at 320 px it left the text a column of 62 px (40 px in Dutch), narrower than its words.
        await expect(page.locator('.daily-btn')).toHaveText(again);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const past = await page.locator('.daily-text').evaluate((col) => {
          const right = col.getBoundingClientRect().right;
          const words: string[] = [];
          const walk = document.createTreeWalker(col, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
              const r = document.createRange();
              r.setStart(n, m.index!);
              r.setEnd(n, m.index! + m[0].length);
              if (r.getBoundingClientRect().right > right + 1) words.push(m[0]);
            }
          }
          return words;
        });
        expect(past, `${language}: words past the text column`).toEqual([]);
        await expectNoOverlap(page.locator('.daily-text'), page.locator('.daily-btn'));
        await expectNotSqueezed(page.locator('.daily-card'));
        await expectClickable(page.locator('.daily-btn'));
        await expectNoSideScroll(page);
      }
    });

    test('home and path: lesson stars, with the diamond as four diamond stars', async ({ page }) => {
      known(name, 'home-stars');
      // Sol's unit passed; rhythm unit 1 (the path's unit 2) with a diamond, a 4th star and two stars.
      const lessons = { ...SOL_DONE, '1.1': { stars: 5, bestAccuracy: 100 }, '1.2': { stars: 4, bestAccuracy: 97 }, '1.3': { stars: 2, bestAccuracy: 80 } };
      await seed(page, { progress: { lessons }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./');
      await expect(page.getByText('Continue · Unit 2 · Lesson 4 of 5', { exact: true })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Continue lesson' }));
      const tiles = page.locator(desktopLayout ? '.path-card .tile' : '.continue-card .tile');
      await expect(tiles.nth(0).locator('.diamond-star')).toHaveCount(4);
      await expect(tiles.nth(1)).toContainText('★★★★');
      await expect(tiles.nth(2)).toContainText('★★☆');
      if (desktopLayout) {
        await expect(page.getByRole('img', { name: 'Diamond: every note perfect' })).toBeVisible();
        await expect(page.getByText('Next: lesson 2.4 · A little faster · 80 BPM')).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Play lesson 2.1, Diamond: every note perfect' })).toBeVisible();
      }
      await page.goto('./#/path');
      const diamond = page.getByRole('button', { name: 'Play lesson 2.1 · Quarter notes: Diamond: every note perfect' });
      await expect(diamond.locator('.diamond-star')).toHaveCount(4);
      await expect(page.getByRole('button', { name: 'Play lesson 2.2 · Half notes: 3 of 3 stars and the bonus 4th star' })).toContainText('★★★★');
      await expectNoSideScroll(page);
    });

    test('home: a note lesson that starts in another clef and key shows its notes on their own staff', async ({ page }) => {
      known(name, 'home-note-preview');
      // Lesson 25.3 reads B♭ and E♭ major in both clefs, and its round starts with bass notes in E♭: the card drew them
      // under a treble staff in B♭, the lesson's first clef and key.
      await seed(page, { progress: { lessons: pathUpTo('25.2') }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./');
      await expect(page.getByText('Continue · Unit 25 · Lesson 3 of 5', { exact: true })).toBeVisible();
      await expect(page.locator('.continue-card').getByRole('img', { name: 'A few notes from the lesson: bass clef, E♭ major' })).toBeVisible();
      await expectStavesFit(page);
      await expectNoSideScroll(page);
    });

    test('path: a unit of four-star lessons keeps its stars in its column', async ({ page }) => {
      known(name, 'path-stars');
      // Four stars (the diamond, or the 4th star) are wider than three: a unit's five do not fit on one line at 320 px.
      const four = { stars: 4, bestAccuracy: 97 };
      const diamond = { stars: 5, bestAccuracy: 100 };
      await seed(page, { progress: { lessons: { ...SOL_DONE, '1.1': diamond, '1.2': diamond, '1.3': four, '1.4': diamond, '1.5': four } }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await expect(page.getByRole('button', { name: /^Play lesson 2\.5 · / })).toBeVisible();
      const out = await page.locator('.unit-stars').evaluateAll((rows) =>
        rows.flatMap((row) => {
          const right = row.closest('.unit-body')!.getBoundingClientRect().right;
          return [...row.children].filter((el) => el.getBoundingClientRect().right > right + 1).map((el) => el.getAttribute('aria-label'));
        }),
      );
      expect(out, 'stars past their unit').toEqual([]);
      // A tap on a lesson's stars opens that lesson, and so does one halfway down to a second line: the lines are 30 px
      // apart, so one line's 44 px area (4 px above its stars, 25 px below) never lies over the other's.
      const last = page.getByRole('button', { name: /^Play lesson 2\.5 · / });
      await last.scrollIntoViewIfNeeded();
      const missed = await last.locator('xpath=..').evaluate((row) => {
        const stars = [...row.querySelectorAll<HTMLElement>('button.lesson-stars')];
        return stars.flatMap((el) => {
          const r = el.getBoundingClientRect();
          const below = stars.map((o) => o.getBoundingClientRect()).find((o) => o.top > r.bottom);
          const x = r.left + r.width / 2;
          const ys = [r.top + 1, r.bottom - 1, ...(below ? [(r.bottom + below.top) / 2 - 1] : [])];
          return ys
            .filter((y) => document.elementFromPoint(x, y)?.closest('.lesson-stars') !== el)
            .map((y) => `${el.getAttribute('aria-label')} at ${Math.round(y - r.top)} px`);
        });
      });
      expect(missed, 'taps that open another lesson').toEqual([]);
      // Each lesson's stars are a 44 px tap under their unit's head, which keeps its own 44 px and opens the unit.
      for (const stars of await page.locator('button.lesson-stars').all()) await expectHitHeight(stars);
      for (const head of await page.locator('button.unit-head[aria-expanded="false"]').all()) await expectHitHeight(head);
      await expectNoSideScroll(page);
    });

    test('setup: start button', async ({ page }) => {
      known(name, 'setup');
      await page.goto('./#/setup');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectClickable(page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }));
      // Only the time signatures that can be played: no disabled "6/8 soon" chip.
      await expect(page.getByRole('button', { name: /6\/8/ })).toHaveCount(0);
      await expectTouchHeight(page.getByRole('button', { name: 'More options' }));
      // Tablet and desktop: the options on the left, the preview and Start in a side panel beside them.
      if (desktopLayout || tabletLayout) await expectBeside(page.locator('.wide-main'), page.locator('.wide-side'));
      await expectNoSideScroll(page);

      // With Triplets on, the preview keeps room for a 3 whether its bar has a triplet or not (80 + 12): every change of
      // the settings draws a new bar, and the card keeps one height.
      await seed(page, { progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, meters: ['2/4'], notes: ['quarter', 'eighth'], triplets: true, bars: 4 } } });
      await page.reload();
      const preview = page.locator('.preview-card svg:has(.vf-stave)');
      for (const next of ['Echo', 'Tap', 'Echo', 'Tap', 'Echo', 'Tap', 'Echo', 'Tap']) {
        await expect(preview).toHaveAttribute('viewBox', /^0 0 [\d.]+ 92$/);
        await expectStaffNotCut(preview);
        await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: next }).click();
      }
      await expectNoSideScroll(page);
    });

    test('setup: More options keeps each label whole, clear of its control, in English and Dutch', async ({ page }) => {
      known(name, 'setup-more');
      for (const language of ['en', 'nl']) {
        await seed(page, { prefs: { language } });
        await page.goto('./#/setup');
        // Open, or still open from the round before.
        const toggle = page.locator('.more-toggle');
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await expect(page.locator('#setup-more')).toHaveCSS('opacity', '1');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // At 320 px the labels were squeezed to 30 px beside the 238 px controls, which painted over them (Metron…).
        const covered = await page.locator('.more-row').evaluateAll((rows) =>
          rows.flatMap((row) => {
            const label = row.querySelector('.more-label')!;
            const text = document.createRange();
            text.selectNodeContents(label);
            const [t, c] = [text.getBoundingClientRect(), row.querySelector('.seg')!.getBoundingClientRect()];
            const over = t.right > c.left + 0.5 && t.left < c.right && t.bottom > c.top && t.top < c.bottom;
            return label.scrollWidth > label.clientWidth + 1 || over ? [label.textContent] : [];
          }),
        );
        expect(covered, `${language}: labels cut off or under their controls`).toEqual([]);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      }
    });

    test('setup: the tempo value stays whole, and the Bars and Tempo labels level', async ({ page }) => {
      known(name, 'setup-tempo');
      await page.goto('./#/setup');
      const tempo = page.locator('#tempo');
      for (const bpm of ['40', '112', '200']) {
        await tempo.fill(bpm);
        await expect(page.locator('.label-value')).toContainText(`${bpm} BPM`);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const m = await page.evaluate(() => {
          const value = document.querySelector('.label-value')!;
          const text = document.createRange();
          text.selectNodeContents(value);
          const box = (sel: string): DOMRect => document.querySelector(sel)!.getBoundingClientRect();
          return {
            lines: new Set([...text.getClientRects()].map((r) => Math.round(r.top))).size,
            labels: Math.abs(box('#bars-label').top - box('label[for=tempo]').top),
            over: value.getBoundingClientRect().right - box('.bars-tempo .field--grow').right,
          };
        });
        // At 320 px "112 BPM · Moderato" does not fit beside Tempo: it takes a line of its own, whole, not "112 BPM ·" and
        // "Moderato" with the Bars label pushed down beside it.
        expect(m.lines, `${bpm} BPM on one line`).toBe(1);
        expect(m.labels, 'Bars and Tempo level').toBeLessThanOrEqual(1);
        expect(m.over, 'the value inside its column').toBeLessThanOrEqual(1);
      }
      await expectNoSideScroll(page);
    });

    test('echo: listen, then the tap-back card and the pad', async ({ page }) => {
      known(name, 'echo');
      await page.goto('./#/setup');
      await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Echo' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      // Before the path teaches holding, Echo is tap only too: How to play does not ask to hold.
      await expect(page.getByRole('dialog', { name: 'How to play' }).getByText(/Only when each note starts counts/)).toBeVisible();
      // Esc closes it at every size, as Play's How to play (a keyboard on a phone or tablet too), and ? opens it again.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('muzieklab.prefs.v1') ?? '{}').seenEchoHowTo)).toBe(true);
      await page.keyboard.press('?');
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Play the rhythm' }), { scroll: false });
      await expectNotSqueezed(page.locator('.echo-card'));
      if (!desktopLayout) {
        // The listen card and the pad both in view, also in a phone browser (DESIGN.md §9).
        await expect(pad(page)).toBeInViewport({ ratio: 1 });
        await expectTouchHeight(pad(page));
        await expectFits(page);
      }
      // Tablet and desktop: Play's layout while listening too, so the screen looks the same once the tapping starts: the
      // exercise header, the listen card where the staff goes, and the pad (not taking taps yet).
      if (desktopLayout || (tabletLayout && portraitLayout)) {
        await expect(page.locator('.dplay-head .brand')).toBeVisible();
        await expect(page.locator('.dplay-title .mono-line')).toHaveText(/^Listen · 4\/4 · /);
        await expectClickable(page.getByRole('link', { name: 'Quit' }), { scroll: false });
        await expect(page.locator(desktopLayout ? '.dplay-staff .echo-card' : '.tplay-staff .echo-card')).toBeVisible();
        await expect(pad(page)).toBeDisabled();
        await expect(page.getByRole('img', { name: 'Beats 1 to 4' })).toBeVisible();
        if (tabletLayout) expect((await pad(page).boundingBox())!.height, 'the pad fills the tablet').toBeGreaterThan(300);
      }
      await expectNoSideScroll(page);
    });

    test('path: start lesson', async ({ page }) => {
      known(name, 'path');
      await page.goto('./#/path');
      await expectClickable(page.getByRole('button', { name: /^Start lesson/ }));
      await expectNoSideScroll(page);
    });

    test('path: all done, its button plays the last lesson again and says so, as Home does, in English and Dutch', async ({ page }) => {
      known(name, 'path-done');
      for (const [language, again, done] of [
        ['en', 'Play lesson 26.5 again', 'All done · 260 / 390 ★'],
        ['nl', 'Speel les 26.5 nog een keer', 'Alles klaar · 260 / 390 ★'],
      ] as const) {
        await seed(page, { progress: { lessons: pathUpTo('26.5') }, prefs: { language } });
        await page.goto('about:blank');
        await page.goto('./#/path');
        await expect(page.locator('.track-info').getByText(done)).toBeVisible();
        await expectClickable(page.getByRole('button', { name: again }));
        await expect(page.getByRole('button', { name: /^(Start lesson|Begin les)/ })).toHaveCount(0);
        // The last unit's node: its word from the catalog (Mix is Dutch too), not its message key.
        await expect(page.locator('.units > li').last().locator('.unit-node')).toHaveText('Mix');
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      }
    });

    test('path: one path, a unit open with its lessons by name, notes and rhythm taking turns', async ({ page }) => {
      known(name, 'path-tracks');
      await page.goto('./#/path');
      // One path since 0.11.0: no switcher.
      await expect(page.getByRole('group', { name: 'Paths' })).toHaveCount(0);
      await expect(page.getByText('Unit 1 of 26 · 0 / 390 ★')).toBeVisible();
      // A screen reader hears the unit too, not only the stars.
      await expect(page.getByRole('img', { name: 'Unit 1 of 26, 0 of 390 stars' })).toBeVisible();
      const theory = page.getByRole('link', { name: 'Theory: Learn' });
      await expectClickable(theory);
      await expectTouchHeight(theory);
      // Its ring, beyond the 32 px line, stays clear of the stars when the line wraps (320 px), and is lifted above the
      // units under it, whose current node's halo would paint over it.
      await expectFocusRing(theory);
      const ringHits = await theory.evaluate((node) => {
        const style = getComputedStyle(node);
        const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const r = node.getBoundingClientRect();
        const s = node.parentElement!.firstElementChild!.getBoundingClientRect();
        if (s.bottom > r.top - ring && s.top < r.bottom + ring && s.right > r.left - ring && s.left < r.right + ring) return 'the stars';
        return style.position === 'static' || style.zIndex === 'auto' ? 'the units (it is not lifted)' : null;
      });
      expect(ringHits, 'the focus ring runs into').toBeNull();
      // The current unit is open: sol's lessons by name, the first one to play.
      const sol = page.getByRole('button', { name: /^1 · Sol: the G line/ });
      await expect(sol).toHaveAttribute('aria-expanded', 'true');
      await expectClickable(page.getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' }));
      await expect(page.getByRole('img', { name: 'Lesson 1.2 · Write sol, locked' })).toBeVisible();
      // Then rhythm, then the next note.
      const units = page.getByRole('list', { name: 'Units' });
      await expect(units.getByText('2 · Quarter and half notes')).toBeVisible();
      await expect(units.getByText('3 · Mi: the bottom line')).toBeAttached();
      // What opens the locked units is said once, under the first; no Next line repeats Start.
      await expect(units.getByText('Opens with 2 stars on every unit 1 lesson')).toHaveCount(1);
      await expect(units.getByText(/^Opens with/)).toHaveCount(1);
      await expect(units.getByText(/^Next: lesson/)).toHaveCount(0);
      await expectClickable(page.getByRole('button', { name: 'Start lesson 1.1' }));
      // Checked before a unit opens or closes: its chevron turns, which overflows the header for a moment.
      await expectNoClippedLabels(page);
      // Closing the open unit shows its lessons as stars again.
      await sol.click();
      await expect(sol).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#unit-1')).toBeHidden();
      await expect(page.locator('.unit-stars').getByRole('button', { name: 'Play lesson 1.1 · Meet sol: 0 of 3 stars' })).toBeVisible();
      // A tap low on the header, right above the stars, opens the unit (it does not start lesson 1.1).
      const headBox = (await sol.boundingBox())!;
      await sol.click({ position: { x: 30, y: headBox.height - 5 } });
      await expect(sol).toHaveAttribute('aria-expanded', 'true');
      await expect(page).toHaveURL(/#\/path$/);
      await expectNoSideScroll(page);
    });

    test('settings: leniency and reset progress', async ({ page }) => {
      known(name, 'settings');
      await page.goto('./#/settings');
      await expectClickable(page.getByText('Leniency', { exact: true }));
      // Leniency in words, not milliseconds; one Metronome row (the volume), the look is the Beat counter.
      await expect(page.getByText('Fair timing for most players.')).toBeVisible();
      await expect(page.getByText('Metronome', { exact: true })).toHaveCount(1);
      await expectClickable(page.getByRole('group', { name: 'Beat counter style' }).getByRole('button', { name: 'Analog' }));
      // The Beat counter preview keeps its tempo on one line, as on Play, inside the preview (it broke after "=" at 320 px).
      for (const look of ['Digital', 'Analog']) {
        await page.getByRole('group', { name: 'Beat counter style' }).getByRole('button', { name: look }).click();
        const tempo = await page.locator('.look-preview-tempo').evaluate((el) => {
          const h = el.getBoundingClientRect().height;
          el.style.whiteSpace = 'nowrap';
          const one = el.getBoundingClientRect().height;
          el.style.whiteSpace = '';
          const box = el.parentElement!;
          const pad = parseFloat(getComputedStyle(box).paddingRight);
          return { wraps: h > one + 1, past: el.getBoundingClientRect().right - (box.getBoundingClientRect().right - pad) };
        });
        expect(tempo.wraps, `${look}: the preview's tempo breaks over two lines`).toBe(false);
        expect(tempo.past, `${look}: the preview's tempo runs past its padding`).toBeLessThanOrEqual(0.5);
      }
      // The test site's branch after the version (VITE_DEPLOY_BRANCH, which this build has not), put in as Settings.tsx
      // renders it: a short name shows in full beside the status, at every size (it was squeezed to nothing).
      await page.locator('.about-version').evaluate((el) => el.insertAdjacentHTML('beforeend', '<span class="mono-muted about-branch">test</span>'));
      const branch = page.locator('.about-branch');
      expect(await branch.evaluate((el) => el.scrollWidth - el.clientWidth), 'the branch name is cut').toBeLessThanOrEqual(1);
      await expectNoOverlap(branch, page.locator('.offline'));
      await expectClickable(page.getByRole('button', { name: 'Reset progress' }));
      const sections = page.getByRole('navigation', { name: 'Settings sections' });
      if (desktopLayout || tabletLayout) {
        // Tablet and desktop (App design canvas, SettingsTablet and SettingsDesktop): the sections listed on the left,
        // the cards in two columns beside the list. A section picked in the list gets the focus.
        const cols = page.locator('.set-col');
        await expect(cols).toHaveCount(2);
        await expectNoOverlap(page.locator('.set-side'), cols.first());
        await expectNoOverlap(cols.first(), cols.last());
        const about = sections.getByRole('button', { name: 'About' });
        await expectClickable(about);
        await about.click();
        await expect(about).toHaveAttribute('aria-current', 'true');
        await expect(page.locator('#set-about')).toBeFocused();
        await expectClickable(page.getByRole('button', { name: 'Reset progress' }));
        await expectNoClippedLabels(page);
      } else {
        await expect(sections).toHaveCount(0);
      }
      await expectNoSideScroll(page);
    });

    test('settings: language, switched to Dutch and back', async ({ page }) => {
      known(name, 'settings-language');
      await page.goto('./#/settings');
      const group = page.getByRole('group', { name: 'App language' });
      await expectClickable(group.getByRole('button', { name: 'Nederlands' }));
      await group.getByRole('button', { name: 'Nederlands' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
      // The switch remounts the screen; the thumb still slides over from English like the other rows, and the focus
      // stays on the language control.
      const nl = page.getByRole('group', { name: 'Taal van de app' });
      await expect(nl.locator('.seg-thumb')).toHaveCSS('animation-name', 'm-slide-a');
      await expect(nl.getByRole('button', { name: 'Nederlands' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(nl.getByRole('button', { name: 'English' })).toBeFocused();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      // Reset progress: the question and its line across the confirm, then Cancel and the verb under them (DESIGN.md,
      // Destructive confirm). Beside the buttons, the Dutch words got a column a word or two wide.
      const reset = page.getByRole('button', { name: 'Voortgang wissen' });
      await expectClickable(reset);
      await reset.click();
      const confirm = page.getByRole('alertdialog', { name: 'Alle voortgang wissen?' });
      const text = (await confirm.locator('.reset-text').boundingBox())!;
      expect(text.width, 'the question is as wide as the confirm').toBeGreaterThanOrEqual((await confirm.boundingBox())!.width - 1);
      for (const name of ['Annuleren', 'Wissen']) {
        const button = confirm.getByRole('button', { name, exact: true });
        expect((await button.boundingBox())!.y, `${name} is under the question`).toBeGreaterThanOrEqual(text.y + text.height - 1);
        await expectTouchHeight(button);
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      // Escape closes it, with the focus back on the row button.
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(reset).toBeFocused();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Instellingen' })).toBeVisible();
      await page.getByRole('group', { name: 'Taal van de app' }).getByRole('button', { name: 'English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    });

    test("settings: what's new, the latest release and the earlier ones", async ({ page }) => {
      known(name, 'changelog');
      await page.goto('./#/settings');
      await page.getByRole('link', { name: /^What's new/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: "What's new" })).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
      await expectChangelogFits(page);
      if (desktopLayout) {
        // Desktop: the releases on the left, the chosen one beside them (the MVP canvas's Desktop · What's new).
        const list = page.getByRole('navigation', { name: 'Releases' });
        await expectNotSqueezed(page.locator('.cl-card'));
        await expectNoOverlap(page.locator('.cl-side'), page.locator('.cl-detail'));
        await expectClickable(list.getByRole('button', { name: /^0\.1\.0/ }));
        await list.getByRole('button', { name: /^0\.3\.0/ }).click();
        await expect(list.getByRole('button', { name: /^0\.3\.0/ })).toHaveAttribute('aria-current', 'true');
        await expectClickable(page.getByRole('link', { name: 'Try Read notes' }));
        await page.getByRole('button', { name: /^Older 0\.2\.2/ }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Four-star Results' })).toBeVisible();
        await expectClickable(page.getByRole('button', { name: /^Newer 0\.3\.0/ }));
        await expectRingsInSideMenu(list);
      } else {
        await expectNotSqueezed(page.locator('.cl-latest'));
        // Tablet uses the full width under the header, as on the board, not the 640 px column.
        if (tabletLayout) expect((await page.locator('.cl-latest').boundingBox())!.width).toBeGreaterThan(VIEWPORTS[name].width - 80);
        await expectClickable(page.getByRole('button', { name: /^0\.1\.0/ }));
        await page.getByRole('button', { name: /^0\.3\.0/ }).click();
        await expectClickable(page.getByRole('link', { name: 'Try Read notes' }));
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('scrolling pages: Tab shows the whole focus ring of a control it scrolls to the top or bottom edge', async ({ page }) => {
      known(name, 'page-rings');
      // The Scales hub and Home scroll the shell's main box on a phone on its side and a laptop, not the page; the Path's
      // page does not scroll on a phone (its units do), and Start lesson sits at its bottom edge.
      for (const hash of ['#/settings', '#/changelog', '#/learn', '#/learn/2', '#/scales', '#/path', '#/']) {
        await page.goto('./' + hash);
        await expect(page.locator('main.shell-main').locator('a[href], button').first()).toBeVisible();
        await expectRingsOnPage(page);
      }
    });

    test('calibration: pad and the timing plot without scrolling', async ({ page }) => {
      known(name, 'calibration');
      await page.goto('./#/calibrate');
      await expectClickable(pad(page), { scroll: false });
      await expectTouchHeight(pad(page));
      await expect(page.getByRole('img', { name: /taps? measured/ })).toBeInViewport();
      await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('calibration from results: your delay, and back to results', async ({ page }) => {
      known(name, 'calibration-results');
      // Sol's unit passed: Continue starts the first rhythm lesson, the path's 2.1.
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
      await page.evaluate(() => {
        window.location.hash = '#/calibrate?from=results';
      });
      await expect(page.getByRole('heading', { level: 1, name: 'Calibrate timing' })).toBeVisible();
      await expect(page.getByText('Your delay', { exact: true })).toBeVisible();
      const back = page.getByRole('link', { name: 'Back to results' });
      await expectClickable(back, { scroll: false });
      await expectClickable(pad(page), { scroll: false });
      await expectNoSideScroll(page);
      await back.click();
      await expect(page).toHaveURL(/#\/results$/);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();

      // After a reload there is no run to go back to: then it is the way in from Settings.
      await page.evaluate(() => {
        window.location.hash = '#/calibrate?from=results';
      });
      await expect(page.getByRole('heading', { level: 1, name: 'Calibrate timing' })).toBeVisible();
      await page.reload();
      const toSettings = page.getByRole('link', { name: 'Back to settings' });
      await expectClickable(toSettings, { scroll: false });
      await toSettings.click();
      await expect(page).toHaveURL(/#\/settings$/);
    });

    test('results: try again, new exercise and copy code', async ({ page }) => {
      known(name, 'results');
      // Desktop Play has no Skip link: finish on a phone-sized window, then show Results at this size.
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Lesson 2.1 done' })).toBeVisible();
      // Nothing was played: the badge says what opens lesson 2.2, the tip says no taps came in, and under 2 stars the
      // filled button plays the same exercise again. The code is not shown, only copied.
      await expect(page.getByText('Get 2 stars to open lesson 2.2')).toBeVisible();
      await expect(page.getByText(/^No taps came in\./)).toBeVisible();
      await expect(page.getByText(/max combo|T44-/)).toHaveCount(0);
      await expect(page.locator('.results-main .btn--accent')).toHaveText('Try again');
      await expectClickable(page.getByRole('button', { name: 'Try again' }));
      await expectClickable(page.getByRole('button', { name: 'New exercise' }));
      await expectClickable(page.getByRole('button', { name: 'Copy code' }));
      // Every note was missed: each has a × under it on the staff as well as the miss colour (DESIGN.md §9).
      const misses = Number(await page.locator('.counts .count-n').nth(3).textContent());
      expect(misses).toBeGreaterThan(0);
      await expect(page.locator('.results-staff .staff-miss path')).toHaveCount(misses);
      await expectScrollbarAtEdge(page);
      // Tablet and desktop: the staff, the lane and the tip on the left; beside them the side panel with the score, the
      // badge, the counts and every action. A phone keeps its one column.
      if (VIEWPORTS[name].width >= 700) {
        const main = page.locator('.wide-main');
        const side = page.locator('.wide-side');
        const [m, s] = [(await main.boundingBox())!, (await side.boundingBox())!];
        expect(s.x, 'the side panel is right of the main column').toBeGreaterThanOrEqual(m.x + m.width);
        expect(s.y < m.y + m.height && m.y < s.y + s.height, 'the side panel is beside the main column').toBe(true);
        await expect(main.locator('.results-staff')).toBeVisible();
        await expect(main.locator('.results-lane')).toBeVisible();
        await expect(main.getByText(/^No taps came in\./)).toBeVisible();
        await expect(side.locator('.score-pct')).toBeVisible();
        await expect(side.getByText('Get 2 stars to open lesson 2.2')).toBeVisible();
        await expect(side.locator('.counts')).toBeVisible();
        for (const label of ['Listen', 'Copy code', 'New exercise', 'Try again']) await expectClickable(side.getByRole('button', { name: label }));
        await expectClickable(side.getByRole('link', { name: 'Practice settings' }));
      } else {
        await expect(page.locator('.wide')).toHaveCount(0);
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('results: where copying is not allowed, Copy code shows the code selected, to copy by hand', async ({ page }) => {
      known(name, 'results-copy-refused');
      // The clipboard refuses (a site permission, some in-app browsers), and so does the copy command.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
        document.execCommand = () => false;
      });
      await seedRun(page, QUARTERS, 3);
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      const copy = page.getByRole('button', { name: 'Copy code' });
      await expectClickable(copy);
      await copy.click();
      const field = page.getByRole('textbox', { name: 'Exercise code' });
      await expect(field).toHaveValue(/^T44-Q-R-1B-120-/);
      await expect(field).toBeFocused();
      expect(await field.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe((await field.inputValue()).length);
      await expect(page.getByRole('status').filter({ hasText: /^Selected\./ })).toBeVisible();
      await expectClickable(field);
      // On a line under Copy code: in the side panel on tablet and desktop, at the bottom on a phone, the buttons in view.
      if (VIEWPORTS[name].width >= 700) await expect(page.locator('.wide-side').getByRole('textbox', { name: 'Exercise code' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'New exercise' }));
      await expectNoOverlap(field, page.locator('.results-main'));
      await expectNoSideScroll(page);
    });

    test("results: a triplet's 3 over the first row is drawn in full, and the exercise ends with the final barline", async ({ page }) => {
      known(name, 'results-triplets');
      // Four bars of 4/4 with triplets in bars 1 and 3 (seed 111). Desktop Play has no Skip link: skip on a phone.
      await seedRun(page, { ...QUARTERS, notes: ['half', 'quarter', 'eighth'], rests: ['quarter', 'eighth'], dotted: true, ties: true, triplets: true, bars: 4, tempo: 80 }, 111);
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      const staff = page.locator('.results-staff svg:has(.vf-stave)');
      await expect(staff).toBeVisible();
      await expectStaffNotCut(staff);
      await expect(staff.locator('rect[width="3"]')).toHaveCount(1);
      // On a 320 px phone bar 1's last quarter note ran into its bar line.
      await expectBarsFit(staff);
      await expectNoSideScroll(page);
    });

    test("play and results: a busy bar's notes stay inside it, clear of its bar line and the staff's edge", async ({ page }) => {
      known(name, 'busy-bars');
      // Lesson 8.5 (Unit 8 review) with seed 150: bars 3 and 7 have twelve symbols each (eleven notes and a rest), and
      // at full size bar 3 needs more room than its share of the row on a phone, on tablet Play and on desktop Results.
      // The staff is drawn smaller instead.
      await seedRun(page, lessonSettings('8.5'), 150);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      const play = page.locator('.play-staff, .tplay-staff, .dplay-staff').locator('svg:has(.vf-stave)');
      await expect(play).toBeVisible();
      await expectBarsFit(play);
      // Desktop Play has no Skip link: skip on a phone.
      await page.setViewportSize(VIEWPORTS.phone);
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      const results = page.locator('.results-staff svg:has(.vf-stave)');
      await expect(results).toBeVisible();
      await expectBarsFit(results);
      await expectNoSideScroll(page);
    });

    test('play and results: a bar whose notes do not fit even drawn smaller gets a row with fewer bars', async ({ page }) => {
      known(name, 'busy-sixteenths');
      // Setup's Busy sixteenths with seed 6: the last bar has fourteen notes, which ran over the final barline on a phone
      // even at 0.75, the smallest the staff is drawn. A phone in portrait draws one bar a row instead (Play: two rows,
      // bars 1–2), as large as it then fits; in landscape, on tablet and on desktop the notes fit and the rows keep their
      // bars. Play still fits without scrolling.
      await seedRun(page, { ...QUARTERS, notes: ['quarter', 'eighth', 'sixteenth'], rests: ['quarter'], density: 'busy', bars: 4, tempo: 80 }, 6);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      const play = page.locator('.play-staff, .tplay-staff, .dplay-staff').locator('svg:has(.vf-stave)');
      await expect(play).toBeVisible();
      await expectBarsFit(play);
      await expect(play.locator('.vf-stave')).toHaveCount(portraitLayout && !tabletLayout ? 2 : 4);
      await expectFits(page);
      // Made a phone during the exercise (Split View, a desktop window made narrow): the phone's layout draws a new staff,
      // which is measured again, so it shows one bar a row there too. Desktop Play has no Skip link: skip on the phone.
      await page.setViewportSize(VIEWPORTS.phone);
      await expectBarsFit(play);
      await expect(play.locator('.vf-stave')).toHaveCount(2);
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      const results = page.locator('.results-staff svg:has(.vf-stave)');
      await expect(results).toBeVisible();
      await expectBarsFit(results);
      await expectNoSideScroll(page);
    });

    test('play: a busy bar keeps its notes inside it when a phone becomes this size during the exercise', async ({ page }) => {
      known(name, 'busy-sixteenths-resize');
      // Busy sixteenths with seed 7: bar 3 has sixteen sixteenths. Opened on a phone (two bars a row, drawn smaller), then
      // made this size (a foldable unfolded, Split View made wider): tablet and desktop draw a new staff, which is measured
      // again. All four bars show there, three a row on tablet and four on desktop. Measured on the phone's staff, which
      // was gone, tablet Play kept one bar a row, or drew four and ran bar 3 into bar 4.
      await seedRun(page, { ...QUARTERS, notes: ['quarter', 'eighth', 'sixteenth'], rests: ['quarter'], density: 'busy', bars: 4, tempo: 80 }, 7);
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      const play = page.locator('.play-staff, .tplay-staff, .dplay-staff').locator('svg:has(.vf-stave)');
      await expect(play).toBeVisible();
      await expectBarsFit(play);
      await page.setViewportSize(VIEWPORTS[name]);
      if (VIEWPORTS[name].width >= 700) await expect(play.locator('.vf-stave')).toHaveCount(4);
      await expectBarsFit(play);
      await expectFits(page);
    });

    test('results: a steady late tapper is told about latency, with Calibrate', async ({ page }) => {
      known(name, 'results-latency');
      test.setTimeout(60_000);
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await tapLate(page, 4, 500, 130);
      await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible({ timeout: 10_000 });
      await page.setViewportSize(VIEWPORTS[name]);
      // Every tap about 130 ms late: all Miss and Extra, and a tip that names the delay, not the reading.
      const tip = page.getByText(/^Your taps came about \d+ ms late every time\./);
      await expect(tip).toBeVisible();
      const tipText = await tip.textContent();
      const calibrate = page.getByRole('link', { name: 'Calibrate' });
      await expectClickable(calibrate);
      await expectClickable(page.getByRole('button', { name: 'Try again' }));
      await expectClickable(page.getByRole('button', { name: 'Copy code' }));
      // Tablet and desktop: the tip with Calibrate under the lane on the left, the actions in the side panel.
      if (VIEWPORTS[name].width >= 700) {
        await expect(page.locator('.wide-main').getByRole('link', { name: 'Calibrate' })).toBeVisible();
        await expect(page.locator('.wide-side').getByRole('button', { name: 'Try again' })).toBeVisible();
        await expectNoOverlap(page.locator('.wide-main .tip'), page.locator('.wide-side .results-actions'));
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expect(calibrate).toHaveAttribute('href', '#/calibrate?from=results');
      // Started from a Learn section's Practice link, the run ends on #/results?from=1.1 (notes.spec.ts, "learn: a rhythm
      // practice link…"): Calibrate takes that along, and brings it back.
      await page.evaluate(() => {
        window.location.hash = '#/results?from=1.1';
      });
      await expect(page.getByRole('link', { name: 'Back to chapter 1' })).toBeVisible();
      await calibrate.click();
      await expect(page).toHaveURL(/#\/calibrate\?from=results&learn=1\.1$/);
      await expect(page.getByRole('link', { name: 'Back to results' })).toHaveAttribute('href', '#/results?from=1.1');

      // Calibrated from the tip: Save returns to the same run, whose tip is still about how it was played. In place of
      // Calibrate, one line says the next exercise uses the calibration. Save takes the focus from the pad it replaces.
      await pad(page).focus();
      await calibrateAlong(page);
      const save = page.getByRole('button', { name: 'Save' });
      await expect(save).toBeFocused();
      await expectClickable(save);
      await expectNoSideScroll(page);
      await save.click();
      await expect(page).toHaveURL(/#\/results\?from=1\.1$/);
      await expect(page.getByRole('link', { name: 'Back to chapter 1' })).toBeVisible();
      await expect(page.getByText(tipText!, { exact: true })).toBeVisible();
      await expect(page.getByText('Calibrated. Your next exercise uses it.', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Calibrate' })).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test('results: the level-up sheet lists the achievement, with See progress and Continue in reach', async ({ page }) => {
      known(name, 'levelup');
      test.setTimeout(60_000);
      // 5 XP short of level 8: one bar played on the beat levels up and earns Perfect bar (App design canvas, Resolve ·
      // Level up: the rows under the XP bar, then See progress and Continue).
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: QUARTERS, xp: 1745 } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await tapLate(page, 4, 500, 0);
      const sheet = page.getByRole('dialog', { name: 'Level 8 · Groove' });
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await expect(sheet.getByText('Achievement unlocked')).toBeVisible();
      await expect(sheet.getByText('Perfect bar', { exact: true })).toBeVisible();
      for (const row of await sheet.locator('.levelup-row').all()) await expectNotSqueezed(row);
      const see = sheet.getByRole('link', { name: 'See progress' });
      const done = sheet.getByRole('button', { name: 'Continue' });
      await expectClickable(see);
      await expectTouchHeight(see);
      await expectClickable(done);
      await expectTouchHeight(done);
      await expectNoOverlap(see, done);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await done.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible();
    });

    test('results: a level-up sheet with several rows never focuses a button out of sight', async ({ page }) => {
      known(name, 'levelup-rows');
      test.setTimeout(60_000);
      // Level 8 with two achievements, Perfect bar and Played at 160 BPM: on a phone on its side the sheet scrolls, and
      // Continue starts below what it shows. Focus is then on the sheet itself, and Tab goes on to the buttons.
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, tempo: 160 }, xp: 1745 } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await tapLate(page, 4, 375, 0);
      const sheet = page.getByRole('dialog', { name: 'Level 8 · Groove' });
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await expect(sheet.getByText('Achievement unlocked')).toHaveCount(2);
      const focusShown = (): Promise<string> =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el?.closest('[role="dialog"]')) return 'focus is outside the sheet';
          const r = el.getBoundingClientRect();
          return r.top >= -1 && r.bottom <= window.innerHeight + 1 ? 'ok' : `"${(el.textContent ?? '').trim().slice(0, 24)}" is focused out of sight`;
        });
      const done = sheet.getByRole('button', { name: 'Continue' });
      for (let i = 0; i < 3 && !(await done.evaluate((el) => el === document.activeElement)); i++) {
        await expect.poll(focusShown, { timeout: 3000 }).toBe('ok');
        await page.keyboard.press('Tab');
      }
      await expect(done).toBeFocused();
      await expect.poll(focusShown, { timeout: 3000 }).toBe('ok');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Exercise done' })).toBeVisible();
    });

    test('read notes: round done', async ({ page }) => {
      known(name, 'notes-done');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: /^Start · / }).click();
      await page.getByRole('group', { name: 'Note names' }).getByRole('button').first().click();
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('link', { name: 'Change setup' }));
      // Tablet and desktop: the round's cards on the left; the score and the actions in the side panel beside them.
      if (VIEWPORTS[name].width >= 700) {
        const main = page.locator('.wide-main');
        const side = page.locator('.wide-side');
        const [m, s] = [(await main.boundingBox())!, (await side.boundingBox())!];
        expect(s.x, 'the side panel is right of the main column').toBeGreaterThanOrEqual(m.x + m.width);
        expect(s.y < m.y + m.height && m.y < s.y + s.height, 'the side panel is beside the main column').toBe(true);
        await expect(main.getByRole('img', { name: /^Answer time for 1 note\. / })).toBeVisible();
        await expect(side.locator('.score-pct')).toBeVisible();
        await expectClickable(side.getByRole('button', { name: 'New round' }));
        await expectClickable(side.getByRole('link', { name: 'Change setup' }));
      } else {
        await expect(page.locator('.wide')).toHaveCount(0);
      }
      // The score line breaks where it has to, but never inside the XP ("+14" / "XP" in the tablet's side panel): even
      // with no room at all, the XP stays one piece.
      const xp = page.locator('.score-sub b');
      await expect(xp).toHaveText(/^\+\d+ XP$/);
      const xpLines = await xp.evaluate((el) => {
        const line = el.parentElement!;
        line.style.width = '0';
        const n = el.getClientRects().length;
        line.style.width = '';
        return n;
      });
      expect(xpLines, 'the XP on one line').toBe(1);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('path: the current unit is in view, and long Dutch titles stay inside their boxes', async ({ page }) => {
      known(name, 'path-current');
      // The path up to lesson 14.2 with two stars: unit 14 (rhythm's dotted notes) is current, below the fold.
      await seed(page, { progress: { lessons: pathUpTo('14.2') }, prefs: { language: 'nl', seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await expect(page.getByRole('button', { name: /^14 · Gepunteerde noten/ })).toBeInViewport();
      await expectClickable(page.getByRole('button', { name: /^Begin les 14\.3/ }));
      // "10 · Tweekwartsmaat, achtste rusten", "5 · Fa: de onderste tussenruimte": a long word breaks instead of running
      // into the unit's stars.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const spill = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.unit-head .unit-title, .lesson-title')]
          .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      );
      expect(spill, 'titles that run out of their box').toEqual([]);
      await expectNoSideScroll(page);
    });

    test('read notes lesson: round done with Next lesson', async ({ page }) => {
      known(name, 'notes-lesson-done');
      // Read notes unit 1 is the path's unit 15.
      await seed(page, { progress: { lessons: { ...pathUpTo('14.5'), 'notes:1.1': { stars: 3, bestAccuracy: 96 } } }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Play lesson 15.1 · Name the notes: 3 of 3 stars' }).click();
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Lesson 15.1 done' })).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Back to the path' }));
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('button', { name: 'Next lesson: 15.2 · Twenty notes' }));
      // Nothing answered: no cards for a main column, so tablet and desktop keep the one column too.
      await expect(page.locator('.wide')).toHaveCount(0);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('path lesson: write a note on the staff', async ({ page }) => {
      known(name, 'notes-write');
      // Sol, rhythm unit 1 and Meet mi passed: lesson 3.2 writes mi (and sol).
      await seed(page, { progress: { lessons: pathUpTo('3.1') }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 3.2' }).click();
      const staff = page.getByRole('slider', { name: /^Where (mi \(E\)|sol \(G\)|E \(mi\)|G \(sol\)) goes on the staff$/ });
      await expect(staff).toBeVisible();
      await expect(staff).toHaveAttribute('aria-valuetext', 'Not on the staff yet');
      for (const label of ['Lower', 'Higher', 'Hint']) await expectClickable(page.getByRole('button', { name: label }), inPlace);
      await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
      // A tap on the staff puts the note on the nearest line or space; Check takes it.
      const svg = (await staff.locator('svg').boundingBox())!;
      await page.mouse.click(svg.x + svg.width / 2, svg.y + svg.height / 2);
      await expect(staff).toHaveAttribute('aria-valuetext', 'the middle line');
      await expectClickable(page.getByRole('button', { name: 'Check' }), inPlace);
      // A line or space is easy to point at: at least 7 px apart (the drawing is 14 steps high).
      expect(svg.height / 14, 'staff steps too close together to point at').toBeGreaterThanOrEqual(7);
      if (portraitLayout) await expectFits(page);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      // At either end of the range, the note and the cursor's box round it are drawn whole, on a staff of one size.
      for (const [button, end] of [['Higher', 'aria-valuemax'], ['Lower', 'aria-valuemin']]) {
        const to = (await staff.getAttribute(end))!;
        while ((await staff.getAttribute('aria-valuenow')) !== to) await page.getByRole('button', { name: button }).click();
        await expectStavesFit(page);
        expect((await staff.locator('svg').boundingBox())!.height, `the staff's height with the note at its ${end}`).toBeCloseTo(svg.height, 1);
      }
      await page.getByRole('button', { name: 'Check' }).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^(Right|You wrote)/);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
    });

    test('path lesson: hear a note after sol', async ({ page }) => {
      known(name, 'notes-hear');
      await seed(page, { progress: { lessons: pathUpTo('3.2') }, prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 3.3' }).click();
      await expect(page.getByRole('img', { name: /Note 1 of 10 is still empty/ })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Hear it again' }), inPlace);
      // Two notes learned: two name buttons, side by side.
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      await expect(names).toHaveCount(2);
      for (let i = 0; i < 2; i++) await expectClickable(names.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('path lesson: a timed write after a wrong note, and a hear, fit with Skip to summary, on a phone on its side too', async ({ page }) => {
      known(name, 'notes-write-hear-fit');
      // Writing draws the staff bigger and a hear round adds Hear it again to the staff card: in a phone's landscape
      // column, with lesson 1.4's timer bar and a why of two lines under it, the page scrolled and cut Skip to summary.
      const fits = portraitLayout || name === 'phone-landscape';
      const skip = page.getByRole('button', { name: 'Skip to summary' });
      await seed(page, { progress: { lessons: pathUpTo('1.3') }, prefs: { seenHowTo: true, seenHold: true, noteNames: 'letters' } });
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 1.4' }).click();
      await expect(page.getByRole('slider', { name: /goes on the staff$/ })).toBeVisible();
      if (fits) await expectFits(page);
      // Four steps up from where the note starts is the top space, E: wrong, for sol.
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await expect(page.locator('.nfeedback')).toHaveText(/^You wrote E/);
      if (fits) {
        await expectFits(page);
        await expectClickable(skip, { scroll: false });
      }
      // A new page load, so the app reads the progress seeded now (the later script runs last).
      await seed(page, { progress: { lessons: pathUpTo('3.2') }, prefs: { seenHowTo: true, seenHold: true, noteNames: 'letters' } });
      await page.goto('about:blank');
      await page.goto('./#/path');
      await page.getByRole('button', { name: 'Start lesson 3.3' }).click();
      await expect(page.getByRole('button', { name: 'Hear it again' })).toBeVisible();
      if (fits) {
        await expectFits(page);
        await expectClickable(skip, { scroll: false });
      }
    });

    test('read notes: setup, key and start', async ({ page }) => {
      known(name, 'notes-setup');
      await page.goto('./#/notes');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      // The Range chips' "+2 ledger lines" fits a third of a 320 px phone on two lines.
      await expectNoClippedLabels(page);
      if (desktopLayout || tabletLayout) await expectBeside(page.locator('.wide-main'), page.locator('.wide-side'));
      await page.getByRole('link', { name: /^Key: / }).click();
      // The Key screen takes the setup's place on the hashchange, a moment after the click: wait for it, or the setup
      // is measured (or its main column comes back null, swapped out between finding and measuring it).
      await expect(page.getByRole('heading', { name: 'Key', exact: true })).toBeVisible();
      if (desktopLayout || tabletLayout) {
        // The keys on the left; the chosen key's signature, large, with what it means and Use beside them.
        await expectBeside(page.locator('.wide-main'), page.locator('.wide-side'));
        await expect(page.locator('.key-big')).toBeVisible();
        await page.getByRole('group', { name: 'Key' }).getByRole('button', { name: 'Mix keys' }).click();
        await expect(page.locator('.key-big')).toHaveCount(0);
        await page.getByRole('group', { name: 'Key' }).getByRole('button', { name: 'One key' }).click();
      } else {
        await expect(page.locator('.key-big')).toHaveCount(0);
      }
      // The last row of keys is reachable above the sticky Use button once the list is scrolled to its end.
      await page.locator('.nkeys').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expectClickable(page.getByRole('button', { name: /^C♯ major or A♯ minor/ }), { scroll: false });
      await expectClickable(page.getByRole('button', { name: /^Use / }));
      await expectNoSideScroll(page);
    });

    test('read notes: name buttons, piano and next', async ({ page }) => {
      known(name, 'notes-play');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /staff in C major/ })).toBeVisible();
      await expectStavesFit(page);
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      await expect(names).toHaveCount(7);
      // Everything in view without scrolling, in a phone browser too (DESIGN.md §9).
      for (let i = 0; i < 7; i++) await expectClickable(names.nth(i), inPlace);
      await expectTouchHeight(names.first());
      // C major without extra signs: no note can have a sign, so there is no sign row (and no line about it).
      await expect(page.getByRole('radiogroup', { name: 'Sharp or flat' })).toHaveCount(0);
      await expect(page.getByText('Pick the sign if there is one, then the name.')).toHaveCount(0);
      if (portraitLayout) await expectFits(page);
      // Tablet (App design canvas, NoteTablet): the exercise header with the brand and Quit, the question over a big
      // staff card, and tall name keys in the answer card.
      const tablet = tabletLayout && portraitLayout;
      if (tablet) {
        await expect(page.locator('.dplay-head--tablet .brand')).toBeVisible();
        await expect(page.locator('.dplay-head--tablet .mono-line')).toHaveText('Note 1 of 20');
        await expectClickable(page.getByRole('link', { name: 'Quit' }), inPlace);
        await expect(page.locator('.nplay-ask')).toHaveText('Which note is highlighted?');
        expect((await names.first().boundingBox())!.height, 'tall name keys').toBeGreaterThanOrEqual(150);
        await expectNoOverlap(page.locator('.ntab-staff'), page.locator('.ntab-answer'));
      }
      await expectNoSideScroll(page);
      await page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' }).click();
      const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
      await expect(keys).toHaveCount(12);
      for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      await expectTouchHeight(page.getByRole('button', { name: 'Hint' }));
      if (tablet) expect((await keys.first().boundingBox())!.height, 'a tall piano').toBeGreaterThanOrEqual(200);
      // The hint takes two lines; the piano gives up the room, so nothing scrolls.
      await page.getByRole('button', { name: 'Hint' }).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^.+\. This note is|^This is /);
      await expectClickable(keys.nth(0), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout || deskFits) await expectFits(page);
      await expectScrollbarAtEdge(page);
      if (tablet) {
        // A smaller tablet window (700 × 1000): the piano gives up height, and everything still fits.
        await page.setViewportSize({ width: 700, height: 1000 });
        for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i), inPlace);
        await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
        await expectClickable(page.getByRole('button', { name: 'Skip to summary' }), inPlace);
        await expectFits(page);
      }
      await expectNoSideScroll(page);
    });

    test('read notes: the sign row with extra signs', async ({ page }) => {
      known(name, 'notes-signs');
      await page.goto('./#/notes');
      await page.getByRole('button', { name: 'Sharps ♯' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /staff in C major/ })).toBeVisible();
      await expectStavesFit(page);
      for (const sign of ['flat', 'natural', 'sharp']) await expectClickable(page.getByRole('radio', { name: sign }), inPlace);
      const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
      for (let i = 0; i < 7; i++) await expectClickable(names.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      // Tablet: the sign row's buttons are as tall as the board's, over tall name keys.
      if (tabletLayout && portraitLayout) {
        expect((await page.getByRole('radio', { name: 'flat' }).boundingBox())!.height).toBeGreaterThanOrEqual(56);
        expect((await names.first().boundingBox())!.height, 'tall name keys').toBeGreaterThanOrEqual(150);
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('read notes: seven sharps and extra signs, every note in its own bar on the staff', async ({ page }) => {
      known(name, 'notes-wide-key');
      // C♯ major's signature takes the most room, and extra signs put a sharp, flat or natural before most notes.
      const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['C#'], extras: 'both' };
      const seed = 28;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      await expect(page.getByRole('img', { name: /staff in C♯ major/ })).toBeVisible();
      const bars = VIEWPORTS[name].width >= 1100 ? 8 : 6;
      await expect(page.locator('.nplay-staff-svg .vf-stavenote')).toHaveCount(bars);
      await expectStavesFit(page);
      await expectNoSideScroll(page);
      // The cursor on every note of the page (notes 2 and 3 carry a natural) and on the next page's first: it stays in
      // its note's bar, and the staff keeps its size from note to note and page to page (on a phone the next page has
      // no natural, and a staff sized for its own notes only would be drawn bigger).
      const size = (): Promise<(string | null)[]> => page.locator('.nplay-staff-svg svg').evaluate((svg) => [svg.getAttribute('width'), svg.getAttribute('height')]);
      const first = await size();
      for (const [i, n] of generateRound(settings, seed).slice(0, bars).entries()) {
        const wrong = letterOf(n.step) === 'C' ? 'D' : 'C';
        await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(`^${wrong}(,|$)`) }).click();
        await page.getByRole('button', { name: /^Next note/ }).click();
        await expect(page.getByRole('img', { name: new RegExp(`Note ${i + 2} of 20 is highlighted`) })).toBeVisible();
        await expectStavesFit(page);
        expect(await size(), `the staff's size at note ${i + 2}`).toEqual(first);
      }
    });

    test('read notes: a flat over the staff is drawn whole, and the screen fits', async ({ page }) => {
      known(name, 'notes-sign-above');
      // B♭ major with extra signs, seed 59: the first note is G♭5, whose flat reaches more than two spaces over the staff.
      const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['Bb'], extras: 'both' };
      const [first] = generateRound(settings, 59);
      expect([first.step, first.sign], 'the first note is G♭5 with its flat').toEqual([39, -1]);
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 59, focus: [] });
      await page.goto('./#/notes/play');
      await expect(page.getByRole('img', { name: /staff in B♭ major/ })).toBeVisible();
      await expectStavesFit(page);
      for (const sign of ['flat', 'natural', 'sharp']) await expectClickable(page.getByRole('radio', { name: sign }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('read notes: ledger lines with a key signature and a timer fit, on the piano and with the name buttons', async ({ page }) => {
      known(name, 'notes-ledger');
      // The ranges with ledger lines draw a taller staff, a key with a signature makes the idle line two lines long,
      // and the timer adds its bar: on a short phone the staff is drawn smaller, so the answer controls stay in view.
      const rounds: Partial<NoteSettings>[] = [
        { input: 'piano', range: 'ledger2', keys: ['G'], timer: 5 },
        { input: 'piano', range: 'ledger1', keys: ['G'], timer: 5 },
        { input: 'names', range: 'ledger2', keys: ['G'], extras: 'both', timer: 5 },
      ];
      for (const round of rounds) {
        const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, ...round };
        await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 4242, focus: [] });
        await page.goto('./#/notes/play');
        // A fresh load, so the app reads the round just seeded (a new hash alone keeps the app and its round).
        await page.reload();
        await expect(page.getByRole('img', { name: /staff in G major/ })).toBeVisible();
        // Within the note's 5 s: the idle line, then the hint, each two lines long on a phone.
        if (portraitLayout || deskFits) await expectFits(page);
        await page.getByRole('button', { name: 'Hint' }).dispatchEvent('click');
        await expect(page.locator('.nfeedback')).toHaveClass(/is-hint/);
        if (portraitLayout || deskFits) await expectFits(page);
        if (round.input === 'piano') {
          const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
          await expect(keys).toHaveCount(12);
          for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i), inPlace);
          // The black keys stay a touch target when the piano gives up height.
          await expectTouchHeight(page.locator('.piano-black').first());
        } else {
          for (const sign of ['flat', 'natural', 'sharp']) await expectClickable(page.getByRole('radio', { name: sign }), inPlace);
          const names = page.getByRole('group', { name: 'Note names' }).getByRole('button');
          for (let i = 0; i < 7; i++) await expectClickable(names.nth(i), inPlace);
        }
        await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
        await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
        await expectTouchHeight(page.getByRole('button', { name: 'Hint' }));
        await expectStavesFit(page);
      }
      // G♭ major with a timer, seed 1234: the first note is a treble G♭ below the second ledger line, and the natural
      // key for it says why in three lines on a phone ("That was G♭ (sol♭): the space below the second ledger line is
      // G, and the flat in the key signature makes it G♭ (sol♭)."), under the timer's bar.
      const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, input: 'piano', range: 'ledger2', keys: ['Gb'], clefs: ['treble', 'bass'], extras: 'both', count: 30, playNotes: false, timer: 5 };
      const [first] = generateRound(settings, 1234);
      expect([first.clef, first.step, first.alter, first.sign], 'the first note is a treble G♭ from the key signature').toEqual(['treble', 25, -1, null]);
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 1234, focus: [] });
      await page.goto('./#/notes/play');
      await page.reload();
      await expect(page.getByRole('img', { name: /staff in G♭ major/ })).toBeVisible();
      await page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button', { name: /^G, sol/ }).dispatchEvent('click');
      await expect(page.locator('.nfeedback')).toHaveText(/^That was G♭ \(sol♭\): .+ is G, and the flat in the key signature makes it G♭/);
      if (portraitLayout || deskFits) await expectFits(page);
      // On desktop too, Next note is in the window without a scroll (at 1280 × 800 it was below it).
      if (deskFits) await expect(page.getByRole('button', { name: /^Next note/ })).toBeInViewport({ ratio: 1 });
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      await expectStavesFit(page);
      await expectNoSideScroll(page);
    });

    test('read notes lesson in a key: the count stays on one line beside a long eyebrow, and the round fits', async ({ page }) => {
      known(name, 'notes-lesson-key');
      // Lesson 22.3 (Keys, G major in both clefs, on the piano): "Lesson 22.3 · Treble clef · G major" over the
      // question and the two-line idle line. Seed 27 starts on F♯ in the treble clef.
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), {
        settings: noteLessonSettings('keys', '2.3'),
        seed: 27,
        focus: [],
        lesson: { track: 'keys', id: '2.3' },
      });
      await page.goto('./#/notes/play');
      await expect(page.getByRole('img', { name: /staff in G major/ })).toBeVisible();
      await expect(page.getByText('Mind the key signature.', { exact: false })).toBeVisible();
      // Phone and tablet show the count beside the eyebrow: "0 / 0" on one line (20 px), however long the eyebrow.
      if (!desktopLayout) expect((await page.locator('.nplay-score-n').boundingBox())!.height, 'the count on one line').toBeLessThan(30);
      const keys = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
      for (let i = 0; i < 12; i++) await expectClickable(keys.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      // The mistake this lesson trains, F for F♯: three lines of why on a phone ("That was F♯ (fa♯): the top line is F,
      // and the sharp in the key signature makes it F♯ (fa♯)."). A 320 px phone leaves out "Any octave counts" for it.
      await page.getByRole('button', { name: /^F, fa(, key |$)/ }).dispatchEvent('click');
      await expect(page.locator('.nfeedback')).toHaveText(/^That was F♯ \(fa♯\): the top line is F, and the sharp/);
      await expect(page.getByText('Any octave counts')).toBeAttached();
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), inPlace);
      if (portraitLayout) await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('read notes: the score stays on one line once ten notes are answered', async ({ page }) => {
      known(name, 'notes-score');
      // "10 / 10" is as wide as the widest score, 50 notes' "50 / 50". On desktop's Correct card it broke after the
      // slash from the tenth note on ("9 /" over "12").
      const settings = { ...DEFAULT_NOTE_SETTINGS, playNotes: false };
      const seed = 4242;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      for (const [i, n] of generateRound(settings, seed).slice(0, 10).entries()) {
        await expect(page.getByRole('img', { name: new RegExp(`Note ${i + 1} of 20 is highlighted`) })).toBeVisible();
        await page.keyboard.press(letterOf(n.step).toLowerCase());
        await expect(page.getByRole('img', { name: `${i + 1} of ${i + 1} correct` })).toBeAttached();
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // The score's lines, and how far it runs past its card's padding (desktop: the stat card; else the line it is on).
      const fit = await page.locator(desktopLayout ? '.nstats .nstat-big' : '.nplay-score-n').first().evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        const card = el.closest('.card') ?? el.parentElement!;
        const right = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
        return { text: el.textContent, lines: new Set(rects.map((r) => Math.round(r.top))).size, over: Math.max(...rects.map((r) => r.right)) - right };
      });
      expect(fit.text).toBe('10 / 10');
      expect(fit.lines, 'the score on one line').toBe(1);
      expect(fit.over, 'the score inside its card').toBeLessThanOrEqual(0.5);
      await expectNoSideScroll(page);
    });

    test('read notes: round done by sign, each count on one line beside a long label', async ({ page }) => {
      known(name, 'notes-done-sign');
      // C♯ major: every note is in the key signature's group, whose label names all seven sharps, and a note answered
      // without its sharp brings the By sign card with its tip.
      const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, keys: ['C#'], count: 10, playNotes: false };
      const seed = 4242;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      const [first] = generateRound(settings, seed);
      await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(`^${letterOf(first.step)}(,|$)`) }).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^Right (line|space), but C♯ major has/);
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByText('F♯, C♯, G♯, D♯, A♯, E♯ and B♯ from the key signature', { exact: true })).toBeVisible();
      // "0 / 1" stays whole beside the label, which wraps on a phone.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const lines = await page.locator('.nsign-head > :last-child').evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        }),
      );
      expect(lines, 'the lines of each count').toEqual([1]);
      await expectNoSideScroll(page);
    });

    test('read notes: round done with the missed notes on small staves, named as the player reads them', async ({ page }) => {
      known(name, 'notes-done-chips');
      // A known round (treble, C major, on the staff): the first three notes answered with a wrong letter, then one
      // right after a Hint. A note missed before that comes back is missed again: answered with a hint, it would be
      // left out of With a hint, as it is under Missed already.
      const settings = { ...DEFAULT_NOTE_SETTINGS, count: 10 };
      const seed = 4242;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      const missed = new Set<number>();
      for (const [i, n] of generateRound(settings, seed).entries()) {
        const hinted = i >= 3 && !missed.has(n.step);
        const letter = hinted ? letterOf(n.step) : letterOf(n.step) === 'C' ? 'D' : 'C';
        if (hinted) await page.getByRole('button', { name: 'Hint' }).click();
        else missed.add(n.step);
        // "C", or "C, key C" with the computer keys shown.
        await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(`^${letter}(,|$)`) }).click();
        await page.getByRole('button', { name: /^Next note/ }).click();
        if (hinted) break;
      }
      await page.getByRole('button', { name: 'Skip to summary' }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      const chips = page.getByRole('list', { name: 'Missed' }).getByRole('listitem');
      await expect(chips.first()).toHaveAccessibleName(/^[A-G] on the .+ \(treble clef\), missed (once|\d times)$/);
      await expect(chips.first()).toHaveText(/^[A-G]/);
      await expect(chips.first().locator('.pitch-staff svg')).toBeVisible();
      // The With a hint row, between Missed and Slow: its label takes two lines in the label column.
      const hintedChip = page.getByRole('list', { name: 'With a hint' }).getByRole('listitem').first();
      await expect(hintedChip).toHaveAccessibleName(/^[A-G] on the .+ \(treble clef\), answered with a hint$/);
      await expect(hintedChip.locator('.pitch-staff svg')).toBeVisible();
      await expectNotSqueezed(page.locator('.ncard').nth(1));
      await expectClickable(page.getByRole('button', { name: 'Practice missed notes' }));
      // Tablet and desktop: the chips in the main column, Practice missed notes in the side panel.
      if (VIEWPORTS[name].width >= 700) {
        await expect(page.locator('.wide-main').getByRole('list', { name: 'Missed' })).toBeVisible();
        await expectClickable(page.locator('.wide-side').getByRole('button', { name: 'Practice missed notes' }));
        await expectNoOverlap(page.locator('.wide-main'), page.locator('.wide-side'));
      }
      await expectNoSideScroll(page);
    });

    test('read notes: round done lists every note missed, its chips wrapping inside the card', async ({ page }) => {
      known(name, 'notes-done-many');
      // Twenty notes, each named a letter too high: more notes missed than the six the card once showed, while Practice
      // missed notes drilled them all.
      const settings = { ...DEFAULT_NOTE_SETTINGS, count: 20, playNotes: false };
      const seed = 7;
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed, focus: [] });
      await page.goto('./#/notes/play');
      const notes = generateRound(settings, seed);
      const letters = 'ABCDEFG';
      const feedback = page.locator('.nfeedback');
      for (const [i, n] of notes.entries()) {
        await page.keyboard.press(letters[(letters.indexOf(letterOf(n.step)) + 1) % 7].toLowerCase());
        await expect(feedback).toHaveText(/^That was /);
        await page.keyboard.press('Enter');
        if (i < notes.length - 1) await expect(feedback).not.toHaveText(/^That was /);
      }
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      const missed = new Set(notes.map((n) => `${n.step}:${n.alter}`)).size;
      expect(missed).toBeGreaterThan(6);
      const list = page.getByRole('list', { name: 'Missed' });
      await expect(list.getByRole('listitem')).toHaveCount(missed);
      const card = (await page.locator('.ncard').filter({ has: list }).boundingBox())!;
      for (const chip of await list.getByRole('listitem').all()) {
        const b = (await chip.boundingBox())!;
        expect(b.x + b.width, 'a chip inside its card').toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
      // The row's name stays beside its first chips, not halfway down the rows they wrap to.
      const label = (await page.locator('.nchips-row').filter({ has: list }).locator('.nchips-label').boundingBox())!;
      const first = (await list.getByRole('listitem').first().boundingBox())!;
      expect(Math.abs(label.y + label.height / 2 - (first.y + first.height / 2)), 'Missed beside the first chips').toBeLessThanOrEqual(1);
      await expectClickable(page.getByRole('button', { name: 'Practice missed notes' }));
      await expectNoSideScroll(page);
    });

    test('scales: the hub, its circle and the selected key, a Home page', async ({ page }) => {
      known(name, 'scales-hub');
      const wide = VIEWPORTS[name].width >= 700;
      await page.goto('./#/scales');
      await expect(page.getByRole('heading', { level: 1, name: 'Scales' })).toBeVisible();
      // The hub is opened from Home: Home stays current, in the tab bar on phone and in the header on tablet and desktop.
      const nav = wide ? page.getByRole('banner').getByRole('navigation', { name: 'Main' }) : page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await expectClickable(page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Minor' }));
      // The keys are named as said (F sharp major), as a screen reader would not read F♯ right.
      const circle = page.getByRole('group', { name: 'Circle of fifths, major keys' });
      for (const key of ['C major', 'F sharp major', 'B major', 'D flat major']) await expectClickable(circle.getByRole('button', { name: new RegExp('^' + key) }));
      await circle.getByRole('button', { name: /^D major/ }).click();
      await expect(page.getByRole('button', { name: 'Practice D major' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Practice D major' }));
      await expectClickable(page.getByRole('link', { name: 'Options' }));
      await expectClickable(page.getByRole('button', { name: /^Go round the circle/ }));
      if (wide) await expectNoOverlap(page.locator('.hub-circle-col'), page.locator('.hub-sel'));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectCircleTargets(page);
      // Minor: the inner ring comes to the front; tapping the selected bottom key again switches its spelling.
      await page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Minor' }).click();
      const minor = page.getByRole('group', { name: 'Circle of fifths, minor keys' });
      await expectCircleTargets(page);
      await minor.getByRole('button', { name: /^B flat minor/ }).click();
      await minor.getByRole('button', { name: /^B flat minor/ }).click();
      await expect(page.getByRole('button', { name: 'Practice A♯ minor' })).toBeVisible();
      // Seven sharps, seven flats and six sharps read whole between the inner ring's keys, and so do C♯ major's seven
      // sharps between the faint minor keys.
      await expectSigUncovered(page);
      await minor.getByRole('button', { name: /^G sharp minor/ }).click();
      await minor.getByRole('button', { name: /^G sharp minor/ }).click();
      await expect(page.getByRole('button', { name: 'Practice A♭ minor' })).toBeVisible();
      await expectSigUncovered(page);
      await minor.getByRole('button', { name: /^D sharp minor/ }).click();
      await expect(page.getByRole('button', { name: 'Practice D♯ minor' })).toBeVisible();
      await expectSigUncovered(page);
      await page.getByRole('group', { name: 'Major or minor' }).getByRole('button', { name: 'Major' }).click();
      const major = page.getByRole('group', { name: 'Circle of fifths, major keys' });
      await major.getByRole('button', { name: /^D flat major/ }).click();
      await major.getByRole('button', { name: /^D flat major/ }).click();
      await expect(page.getByRole('button', { name: 'Practice C♯ major' })).toBeVisible();
      await expectSigUncovered(page);
      await expectNoSideScroll(page);
    });

    test('scales: setup and start', async ({ page }) => {
      known(name, 'scales-setup');
      await page.goto('./#/scales/setup');
      await expect(page.getByRole('heading', { name: 'Scale practice' })).toBeVisible();
      await expectClickable(page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: 'All 15' }));
      await expectClickable(page.getByRole('button', { name: /^Melodic minor/ }));
      await expectClickable(page.getByRole('switch', { name: /^Play each note/ }));
      await expectClickable(page.getByRole('button', { name: 'Start · 1 scale' }));
      if (desktopLayout || tabletLayout) await expectBeside(page.locator('.wide-main'), page.locator('.wide-side'));
      await page.getByRole('group', { name: 'Keys' }).getByRole('button', { name: 'All 15' }).click();
      await expect(page.getByRole('button', { name: 'Start · 15 scales' })).toBeVisible();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('scales: play G major on the piano, then round done', async ({ page }) => {
      known(name, 'scales-play');
      // The Scales piano shows its letters even with Read notes' labels off.
      await seed(page, {
        prefs: { pianoLabels: 'off' },
        progress: { scales: { settings: { keyMode: 'one', keys: ['G'], types: ['major'], input: 'piano', direction: 'up', write: 'signs', showSteps: true, playNotes: true }, stars: {} } },
      });
      await page.goto('./#/scales/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      const keys = page.getByRole('group', { name: /^Piano keyboard from G to A/ }).getByRole('button');
      await expect(keys).toHaveCount(15);
      // The whole piano with its letters in view without scrolling, in a phone browser too (DESIGN.md §9).
      for (let i = 0; i < 15; i++) await expectClickable(keys.nth(i), inPlace);
      await expect(page.locator('.spiano .piano-label')).toHaveText(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']);
      if (portraitLayout) for (const label of await page.locator('.spiano .piano-label').all()) await expect(label).toBeInViewport({ ratio: 1 });
      await expectClickable(page.getByRole('button', { name: 'Skip to summary' }), inPlace);
      if (portraitLayout) await expectFits(page);
      // A phone on its side: the staff, the degrees, the feedback and Skip to summary fit its left column, and where a
      // shorter one scrolls it, Tab leaves room under Skip for its focus ring.
      if (name === 'phone-landscape') {
        await expectFits(page);
        await expectSkipWhole(page);
        await expectSkipRingOnShorterPhone(page);
      }
      // Tablet (Read notes' NoteTablet pattern): the exercise header, the degrees in the staff card, a tall piano.
      if (tabletLayout && portraitLayout) {
        await expect(page.locator('.dplay-head--tablet .brand')).toBeVisible();
        await expect(page.locator('.dplay-head--tablet .mono-line')).toHaveText('Scale 1 of 1');
        await expectClickable(page.getByRole('link', { name: 'Quit' }), inPlace);
        await expect(page.locator('.stab-staff').getByRole('list', { name: 'Scale degrees going up' })).toBeVisible();
        expect((await keys.first().boundingBox())!.height, 'a tall piano').toBeGreaterThanOrEqual(200);
      }
      // Desktop: the Mistakes card's stars rule breaks only after a "·", never inside a part ("2–3" over "★"), even
      // with no room at all.
      if (desktopLayout) {
        const rule = page.locator('.sstats .nstat-text');
        await expect(rule).toHaveText(/^0 mistakes ★★★\s· 1 ★★\s· 2–3 ★$/);
        const lines = await rule.evaluate((el) => {
          el.style.width = '0';
          const byTop = new Map<number, string>();
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let node = walk.nextNode() as Text | null; node; node = walk.nextNode() as Text | null) {
            for (let i = 0; i < node.length; i++) {
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const r = range.getClientRects()[0];
              if (r) byTop.set(Math.round(r.top), (byTop.get(Math.round(r.top)) ?? '') + node.data[i]);
            }
          }
          el.style.width = '';
          return [...byTop.values()].map((line) => line.replace(/\s+/g, ' ').trim());
        });
        expect(lines, 'the lines of the stars rule').toEqual(['0 mistakes ★★★ ·', '1 ★★ ·', '2–3 ★']);
      }
      // Nothing to hear or start over before the first note.
      await expect(page.getByRole('button', { name: /^Hear it so far/ })).toBeHidden();
      await expect(page.getByRole('button', { name: /^Start over/ })).toBeHidden();
      // G A B C D E F♯ G: the F♯ is the black key between F and G.
      const piano = page.getByRole('group', { name: /^Piano keyboard from G to A/ });
      const key = (name: string) => piano.getByRole('button', { name: new RegExp('^' + name + '(,|$)') });
      await key('G').first().click();
      await expectClickable(page.getByRole('button', { name: /^Hear it so far/ }));
      await expectClickable(page.getByRole('button', { name: /^Start over/ }));
      for (const k of ['A', 'B', 'C', 'D', 'E']) await key(k).first().click();
      await key('F sharp or G flat').click();
      await key('G').nth(1).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^G major: done, no mistakes/);
      await expectClickable(page.getByRole('button', { name: /^Hear the scale/ }));
      await expectClickable(page.getByRole('button', { name: /^See the round/ }));
      if (name === 'phone-landscape') {
        await expectFits(page);
        await expectSkipWhole(page);
      }
      await expectNoSideScroll(page);
      await page.getByRole('button', { name: /^See the round/ }).click();
      await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
      await expect(page.getByLabel('1 of 1 scale without a mistake')).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'New round' }));
      await expectClickable(page.getByRole('link', { name: 'Change setup' }));
      // Tablet and desktop: the scales and the circle on the left; the score and the actions in the side panel beside them.
      if (VIEWPORTS[name].width >= 700) {
        const main = page.locator('.wide-main');
        const side = page.locator('.wide-side');
        const [m, s] = [(await main.boundingBox())!, (await side.boundingBox())!];
        expect(s.x, 'the side panel is right of the main column').toBeGreaterThanOrEqual(m.x + m.width);
        expect(s.y < m.y + m.height && m.y < s.y + s.height, 'the side panel is beside the main column').toBe(true);
        await expect(main.getByRole('list', { name: 'Scales in this round' })).toBeVisible();
        await expect(main.locator('.cprog')).toBeVisible();
        await expect(side.getByLabel('1 of 1 scale without a mistake')).toBeVisible();
        await expectClickable(side.getByRole('button', { name: 'New round' }));
        await expectClickable(side.getByRole('link', { name: 'Change setup' }));
      } else {
        await expect(page.locator('.wide')).toHaveCount(0);
      }
      // The score line never breaks inside the XP ("+56" / "XP" in the tablet's side panel), as on Read notes.
      const xp = page.locator('.score-sub b');
      await expect(xp).toHaveText(/^\+\d+ XP$/);
      const xpLines = await xp.evaluate((el) => {
        const line = el.parentElement!;
        line.style.width = '0';
        const n = el.getClientRects().length;
        line.style.width = '';
        return n;
      });
      expect(xpLines, 'the XP on one line').toBe(1);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('scales: C♯ major and B♭ major with their signs and A♯ melodic minor with the key signature fit on the staff, the cursor too', async ({ page }) => {
      known(name, 'scales-staff-fit');
      // The computer keys of the Scales piano: A S D … on the white keys, W E R … on the black keys between them.
      const keysFor = (s: Scale): string[] => {
        const w = pianoWindow(s);
        return scaleNotes(s).map((n) => (w.whites.includes(n.midi) ? 'ASDFGHJKL'[w.whites.indexOf(n.midi)] : 'WERTYUIO'[w.blacks.find((b) => b.midi === n.midi)!.after - 1]));
      };
      // B♭ major's last flat (B♭5) reaches highest over the staff, C♯ major's first sharp (C♯4) lowest under it.
      const scales = [
        { scale: { key: 'C#', type: 'major' } as Scale, write: 'signs', done: /^C♯ major: done/ },
        { scale: { key: 'Bb', type: 'major' } as Scale, write: 'signs', done: /^B♭ major: done/ },
        { scale: { key: 'C#', type: 'melodic' } as Scale, write: 'keySig', done: /^A♯ melodic minor: done/ },
      ];
      for (const { scale, write, done } of scales) {
        await seed(page, {
          progress: { scales: { settings: { keyMode: 'one', keys: [scale.key], types: [scale.type], input: 'piano', direction: 'up', write, showSteps: true, playNotes: false }, stars: {} } },
        });
        await page.goto('./#/scales/setup');
        // A fresh load, so the app reads the settings just seeded (a new hash alone keeps the app and its settings).
        await page.reload();
        await page.getByRole('button', { name: 'Start · 1 scale' }).click();
        // The staff keeps one size while the notes come in.
        const staff = page.locator('.splay-staff-svg svg');
        const size = (): Promise<(string | null)[]> => staff.evaluate((svg) => [svg.getAttribute('width'), svg.getAttribute('height')]);
        await expect(staff).toBeVisible();
        const first = await size();
        const keys = keysFor(scale);
        // Seven notes in: the seventh and the eighth note's place are inside the staff.
        for (const k of keys.slice(0, 7)) await page.keyboard.press(k);
        await expect(page.locator('.splay-staff-svg .vf-stavenote')).toHaveCount(7);
        await expectStavesFit(page);
        expect(await size(), 'the staff after seven notes').toEqual(first);
        await page.keyboard.press(keys[7]);
        await expect(page.locator('.nfeedback')).toHaveText(done);
        await expect(page.locator('.splay-staff-svg .vf-stavenote')).toHaveCount(8);
        await expectStavesFit(page);
        expect(await size(), 'the staff when done').toEqual(first);
        // The staff taller by the room for its signs, the screen still fits, on a phone on its side too.
        if (portraitLayout || name === 'phone-landscape') await expectFits(page);
        if (name === 'phone-landscape') {
          await expectSkipWhole(page);
          await expectSkipRingOnShorterPhone(page);
        }
      }
    });

    test('scales: up and down fits with its second degree row, on the piano and with the signs', async ({ page }) => {
      known(name, 'scales-up-down');
      // Up and down adds the way back as a second degree row (DESIGN.md §3.7): G major on the piano, A♯ harmonic minor
      // with the signs, whose long name and four sign buttons take the most room on a 320 px phone, G♯ harmonic minor,
      // whose done line names all 15 notes, and B♭ harmonic minor: its high B♭ with its flat makes the tallest staff (as
      // in every B♭ scale), under an eyebrow that takes two lines at 375 px beside "2 mistakes".
      const rounds = [
        { keys: ['G'], types: ['major'], input: 'piano', title: 'G major', signs: 0 },
        { keys: ['C#'], types: ['harmonic'], input: 'names', title: 'A♯ harmonic minor', signs: 4 },
        { keys: ['B'], types: ['harmonic'], input: 'names', title: 'G♯ harmonic minor', signs: 4 },
        { keys: ['Db'], types: ['harmonic'], input: 'names', title: 'B♭ harmonic minor', signs: 3 },
      ];
      for (const { title, signs: signCount, ...round } of rounds) {
        await seed(page, { progress: { scales: { settings: { keyMode: 'one', direction: 'upDown', write: 'signs', showSteps: true, playNotes: false, ...round }, stars: {} } } });
        await page.goto('./#/scales/setup');
        // A fresh load, so the app reads the settings just seeded.
        await page.reload();
        await page.getByRole('button', { name: 'Start · 1 scale' }).click();
        await expect(page.getByText(title, { exact: true })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Scale degrees going down' })).toBeVisible();
        if (round.input === 'piano') {
          const keys = page.getByRole('group', { name: /^Piano keyboard from G to A/ }).getByRole('button');
          for (let i = 0; i < 15; i++) await expectClickable(keys.nth(i), inPlace);
          if (portraitLayout) for (const label of await page.locator('.spiano .piano-label').all()) await expect(label).toBeInViewport({ ratio: 1 });
        } else {
          // Four signs where the scale has a double sharp (A♯ and G♯ harmonic minor), three for B♭ harmonic minor.
          const signs = page.getByRole('group', { name: /^Sign for / }).getByRole('button');
          await expect(signs).toHaveCount(signCount);
          for (let i = 0; i < signCount; i++) await expectClickable(signs.nth(i), inPlace);
          await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
          await expectTouchHeight(signs.first());
        }
        await expectClickable(page.getByRole('button', { name: 'Skip to summary' }), inPlace);
        if (portraitLayout || deskFits) await expectFits(page);
        if (name === 'phone-landscape') {
          await expectSkipWhole(page);
          await expectSkipRingOnShorterPhone(page);
        }
        // Each line the feedback says on the way, from why the first note is wrong to the done line, stays in view.
        await answerUpAndDown(page, name, { key: round.keys[0], type: round.types[0] } as Scale, round.input, { hint: 'Hint', next: /^Next scale/, skip: 'Skip to summary' });
        await expectNoSideScroll(page);
      }
    });

    test('scales: spell E harmonic minor with the signs', async ({ page }) => {
      known(name, 'scales-spell');
      await seed(page, { progress: { scales: { settings: { keyMode: 'one', keys: ['G'], types: ['harmonic'], input: 'names', direction: 'up', write: 'signs', showSteps: true, playNotes: false }, stars: {} } } });
      await page.goto('./#/scales/setup');
      await page.getByRole('button', { name: 'Start · 1 scale' }).click();
      await expect(page.getByText('E harmonic minor', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Hear it so far/ })).toBeHidden();
      await expect(page.getByRole('button', { name: /^Start over/ })).toBeHidden();
      const signs = page.getByRole('group', { name: 'Sign for E' }).getByRole('button');
      await expect(signs).toHaveCount(3);
      for (let i = 0; i < 3; i++) await expectClickable(signs.nth(i), inPlace);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), inPlace);
      if (portraitLayout) await expectFits(page);
      // Tablet: the sign buttons as tall as on desktop, in the answer card with Hint and Next scale.
      if (tabletLayout && portraitLayout) {
        await expect(page.locator('.dplay-head--tablet .brand')).toBeVisible();
        expect((await signs.first().boundingBox())!.height).toBeGreaterThanOrEqual(100);
        await expect(page.locator('.stab-answer').getByRole('button', { name: 'Hint' })).toBeVisible();
      }
      await signs.nth(1).click();
      await expectClickable(page.getByRole('button', { name: /^Hear it so far/ }));
      await expectClickable(page.getByRole('button', { name: /^Start over/ }));
      await page.getByRole('group', { name: 'Sign for F' }).getByRole('button', { name: /^F sharp/ }).click();
      await page.getByRole('group', { name: 'Sign for G' }).getByRole('button').nth(2).click();
      await expect(page.locator('.nfeedback')).toHaveText(/^Not G♯\. From F♯, go up a half step/);
      // A why of two lines in a phone's landscape column: the screen still fits, with Skip to summary whole under it.
      if (portraitLayout || name === 'phone-landscape') await expectFits(page);
      if (name === 'phone-landscape') {
        await expectSkipWhole(page);
        await expectSkipRingOnShorterPhone(page);
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('learn: chapter list and chapters 9–10', async ({ page }) => {
      known(name, 'learn');
      const { width } = VIEWPORTS[name];
      const layout = width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'phone';
      await page.goto('./#/learn');
      // Chapter 1 starts open. Tablet and desktop use the width: its sections sit in two columns, read down.
      // Measured together, after the web fonts: a font that loads between two measurements moves the list.
      await page.getByRole('link', { name: /^1\.3/ }).waitFor();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const [first, third] = await page.evaluate(() =>
        ['1.1', '1.3'].map((id) => [...document.querySelectorAll('a')].find((el) => el.textContent?.trim().startsWith(id))!.getBoundingClientRect().y),
      );
      expect(third === first, 'sections in two columns').toBe(layout !== 'phone');
      // Subtitles wrap rather than end in "…", and a chapter's ring shows around it (its card once cut it off).
      await expectNoClippedLabels(page);
      await expectFocusRing(page.getByRole('button', { name: /^2\s*Note values/ }));
      // So does a section's, also at the top of a column (the open chapter's inner box once cut off its top edge).
      await expectFocusRing(page.getByRole('link', { name: /^1\.1/ }));
      await expectFocusRing(page.getByRole('link', { name: /^1\.3/ }));
      // Opening chapter 10 closes chapter 1.
      const ch10 = page.getByRole('button', { name: /^10\s*Key signatures/ });
      await expectClickable(ch10);
      await ch10.click();
      await expect(page.getByRole('button', { name: /^1\s*Pulse and meter/ })).toHaveAttribute('aria-expanded', 'false');
      await expectClickable(page.getByRole('link', { name: /^10\.2/ }));
      await expectNoSideScroll(page);

      await page.getByRole('link', { name: /^10\.2/ }).click();
      await expect(page.getByRole('heading', { name: /10\.2\s*The order of sharps and flats/ })).toBeInViewport();
      // A link into the chapter at ?s= gives the section focus too (on phone this list is the only way to jump).
      await expect(page.locator('#s10-2')).toBeFocused();
      // Jumping to a section: section chips on tablet, the chapter sidebar on desktop, the chapter list on phone.
      const jump = page.getByRole('navigation', { name: 'Sections' });
      await expect(jump).toHaveCount(layout === 'phone' ? 0 : 1);
      if (layout === 'desktop') await expectNoOverlap(page.locator('.learn-side'), page.locator('.learn-main'));
      // The Learn link over the title is a 44 px tap; so are the section chips (every tablet size here is a touch
      // screen), as the sidebar's rows are on one.
      if (layout !== 'phone') await expectHitHeight(page.locator('a.learn-crumb'));
      if (layout === 'tablet') for (const chip of await jump.getByRole('link').all()) await expectTouchHeight(chip);
      if (layout !== 'phone') {
        await expectClickable(jump.getByRole('link', { name: /Naming the key/ }));
        await jump.getByRole('link', { name: /Naming the key/ }).click();
        await expect(page.getByRole('heading', { name: /10\.3\s*Naming the key/ })).toBeInViewport();
        // Focus goes along, so Tab goes on in the section and does not scroll back up to the link.
        await expect(page.locator('#s10-3')).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('#s10-3')), 'Tab stays in 10.3').toBe(true);
      }
      if (layout === 'desktop') {
        await expectClickable(jump.getByRole('link', { name: 'Quick check' }));
        await jump.getByRole('link', { name: 'Quick check' }).click();
        await expect(page.getByRole('button', { name: 'D', exact: true })).toBeInViewport();
        await expect(page.locator('#scheck')).toBeFocused();
        await expectClickable(page.locator('.learn-side').getByRole('link', { name: /Notes on the staff/ }));
        await expectFocusRing(page.locator('.learn-side').getByRole('link', { name: /Notes on the staff/ }));
      }
      await expectClickable(page.getByRole('link', { name: 'Practice keys up to three signs →' }));
      await expectClickable(page.getByRole('link', { name: /Previous\s*9 · Sharps, flats and naturals/ }));
      await expectClickable(page.getByRole('link', { name: 'Practice reading notes' }));
      await expectNoSideScroll(page);

      // The piano diagrams of chapter 9 fit beside their text.
      await page.getByRole('link', { name: /Previous\s*9 · Sharps, flats and naturals/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: /Sharps, flats and naturals/ })).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Practice on the piano →' }));
      await expectClickable(page.getByRole('link', { name: /Next\s*10 · Key signatures/ }));
      await expectNoSideScroll(page);
    });

    // Phone and tablet have no chapter sidebar. One test per chapter, as each tabs through some 20 links and back.
    if (desktopLayout) {
      test("learn: the chapter sidebar shows the open chapter's sections, and the chapter stays at its top", async ({ page }) => {
        // On a short screen the sidebar scrolls on its own: it once opened at its top, with the open chapter (the last
        // of the list for 9 to 11) below its bottom edge.
        for (const c of CHAPTERS) {
          await page.goto(`./#/learn/${c.n}`);
          await expect(page.getByRole('heading', { level: 1 })).toContainText(String(c.n));
          const open = page.locator('.learn-side-chapter');
          await expect(open.locator('a')).toHaveCount(c.sections.length + 1);
          for (const item of [open.locator('.learn-side-title'), ...(await open.locator('a').all())]) {
            await expect(item, `chapter ${c.n}: ${await item.textContent()}`).toBeInViewport({ ratio: 1 });
          }
          expect(await page.locator('.learn-chapter').evaluate((el) => el.scrollTop), `chapter ${c.n} opens at its top`).toBe(0);
        }
      });

      for (const c of CHAPTERS) {
        test(`learn: Tab through chapter ${c.n}'s sidebar shows each link's whole focus ring`, async ({ page }) => {
          known(name, `learn-side-ring-${c.n}`);
          await page.goto(`./#/learn/${c.n}`);
          await expect(page.getByRole('heading', { level: 1 })).toContainText(String(c.n));
          await expectRingsInSideMenu(page.locator('.learn-side'));
        });
      }
    }

    test('learn: rhythm chapters count under the notes, the note tree switches, words answer the quick check', async ({ page }) => {
      known(name, 'learn-rhythm');
      await page.goto('./#/learn/1');
      await expect(page.getByRole('heading', { level: 1, name: /Pulse and meter/ })).toBeVisible();
      await expect(page.getByText('Start here · Path units 2, 6, 10')).toBeVisible();
      // 1.2: two bars of 4/4 counted 1 2 3 4 | 1 (2) 3 (4).
      const bars = page.getByRole('img', { name: /^Two bars of 4\/4: four quarter notes/ });
      await expect(bars.locator('.staff-counts text')).toHaveText(['1', '2', '3', '4', '1', '(2)', '3', '(4)']);
      await expectClickable(page.getByRole('link', { name: 'Practice feeling beat 1 →' }));
      await expectNoSideScroll(page);

      await page.goto('./#/learn/2?s=2.2');
      const tree = page.locator('.learn-tree');
      await expect(tree.getByText(/^sixteenth note$/i)).toBeVisible();
      // Each row's last note or rest ends before the final bar line, also the sixteenths on a 320 px phone.
      const clear = (): Promise<number> =>
        tree.locator('.learn-tree-row svg:has(.vf-stave)').evaluateAll((svgs) =>
          Math.min(...svgs.map((svg) => {
            const notes = svg.querySelectorAll('g.vf-stavenote');
            const bar = Math.max(...[...svg.querySelectorAll('rect[width="1"]')].map((r) => r.getBoundingClientRect().left));
            return bar - notes[notes.length - 1].getBoundingClientRect().right;
          })),
        );
      await expect.poll(clear, { message: 'room between the last note and the final bar line' }).toBeGreaterThan(0);
      await expectClickable(tree.getByRole('button', { name: 'Rests' }));
      await tree.getByRole('button', { name: 'Rests' }).click();
      await expect(tree.getByText(/^sixteenth rest$/i)).toBeVisible();
      await expect.poll(clear, { message: 'room between the last rest and the final bar line' }).toBeGreaterThan(0);
      await expectNoSideScroll(page);

      // The counts stay apart: 3.2's Write example, 5.1–5.3 and 7.1's triplets were the tightest on a 320 px phone.
      for (const n of [3, 5, 7]) {
        await page.goto(`./#/learn/${n}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(String(n));
        await expectCountsApart(page);
      }

      // Answers in words get a row each and stay clickable.
      await page.goto('./#/learn/5?s=check');
      const right = page.getByRole('button', { name: 'A quarter tied to an eighth', exact: true });
      await expectClickable(right);
      await right.click();
      await expect(page.locator('.learn-check .nfeedback')).toContainText('Right.');
      await expectClickable(page.getByRole('link', { name: /Next\s*6 · Off the beat/ }));
      await expectNoSideScroll(page);
    });

    test('learn: a section is read once its quick check is answered right', async ({ page }) => {
      known(name, 'learn-check');
      await page.goto('./#/learn/2?s=2.1');
      const check = page.getByRole('group', { name: /^A filled note head with a stem and two flags/ });
      await expect(check.getByText('Answer it right to mark this section read.')).toBeVisible();
      // A wrong answer gives a hint, not the answer, and the section stays unread.
      await expectClickable(check.getByRole('button', { name: 'An eighth (½ beat)' }));
      await check.getByRole('button', { name: 'An eighth (½ beat)' }).click();
      // Shown under the answers, and read out by the app's live region.
      await expect(check.locator('.nfeedback')).toHaveText(/^Not quite\. Start from the quarter note/);
      await expect(page.locator('#announcer')).toHaveText(/^Not quite\. Start from the quarter note/);
      await expect(check.locator('.learn-answer.is-right')).toHaveCount(0);
      await expect(check.getByText('✓ read')).toHaveCount(0);
      await check.getByRole('button', { name: 'A sixteenth (¼ beat)' }).click();
      await expect(check.locator('.nfeedback')).toHaveText(/^Right\. Each flag halves the note/);
      await expect(page.locator('#announcer')).toHaveText(/^Right\. Each flag halves the note/);
      await expect(check.getByText('✓ read')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Practice whole, half and quarter notes →' }));
      await expectNoSideScroll(page);

      // The Learn tab counts it; 2.2 is still unread.
      await page.goto('./#/learn');
      await page.getByRole('button', { name: /^2\s*Note values/ }).click();
      await expect(page.getByRole('link', { name: /^2\.1.*✓ read/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /^2\.2/ })).not.toContainText('✓ read');
      await expect(page.getByText(`1 / ${CHAPTERS.flatMap((c) => c.sections).length} sections`)).toBeVisible();
    });

    test('learn: every chapter fits, with its practice links reachable', async ({ page }) => {
      known(name, 'learn-all');
      for (const c of CHAPTERS) {
        await page.goto(`./#/learn/${c.n}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(String(c.n));
        await expect(page.locator('.learn-section')).toHaveCount(c.sections.length);
        await expect(page.locator('.learn-check--section')).toHaveCount(c.sections.length);
        await expect(page.locator('.learn-practice')).toHaveCount(c.sections.filter((s) => s.practice).length);
        await expectNoSideScroll(page);
        await expectStavesFit(page);
        await expectLearnWordsApart(page);
        if (c.sections.some((s) => s.practice)) await expectClickable(page.locator('.learn-practice').last());
        await expectClickable(page.getByRole('link', { name: 'Back to all chapters' }));
      }
    });

    test('learn: examples play one at a time: the pulse, a rhythm, a scale and the piano', async ({ page }) => {
      known(name, 'learn-sound');
      await page.goto('./#/learn/1');
      const pulse = page.getByRole('group', { name: /^Four seconds of beats/ });
      await expectClickable(pulse.getByRole('button', { name: 'Play: 60 BPM' }));
      await pulse.getByRole('button', { name: 'Play: 60 BPM' }).click();
      await expect(pulse.getByRole('button', { name: 'Stop: 60 BPM' })).toBeVisible();
      // Starting another example stops the first. Each button names its example.
      const bars = page.locator('#s1-2').getByRole('button', { name: /^Play: Two bars of 4\/4/ });
      await expectClickable(bars);
      await bars.click();
      await expect(pulse.getByRole('button', { name: 'Play: 60 BPM' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Stop: / })).toHaveCount(1);
      await expect(page.locator('#s1-2').getByRole('button', { name: /^Stop: Two bars of 4\/4/ })).toBeVisible();
      await expectNoSideScroll(page);

      // Opening another chapter stops it. A scale plays, and so do the piano's marked keys and each key.
      await page.goto('./#/learn/11?s=11.1');
      await expect(page.getByRole('heading', { level: 1, name: /Scales/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Stop: / })).toHaveCount(0);
      const scale = page.locator('#s11-1');
      await expect(scale.getByRole('button', { name: /^Play: / })).toHaveCount(2);
      await expectClickable(scale.getByRole('button', { name: 'Play: C major' }));
      const piano = scale.getByRole('group', { name: /^One piano octave/ });
      await expectClickable(piano.getByRole('button', { name: 'E', exact: true }));
      await expectClickable(piano.getByRole('button', { name: 'F sharp or G flat' }));
      await expectNoSideScroll(page);
    });

    test('learn: a rhythm practice link lands on Play, and Quit returns to the section', async ({ page }) => {
      known(name, 'learn-practice');
      await seed(page, { prefs: { seenHowTo: true, seenHold: true } });
      await page.goto('./#/learn/1?s=1.1');
      const link = page.getByRole('link', { name: 'Practice at a steady tempo →' });
      await expectClickable(link);
      await link.click();
      await expect(page).toHaveURL(/#\/play\?from=1\.1$/);
      const quit = page.getByRole('link', { name: /^Quit/ });
      await expectClickable(quit, { scroll: false });
      await expectNoSideScroll(page);
      await quit.click();
      await expect(page).toHaveURL(/#\/learn\/1\?s=1\.1$/);
      await expect(page.getByRole('heading', { name: /1\.1\s*The beat and tempo/ })).toBeInViewport();
    });

    test('progress: rhythm, notes and scales', async ({ page }) => {
      known(name, 'progress');
      const wide = desktopLayout || tabletLayout;
      // The boards' sample player on the boards' today, Thursday 15 October 2026 (e2e/progressFixture.ts).
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      await seed(page, { progress: richProgress(), prefs: PROGRESS_PREFS });
      await page.goto('./#/progress');
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
      // A tab of its own, the fourth of five: current in the tab bar on phone and in the header on tablet and desktop.
      const nav = wide ? page.getByRole('banner').getByRole('navigation', { name: 'Main' }) : page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link')).toHaveText(['Home', 'Path', 'Learn', 'Progress', 'Settings']);
      const tab = nav.getByRole('link', { name: 'Progress', exact: true });
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expectClickable(tab);
      if (!wide) await expectTouchHeight(tab);

      const h2 = page.getByRole('main').getByRole('heading', { level: 2 });
      const views = page.getByRole('group', { name: 'Show progress for' });
      const skills = page.getByRole('link', { name: /^Skill levels/ });
      const show = async (view: string): Promise<void> => {
        // The app's segmented control (40 px buttons in their track), checked as in the other screens' tests.
        const button = views.getByRole('button', { name: view, exact: true });
        await expectClickable(button);
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        // Skill levels heads every view.
        await expectClickable(skills);
        await expectTouchHeight(skills);
      };
      // Tablet and desktop: the Level card with its ranks and the streak calendar head every view (App design canvas,
      // ProgressTablet and ProgressDesktop); phone has the level line, and the calendar only in Rhythm (Mobile · Progress).
      const level = page.getByRole('region', { name: 'Level 7 · Measure' });
      const streak = page.getByRole('region', { name: '12-day streak' });
      const head = wide ? ['Level 7 · Measure', '12-day streak'] : [];

      // Rhythm, where every visit starts.
      await expect(views.getByRole('button', { name: 'Rhythm', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await show('Rhythm');
      await expect(skills).toContainText('25 of 60 levels · 6 skills · 1 review due');
      await expect(h2).toHaveText(
        wide
          ? [...head, 'Accuracy · 14 days', 'Timing tendency', 'Skill map · rhythm cells', 'Minutes this week', 'Achievements']
          : ['12-day streak', 'Accuracy · 14 days', 'Minutes this week', 'Skill map · rhythm cells', 'Timing tendency', 'Achievements'],
      );
      await expect(page.getByRole('img', { name: /^Practice calendar, Sep 14 to Oct 18\. Practised 28 of 32 days;/ })).toBeVisible();
      await expect(page.locator('.prog-cal-day.is-now')).toHaveText('15');
      await expect(page.getByRole('img', { name: /^Rhythm accuracy per day from Oct 2 to Oct 15, .*80% today/ })).toBeVisible();
      await expect(page.getByRole('img', { name: /^Average timing offset per day from Oct 2 to Oct 15:/ })).toBeVisible();
      await expect(page.getByRole('img', { name: /^Minutes practised this week: .*; 51 minutes in total\.$/ })).toBeVisible();
      await expect(page.getByRole('listitem', { name: 'Ties: 78%, weak spot' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Achievements' }).getByText('3 earned')).toBeVisible();
      await expectCountsWithWords(page);
      const practice = page.getByRole('link', { name: 'Practice weak spots' });
      await expectClickable(practice);
      await expectTouchHeight(practice);
      if (wide) {
        await expect(level.getByRole('list', { name: 'Ranks' }).locator('[aria-current="step"]')).toContainText('Measure');
        await expect(level.getByText('1445 / 1750 XP')).toBeVisible();
        if (tabletLayout) {
          // Tablet: the Level card beside the streak calendar, then the cards two by two (the skill map full width).
          await expectNoOverlap(level, streak);
          const [l, s] = [(await level.boundingBox())!, (await streak.boundingBox())!];
          expect(s.x, 'the streak calendar is right of the Level card').toBeGreaterThanOrEqual(l.x + l.width - 1);
          expect(Math.abs(s.y - l.y), 'the Level card and the streak calendar start level').toBeLessThan(2);
          await expectNoOverlap(page.getByRole('region', { name: 'Accuracy · 14 days' }), page.getByRole('region', { name: 'Timing tendency' }));
          await expectNoOverlap(page.getByRole('region', { name: 'Minutes this week' }), page.getByRole('region', { name: 'Achievements' }));
        } else {
          // Desktop: the Level card, Skill levels and the streak calendar in a column on the left, the cards beside it.
          const aside = page.locator('.prog-aside');
          const main = page.locator('.prog-main');
          await expect(aside.getByRole('region', { name: 'Level 7 · Measure' })).toBeVisible();
          await expect(aside.getByRole('link', { name: /^Skill levels/ })).toBeVisible();
          await expect(aside.getByRole('region', { name: '12-day streak' })).toBeVisible();
          await expectNoOverlap(aside, main);
          const [a, m] = [(await aside.boundingBox())!, (await main.boundingBox())!];
          expect(m.x, 'the cards are right of the left column').toBeGreaterThanOrEqual(a.x + a.width - 1);
          await expect(main.getByRole('region', { name: 'Accuracy · 14 days' })).toBeVisible();
        }
      } else {
        await expect(page.getByText('1445 / 1750 XP')).toBeVisible();
        await expect(page.locator('.prog-head .streak-pill')).toHaveText('12-day streak');
        await expect(page.getByRole('list', { name: 'Ranks' })).toHaveCount(0);
      }
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);

      // Notes: accuracy per clef, the slowest notes and the last key.
      await show('Notes');
      await expect(h2).toHaveText(wide ? [...head, 'Accuracy per clef', 'Key', 'Slowest notes'] : ['Accuracy per clef', 'Slowest notes', 'Key']);
      await expect(page.getByRole('img', { name: 'Note reading accuracy: treble clef 88% and bass clef 74%.' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Slowest notes' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.getByText('G major · E minor')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Read notes', exact: true }));
      await expectTouchHeight(page.getByRole('link', { name: 'Read notes', exact: true }));
      if (tabletLayout) await expectNoOverlap(page.getByRole('region', { name: 'Accuracy per clef' }), page.getByRole('region', { name: 'Slowest notes' }));
      if (wide) await expect(streak).toBeVisible();
      else await expect(streak).toHaveCount(0);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);

      // Scales: the major scales round the circle and the minor keys started.
      await show('Scales');
      await expect(h2).toHaveText([...head, 'Major scales', 'Minor scales']);
      await expect(page.getByRole('img', { name: '5 of 15 major scales with two stars or more' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Major scales' }).getByRole('listitem')).toHaveCount(15);
      await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
      await expectClickable(page.getByRole('link', { name: 'Open the circle of fifths' }));
      await expectTouchHeight(page.getByRole('link', { name: 'Open the circle of fifths' }));
      if (tabletLayout) await expectNoOverlap(page.getByRole('region', { name: 'Major scales' }), page.getByRole('region', { name: 'Minor scales' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);
    });

    test('progress: a new player', async ({ page }) => {
      known(name, 'progress-new');
      const wide = desktopLayout || tabletLayout;
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      await seed(page, { progress: emptyProgress(), prefs: PROGRESS_PREFS });
      await page.goto('./#/progress');
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
      // A short line for each card instead of an empty chart, and no Practice weak spots until a cell has enough notes.
      await expect(page.getByText('0 of 60 levels · 6 skills · no review due')).toBeVisible();
      await expect(page.getByRole('img', { name: /^Practice calendar, .*; no streak yet\.$/ })).toBeVisible();
      await expect(page.getByText('No rhythm rounds in the last 14 days.')).toHaveCount(2);
      await expect(page.getByText('No practice this week yet.')).toBeVisible();
      await expect(page.getByRole('img', { name: /^Rhythm accuracy/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Practice weak spots' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Achievements' }).getByText('0 earned')).toBeVisible();
      if (wide) await expect(page.getByRole('region', { name: 'Level 1 · Tick' }).getByText('0 / 100 XP')).toBeVisible();
      else await expect(page.getByText('0 / 100 XP')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: /^Skill levels/ }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);
      const views = page.getByRole('group', { name: 'Show progress for' });
      await views.getByRole('button', { name: 'Notes', exact: true }).click();
      await expect(page.getByText('No Read notes round yet.')).toHaveCount(3);
      await expectClickable(page.getByRole('link', { name: 'Read notes', exact: true }));
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);
      await views.getByRole('button', { name: 'Scales', exact: true }).click();
      await expect(page.getByRole('img', { name: '0 of 15 major scales with two stars or more' })).toBeVisible();
      await expect(page.getByText('No minor scale started yet.')).toBeVisible();
      await expectClickable(page.getByRole('link', { name: 'Open the circle of fifths' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);
    });

    test('progress: practice weak spots opens the setup', async ({ page }) => {
      known(name, 'progress-weak-spots');
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      await seed(page, { progress: richProgress(), prefs: PROGRESS_PREFS });
      await page.goto('./#/progress');
      const practice = page.getByRole('link', { name: 'Practice weak spots' });
      await expectClickable(practice);
      await practice.click();
      await expect(page).toHaveURL(/#\/setup$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Free practice' })).toBeVisible();
      // The weak spots, ties (78%) and the dotted quarter + eighth (72%): ties and dotted notes on, with quarters and
      // eighths, ready to start.
      await expect(page.getByRole('button', { name: 'Ties', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Dotted', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Quarter note', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Eighth note', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expectClickable(page.getByRole('button', { name: /^Start · / }));
      await expectNoSideScroll(page);
    });

    test('skill levels: list and one skill', async ({ page }) => {
      known(name, 'skills');
      const wide = desktopLayout || tabletLayout;
      const nav = wide ? page.getByRole('banner').getByRole('navigation', { name: 'Main' }) : page.getByRole('navigation', { name: 'Main' });
      const tab = nav.getByRole('link', { name: 'Progress', exact: true });
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      await seed(page, { progress: richProgress(), prefs: PROGRESS_PREFS });
      await page.goto('./#/progress');
      await page.getByRole('link', { name: /^Skill levels/ }).click();
      await expect(page).toHaveURL(/#\/progress\/skills$/);
      // Skill levels (App design canvas, Mobile · Progress · skill levels; tablet and desktop: the 640 px column). The
      // Progress tab stays current.
      await expect(page.getByRole('heading', { level: 1, name: 'Skill levels' })).toBeVisible();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('img', { name: '25 of 60 levels' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Last 30 days' })).toContainText('review due · Theory');
      const rows = page.getByRole('region', { name: 'Your skills' }).getByRole('link');
      await expect(rows).toHaveCount(6);
      const skills = [['Rhythm reading', 6], ['Rhythm by ear', 4], ['Treble clef', 5], ['Bass clef', 3], ['Scales', 3], ['Theory', 4]] as const;
      for (const [skill, n] of skills) {
        const row = page.getByRole('link', { name: new RegExp(`^${skill}: level ${n} of 10\\.`) });
        await expectClickable(row);
        await expectTouchHeight(row);
      }
      // A level's name with a sign is said in words, as the Scales hub says its keys; the row shows the sign.
      const scales = page.getByRole('link', { name: /^Scales: level 3 of 10\. .*, A and E flat major\./ });
      await expect(scales).toBeVisible();
      await expect(scales).toContainText('next: A and E♭ major');
      const focus = page.getByRole('region', { name: 'Focus next' });
      await expect(focus.getByText(/is your lowest skill/)).toHaveText('Bass clef is your lowest skill: level 3, 2 levels behind treble clef.');
      await expectClickable(focus.getByRole('link', { name: 'Read bass notes' }));
      await expectTouchHeight(focus.getByRole('link', { name: 'Read bass notes' }));
      const back = page.getByRole('link', { name: 'Back to Progress' });
      await expect(back).toHaveAttribute('href', '#/progress');
      await expectClickable(back);
      await expectTouchHeight(back);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);

      // One skill: its level, the next level's checks with its button, 12 weeks and all ten levels.
      await page.getByRole('link', { name: /^Bass clef: level 3 of 10\./ }).click();
      await expect(page).toHaveURL(/#\/progress\/skills\/bass$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Bass clef' })).toBeVisible();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('img', { name: /^Level 3 of 10, and 0 of \d checks for level 4$/ })).toBeVisible();
      const next = page.getByRole('region', { name: 'Next · level 4' });
      await expect(next.getByText('Middle C down to F', { exact: true })).toBeVisible();
      await expect(next.getByRole('listitem').first()).toBeVisible();
      await expectClickable(next.getByRole('link', { name: 'Read bass notes' }));
      await expectTouchHeight(next.getByRole('link', { name: 'Read bass notes' }));
      await expect(page.getByRole('region', { name: 'Level · 12 weeks' }).getByRole('img')).toBeVisible();
      const ladder = page.getByRole('region', { name: 'All levels' });
      await expect(ladder.getByRole('listitem')).toHaveCount(10);
      await expect(ladder.getByText('Passed', { exact: true })).toHaveCount(3);
      const up = page.getByRole('link', { name: 'Back to Skill levels' });
      await expect(up).toHaveAttribute('href', '#/progress/skills');
      await expectClickable(up);
      await expectTouchHeight(up);
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await expectNoPageScroll(page);
      await up.click();
      await expect(page.getByRole('heading', { level: 1, name: 'Skill levels' })).toBeVisible();
      await page.getByRole('link', { name: 'Back to Progress' }).click();
      await expect(page).toHaveURL(/#\/progress$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();

      // A skill with checks met: their "Done:" for screen readers stays in the page, which the document does not scroll.
      await page.goto('./#/progress/skills/theory');
      await expect(page.getByRole('region', { name: 'Next · level 5' }).locator('.skill-checks li.is-done').first()).toBeVisible();
      await expectNoPageScroll(page);
    });

    test('scrolling: every page and the Path units scroll at the window\'s edge, not the column\'s', async ({ page }) => {
      known(name, 'scroll-edge');
      const screens = ['#/', '#/path', '#/setup', '#/settings', '#/changelog', '#/calibrate', '#/notes', '#/notes/key', '#/scales', '#/scales/setup',
        '#/learn', '#/learn/1', '#/learn/9', '#/progress', '#/progress/skills', '#/progress/skills/rhythm', '#/signin', '#/privacy'];
      for (const hash of screens) {
        await page.goto('./' + hash);
        await expect(page.getByRole('main')).toBeVisible();
        await expectScrollbarAtEdge(page);
      }
    });

    test('play: how to play, then the pad', async ({ page }) => {
      known(name, 'play');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expectClickable(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      // A phone in landscape has no Skip link: the pad takes the right column.
      if (portraitLayout) await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
      await expectFits(page);
      // Tablet (App design canvas, PlayTablet): the exercise header with the brand, Pause and Quit, the count and combo
      // cards, and a big pad. A phone on its side keeps the phone layout in two columns.
      if (tabletLayout && portraitLayout) {
        await expect(page.locator('.dplay-head--tablet .brand')).toBeVisible();
        await expect(page.locator('.dplay-head--tablet .eyebrow')).toHaveText(/^Lesson 2\.1 · /);
        await expectClickable(page.getByRole('button', { name: 'Pause' }), { scroll: false });
        await expectClickable(page.getByRole('link', { name: 'Quit' }), { scroll: false });
        await expect(page.locator('.tplay-count')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.tplay-combo')).toHaveText(/^Combo×0$/);
        expect((await pad(page).boundingBox())!.height, 'the pad fills the tablet').toBeGreaterThan(300);
        await expectNoOverlap(pad(page), page.getByRole('button', { name: 'Skip to results' }));
      }
      if (name === 'phone-landscape') await expect(page.locator('.play-top')).toBeVisible();
      await expectNoSideScroll(page);
    });

    test('play: sixteen bars fit, with the staff, the lane, the beat counter, the pad and Skip in view', async ({ page }) => {
      known(name, 'play-sixteen-bars');
      // The most Setup allows, holding each note: the staff shows a window of two rows. On a phone the timing lane shows
      // two rows of four bars, from the row being played (all four rows pushed Skip off a short phone); tablet and
      // desktop draw every bar. Desktop Play does not scroll either, on a 1280 × 720 laptop too (DESIGN.md §9 Scrolling).
      await seed(page, {
        prefs: { seenHowTo: true, seenHold: true, holdMode: 'hold', holdEarly: 'tap' },
        progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, hold: true, notes: ['quarter', 'eighth', 'half'], bars: 16, tempo: 60 } },
      });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      await expect(page.locator('.staff-fallback')).toHaveCount(0);
      // A phone in landscape keeps the phone layout. It scrolls the staff card in its own column; the pad is beside it.
      const tablet = tabletLayout && portraitLayout;
      await expect(page.locator('.lane-head')).toContainText(desktopLayout || tablet ? 'bars 1–16' : 'bars 1–8');
      if (portraitLayout) {
        await expect(page.locator(tablet ? '.tplay-staff' : '.play-staff')).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.beats')).toBeInViewport({ ratio: 1 });
        await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
      }
      if (!desktopLayout) {
        await expectClickable(pad(page), { scroll: false });
        await expectTouchHeight(pad(page));
      }
      await expectFits(page);
      if (tablet) {
        // Tablet: four bars a row. A smaller tablet window (700 × 1000, a tablet-wide window on a laptop) still fits,
        // with the pad tall enough.
        expect((await pad(page).boundingBox())!.height, 'the pad fills the tablet').toBeGreaterThan(300);
        await page.setViewportSize({ width: 700, height: 1000 });
        await expect(page.locator('.tplay-staff')).toBeInViewport({ ratio: 1 });
        await expectClickable(pad(page), { scroll: false });
        expect((await pad(page).boundingBox())!.height).toBeGreaterThan(150);
        await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
        await expectFits(page);
        await expectShortTabletFits(page);
      }
      if (desktopLayout) {
        // A 1366 × 768 laptop's window (1366 × 657 under Chrome's bars): the spacing tightens once more, and the pad and
        // the stat cards still fit under the staff.
        await page.setViewportSize({ width: 1366, height: 657 });
        await expect(page.locator('.dpad')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.dstats .card').last()).toBeInViewport({ ratio: 1 });
        await expectFits(page);
      }
      await expectNoSideScroll(page);
    });

    test("play: a window of a longer exercise ends with a plain bar line, and keeps room for a triplet's 3", async ({ page }) => {
      known(name, 'play-window');
      // Eight bars of 2/4 with a triplet only in bar 8 (seed 2), at 60 BPM: the window stays on bars 1–4 for 6 s.
      await seedRun(page, { ...QUARTERS, meters: ['2/4'], notes: ['quarter', 'eighth'], triplets: true, bars: 8, tempo: 60 }, 2);
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      const staff = page.locator('.play-staff, .tplay-staff, .dplay-staff').locator('svg:has(.vf-stave)');
      // Two bars a row show bars 1–4: the exercise goes on, so the last ends with a plain bar line. Four a row show all 8.
      const shown = await staff.locator('.vf-stave').count();
      expect([4, 8]).toContain(shown);
      await expect(staff.locator('rect[width="3"]')).toHaveCount(shown === 8 ? 1 : 0);
      // Room above for the 3 although bars 1–4 have no triplet: the staff keeps one height (2 × 86 + 12 − 6) as it moves.
      await expect(staff).toHaveAttribute('viewBox', /^0 0 [\d.]+ 178$/);
      await expectStaffNotCut(staff);
      // The taller staff still fits without scrolling: on the shortest phone (375 × 553) the pad gives up the room.
      await expectFits(page);
      await expectNoSideScroll(page);
    });

    test('play: the count-in says Count-in, with no note highlighted, then bar 1', async ({ page }) => {
      known(name, 'play-count-in');
      await seed(page, { prefs: { seenHowTo: true }, progress: { lessons: SOL_DONE } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      // The desktop layout from 1100 px wide (a tablet in landscape too); a tablet has the same exercise header.
      const desk = VIEWPORTS[name].width >= 1100;
      const line = page.locator(desk || (tabletLayout && portraitLayout) ? '.dplay-title .mono-line' : '.play-info .mono-line');
      await expect(line).toContainText('Count-in');
      await expect(page.locator(desk ? '.dbeats.is-count-in' : '.beats.is-count-in')).toBeVisible();
      await expect(page.locator('rect[data-cursor]')).toHaveCount(0);
      // Lesson 2.1 (rhythm 1.1): one bar of 4/4 at 60 BPM.
      await expect(page.getByRole('img', { name: /^Counting beat/ })).toBeAttached({ timeout: 6000 });
      await expect(line).toContainText('Bar 1 of 2');
      await expect(page.locator('.is-count-in')).toHaveCount(0);
      await expect(page.locator('rect[data-cursor]')).toHaveCount(1);
      await expectNoSideScroll(page);
    });

    test('play: what a lesson introduces, before the count-in', async ({ page }) => {
      known(name, 'play-intro');
      await seed(page, { prefs: { seenHowTo: true }, progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } } } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      const sheet = page.getByRole('dialog', { name: 'Half notes' });
      await expect(sheet.getByText('New in this lesson')).toBeVisible();
      await expectClickable(sheet.getByRole('link', { name: 'Learn more: Half note' }));
      await expectClickable(sheet.getByRole('button', { name: 'Listen' }));
      await expectClickable(sheet.getByRole('button', { name: 'Start' }));
      // Desktop: the dialog sits under the staff, so the rhythm stays readable.
      if (VIEWPORTS[name].width >= 1100) await expectNoOverlap(sheet, page.locator('.dplay-staff svg').first());
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('play with the analog metronome: pendulum and the pad', async ({ page }) => {
      known(name, 'play-analog');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.goto('./#/settings');
      await page.getByRole('group', { name: 'Beat counter style' }).getByRole('button', { name: 'Analog' }).click();
      await page.goto('./');
      await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.locator('.beats--analog')).toBeVisible();
      if (!name.startsWith('desktop') && !name.startsWith('laptop')) await expectClickable(pad(page), { scroll: false });
      // Tablet: the pendulum in the count card, and the page still fits.
      if (tabletLayout && portraitLayout) {
        await expect(page.locator('.tplay-count .beats--analog')).toBeVisible();
        await expectFits(page);
      }
      await expectNoSideScroll(page);
    });

    test('echo with the analog metronome: the pendulum while listening, as while tapping back', async ({ page }) => {
      known(name, 'echo-analog');
      await seed(page, {
        prefs: { seenHowTo: true, seenHold: true, seenEchoHowTo: true, holdMode: 'tap', metronomeLook: 'analog' },
        progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, mode: 'echo' } },
      });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      const play = page.getByRole('button', { name: 'Play the rhythm' });
      await expectClickable(play, { scroll: false });
      // Where Play has it: the Count card on tablet and desktop, under the card on a phone. No digits beside it.
      const count = page.locator(desktopLayout ? '.dstats' : tabletLayout && portraitLayout ? '.tplay-count' : '.play');
      await expect(count.locator('.beats--analog')).toBeVisible();
      await expect(page.locator('.dbeats, .beats:not(.beats--analog)')).toHaveCount(0);
      if (!desktopLayout) {
        // The taller pendulum leaves the listen card and the pad in view, also in a phone browser (DESIGN.md §9).
        await expect(pad(page)).toBeInViewport({ ratio: 1 });
        await expectFits(page);
      }
      await play.click();
      // It swings while the rhythm plays.
      const rod = page.locator('.beats--analog .analog-rod');
      await expect.poll(() => rod.getAttribute('transform'), { timeout: 4000 }).not.toMatch(/^rotate\(0\.00 /);
      await expect(page.locator('.dbeats, .beats:not(.beats--analog)')).toHaveCount(0);
      await page.getByRole('button', { name: 'Tap it back' }).click({ timeout: 15_000 });
      await expect(page.locator('.beats--analog')).toBeVisible();
      await expect(page.locator('.dbeats, .beats:not(.beats--analog)')).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test('play with the analog metronome: sixteen bars fit, with the pendulum, the pad and Skip in view', async ({ page }) => {
      known(name, 'play-analog-tall');
      // The pendulum is taller than the digits, with the most bars Setup allows. Tablet and desktop draw the timing lane's
      // every bar, four rows under the staff; a phone two rows, around the bars being played.
      await seed(page, {
        prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap', metronomeLook: 'analog' },
        progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, notes: ['quarter', 'eighth', 'half'], bars: 16, tempo: 60 } },
      });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.locator('.beats--analog')).toBeVisible();
      if (portraitLayout) {
        await expect(page.locator('.beats--analog')).toBeInViewport({ ratio: 1 });
        await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
      }
      if (desktopLayout) {
        // The key-cap pad and the four stat cards, the Metronome switch last, all in the window, in a 1366 × 768
        // laptop's window too (1366 × 657 under Chrome's bars).
        await expect(page.locator('.dpad')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.dstats .card').last()).toBeInViewport({ ratio: 1 });
        await expectFits(page);
        await page.setViewportSize({ width: 1366, height: 657 });
        await expect(page.locator('.dpad')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.dstats .card').last()).toBeInViewport({ ratio: 1 });
      } else {
        await expectClickable(pad(page), { scroll: false });
        await expectTouchHeight(pad(page));
      }
      // Every row of the timing lane in view: in a phone's landscape column the staff card scrolls inside itself, and the
      // pendulum's row pushed the lane's lower row, the one played last, out of it.
      await expect(page.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toBeInViewport({ ratio: 1 });
      await expectFits(page);
      if (tabletLayout && portraitLayout) await expectShortTabletFits(page);
      await expectNoSideScroll(page);
    });

    test("play with the analog metronome: sixteen bars with the room for a triplet's 3 fit too", async ({ page }) => {
      known(name, 'play-analog-triplets');
      // The staff keeps 4 px more above it for the 3 (178, not 174): at 1280 × 800 and 1180 × 820 the page scrolled 2 px,
      // and in a phone's landscape column the timing lane's lower row ran 2 px out of the staff card.
      await seedRun(page, { ...QUARTERS, notes: ['quarter', 'eighth'], triplets: true, bars: 16, tempo: 60 }, 1, { metronomeLook: 'analog' });
      await page.goto('./#/play');
      await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
      await expect(page.locator('.beats--analog')).toBeVisible();
      await expect(page.locator('.play-staff, .tplay-staff, .dplay-staff').locator('svg:has(.vf-stave)')).toHaveAttribute('viewBox', /^0 0 [\d.]+ 178$/);
      if (desktopLayout) await expect(page.locator('.dstats .card').last()).toBeInViewport({ ratio: 1 });
      else await expectClickable(pad(page), { scroll: false });
      await expect(page.getByRole('img', { name: 'Note lengths compared with how long each note was held' })).toBeInViewport({ ratio: 1 });
      await expectFits(page);
      if (tabletLayout && portraitLayout) await expectShortTabletFits(page);
      await expectNoSideScroll(page);
    });

    test('play: the pause menu shows all four rows', async ({ page }) => {
      known(name, 'play-pause');
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 60 } } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /^Count-in, beat/ })).toBeAttached({ timeout: 3000 });
      await page.getByRole('button', { name: /^Pause/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Paused' });
      await expect(sheet.getByRole('button', { name: 'Resume' })).toBeVisible();
      // A sheet taller than the screen (a phone on its side) scrolls; the menu never cuts off its own last row.
      await expectNotSqueezed(page.locator('.menu'));
      const [menu, quit] = [(await page.locator('.menu').boundingBox())!, (await sheet.getByRole('button', { name: 'Quit practice' }).boundingBox())!];
      expect(quit.y + quit.height, 'Quit practice ends inside the menu').toBeLessThanOrEqual(menu.y + menu.height + 1);
      for (const row of ['Restart exercise', 'How to play', 'Practice settings', 'Quit practice']) await expectClickable(sheet.getByRole('button', { name: new RegExp('^' + row) }));
      await expectClickable(sheet.getByRole('button', { name: 'Resume' }));
    });

    test('play: closing How to play hands focus to Pause, so Tab stays on the screen and does not pause', async ({ page }) => {
      known(name, 'play-sheet-focus');
      await seed(page, { prefs: { holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 8, tempo: 60 } } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('button', { name: 'Got it' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Pause( Esc)?$/ })).toBeFocused();
      // The next Tab stays on Play: focus left on the page went past the screen's end, out of the window, which pauses.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.hasFocus() && document.activeElement !== document.body)).toBe(true);
      await page.waitForTimeout(300);
      await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
    });

    test('pause: each menu row shows its whole focus ring, not cut off by the menu or painted over by the next row', async ({ page }) => {
      known(name, 'pause-focus');
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, holdMode: 'tap' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 8, tempo: 60 } } });
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      if (desktopLayout) await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const menu = page.getByRole('dialog', { name: 'Paused' }).locator('.menu');
      await expect(menu).toBeVisible();
      for (const row of await menu.getByRole('button').all()) {
        await expectFocusRing(row);
        const over = await row.evaluate((node) => {
          const style = getComputedStyle(node);
          const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          const r = node.getBoundingClientRect();
          // A later row that reaches into the ring paints over it, unless the focused row is lifted above it.
          const lifted = style.position !== 'static' && style.zIndex !== 'auto';
          let next = node.nextElementSibling;
          for (; next; next = next.nextElementSibling) {
            const b = next.getBoundingClientRect();
            if (b.top < r.bottom + ring && b.bottom > r.top - ring && b.left < r.right + ring && b.right > r.left - ring) break;
          }
          return next && !lifted ? (next.textContent ?? '').trim() : null;
        });
        expect(over, 'the focus ring is painted over by').toBeNull();
      }
    });

    /**
     * Phones: Setup's Start (Use … on the key lists) stays at the bottom of the screen while the page scrolls under it,
     * and a control reached with Tab is scrolled above it, not left under it (scroll-padding-bottom, DESIGN.md §6.4).
     */
    if (portraitLayout && !tabletLayout) {
      for (const [hash, more] of [['#/setup', false], ['#/setup', true], ['#/notes', false], ['#/notes/key', false], ['#/scales/setup', false], ['#/scales/key', false]] as const) {
        test(`${hash}${more ? ' with More options' : ''}: Tab never leaves a control under the sticky Start button`, async ({ page }) => {
          known(name, 'tab-above-start' + hash);
          await page.goto('./' + hash);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          if (more) {
            await page.getByRole('button', { name: 'More options' }).click();
            await expect(page.locator('#setup-more')).toHaveCSS('opacity', '1');
          }
          const start = page.locator('.page .start-btn');
          for (let i = 0; i < 80; i++) {
            await page.keyboard.press('Tab');
            const where = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement | null;
              const btn = document.querySelector('.page .start-btn');
              if (!el || !btn || !el.closest('.page')) return 'outside';
              if (el === btn) return 'start';
              const r = el.getBoundingClientRect();
              const covered = r.bottom > btn.getBoundingClientRect().top + 1;
              return covered ? 'covered: ' + (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim() : 'ok';
            });
            if (where === 'start') break;
            expect(where, 'a focused control under the Start button').not.toMatch(/^covered/);
          }
          await expect(start).toBeFocused();
        });
      }
    }

    /**
     * Accounts, and the admin's Feedback reports (no board yet: built from Settings' design language). The API is mocked;
     * the service worker is blocked so page.route sees the requests.
     */
    test.describe('accounts', () => {
      test.use({ serviceWorkers: 'block' });
      const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
      const account = (page: Page) => page.getByRole('region', { name: 'Account' });

      test('settings with no API: no Account section, About has Privacy', async ({ page }) => {
        known(name, 'settings-no-api');
        const me = page.waitForResponse('**/api/v1/me');
        await page.goto('./#/settings');
        await me;
        await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
        await expect(account(page)).toHaveCount(0);
        await expectClickable(page.getByRole('link', { name: /^Privacy/ }));
        await expectTouchHeight(page.getByRole('link', { name: /^Privacy/ }));
        await expectNoSideScroll(page);
      });

      test('settings signed out: Account is the first section, with Sign in', async ({ page }) => {
        known(name, 'settings-signed-out');
        await mockApi(page, SIGNED_OUT);
        await page.goto('./#/settings');
        const link = account(page).getByRole('link', { name: /^Sign in/ });
        await expectClickable(link);
        await expectTouchHeight(link);
        await expect(link).toContainText('Accounts are by invitation.');
        await expect(page.locator('.set-section').first()).toHaveAttribute('aria-labelledby', 'h-account');
        // Tablet and desktop: Account is the first item of the list of sections too, and the current one, though it
        // comes in above Language only once the API answered.
        if (VIEWPORTS[name].width >= 700) {
          const first = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button').first();
          await expect(first).toHaveText('Account');
          await expect(first).toHaveAttribute('aria-current', 'true');
        }
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('settings signed in as an admin: the account, Accounts, Feedback and Sign out', async ({ page }) => {
        known(name, 'settings-admin');
        await mockApi(page, ADMIN);
        await page.goto('./#/settings');
        const section = account(page);
        await expectClickable(section.getByRole('link', { name: /^Ann de Vries/ }));
        await expect(section.getByRole('link', { name: /^Ann de Vries/ })).toContainText('ann@example.com');
        await expectClickable(section.getByRole('link', { name: /^Accounts/ }));
        // Feedback (feedback.review): the reports to review, right under Accounts.
        const reports = section.getByRole('link', { name: /^Feedback/ });
        await expect(reports).toContainText('Review the reports sent from the app');
        await expectClickable(reports);
        await expectTouchHeight(reports);
        const [accounts, feedback] = await Promise.all([section.getByRole('link', { name: /^Accounts/ }).boundingBox(), reports.boundingBox()]);
        expect(Math.abs(feedback!.y - (accounts!.y + accounts!.height)), 'Feedback is the row under Accounts').toBeLessThanOrEqual(2);
        const signOut = section.getByRole('button', { name: 'Sign out' });
        await expectClickable(signOut);
        await expectTouchHeight(signOut);
        await expectNotSqueezed(section.locator('.set-card'));
        // The shell is Settings' own: the tab bar on phone, the header from 700 px up, Settings current.
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        if (VIEWPORTS[name].width >= 700) await expect(page.getByRole('banner').getByRole('navigation', { name: 'Main' })).toBeVisible();
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('settings signed in: the progress is saved, and Sign out asks about this device in reach', async ({ page }) => {
        known(name, 'settings-sign-out');
        await mockApi(page, MEMBER);
        await page.goto('./#/settings');
        const section = account(page);
        const line = section.locator('.sync-line');
        await expect(line).toHaveText('Progress saved to your account');
        // Under the account, as part of it: inside the card, beside nothing.
        const [row, status] = await Promise.all([section.getByRole('link', { name: /^Sam Jansen/ }).boundingBox(), line.boundingBox()]);
        expect(status!.y).toBeGreaterThanOrEqual(row!.y + row!.height - 1);
        expect(status!.x).toBeGreaterThanOrEqual(row!.x - 1);
        await section.getByRole('button', { name: 'Sign out' }).click();
        const confirm = section.getByRole('alertdialog', { name: 'Sign out on this device?' });
        for (const label of ['Keep', 'Remove', 'Cancel']) {
          await expectClickable(confirm.getByRole('button', { name: label }));
          await expectTouchHeight(confirm.getByRole('button', { name: label }));
        }
        await expectClickable(confirm.getByRole('button', { name: 'Sign out' }));
        await expectNotSqueezed(section.locator('.set-card'));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('settings and the accounts list with a long name and email: they wrap inside the row', async ({ page }) => {
        known(name, 'settings-long-email');
        // No break point in 65 characters, as some real addresses have, and a one-word name of 62 (up to 80 may be): each
        // wider than the row's words at every size, a desktop's too, so neither fits without wrapping.
        const long = { name: 'Wilhelminaalexandrinejohannesmariavandenbroeckevanoranjenassau', email: 'averyveryverylongemailaddressforateacheratschool1@example.invalid' };
        const me = { ...ME_ADMIN, ...long };
        await mockApi(page, adminApi(ACCOUNTS.map((a) => (a.id === me.id ? { ...a, ...long } : a)), me));
        await page.goto('./#/settings');
        const row = account(page).getByRole('link', { name: new RegExp('^' + long.name) });
        await expect(row).toContainText(long.email);
        await expectWordsInRow(row);
        await expectNoSideScroll(page);
        await account(page).getByRole('link', { name: /^Accounts/ }).click();
        const own = page.locator('a.acct-row').filter({ hasText: long.email });
        await expect(own).toContainText(long.name + ' (you)');
        await expectWordsInRow(own);
        await expectNoSideScroll(page);
      });

      test('settings and account with no answer from the API: the note, and Try again in reach', async ({ page }) => {
        known(name, 'account-offline');
        await seedAccount(page, ME_MEMBER);
        const me = page.waitForResponse('**/api/v1/me');
        await page.goto('./#/settings');
        await me;
        const section = account(page);
        const retry = section.getByRole('button', { name: 'Try again' });
        const note = section.getByText(/^Muzieklab can't be reached right now\. /);
        await expect(note).toBeVisible();
        await expectClickable(retry);
        await expectTouchHeight(retry);
        await expectNoOverlap(note, retry);
        await expectNotSqueezed(section.locator('.set-card'));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
        await section.getByRole('link', { name: /^Sam Jansen/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
        await expectClickable(page.getByRole('button', { name: 'Try again' }));
        await expectNoOverlap(page.locator('.offline-note p'), page.getByRole('button', { name: 'Try again' }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('sign in: a form on its own, with the fields and the button in reach', async ({ page }) => {
        known(name, 'signin');
        await mockApi(page, { ...SIGNED_OUT, 'POST /auth/sign-in': apiError('invalid_credentials', 401) });
        await page.goto('./#/signin');
        await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
        await expect(mainNav(page)).toHaveCount(0);
        await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
        await expectClickable(page.getByLabel('Email'));
        await expectClickable(page.getByLabel('Password', { exact: true }));
        await expectClickable(page.getByRole('button', { name: 'Show password' }));
        await expectTouchHeight(page.getByRole('button', { name: 'Show password' }));
        await expectFieldsFit(page);
        await page.getByLabel('Email').fill('sam@example.com');
        await page.getByLabel('Password', { exact: true }).fill('wrong password');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expectClickable(page.getByRole('button', { name: 'Sign in' }));
        await expectNoOverlap(page.getByRole('alert'), page.getByRole('button', { name: 'Sign in' }));
        await expectClickable(page.getByRole('link', { name: 'Privacy' }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('sign in after a request found the session ended: the line over the form, and the form in reach', async ({ page }) => {
        known(name, 'signin-ended');
        await mockApi(page, { ...MEMBER, 'GET /me/export': apiError('unauthenticated', 401) });
        await page.goto('./#/account');
        await page.getByRole('button', { name: /^Download my data/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
        const line = page.locator('.hint-box');
        await expect(line).toHaveText('You were signed out, so nothing was changed. Sign in again to go on.');
        await expectNotSqueezed(line);
        await expectNoOverlap(line, page.locator('.acct-head'));
        await expectNoOverlap(line, page.locator('.acct-form'));
        await expectClickable(page.getByLabel('Email'));
        await expectClickable(page.getByLabel('Password', { exact: true }));
        await expectClickable(page.getByRole('button', { name: 'Sign in' }));
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('accept invite: the name, a new password and Create account', async ({ page }) => {
        known(name, 'invite');
        await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': { json: INVITE_LINK }, 'POST /auth/invite/accept': apiError('password_common', 422) });
        await page.goto('./#/invite/' + TOKEN);
        await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
        await expect(page).toHaveTitle('Accept invite · Muzieklab');
        await expect(mainNav(page)).toHaveCount(0);
        await expectClickable(page.getByRole('link', { name: 'Back to Home' }));
        await expectClickable(page.getByLabel('Name'));
        await page.getByLabel('New password').fill('password1234');
        await page.getByRole('button', { name: 'Create account' }).click();
        await expect(page.getByText('This password is too common.', { exact: false })).toBeVisible();
        await expectClickable(page.getByLabel('New password'));
        await expectClickable(page.getByRole('button', { name: 'Create account' }));
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('accept invite with a link that no longer works: the message and Home', async ({ page }) => {
        known(name, 'invite-bad');
        await mockApi(page, { ...SIGNED_OUT, 'POST /auth/invite/check': apiError('link_invalid', 410) });
        await page.goto('./#/invite/' + TOKEN);
        await expect(page.getByRole('alert')).toContainText("This link doesn't work anymore.");
        await expectClickable(page.getByRole('link', { name: 'Home', exact: true }));
        await expectTouchHeight(page.getByRole('link', { name: 'Home', exact: true }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('accept invite with someone else signed in: who is, and Sign out with its choice in reach', async ({ page }) => {
        known(name, 'invite-signed-in');
        await seedAccount(page, ME_MEMBER);
        await mockApi(page, { ...MEMBER, 'POST /auth/invite/check': { json: INVITE_LINK } });
        await page.goto('./#/invite/' + TOKEN);
        await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Lies Bakker' })).toBeVisible();
        const note = page.getByText("You're signed in as Sam Jansen on this device. Sign out first to use this link. Progress you keep on this device is added to this link's account too.");
        await expect(note).toBeVisible();
        await expect(mainNav(page)).toHaveCount(0);
        const signOut = page.getByRole('button', { name: 'Sign out' });
        await expectClickable(signOut);
        await expectTouchHeight(signOut);
        await expectNoOverlap(note, signOut);
        await signOut.click();
        const confirm = page.getByRole('alertdialog', { name: 'Sign out on this device?' });
        for (const label of ['Keep', 'Remove', 'Cancel', 'Sign out']) {
          await expectClickable(confirm.getByRole('button', { name: label }));
          await expectTouchHeight(confirm.getByRole('button', { name: label }));
        }
        await expectNotSqueezed(page.locator('.set-card'));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('new password: one field and Save password', async ({ page }) => {
        known(name, 'reset');
        await mockApi(page, { ...SIGNED_OUT, 'POST /auth/reset/check': { json: { ...INVITE_LINK, email: 'sam@example.com', name: 'Sam Jansen' } } });
        await page.goto('./#/reset/' + TOKEN);
        await expect(page.getByRole('heading', { level: 1, name: 'New password' })).toBeVisible();
        await expect(page.getByText('Choose a new password for sam@example.com.')).toBeVisible();
        await expectClickable(page.getByLabel('New password'));
        await expectClickable(page.getByRole('button', { name: 'Save password' }));
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('account: profile, password, devices and your data', async ({ page }) => {
        known(name, 'account');
        await mockApi(page, MEMBER);
        await page.goto('./#/account');
        await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
        await expectClickable(page.getByLabel('Name'));
        await expectClickable(page.getByRole('button', { name: 'Change email' }));
        await page.getByRole('button', { name: 'Change email' }).click();
        await expectClickable(page.getByRole('button', { name: 'Save email' }));
        await expectClickable(page.getByRole('button', { name: 'Change password' }));
        await expectClickable(page.getByRole('button', { name: /^Sign out everywhere/ }));
        await expectClickable(page.getByRole('button', { name: /^Download my data/ }));
        await page.getByRole('button', { name: /^Delete account/ }).click();
        const confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
        // The choice: two buttons a finger can hit, side by side, with their words whole.
        const choice = confirm.getByRole('group', { name: 'Your progress and settings' });
        for (const label of ['Keep anonymously', 'Delete too']) {
          await expectClickable(choice.getByRole('button', { name: label }));
          await expectTouchHeight(choice.getByRole('button', { name: label }));
        }
        await expectNoOverlap(choice.getByRole('button', { name: 'Keep anonymously' }), choice.getByRole('button', { name: 'Delete too' }));
        await expectClickable(confirm.getByLabel('Why are you leaving? (optional)'));
        await expectClickable(confirm.getByLabel('Password', { exact: true }));
        await expectClickable(confirm.getByRole('button', { name: 'Delete', exact: true }));
        await expectClickable(confirm.getByRole('button', { name: 'Cancel' }));
        await expectFieldsFit(page);
        for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('privacy: the statement, and back to Settings', async ({ page }) => {
        known(name, 'privacy');
        await mockApi(page, SIGNED_OUT);
        await page.goto('./#/settings');
        await page.getByRole('link', { name: /^Privacy/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'With an account' })).toBeVisible();
        await expectClickable(page.getByText('Last updated: October 25, 2026'));
        await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
        await expectNoSideScroll(page);
      });

      test('admin accounts: Invite someone, search, the status filter and the list', async ({ page }) => {
        known(name, 'admin-accounts');
        await mockApi(page, adminApi());
        await page.goto('./#/admin');
        await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
        await expect(page).toHaveTitle('Accounts · Muzieklab');
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
        // The one filled button: in the title row from 700 px up, under it on a phone.
        const invite = page.getByRole('link', { name: 'Invite someone' });
        await expectClickable(invite);
        await expectTouchHeight(invite);
        await expect(page.locator('.screen-head').getByRole('link', { name: 'Invite someone' })).toHaveCount(VIEWPORTS[name].width >= 700 ? 1 : 0);
        const list = page.locator('section[aria-labelledby="h-accounts"]');
        await expect(list.getByRole('heading', { name: '4 accounts' })).toBeVisible();
        const rows = list.getByRole('link');
        await expect(rows).toHaveCount(4);
        for (const row of await rows.all()) await expectTouchHeight(row);
        await expectClickable(rows.last());
        await expectNotSqueezed(list.locator('.set-card'));
        const filter = page.getByRole('group', { name: 'Status' });
        for (const label of ['All', 'Invited', 'Active', 'Blocked']) await expectTouchHeight(filter.getByRole('button', { name: label }));
        await expectEvenChipRows(page);
        await expectClickable(filter.getByRole('button', { name: 'Blocked' }));
        await filter.getByRole('button', { name: 'Blocked' }).click();
        await expect(list.getByRole('heading', { name: '1 account found' })).toBeVisible();
        await expectClickable(page.getByLabel('Search'));
        await page.getByLabel('Search').fill('nobody');
        await expect(page.locator('.acct-empty')).toHaveText('No accounts match.');
        await expectScrollbarAtEdge(page);
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin deleted accounts: the filter, each entry with its feedback, and the file', async ({ page }) => {
        known(name, 'admin-deleted');
        await mockApi(page, adminApi());
        await page.goto('./#/admin');
        // From Accounts: the History card under the list.
        const history = page.getByRole('link', { name: /^Deleted accounts/ });
        await expectClickable(history);
        await expectTouchHeight(history);
        await history.click();
        await expect(page.getByRole('heading', { level: 1, name: 'Deleted accounts' })).toBeVisible();
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        await expectClickable(page.getByRole('link', { name: 'Back to accounts' }));
        const filter = page.getByRole('group', { name: 'How it was deleted' });
        for (const label of ['All', 'Archived', 'Data deleted', 'By an admin']) await expectTouchHeight(filter.getByRole('button', { name: label }));
        await expectEvenChipRows(page, '', 'How it was deleted');
        const list = page.locator('section[aria-labelledby="h-closures"]');
        await expect(list.getByRole('article')).toHaveCount(4);
        await expectNotSqueezed(list.locator('.set-card'));
        // The feedback is shown whole, inside its card.
        const feedback = list.locator('blockquote').first();
        await expectClickable(feedback);
        const [quote, card] = await Promise.all([feedback.boundingBox(), list.locator('.set-card').boundingBox()]);
        expect(quote!.x + quote!.width).toBeLessThanOrEqual(card!.x + card!.width + 0.5);
        await expectClickable(page.getByRole('button', { name: /^Download as a file/ }));
        await expectTouchHeight(page.getByRole('button', { name: /^Download as a file/ }));
        await expectScrollbarAtEdge(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin accounts without access: the message and the way back', async ({ page }) => {
        known(name, 'admin-no-access');
        await mockApi(page, MEMBER);
        await page.goto('./#/admin');
        await expect(page.getByText("You don't have access to this page.")).toBeVisible();
        await expect(page.getByRole('link', { name: 'Invite someone' })).toHaveCount(0);
        await expectClickable(page.locator('.acct-message').getByRole('link', { name: 'Back to settings' }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin invite: the form, then the link and the message', async ({ page }) => {
        known(name, 'admin-invite');
        await mockApi(page, {
          ...ADMIN,
          'POST /admin/invites': ({ body }) => ({ json: { ...INVITE_LINK_CREATED, account: accountDetail({ ...ACCOUNTS[0], ...(body as object), status: 'invited' }) } }),
        });
        await page.goto('./#/admin/invite');
        await expect(page.getByRole('heading', { level: 1, name: 'Invite someone' })).toBeVisible();
        await expectClickable(page.getByRole('link', { name: 'Back to accounts' }));
        await expectClickable(page.getByLabel('Email'));
        await expectClickable(page.getByLabel('Name'));
        for (const role of ['Admin', 'Editor', 'Teacher']) {
          await expectClickable(page.getByRole('switch', { name: role }));
          await expectTouchHeight(page.getByRole('switch', { name: role }));
        }
        await expectFieldsFit(page);
        await expectClickable(page.getByRole('button', { name: 'Create invite' }));
        await page.getByLabel('Email').fill('noor@example.com');
        await page.getByLabel('Name').fill('Noor Hendriks');
        await page.getByRole('button', { name: 'Create invite' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Invite for Noor Hendriks is ready' })).toBeFocused();
        await expectClickable(page.getByRole('button', { name: 'Copy link' }));
        await expectTouchHeight(page.getByRole('button', { name: 'Copy link' }));
        // The whole message shows, without scrolling inside its box.
        await expectNotSqueezed(page.getByLabel('Message to send'));
        await expectClickable(page.getByRole('button', { name: 'Copy message' }));
        await expectClickable(page.getByRole('button', { name: 'Invite someone else' }));
        await expectClickable(page.getByRole('link', { name: 'Done' }));
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin one account: details, name and email, roles, premium and access', async ({ page }) => {
        known(name, 'admin-account');
        const sam = ACCOUNTS[1];
        await mockApi(page, { ...adminApi(), 'POST /admin/accounts/:id/reset-link': { json: RESET_LINK_CREATED } });
        await page.goto('./#/admin/account/' + sam.id);
        await expect(page.getByRole('heading', { level: 1, name: 'Sam Jansen' })).toBeVisible();
        await expect(page).toHaveTitle('Sam Jansen · Muzieklab');
        await expectClickable(page.getByRole('link', { name: 'Back to accounts' }));
        await expect(page.getByText('Devices signed in')).toBeVisible();
        await expectClickable(page.getByLabel('Name', { exact: true }));
        await expectClickable(page.getByLabel('Email', { exact: true }));
        for (const role of ['Admin', 'Editor', 'Teacher']) await expectTouchHeight(page.getByRole('switch', { name: role }));
        await expectClickable(page.getByRole('switch', { name: 'Premium' }));
        await expectClickable(page.getByLabel('Last day (optional)'));
        await page.getByRole('button', { name: /^New password link/ }).click();
        await expectClickable(page.getByRole('button', { name: 'Copy link' }));
        await expectNotSqueezed(page.getByLabel('Message to send'));
        await page.getByRole('button', { name: /^Block/ }).click();
        const confirm = page.getByRole('alertdialog', { name: 'Block Sam Jansen?' });
        await expectClickable(confirm.getByRole('button', { name: 'Block' }));
        await expectClickable(confirm.getByRole('button', { name: 'Cancel' }));
        await expectClickable(page.getByRole('button', { name: 'Delete account' }));
        for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin one account and invite with a long one-word role: its name and description wrap left of the switch', async ({ page }) => {
        known(name, 'admin-long-role');
        const sam = { ...ACCOUNTS[1], roles: [LONG_ROLE.id] };
        await mockApi(page, { ...adminApi(ACCOUNTS.map((a) => (a.id === sam.id ? sam : a))), 'GET /admin/roles': { json: { roles: [LONG_ROLE] } } });
        for (const hash of ['#/admin/account/' + sam.id, '#/admin/invite']) {
          await page.goto('./' + hash);
          const row = page.getByRole('switch', { name: LONG_ROLE.name });
          await expect(row).toBeVisible();
          await expectWordsInRow(row, '.toggle-row-text');
          await expectNoSideScroll(page);
        }
      });

      test('own account with a long one-word role: the roles line under Profile wraps in its card', async ({ page }) => {
        known(name, 'account-long-role');
        // The member who has the role sees the name an admin gave it.
        await mockApi(page, signedInAs({ ...ME_MEMBER, roles: [LONG_ROLE.id], roleNames: { [LONG_ROLE.id]: LONG_ROLE.name } }));
        await page.goto('./#/account');
        const profile = page.getByRole('region', { name: 'Profile' });
        await expect(profile.locator('.row-note')).toContainText(LONG_ROLE.name);
        await expectWordsInRow(profile, '.row-note');
        await expectNoSideScroll(page);
      });

      test('admin one account: a second password link that fails, with the earlier one dimmed in its place', async ({ page }) => {
        known(name, 'admin-account-link-failed');
        await failedSecondLink(page, 'New password link',
          "Can't reach Muzieklab right now. Check your connection and try again. The link below may not work anymore.");
      });

      test('admin feedback: from Settings, the status filter with its counts, and the reports', async ({ page }) => {
        known(name, 'admin-feedback');
        const api = await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
        await page.goto('./#/settings');
        await account(page).getByRole('link', { name: /^Feedback/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
        await expect(page).toHaveTitle('Feedback · Muzieklab');
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        await expectClickable(page.getByRole('link', { name: 'Back to settings' }));
        await expect(page.getByText('Reports sent from the app.')).toBeVisible();
        // Feedback mode, for everyone: on, so the Feedback button floats over this screen too. Off takes it away.
        const mode = page.getByRole('switch', { name: 'Feedback mode' });
        const fab = page.getByRole('button', { name: 'Feedback: mark a part of this screen' });
        await expect(mode).toHaveAttribute('aria-checked', 'true');
        await expect(mode).toContainText('On: everyone who can send feedback sees the Feedback button on every screen.');
        await expectClickable(mode);
        await expectTouchHeight(mode);
        await expectNotSqueezed(mode);
        await expect(fab).toBeVisible();
        await mode.click();
        await expect(mode).toHaveAttribute('aria-checked', 'false');
        await expect(mode).toContainText('Off: nobody sees the Feedback button. Turn it on to collect feedback.');
        await expect(fab).toHaveCount(0);
        await expectNoClippedLabels(page);
        await mode.click();
        await expect(mode).toHaveAttribute('aria-checked', 'true');
        await expect(fab).toBeVisible();
        expect(api.callsTo('PUT /admin/feedback-mode').map((c) => c.body)).toEqual([{ on: false }, { on: true }]);
        // New first: the reports nobody has looked at yet. Each chip says how many it holds.
        const filter = page.getByRole('group', { name: 'Status' });
        await expect(filter.getByRole('button')).toHaveText(['New 3', 'Accepted 1', 'Declined 0', 'All 4']);
        await expect(filter.getByRole('button', { name: 'New 3' })).toHaveAttribute('aria-pressed', 'true');
        for (const chip of await filter.getByRole('button').all()) await expectTouchHeight(chip);
        await expectEvenChipRows(page);
        const list = page.locator('section[aria-labelledby="h-reports"]');
        await expect(list.getByRole('heading', { name: '3 new reports' })).toBeVisible();
        const rows = list.getByRole('link');
        await expect(rows).toHaveCount(3);
        for (const row of await rows.all()) {
          await expectTouchHeight(row);
          await expectNotSqueezed(row);
        }
        // A row: the title (or one made up from the kind and the screen), then kind · marked spot · who · day.
        await expect(rows.nth(0)).toHaveAttribute('href', '#/admin/feedback/' + FEEDBACK[0].id);
        await expect(rows.nth(0)).toContainText('Start lesson does nothing on the first tap');
        await expect(rows.nth(0)).toContainText('Bug · button “Start lesson” · Sam Jansen · October 25, 2026');
        await expect(rows.nth(1)).toContainText('Change on #/settings');
        await expect(rows.nth(1)).toContainText('Change · group “Timing leniency” · A deleted account · October 24, 2026');
        await expectClickable(rows.last());
        await expectNotSqueezed(list.locator('.set-card'));
        await expect(list.locator('.status-pill')).toHaveCount(0);

        // All: every report, each with where it stands.
        await expectClickable(filter.getByRole('button', { name: 'All 4' }));
        await filter.getByRole('button', { name: 'All 4' }).click();
        await expect(list.getByRole('heading', { name: '4 reports' })).toBeVisible();
        await expect(announcer(page)).toHaveText('4 reports');
        await expect(list.locator('.status-pill')).toHaveText(['New', 'New', 'New', 'Accepted']);
        for (const pill of await list.locator('.status-pill').all()) await expectClickable(pill);
        await expectNotSqueezed(list.locator('.set-card'));
        await expectScrollbarAtEdge(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);

        // A status with none: one line says so.
        await filter.getByRole('button', { name: 'Declined 0' }).click();
        await expect(page.locator('.acct-empty')).toHaveText('No reports with this status.');
        await expect(announcer(page)).toHaveText('No reports with this status.');
        expect(api.callsTo('GET /admin/feedback').map((c) => c.query.get('status'))).toEqual(['new', null, 'declined']);
        await expectNoSideScroll(page);
      });

      test('admin one feedback report: the report, where, the device, who sent it, the review, Copy and Delete', async ({ page, context }) => {
        known(name, 'admin-feedback-report');
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const api = await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
        const [first] = FEEDBACK;
        const region = (title: string) => page.getByRole('region', { name: title, exact: true });
        await page.goto('./#/admin/feedback');
        await page.getByRole('link', { name: /^Start lesson does nothing/ }).click();
        await expect(page).toHaveURL(new RegExp('#/admin/feedback/' + first.id + '$'));
        await expect(page.getByRole('heading', { level: 1, name: first.title })).toBeVisible();
        await expect(page).toHaveTitle(first.title + ' · Muzieklab');
        await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
        await expectClickable(page.getByRole('link', { name: 'Back to feedback' }));

        // Report: the kind, and what should change as it was written (its line break kept).
        await expect(region('Report')).toContainText('Bug');
        expect(await region('Report').locator('.report-quote').innerText()).toBe(first.description);
        // Where: the screen and the marked spot, and the way to that screen.
        const where = region('Where');
        for (const fact of ['#/', first.report.target.label, 'Start lesson', first.report.target.selector, 'An element', 'x 17, y 412, 358 × 52 px']) {
          await expect(where).toContainText(fact);
        }
        const open = where.getByRole('link', { name: 'Open this screen' });
        await expect(open).toHaveAttribute('href', '#/');
        await expectClickable(open);
        await expectTouchHeight(open);
        // Device and Sent.
        for (const fact of ['390 × 844 px, pixel ratio 3', 'Phone', 'Portrait', 'Touch', 'Dark, from the system setting', 'English', '0.17.0', 'iPhone OS 18_1']) {
          await expect(region('Device')).toContainText(fact);
        }
        await expect(region('Sent')).toContainText('Sam Jansen');
        await expect(region('Sent')).toContainText('October 25, 2026');
        for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
        await expectFactsInCards(page);

        // Review: the status is saved at once, and says who changed it.
        const review = region('Review');
        const status = review.getByRole('group', { name: 'Status' });
        await expect(status.getByRole('button')).toHaveText(['New', 'Accepted', 'Declined']);
        await expect(status.getByRole('button', { name: 'New' })).toHaveAttribute('aria-pressed', 'true');
        for (const choice of await status.getByRole('button').all()) {
          await expectClickable(choice);
          await expectTouchHeight(choice);
        }
        await expect(review).toContainText('Not reviewed yet.');
        await status.getByRole('button', { name: 'Accepted' }).click();
        await expect(review).toContainText('Reviewed by Ann de Vries, October 25, 2026');
        await expect(status.getByRole('button', { name: 'Accepted' })).toHaveAttribute('aria-pressed', 'true');
        // The note for the team, saved with Save (trimmed).
        const note = review.getByLabel('Note for the team');
        const save = review.getByRole('button', { name: 'Save note' });
        await expectClickable(note);
        await expect(save).toBeDisabled();
        await note.fill('  Picked up for 0.17.1.\nAfter the tab bar fix.  ');
        await expectClickable(save);
        await expectTouchHeight(save);
        await save.click();
        await expect(review.getByText('Saved.')).toBeVisible();
        await expect(note).toHaveValue('Picked up for 0.17.1.\nAfter the tab bar fix.');
        expect(api.callsTo('PATCH /admin/feedback/:id').map((c) => [c.params.id, c.body])).toEqual([
          [first.id, { status: 'accepted' }],
          [first.id, { note: 'Picked up for 0.17.1.\nAfter the tab bar fix.' }],
        ]);

        // Copy as Markdown: the GitHub issue the report would become, to make by hand for now.
        const actions = region('Actions');
        const copy = actions.getByRole('button', { name: /^Copy as Markdown/ });
        await expectClickable(copy);
        await expectTouchHeight(copy);
        await copy.click();
        await expect(actions.getByRole('button', { name: /^Copied/ })).toBeVisible();
        const markdown = await page.evaluate(() => navigator.clipboard.readText());
        expect(markdown.startsWith(`# ${first.title}\n\n**Bug** · reported in the app (v0.17.0)`), markdown.slice(0, 120)).toBe(true);
        expect(markdown).toContain('<!-- muzieklab-feedback:v1 -->');

        for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
        await expectFieldsFit(page);
        await expectScrollbarAtEdge(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);

        // Delete report asks first, then goes back to the list, which says so once.
        await actions.getByRole('button', { name: 'Delete report' }).click();
        const confirm = actions.getByRole('alertdialog', { name: 'Delete this report?' });
        await expect(confirm).toContainText('It is removed from the app for everyone. No undo.');
        for (const label of ['Cancel', 'Delete']) {
          await expectClickable(confirm.getByRole('button', { name: label, exact: true }));
          await expectTouchHeight(confirm.getByRole('button', { name: label, exact: true }));
        }
        await expectNotSqueezed(confirm);
        await expectNoClippedLabels(page);
        await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page).toHaveURL(/#\/admin\/feedback$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
        await expect(page.locator('.acct-card--status')).toContainText('The report was deleted.');
        await expect(announcer(page)).toHaveText('The report was deleted.');
        await expect(page.getByRole('group', { name: 'Status' }).getByRole('button')).toHaveText(['New 2', 'Accepted 1', 'Declined 0', 'All 3']);
        await expect(page.getByRole('link', { name: /^Start lesson does nothing/ })).toHaveCount(0);
        expect(api.callsTo('DELETE /admin/feedback/:id').map((c) => c.params.id)).toEqual([first.id]);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin one feedback report: a long one-word name, of who sent it and who reviewed it, wraps inside its card', async ({ page }) => {
        // As long as a name may be (80 characters), in the widest letter, with no space to break at.
        const long = { id: ME_MEMBER.id, name: 'W'.repeat(80) };
        const report = { ...FEEDBACK[3], author: long, reviewer: long };
        await mockApi(page, { ...ADMIN, ...feedbackServer([report]).routes });
        await page.goto('./#/admin/feedback/' + report.id);
        await expect(page.getByRole('region', { name: 'Sent', exact: true })).toContainText(long.name);
        await expect(page.getByRole('region', { name: 'Review', exact: true })).toContainText('Reviewed by ' + long.name);
        await expectFactsInCards(page);
        await expectNoSideScroll(page);
      });

      test('admin feedback: no access, a list that does not come, no reports yet, and a report that is gone', async ({ page }) => {
        known(name, 'admin-feedback-states');
        const api = await mockApi(page, { ...MEMBER, ...feedbackServer().routes });
        await page.goto('./#/admin/feedback');
        await expect(page.getByText("You don't have access to this page.")).toBeVisible();
        await expect(page.getByText('Only admins review feedback reports.')).toBeVisible();
        const back = page.locator('.acct-message').getByRole('link', { name: 'Back to settings' });
        await expectClickable(back);
        await expectTouchHeight(back);
        expect(api.callsTo('GET /admin/feedback')).toHaveLength(0);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);

        // An admin, and the list does not come: why, and Try again.
        api.set({ ...ADMIN, 'GET /admin/feedback': apiError('internal', 500) });
        await page.reload();
        await expect(page.getByRole('alert')).toHaveText('Something went wrong on our side. Try again later.');
        const retry = page.getByRole('button', { name: 'Try again' });
        await expectClickable(retry);
        await expectTouchHeight(retry);
        await expectNoOverlap(page.getByRole('alert'), retry);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);

        // No reports yet: one line says where they come from, and there is nothing to filter.
        api.set({ 'GET /admin/feedback': { json: { reports: [], counts: { new: 0, accepted: 0, declined: 0 } } } });
        await retry.click();
        await expect(page.locator('.acct-empty')).toHaveText('No reports yet. They appear here when someone sends feedback from the app.');
        await expect(page.getByRole('group', { name: 'Status' })).toHaveCount(0);
        await expectNoSideScroll(page);

        // A report deleted meanwhile (by another admin): it says so, with the way back to the list.
        await page.goto('./#/admin/feedback/6718f0c2a1b2c3d4e5f6b0ff');
        await expect(page.getByText("This report isn't there anymore.")).toBeVisible();
        const toList = page.locator('.acct-message').getByRole('link', { name: 'Back to feedback' });
        await expectClickable(toList);
        await expectTouchHeight(toList);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });
    });
  });
}

/**
 * Dutch text is often longer than English (DESIGN.md §11): every screen still fits at every size, with no label cut
 * off and no sideways scroll.
 */
for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(`${name} in Dutch`, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop') });
    test.beforeEach(async ({ page }) => seed(page, { prefs: { language: 'nl', seenHowTo: true, seenHold: true } }));

    const screens: [string, string, string][] = [
      ['', 'Start', 'Begin de les'],
      ['#/setup', 'Vrij oefenen', 'Start · '],
      ['#/path', 'Leerpad', 'Begin les'],
      ['#/settings', 'Instellingen', 'Voortgang wissen'],
      ['#/changelog', 'Wat is er nieuw', '0.1.0'],
      ['#/calibrate', 'Timing kalibreren', 'Tikpad'],
      ['#/notes', 'Noten lezen', 'Start · '],
      ['#/notes/key', 'Toonsoort', 'Kies '],
      ['#/scales/key', 'Toonsoort', 'Kies '],
      ['#/learn', 'Leren', ''],
      ['#/learn/1', 'Puls en maat', ''],
      ['#/learn/2', 'Notenwaarden', 'Rusten'],
      ['#/learn/3', 'Rusten', 'Eén hele rust, in het midden'],
      ['#/learn/4', 'De tel verdelen', ''],
      ['#/learn/5', 'Noten langer maken', 'Een kwartnoot overgebonden naar een achtste'],
      ['#/learn/6', 'Naast de tel', ''],
      ['#/learn/7', 'Tellen in drieën', 'Twee achtsten'],
      ['#/learn/8', 'Noten op de balk', ''],
      ['#/learn/9', 'Kruisen, mollen en herstellingstekens', ''],
      ['#/learn/10', 'Voortekening', ''],
      ['#/learn/11', 'Toonladders', ''],
      ['#/scales', 'Toonladders', 'Oefen C majeur'],
      ['#/scales/setup', 'Toonladders oefenen', 'Start · '],
      ['#/progress', 'Voortgang', 'Ritme'],
      ['#/progress/skills', 'Vaardigheden', ''],
      ['#/progress/skills/rhythm', 'Ritme lezen', ''],
    ];
    for (const [hash, title, action] of screens) {
      test(`${hash || '#/'}: ${title}`, async ({ page }) => {
        known(name, 'nl' + hash);
        await page.goto('./' + hash);
        await expect(page).toHaveTitle(new RegExp(title === 'Start' ? 'Muzieklab' : title));
        if (action) await expectClickable(page.getByRole('button', { name: new RegExp('^' + action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first());
        // Calibrate's prompt above the pad stays on one line (white-space: pre): it must fit inside the 16 px gutters.
        if (hash === '#/calibrate') {
          const width = await page.locator('.judgement--cal').evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect().width;
          });
          expect(width, 'the start prompt fits on screen').toBeLessThanOrEqual(VIEWPORTS[name].width - 32);
        }
        if (hash.startsWith('#/learn/')) {
          await expectCountsApart(page);
          await expectLearnWordsApart(page);
        }
        if (hash.endsWith('/key')) await expectKeyNamesFit(page);
        if (hash === '#/changelog') {
          // The latest release first, then one with a fix (its chips are in the list on a phone, on the card on desktop).
          await expectChangelogFits(page);
          await page.getByRole('button', { name: /^0\.17\.1/ }).click();
          await expectChangelogFits(page);
        }
        await expectHeadFits(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });
    }

    test('#/scales/setup with 15 keys chosen: the keys fit their control', async ({ page }) => {
      known(name, 'nl#/scales/setup-pick');
      // "15 toonsoorten" is wider than a third of the control at 320 px: it takes a second line instead of running out.
      const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
      await seed(page, { progress: { scales: { settings: { keyMode: 'pick', keys, types: ['major'], input: 'piano', direction: 'up', write: 'signs', showSteps: true, playNotes: false }, stars: {} } } });
      await page.goto('./#/scales/setup');
      // A fresh load, so the app reads the settings just seeded.
      await page.reload();
      await expect(page.getByRole('group', { name: 'Toonsoorten' }).getByRole('button', { name: '15 toonsoorten' })).toHaveAttribute('aria-pressed', 'true');
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test('scales: G♯ harmonic minor up and down, answered to the end, fits', async ({ page }) => {
      known(name, 'nl-scales-up-down');
      // The longest Dutch lines: why a note is wrong, the Tip and the done line with all 15 notes, beside the tallest
      // staff of the long scales (G♯ harmonisch mineur), with the signs and on the piano.
      for (const input of ['names', 'piano']) {
        await seed(page, { progress: { scales: { settings: { keyMode: 'one', keys: ['B'], types: ['harmonic'], input, direction: 'upDown', write: 'signs', showSteps: true, playNotes: false }, stars: {} } } });
        await page.goto('./#/scales/setup');
        // A fresh load, so the app reads the settings just seeded.
        await page.reload();
        await page.getByRole('button', { name: 'Start · 1 ladder' }).click();
        await expect(page.getByText('G♯ harmonisch mineur', { exact: true })).toBeVisible();
        await answerUpAndDown(page, name, { key: 'B', type: 'harmonic' }, input, { hint: 'Tip', next: /^Volgende ladder/, skip: 'Naar de samenvatting' });
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      }
    });

    test('#/progress with the sample player: every view, Skill levels and one skill', async ({ page }) => {
      known(name, 'nl#/progress-rich');
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      await seed(page, { progress: richProgress(), prefs: { ...PROGRESS_PREFS, language: 'nl' } });
      await page.goto('./#/progress');
      await expect(page).toHaveTitle(/^Voortgang/);
      await expect(page.getByText('25 van 60 niveaus · 6 vaardigheden · 1 te herhalen')).toBeVisible();
      // The streak chip beside "Voortgang" (under it on a 320 px phone), and the achievements' names.
      await expectHeadFits(page);
      await expectCountsWithWords(page);
      for (const view of ['Ritme', 'Noten', 'Toonladders']) {
        const button = page.getByRole('group', { name: 'Voortgang tonen voor' }).getByRole('button', { name: view, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      }
      await page.getByRole('link', { name: /^Vaardigheden/ }).click();
      await expect(page).toHaveTitle(/^Vaardigheden/);
      await expect(page.getByRole('img', { name: '25 van 60 niveaus' })).toBeVisible();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.getByRole('link', { name: /^Ritme lezen: niveau 6 van 10\./ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Ritme lezen' })).toBeVisible();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });

    test.describe('accounts', () => {
      test.use({ serviceWorkers: 'block' });
      const rows: [string, string, MockRoutes, string, string][] = [
        ['settings, admin', '#/settings', ADMIN, 'Instellingen', 'Uitloggen'],
        ['settings, signed out', '#/settings', SIGNED_OUT, 'Instellingen', 'Voortgang wissen'],
        ['sign in', '#/signin', SIGNED_OUT, 'Inloggen', 'Inloggen'],
        ['accept invite', '#/invite/' + TOKEN, { ...SIGNED_OUT, 'POST /auth/invite/check': { json: INVITE_LINK } }, 'Uitnodiging aannemen', 'Account maken'],
        ['accept invite, bad link', '#/invite/' + TOKEN, { ...SIGNED_OUT, 'POST /auth/invite/check': apiError('link_invalid', 410) }, 'Uitnodiging aannemen', ''],
        ['new password', '#/reset/' + TOKEN, { ...SIGNED_OUT, 'POST /auth/reset/check': { json: INVITE_LINK } }, 'Nieuw wachtwoord', 'Wachtwoord bewaren'],
        ['account', '#/account', MEMBER, 'Account', 'Wachtwoord wijzigen'],
        ['privacy', '#/privacy', SIGNED_OUT, 'Privacy', ''],
        ['admin accounts', '#/admin', adminApi(), 'Accounts', 'Geblokkeerd'],
        ['admin invite', '#/admin/invite', ADMIN, 'Iemand uitnodigen', 'Uitnodiging maken'],
        ['admin account', '#/admin/account/' + ACCOUNTS[1].id, adminApi(), 'Sam Jansen', 'Link voor een nieuw wachtwoord'],
        ['admin account, invited', '#/admin/account/' + ACCOUNTS[0].id, adminApi(), 'Lies Bakker', 'Nieuwe uitnodigingslink'],
        ['admin deleted accounts', '#/admin/deleted', adminApi(), 'Verwijderde accounts', 'Downloaden als bestand'],
        // Made once for every test here: they only read the reports.
        ['admin feedback', '#/admin/feedback', { ...ADMIN, ...feedbackServer().routes }, 'Feedback', 'Nieuw 3'],
        ['admin feedback report', '#/admin/feedback/' + FEEDBACK[1].id, { ...ADMIN, ...feedbackServer().routes }, 'Wijziging op #/settings', 'Melding verwijderen'],
      ];
      for (const [screen, hash, routes, title, action] of rows) {
        test(`${screen}: ${title}`, async ({ page }) => {
          known(name, 'nl-' + screen);
          await mockApi(page, routes);
          await page.goto('./' + hash);
          await expect(page).toHaveTitle(new RegExp(title));
          await expect(page.locator('h1')).toBeVisible();
          if (action) await expectClickable(page.getByRole('button', { name: new RegExp('^' + action) }).first());
          if (hash === '#/settings' && routes === ADMIN) {
            await expectClickable(page.getByRole('link', { name: /^Accounts/ }));
            await expectClickable(page.getByRole('link', { name: /^Feedback/ }));
          }
          if (hash === '#/settings' && routes === SIGNED_OUT) await expectClickable(page.getByRole('link', { name: /^Inloggen/ }));
          if (hash === '#/account') {
            await page.getByRole('button', { name: /^Account verwijderen/ }).click();
            for (const label of ['Anoniem bewaren', 'Ook verwijderen']) await expectClickable(page.getByRole('button', { name: label }));
            await expectClickable(page.getByLabel('Waarom stop je? (niet verplicht)'));
            await expectClickable(page.getByRole('button', { name: 'Verwijderen', exact: true }));
          }
          if (hash === '#/admin/deleted') {
            // Gegevens gewist and Door beheerder are long: two and two, never three and a lone one.
            await expectEvenChipRows(page, '', 'Hoe het is verwijderd');
            await expect(page.getByRole('article').first()).toContainText('Begonnen in maart 2026');
          }
          if (hash === '#/admin/feedback') {
            await expect(page.getByRole('group', { name: 'Status' }).getByRole('button')).toHaveText(['Nieuw 3', 'Opgepakt 1', 'Afgewezen 0', 'Alle 4']);
            await expectEvenChipRows(page);
            const untitled = page.getByRole('link', { name: /^Wijziging op #\/settings/ });
            await expect(untitled).toContainText('Een verwijderd account');
            await expectNotSqueezed(untitled);
          }
          if (hash.startsWith('#/admin/feedback/')) {
            // Nieuw · Opgepakt · Afgewezen: each whole, a finger's height, in a third of the card at 320 px.
            for (const label of ['Nieuw', 'Opgepakt', 'Afgewezen']) {
              const choice = page.getByRole('group', { name: 'Status' }).getByRole('button', { name: label });
              await expectClickable(choice);
              await expectTouchHeight(choice);
            }
            await expect(page.getByRole('region', { name: 'Apparaat' })).toContainText('Computer');
            await expectClickable(page.getByRole('link', { name: 'Open dit scherm' }));
            await expectClickable(page.getByLabel('Notitie voor het team'));
            await expectClickable(page.getByRole('button', { name: /^Kopiëren als Markdown/ }));
            for (const card of await page.locator('.set-card').all()) await expectNotSqueezed(card);
            await expectFactsInCards(page);
            await page.getByRole('button', { name: /^Melding verwijderen/ }).click();
            const confirm = page.getByRole('alertdialog', { name: 'Deze melding verwijderen?' });
            await expectClickable(confirm.getByRole('button', { name: 'Verwijderen', exact: true }));
            await expectClickable(confirm.getByRole('button', { name: 'Annuleren', exact: true }));
          }
          if (hash === '#/admin') {
            await expectClickable(page.getByRole('link', { name: 'Iemand uitnodigen' }));
            // Uitgenodigd and Geblokkeerd are long: on a small phone two and two, not three and a lone one.
            await expectEvenChipRows(page);
          }
          await expectFieldsFit(page);
          await expectNoClippedLabels(page);
          await expectNoSideScroll(page);
        });
      }

      test('settings and account, offline: the note and Opnieuw proberen', async ({ page }) => {
        known(name, 'nl-account-offline');
        await seedAccount(page, ME_MEMBER);
        const me = page.waitForResponse('**/api/v1/me');
        await page.goto('./#/settings');
        await me;
        await expect(page.getByText('Muzieklab is nu niet bereikbaar. Je kunt je account wijzigen zodra Muzieklab weer bereikbaar is.')).toBeVisible();
        await expectClickable(page.getByRole('button', { name: 'Opnieuw proberen' }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
        await page.goto('./#/account');
        await expectClickable(page.getByRole('button', { name: 'Opnieuw proberen' }));
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin invite, the result: Uitnodiging voor … is klaar', async ({ page }) => {
        known(name, 'nl-admin-invite-result');
        const noor = accountDetail({ ...ACCOUNTS[0], name: 'Noor Hendriks', email: 'noor@example.com' });
        await mockApi(page, { ...ADMIN, 'POST /admin/invites': { json: { ...INVITE_LINK_CREATED, account: noor } } });
        await page.goto('./#/admin/invite');
        await page.getByLabel('E-mailadres').fill('noor@example.com');
        await page.getByLabel('Naam').fill('Noor Hendriks');
        await page.getByRole('button', { name: 'Uitnodiging maken' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Uitnodiging voor Noor Hendriks is klaar' })).toBeVisible();
        const message = page.getByLabel('Bericht om te versturen');
        await expect(message).toHaveValue(/^Hoi Noor Hendriks, ik heb een account voor je gemaakt bij Muzieklab\. .* hij werkt tot 30 oktober 2026 om \d\d:\d\d\.$/);
        await expectNotSqueezed(message);
        await expectClickable(page.getByRole('button', { name: 'Kopieer bericht' }));
        await expectClickable(page.getByRole('button', { name: 'Nog iemand uitnodigen' }));
        await expectFieldsFit(page);
        await expectNoClippedLabels(page);
        await expectNoSideScroll(page);
      });

      test('admin account, a second password link that fails: De link hieronder werkt misschien niet meer', async ({ page }) => {
        known(name, 'nl-admin-account-link-failed');
        await failedSecondLink(page, 'Link voor een nieuw wachtwoord',
          'Muzieklab is nu niet bereikbaar. Controleer je verbinding en probeer het opnieuw. De link hieronder werkt misschien niet meer.');
      });
    });

    test('play: the intro sheet and the count-in', async ({ page }) => {
      known(name, 'nl-play-intro');
      await seed(page, { progress: { lessons: { ...SOL_DONE, '1.1': { stars: 3, bestAccuracy: 95 } } } });
      await page.goto('./');
      await page.getByRole('button', { name: 'Verder met de les' }).dispatchEvent('click');
      const sheet = page.getByRole('dialog', { name: 'Halve noten' });
      await expect(sheet.getByText('Nieuw in deze les')).toBeVisible();
      await expectClickable(sheet.getByRole('button', { name: 'Luisteren' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await sheet.getByRole('button', { name: 'Start' }).click();
      // The exercise header on tablet and desktop; a phone on its side (under 561 px tall) keeps the phone's info line.
      const head = VIEWPORTS[name].width >= 700 && VIEWPORTS[name].height > 560;
      await expect(page.locator(head ? '.dplay-title .mono-line' : '.play-info .mono-line')).toContainText('Voortellen');
      await expectNoSideScroll(page);
    });

    test('play, results and read notes', async ({ page }) => {
      known(name, 'nl-play');
      await seed(page, { progress: { lessons: SOL_DONE } });
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto('./');
      await page.getByRole('button', { name: 'Verder met de les' }).dispatchEvent('click');
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Tik het ritme' })).toBeAttached();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.setViewportSize(VIEWPORTS.phone);
      await page.getByRole('button', { name: 'Naar de uitslag' }).click();
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(page.getByRole('heading', { name: 'Les 2.1 klaar' })).toBeVisible();
      await expectClickable(page.getByRole('button', { name: 'Nog een keer' }));
      await expectClickable(page.getByRole('button', { name: 'Nieuwe oefening' }));
      await expectClickable(page.getByRole('button', { name: 'Kopieer code' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      await page.goto('./#/notes');
      await page.getByRole('button', { name: 'Kruisen ♯' }).click();
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.getByRole('img', { name: /notenbalk in C majeur/ })).toBeVisible();
      await expectClickable(page.getByRole('radio', { name: 'kruis' }));
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
      // On the piano, the key labels' switch beside "Elk octaaf telt": "Geen namen" fits its segment at every size.
      await page.getByRole('group', { name: 'Antwoord met' }).getByRole('button', { name: 'Piano' }).click();
      await expect(page.getByRole('group', { name: 'Namen op de toetsen' })).toBeVisible();
      await expectNoClippedLabels(page);
      await expectNoSideScroll(page);
    });
  });
}

test.describe('the status filter at every phone width', () => {
  test.use({ serviceWorkers: 'block', hasTouch: true });
  // The fixed sizes miss widths in between (an Android phone is often 360 px wide, where Dutch once broke 3 + 1).
  for (const language of ['en', 'nl']) {
    for (const [screen, hash] of [['Accounts', '#/admin'], ['Feedback', '#/admin/feedback']]) {
      test(`${language}, ${screen}: all four chips on one line, or two and two, from 320 to 699 px`, async ({ page }) => {
        await seed(page, { prefs: { language, seenHowTo: true, seenHold: true } });
        await mockApi(page, { ...adminApi(), ...feedbackServer().routes });
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto('./' + hash);
        await expect(page.getByRole('group', { name: 'Status' }).getByRole('button')).toHaveCount(4);
        for (let width = 320; width < 700; width += 2) {
          await page.setViewportSize({ width, height: 800 });
          await expectEvenChipRows(page, `${width} px:`);
        }
        await expectNoSideScroll(page);
      });
    }
  }
});

test.describe("Learn's tables and diagrams at every phone width", () => {
  // The fixed sizes miss widths in between: Dutch "halfzwaar" ran into "licht" up to 360 px, a common Android width.
  // One test per chapter, so they run side by side.
  for (const language of ['en', 'nl']) {
    for (const c of CHAPTERS) {
      test(`${language}: chapter ${c.n}'s words stay apart from 320 to 699 px`, async ({ page }) => {
        await seed(page, { prefs: { language, seenHowTo: true, seenHold: true } });
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto(`./#/learn/${c.n}`);
        await expect(page.locator('.learn-section')).toHaveCount(c.sections.length);
        for (let width = 320; width < 700; width += 10) {
          await page.setViewportSize({ width, height: 800 });
          await expectLearnWordsApart(page, `${width} px:`);
        }
      });
    }
  }
});

/**
 * Exercise screens fit a portrait phone at every height, not only at the sizes in VIEWPORTS (DESIGN.md §9, Phone
 * browsers). Between the short-screen steps, on phones 600–660 and 700–800 px tall (an iPhone Pro Max in Safari is
 * 430 × 739, an iPhone mini 375 × 629, Android phones in Chrome 360 × 640 to 412 × 732), Play, Read notes and Scales ran
 * past the screen and cut off Skip, Hint and Next note. Each screen is started once and the window resized.
 */
test.describe('exercise screens at phone heights between the steps', () => {
  test.use({ hasTouch: true, viewport: VIEWPORTS.phone });
  const SIZES = [[390, 720], [430, 739], [360, 700], [412, 790], [390, 661], [320, 661], [375, 629], [414, 622], [360, 640]] as const;
  const each = async (page: Page, check: () => Promise<void>): Promise<void> => {
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await test.step(`${width} × ${height}`, check);
    }
  };

  test('play: eight bars with the pendulum, the pad and Skip in view', async ({ page }) => {
    await seedRun(page, { ...QUARTERS, notes: ['quarter', 'eighth'], rests: ['quarter'], bars: 8, tempo: 60 }, 3, { metronomeLook: 'analog' });
    await page.goto('./#/play');
    await page.getByRole('dialog', { name: 'Ready?' }).getByRole('button', { name: /^Start/ }).click();
    await expect(page.locator('.beats--analog')).toBeVisible();
    await each(page, async () => {
      await expectFits(page);
      await expectClickable(pad(page), { scroll: false });
      await expectTouchHeight(pad(page));
      await expectClickable(page.getByRole('button', { name: 'Skip to results' }), { scroll: false });
    });
  });

  test('read notes: two ledger lines on the piano and a why of three lines, Hint and Next note in view', async ({ page }) => {
    // G♭ major, seed 1234, as in "ledger lines with a key signature and a timer fit": the natural key for the first
    // note says why in three lines on a phone.
    const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, input: 'piano', range: 'ledger2', keys: ['Gb'], clefs: ['treble', 'bass'], extras: 'both', count: 30, playNotes: false, timer: 5 };
    await seed(page, { prefs: { seenHowTo: true, seenHold: true, noteNames: 'letters' } });
    await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 1234, focus: [] });
    await page.goto('./#/notes/play');
    await page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button', { name: /^G, sol/ }).dispatchEvent('click');
    await expect(page.locator('.nfeedback')).toHaveText(/^That was G♭ \(sol♭\)/);
    await each(page, async () => {
      await expectFits(page);
      await expectClickable(page.getByRole('button', { name: 'Hint' }), { scroll: false });
      await expectClickable(page.getByRole('button', { name: /^Next note/ }), { scroll: false });
      await expectTouchHeight(page.locator('.piano-black').first());
    });
  });

  test('scales: up and down on the piano, its letters and Skip in view', async ({ page }) => {
    await seed(page, {
      prefs: { seenHowTo: true, seenHold: true },
      progress: { scales: { settings: { keyMode: 'one', keys: ['Bb'], types: ['harmonic'], input: 'piano', direction: 'upDown', write: 'signs', showSteps: true, playNotes: false }, stars: {} } },
    });
    await page.goto('./#/scales/setup');
    await page.getByRole('button', { name: 'Start · 1 scale' }).click();
    await expect(page.getByRole('list', { name: 'Scale degrees going down' })).toBeVisible();
    await each(page, async () => {
      await expectFits(page);
      for (const label of await page.locator('.spiano .piano-label').all()) await expect(label).toBeInViewport({ ratio: 1 });
      await expectClickable(page.getByRole('button', { name: 'Skip to summary' }), { scroll: false });
    });
  });
});

/**
 * Forced colors (a Windows contrast theme) paint every background in the page's colour and all text and borders in one
 * colour (DESIGN.md §11). A state shown only by a fill or a colour then disappears; each must still show: the chosen
 * option of every group beside one that is not chosen, a switch's knob and edge, a filled button's shape, Play's beat,
 * Read notes' right and wrong answers, a piano's black keys and the Learn piano's marked keys. Compared by what the
 * browser paints (the computed colours are the forced ones).
 */
test.describe('forced colors (a contrast theme)', () => {
  test.use({ viewport: VIEWPORTS.phone, hasTouch: true });
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the chosen options, the switches, the filled buttons, the beat and the answers still show`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, forcedColors: 'active' });
      await seed(page, { prefs: { seenHowTo: true, seenHold: true, noteNames: 'letters' }, progress: { lessons: {}, practiceDays: [], lastSettings: { ...QUARTERS, bars: 4, tempo: 60 } } });
      const lost = (): Promise<string[]> =>
        page.evaluate(() => {
          const look = (el: Element): string => {
            const s = getComputedStyle(el);
            return [s.backgroundColor, s.color, s.borderTopColor, s.borderTopStyle, s.borderTopWidth, s.outlineStyle, s.textDecorationLine].join(' ');
          };
          const ground = getComputedStyle(document.body).backgroundColor;
          const out: string[] = [];
          // Each chosen option beside one of its group that is not chosen (a segment, a chip, a sign, a key on the circle).
          for (const on of document.querySelectorAll('[aria-pressed=true], [role=radio][aria-checked=true]')) {
            const others = on.matches('[role=radio]') ? '[role=radio][aria-checked=false]' : '[aria-pressed=false]';
            let off: Element | null = null;
            for (let box = on.parentElement, up = 0; box && !off && up < 3; box = box.parentElement, up++) off = box.querySelector(others);
            const name = on.getAttribute('aria-label') || on.textContent;
            if (off && look(on) === look(off)) out.push(`${name}: the chosen option looks like the others`);
          }
          for (const track of document.querySelectorAll('.switch')) {
            const knob = getComputedStyle(track.querySelector('.switch-knob')!);
            const s = getComputedStyle(track);
            if (knob.backgroundColor === s.backgroundColor) out.push('a switch: its knob is not drawn');
            if (s.backgroundColor === ground && s.outlineStyle === 'none' && s.borderTopStyle === 'none') out.push('a switch: its track is not drawn');
          }
          for (const btn of document.querySelectorAll('.btn--accent, .btn--ink')) {
            const s = getComputedStyle(btn);
            if (s.backgroundColor === ground && s.borderTopStyle === 'none') out.push(`${btn.textContent}: drawn as plain text`);
          }
          // The beat's circle, filled, or a ring in the count-in.
          const dot = document.querySelector('.beats-dot');
          const fill = dot && getComputedStyle(dot);
          if (fill && (fill.backgroundColor === ground || /, 0\)$/.test(fill.backgroundColor)) && fill.outlineStyle === 'none') out.push("Play's beat is not marked");
          for (const kind of ['.name-btn', '.piano-white', '.piano-black']) {
            const plain = document.querySelector(`${kind}:not(.is-right):not(.is-wrong):not(.is-marked)`);
            for (const mark of ['is-right', 'is-wrong', 'is-marked']) {
              const el = document.querySelector(`${kind}.${mark}`);
              if (el && plain && look(el) === look(plain)) out.push(`${kind} ${mark}: looks like the others`);
            }
          }
          // A piano's black key, drawn only with its fill: it must differ from the page or have an edge.
          for (const key of document.querySelectorAll('.piano-black')) {
            const s = getComputedStyle(key);
            const filled = s.backgroundColor !== ground && !/, 0\)$|transparent/.test(s.backgroundColor);
            if (!filled && (s.borderTopStyle === 'none' || parseFloat(s.borderTopWidth) === 0) && s.outlineStyle === 'none') {
              out.push(`${key.getAttribute('aria-label')}: the black key is not drawn`);
            }
          }
          return out;
        });
      for (const hash of ['#/setup', '#/settings', '#/notes', '#/scales']) {
        await page.goto('./' + hash);
        await expect(page.locator('.page').getByRole('button').first()).toBeVisible();
        await expect.poll(lost, hash).toEqual([]);
      }
      // Read notes: a wrong name marks it and the right one.
      const settings: NoteSettings = { ...DEFAULT_NOTE_SETTINGS };
      const [first] = generateRound(settings, 7);
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings, seed: 7, focus: [] });
      // A new page load, so the app reads the round just seeded (from the app, a new hash alone keeps its state).
      await page.goto('about:blank');
      await page.goto('./#/notes/play');
      const wrong = letterOf(first.step) === 'C' ? 'D' : 'C';
      await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: new RegExp(`^${wrong}(,|$)`) }).click();
      await expect(page.locator('.name-btn.is-wrong')).toHaveCount(1);
      await expect(page.locator('.name-btn.is-right')).toHaveCount(1);
      await expect.poll(lost, 'Read notes').toEqual([]);
      // Read notes on the piano: its black keys, and a wrong black key and the right white one marked. In C major with
      // no signs every note is a white key, so the first black key is wrong.
      const piano: NoteSettings = { ...DEFAULT_NOTE_SETTINGS, input: 'piano' };
      await page.addInitScript((run) => sessionStorage.setItem('muzieklab.noteRun.v1', JSON.stringify(run)), { settings: piano, seed: 7, focus: [] });
      await page.goto('about:blank');
      await page.goto('./#/notes/play');
      const black = page.locator('.piano-black');
      await expect(black).toHaveCount(5);
      await expect.poll(lost, 'the piano').toEqual([]);
      await black.first().click();
      await expect(page.locator('.piano-black.is-wrong')).toHaveCount(1);
      await expect(page.locator('.piano-white.is-right')).toHaveCount(1);
      await expect.poll(lost, 'the piano, answered').toEqual([]);
      // Learn's piano diagram: the half steps' keys (E, F, B, C) are marked.
      await page.goto('./#/learn/9?s=9.2');
      await expect(page.locator('.piano-white.is-marked')).toHaveCount(4);
      await expect.poll(lost, "Learn's piano").toEqual([]);
      // Play's beat counter: its ring in the count-in, then its circle on bar 1.
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await expect(page.locator('.beats.is-count-in')).toHaveCount(1);
      expect(await lost(), 'the count-in').toEqual([]);
      await expect(page.getByRole('img', { name: /^Counting beat 1 / })).toBeVisible({ timeout: 8000 });
      expect(await lost(), 'bar 1').toEqual([]);
      // Scales on the piano: D major's F♯ and C♯ are black keys.
      await seed(page, {
        prefs: { seenHowTo: true, seenHold: true },
        progress: { scales: { settings: { keyMode: 'one', keys: ['D'], types: ['major'], input: 'piano', direction: 'up', write: 'signs', showSteps: true, playNotes: false }, stars: {} } },
      });
      await page.goto('about:blank');
      await page.goto('./#/scales/setup');
      await page.getByRole('button', { name: 'Start · 1 scale' }).click();
      await expect(page.locator('.spiano .piano-black').first()).toBeVisible();
      await expect.poll(lost, 'the Scales piano').toEqual([]);
    });

    test(`${scheme}: the stars not earned, the circle's levels, Progress's calendar, bars and meters, and the XP bar still show`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, forcedColors: 'active' });
      await page.clock.setFixedTime(PROGRESS_CLOCK);
      // The boards' sample player: C, G and F major at ★★★, D and B♭ at ★★, A and E♭ at ★; a streak, missed days, XP.
      await seed(page, { progress: richProgress(), prefs: { ...PROGRESS_PREFS, seenHowTo: true, seenHold: true } });
      /**
       * How each element is drawn, by its computed (forced) colours: its fill (none when it is the page's), its edge,
       * its ring and its text colour; null when there is none on the screen.
       */
      const looks = (selectors: string[]): Promise<(string | null)[]> =>
        page.evaluate((sels) => {
          const ground = getComputedStyle(document.body).backgroundColor;
          return sels.map((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const s = getComputedStyle(el);
            const fill = s.backgroundColor === ground || /^rgba\(.*, 0\)$|transparent/.test(s.backgroundColor) ? 'none' : s.backgroundColor;
            const edge = s.borderTopStyle === 'none' || parseFloat(s.borderTopWidth) === 0 ? 'none' : `${s.borderTopStyle} ${s.borderTopWidth} ${s.borderTopColor}`;
            const ring = s.outlineStyle === 'none' ? 'none' : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
            return `fill ${fill}, edge ${edge}, ring ${ring}, text ${s.color}`;
          });
        }, selectors);
      /** Each is on the screen and drawn: a fill, an edge or a ring. */
      const expectDrawn = async (where: string, selectors: string[]): Promise<void> => {
        const all = await looks(selectors);
        selectors.forEach((sel, i) => {
          expect(all[i], `${where}: ${sel} is on the screen`).not.toBeNull();
          expect(all[i], `${where}: ${sel} is drawn`).not.toMatch(/^fill none, edge none, ring none/);
        });
      };
      /** Each is on the screen, and no two look the same. */
      const expectDistinct = async (where: string, selectors: string[]): Promise<void> => {
        const all = await looks(selectors);
        selectors.forEach((sel, i) => expect(all[i], `${where}: ${sel} is on the screen`).not.toBeNull());
        for (let i = 0; i < selectors.length; i++) {
          for (let j = i + 1; j < selectors.length; j++) expect(all[i], `${where}: ${selectors[i]} looks like ${selectors[j]}`).not.toBe(all[j]);
        }
      };

      // The Scales hub: each level of the circle (none, ★, ★★, ★★★) and its legend's dots; the selected key's stars.
      await page.goto('./#/scales');
      const circle = page.getByRole('group', { name: 'Circle of fifths, major keys' });
      await circle.getByRole('button', { name: /^D major/ }).click();
      await expect(page.getByRole('button', { name: 'Practice D major' })).toBeVisible();
      const key = (level: number): string => `.circle-key--major.is-l${level}:not(.is-sel)`;
      await expectDistinct('the circle', [key(0), key(1), key(2), key(3)]);
      await expectDrawn("the circle's legend", ['.hub-dot.is-l1', '.hub-dot.is-l2', '.hub-dot.is-l3']);
      await expectDistinct("the circle's legend", ['.hub-dot.is-l1', '.hub-dot.is-l2', '.hub-dot.is-l3']);
      // D major's two stars of three: the third is drawn outlined, not as a star in another colour.
      await expect(page.getByRole('img', { name: '2 of 3 stars' }).first()).toHaveText('★★☆');

      // Progress: the streak calendar's days and its legend, the XP bar and the skill map's bands.
      await page.goto('./#/progress');
      await expect(page.locator('.prog-cal')).toBeVisible();
      const day = (state: string): string => `.prog-cal-day.is-${state}:not(.is-now)`;
      await expectDistinct('the calendar', [day('streak'), day('practised'), day('missed'), day('future')]);
      const swatch = (state: string): string => `.prog-streak .prog-swatch.is-${state}`;
      await expectDrawn("the calendar's legend", [swatch('streak'), swatch('practised'), swatch('missed'), swatch('now'), '.prog-streak-dot']);
      await expectDistinct("the calendar's legend", [swatch('streak'), swatch('practised'), swatch('missed')]);
      await expectDrawn('the XP bar', ['.prog-xp', '.prog-xp > div']);
      await expectDistinct('the XP bar', ['.prog-xp', '.prog-xp > div']);
      await expectDistinct('the skill map', ['.prog-cell.is-high', '.prog-cell.is-mid', '.prog-cell.is-weak', '.prog-cell.is-locked']);
      await expectDrawn("the skill map's legend", ['.prog-map-legend .prog-swatch.is-high', '.prog-map-legend .prog-swatch.is-mid', '.prog-map-legend .prog-swatch.is-weak']);
      await expectDistinct("the skill map's legend", ['.prog-map-legend .prog-swatch.is-high', '.prog-map-legend .prog-swatch.is-mid', '.prog-map-legend .prog-swatch.is-weak']);
      await expectDistinct('the achievements', ['.prog-badge.is-earned .prog-badge-icon', '.prog-badge:not(.is-earned) .prog-badge-icon']);
      await page.getByRole('group', { name: 'Show progress for' }).getByRole('button', { name: 'Notes' }).click();
      await expectDrawn('accuracy per clef', ['.prog-clef .prog-meter', '.prog-clef .prog-meter > span']);
      await expectDistinct('accuracy per clef', ['.prog-clef .prog-meter', '.prog-clef .prog-meter > span']);
      await page.getByRole('group', { name: 'Show progress for' }).getByRole('button', { name: 'Scales' }).click();
      await expectDrawn('the major scales', ['.prog-track', '.prog-track > div']);
      await expectDistinct('the major scales', ['.prog-track', '.prog-track > div', '.prog-major.is-2', '.prog-major.is-0']);

      // Skill levels: each skill's ten segments (passed, the next one's part, still to come) and the legend.
      await page.goto('./#/progress/skills');
      await expect(page.locator('.skill-seg').first()).toBeVisible();
      await expectDrawn('the level meters', ['.skill-seg', '.skill-seg-fill:not(.is-part)', '.skill-seg-fill.is-part', '.skill-swatch:not(.is-part)', '.skill-swatch.is-part']);
      await expectDistinct('the level meters', ['.skill-seg-fill:not(.is-part)', '.skill-seg-fill.is-part']);
      await expectDistinct("the meters' legend", ['.skill-swatch:not(.is-part)', '.skill-swatch.is-part']);
      // One skill: its meter, the checks' marks and bars, the 12 weeks' bars, and its ladder.
      await page.goto('./#/progress/skills/treble');
      await expect(page.locator('.skill-hist')).toBeVisible();
      await expectDrawn('Treble clef', ['.skill-bar', '.skill-check-mark', '.skill-check-bar', '.skill-check-bar > span', '.skill-hist > span:not(.is-now)', '.skill-hist > span.is-now']);
      await expectDistinct("Treble clef's weeks", ['.skill-hist > span:not(.is-now)', '.skill-hist > span.is-now']);
      await expectDistinct("Treble clef's levels", ['.skill-ladder li.is-passed .skill-ladder-n', '.skill-ladder li.is-next .skill-ladder-n', '.skill-ladder li.is-later .skill-ladder-n']);

      // Home's level sheet: the XP bar.
      await page.goto('./#/');
      await page.locator('.level-chip').click();
      await expectDrawn("the level sheet's XP bar", ['.xp-bar', '.xp-bar > div']);
      await expectDistinct("the level sheet's XP bar", ['.xp-bar', '.xp-bar > div']);

      // Results: Skip, so none of the three stars is earned; each is outlined, not filled in the text's colour as an
      // earned one is.
      await page.goto('./#/setup');
      await page.getByRole('button', { name: /^Start · / }).click();
      await page.getByRole('button', { name: 'Skip to results' }).click();
      await expect(page.getByRole('img', { name: '0 of 3 stars' })).toBeVisible();
      const off = await page.locator('.score-stars-row > span').evaluateAll((stars) =>
        stars.map((star) => {
          const s = getComputedStyle(star);
          return s.color !== getComputedStyle(document.body).color && parseFloat(s.webkitTextStrokeWidth) > 0;
        }),
      );
      expect(off, 'the stars not earned, outlined').toEqual([true, true, true]);
    });
  }
});

/** The feedback tool (docs/FEEDBACK-LOOP.md): for an account with feedback.give, saving the report for an admin to review. */
const FAB = 'Feedback: mark a part of this screen';
const SAVED_TEXT = 'An admin reads it in Settings → Account → Feedback, and picks what goes on to GitHub.';

for (const name of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(`${name}: feedback`, () => {
    test.use({ viewport: VIEWPORTS[name], hasTouch: !name.startsWith('desktop') && !name.startsWith('laptop'), serviceWorkers: 'block' });

    test('only with feedback.give; mark a spot or draw a box, and save it for review', async ({ page }) => {
      const fab = page.getByRole('button', { name: FAB });
      const server = feedbackServer();
      // An account without feedback.give: no button.
      const api = await mockApi(page, { ...MEMBER, ...server.routes });
      await seedAccount(page, ME_MEMBER);
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('link', { name: /^Sam Jansen/ })).toBeVisible();
      await expect(fab).toHaveCount(0);

      // An admin has it, in feedback mode only: off, there is no button and no switch for it on this device.
      const off = { ...ME_ADMIN, feedbackMode: false };
      api.set(signedInAs(off));
      await seedAccount(page, off);
      await page.reload();
      await expect(page.getByRole('link', { name: /^Ann de Vries/ })).toBeVisible();
      await expect.poll(() => api.callsTo('GET /me').length).toBeGreaterThan(0);
      await expect(page.getByRole('switch', { name: 'Feedback button' })).toHaveCount(0);
      await expect(fab).toHaveCount(0);
      api.set(ADMIN);
      await seedAccount(page, ME_ADMIN);
      await page.reload();
      await expectClickable(fab, { scroll: false });
      await expect(page.getByRole('switch', { name: 'Feedback button' })).toHaveAttribute('aria-checked', 'true');

      const spot = page.getByText('Fair timing for most players.');
      await spot.evaluate((n) => n.scrollIntoView({ block: 'center' }));
      await fab.click();
      await expect(page.getByRole('dialog', { name: /part you mean/ })).toBeVisible();
      const r = (await spot.boundingBox())!;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);

      const form = page.getByRole('dialog', { name: 'Feedback' });
      await expect(form).toBeVisible();
      await expect(form.locator('.fb-marked').first()).toContainText('Fair timing for most players.');
      await expect(form.getByText(/^Saved for the team to review, with this screen, .* If it is picked up, it becomes a public GitHub issue, without your name\.$/)).toBeVisible();
      // Nothing to send until it says what should change.
      await expect(form.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
      await form.getByLabel('What should change?').fill('Say what each leniency does in milliseconds too.');
      await expectClickable(form.getByRole('button', { name: 'Send', exact: true }));
      await expectClickable(form.getByRole('button', { name: 'Copy' }));
      await expectNoClippedLabels(page);
      await form.getByRole('button', { name: 'Send', exact: true }).click();

      // Saved in the app, not sent on to GitHub: no issue to link to. An admin can review it straight away.
      const done = page.getByRole('dialog', { name: 'Saved for review' });
      await expect(done).toBeVisible();
      await expect(done.getByText(SAVED_TEXT)).toBeVisible();
      const [saved] = server.reports();
      await expect(done.getByRole('link', { name: 'Review it' })).toHaveAttribute('href', '#/admin/feedback/' + saved.id);
      await expect(done.getByRole('link', { name: /issue|GitHub/ })).toHaveCount(0);
      for (const control of [done.getByRole('link', { name: 'Review it' }), done.getByRole('button', { name: 'Mark another' }), done.getByRole('button', { name: 'Close' })]) {
        await expectClickable(control);
        await expectTouchHeight(control);
      }
      await expectNoClippedLabels(page);
      const report = api.callsTo('POST /feedback')[0].body as FeedbackReport;
      expect(report).toMatchObject({ kind: 'change', description: 'Say what each leniency does in milliseconds too.', context: { route: '/settings' } });
      expect(report.context.viewport).toMatchObject({ width: VIEWPORTS[name].width, height: VIEWPORTS[name].height });
      expect(report.target.text).toContain('Fair timing for most players.');
      // The box with the scroll offset finds the spot again on the page scrolled back to its top: the page scrolls in
      // .page, not the window.
      const foundAgain = async (sent: FeedbackReport): Promise<void> => {
        const top = await page.evaluate((selector) => {
          const el = document.querySelector(selector)!;
          for (let n = el.parentElement; n; n = n.parentElement) n.scrollTop = 0;
          return el.getBoundingClientRect().y;
        }, sent.target.selector);
        expect(Math.abs(sent.target.rect.y + sent.target.scroll.y - top), `box y ${sent.target.rect.y} + scroll ${sent.target.scroll.y}`).toBeLessThan(2);
      };
      await foundAgain(report);

      // Settings' side column on a wider screen stays put while the page scrolls (position: sticky), so the page's
      // scroll is left out of its offset; on a phone in landscape it scrolls with the page, and that scroll counts.
      const side = page.locator('.set-side');
      if (await side.count()) {
        const item = side.getByRole('button', { name: 'Sound' });
        // Scrolled as far down as the page goes with the item in view.
        await page.locator('.page').evaluate((n) => {
          n.scrollTop = n.scrollHeight;
        });
        await item.scrollIntoViewIfNeeded();
        const scrolledBy = await page.locator('.page').evaluate((n) => n.scrollTop);
        const sticky = await side.evaluate((n) => getComputedStyle(n).position === 'sticky');
        await done.getByRole('button', { name: 'Mark another' }).click();
        await expect(page.getByRole('dialog', { name: /part you mean/ })).toBeVisible();
        const s = (await item.boundingBox())!;
        await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
        await form.getByLabel('What should change?').fill('Show which section is on screen.');
        await form.getByRole('button', { name: 'Send', exact: true }).click();
        await expect(done).toBeVisible();
        const inSide = api.callsTo('POST /feedback')[1].body as FeedbackReport;
        expect(await page.evaluate((selector) => !!document.querySelector(selector)?.closest('.set-side'), inSide.target.selector)).toBe(true);
        expect(scrolledBy).toBeGreaterThan(0);
        expect(inSide.target.scroll).toEqual({ x: 0, y: sticky ? 0 : scrolledBy });
        await foundAgain(inSide);
      }

      // Mark another, drawing a box this time.
      await done.getByRole('button', { name: 'Mark another' }).click();
      await expect(page.getByRole('dialog', { name: /part you mean/ })).toBeVisible();
      const vp = VIEWPORTS[name];
      await page.mouse.move(vp.width * 0.2, vp.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(vp.width * 0.5, vp.height * 0.5, { steps: 4 });
      await page.mouse.move(vp.width * 0.7, vp.height * 0.6, { steps: 4 });
      await page.mouse.up();
      await expect(form.locator('.fb-marked').first()).toContainText('Marked area');
      await expect(form.getByLabel('What should change?')).toHaveValue('');
      await form.getByRole('button', { name: 'Close' }).click();
      await expect(form).toHaveCount(0);
      await expect(fab).toBeVisible();
      // The focus is back on the button that opened the tool, so the keyboard and a screen reader keep their place.
      await expect(fab).toBeFocused();
      await expectNoSideScroll(page);
    });

    test('without the tab bar or header the button is a tab at the edge, on none of the controls that stay put', async ({ page }) => {
      const vp = VIEWPORTS[name];
      await mockApi(page, {
        ...ADMIN,
        ...feedbackServer().routes,
        'POST /auth/reset/check': { json: { email: ME_ADMIN.email, name: ME_ADMIN.name, expiresAt: '2026-10-29T10:00:00.000Z' } },
      });
      await seedAccount(page, ME_ADMIN);
      const fab = page.getByRole('button', { name: FAB });
      // A phone in landscape has its answers and Start in the right-hand column: there the tab is on the left edge.
      const left = vp.width > vp.height && vp.height <= 560;
      /** The tab is on screen, at its edge and as large as a touch target, and no part of these controls lies under it. */
      const clearOf = async (controls: Locator): Promise<void> => {
        await expectClickable(fab, { scroll: false });
        const f = (await fab.boundingBox())!;
        expect(Math.round(left ? f.x : vp.width - f.x - f.width), 'at the edge').toBe(0);
        expect(Math.min(f.width, f.height), 'a touch target').toBeGreaterThanOrEqual(44);
        const boxes = await controls.evaluateAll((els) =>
          els.map((el) => ({ ...el.getBoundingClientRect().toJSON(), name: el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('class') || el.tagName.toLowerCase() }) as DOMRect & { name: string }),
        );
        expect(boxes.length).toBeGreaterThan(0);
        for (const r of boxes) {
          const over = r.x < f.x + f.width && f.x < r.x + r.width && r.y < f.y + f.height && f.y < r.y + r.height;
          expect(over, `the Feedback button is on “${r.name}”`).toBe(false);
        }
      };
      const piano = page.getByRole('group', { name: /^Piano keyboard/ }).getByRole('button');
      const skip = page.getByRole('button', { name: /^Skip to (summary|results)/ });
      // Setup's Start, which stays in place while the rest scrolls.
      await page.goto('./#/notes');
      await clearOf(page.getByRole('button', { name: /^Start · / }));
      await page.getByRole('button', { name: /^Start · / }).click();
      // Nor the staff: its last note, often the one to name, is read there.
      await clearOf(page.locator('.nplay-staff svg'));
      await clearOf(page.getByRole('group', { name: 'Note names' }).getByRole('button'));
      await clearOf(page.getByRole('group', { name: 'Answer with' }).getByRole('button'));
      await page.getByRole('group', { name: 'Answer with' }).getByRole('button', { name: 'Piano' }).click();
      await clearOf(piano);
      await clearOf(page.getByRole('button', { name: /^(Hint|Next note)/ }));
      await clearOf(skip);
      // Scales: Hear it so far and Start over come in the middle of the screen with the first note.
      await page.goto('./#/scales/setup');
      await clearOf(page.getByRole('button', { name: /^Start · / }));
      await page.getByRole('button', { name: /^Start · / }).click();
      await clearOf(page.locator('.nplay-staff svg'));
      await clearOf(piano);
      // Hidden in their place until then, so out of the accessibility tree.
      const tools = page.getByRole('button', { name: /^(Hear it so far|Start over)/ });
      for (let i = 0; (await tools.count()) === 0; i++) await piano.nth(i).click();
      await clearOf(tools);
      await clearOf(piano);
      await clearOf(skip);
      // Its results.
      await skip.first().click();
      await clearOf(page.getByRole('button', { name: /^(New round|Change setup)/ }));
      // The rhythm exercise: How to play, the pad, Pause and Skip.
      await page.goto('./#/setup');
      await clearOf(page.getByRole('button', { name: /^Start · / }));
      await page.getByRole('button', { name: /^Start · / }).click();
      await clearOf(page.getByRole('button', { name: 'Got it' }));
      await page.getByRole('button', { name: 'Got it' }).click();
      await clearOf(page.locator(':is(.play-staff, .tplay-staff, .dplay-staff) svg'));
      await clearOf(page.getByRole('button', { name: /^(Tap pad|Pause)$/ }));
      // Calibrate: the count and the delay, read while tapping, the pips and the pad.
      await page.goto('./#/calibrate');
      await clearOf(page.locator('.cal-stats > .cal-stat, .pips, .cal .pad'));
      // A form on its own: the account's own new-password link.
      await page.goto('./#/reset/' + TOKEN);
      await expect(page.getByLabel('New password')).toBeVisible();
      await clearOf(page.locator('form').getByRole('button').or(page.getByLabel('New password')));
      // A screen with the tab bar or the header keeps it in the bottom-right corner (on a phone, above the tab bar).
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      const corner = async (): Promise<number[]> => {
        const f = (await fab.boundingBox())!;
        return [vp.width - (f.x + f.width), vp.height - (f.y + f.height)];
      };
      await expect.poll(async () => (await corner()).every((gap) => gap >= 0 && gap <= 80), 'in the bottom-right corner').toBe(true);
    });

    test('with the tab bar or header, a page scrolled to its end has room under it: the button is on none of its controls', async ({ page }) => {
      await mockApi(page, { ...adminApi(), ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      const fab = page.getByRole('button', { name: FAB });
      /** The controls a tap on the button would hit instead: shown where it is, with every box that scrolls at its end. */
      const underIt = (): Promise<string[]> =>
        page.evaluate(() => {
          for (const el of document.querySelectorAll('*')) {
            if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
          }
          const button = document.querySelector<HTMLElement>('.fb-fab')!;
          const f = button.getBoundingClientRect();
          button.style.visibility = 'hidden';
          const hit: string[] = [];
          for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [role="switch"], [role="slider"]')) {
            if (el.closest('[data-feedback-ui]')) continue;
            const r = el.getBoundingClientRect();
            const [x0, x1, y0, y1] = [Math.max(r.left, f.left), Math.min(r.right, f.right), Math.max(r.top, f.top), Math.min(r.bottom, f.bottom)];
            let shown = false;
            for (let x = x0 + 1; x < x1 && !shown; x += 4) {
              for (let y = y0 + 1; y < y1 && !shown; y += 4) {
                const top = document.elementFromPoint(x, y);
                shown = !!top && (top === el || el.contains(top));
              }
            }
            if (shown) hit.push(`${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)} (${Math.round(x1 - x0)} × ${Math.round(y1 - y0)})`);
          }
          button.style.visibility = '';
          return hit;
        });
      const found: Record<string, string[]> = {};
      for (const hash of ['#/', '#/path', '#/learn', '#/learn/1', '#/progress', '#/progress/skills', '#/settings', '#/changelog', '#/account', '#/privacy', '#/admin', '#/admin/invite', '#/admin/deleted', '#/admin/feedback']) {
        await page.goto('./' + hash);
        await expectClickable(fab, { scroll: false });
        // Once its answers have come and the screen is filled in.
        await page.waitForLoadState('networkidle');
        const hit = await underIt();
        if (hit.length) found[hash] = hit;
      }
      expect(found, 'controls under the Feedback button').toEqual({});
    });

    test('the tab at the screen edge shows its whole focus ring', async ({ page }) => {
      await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      await page.goto('./#/setup');
      const fab = page.getByRole('button', { name: FAB });
      await expectFocusRing(fab);
      // Drawn inside the tab, which touches the screen's edge: none of it falls off the screen.
      const off = await fab.evaluate((el) => {
        const style = getComputedStyle(el);
        const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
        const r = el.getBoundingClientRect();
        return r.left - ring < 0 || r.right + ring > window.innerWidth;
      });
      expect(off, 'the focus ring falls off the screen').toBe(false);
    });

    test('a tap or a short drag marks the spot and nothing else: the form opening under the finger is not pressed', async ({ page }) => {
      const vp = VIEWPORTS[name];
      test.skip(vp.width >= 1100, 'a mouse, or a tablet in landscape, where the form is a dialog beside the spot');
      await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      await page.goto('./#/');
      const fab = page.getByRole('button', { name: FAB });
      const form = page.getByRole('dialog', { name: 'Feedback' });
      // Where the form's controls are, opened with a mouse, which sends no click of its own after the press.
      await fab.click();
      await page.mouse.click(vp.width / 2, vp.height / 2);
      await expect(form).toBeVisible();
      // Once it has slid in; the controls in view.
      await page.waitForTimeout(400);
      const spots = await form.locator('button, input').evaluateAll((els) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { name: el.getAttribute('aria-label') ?? el.textContent ?? el.tagName, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          })
          .filter((p) => p.y > 0 && p.y < window.innerHeight),
      );
      expect(spots.length).toBeGreaterThan(2);
      await page.keyboard.press('Escape');
      await expect(form).toHaveCount(0);
      // A drag of 10 px, which marks a box: shorter than a touch screen's tap slop, so it still sends a click after it.
      const cdp = await page.context().newCDPSession(page);
      const shortDrag = async (x: number, y: number): Promise<void> => {
        const to = x + 10 < vp.width ? x + 10 : x - 10;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      for (const spot of spots) {
        for (const [how, mark] of [['a tap', (x: number, y: number) => page.touchscreen.tap(x, y)], ['a short drag', shortDrag]] as const) {
          await fab.click();
          const bar = (await page.locator('.fb-bar').boundingBox())!;
          if (spot.y >= bar.y - 4 && spot.y <= bar.y + bar.height + 4) {
            await page.keyboard.press('Escape');
            continue;
          }
          const where = `${how} where “${spot.name}” opens`;
          await mark(spot.x, spot.y);
          await expect(form, where).toBeVisible();
          await page.waitForTimeout(300);
          await expect(form, where).toBeVisible();
          if (how === 'a tap') await expect(form.locator('.fb-marked'), where).not.toContainText('Marked area');
          else await expect(form.locator('.fb-marked'), where).toContainText('Marked area');
          await expect(page.getByRole('dialog', { name: /part you mean/ })).toHaveCount(0);
          await expect(form.getByLabel('What should change?'), where).toBeFocused();
          await expect(form.getByRole('button', { name: 'Change' }), where).toHaveAttribute('aria-pressed', 'true');
          await page.keyboard.press('Escape');
          await expect(form, where).toHaveCount(0);
          await expect(fab).toBeFocused();
        }
      }
    });

    test('the hint bar moves off what it covers when tapped, and that part can then be marked', async ({ page }) => {
      await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await page.getByRole('button', { name: FAB }).click();
      const bar = page.locator('.fb-bar');
      await expect(bar).toBeVisible();
      // The screen's title on a phone, the header's tabs on a wider screen: something the bar lies over, once it has
      // slid in.
      const under = (): Promise<{ name: string; x: number; y: number } | null> =>
        page.evaluate(() => {
          const b = document.querySelector('.fb-bar')!.getBoundingClientRect();
          for (const el of document.querySelectorAll('main h1, nav a')) {
            const r = el.getBoundingClientRect();
            if (r.width && r.x < b.right && b.x < r.right && r.y < b.bottom && b.y < r.bottom) return { name: el.textContent ?? '', x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
          return null;
        });
      await expect.poll(under, 'a title or tab under the hint bar').not.toBeNull();
      const hidden = await under();
      await bar.locator('#fb-hint').click();
      await expect(bar).toHaveClass(/fb-bar--low/);
      const off = async (): Promise<boolean> => {
        const b = (await bar.boundingBox())!;
        return hidden!.y < b.y || hidden!.y > b.y + b.height;
      };
      await expect.poll(off, 'the bar is off it').toBe(true);
      await page.mouse.click(hidden!.x, hidden!.y);
      await expect(page.getByRole('dialog', { name: 'Feedback' }).locator('.fb-marked')).toContainText(`“${hidden!.name}”`);
    });

    test('the hint bar comes in centred and on screen: it only fades in and drops 4 px', async ({ page }) => {
      await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await page.getByRole('button', { name: FAB }).click();
      await expect(page.locator('.fb-bar')).toBeVisible();
      // Its way in, held at each moment: where the bar is then.
      const frames = await page.evaluate(() => {
        const bar = document.querySelector('.fb-bar')!;
        const [motion] = bar.getAnimations();
        motion.pause();
        return [0, 50, 110, 220].map((t) => {
          motion.currentTime = t;
          const r = bar.getBoundingClientRect();
          return { t, centre: r.left + r.width / 2, left: r.left, right: r.right, width: window.innerWidth };
        });
      });
      for (const f of frames) {
        expect(Math.abs(f.centre - f.width / 2), `centred at ${f.t} ms`).toBeLessThanOrEqual(1);
        expect(f.left, `on screen at ${f.t} ms`).toBeGreaterThanOrEqual(0);
        expect(f.right, `on screen at ${f.t} ms`).toBeLessThanOrEqual(f.width);
      }
    });

    test('the box with its scroll offset finds Start again, sticky as it is, on the page scrolled to its top', async ({ page }) => {
      const api = await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
      await seedAccount(page, ME_ADMIN);
      await page.goto('./#/setup');
      const start = page.getByRole('button', { name: /^Start · / });
      await expect(start).toBeVisible();
      // Scrolled to its end: the side panel (from 700 px) or the Start bar (phone) moved up as far as it goes.
      await page.locator('.page').evaluate((n) => {
        n.scrollTop = n.scrollHeight;
      });
      await page.getByRole('button', { name: FAB }).click();
      const r = (await start.boundingBox())!;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      const form = page.getByRole('dialog', { name: 'Feedback' });
      await expect(form.locator('.fb-marked')).toContainText('Start');
      await form.getByLabel('What should change?').fill('Start could say how long it takes.');
      await form.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Saved for review' })).toBeVisible();
      const sent = api.callsTo('POST /feedback')[0].body as FeedbackReport;
      const top = await page.evaluate((selector) => {
        const el = document.querySelector(selector)!;
        for (let n = el.parentElement; n; n = n.parentElement) n.scrollTop = 0;
        return el.getBoundingClientRect().y;
      }, sent.target.selector);
      expect(Math.abs(sent.target.rect.y + sent.target.scroll.y - top), `box y ${sent.target.rect.y} + scroll ${sent.target.scroll.y}`).toBeLessThan(2);
    });
  });
}

test.describe('feedback: the keyboard, and the marked part’s name', () => {
  test.use({ serviceWorkers: 'block' });

  test('Tab stays in the marking layer; the arrow keys pick a part, the bar names it, and Enter marks it', async ({ page }) => {
    await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
    await seedAccount(page, ME_ADMIN);
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const fab = page.getByRole('button', { name: FAB });
    await fab.focus();
    await page.keyboard.press('Enter');
    const layer = page.getByRole('dialog', { name: /part you mean/ });
    await expect(layer).toBeVisible();
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await layer.evaluate((l) => l.contains(document.activeElement)), `focus in the layer after ${key}`).toBe(true);
    }
    // Down to the screen's title, named in the bar, and marked with Enter.
    const pick = layer.locator('.fb-bar-pick');
    for (let i = 0; i < 40 && (await pick.textContent()) !== 'heading “Settings”'; i++) await page.keyboard.press('ArrowDown');
    await expect(pick).toHaveText('heading “Settings”');
    await expect(layer.locator('.fb-box')).toBeVisible();
    await page.keyboard.press('Enter');
    const form = page.getByRole('dialog', { name: 'Feedback' });
    await expect(form.locator('.fb-marked')).toContainText('heading “Settings”');
    await expect(form.getByLabel('What should change?')).toBeFocused();
  });

  test('a part with lines of its own is named with them apart: “1 Pulse and meter Beat, …”', async ({ page }) => {
    const api = await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
    await seedAccount(page, ME_ADMIN);
    await page.goto('./#/learn');
    const row = page.locator('.chapter-row').first();
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: FAB }).click();
    // A spot on the row itself, between its parts.
    const spot = await row.evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let x = r.right - 2; x > r.left; x -= 4) for (let y = r.top + 4; y < r.bottom; y += 4) if (document.elementsFromPoint(x, y).find((e) => !e.closest('[data-feedback-ui]')) === el) return { x, y };
      return null;
    });
    expect(spot).not.toBeNull();
    await page.mouse.click(spot!.x, spot!.y);
    const form = page.getByRole('dialog', { name: 'Feedback' });
    await expect(form.locator('.fb-marked')).toContainText('button “1 Pulse and meter Beat, tempo');
    await form.getByLabel('What should change?').fill('The chapter row reads well.');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Saved for review' })).toBeVisible();
    const sent = api.callsTo('POST /feedback')[0].body as FeedbackReport;
    expect(sent.target.label + sent.target.text).not.toMatch(/\dPulse|meterBeat/);
  });

  test('a click on a control’s icon or word marks the control; a field is named by its label, without what was typed', async ({ page }) => {
    const api = await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
    await seedAccount(page, ME_ADMIN);
    const form = page.getByRole('dialog', { name: 'Feedback' });
    /** Marks the spot at the centre of `el`: the name the form gives it. */
    const markAt = async (el: Locator): Promise<string> => {
      const r = (await el.boundingBox())!;
      await page.getByRole('button', { name: FAB }).click();
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      return (await form.locator('.fb-marked-text .mono-muted').textContent()) ?? '';
    };
    const close = async (): Promise<void> => {
      await page.keyboard.press('Escape');
      await expect(form).toHaveCount(0);
    };
    await page.goto('./#/settings');
    expect(await markAt(page.getByRole('link', { name: /^Ann de Vries/ }).locator('svg.row-chevron'))).toMatch(/^link “Ann de Vries/);
    // The marked box is the row's, not the chevron's.
    const row = (await page.getByRole('link', { name: /^Ann de Vries/ }).boundingBox())!;
    expect((await page.locator('.fb-spot').boundingBox())!.width).toBeCloseTo(row.width, 0);
    await close();
    await page.goto('./#/notes');
    expect(await markAt(page.locator('.clef-btn b', { hasText: 'Bass' }))).toMatch(/^button “.*Bass F clef”$/);
    await close();
    await page.goto('./#/account');
    const field = page.getByLabel('New password');
    await field.fill('pw-secret-e2e');
    // A click on the field's label marks the field, with the field's box.
    expect(await markAt(page.locator('label.tfield-label', { hasText: /^New password$/ }))).toBe('field “New password”');
    const [spot, box] = await Promise.all([page.locator('.fb-spot').boundingBox(), field.boundingBox()]);
    expect(spot!.width).toBeCloseTo(box!.width, 0);
    expect(spot!.height).toBeCloseTo(box!.height, 0);
    await close();
    expect(await markAt(field)).toBe('field “New password”');
    await form.getByLabel('What should change?').fill('The rules are hard to read.');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Saved for review' })).toBeVisible();
    const sent = api.callsTo('POST /feedback')[0].body as FeedbackReport;
    expect(sent.target.label).toBe('field “New password”');
    expect(JSON.stringify(sent)).not.toContain('pw-secret');
  });

  test('a click on the staff a lesson’s note is written on marks its slider, as the arrow keys pick it', async ({ page }) => {
    await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
    await seedAccount(page, ME_ADMIN);
    // Lesson 3.2 writes mi (and sol) on the staff.
    await seed(page, { progress: { lessons: pathUpTo('3.1') }, prefs: { seenHowTo: true, seenHold: true } });
    await page.goto('./#/path');
    await page.getByRole('button', { name: 'Start lesson 3.2' }).click();
    const staff = page.getByRole('slider', { name: /goes on the staff$/ });
    await expect(staff).toBeVisible();
    const name = `slider “${await staff.getAttribute('aria-label')}”`;
    const r = (await staff.boundingBox())!;
    await page.getByRole('button', { name: FAB }).click();
    // The arrow keys pick the slider, not the staff drawing inside it.
    const layer = page.getByRole('dialog', { name: /part you mean/ });
    const pick = layer.locator('.fb-bar-pick');
    for (let i = 0; i < 40 && (await pick.textContent()) !== name; i++) await page.keyboard.press('ArrowDown');
    await expect(pick).toHaveText(name);
    // A click on the drawing marks the same, with the slider's box.
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    const form = page.getByRole('dialog', { name: 'Feedback' });
    await expect(form.locator('.fb-marked-text .mono-muted')).toHaveText(name);
    const spot = (await page.locator('.fb-spot').boundingBox())!;
    expect(spot.width).toBeCloseTo(r.width, 0);
    expect(spot.height).toBeCloseTo(r.height, 0);
  });
});

test.describe('feedback: marking a staff drawing', () => {
  test.use({ serviceWorkers: 'block' });

  test('logs no errors: its long path is cut in a copy outside the page', async ({ page }) => {
    // Errors the page logs; not a request the mocked API leaves unanswered (a 404), which the browser logs too.
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await mockApi(page, { ...ADMIN, ...feedbackServer().routes });
    await seedAccount(page, ME_ADMIN);
    await page.goto('./#/');
    const staff = page.locator('main svg').first();
    await expect(staff).toBeVisible();
    // A path longer than the report's markup keeps of a value.
    expect(await staff.evaluate((svg) => Math.max(...[...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')?.length ?? 0)))).toBeGreaterThan(120);
    // A click on the drawing, on one of its lines or notes too, marks the whole staff picture, as the arrow keys pick it.
    const r = (await staff.boundingBox())!;
    await page.getByRole('button', { name: FAB }).click();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await expect(page.getByRole('dialog', { name: 'Feedback' }).locator('.fb-marked')).toContainText('image “The notes so far');
    expect(errors).toEqual([]);
  });
});

test.describe('feedback: when saving fails, Review it, and hiding the button', () => {
  test.use({ serviceWorkers: 'block' });

  /** Marks Home's Start lesson and says what is wrong with it, as a bug. */
  async function markStart(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: FAB }).click();
    const target = (await page.getByRole('button', { name: 'Start lesson' }).boundingBox())!;
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    const form = page.getByRole('dialog', { name: 'Feedback' });
    await form.getByRole('button', { name: 'Bug' }).click();
    return form;
  }

  test('an error keeps the form and Send tries again; keys stay in the form; the button hides and comes back', async ({ page }) => {
    // A tester: feedback.give through a role, without feedback.review.
    const tester: Me = {
      ...ME_MEMBER, roles: ['testers'], roleNames: { testers: 'Testers' }, permissions: [...ME_MEMBER.permissions, 'feedback.give'], feedbackMode: true,
    };
    const server = feedbackServer(FEEDBACK, tester);
    const api = await mockApi(page, { ...signedInAs(tester), ...server.routes, 'POST /feedback': apiError('internal', 500) });
    await seedAccount(page, tester);
    await page.goto('./#/');
    const fab = page.getByRole('button', { name: FAB });
    const form = await markStart(page);
    // Keys typed in the form never reach the screen's own shortcuts (the pad and the pianos listen on the window).
    await page.evaluate(() => {
      (window as unknown as { keys: number }).keys = 0;
      window.addEventListener('keydown', () => (window as unknown as { keys: number }).keys++);
    });
    await form.getByLabel('What should change?').pressSequentially('Start lesson does nothing on the first tap.');
    expect(await page.evaluate(() => (window as unknown as { keys: number }).keys)).toBe(0);
    await form.getByRole('button', { name: 'Send', exact: true }).click();

    // Why, and the form as it was: no way round the app (GitHub's own page is gone), Send is the way.
    await expect(form.getByRole('alert')).toHaveText('Something went wrong on our side. Try again later.');
    await expect(form.getByRole('link')).toHaveCount(0);
    await expect(form.getByLabel('What should change?')).toHaveValue('Start lesson does nothing on the first tap.');
    await expect(form.getByRole('button', { name: 'Bug' })).toHaveAttribute('aria-pressed', 'true');
    await expectClickable(form.getByRole('button', { name: 'Send', exact: true }));
    await expectNoOverlap(form.getByRole('alert'), form.getByRole('button', { name: 'Send', exact: true }));

    // Then it works: Send again sends the same report, and it is saved.
    api.set({ 'POST /feedback': server.routes['POST /feedback'] });
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Saved for review' });
    await expect(done).toBeVisible();
    await expect(done.getByText(SAVED_TEXT)).toBeVisible();
    // Only someone who reviews feedback gets the way to the report.
    await expect(done.getByRole('link', { name: 'Review it' })).toHaveCount(0);
    const calls = api.callsTo('POST /feedback');
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual(calls[0].body);
    expect(server.reports()[0]).toMatchObject({ status: 'new', kind: 'bug', description: 'Start lesson does nothing on the first tap.', author: { name: tester.name } });
    await page.keyboard.press('Escape');
    await expect(done).toHaveCount(0);
    await expect(fab).toBeFocused();

    // Hidden on this device, and back from Settings → Account.
    await markStart(page);
    await form.getByRole('button', { name: 'Hide the feedback button on this device' }).click();
    await expect(fab).toHaveCount(0);
    await page.goto('./#/settings');
    const toggle = page.getByRole('switch', { name: 'Feedback button' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(fab).toBeVisible();
  });

  test('a session that ended meanwhile (a new password on another device): the form says so and keeps what was typed, and Sign in says nothing was changed', async ({ page }) => {
    await mockApi(page, { ...ADMIN, ...feedbackServer().routes, 'POST /feedback': apiError('unauthenticated', 401), 'POST /auth/refresh': apiError('unauthenticated', 401) });
    await seedAccount(page, ME_ADMIN);
    const form = page.getByRole('dialog', { name: 'Feedback' });
    /** Send is refused: the sheet says why, keeps what was typed, and has Sign in, with the focus, in place of Send. */
    const sendSignedOut = async (text: string): Promise<void> => {
      await form.getByLabel('What should change?').fill(text);
      await form.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(form.getByRole('alert')).toHaveText("You're signed out. Sign in again to go on.");
      await expect(form.getByLabel('What should change?')).toHaveValue(text);
      await expect(form.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
      await expect(form.getByRole('link', { name: 'Sign in' })).toBeFocused();
      await expectNoOverlap(form.getByRole('alert'), form.getByRole('link', { name: 'Sign in' }));
    };
    /** Sign in closes the tool, and Sign in says nothing was changed. */
    const followSignIn = async (): Promise<void> => {
      await form.getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/#\/signin$/);
      await expect(page.locator('.hint-box')).toHaveText('You were signed out, so nothing was changed. Sign in again to go on.');
      await expect(form).toHaveCount(0);
      await expect(page.getByRole('button', { name: FAB })).toHaveCount(0);
    };

    await page.goto('./#/');
    await markStart(page);
    await sendSignedOut('Start lesson does nothing on the first tap.');
    await expect(form.getByRole('button', { name: 'Bug' })).toHaveAttribute('aria-pressed', 'true');
    // Closed instead, the tool goes: nobody is signed in any more.
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('button', { name: FAB })).toHaveCount(0);

    // Signed in again (the reload seeds the account), on Home: Sign in from the sheet.
    await page.reload();
    await markStart(page);
    await sendSignedOut('Start lesson does nothing on the first tap.');
    await followSignIn();

    // And over Settings, which puts Sign in's line away as soon as the refusal comes.
    await page.goto('./#/settings');
    await page.reload();
    await page.getByRole('button', { name: FAB }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sendSignedOut('The account row says nothing about the session.');
    await followSignIn();
  });

  test('an admin goes from the saved report to it: Review it closes the tool and opens the report', async ({ page }) => {
    const server = feedbackServer();
    await mockApi(page, { ...ADMIN, ...server.routes });
    await seedAccount(page, ME_ADMIN);
    await page.goto('./#/');
    const form = await markStart(page);
    await form.getByLabel('What should change?').fill('Start lesson does nothing on the first tap.');
    await form.getByLabel('Title').fill('The first tap is lost');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Saved for review' });
    await done.getByRole('link', { name: 'Review it' }).click();
    await expect(done).toHaveCount(0);
    const [saved] = server.reports();
    await expect(page).toHaveURL(new RegExp('#/admin/feedback/' + saved.id + '$'));
    await expect(page.getByRole('heading', { level: 1, name: 'The first tap is lost' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Report', exact: true })).toContainText('Start lesson does nothing on the first tap.');
    await expect(page.getByRole('region', { name: 'Where', exact: true })).toContainText('button “Start lesson”');
    await expect(page.getByRole('region', { name: 'Sent', exact: true })).toContainText('Ann de Vries');
    await expect(page.getByRole('region', { name: 'Review', exact: true }).getByRole('button', { name: 'New' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('a touch screen at desktop width (tablet in landscape) gets the desktop layout without keyboard hints', async ({ browser }) => {
  for (const hasTouch of [true, false]) {
    const page = await browser.newPage({ viewport: VIEWPORTS['tablet-landscape'], hasTouch });
    await seed(page, { progress: { lessons: SOL_DONE } });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue lesson' }).dispatchEvent('click');
    await expect(page.getByText(hasTouch ? /^On a computer, any key works/ : /^Any key works/)).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.locator('.dplay')).toBeVisible();
    await expect(page.locator('.dplay-head kbd')).toHaveCount(hasTouch ? 0 : 1);
    await page.goto('./#/notes');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page.locator('.nplay-desk')).toBeVisible();
    if (hasTouch) await expect(page.locator('.nplay-desk kbd')).toHaveCount(0);
    else await expect(page.locator('.nplay-desk kbd').first()).toBeVisible();
    await page.goto('./#/scales/setup');
    await page.getByRole('button', { name: /^Start · / }).click();
    await expect(page.locator('.splay-desk')).toBeVisible();
    if (hasTouch) await expect(page.locator('.splay-desk kbd')).toHaveCount(0);
    else await expect(page.locator('.splay-desk kbd').first()).toBeVisible();
    await page.close();
  }
});
