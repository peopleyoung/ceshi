# 贪吃蛇 · Web 街机小游戏

产品级 Web 贪吃蛇 V1：浏览器直接开玩，键盘与触屏均可操作，可构建为纯静态站点部署。

- 三档难度：休闲（200ms/格，5 分/颗）、标准（150ms/格，10 分/颗）、挑战（100ms/格，20 分/颗）
- 支持方向键 / WASD / 屏幕方向键，空格或按钮暂停，页面切到后台自动暂停
- 各难度独立最高分，保存在 localStorage，不可用时自动降级为内存存储
- 响应式适配 360 / 768 / 1440 宽度，Canvas 按 devicePixelRatio 缩放
- 无运行时依赖，产出仅静态文件（约 52 KB，gzip 后约 12 KB）

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`（Vite 8 要求），包管理器使用 npm
- 现代桌面或移动浏览器（见「浏览器兼容范围」）

## 快速开始

```bash
npm ci          # 安装依赖（按 package-lock.json 精确还原）
npm run dev     # 启动开发服务器，默认 http://localhost:5173
```

## 常用命令

| 命令                   | 说明                                    |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | 启动 Vite 开发服务器（含热更新）        |
| `npm run build`        | 类型检查 + 生产构建，产物输出到 `dist/` |
| `npm run preview`      | 本地预览已构建的 `dist/`                |
| `npm test`             | 运行全部 Vitest 用例（单次执行）        |
| `npm run test:watch`   | 监听模式运行测试                        |
| `npm run typecheck`    | `tsc --noEmit` 类型检查                 |
| `npm run lint`         | ESLint 检查                             |
| `npm run format`       | Prettier 格式化                         |
| `npm run format:check` | Prettier 格式校验（CI 用）              |

## 操作说明

| 操作         | 键盘                       | 触屏 / 鼠标                      |
| ------------ | -------------------------- | -------------------------------- |
| 改变方向     | 方向键 或 `W` `A` `S` `D`  | 屏幕方向键（窄屏或触屏设备显示） |
| 暂停 / 继续  | `空格`                     | 顶部「暂停」按钮，或暂停弹层按钮 |
| 重新开始     | 顶部「重新开始」按钮       | 同左                             |
| 返回难度选择 | 结束弹层「重新开始」等按钮 | 同左                             |

规则要点：

- 吃到果实加分并按难度计分，蛇身变长；撞墙或撞到自己即结束。
- 蛇尾在本步会移开的格子不算碰撞；若同时吃到果实（蛇尾保留），则该格视为碰撞。
- 快速连按方向键最多缓存 4 次转向，每个游戏步只消费一次，禁止 180° 反向。
- 棋盘被蛇填满即通关（victory 状态）。
- 页面切到后台或窗口失焦会自动暂停，返回后需手动继续。

## 项目结构

```
index.html                 入口 HTML（含 noscript 提示）
public/favicon.svg         站点图标
src/
  main.ts                  启动脚本：挂载应用到 #app
  app.ts                   应用装配：HUD、棋盘、弹层、输入、渲染与状态联动
  engine/
    types.ts               状态与配置类型定义
    constants.ts           难度参数、方向向量、存储键等常量
    GameEngine.ts          游戏核心：步进、碰撞、计分、计时器、最高分
  input/InputHandler.ts    键盘、触屏方向键、自动暂停事件
  renderer/CanvasRenderer.ts  Canvas 2D 渲染（棋盘、果实、蛇身、蛇头）
  storage/StorageService.ts  localStorage 读写与异常降级
  ui/                      开始界面、HUD、状态弹层、方向键、DOM 工具
  styles/main.css          主题、布局与响应式样式
tests/                     Vitest 用例（引擎、存储、输入、渲染、集成）
docs/frontend-requirements-analysis.md  前端需求分析（实现基线）
```

## 测试与质量

```bash
npm test            # 73 个用例，覆盖：
                    #  - 引擎：移动、转向队列、反向拦截、撞墙/撞自身、尾格规则、
                    #    计分与最高分、暂停/继续、计时器不重复、满盘通关
                    #  - 存储：localStorage 降级、非法值兜底、按难度隔离
                    #  - 输入：键盘映射、修饰键与输入框忽略、方向键按压、失焦自动暂停
                    #  - 渲染：无 2D 上下文时降级、devicePixelRatio 尺寸、绘制调用
                    #  - 集成：开始/暂停/结束/重开/销毁的完整交互链路
npm run typecheck   # 类型检查
npm run lint        # 代码规范
npm run format:check
npm run build       # 生产构建
```

测试通过依赖注入实现确定性：`GameEngine` 可注入调度器、随机数与初始棋盘，渲染器与输入层在 jsdom 下可无副作用运行。

除单元与集成测试外，本次交付还用真实浏览器做了冒烟验证：Chromium 151 与 Firefox 142 无头模式下，在 360 / 768 / 1440 视口完成「开始 → 移动 → 撞墙结束 → 重开 → 暂停 → 继续」全流程，校验画面确实重绘、弹层状态与 HUD 文本正确、无控制台报错。

## 静态部署

`npm run build` 后 `dist/` 即为完整静态产物，资源使用相对路径（`base: './'`），可放在任意子目录下托管：

```bash
npm run build
# 方式一：任意静态服务器
cd dist && python3 -m http.server 4173
# 方式二：Nginx
#   root /path/to/dist;  try_files $uri /index.html;
# 方式三：GitHub Pages / 对象存储 / CDN，直接上传 dist/ 内容
```

部署要点：

- 仅需提供静态文件服务，无后端接口、无环境变量。
- 相对路径使其可直接部署在 `https://host/子路径/` 下。
- 建议对 `index.html` 关闭强缓存，对 `assets/` 使用长缓存（文件名含内容哈希）。

## 浏览器兼容范围

- 目标范围：Chrome / Edge 90+、Firefox 90+、Safari 15+，以及 iOS Safari 15+ / Android Chrome 90+。
- 依赖的标准能力：ES2020、Canvas 2D、CSS `aspect-ratio`、`localStorage`、`ResizeObserver`（不可用时回退到窗口 resize 事件）。
- 可选增强：`backdrop-filter`（弹层毛玻璃）、`prefers-reduced-motion`（减弱动画），不支持时自动降级，不影响游戏功能。
- 触屏方向键在窄屏（≤767px）或粗指针设备自动显示；桌面端可用键盘操作。
- 已完成的浏览器验证：Chromium 151 与 Firefox 142（Playwright 无头模式，360 / 768 / 1440 三种视口，覆盖开始、移动、暂停、结束、重开全流程，均无控制台报错）。
- 已知限制：Safari 未做真机验证；如需覆盖 iOS / macOS Safari，建议在测试阶段补充。

## 相关文档

- 需求分析总纲（产品经理分支）：`agents/product-manager` → `docs/PRD.md`
- 后端结论：`agents/backend-developer` → `docs/backend-requirements-analysis.md`（纯前端、无后端服务）
- 前端需求分析（实现基线）：`docs/frontend-requirements-analysis.md`
