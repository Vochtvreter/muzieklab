// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me, SavedProgress, SaveProgressRequest } from '../../shared/api';
import { DEFAULT_NOTE_SETTINGS, DEFAULT_SCALE_SETTINGS, DEFAULT_SETTINGS, generateExercise, type JudgeResult } from '../core/api';
import { syncedOf } from '../game/merge';
import { defaultProgress, DEFAULT_PREFS, type Progress } from '../game/storage';
import { loadSync, SYNC_KEY } from '../game/syncState';
import { reducer, type Action, type AppState } from './store';
import { ProgressSync, RETRY_MS } from './sync';

const ME: Me = {
  id: '6718f0c2a1b2c3d4e5f60001',
  email: 'sam@example.com',
  name: 'Sam',
  locale: null,
  roles: [],
  permissions: ['self.manage', 'progress.own', 'class.join'],
  premium: { active: false, until: null },
  createdAt: '2026-10-20T09:00:00.000Z',
};

/** A rhythm round's result, as the judge gives it (the first two notes played). */
const ROUND = {
  notes: [0, 1].map((index) => ({ index, judgement: 'great', offsetMs: 12, hold: null, releaseOffsetMs: null, tap: null })),
  accuracy: 90,
  stars: 3,
} as unknown as JudgeResult;

