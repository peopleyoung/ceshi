import { defineConfig } from 'vitest/config'

/**
 * QA 独立用例专用配置：只收集 qa/cases 下的用例，
 * 与仓库 tests/ 的既有用例互不影响。
 * 运行：npx vitest run --config qa/vitest.qa.config.ts
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['qa/cases/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
