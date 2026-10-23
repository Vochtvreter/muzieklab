/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The branch a test-site build was made from (deploy-test.yml); unset in production and local builds. */
  readonly VITE_DEPLOY_BRANCH?: string;
}
