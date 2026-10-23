import { setTimeout as sleep } from 'node:timers/promises';
import { MongoClient } from 'mongodb';
import { buildApp } from './app.js';
import { COMMIT } from './commit.js';
import { createAdmin } from './commands/create-admin.js';
import { loadConfig, type Config } from './config.js';
import { ensureIndexes } from './db.js';

// `node server.cjs` runs the API; `node server.cjs create-admin …` runs that command (commands/create-admin.ts).

const command = process.argv[2];

if (command === 'create-admin') {
  runCreateAdmin(process.argv.slice(3)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`create-admin failed: ${(err as Error).message}`);
      process.exit(1);
    },
  );
} else if (command !== undefined) {
  console.error(`Unknown command: ${command}. Run without one to start the API, or use create-admin.`);
  process.exit(2);
} else {
  serve(loadConfig());
}

async function runCreateAdmin(args: string[]): Promise<number> {
  const config = loadConfig();
  const client = new MongoClient(config.mongoUri, { appName: 'muzieklab-create-admin', serverSelectionTimeoutMS: 10_000 });
  try {
    return await createAdmin(client.db(), args, { out: console.log, err: console.error });
  } finally {
    await client.close();
  }
}

function serve(config: Config): void {
  // No connect() first: the driver connects on the first query and reconnects by itself.
  const client = new MongoClient(config.mongoUri, { appName: 'muzieklab-api', serverSelectionTimeoutMS: 5000 });

  const app = buildApp({
    db: client.db(),
    commit: COMMIT,
    cookieSecure: config.cookieSecure,
    // JSON lines to stdout, which systemd keeps in the journal (journalctl -u muzieklab-api@test). Request bodies are
    // never logged; the headers that carry a session are redacted in case a log line ever includes them.
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  });
  app.addHook('onClose', async () => {
    await client.close();
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.log.info(`${signal}: closing`);
      app.close().then(
        () => process.exit(0),
        (err) => {
          app.log.error({ err }, 'close failed');
          process.exit(1);
        },
      );
    });
  }

  start().catch((err) => {
    app.log.error({ err }, 'could not start');
    process.exit(1);
  });

  // The indexes (a unique email above all) must exist before the first request. While MongoDB is down this keeps
  // trying instead of exiting, so systemd does not give up on restarts; the deploy's health check waits meanwhile.
  async function start() {
    for (let wait = 1000; ; wait = Math.min(wait * 2, 30_000)) {
      try {
        await ensureIndexes(client.db());
        break;
      } catch (err) {
        app.log.warn({ err }, `could not create indexes; trying again in ${wait / 1000} s`);
        await sleep(wait);
      }
    }
    await app.listen({ host: config.host, port: config.port });
  }
}
