import { MongoClient } from 'mongodb';
import { buildApp } from './app.js';
import { COMMIT } from './commit.js';
import { loadConfig } from './config.js';

const config = loadConfig();

// No connect() first: the driver connects on the first query and reconnects by itself, so the API starts (and
// /health says so) even while MongoDB is down, instead of failing until systemd gives up.
const client = new MongoClient(config.mongoUri, { appName: 'muzieklab-api', serverSelectionTimeoutMS: 5000 });

const app = buildApp({
  db: client.db(),
  commit: COMMIT,
  // JSON lines to stdout, which systemd keeps in the journal (journalctl -u muzieklab-api@test).
  logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
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

app.listen({ host: config.host, port: config.port }).catch((err) => {
  app.log.error({ err }, 'could not start');
  process.exit(1);
});
