# 最终产品验收报告（首轮）：产品级 Web 贪吃蛇小游戏 V1

> 工单：#10002 开发任务 001：产品级 Web 贪吃蛇小游戏  
> 派发：10036 · SDLC 步骤 10017「产品定义与最终验收」第 1 次尝试  
> 验收人：产品经理（数字员工 10009）  
> 验收模式：**最终产品验收**（上游为 qa_engineer 的验收交接；复用工单已交付 PRD，不重启需求分析）  
> 验收对象：`agents/frontend-developer` @ `e4f04ab8a463bfdad7f8272e6609f0d12a7c3157`  
> 验收日期：2026-09-29  
> **结论：❌ 不通过（返修）。存在 1 个可复现布局缺陷 D-01，退回 frontend_developer 修复后重新走审查、测试与产品复验。**

---

## 1. 验收结论摘要

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| AC-01 全新检出安装/构建/静态访问 | ✅ 通过 | 独立复跑 `npm ci`、lint、typecheck、format、测试（73/73）、`npm run build` 全部退出码 0；重建 dist 与 QA 记录哈希逐字节一致（见 §3） |
| AC-02 全流程（开始/移动/吃食/暂停/继续/碰撞/重开/后台暂停） | ✅ 通过 | QA 50/50 逻辑用例 + 浏览器冒烟；本轮浏览器抽检 S2–S5、S9–S11 通过 |
| AC-03 输入（方向键/WASD/屏幕按钮、反向与快速连续输入、尾格规则） | ✅ 通过 | 抽检 S3/S6 通过；单元测试覆盖反向限制、快速连输与尾格边界（73/73） |
| AC-04 食物生成、满盘胜利、计分/长度/胜负状态 | ✅ 通过 | 单元测试覆盖（含满盘胜利）；抽检 S10/S11 通过 |
| AC-05 最高分持久化与存储异常降级 | ✅ 通过 | 抽检 S12 通过（存储键存在、刷新恢复）；存储损坏/不可用路径有单元测试覆盖 |
| AC-06 360/768/1440 视口 + Chromium/非 Chromium 验证 | ❌ **不通过** | 全新加载三档视口正常、Chromium+Firefox 已验；但**窗口内缩放至窄视口出现横向溢出（D-01）**，违反"棋盘与控制区不遮挡、不溢出"（工单/PRD §4.2/US-09）与 PRD §4.4"调整窗口…保持正确" |
| AC-07 自动化测试覆盖 + 浏览器冒烟 | ✅ 通过 | 73 个仓库单测 + QA 147 项浏览器冒烟，覆盖范围与要求逐项对应 |
| AC-08 无已知阻断性缺陷、限制如实列明 | ❌ **不通过** | 存在可复现缺陷 D-01（未修复）；仅当缺陷修复并复验通过后方可判通过 |
| 真实员工流转记录 | ✅ 已核验 | 派发/执行/失败重试记录见 §5，均基于平台派发数据与远端分支实际 SHA |

**判据说明**：D-01 说明首屏与全新加载路径质量良好，但"窗口调整后布局"这一明确验收要求未满足；按工单"交付代码无已知阻断性缺陷"与"不得把失败表述为通过"的要求，本轮不能判定最终验收通过，也不执行"交回真人"；缺陷退回责任员工 `frontend_developer`，修复后由审查、测试、产品验收重走下游链路（复用本报告第 §4.5 复验清单）。

---

## 2. 验收范围与基线（三方 SHA 一致核验）

| 角色 | 交付物 | 分支 | 远端 SHA（本机 ls-remote 实测 2026-09-29T06:21Z） |
| --- | --- | --- | --- |
| 产品经理 | PRD `docs/PRD.md`（复用，未改写） | `agents/product-manager` | `b0a4b0ece01f9ca1751deb7eba18291b07de7aa0` |
| 后端开发 | 技术方案与无后端结论（核验用） | `agents/backend-developer` | `e5c9557d528459a32282857f512c47f0fcd8b132` |
| 前端开发 | **本轮被验收实现** | `agents/frontend-developer` | `e4f04ab8a463bfdad7f8272e6609f0d12a7c3157` |
| 代码审查 | `docs/code-review-report-10002.md` | `agents/code-reviewer` | `7b84e854d12419bff7715ed5dadfc30c1724777b` |
| 测试工程师 | `qa/report/qa-report-10002.md` 及测试产物 | `agents/qa-engineer` | `a9128756a5039df3cca5bdb6ff7f46d662b28827` |
| 主分支 | — | `main` | `121349e434264d74e1ed52c5ffd717e805af8725` |

