// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashQuery, leave, Link, navigate, openedFrom, parseHash, routeParam } from './router';

const TOKEN = 'q3Vb9JzR1kLx7Pm2Ws5Tn8Yc4Hd6Fg0Ae-Ui_Oj3Ks';
const ID = '6718f0c2a1b2c3d4e5f60001';

describe('parseHash', () => {
  it('knows the account routes', () => {
    for (const r of ['/signin', '/account', '/privacy', '/admin', '/admin/invite', '/admin/deleted', '/admin/feedback']) expect(parseHash('#' + r)).toBe(r);
  });

  it('takes invite and new-password links with a base64url token of 20–128 characters', () => {
    expect(parseHash('#/invite/' + TOKEN)).toBe('/invite/' + TOKEN);
    expect(parseHash('#/reset/' + TOKEN)).toBe('/reset/' + TOKEN);
    expect(parseHash('#/invite/' + 'a'.repeat(20))).toBe('/invite/' + 'a'.repeat(20));
    expect(parseHash('#/invite/' + 'a'.repeat(128))).toBe('/invite/' + 'a'.repeat(128));
  });

  it('sends a token that cannot be one to Home', () => {
    expect(parseHash('#/invite/' + 'a'.repeat(19))).toBe('/');
    expect(parseHash('#/invite/' + 'a'.repeat(129))).toBe('/');
    expect(parseHash('#/invite/abc+def/ghijklmnopqrstuvwxyz')).toBe('/');
    expect(parseHash('#/invite/' + TOKEN.slice(0, 30) + '=')).toBe('/');
    expect(parseHash('#/invite/')).toBe('/');
    expect(parseHash('#/invite')).toBe('/');
    expect(parseHash('#/reset/' + TOKEN + '/more')).toBe('/');
  });

  it('takes an admin account id of 24 hex characters, and nothing else', () => {
    expect(parseHash('#/admin/account/' + ID)).toBe('/admin/account/' + ID);
    expect(parseHash('#/admin/account/' + ID.slice(1))).toBe('/');
    expect(parseHash('#/admin/account/' + ID + '0')).toBe('/');
    expect(parseHash('#/admin/account/zz18f0c2a1b2c3d4e5f60001')).toBe('/');
    expect(parseHash('#/admin/account')).toBe('/');
  });

  it('takes a feedback report id of 24 hex characters, and nothing else', () => {
    expect(parseHash('#/admin/feedback/' + ID)).toBe('/admin/feedback/' + ID);
    expect(parseHash('#/admin/feedback/' + ID + '/')).toBe('/admin/feedback/' + ID);
    expect(parseHash('#/admin/feedback/' + ID.slice(1))).toBe('/');
    expect(parseHash('#/admin/feedback/zz18f0c2a1b2c3d4e5f60001')).toBe('/');
    expect(parseHash('#/admin/feedback/')).toBe('/admin/feedback');
  });

  it('ignores a trailing slash and the query', () => {
    expect(parseHash('#/signin/')).toBe('/signin');
    expect(parseHash('#/invite/' + TOKEN + '/')).toBe('/invite/' + TOKEN);
    expect(parseHash('#/privacy?from=signin')).toBe('/privacy');
    expect(parseHash('#/admin/account/' + ID + '?tab=roles')).toBe('/admin/account/' + ID);
    expect(hashQuery('#/privacy?from=signin').get('from')).toBe('signin');
  });

  it('knows the Progress tab, its Skill levels and each of the six skills, and nothing else under it', () => {
    expect(parseHash('#/progress')).toBe('/progress');
    expect(parseHash('#/progress/skills')).toBe('/progress/skills');
    for (const s of ['rhythm', 'ear', 'treble', 'bass', 'scales', 'theory']) expect(parseHash('#/progress/skills/' + s)).toBe('/progress/skills/' + s);
    expect(parseHash('#/progress/skills/bass/')).toBe('/progress/skills/bass');
    expect(parseHash('#/progress/skills/piano')).toBe('/');
    expect(parseHash('#/progress/skills/Rhythm')).toBe('/');
    expect(parseHash('#/progress/rhythm')).toBe('/');
    expect(parseHash('#/progress/skills/rhythm/more')).toBe('/');
  });

  it('still parses the routes from before', () => {
    expect(parseHash('')).toBe('/');
    expect(parseHash('#/learn/8?s=8.2')).toBe('/learn/8');
    expect(parseHash('#/nope')).toBe('/');
  });
});

describe('routeParam', () => {
  it("gives the part after the route's prefix, or null for another route", () => {
    expect(routeParam(parseHash('#/invite/' + TOKEN), '/invite/')).toBe(TOKEN);
    expect(routeParam(parseHash('#/invite/' + TOKEN), '/reset/')).toBeNull();
    expect(routeParam(parseHash('#/admin/account/' + ID), '/admin/account/')).toBe(ID);
    expect(routeParam('/admin/invite', '/admin/account/')).toBeNull();
    expect(routeParam(parseHash('#/admin/feedback/' + ID), '/admin/feedback/')).toBe(ID);
    expect(routeParam('/admin/feedback', '/admin/feedback/')).toBeNull();
    expect(routeParam(parseHash('#/progress/skills/treble'), '/progress/skills/')).toBe('treble');
    expect(routeParam('/progress/skills', '/progress/skills/')).toBeNull();
  });
});