const json = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The account on the server, as routes/progress.ts keeps it. */
class FakeAccount {
  copy: SavedProgress = { rev: 0, data: null, resetAt: null, updatedAt: null };
  calls: string[] = [];
  offline = false;
  signedOut = false;
  private clock = 0;

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${url.replace('/api/v1', '')}`);
    if (this.offline) throw new TypeError('Failed to fetch');
    if (this.signedOut) return json(401, { error: 'unauthenticated', message: 'Not signed in' });
    const at = new Date(Date.UTC(2026, 9, 24, 12, 0, this.clock++)).toISOString();
    if (method === 'GET') return json(200, this.copy);
    if (method === 'DELETE') {
      if (this.copy.data) this.copy = { rev: this.copy.rev + 1, data: { ...this.copy.data, progress: {} }, resetAt: at, updatedAt: at };
      return json(200, this.copy);
    }
    const body = JSON.parse(String(init.body)) as SaveProgressRequest;
    if (body.rev !== this.copy.rev) return json(409, { error: 'rev_conflict', message: 'moved on', current: this.copy });
    // Stored as JSON, as MongoDB would: nothing shared with the device's objects.
    this.copy = { rev: body.rev + 1, data: JSON.parse(JSON.stringify({ prefs: body.prefs, progress: body.progress })), resetAt: this.copy.resetAt, updatedAt: at };
    return json(200, this.copy);
  };

  progress(): Progress {
    return this.copy.data?.progress as unknown as Progress;
  }
}

const appState = (progress: Progress = defaultProgress()): AppState => ({
  prefs: { ...DEFAULT_PREFS },
  progress,
  settings: DEFAULT_SETTINGS,
  run: null,
  last: null,
  noteSettings: DEFAULT_NOTE_SETTINGS,
  noteRun: null,
  noteLast: null,
  scaleSettings: DEFAULT_SCALE_SETTINGS,
  scaleHub: { tab: 'major', key: 'C' },
  scaleRun: null,
  scaleLast: null,
  account: { me: ME, api: 'reachable', notice: null, sync: 'idle' },
});

/**
 * One device: its store (the real reducer) and its own storage for the sync state. Devices take turns with the one
 * localStorage of the test, so `run` swaps the device's sync state in and out around what it does.
 */
class Device {
  state: AppState;
  stored: string | null = null;
  readonly sync: ProgressSync;
  constructor(progress?: Progress) {
    this.state = appState(progress);
    this.sync = new ProgressSync({
      me: () => this.state.account.me,
      local: () => syncedOf(this.state.prefs, this.state.progress),
      dispatch: (a: Action) => {
        this.state = reducer(this.state, a);
      },
    });
  }
  async run(fn: (d: Device) => Promise<void> | void): Promise<void> {
    if (this.stored === null) localStorage.removeItem(SYNC_KEY);
    else localStorage.setItem(SYNC_KEY, this.stored);
    await fn(this);
    this.stored = localStorage.getItem(SYNC_KEY);
  }
  do(action: Action): void {
    this.state = reducer(this.state, action);
  }
  /** A lesson result, as a finished exercise records it. */
  pass(id: string, stars: Progress['lessons'][string]['stars'], xp: number, day = '2026-10-24'): void {
    const p = this.state.progress;
    this.state = {
      ...this.state,
      progress: { ...p, lessons: { ...p.lessons, [id]: { stars, bestAccuracy: stars * 20 } }, xp: p.xp + xp, practiceDays: [...new Set([...p.practiceDays, day])].sort() },
    };
  }
}

let server: FakeAccount;
beforeEach(() => {
  localStorage.clear();
  server = new FakeAccount();
  vi.stubGlobal('fetch', server.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ProgressSync: a first sign-in', () => {
  it('saves this device’s progress as the account’s first copy, and says so', async () => {
    const phone = new Device();
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.request('start'));
    expect(server.calls).toEqual(['GET /progress', 'PUT /progress']);
    expect(server.copy.rev).toBe(1);
    expect(server.progress().lessons).toEqual({ '1.1': { stars: 3, bestAccuracy: 60 } });
    expect(phone.state.account.sync).toBe('saved');
    expect(phone.state.account.notice).toBe('progressAdded');
    expect(JSON.parse(phone.stored!)).toMatchObject({ accountId: ME.id, rev: 1, pendingReset: false });
  });

  it('sends only what follows the account: no volumes, calibration or help already seen', async () => {
    const phone = new Device();
    phone.do({ type: 'prefs', patch: { calibrationMs: 42, volumes: { metronome: 0.1, rhythm: 0.2, tap: 0.3 }, seenHowTo: true, theme: 'dark' } });
    await phone.run((d) => d.sync.request('start'));
    const prefs = server.copy.data!.prefs;
    expect(prefs).toMatchObject({ theme: 'dark' });
    expect(Object.keys(prefs).sort()).toEqual(['holdEarly', 'holdMode', 'language', 'leniency', 'metronomeLook', 'noteNames', 'pianoLabels', 'theme']);
  });

  it('merges this device’s progress into the account’s, and saves the merge', async () => {
    const laptop = new Device();
    laptop.pass('1.1', 2, 100, '2026-10-20');
    laptop.do({ type: 'prefs', patch: { theme: 'dark' } });
    await laptop.run((d) => d.sync.request('start'));

    const phone = new Device();
    phone.pass('1.1', 3, 30, '2026-10-24');
    phone.pass('1.2', 1, 10, '2026-10-24');
    await phone.run((d) => d.sync.request('start'));
    // The account's copy came in: merged, and this device's prefs follow the account's.
    expect(phone.state.progress.lessons).toEqual({ '1.1': { stars: 3, bestAccuracy: 60 }, '1.2': { stars: 1, bestAccuracy: 20 } });
    expect(phone.state.progress.practiceDays).toEqual(['2026-10-20', '2026-10-24']);
    expect(phone.state.progress.xp).toBe(100);
    expect(phone.state.prefs.theme).toBe('dark');
    expect(phone.state.account.sync).toBe('saving');
    expect(phone.state.account.notice).toBe('progressAdded');
    // The store's change saves the merge.
    server.calls = [];
    await phone.run((d) => d.sync.request('change'));
    expect(server.calls).toEqual(['PUT /progress']);
    expect(server.progress().lessons['1.2']).toEqual({ stars: 1, bestAccuracy: 20 });
    expect(phone.state.account.sync).toBe('saved');
  });

  it('says nothing about adding progress when the device had none', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    expect(phone.state.account.notice).toBeNull();
  });
});

describe('ProgressSync: saving changes', () => {
  it('asks nothing for a change when nothing that syncs changed', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    server.calls = [];
    phone.do({ type: 'prefs', patch: { volumes: { metronome: 0.2, rhythm: 0.8, tap: 0.5 } } });
    await phone.run((d) => d.sync.request('change'));
    expect(server.calls).toEqual([]);
    // Starting again asks the account whether another device saved.
    await phone.run((d) => d.sync.request('start'));
    expect(server.calls).toEqual(['GET /progress']);
  });

  it('saves a change from the rev it last saw', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    phone.pass('2.1', 2, 25);
    await phone.run((d) => d.sync.request('change'));
    expect(server.copy.rev).toBe(2);
    expect(server.progress().xp).toBe(25);
  });

  it('merges when another device saved first, and loses neither device’s results', async () => {
    const laptop = new Device();
    const phone = new Device();
    await laptop.run((d) => d.sync.request('start'));
    await phone.run((d) => d.sync.request('start'));

    laptop.pass('1.1', 3, 40);
    await laptop.run((d) => d.sync.request('change'));
    phone.pass('2.1', 2, 25);
    server.calls = [];
    await phone.run((d) => d.sync.request('change'));
    expect(server.calls).toEqual(['PUT /progress']); // 409: the laptop saved rev 2 meanwhile
    expect(phone.state.progress.lessons).toEqual({ '1.1': { stars: 3, bestAccuracy: 60 }, '2.1': { stars: 2, bestAccuracy: 40 } });
    await phone.run((d) => d.sync.request('change'));
    expect(server.progress().lessons).toEqual({ '1.1': { stars: 3, bestAccuracy: 60 }, '2.1': { stars: 2, bestAccuracy: 40 } });

    // The laptop picks it up when it is back online (or starts, or comes back into view).
    await laptop.run((d) => d.sync.request('online'));
    expect(laptop.state.progress.lessons).toEqual(server.progress().lessons);
  });

  it('keeps the pref changed on the other device, and this one’s own change', async () => {
    const laptop = new Device();
    const phone = new Device();
    await laptop.run((d) => d.sync.request('start'));
    await phone.run((d) => d.sync.request('start'));
    laptop.do({ type: 'prefs', patch: { theme: 'dark' } });
    await laptop.run((d) => d.sync.request('change'));
    phone.do({ type: 'prefs', patch: { noteNames: 'solfege' } });
    await phone.run((d) => d.sync.request('change'));
    expect(phone.state.prefs).toMatchObject({ theme: 'dark', noteNames: 'solfege' });
  });
});

describe('ProgressSync: Reset progress', () => {
  it('resets the account too, and another device takes the reset instead of merging its old progress back', async () => {
    const laptop = new Device();
    laptop.pass('1.1', 3, 40);
    await laptop.run((d) => d.sync.request('start'));
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    expect(phone.state.progress.xp).toBe(40);

    laptop.do({ type: 'resetProgress' });
    await laptop.run((d) => {
      d.sync.reset();
      return d.sync.request('retry');
    });
    expect(server.progress()).toEqual({});
    expect(server.copy.resetAt).not.toBeNull();

    // The phone plays on its old copy, then saves: the account was reset since, so its progress is dropped.
    phone.pass('2.1', 2, 25);
    await phone.run((d) => d.sync.request('change'));
    expect(phone.state.progress).toEqual(defaultProgress());
    await phone.run((d) => d.sync.request('change'));
    expect(server.copy.data!.progress).toEqual({});
  });

  it('sends a reset made offline once the account can be reached', async () => {
    const phone = new Device();
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.request('start'));
    server.offline = true;
    phone.do({ type: 'resetProgress' });
    await phone.run((d) => d.sync.reset());
    await phone.run((d) => d.sync.request('retry'));
    expect(loadSyncOf(phone).pendingReset).toBe(true);
    expect(phone.state.account.sync).toBe('pending');
    server.offline = false;
    await phone.run((d) => d.sync.request('online'));
    expect(server.calls.slice(-1)).toEqual(['DELETE /progress']);
    expect(server.progress()).toEqual({});
    expect(loadSyncOf(phone).pendingReset).toBe(false);
  });
});

describe('ProgressSync: never lowering the account', () => {
  it('brings in what another tab saved before saving, so a tab that is behind never lowers the account', async () => {
    // Two tabs share one storage: tab B's store is behind the sync state tab A saved.
    const tabA = new Device();
    await tabA.run((d) => d.sync.request('start'));
    const tabB = new Device();
    tabB.stored = tabA.stored;
    tabA.pass('1.1', 3, 40);
    // And a rhythm round: a day of the Progress tab's figures, which tab B does not have.
    tabA.do({ type: 'start', run: { exercise: generateExercise({ ...DEFAULT_SETTINGS, bars: 1 }, 1), lessonId: null, daily: null } });
    tabA.do({ type: 'finish', result: ROUND, taps: [], today: '2026-10-24' });
    expect(Object.keys(tabA.state.progress.stats.days)).toEqual(['2026-10-24']);
    await tabA.run((d) => d.sync.request('change'));
    tabB.stored = tabA.stored;
    tabB.pass('2.1', 1, 10);
    server.calls = [];
    await tabB.run((d) => d.sync.request('change'));
    // Nothing sent yet: tab A's lesson and day came into tab B first.
    expect(server.calls).toEqual([]);
    expect(Object.keys(tabB.state.progress.lessons).sort()).toEqual(['1.1', '2.1']);
    expect(tabB.state.progress.stats.days).toEqual(tabA.state.progress.stats.days);
    await tabB.run((d) => d.sync.request('change'));
    expect(Object.keys(server.progress().lessons).sort()).toEqual(['1.1', '2.1']);
    expect(server.progress().xp).toBe(tabA.state.progress.xp);
    expect(server.progress().stats.days).toEqual(tabA.state.progress.stats.days);
  });

  it('lets Reset progress overtake a sync that was running, so the old progress does not come back', async () => {
    const laptop = new Device();
    laptop.pass('1.1', 3, 40);
    await laptop.run((d) => d.sync.request('start'));
    const phone = new Device();
    phone.pass('1.2', 2, 10);
    await phone.run((d) => d.sync.request('start'));
    await phone.run((d) => d.sync.request('change'));
    // The laptop asks for news; Reset is pressed while the answer is on its way.
    let answer: () => void = () => undefined;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') await new Promise<void>((done) => (answer = done));
      return server.fetch(url, init);
    });
    await laptop.run(async (d) => {
      const asking = d.sync.request('start');
      await Promise.resolve();
      d.do({ type: 'resetProgress' });
      d.sync.reset();
      answer();
      await asking;
      // The run after it sends the reset.
      await new Promise((done) => setTimeout(done, 0));
      await d.sync.request('change');
    });
    expect(laptop.state.progress).toEqual(defaultProgress());
    expect(server.copy.data!.progress).toEqual({});
    expect(server.calls).toContain('DELETE /progress');
  });
});

function loadSyncOf(d: Device) {
  return JSON.parse(d.stored!) as { pendingReset: boolean; rev: number };
}

describe('ProgressSync: no answer, a session that ended, signing out', () => {
  it('waits for the connection, then saves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    server.offline = true;
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.request('change'));
    expect(phone.state.account.sync).toBe('pending');
    server.offline = false;
    // A retry after RETRY_MS, if nothing else asked first.
    await phone.run(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_MS);
    });
    expect(phone.state.account.sync).toBe('saved');
    expect(server.progress().xp).toBe(40);
  });

  it('signs out when the session ended', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    server.signedOut = true;
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.request('change'));
    expect(phone.state.account.me).toBeNull();
    // This device keeps its progress.
    expect(phone.state.progress.xp).toBe(40);
  });

  it('keeps nothing a run learnt after a sign-out, and forget() drops the sync state', async () => {
    const phone = new Device();
    phone.pass('1.1', 3, 40);
    let release: () => void = () => undefined;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      await new Promise<void>((done) => (release = done));
      return server.fetch(url, init);
    });
    await phone.run(async (d) => {
      const run = d.sync.request('start');
      await Promise.resolve();
      d.state = { ...d.state, account: { ...d.state.account, me: null } };
      d.sync.forget();
      release();
      await new Promise((done) => setTimeout(done, 0));
      release();
      await run;
    });
    expect(phone.stored).toBeNull();
    expect(loadSync(ME.id)).toBeNull();
  });

  it('saves the last change before signing out', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.flush());
    expect(server.progress().xp).toBe(40);
  });

  it('marks a refusal of the API as failed', async () => {
    const phone = new Device();
    await phone.run((d) => d.sync.request('start'));
    vi.stubGlobal('fetch', async () => json(500, { error: 'internal', message: 'boom' }));
    phone.pass('1.1', 3, 40);
    await phone.run((d) => d.sync.request('change'));
    expect(phone.state.account.sync).toBe('failed');
  });
});
