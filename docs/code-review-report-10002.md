# 代码审查报告 · Web 贪吃蛇 V1 前端实现

- **审查角色**：代码审查工程师（code_reviewer）
- **被审仓库**：`https://github.com/peopleyoung/ceshi`
- **被审分支**：`agents/frontend-developer`
- **被审提交 SHA**：`e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`
- **审查范围**：`121349e434264d74e1ed52c5ffd717e805af8725...e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`（共 33 个文件：源码 14、测试 6、配置/构建 10、文档 1、静态资源 2）
- **审查日期**：2026-09-29
- **审查结论**：**通过（无阻断性问题；4 项非阻断建议/提示）**

---

## 1. 审查方法（独立性说明）

全部验证基于被审 SHA 的独立检出（干净工作树、只读审查）与仓库外独立脚本（`artifacts/scratch/`），**未修改任何被审查实现代码**。

| 手段 | 说明 |
|------|------|
| 源码通读 | GameEngine / InputHandler / StorageService / CanvasRenderer / UI 五层 + app 装配 + 全部测试 + 构建配置 + README |
| 质量门禁复跑 | `npm test`（vitest）、`tsc --noEmit`、`eslint`、`prettier --check`、`vite build` 全部独立复跑 |
| 构建可复现性 | 两次独立构建对比 `dist` 产物 sha256 |
| 独立模糊/性质测试 | 自写 13 个不变量用例（仓库外，不复用上游测试） |
| 独立浏览器黑盒验证 | 自写脚本在真实 Chromium 与 Firefox 中驱动**生产构建产物**，仅凭渲染像素与 DOM 判定行为 |
| 静态托管冒烟 | `python3 -m http.server` 静态服务，断言资源可达与 404 语义 |
| 缺陷独立复现 | 对发现的行为边界给出最小复现脚本与像素轨迹 |

---

## 2. 独立验证结果

### 2.1 质量门禁（独立复跑，node v22.23.1 / npm 10.9.8）

| 项目 | 命令 | 结果 |
|------|------|------|
| 单元/组件测试 | `npm test` | **73/73 通过**（engine 34、app 12、input 11、storage 11、renderer 5） |
| 类型检查 | `tsc --noEmit` | 通过（exit 0） |
| Lint | `eslint .` | 通过（exit 0） |
| 格式 | `prettier --check` | 通过（exit 0） |
| 生产构建 | `vite build` | 通过（exit 0；index.html 0.85 kB→gzip 0.56，css 7.40 kB→gzip 2.43，js 25.48 kB→gzip 8.72） |

**构建可复现**：两次独立构建后 `dist` 四个产物 sha256 完全一致（`index.html 6a282481…`、`assets/index-D1NQNW7m.js abc63c3b…`、`assets/index-BkWO7BG6.css 9fc65d04…`、`favicon.svg e244ba1e…`）。

### 2.2 独立模糊测试 / 性质验证（仓库外新增用例）

新增 13 个不变量用例（`reviewer-fuzz.test.ts`），**13/13 通过，0 个不变量违反**：

| 用例组 | 规模与断言 |
|--------|-----------|
| 随机对局不变量（生存偏置） | 260 局 / 17,537 步；每步断言：不越界、不进入蛇身（合法尾格豁免除外）、计分等于累计食物分值、长度=初始+进食、食物永不在蛇身、状态机合法 |
| 无生存偏置纯随机 | 200 局 / 7,263 步，同上断言 |
| 高生存偏置长局 | 80 局 / 7,192 步，同上断言 |
| 环形蛇身尾格边界（独立构造） | 进入尾格存活 200/200；进食尾格判为碰撞 200/200 |
| 随机密集蛇身尾格/进食 | 尾格进入 15 次、进食步 465 次、胜利 210 次，全部符合规则 |
| 满盘胜利（独立构造） | 5×5、10×10 最后一格进食即 victory、food 置空 |
| 食物生成边界 | 任意蛇形不落蛇身；随机数越界仍返回棋盘内空格 |
| 生命周期 | 空闲/暂停时 resume/pause/step 不产生额外计时器；destroy 后不再启动计时器；存储抛错时游戏仍可运行 |

### 2.3 独立浏览器黑盒验证（生产构建产物）

独立脚本，两个浏览器共 **115 项检查全部通过**：

