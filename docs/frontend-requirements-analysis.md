# 前端需求分析：产品级 Web 贪吃蛇小游戏 V1

> 版本：1.0  
> 作者：前端开发工程师（数字员工）  
> 日期：2026-09-28  
> 状态：已确认，可交付  
> 上游 PRD：`agents/product-manager` 分支，SHA `b0a4b0ece01f9ca1751deb7eba18291b07de7aa0`，文件 `docs/prd-snake-game-v1.md`  
> 上游后端分析：`agents/backend-developer` 分支，SHA `b738452d3271c333190222fae3e1c558547bcdde`，文件 `docs/backend-requirements-analysis.md`

---

## 1. 需求背景与目标确认

### 1.1 背景
本任务要求在 ceshi 空间交付一款产品级 Web 贪吃蛇小游戏 V1。目标仓库 `https://github.com/peopleyoung/ceshi` 在任务发布时 main 分支仅有 README.md，需从零搭建最小可维护的前端项目。本次任务同时承担数字员工流转验证目的。

### 1.2 目标
- 交付一款操作顺畅、视觉完整、状态反馈清晰的 Web 贪吃蛇游戏
- 可构建为静态站点，由普通静态 HTTP 服务部署
- 兼顾桌面浏览器与手机浏览器
- 代码结构清晰，依赖精简，便于维护与自动化测试

### 1.3 非目标（前端视角确认）
- 不开发原生 App、小程序
- 不实现后端服务、账号登录、联网排行榜或多人对战
- 不引入无关服务、埋点或外部账号依赖
- 不使用重量级前端框架（React/Vue 等），保持轻量

### 1.4 前端视角补充说明
经审阅产品经理 PRD 与后端开发工程师分析，确认：
- 本任务为**纯前端静态站点**，无需后端服务
- PRD 中 8 项验收标准均可通过前端实现完成
- 后端开发工程师已确认后端任务为 0，前端 8 项任务 + 测试 6 项任务的拆分合理
- PRD 中的接口契约草案（GameEngine、StorageService、InputHandler）可作为前端模块划分的参考

---

## 2. 用户故事（前端实现视角）

以下用户故事直接引用 PRD，前端实现视角补充关键实现要点：

| # | 用户故事 | 前端实现要点 |
|---|---------|-------------|
| US-01 | 打开页面后能看到清晰的说明和开始入口 | 需要开始界面（Start Screen），包含游戏说明、难度选择、开始按钮 |
| US-02 | 用方向键/WASD（桌面）或屏幕方向按钮（手机）控制蛇 | 需要 InputHandler 模块，键盘事件 + 触屏事件 + 虚拟方向按钮 |
| US-03 | 蛇吃食物后增长并加分，碰墙或碰自身时结束 | GameEngine 核心逻辑：移动、碰撞检测、计分、状态机 |
| US-04 | 游戏过程中暂停和继续 | 空格键 + 可见按钮触发 pause/resume；visibilitychange/blur 自动暂停 |
| US-05 | 选择休闲/标准/挑战三档难度 | 难度选择 UI + GameConfig 配置；速度参数集中管理 |
| US-06 | 各难度最高分刷新后保留 | StorageService 模块，localStorage 读写 + 异常降级 |
| US-07 | 游戏失败时能看到本局得分、最高分和重开入口 | 失败弹层（Game Over Modal），展示分数 + 重开按钮 |
| US-08 | 页面切到后台时游戏自动暂停 | visibilitychange + blur 事件监听，自动调用 pause() |
| US-09 | 360px 到 1440px 屏幕上正常显示和操作 | 响应式 CSS + Canvas 按 devicePixelRatio 缩放 |
| US-10 | 棋盘填满时游戏正常结束（胜利状态） | GameEngine 检测棋盘满格 → victory 状态 → 胜利弹层 |

---

## 3. 功能范围（前端实现分解）

### 3.1 项目骨架与技术选型

**技术选型决定：**
- 构建工具：**Vite**（轻量、快速、原生支持 TypeScript）
- 语言：**TypeScript**（类型安全，便于模块接口约束）
- 渲染：**Canvas API**（性能好，适合游戏渲染，按 devicePixelRatio 缩放保证清晰）
- 测试框架：**Vitest**（与 Vite 生态一致）+ **jsdom**（单元测试环境）
- 不使用前端框架（React/Vue 等），纯 TS + DOM/Canvas
- 代码风格：ESLint + Prettier

