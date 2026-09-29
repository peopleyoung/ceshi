import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    // jsdom 的 pretendToBeVisual 帧循环会在 requestAnimationFrame 被接管后持续登记幽灵计时器，
    // 使 getTimerCount 无法反映应用自身的定时器，因此只接管真正的计时器 API。
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    },
  },
})
