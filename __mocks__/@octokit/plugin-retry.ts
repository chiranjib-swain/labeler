// Minimal mock for Jest ESM compatibility: @octokit/core@7.x (required by @octokit/plugin-retry)
// is ESM-only and cannot be loaded in Jest's CommonJS mode. Since @actions/github is also
// mocked in tests, the retry plugin is never actually invoked.
export const retry = () => {};
