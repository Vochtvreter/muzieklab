/** The API's settings, from the environment (on the server: /etc/muzieklab-api/<site>.env, docs/DEPLOY.md). */
export interface Config {
  /** 127.0.0.1: only Caddy, on the same server, talks to the API. */
  host: string;
  port: number;
  /** mongodb://user:password@127.0.0.1:27017/<database>?authSource=admin&replicaSet=rs0 */
  mongoUri: string;
  /**
   * The session cookie is `__Host-session` and Secure (HTTPS only). COOKIE_SECURE=false is for development over plain
   * http, where browsers drop Secure cookies: the cookie is then `session`, without Secure. Never set it on a server.
   */
  cookieSecure: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`PORT is not a port number: ${env.PORT}`);
  // Only the exact word turns it off, so a typo keeps the safe default.
  const cookieSecure = env.COOKIE_SECURE?.trim().toLowerCase() !== 'false';
  return { host: env.HOST ?? '127.0.0.1', port, mongoUri, cookieSecure };
}