**理由：**
- 满足"轻量、可静态构建"要求
- Vite 构建产物为纯静态文件，可由任何 HTTP 服务部署
- TypeScript 提供类型安全，便于模块接口约束
- Canvas API 性能好，适合游戏渲染
- Vitest 与 Vite 生态一致，配置简单

### 3.2 模块划分

根据 PRD 接口契约草案，前端模块划分如下：

```
src/
├── engine/
│   ├── GameEngine.ts       # 游戏核心逻辑：状态机、蛇移动、碰撞检测、计分
│   ├── types.ts            # 类型定义：GameState, GameConfig, Direction, Difficulty
│   └── constants.ts        # 常量配置：速度、棋盘尺寸、计分规则
├── input/
│   └── InputHandler.ts     # 输入处理：键盘、触屏、虚拟按钮、自动暂停
├── storage/
│   └── StorageService.ts   # 本地存储：最高分、难度选择、异常降级
├── renderer/
│   └── CanvasRenderer.ts   # Canvas 渲染：棋盘、蛇、食物、高像素密度适配
├── ui/
│   ├── StartScreen.ts      # 开始界面：说明、难度选择、开始按钮
│   ├── GameHUD.ts          # 游戏 HUD：得分、最高分、难度、暂停按钮
│   ├── GameOverModal.ts    # 失败弹层：本局得分、最高分、重开按钮
│   ├── VictoryModal.ts     # 胜利弹层：胜利提示、重开按钮
│   └── MobileControls.ts   # 手机方向控制区
├── app.ts                  # 应用入口：初始化、模块组装、生命周期管理
└── styles/
    └── main.css            # 响应式布局、视觉样式、prefers-reduced-motion
```

### 3.3 核心功能实现要点

#### 3.3.1 游戏引擎（GameEngine）
- **状态机**：idle → running → paused → running → gameover/victory → idle
- **蛇移动**：固定时间间隔（由难度决定速度），每次移动一格
- **碰撞检测**：
  - 碰墙：蛇头坐标超出棋盘范围
  - 碰自身：蛇头坐标与蛇身任一格子重合
  - **尾格边界**：蛇头进入本步将移走的尾格时，该尾格已移走，不算碰撞
- **食物生成**：仅在空格子上随机生成，棋盘填满时触发胜利
- **计分**：吃食物加分，分数配置集中管理
- **难度速度**：休闲 200ms、标准 150ms、挑战 100ms（可配置）

#### 3.3.2 输入处理（InputHandler）
- **键盘事件**：方向键（↑↓←→）+ WASD + 空格（暂停/继续）
- **触屏事件**：虚拟方向按钮（上下左右）
- **快速连续输入**：同一移动周期内的多次输入需正确处理，不能绕过反向限制
  - 实现：输入队列，每 tick 只处理一个方向变更
- **反向限制**：禁止直接反向移动（如正在向右时不能直接向左）
- **自动暂停**：visibilitychange + blur 事件监听
- **防止页面滚动**：游戏区域的方向操作不引起页面意外滚动（preventDefault）
- **不全局拦截**：其他页面元素保留正常键盘行为

#### 3.3.3 本地存储（StorageService）
- **存储内容**：各难度最高分、用户最后选择的难度
- **存储方式**：localStorage
- **异常降级**：存储不可用或数据损坏时仍可正常游玩（不阻断游戏）
  - 实现：try-catch 包裹所有 localStorage 操作，失败时使用内存变量兜底

#### 3.3.4 渲染与 UI
- **Canvas 渲染**：棋盘、蛇身、食物
  - 按 devicePixelRatio 缩放，保证高像素密度屏幕清晰
- **开始界面**：游戏说明、难度选择（休闲/标准/挑战）、开始按钮
- **游戏 HUD**：当前难度、本局得分、该难度最高分、暂停/继续按钮
- **失败弹层**：本局得分、该难度最高分、重开按钮
- **胜利弹层**：胜利提示、重开按钮
- **手机方向控制区**：上下左右四个按钮，足够大的点击区域

#### 3.3.5 响应式布局
- **断点**：360px（手机）、768px（平板）、1440px（桌面）
- **棋盘尺寸**：根据视口宽度动态调整，保证不遮挡、不溢出
- **触控按钮**：足够大的点击区域（至少 44x44px）
- **prefers-reduced-motion**：尊重系统偏好，减少动画效果

#### 3.3.6 状态保护
- **自动暂停**：visibilitychange + blur 事件监听
- **清理逻辑**：反复暂停和重开不会产生重复计时器、重复事件监听或异常加速
  - 实现：pause() 时清除 setInterval，resume() 时重新创建；destroy() 时移除所有事件监听

---

