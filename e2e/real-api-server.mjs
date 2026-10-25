/**
 * The two servers of `npm run e2e:real` (playwright.real.config.ts starts both, fresh for every run):
 *
 * - `node e2e/real-api-server.mjs api`: a throwaway MongoDB replica set (mongodb-memory-server, from server/; one
 *   member, so transactions work) and the API bundle, server/dist/server.cjs, on it. Over plain http, so the cookie is
 *   `session` without Secure (COOKIE_SECURE=false), as in development.
 * - `node e2e/real-api-server.mjs app`: the app's production build, served by vite preview with /api proxied to that
 *   API. The proxy keeps the Host header (changeOrigin: false): the API refuses a POST whose Origin does not match it
 *   (BACKEND-PLAN.md §5.4), and Caddy keeps Host on the site too.
 *
 * Settings come from the environment, set by playwright.real.config.ts: REAL_MONGODB_URI (its port, replica set name
 * and database are used to start MongoDB), REAL_API_PORT and REAL_APP_PORT.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER = fileURLToPath(new URL('../server/', import.meta.url));

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run this through playwright.real.config.ts (npm run e2e:real)`);
  return value;
};

const mode = process.argv[2];
if (mode === 'api') await startApi();
else if (mode === 'app') await startApp();
else {
  console.error('Usage: node e2e/real-api-server.mjs api|app');
  process.exit(2);
}

async function startApi() {
  const uri = new URL(env('REAL_MONGODB_URI'));
  const port = env('REAL_API_PORT');
  // mongodb-memory-server is the server package's (its tests use it), with the MongoDB version that package names.
  const { MongoMemoryReplSet } = createRequire(SERVER + 'package.json')('mongodb-memory-server');
  const { version } = JSON.parse(readFileSync(SERVER + 'package.json', 'utf8')).config.mongodbMemoryServer;
  const mongo = await MongoMemoryReplSet.create({
    binary: { version },
    replSet: { count: 1, name: uri.searchParams.get('replicaSet') ?? 'rs0', storageEngine: 'wiredTiger' },
    instanceOpts: [{ ip: uri.hostname, port: Number(uri.port) }],
  });

  const api = spawn(process.execPath, [SERVER + 'dist/server.cjs'], {
    env: {
      ...process.env,
      MONGODB_URI: uri.href,
      HOST: '127.0.0.1',
      PORT: port,
      COOKIE_SECURE: 'false',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
      // Never a real GitHub token (a developer's or CI's own GITHUB_TOKEN): feedback must not reach GitHub from a test,
      // so POST /feedback answers 503 feedback_unavailable here.
      GITHUB_TOKEN: '',
    },
    stdio: 'inherit',
  });
  console.log(`MongoDB ${version} at ${uri.host}; API on http://127.0.0.1:${port}`);

  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    if (api.exitCode === null && api.signalCode === null) {
      api.kill('SIGTERM');
      await once(api, 'exit');
    }
    // Playwright signals the whole process group, so mongod may be shutting down already; MongoMemoryServer's own
    // shutdown command then finds it gone and only warns. The data directory goes either way: nothing is left behind.
    const warn = console.warn;
    console.warn = () => {};
    await mongo.stop({ doCleanup: true, force: true }).catch(() => {});
    console.warn = warn;
    process.exit(code);
  };
  api.on('exit', (code, signal) => {
    if (stopping) return;
    // Exit 0 is the API's own answer to the group's SIGTERM (it may get there before this process does).
    if (code !== 0) console.error(`The API stopped by itself (${signal ?? `exit ${code}`}).`);
    void stop(code === 0 ? 0 : 1);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void stop(0));
}

async function startApp() {
  const port = Number(env('REAL_APP_PORT'));
  const api = `http://127.0.0.1:${env('REAL_API_PORT')}`;
  const { build, preview } = await import('vite');
  // Its own folder, so this never replaces the dist/ that `npm run e2e` serves.
  const outDir = ROOT + 'node_modules/.cache/muzieklab-real-api/dist';
  await build({ root: ROOT, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const server = await preview({
    root: ROOT,
    build: { outDir },
    preview: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      // vite.config.ts gives preview no proxy (the regular e2e runs without an API); this one has the real API.
      proxy: { '/api': { target: api, changeOrigin: false } },
    },
  });
  server.printUrls();
  // Nothing to clean up: the build folder is overwritten next time.
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => process.exit(0));
}
