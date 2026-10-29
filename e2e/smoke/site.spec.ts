import type { Health } from '../../shared/api';
import { API, expect, PRODUCTION, SITE, test } from './helpers';

/**
 * The deployed site as files and an API (docs/SMOKE.md): the API's health, the headers Caddy adds (deploy/Caddyfile),
 * the app's manifest and service worker, and 404s. Plain requests, no browser; nothing signs in.
 */

test('health: the API and its database answer, as the commit that was deployed', async ({ request }) => {
  test.skip(PRODUCTION, 'production has no API yet (docs/DEPLOY.md, The API)');
  const res = await request.get(API + '/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store');
  const health = (await res.json()) as Health;
  expect(health).toMatchObject({ status: 'ok', db: 'ok' });
  expect(health.commit).toMatch(/^[0-9a-f]{40}$/);
  // CI passes the commit it deployed; run by hand, the commit is only reported.
  if (process.env.SMOKE_COMMIT) expect(health.commit, 'the commit the API runs').toBe(process.env.SMOKE_COMMIT);
  test.info().annotations.push({ type: 'commit', description: health.commit });
});

test('robots: the test site is kept out of search engines, production is not', async ({ request }) => {
  for (const path of ['', 'index.html', 'sw.js']) {
    const robots = (await request.get(SITE + path)).headers()['x-robots-tag'];
    if (PRODUCTION) expect(robots, `/${path}`).toBeUndefined();
    else expect(robots, `/${path}`).toContain('noindex');
  }
});

test('caching: hashed files are kept for a year, a missing one is not; the page, service worker and manifest are checked on every visit', async ({ request }) => {
  const html = await request.get(SITE);
  expect(html.status()).toBe(200);
  expect(html.headers()['content-type']).toContain('text/html');
  const assets = [...new Set([...(await html.text()).matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  expect(assets.length, 'the page loads scripts and styles from assets/').toBeGreaterThan(0);
  for (const asset of assets) {
    const res = await request.get(SITE + asset);
    expect(res.status(), asset).toBe(200);
    expect(res.headers()['cache-control'], asset).toBe('public, max-age=31536000, immutable');
  }
  for (const path of ['', 'index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']) {
    const res = await request.get(SITE + path);
    expect(res.status(), `/${path}`).toBe(200);
    expect(res.headers()['cache-control'], `/${path}`).toBe('no-cache');
  }
  // A name in assets/ that is not there (asked for during a deploy, or one a rollback brings back) is not kept for a
  // year: a browser would not ask again once it is there.
  const missing = await request.get(SITE + 'assets/no-such-file-' + Date.now().toString(36) + '.js');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['cache-control'] ?? '', 'a missing file in assets/').not.toContain('immutable');
});

test('the manifest and the service worker are served, with every icon', async ({ request }) => {
  const res = await request.get(SITE + 'manifest.webmanifest');
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await res.json()) as { name?: string; start_url?: string; display?: string; icons?: { src: string }[] };
  expect(manifest.name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons?.length).toBeGreaterThan(0);
  for (const icon of manifest.icons ?? []) {
    const file = await request.get(new URL(icon.src, SITE + 'manifest.webmanifest').href);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()['content-type'], icon.src).toMatch(/^image\//);
  }
  const sw = await request.get(SITE + 'sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toContain('javascript');
  expect(await sw.text(), 'the service worker precaches the app').toContain('index.html');
});

test('an unknown path is a 404, for a file and for the API', async ({ request }) => {
  const file = await request.get(SITE + 'no-such-file-' + Date.now().toString(36));
  expect(file.status()).toBe(404);
  if (PRODUCTION) return;
  const api = await request.get(API + '/no-such-route');
  expect(api.status()).toBe(404);
  expect(((await api.json()) as { error: string }).error).toBe('not_found');
});
