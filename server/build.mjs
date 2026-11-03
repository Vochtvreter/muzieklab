// Bundles the API into one file, dist/server.cjs, so the server needs only Node: nothing is installed there.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The common-password list is a text file that src/auth/common-passwords-text.ts reads from disk under tsx and
 * vitest. In the bundle that module becomes the file's text, so dist/server.cjs stays one file.
 */
export const inlineCommonPasswords = {
  name: 'inline-common-passwords',
  setup(b) {
    b.onLoad({ filter: /[\\/]auth[\\/]common-passwords-text\.ts$/ }, async () => ({
      contents: await readFile(here('src/auth/common-passwords.txt'), 'utf8'),
      loader: 'text',
    }));
  },
};

/** The esbuild options, shared with the test that checks the bundle (src/bundle.test.ts). */
export const options = {
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/server.cjs'),
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
  plugins: [inlineCommonPasswords],
  // GET /api/v1/health reports the commit, so a deploy can tell when the new release is the one answering.
  define: { __COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev') },
  logLevel: 'warning',
};

// Build when run (node build.mjs), not when the test imports the options.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await build(options);
