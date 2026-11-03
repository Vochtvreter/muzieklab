import { readFileSync } from 'node:fs';

/**
 * The text of common-passwords.txt. Read from disk under tsx (npm run dev) and vitest; build.mjs replaces this module
 * with the file's text, so the bundle stays one file and never reads from disk.
 */
const text: string = readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8');
export default text;
