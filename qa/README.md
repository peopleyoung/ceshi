# 测试工程（qa/）· 贪吃蛇 V1 独立验收

本目录是测试工程师针对实现提交 `agents/frontend-developer @ e4f04ab` 的独立测试产物，不参与应用构建与打包（`src/` 之外的独立脚手架），应用自身依赖见仓库根目录 `package.json`。

## 内容

| 文件                          | 说明                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `cases/qa-acceptance.test.ts` | 50 例验收逻辑测试（Vitest + jsdom，自建调度器/存储/装配脚手架，不依赖仓库测试助手） |
| `e2e/smoke.mjs`               | Playwright 黑盒浏览器冒烟（S1–S30），通过 Canvas 像素观测游戏画面并真实操作         |
| `vitest.qa.config.ts`         | 逻辑测试专用 Vitest 配置                                                            |
| `test-plan.md`                | 测试计划与用例映射                                                                  |
| `report/qa-report-10002.md`   | 测试报告（结论、环境、证据、缺陷与未覆盖范围）                                      |

## 运行

前置：Node ≥ 20、仓库根目录已 `npm ci`（应用依赖）、`npm run build` 生成 `dist/`。

```bash
# 1) 逻辑测试
cd <repo-root>
cd qa && npm install && cd ..        # 安装 playwright（仅冒烟需要，逻辑测试不受影响）
npx vitest run --config qa/vitest.qa.config.ts

# 2) 浏览器冒烟（默认 chromium 在 360/768/1440 运行）
node qa/e2e/smoke.mjs --browsers chromium,firefox --widths 360,768,1440 --out <输出目录>

# 可选参数
#   --browsers chromium,firefox   浏览器列表（默认 chromium）
#   --widths   360,768,1440       视口宽度列表（默认 360,768,1440）
#   --dist     dist               静态站点目录（默认仓库根下 dist/）
#   --port     4173               本地静态服务端口
```

输出：`<输出目录>/browser-smoke.json`（逐项检查明细）与 `<输出目录>/screenshots/*.png`（开始/运行/暂停/自动暂停/结束界面）。

firefox 需要 `npx playwright install firefox` 安装与 playwright 版本匹配的浏览器。

## 说明

- 冒烟脚本只使用 DOM 可见状态与 Canvas 像素，不注入应用内部对象，属于黑盒验证。
- 测试数据均为占位数据（如最高分 5/15），不含真实个人信息。
- 运行产生的临时输出建议放在仓库外或 `artifacts/` 之外的独立目录，结束后清理。
