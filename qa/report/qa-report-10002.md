# 测试报告 · 产品级 Web 贪吃蛇 V1（工单 10002 / 派发 10035 / 第 2 次尝试）

- **结论：通过**（逻辑用例 50/50，浏览器冒烟矩阵 100%，质量门全部退出码 0，未发现阻断性缺陷）
- 被测实现：`peopleyoung/ceshi` 分支 `agents/frontend-developer` 提交 `e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`
- 同版本代码审查：分支 `agents/code-reviewer` 提交 `7b84e854d12419bff7715ed5dadfc30c1724777b`（结论：通过，审查对象即上述实现 SHA）
- 测试产物分支：`agents/qa-engineer`（本报告、`qa/` 用例与冒烟脚本、测试计划）
- 执行时间：2026-09-29（UTC）；执行者：测试工程师（qa_engineer）

## 1. 结论摘要

| 验证项                                             | 结果         | 说明                                                                                                               |
| -------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| 质量门（typecheck / lint / format / test / build） | 全部通过     | 73/73 仓库用例；构建产物 sha256 与审查报告一致                                                                     |
| 全新检出（AC-01）                                  | 通过         | 从远端独立克隆 `agents/frontend-developer`，`npm ci → typecheck → test → build` 全绿，dev/preview/静态托管均可访问 |
| 独立逻辑验收用例（本产物）                         | 50/50 通过   | 覆盖验收标准 AC-01…AC-07 的引擎、存储、输入、装配逻辑                                                              |
| 浏览器冒烟矩阵（本产物）                           | 147/147 通过 | chromium 360/768/1440 + firefox 360/1440，两引擎全部通过                                                           |
| 真实缺陷                                           | 0            | 无阻断性问题；1 项已知行为边界按审查 CR-01 记录（非缺陷）                                                          |

判定：实现质量满足工单验收标准，可进入产品验收（product_manager）。

## 2. 环境

| 项目         | 值                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------- |
| 运行时       | Linux x64（kernel 5.4.0-208），Node.js v22.23.1，npm 10.9.8                                     |
| 被测技术栈   | Vite 8.3.1 + TypeScript 5.9.3 + Canvas 2D（无运行时依赖）                                       |
| 逻辑测试     | Vitest 5.0.2 + jsdom（本产物自建脚手架，未复用仓库测试助手）                                    |
| 浏览器自动化 | Playwright 1.62.1                                                                               |
| 浏览器版本   | Chromium 151.0.7922.34（playwright chromium-1234）/ Firefox 153.0（firefox-1538）               |
| 构建产物     | `dist/`（sha256：index.html `6a282481…`，js `abc63c3b…`，css `9fc65d04…`，favicon `e244ba1e…`） |

## 3. 执行结果

### 3.1 质量门（实现 e4f04ab + 本次 QA 产物）

命令：`npm ci` / `npm run typecheck` / `npm run lint` / `npm run format:check` / `npm test` / `npm run build`，六个命令退出码均为 0；`npm test` 为 5 个文件 73/73 通过。构建产物哈希与审查报告记录的哈希逐字节一致（构建可复现）。证据：`evidence/quality-gates.log`。

### 3.2 全新检出验证（AC-01）

在临时目录执行 `git clone --depth 1 -b agents/frontend-developer https://github.com/peopleyoung/ceshi`：

- 克隆退出码 0，`HEAD = e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`（与指定实现 SHA 一致）
- `npm ci`、`npm run typecheck`、`npm test`（73/73）、`npm run build` 全部退出码 0
- 全新检出构建的 `dist/` 哈希与本地产物完全一致
- 按 README：`npm run dev` 返回 HTTP 200；`npm run preview` 返回 HTTP 200；python 静态服务器托管 `dist/` 下 index/assets/favicon 均 200，未知路径 404
- 临时目录已清理。证据：`evidence/fresh-clone.log`

### 3.3 独立逻辑验收用例（本产物 50 例）

`qa/cases/qa-acceptance.test.ts` 使用自建 `QaClock`（可注入调度器）、存储桩、装配脚手架，不复用仓库测试助手，独立复验：

| 套件                                                | 例数 | 结果     |
| --------------------------------------------------- | ---- | -------- |
| AC-02/04 初始局面与开始流程                         | 4    | 全部通过 |
| AC-03 移动与方向控制                                | 6    | 全部通过 |
| AC-03/04 碰撞与边界（含尾格两种规则）               | 5    | 全部通过 |
| AC-04 食物、增长、计分与胜利（含满盘 4×4 构造）     | 5    | 全部通过 |
| AC-02/06 暂停、继续与计时器纪律                     | 4    | 全部通过 |
| AC-02 重开与难度固定                                | 3    | 全部通过 |
| AC-05 本地记录与异常存储                            | 7    | 全部通过 |
| AC-03/06 键盘与触屏输入                             | 7    | 全部通过 |
| AC-02/05 应用装配集成（含 1 例 CR-01 已知行为记录） | 9    | 全部通过 |

证据：`evidence/qa-acceptance.log`。

### 3.4 浏览器冒烟矩阵（本产物）

黑盒脚本 `qa/e2e/smoke.mjs` 静态托管 `dist/` 后运行，仅通过 DOM 与 Canvas 像素判定；使用 BFS 寻路真实吃食物（S22）。5 个运行全部通过：

