// `npm run dev`'s proxy to the API (vite.config.ts): the API's Origin check compares Origin with Host, so the proxy
// must pass the browser's Host on unchanged. The check runs a throwaway dev server with the config's proxy options
// (only the target moved to a local echo server) and sends a POST through it, as the browser does.
import { createServer as createHttpServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ProxyOptions, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import config from '../vite.config';

let upstream: Server;
let dev: ViteDevServer;
let devUrl: URL;
let root: string;
let seen: IncomingHttpHeaders | null = null;

beforeAll(async () => {
  upstream = createHttpServer((req, res) => {
    seen = req.headers;
    res.writeHead(204).end();
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  const api = (config as { server?: { proxy?: Record<string, string | ProxyOptions> } }).server?.proxy?.['/api'];
  expect(api, "vite.config.ts proxies '/api'").toBeDefined();
  // The config's own options, pointed at the echo server: the string shorthand stays a string.
  const proxied = typeof api === 'string' ? target : { ...api, target };
  root = mkdtempSync(join(tmpdir(), 'muzieklab-proxy-'));
  dev = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, proxy: { '/api': proxied } },
  });
  await dev.listen();
  devUrl = new URL(`http://127.0.0.1:${(dev.httpServer!.address() as AddressInfo).port}`);
}, 30_000);

afterAll(async () => {
  await dev?.close();
  await new Promise((resolve) => upstream?.close(resolve));
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('the dev proxy', () => {
  it("keeps the browser's Host, so Origin and Host match at the API (no bad_origin)", async () => {
    const res = await fetch(new URL('/api/v1/auth/sign-in', devUrl), {
      method: 'POST',
      headers: { Origin: devUrl.origin, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(204);
    expect(seen?.host).toBe(devUrl.host);
    expect(new URL(String(seen?.origin)).host).toBe(seen?.host);
  });
});
