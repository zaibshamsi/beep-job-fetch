import { defineConfig } from 'vitest/config';

// Integration tests share one database and one "only one pipeline run at a time" lock,
// so test files run one after another instead of in parallel.
export default defineConfig({
  test: { fileParallelism: false },
});
