# ceshi

网页版贪吃蛇（零构建、零第三方依赖）。

## 运行

直接用浏览器打开 `index.html` 即可游玩，无需安装依赖、无需启动服务，断网可玩。

键盘：方向键 / WASD 转向，空格暂停，Enter 或 R 重开。触屏：在棋盘上滑动转向。

## 目录

- `index.html`：页面结构、样式、Canvas 渲染与输入处理。
- `js/snake.js`：游戏规则内核，纯逻辑，不访问 DOM 与存储；同时支持浏览器全局与 Node `require`。
- `test/snake.test.js`：核心规则的 Node 断言，`node test/snake.test.js` 运行。

最高分保存在浏览器 `localStorage` 的 `snake.highscore` 键中，清除该键即归零。
