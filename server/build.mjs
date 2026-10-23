// Bundles the API into one file, dist/server.cjs, so the server needs only Node: nothing is installed there.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  // CommonJS: fastify and the MongoDB driver are CommonJS and require Node's own modules at run time.
  format: 'cjs',
  sourcemap: true,
  // Optional MongoDB driver add-ons we do not use (cloud auth, compression, encryption); the driver copes without them.
  external: [
    '@aws-sdk/credential-providers',
    '@mongodb-js/zstd',
    'gcp-metadata',
    'kerberos',
    'mongodb-client-encryption',
    'snappy',
    'socks',
  ],
  // GET /api/v1/health reports the commit, so a deploy can tell when the new release is the one answering.
  define: { __COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev') },
  logLevel: 'warning',
});