| 浏览器 | 视口 | 结果 |
|--------|------|------|
| Chromium 151.0.7922.34 | 360×640、768×1024、1440×900 | **69/69 通过** |
| Firefox 142.0.1 | 360×640、1440×900 | **46/46 通过** |

覆盖点（每视口 23 项）：首屏开始界面与规则、DPR 画布内部分辨率、方向键移动与持续重绘、食物渲染、WASD、屏幕方向键（与 ≤767 断点显隐一致）、反向输入拒绝、同拍快速连按不瞬时反向、空格暂停/继续、失焦自动暂停且返回后不自行移动、结束后重开、最高分刷新后保留、三档难度选择、无 console.error / 未处理异常、方向键不引起页面滚动。每视口留存 4 张截图（start / running / autopause / gameover）。

### 2.4 静态托管冒烟

- `/`、`index.html`、JS、CSS、favicon 均 **200**，不存在路径 **404**；
- 复核：全新静态服务器（干净 cwd）复测同样 200×5 + 404；资源 sha256 与构建日志一致。

---

## 3. 分模块审查要点

- **GameEngine（`src/engine/GameEngine.ts`）**：规则实现正确。尾格碰撞豁免（243-249：非进食时碰撞体排除尾格、进食时含全量蛇身）与满盘胜利（261-265：`length >= rows*cols` 判定 victory 且 food 置空）均经独立构造用例验证；方向队列（208-220：以队尾为参照拒绝同向/反向、上限 4）杜绝了绕过反向限制的连按路径；`scheduleTick` 先清后设、`destroy` 清理完整，无重复计时器。
- **InputHandler（`src/input/InputHandler.ts`）**：键盘 / 虚拟方向键 / `visibilitychange`+`blur` 自动暂停齐备；对可编辑元素与按钮保留原生行为（113-126）是符合可达性的有意设计（其边界见 CR-01）；d-pad 支持 `event.detail===0` 的键盘激活路径（157-162）。
- **StorageService**：localStorage 不可用或抛错时降级为内存存储，不阻断开始/游玩/重开（独立用例验证）。
- **CanvasRenderer**：DPR 缩放正确（黑盒断言 canvas 内部分辨率 = css × dpr）；头/食物颜色像素可稳定用于黑盒观测。
- **app 装配（`src/app.ts`）**：状态→弹层/开始屏同步（97-115）覆盖 idle/running/paused/gameover/victory 全路径；反复暂停/重开无重复监听器；destroy 链路（226-233）完整。
- **构建配置**：`base:'./'` 相对路径可静态部署；vitest jsdom + `fakeTimers.toFake` 白名单（规避 jsdom 幽灵计时器）处理得当。

---

## 4. 验收标准对照（AC-01 ~ AC-08）

| # | 验收项 | 结论 | 证据 |
|---|--------|------|------|
| AC-01 | 全新检出可安装、启动、检查、构建，静态服务可访问 | 通过 | §2.1 门禁全绿；§2.4 静态服务 200/404 |
| AC-02 | 三档难度全流程；后台自动暂停、返回不自行移动 | 通过 | §2.3 浏览器套件；难度参数 200/150/100ms 与 5/10/20 分经单测与源码核对 |
| AC-03 | 方向键/WASD/屏幕按钮；反向与快速连按不得非法移动；尾格规则 | 通过 | §2.3（同拍 Up+Left 轨迹 `10,10→10,9→8,9→…` 无瞬时反向）；§2.2 尾格构造用例 |
| AC-04 | 食物不落蛇身；满盘不无限循环；计分/长度/胜负可验证 | 通过 | §2.2 模糊与构造用例（胜利 210 次） |
| AC-05 | 最高分刷新保留；存储异常不阻断 | 通过 | §2.3 刷新后保留；§2.2 存储抛错降级用例 |
| AC-06 | 360/768/1440 视口；Chromium + 非 Chromium | 通过 | §2.3（Chromium 三视口 + Firefox 两视口）；Safari 未验证（CR-03） |
| AC-07 | 自动化测试覆盖核心规则；浏览器冒烟 | 基本满足 | 73 仓库单测 + 本报告 115 项独立黑盒；仓库内缺 e2e 回归（CR-02） |
| AC-08 | 无阻断缺陷；限制如实说明 | 通过 | 无阻断缺陷；上游交付说明已列明限制 |