## 4. 接口契约草案（前端内部模块）

直接引用 PRD 中的接口契约，前端实现时遵循：

### 4.1 游戏引擎模块（GameEngine）
```typescript
interface GameEngine {
  start(config: GameConfig): void
  pause(): void
  resume(): void
  restart(): void
  changeDirection(dir: Direction): void
  getState(): GameState
  onStateChange(cb: (state: GameState) => void): void
}

interface GameConfig {
  difficulty: Difficulty
  boardSize: { rows: number; cols: number }
}

type Difficulty = 'casual' | 'standard' | 'challenge'
type Direction = 'up' | 'down' | 'left' | 'right'

interface GameState {
  status: 'idle' | 'running' | 'paused' | 'gameover' | 'victory'
  snake: Array<{ x: number; y: number }>
  food: { x: number; y: number }
  score: number
  highScore: number
  difficulty: Difficulty
}
```

### 4.2 存储模块（StorageService）
```typescript
interface StorageService {
  getHighScore(difficulty: Difficulty): number
  setHighScore(difficulty: Difficulty, score: number): void
  getLastDifficulty(): Difficulty | null
  setLastDifficulty(difficulty: Difficulty): void
}
```

### 4.3 输入模块（InputHandler）
```typescript
interface InputHandler {
  onDirection(cb: (dir: Direction) => void): void
  onPauseToggle(cb: () => void): void
  destroy(): void
}
```

---

## 5. 验收标准（前端实现视角）

直接引用 PRD 中的 8 项验收标准，前端实现视角补充验证要点：

| # | 验收项 | 前端验证要点 |
|---|--------|-------------|
| AC-01 | 从全新检出开始，按 README 可以安装、启动、运行检查并完成生产构建；构建产物能由普通静态 HTTP 服务访问。 | `npm install` → `npm run dev` → `npm run build` → `npx serve dist` 验证可访问 |
| AC-02 | 三档难度均可完成开始、移动、吃食物、加分、增长、暂停、继续、碰撞结束和重开流程；页面切到后台后暂停，返回后不会自行移动。 | 手动测试三档难度完整流程；切换浏览器标签页验证自动暂停 |
| AC-03 | 方向键、WASD 和屏幕方向按钮有效；反向与快速连续输入不能导致非法移动；进入本步将移走的尾格按正确的碰撞规则处理。 | 手动测试各种输入场景；快速连续按方向键验证不会反向穿越 |
| AC-04 | 食物不出现在蛇身上，棋盘填满不会无限循环；计分、长度、胜利和失败状态可验证。 | 手动测试食物生成位置；验证棋盘满格触发胜利 |
| AC-05 | 各难度最高分刷新后保留，异常或不可用的本地存储不会阻断开始、游玩与重开。 | 刷新页面验证最高分保留；禁用 localStorage 验证游戏仍可正常进行 |
| AC-06 | 在 360px、768px、1440px 视口完成主要流程检查；至少完成一种 Chromium 浏览器和一种非 Chromium 浏览器的验证。 | Chrome + Firefox 测试；调整视口宽度验证响应式布局 |
| AC-07 | 自动化测试覆盖移动、方向限制、食物生成、增长与计分、墙/自身碰撞、尾格边界、满盘胜利和重开状态；浏览器冒烟验证开始、暂停/继续、结束与重开及记录恢复。 | `npm run test` 运行自动化测试套件，检查覆盖率 |
| AC-08 | 交付代码无已知阻断性缺陷；测试或构建失败不得表述为通过，限制与待解决问题须在交付说明中列明。 | 检查测试与构建结果，审查已知问题列表 |

---

## 6. 任务拆分

### 6.1 前端开发任务

直接引用 PRD 中的 8 项前端任务，确认优先级与依赖关系：

| # | 任务 | 优先级 | 依赖 | 预估工时 |
|---|------|--------|------|---------|
| FE-01 | 搭建项目骨架：Vite + TypeScript，配置构建、lint、测试框架，编写 README | P0 | 无 | 2h |
| FE-02 | 实现游戏核心逻辑模块（GameEngine）：网格模型、蛇移动、食物生成、碰撞检测、计分、难度速度配置、状态机 | P0 | FE-01 | 4h |
| FE-03 | 实现输入模块（InputHandler）：键盘、触屏、虚拟按钮、visibilitychange/blur 自动暂停、防止页面滚动 | P0 | FE-01 | 3h |
| FE-04 | 实现存储模块（StorageService）：localStorage 读写、异常降级处理 | P0 | FE-01 | 1h |
| FE-05 | 实现渲染与 UI：Canvas 渲染、开始界面、游戏 HUD、失败/胜利弹层、手机方向控制区 | P0 | FE-02, FE-03, FE-04 | 5h |
| FE-06 | 响应式布局与视觉打磨：360px/768px/1440px，高像素密度适配，现代街机视觉风格，prefers-reduced-motion | P1 | FE-05 | 3h |
| FE-07 | 快速连续输入处理：同一移动周期内的方向输入队列，防止绕过反向限制 | P0 | FE-02, FE-03 | 1h |
| FE-08 | 状态保护：确保反复暂停/重开不产生重复计时器或监听器；清理逻辑正确 | P1 | FE-05 | 1h |

