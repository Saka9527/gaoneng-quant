const SRC = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reactflow@11.11.4/dist/style.css" />
<style>
  html, body, #root { margin: 0; height: 100%; background: #0b1220; color: #e5e7eb; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
  .wrap { display: grid; grid-template-columns: minmax(0, 1fr) 260px; height: 100vh; }
  .canvas { min-width: 0; min-height: 0; height: 100%; }
  .react-flow { width: 100%; height: 100%; }
  .react-flow__node { visibility: visible !important; }
  .side { border-left: 1px solid rgba(255,255,255,.08); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .kicker { font-size: 12px; color: #93c5fd; }
  .title { font-size: 16px; font-weight: 650; }
  .body { font-size: 13px; line-height: 1.55; color: #cbd5e1; }
  .nav { display: flex; gap: 8px; margin-top: auto; }
  button { font: inherit; color: inherit; background: transparent; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  .node { border-radius: 12px; padding: 10px 12px; min-width: 148px; background: #111827; border: 1px solid rgba(255,255,255,.14); }
  .node.on { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
  .node .k { font-size: 11px; color: #93c5fd; }
  .node .t { font-size: 14px; font-weight: 650; margin-top: 2px; }
  .node .s { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .react-flow__attribution { display: none; }
</style>
</head>
<body>
<div id="root">正在加载流程…</div>
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reactflow@11.11.4/dist/umd/index.js"></script>
<script>
const React = window.React;
const { ReactFlow, Background, Controls, Handle, Position } = window.ReactFlow;

const steps = ["config", "result", "run", "engine", "screen", "trades"];
const meta = {
  config: { kicker: "1", title: "工作台配置", sub: "候选池 + 交易模型", body: "配置候选池和交易模型，由 collectPortfolioConfig() 收集，然后进入结果页。" },
  result: { kicker: "2", title: "结果页", sub: "#/backtest/result", body: "打开 #/backtest/result。首屏展示指标和净值，成交表再按页从内存读取。" },
  run: { kicker: "3", title: "同步回测", sub: "POST /portfolio/run", body: "POST /api/v1/portfolio/run，在当前请求里跑完。/submit 同样在当前请求内跑完。" },
  engine: { kicker: "4", title: "组合撮合引擎", sub: "PortfolioEngine", body: "日频撮合。净值、成交和期末持仓留在进程内存，bt_job 只写任务摘要。" },
  screen: { kicker: "5", title: "指标与净值", sub: "首屏", body: "首屏返回指标和净值曲线。" },
  trades: { kicker: "6", title: "成交分页", sub: "GET /jobs/{id}/trades", body: "结果页表格按 GET /jobs/{id}/trades?limit=50&offset= 从本进程内存分页。" },
  cache: { kicker: "内存", title: "reportCache", sub: "净值 · 成交 · 持仓", body: "净值曲线、逐笔成交、期末持仓都在进程内存。成交分页读这里。" },
  job: { kicker: "落库", title: "任务摘要", sub: "bt_job", body: "result_json 保存收益、耗时和拒单次数。曲线和成交写成空数组。" }
};
const positions = {
  config: { x: 0, y: 20 }, result: { x: 230, y: 20 }, run: { x: 460, y: 20 }, engine: { x: 690, y: 20 },
  job: { x: 0, y: 210 }, cache: { x: 230, y: 210 }, screen: { x: 460, y: 210 }, trades: { x: 690, y: 210 }
};
const links = [
  ["config", "result"], ["result", "run"], ["run", "engine"], ["engine", "screen"], ["screen", "trades"],
  ["engine", "cache"], ["engine", "job"]
];

function StepNode({ data }) {
  return React.createElement("div", { className: "node" + (data.on ? " on" : "") },
    React.createElement(Handle, { type: "target", position: Position.Left }),
    React.createElement("div", { className: "k" }, data.kicker),
    React.createElement("div", { className: "t" }, data.title),
    React.createElement("div", { className: "s" }, data.sub),
    React.createElement(Handle, { type: "source", position: Position.Right, id: "r" }),
    React.createElement(Handle, { type: "source", position: Position.Bottom, id: "b" })
  );
}
const nodeTypes = { step: StepNode };

function App() {
  const [active, setActive] = React.useState("config");
  const index = steps.indexOf(active);
  const nodes = Object.keys(meta).map((id) => ({
    id, type: "step", position: positions[id], data: { ...meta[id], on: id === active }
  }));
  const edges = links.map(([source, target], i) => ({
    id: "e" + i, source, target, sourceHandle: target === "cache" || target === "job" ? "b" : "r",
    style: { stroke: source === active || target === active ? "#60a5fa" : "#475569" }
  }));
  const item = meta[active];
  return React.createElement("div", { className: "wrap" },
    React.createElement("div", { className: "canvas" },
      React.createElement(ReactFlow, {
        nodes, edges, nodeTypes, fitView: true, minZoom: 0.4, maxZoom: 1.5,
        proOptions: { hideAttribution: true },
        onNodeClick: (_, node) => setActive(node.id)
      }, React.createElement(Background, { color: "#1e293b", gap: 18 }), React.createElement(Controls, null))
    ),
    React.createElement("aside", { className: "side" },
      React.createElement("div", { className: "kicker" }, item.kicker),
      React.createElement("div", { className: "title" }, item.title),
      React.createElement("div", { className: "body" }, item.body),
      React.createElement("div", { className: "nav" },
        React.createElement("button", { type: "button", disabled: index <= 0, onClick: () => setActive(steps[index - 1]) }, "上一步"),
        React.createElement("button", { type: "button", disabled: index < 0 || index >= steps.length - 1, onClick: () => setActive(steps[index + 1]) }, "下一步")
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
</script>
</body>
</html>`;

export const BacktestFlow = () => (
  <iframe
    title="组合回测产品流程"
    sandbox="allow-scripts"
    srcDoc={SRC}
    style={{
      width: "100%",
      height: 560,
      border: "1px solid rgba(127,127,127,.35)",
      borderRadius: 12,
      background: "#0b1220",
    }}
  />
);
