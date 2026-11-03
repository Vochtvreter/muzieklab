/**
 * A name for the device a session signed in on, from its User-Agent ("Safari on iPhone"), so the Account screen can
 * list the devices. Rough on purpose: it only has to be recognisable, and nothing depends on it.
 */
export function deviceName(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const os = osName(ua);
  const browser = browserName(ua);
  if (!os && !browser) return 'Unknown device';
  if (!browser) return os!;
  if (!os) return browser;
  return `${browser} on ${os}`;
}

function osName(ua: string): string | null {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Windows/.test(ua)) return 'Windows';
  // iPadOS 13 and later says it is a Mac; the app cannot tell them apart from here.
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function browserName(ua: string): string | null {
  // Order matters: Edge and Opera say Chrome too, Chrome says Safari, and the iOS browsers name themselves.
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\/|iPhone|iPad|Macintosh/.test(ua)) return 'Safari';
  return null;
}