- 审查报告明确记录被审查实现为 `e4f04ab…`；QA 报告明确记录被测实现为 `e4f04ab…`，两者与实现分支远端 HEAD 一致 —— **审查、测试证据与当前实现同版本**（cl_1 核验点）。
- 原始记录：`evidence/pm-acceptance/remote-branches.log`。

## 3. 独立复验结果（不与上游结论相互依赖）

1. **质量门禁独立复跑**（`evidence/pm-acceptance/independent-reverify/`）：`npm ci`、`npm run lint`、`npm run typecheck`、`npm run format:check`、`npm test`（73/73 通过）、`npm run build`，全部退出码 0。
2. **构建确定性交叉核对**（`evidence/pm-acceptance/dist-hash-crosscheck.log`）：本地重建 dist 的 4 个文件 SHA-256 与 QA `fresh-clone.log` 记录逐字节一致（index.html `6a282481…`、JS `abc63c3b…`、CSS `9fc65d04…`、favicon `e244ba1e…`），证明被验收产物可由源码确定性复现。
3. **浏览器抽检 14 项，13 通过 1 失败**（`evidence/pm-acceptance/pm-spotcheck.json`、`pm-spotcheck.log`，截图 `s1/s4/s8/s10/s13`）：开始、空格开始/暂停/继续、方向移动、WASD、重开、失焦自动暂停、游戏结束与重开、存储键、控制台零错误均通过；**S13 窄视口（缩放后）横向溢出 87px，失败**。

---

## 4. 缺陷 D-01（阻断验收）

| 项 | 内容 |
| --- | --- |
| 编号 | D-01 |
| 严重级别 | P2（阻断本工单验收；不阻断首屏使用，但明确违反验收标准） |
| 责任员工 | frontend_developer（10010） |
| 违反条款 | 工单"响应式布局至少覆盖 360px、768px 和 1440px 宽度；棋盘与控制区不遮挡、不溢出"；AC-06；PRD US-09；PRD §4.2"不溢出"；PRD §4.4"调整窗口…保持正确" |
| 现象 | 页面在同一窗口内由宽缩放至窄（不刷新），出现横向溢出与右侧内容裁切 |

### 4.1 复现步骤与实测数据

**路径一（Playwright `setViewportSize`，`evidence/pm-acceptance/resize-matrix.log`）**

1. 1440×900 加载页面；
2. 无刷新缩放至 360×640；
3. 实测：`documentElement.scrollWidth=447`，视口 360 → **横向溢出 87px**；棋盘宽 435px（基准应为 ≤336px）；开始界面与游戏运行中均复现。
4. 变体：1440→390×844 溢出 **186px**（棋盘 560px）；1440→768→360 与 1440→360→1440→360 往返均复现；全新加载 360/768/1440 不溢出（这正是上游 fresh-load 冒烟未发现该问题的原因）。

**路径二（iframe 盒缩放，机制独立，`evidence/pm-acceptance/iframe-resize-confirmation.log`）**：宿主页内嵌 iframe 由 1440×900 改盒至 360×640，iframe 内文档同样溢出 87px、棋盘 435px → 非 Playwright 视口工具的假象。

**路径三（可交付复现脚本，`evidence/pm-acceptance/repro-resize-overflow.mjs` + `.log`）**：
`node repro-resize-overflow.mjs --repo <ceshi 仓库>`（自包含：内置静态服务 + qa/ 下 Playwright）；当前版本 5 个场景 3 失败（B/C/D），退出码 1：

```
PASS A 基准-全新加载360并开始 :: viewport=360 scrollWidth=360 overflow=0 boardW=336
FAIL B 缩放1440->360(开始界面) :: viewport=360 scrollWidth=447 overflow=87 boardW=435
FAIL C 缩放1440->360(游戏运行中) :: viewport=360 scrollWidth=447 overflow=87 boardW=435
FAIL D 缩放1440->390x844(游戏运行中) :: viewport=390 scrollWidth=576 overflow=186 boardW=560
PASS E 缩放1440->768(游戏运行中) :: viewport=768 scrollWidth=768 overflow=0 boardW=560
```

