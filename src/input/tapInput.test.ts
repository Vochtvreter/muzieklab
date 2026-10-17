// @vitest-environment jsdom
import { attachTapInput, type TapHandlers } from './tapInput';

type Log = Array<[string, number?]>;

const attached: Array<() => void> = [];
afterEach(() => attached.splice(0).forEach((d) => d()));

function setup(withPad = true) {
  document.body.innerHTML = '<button id="pause">Pause</button><input id="field" /><div id="pad" tabindex="0"></div>';
  const pad = withPad ? (document.getElementById('pad') as HTMLElement) : null;
  const captured: number[] = [];
  if (pad) pad.setPointerCapture = (id: number) => void captured.push(id);
  const log: Log = [];
  const handlers: TapHandlers = {
    down: (t) => log.push(['down', t]),
    up: (t) => log.push(['up', t]),
    pause: () => log.push(['pause']),
    help: () => log.push(['help']),
  };
  const detach = attachTapInput(pad, handlers);
  attached.push(detach);
  return { pad, log, detach, captured };
}

/** Dispatches an event with a chosen timeStamp (jsdom sets its own). */
function fire<E extends Event>(target: EventTarget, ev: E, timeStamp: number, extra: Record<string, unknown> = {}): E {
  Object.defineProperty(ev, 'timeStamp', { value: timeStamp });
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(ev, k, { value: v });
  target.dispatchEvent(ev);
  return ev;
}

const key = (type: 'keydown' | 'keyup', k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent(type, { key: k, code: init.code ?? 'Key' + k.toUpperCase(), bubbles: true, cancelable: true, ...init });

const pointer = (type: string) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });

describe('attachTapInput: keyboard', () => {
  it('any key presses and releases with the event timestamp', () => {
    const { log } = setup();
    const down = fire(document.body, key('keydown', 'j'), 100);
    fire(document.body, key('keyup', 'j'), 350);
    expect(log).toEqual([
      ['down', 100],
      ['up', 350],
    ]);
    expect(down.defaultPrevented).toBe(true);
  });

  it('ignores auto-repeat', () => {
    const { log } = setup();
    fire(document.body, key('keydown', 'a'), 100);
    fire(document.body, key('keydown', 'a', { repeat: true }), 130);
    fire(document.body, key('keydown', 'a', { repeat: true }), 160);
    fire(document.body, key('keyup', 'a'), 200);
    expect(log).toEqual([
      ['down', 100],
      ['up', 200],
    ]);
  });

  it('holds until the last key is up', () => {
    const { log } = setup();
    fire(document.body, key('keydown', 'a'), 100);
    fire(document.body, key('keydown', 's'), 120);
    fire(document.body, key('keyup', 'a'), 200);
    fire(document.body, key('keyup', 's'), 260);
    expect(log).toEqual([
      ['down', 100],
      ['up', 260],
    ]);
  });

  it('Esc pauses and ? opens help, neither taps', () => {
    const { log } = setup();
    fire(document.body, key('keydown', 'Escape', { code: 'Escape' }), 1);
    fire(document.body, key('keyup', 'Escape', { code: 'Escape' }), 2);
    fire(document.body, key('keydown', '?', { code: 'Slash', shiftKey: true }), 3);
    fire(document.body, key('keyup', '?', { code: 'Slash' }), 4);
    expect(log).toEqual([['pause'], ['help']]);
  });

  it('ignores modifiers, Tab, shortcuts and function keys', () => {
    const { log } = setup();
    for (const [k, code] of [['Shift', 'ShiftLeft'], ['Control', 'ControlLeft'], ['Meta', 'MetaLeft'], ['Tab', 'Tab'], ['F5', 'F5']]) {
      const ev = fire(document.body, key('keydown', k, { code }), 1);
      expect(ev.defaultPrevented).toBe(false);
      fire(document.body, key('keyup', k, { code }), 2);
    }
    const shortcut = fire(document.body, key('keydown', 'r', { metaKey: true }), 3);
    expect(shortcut.defaultPrevented).toBe(false);
    expect(log).toEqual([]);
  });

  it('Shift + letter still taps', () => {
    const { log } = setup();
    fire(document.body, key('keydown', 'A', { code: 'KeyA', shiftKey: true }), 10);
    fire(document.body, key('keyup', 'a', { code: 'KeyA' }), 20);
    expect(log).toEqual([
      ['down', 10],
      ['up', 20],
    ]);
  });

  it('leaves Space/Enter to a focused button, but other keys still tap', () => {
    const { log } = setup();
    const btn = document.getElementById('pause')!;
    const space = fire(btn, key('keydown', ' ', { code: 'Space' }), 1);
    expect(space.defaultPrevented).toBe(false);
    fire(btn, key('keyup', ' ', { code: 'Space' }), 1.5);
    expect(log).toEqual([]);
    const enter = fire(btn, key('keydown', 'Enter', { code: 'Enter' }), 2);
    expect(enter.defaultPrevented).toBe(false);
    fire(btn, key('keyup', 'Enter', { code: 'Enter' }), 3);
    expect(log).toEqual([]);
    fire(btn, key('keydown', 'k'), 4);
    fire(btn, key('keyup', 'k'), 5);
    expect(log).toEqual([
      ['down', 4],
      ['up', 5],
    ]);
  });

  it('Space on the pad or the page taps (and does not scroll)', () => {
    const { log, pad } = setup();
    const ev = fire(pad!, key('keydown', ' ', { code: 'Space' }), 7);
    expect(ev.defaultPrevented).toBe(true);
    fire(pad!, key('keyup', ' ', { code: 'Space' }), 9);
    fire(document.body, key('keydown', ' ', { code: 'Space' }), 11);
    fire(document.body, key('keyup', ' ', { code: 'Space' }), 12);
    expect(log).toEqual([
      ['down', 7],
      ['up', 9],
      ['down', 11],
      ['up', 12],
    ]);
  });

  it('typing in a text field never taps', () => {
    const { log } = setup();
    const field = document.getElementById('field')!;
    fire(field, key('keydown', 'x'), 1);
    fire(field, key('keyup', 'x'), 2);
    expect(log).toEqual([]);
  });

  it('works without a pad', () => {
    const { log } = setup(false);
    fire(document.body, key('keydown', 'z'), 1);
    fire(document.body, key('keyup', 'z'), 2);
    expect(log).toEqual([
      ['down', 1],
      ['up', 2],
    ]);
  });
});