---

## 5. 问题清单（无 P0–P2；严重度：P0 阻断 ＞ P1 严重 ＞ P2 一般 ＞ P3 建议 ＞ P4 提示）

### CR-01（P3 · 建议）点击 HUD 按钮后按空格不会暂停，而是再次触发该按钮

- **位置**：`src/input/InputHandler.ts:123-126`（空格在可交互目标上跳过拦截，交还浏览器原生行为——a11y 有意设计）；`src/app.ts:148-161`（HUD 按钮操作后焦点未移动）
- **触发场景**：运行中鼠标点击「重开」按钮（焦点保留在按钮上），随后按空格 → 浏览器把空格派发给聚焦按钮 → **对局被静默重置**，而不是暂停；与页面提示文案「空格暂停或继续」不一致。
- **独立复现**（证据 `evidence/cr01-focus-space.log`）：`activeElement=restart-button` → 空格 → 无暂停弹层；蛇头轨迹 `10,10 →(5 拍)→ 15,10 →空格→ 11,10`（回到起点附近即已被重开）；对照组：先 `blur` 再按空格 → 暂停弹层正常出现。
- **建议**：HUD 按钮点击后 `blur()` 焦点或把焦点交还棋盘容器（`tabindex=-1`）；或在提示文案中说明。是否修复可由产品裁决，不阻断交付。

### CR-02（P3 · 测试覆盖）仓库内缺少端到端/回归自动化

- **位置**：仓库整体（仅 vitest 单测与组件测试；QA-04/QA-05 依赖手工或仓库外脚本）
- **影响**：浏览器级行为（像素渲染、失焦暂停、跨浏览器）无仓库内可重复回归手段。
- **建议**：将关键冒烟（开始/暂停/结束/重开/最高分恢复/移动端按钮）固化为仓库内 e2e 并纳入 CI。

### CR-03（P4 · 提示）Safari/WebKit 未验证

- 上游交付说明已声明；本次审查同样未覆盖。若有 Safari/iOS 用户群，建议补一次冒烟（WebKit 对 `visibilitychange`、Canvas 合成与 `prefers-reduced-motion` 行为偶有差异）。

### CR-04（P4 · 提示）`dist` 未提交，部署需先构建

- 上游已声明；因构建可复现（§2.1 两次构建 sha256 一致），风险较低，但部署文档应明确「先 `npm run build`」。

---

## 6. 结论与交接建议

**结论：通过。** 被审实现规则正确、边界完备、测试与构建可复现，Chromium/Firefox 独立黑盒验证全部通过；所列问题均为非阻断级建议/提示，不影响进入下一环节。

- 被审实现 SHA：`e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`
- 交接：转 **qa_engineer** 执行验证；建议 QA 将 CR-01（按钮焦点/空格语义）作为已知行为边界纳入验证清单。

---

## 7. 证据清单（`artifacts/output/evidence/`）

| 文件 | 说明 |
|------|------|
| `quality-gates.log` | 被审 SHA 的 73/73 测试与 typecheck/lint/format/build 全绿记录、dist 产物哈希 |
| `fuzz/fuzz-run.log`、`fuzz/reviewer-fuzz.test.ts` | 独立模糊/性质测试源码与运行日志（13/13，统计 JSON 内嵌） |
| `browser-chromium/reviewer-browser-check-cr.json`、`run.log`、12 张截图 | Chromium 151.0.7922.34：69/69（三视口） |
| `browser-firefox/reviewer-browser-check-ff.json`、`run.log`、8 张截图 | Firefox 142.0.1：46/46（两视口） |
| `cr01-focus-space.log`、`cr01-run.log` | CR-01 最小复现轨迹（像素）与对照 |
| `static-host-smoke.log` | 静态托管冒烟（含全新服务器复核）与产物 sha256 |

审查脚本（仓库外）：`artifacts/scratch/browser-verify/reviewer-browser-check-cr.mjs`、`artifacts/scratch/browser-verify-ff/reviewer-browser-check-ff.mjs`、`artifacts/scratch/browser-verify/cr01-focus-space.mjs`、`artifacts/scratch/fuzz/tests/reviewer-fuzz.test.ts`。
