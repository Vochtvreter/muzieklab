import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build, type BuildOptions } from 'esbuild';
import { describe, expect, it } from 'vitest';

// build.mjs inlines the common-password list into dist/server.cjs; under vitest and tsx it is read from disk. This
// bundles passwords.ts the way build.mjs bundles the server, and runs the result.
describe('the bundle', () => {
  it('carries the common-password list inside it', async () => {
    const buildFile: string = new URL('../build.mjs', import.meta.url).href;
    const { options } = (await import(buildFile)) as { options: BuildOptions };
    const result = await build({
      ...options,
      entryPoints: [new URL('./auth/passwords.ts', import.meta.url).pathname],
      outfile: undefined,
      write: false,
      sourcemap: false,
      logLevel: 'silent',
    });
    const code = result.outputFiles[0].text;
    expect(code).not.toContain('common-passwords.txt');
    expect(code).not.toContain('readFileSync');

    const module = { exports: {} as { COMMON_PASSWORDS?: ReadonlySet<string> } };
    new Function('module', 'exports', 'require', code)(module, module.exports, createRequire(import.meta.url));
    const fromDisk = readFileSync(new URL('./auth/common-passwords.txt', import.meta.url), 'utf8').split('\n');
    expect(module.exports.COMMON_PASSWORDS?.size).toBe(fromDisk.length - 2); // the header, and the final newline
    expect(module.exports.COMMON_PASSWORDS?.has('qwertyuiop')).toBe(true);
  });
});