**手动复现**：Chromium 打开 dist 静态站点，拖动窗口由宽收窄至约 360px，出现横向滚动条，"重新开始"按钮与棋盘右侧被裁切（截图 `evidence/pm-acceptance/s13-narrow-360.png`：内容右缘 x=447 > 视口 360）。

### 4.2 根因（已实测定位）

1. `src/renderer/CanvasRenderer.ts` 的 `resize()` 会把 canvas 内联样式固定为 `style.width = <px>`；
2. `.board__canvas` 没有 `max-width` 约束，canvas（替换元素）的固有宽度参与网格列 `min-content` 计算；
3. `.app` 为 grid 布局，列宽由内容 `min-content` 决定 → 列宽被 canvas 固定像素宽度"锁定"（实测整列 435px，`element-offenders.log` 显示 header/hud/board 全为 435px）；
4. `.board { width: min(100%, 68vh, 560px) }` 的百分比以已溢出的列为基准解析 → 缩放后棋盘保持 435px（360 高视口）或 560px（390×844），并在 ResizeObserver 回写 canvas 宽度后形成自锁。

### 4.3 已验证的修复候选（注入 CSS 实测，`evidence/pm-acceptance/css-fix-candidates.log`）

| 候选 | 结果 |
| --- | --- |
| F1 `.board__canvas { max-width: 100%; height: auto }` | ✅ 溢出 0（**建议的最小修复**） |
| F5 `.board__canvas { max-width: 100% }` | ✅ 溢出 0（建议附带 `height:auto` 保持比例） |
| F2 `.stage { min-width: 0 }` | ✅ 溢出 0 |
| F3 `.app { grid-template-columns: minmax(0, 1fr) }` | ✅ 溢出 0 |
| F4 `.board { min-width: 0 }` | ❌ 无效（溢出仍 87px） |

具体采用哪种由前端按代码结构决定；修复后须重建 dist 并提交到 `agents/frontend-developer`。

### 4.4 影响评估

- 影响窄窗口/手机浏览器（用户把桌面窗口缩窄、或小屏手机的实用场景）：横向滚动、右侧内容与控件裁切；
- 不影响首屏全新加载与 768/1440 常规使用，因此不属于"首屏不可用"级别，但属于验收标准明文约束的布局缺陷，不能按"通过"处理。

### 4.5 修复后复验清单（前端自验 + 下游重走）

1. `node repro-resize-overflow.mjs --repo <仓库>` 退出码 0（B/C/D 全 PASS）；
2. `resize-matrix.log` 同款矩阵：R1/R2/R5/R6 溢出 0；F1/F2/F3 基准不回归；
3. 以 2× devicePixelRatio 复核棋盘清晰度不受修复影响；
4. `npm test`（73/73）、lint、typecheck、build 全绿；dist 重建后抽查；
5. 修复提交推送 `agents/frontend-developer` 并给出新 SHA；审查（本缺陷相关改动复审）→ 测试 → 产品复验。

---

## 5. 审查遗留建议的产品裁决

| 编号 | 内容（`docs/code-review-report-10002.md`） | 产品裁决 |
| --- | --- | --- |
| CR-01 (P3) | HUD 按钮聚焦时按空格触发原生按钮激活（聚焦"重新开始"后按空格直接重开，而非暂停） | **接受为已记录的边界行为，V1 不要求修复**。实测捕获见 `pm-spotcheck` S8 与截图 `s8-cr01-space-on-restart-focus.png`：需先点击按钮使其聚焦才会触发，属平台原生键盘行为，且与工单"其他页面元素保留正常键盘行为"一致；暂停按钮场景行为一致、无信息误导。若后续版本修复此交互，需重跑 S8 与 §4.5 全部检查。 |
| CR-02 (P3) | 仓库内无 e2e 用例（浏览器冒烟在 QA 侧） | 接受。QA 已交付可独立运行的冒烟套件（`qa/e2e/smoke.mjs`），满足 AC-07。 |
| CR-03 (P4) | Safari/WebKit 未验证 | 接受为已记录限制（QA 报告同样列明），交付说明须保留该限制。 |
| CR-04 (P4) | dist 未提交入库 | 接受。工单未要求提交构建产物；dist 可由源码确定性重建（§3.2 已证）。 |

