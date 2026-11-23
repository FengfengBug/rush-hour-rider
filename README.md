# 午高峰：外卖骑手模拟器 · Rush Hour Rider

用一次配送体验，看见算法之外的真实时间。

面向 2026 Qoder 高校创造力大赛 Hack4Good 赛道的原创纯前端项目。目标是将轻量第三人称骑行、拟真骑手手机与真实配送耗时账本结合，让玩家体验骑手困境，并探索“多给 5 分钟”的影响。

## 当前阶段（2026-11-23）

Task 0.1–5.2 与赛前 polish1–6 已完成：第三人称骑行、8×8 微缩中国街区、抢单/取送/现场事件、阵雨天气、骑手手机、《算法时间账本》、“多给 5 分钟”反事实滑块、PNG 战报、暂停与触屏兜底均已实机验收。

polish6 将平台限时延长并计入进楼/门禁时间，事件对非当事单只计 50% 连带等待；用户实机复测 **5 单完成、3 单准时（60%）**，暂不再调整时间参数。

计划 **2026-11-27** 部署 Qoder Sites，11-30 中午前完成天池提交；公网地址待部署后写入本文。完整任务以 [路线图](docs/ROADMAP.md) 为准，过程记录见 [DEVLOG](docs/DEVLOG.md)。

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
- lucide-react 图标；音效使用原生 Web Audio API 程序化合成。
- 3D 与游戏状态只放在 `src/game/`，不依赖 React；界面放在 `src/components/`，两者通过 10–15Hz 节流快照连接。
- 只使用程序化几何体与 Canvas 贴图，不加载外部模型、图片或音频资产。

```text
src/
  game/             纯 TypeScript 游戏层（引擎、城市、骑手、订单、事件、天气、音频）
  components/       React HUD、骑手手机、事件卡、结算与触屏控件
  styles/base.css   全局基础样式
  App.tsx           应用根组件
  main.tsx          React StrictMode 入口
docs/
  ROADMAP.md        原子任务、验收标准与协作协议
  POLISH_PLAN.md    赛前 6 天深度打磨方案
  DEVLOG.md         开发日志（指定截图任务附截图）
  screenshots/      开发证据截图
```

## 协作与发布

每次只推进用户指定的一个任务，并执行 `npm run build` + 浏览器实机验收。任务完成后自动更新必要的 DEVLOG/ROADMAP，并 commit/push 到 GitHub；只有用户明确指定“需要截图”的任务才主动截图归档，其余小改动只提交代码与必要文档，不主动截图。

GitHub 仓库：<https://github.com/FengfengBug/rush-hour-rider>。计划于 **2026-11-27** 部署到 Qoder Sites 并开放公开访问；当前尚未部署。
