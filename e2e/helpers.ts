import { expect, type Locator, type Page } from '@playwright/test';

/** Screen sizes the app must work at: the canvas boards plus small, landscape and laptop screens. */
export const VIEWPORTS = {
  'phone-se': { width: 320, height: 568 },
  'phone-small': { width: 375, height: 667 },
  phone: { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
  tablet: { width: 834, height: 1194 },
  'laptop-720': { width: 1280, height: 720 },
  desktop: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** The element can be scrolled to and a click on its centre lands on it (nothing covers it). */
export async function expectClickable(el: Locator, opts: { scroll?: boolean } = {}): Promise<void> {
  await expect(el).toBeVisible();
  // Off for screens that must fit without scrolling (Play): scripts can scroll overflow: hidden boxes, people cannot.
  if (opts.scroll !== false) await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  expect(box, 'element has a box').not.toBeNull();
  const vp = el.page().viewportSize()!;
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  expect(x >= 0 && x <= vp.width && y >= 0 && y <= vp.height, 'centre is on screen').toBe(true);
  const hit = await el.evaluate((node, [px, py]) => {
    const top = document.elementFromPoint(px, py);
    return !!top && (node === top || node.contains(top));
  }, [x, y] as const);
  expect(hit, 'nothing covers the element').toBe(true);
}

/** The box shows all of its content (nothing spills out of a card that was squeezed too small). */
export async function expectNotSqueezed(el: Locator): Promise<void> {
  const spill = await el.evaluate((node) => node.scrollHeight - node.clientHeight);
  expect(spill, 'content spills out of the box').toBeLessThanOrEqual(1);
}

/** Two boxes do not overlap (sibling cards never draw over each other). */
export async function expectNoOverlap(a: Locator, b: Locator): Promise<void> {
  const [ra, rb] = [(await a.boundingBox())!, (await b.boundingBox())!];
  const overlap = ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height;
  expect(overlap, 'boxes overlap').toBe(false);
}

export async function expectNoSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, 'no horizontal scroll').toBe(false);
}

/** Seeds localStorage before the app loads. */
export async function seed(page: Page, data: { prefs?: object; progress?: object }): Promise<void> {
  await page.addInitScript((d) => {
    if (d.prefs) localStorage.setItem('muzieklab.prefs.v1', JSON.stringify(d.prefs));
    if (d.progress) localStorage.setItem('muzieklab.progress.v1', JSON.stringify(d.progress));
  }, data);
}

export const pad = (page: Page): Locator => page.getByRole('button', { name: 'Rhythm pad' });