---

## 6. 真实员工流转记录（数字员工）

**平台派发记录**（来源：平台派发数据，2026-09-29 读取；员工 ID 映射：10009 产品经理 / 10010 前端开发 / 10011 后端开发 / 10012 测试工程师 / 10013 代码审查）：

| 阶段 | 派发 ID | 执行员工 | 结果 | 关键产出/说明 |
| --- | --- | --- | --- | --- |
| 旧流程（已废止，供追溯） | 10000–10002 | 产品经理 | 失败 ×3 | 执行器仓库物化 git 命令失败（环境问题） |
| 旧流程 | 10003 | 产品经理 | 成功 | PRD 交付 `agents/product-manager` |
| 旧流程 | 10005 / 10010 / 10015 / 10019 / 10023 | 后端开发 | 成功/部分取消 | 旧跨角色流程往返期间 |
| 旧流程 | 10006 | 前端开发 | 失败 | checkout ref 无法解析（执行的瞬态错误） |
| 旧流程 | 10009 / 10011 / 10017 / 10020 | 前端开发 | 成功 | 同上 |
| 旧流程 | 10022 | 后端开发 | 取消 | 用户取消（USER_CANCELED） |
| 恢复 | 10031 | 后端开发 | 成功 | 核验技术文档与远端 SHA，产出 `e5c9557d…` |
| 新链 | 10032 | 前端开发 | 成功 | 游戏实现交付 `e4f04ab…` |
| 新链 | 10033 | 代码审查 | 成功 | 审查报告 `7b84e85…`（结论：通过，含 4 条建议） |
| 新链 | 10034 | 测试工程师 | 失败 | 执行器工作目录异常（环境问题） |
| 新链 | 10035 | 测试工程师 | 成功 | 测试产物 `a9128756…`（50/50 + 147/147 通过） |
| 本轮 | 10036 | 产品经理 | **不通过（返修）** | 本报告；D-01 退回前端 |

- 上表全部为真实派发/执行记录，未以人工操作替代。
- 失败与重试：10000–10002（3 次）、10006、10034 共 5 次失败均为执行器/网络环境类，均已如实恢复并重试成功；无任何失败被记为成功。

**上游与下游提交引用**：上游引用见 §2 表格；下游待修复后引用 `agents/frontend-developer` 的新 SHA。

---

## 7. 后续与路由

- **路由**：真实 handoff → `frontend_developer`（缺陷责任员工），工单状态保持"进行中"，不标记完成、本轮不交回真人（`yangshuai`）。
- 修复并推送后按既定链路重走：代码审查 → 测试 → 产品复验（复用本报告 §4.5 清单），复验通过后由产品经理出具最终交付报告并经运行时真人交接机制交回原指派人。
- **未完成事项**：① D-01 修复与复验；② WebKit/真机触控未覆盖（沿用 QA 已记录限制）；③ 满盘胜利路径目前仅逻辑层覆盖（QA 已记录，浏览器层未跑通）。

## 附录：证据索引（本派发 artifacts/output 内相对路径）

- `deliverables/acceptance-report-10002.md`（本报告）
- `evidence/pm-acceptance/pm-spotcheck.json` / `pm-spotcheck.log`（14 项浏览器抽检）、截图 `s1/s4/s8/s10/s13*.png`
- `evidence/pm-acceptance/resize-matrix.log`（缩放矩阵）、`element-offenders.log`（越界元素）、`css-fix-candidates.log`（修复候选验证）
- `evidence/pm-acceptance/iframe-resize-confirmation.log`（独立机制复现）
- `evidence/pm-acceptance/repro-resize-overflow.mjs` + `.log`（可交付复现/复验脚本，退出码 1）
- `evidence/pm-acceptance/dist-hash-crosscheck.log`（构建确定性交叉核对）
- `evidence/pm-acceptance/remote-branches.log`（远端分支 SHA 实测）
- `evidence/pm-acceptance/independent-reverify/`（质量门禁独立复跑日志）
- `evidence/git-delivery-10017.json`（本步骤 Git 交付校验）