| 运行                | 引擎版本      | 检查数 | 通过 | 关键实测                                                                         |
| ------------------- | ------------- | ------ | ---- | -------------------------------------------------------------------------------- |
| chromium @ 360×640  | 151.0.7922.34 | 29     | 29   | 小屏弹层按设计全屏遮挡 HUD，经弹层按钮完成暂停/继续；触屏方向键命中区域 105×56px |
| chromium @ 768×1024 | 151.0.7922.34 | 29     | 29   | 方向键隐藏（≤767px 断点一致）；HUD 按钮直接暂停/继续                             |
| chromium @ 1440×900 | 151.0.7922.34 | 30     | 30   | 难度节拍 casual=202ms / challenge=105ms（比值 1.92）                             |
| firefox @ 360×640   | 153.0         | 29     | 29   | 小屏行为与 chromium 一致；弹层按钮路径验证通过                                   |
| firefox @ 1440×900  | 153.0         | 30     | 30   | 难度节拍 casual=202ms / challenge=97ms（比值 2.08）                              |

共同验证点（两引擎 5 运行全部通过）：开局/移动/转向/反向拒绝/空格暂停与继续/失焦自动暂停与恢复不自行移动/撞墙结束/重开/真实吃食物 +5 分且蛇身增长（BFS 自动游玩，attempts=1）/最高分与本局得分同步/刷新恢复最高分与难度/方向键不滚动页面/无水平溢出/全程无 console.error 与未捕获异常。证据：`evidence/browser-smoke/browser-smoke.json`（逐项检查明细）与同目录截图（25 张）。

### 3.5 静态托管形态

python3 `http.server` 托管 `dist/`：`/index.html`、`/favicon.svg`、两个带哈希资源均 200，未知路径与缺失资源 404。证据：`evidence/static-host.log`。

## 4. 缺陷列表

本轮测试未发现需要返工的真实缺陷。

已知行为边界（沿用审查报告 CR-01，P3，供产品裁决，不计为缺陷）：

- 现象：HUD「暂停/继续」按钮持有键盘焦点时按空格，空格交还浏览器原生行为（再次激活该按钮），可能从暂停态被"继续"或从运行态被"暂停"，与直接按空格切换暂停的预期不同。
- 复现（最小路径）：点击开始游戏 → 用 Tab 或鼠标让焦点落在顶部「暂停」按钮上 → 按空格。
- 期望（若产品要求按钮焦点下空格仍只切换暂停）：需要阻止按钮的原生空格激活。
- 实际：实现将空格按键留给聚焦按钮的原生行为（设计与 a11y 取向），空格在非按钮焦点下正常切换暂停。
- 处理建议：保持现状或在产品验收阶段裁决；如需变更应回到实现方并在新 SHA 上重新审查与测试。
- 测试侧处理：本产物在 `AC-02/05 应用装配集成` 中保留一例"CR-01 现状记录"用例固化该行为，便于后续回归对比。

补充说明（非缺陷，测试设计相关）：小屏（≤767px）弹层按设计覆盖整屏，会遮挡 HUD 按钮；浏览器冒烟在该断点下记录该行为，并通过弹层按钮完成"继续"验证，窄屏与宽屏结论均在报告中列明。

## 5. 未覆盖范围与限制

- Safari / iOS WebKit / Android WebView 未验证（环境无对应浏览器），仅覆盖 Chromium 与 Firefox 两个引擎。
- 真实移动设备触屏（非合成指针事件）未验证；以 Playwright 触屏模拟 + 窄视口近似。
- 棋盘"填满胜利"在浏览器冒烟中不可达（黑盒自动游玩填满 20×20 不现实），该路径由独立逻辑用例以 4×4 棋盘完整构造验证（`AC-04 食物、增长、计分与胜利`）。
- 未做性能压测、压力测试与无障碍专项审计；仅覆盖键盘可达、焦点样式与语义的基础检查。
- 未提供线上体验地址（工单未要求）。

## 6. 证据清单（仓库外运行产物）

| 证据                                                         | 路径（相对 artifacts/output）                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 质量门完整日志（六命令 + dist 哈希）                         | `evidence/quality-gates.log`                                                       |
| 独立逻辑用例日志（50 例明细）                                | `evidence/qa-acceptance.log`                                                       |
| 全新检出验证日志（克隆/安装/测试/构建/dev/preview/静态托管） | `evidence/fresh-clone.log`                                                         |
| 静态托管冒烟日志（其中含构建产物 sha256）                    | `evidence/static-host.log`                                                         |
| 浏览器冒烟矩阵结果（JSON + 截图）                            | `evidence/browser-smoke/browser-smoke.json`、`evidence/browser-smoke/screenshots/` |
| Git 交付校验记录（推送与独立拉取）                           | `evidence/git-delivery-10016.json`                                                 |

## 7. 复现方式

```bash
# 1) 检出
git clone -b agents/frontend-developer https://github.com/peopleyoung/ceshi && cd ceshi
git rev-parse HEAD   # 期望 e4f04ab8a463bfdad7f8272e6609f0d12a7c3157

# 2) 质量门
npm ci && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build

# 3) 独立逻辑用例（本产物）
cd qa && npm install && cd ..
npx vitest run --config qa/vitest.qa.config.ts

# 4) 浏览器冒烟（本产物；需先完成构建）
node qa/e2e/smoke.mjs --browsers chromium,firefox --widths 360,768,1440 --out <输出目录>
```
