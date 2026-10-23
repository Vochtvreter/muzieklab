import { describe, expect, it, vi } from 'vitest';
import { createIssue, FEEDBACK_KEY, loadAdmin, saveAdmin, switchFrom, withoutSwitch } from './admin';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('feedback mode on this device', () => {
  it('is off until turned on, and keeps a token', () => {
    const s = memory();
    expect(loadAdmin(s)).toEqual({ enabled: false, token: '' });
    saveAdmin({ enabled: true, token: ' ghp_x ' }, s);
    expect(loadAdmin(s)).toEqual({ enabled: true, token: 'ghp_x' });
    saveAdmin({ enabled: false, token: '' }, s);
    expect(s.getItem(FEEDBACK_KEY)).toBeNull();
  });

  it('survives a broken save', () => {
    const s = memory();
    s.setItem(FEEDBACK_KEY, '{oops');
    expect(loadAdmin(s)).toEqual({ enabled: false, token: '' });
    s.setItem(FEEDBACK_KEY, '{"enabled":"yes","token":5}');
    expect(loadAdmin(s)).toEqual({ enabled: false, token: '' });
  });

  it('reads ?feedback=on|off from the address or the hash', () => {
    expect(switchFrom('?feedback=on', '')).toBe(true);
    expect(switchFrom('', '#/settings?feedback=off')).toBe(false);
    expect(switchFrom('?x=1', '#/learn/8?s=8.2')).toBeNull();
  });

  it('takes the switch out of the address and keeps the rest', () => {
    expect(withoutSwitch('https://a.b/muzieklab/?feedback=on#/setup')).toBe('https://a.b/muzieklab/#/setup');
    expect(withoutSwitch('https://a.b/#/learn/8?s=8.2&feedback=on')).toBe('https://a.b/#/learn/8?s=8.2');
    expect(withoutSwitch('https://a.b/#/settings?feedback=on')).toBe('https://a.b/#/settings');
  });
});

describe('createIssue', () => {
  const draft = { title: 'T', body: 'B', labels: ['feedback'] };

  it('posts the issue with the token and returns its number', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 }));
    const res = await createIssue(draft, 'tok', 'o/r', fetcher as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual(draft);
  });

  it('tells a bad token, missing access and no connection apart', async () => {
    const status = (s: number) => vi.fn(async () => new Response('{}', { status: s })) as unknown as typeof fetch;
    expect(await createIssue(draft, 't', 'o/r', status(401))).toEqual({ ok: false, reason: 'token', status: 401 });
    expect(await createIssue(draft, 't', 'o/r', status(403))).toEqual({ ok: false, reason: 'access', status: 403 });
    expect(await createIssue(draft, 't', 'o/r', status(422))).toEqual({ ok: false, reason: 'invalid', status: 422 });
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await createIssue(draft, 't', 'o/r', offline)).toEqual({ ok: false, reason: 'network' });
  });
});