describe('leave', () => {
  beforeEach(() => window.history.replaceState(null, '', '#/'));
  afterEach(() => vi.restoreAllMocks());
  const goingBack = () => vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

  it('goes back to the screen the exercise was opened from: swapped in, it would be in the history twice', () => {
    window.history.replaceState(null, '', '#/learn/8?s=8.4');
    navigate('/notes/play', { query: 'from=8.4' });
    const back = goingBack();
    leave('/learn/8', 's=8.4');
    expect(back).toHaveBeenCalledOnce();
  });

  it('knows where the exercise came from after Results and Retry swapped it', () => {
    window.history.replaceState(null, '', '#/learn/3?s=3.2');
    navigate('/play', { query: 'from=3.2' });
    navigate('/results', { replace: true, query: 'from=3.2' });
    navigate('/play', { replace: true, query: 'from=3.2' });
    const back = goingBack();
    leave('/learn/3', 's=3.2');
    expect(back).toHaveBeenCalledOnce();
  });

  it('counts an address without a hash as Home', () => {
    window.history.replaceState(null, '', window.location.pathname);
    navigate('/play');
    const back = goingBack();
    leave('/');
    expect(back).toHaveBeenCalledOnce();
  });

  it('swaps the exercise for where it goes when it was opened from elsewhere', () => {
    window.history.replaceState(null, '', '#/path');
    navigate('/play');
    const back = goingBack();
    const length = window.history.length;
    leave('/');
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
    expect(window.history.length).toBe(length);
  });
});

describe('a Key screen and back', () => {
  beforeEach(() => window.history.replaceState(null, '', '#/notes'));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the Key screen from a plain click on the setup\'s link with navigate(), so Use can go back to the setup', () => {
    render(createElement(Link, { to: '/notes/key', query: 'from=8' }, 'Key'));
    window.history.replaceState(null, '', '#/notes?from=8');
    fireEvent.click(screen.getByRole('link', { name: 'Key' }));
    expect(window.location.hash).toBe('#/notes/key?from=8');
    expect(openedFrom('/notes', 'from=8')).toBe(true);
    // Use swapped the Key screen for a second copy of the setup, so the first Back stayed on it.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    leave('/notes', 'from=8');
    expect(back).toHaveBeenCalledOnce();
  });

  it('knows a round was started from a setup opened from Learn, and not from the chapter', () => {
    window.history.replaceState(null, '', '#/notes?from=8');
    navigate('/notes/play', { query: 'from=8' });
    expect(openedFrom('/notes', 'from=8')).toBe(true);
    expect(openedFrom('/notes')).toBe(false);
    expect(openedFrom('/learn/8')).toBe(false);
  });
});

describe('Link', () => {
  beforeEach(() => window.history.replaceState(null, '', '#/admin'));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  const link = (name: string) => screen.getByRole('link', { name });
  // A link the browser follows itself changes the address a moment after the click.
  const settled = () => new Promise((done) => setTimeout(done, 10));

  it('keeps the address it was opened from, as navigate() does: leave() goes back to the list instead of adding it again', async () => {
    render(createElement(Link, { to: `/admin/account/${ID}` }, 'Lies Bakker'));
    fireEvent.click(link('Lies Bakker'));
    await waitFor(() => expect(window.location.hash).toBe('#/admin/account/' + ID));
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    leave('/admin');
    expect(back).toHaveBeenCalledOnce();
  });

  it("with leaves (a finished screen's back arrow), leaves as Quit does: back where it came from, else in its place", () => {
    window.history.replaceState(null, '', '#/learn/3?s=3.2');
    navigate('/play', { query: 'from=3.2' });
    navigate('/results', { replace: true, query: 'from=3.2' });
    render(createElement(Link, { to: '/learn/3', query: 's=3.2', leaves: true }, 'Back to chapter 3'));
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    fireEvent.click(link('Back to chapter 3'));
    expect(back).toHaveBeenCalledOnce();
    cleanup();

    window.history.replaceState(null, '', '#/setup');
    navigate('/play');
    navigate('/results', { replace: true });
    const length = window.history.length;
    render(createElement(Link, { to: '/', leaves: true }, 'Back to home'));
    fireEvent.click(link('Back to home'));
    expect(back).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#/');
    expect(window.history.length).toBe(length);
  });

  it('leaves a click that opens a new tab or window to the browser, and one its own onClick took', async () => {
    const own = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(createElement('div', null, createElement(Link, { to: '/admin/feedback' }, 'Feedback'), createElement(Link, { to: '/settings', onClick: own }, 'Settings')));
    for (const keys of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
      const click = createEvent.click(link('Feedback'), keys);
      fireEvent(link('Feedback'), click);
      expect(click.defaultPrevented, JSON.stringify(keys)).toBe(false);
    }
    await settled();
    window.history.replaceState(null, '', '#/admin');
    fireEvent.click(link('Settings'));
    await settled();
    expect(own).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#/admin');
  });
});
