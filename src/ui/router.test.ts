// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashQuery, leave, navigate, parseHash, routeParam } from './router';

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