describe('attachTapInput: pointer', () => {
  it('presses, captures the pointer and releases on pointerup', () => {
    const { log, pad, captured } = setup();
    fire(pad!, pointer('pointerdown'), 50, { pointerId: 7, pointerType: 'touch' });
    fire(pad!, pointer('pointerup'), 300, { pointerId: 7, pointerType: 'touch' });
    fire(pad!, pointer('lostpointercapture'), 301, { pointerId: 7 });
    expect(captured).toEqual([7]);
    expect(log).toEqual([
      ['down', 50],
      ['up', 300],
    ]);
  });

  it('pointercancel releases', () => {
    const { log, pad } = setup();
    fire(pad!, pointer('pointerdown'), 50, { pointerId: 1, pointerType: 'touch' });
    fire(pad!, pointer('pointercancel'), 80, { pointerId: 1, pointerType: 'touch' });
    expect(log).toEqual([
      ['down', 50],
      ['up', 80],
    ]);
  });

  it('two fingers and a key form one hold', () => {
    const { log, pad } = setup();
    fire(pad!, pointer('pointerdown'), 10, { pointerId: 1, pointerType: 'touch' });
    fire(pad!, pointer('pointerdown'), 20, { pointerId: 2, pointerType: 'touch' });
    fire(document.body, key('keydown', 'a'), 25);
    fire(pad!, pointer('pointerup'), 30, { pointerId: 1, pointerType: 'touch' });
    fire(document.body, key('keyup', 'a'), 35);
    fire(pad!, pointer('pointerup'), 40, { pointerId: 2, pointerType: 'touch' });
    expect(log).toEqual([
      ['down', 10],
      ['up', 40],
    ]);
  });

  it('ignores secondary mouse buttons', () => {
    const { log, pad } = setup();
    fire(pad!, new MouseEvent('pointerdown', { bubbles: true, button: 2 }), 10, { pointerId: 1, pointerType: 'mouse' });
    expect(log).toEqual([]);
  });

  it('window blur releases everything', () => {
    const { log, pad } = setup();
    fire(pad!, pointer('pointerdown'), 10, { pointerId: 1, pointerType: 'mouse' });
    fire(document.body, key('keydown', 'a'), 12);
    fire(window, new Event('blur'), 99);
    fire(document.body, key('keyup', 'a'), 120);
    fire(pad!, pointer('pointerup'), 130, { pointerId: 1, pointerType: 'mouse' });
    expect(log).toEqual([
      ['down', 10],
      ['up', 99],
    ]);
  });

  it('detach removes all listeners', () => {
    const { log, pad, detach } = setup();
    detach();
    fire(pad!, pointer('pointerdown'), 10, { pointerId: 1, pointerType: 'touch' });
    fire(document.body, key('keydown', 'a'), 12);
    expect(log).toEqual([]);
  });
});
