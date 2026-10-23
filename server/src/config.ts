/** The API's settings, from the environment (on the server: /etc/muzieklab-api/<site>.env, docs/DEPLOY.md). */
export interface Config {
  /** 127.0.0.1: only Caddy, on the same server, talks to the API. */
  host: string;
  port: number;
  /** mongodb://user:password@127.0.0.1:27017/<database>?authSource=admin&replicaSet=rs0 */
  mongoUri: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`PORT is not a port number: ${env.PORT}`);
  return { host: env.HOST ?? '127.0.0.1', port, mongoUri };
}