**总预估工时：20h**

### 6.2 后端开发任务

**无**。本任务为纯前端静态站点，无需后端服务。后端开发工程师已确认。

### 6.3 测试任务

直接引用 PRD 中的 6 项测试任务：

| # | 任务 | 优先级 | 依赖 | 预估工时 |
|---|------|--------|------|---------|
| QA-01 | 编写自动化单元测试：覆盖 GameEngine 的移动、方向限制、食物生成、增长与计分、墙/自身碰撞、尾格边界、满盘胜利、重开状态 | P0 | FE-02 | 3h |
| QA-02 | 编写 StorageService 测试：正常读写、异常/不可用存储降级 | P0 | FE-04 | 1h |
| QA-03 | 编写 InputHandler 测试：快速连续输入、反向限制 | P0 | FE-03 | 1h |
| QA-04 | 浏览器冒烟测试（可手动或 E2E）：开始、暂停/继续、结束与重开、记录恢复 | P1 | FE-05 | 2h |
| QA-05 | 响应式与跨浏览器测试：360px/768px/1440px 视口，至少一种 Chromium + 一种非 Chromium 浏览器 | P1 | FE-06 | 2h |
| QA-06 | 构建与部署验证：按 README 从全新检出完成安装、构建、静态服务访问 | P0 | FE-01 | 1h |

**总预估工时：10h**

---

## 7. 风险与依赖（前端视角）

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| localStorage 在某些浏览器隐私模式下不可用 | 最高分无法保存 | StorageService 做异常降级，使用内存变量兜底，不阻断游戏 |
| 手机浏览器触控事件兼容差异 | 方向按钮操作异常 | 使用 pointer 事件 + touch 事件兼容处理，测试多种手机浏览器 |
| 高像素密度屏幕 Canvas 模糊 | 视觉体验差 | 按 devicePixelRatio 缩放 Canvas，CSS 尺寸与 Canvas 内部分辨率分离 |
| 快速连续输入导致反向穿越 | 游戏逻辑错误 | 输入队列 + 每 tick 只处理一个方向变更，单元测试覆盖 |
| 反复暂停/重开导致重复计时器或监听器 | 游戏加速或内存泄漏 | pause() 时清除 setInterval，destroy() 时移除所有事件监听，单元测试覆盖 |

---

## 8. 待确认问题

经审阅产品经理 PRD 与后端开发工程师分析，**无需额外确认的问题**。所有关键决策已明确：
- 功能范围、难度档位、操作方式、存储方案、视觉风格、响应式断点
- 技术选型（Vite + TypeScript + Canvas + Vitest）
- 模块划分与接口契约

---

## 9. 交付物清单（前端开发阶段）

- 完整源码（含 TypeScript 配置、Vite 配置、ESLint/Prettier 配置）
- 依赖锁文件（package-lock.json 或 pnpm-lock.yaml）
- 自动化测试套件（Vitest）
- README.md（操作说明、安装/开发/构建/测试命令、静态部署方法、浏览器兼容范围）
- 验证记录与已知限制

---

## 10. 结论

前端需求分析完成，确认：
1. **需求清晰**：PRD 中 10 项用户故事、8 项验收标准均可通过前端实现完成
2. **技术选型合理**：Vite + TypeScript + Canvas + Vitest 满足"轻量、可静态构建"要求
3. **模块划分清晰**：GameEngine、InputHandler、StorageService、CanvasRenderer、UI 模块职责明确
4. **任务拆分合理**：前端 8 项任务 + 测试 6 项任务，优先级与依赖关系清晰
5. **无后端依赖**：纯前端静态站点，后端任务为 0
6. **风险可控**：已识别 5 项风险并提供缓解措施

**下一步**：进入前端开发阶段（SDLC Step 10002），按 FE-01 → FE-02 → FE-03 → FE-04 → FE-05 → FE-06 → FE-07 → FE-08 顺序实现。
