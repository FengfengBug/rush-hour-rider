# 午高峰：外卖骑手模拟器 · Rush Hour Rider

用一次配送体验，看见算法之外的真实时间。

面向 2026 Qoder 高校创造力大赛 Hack4Good 赛道的原创纯前端项目。目标是将轻量第三人称骑行、拟真骑手手机与真实配送耗时账本结合，让玩家体验骑手困境，并探索“多给 5 分钟”的影响。

## 当前阶段

Task 0.1：工程脚手架。已提供可运行的 React 启动检查页与目录骨架，尚未实现 3D 场景、骑行、订单或结算。完整任务以 [路线图](docs/ROADMAP.md) 为准，任务完成状态在截图确认后更新。

## 本地运行

需要 Node.js `^20.19.0 || >=22.12.0` 和 npm，推荐 Node.js 24 LTS。

```bash
npm ci
npm run dev
```

开发地址：<http://127.0.0.1:5173>。

```bash
npm run build
npm run preview
```

构建会先执行 `tsc --noEmit`，再生成 `dist/`；生产预览地址为 <http://127.0.0.1:4173>。

## 技术与目录边界

- Vite + React 19 + TypeScript + 原生 CSS。
- 原生 Three.js，不使用 React Three Fiber 或物理引擎。
- lucide-react 图标；后续音效使用原生 Web Audio API。
- 3D 与游戏状态只放在 `src/game/`，不依赖 React；界面放在 `src/components/`，后续通过 10–15Hz 节流快照连接。
- 只使用程序化几何体与 Canvas 贴图，不加载外部模型、图片或音频资产。

```text
src/
  game/             纯 TypeScript 游戏层（当前为空）
  components/       React 界面与工程启动检查
  styles/base.css   全局基础样式
  App.tsx           应用根组件
  main.tsx          React StrictMode 入口
docs/
  ROADMAP.md        原子任务与验收标准
  DEVLOG.md         截图确认后追加的开发日志
  screenshots/      开发证据截图
```

## 协作与发布

每次只推进一个原子任务，并进行构建和浏览器实机验收。收到截图与“记录这条”确认后，才归档截图、更新日志及路线图、提交并推送。

GitHub 目标仓库：<https://github.com/FengfengBug/rush-hour-rider>。计划于 2026-11-28 部署到 Qoder Sites 并开放公开访问；当前尚未部署。
