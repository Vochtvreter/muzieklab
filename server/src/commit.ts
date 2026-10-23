declare const __COMMIT__: string | undefined;

/** The commit this build came from (build.mjs sets it from GITHUB_SHA), or 'dev' when run from the source. */
export const COMMIT: string = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev';
