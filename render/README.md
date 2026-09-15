# TraceFlow · 代码调用链可视化

TraceFlow 是一个将代码逻辑调用链以**可交互树形图**呈现的可视化工具。它消费一份描述函数调用关系的 JSON 数据（通常由 AI 分析生成），渲染出从左到右的可折叠调用链，并支持点击节点查看函数详情与源码片段。

![技术栈](https://img.shields.io/badge/Vue-3.4-4FC08D?logo=vue.js&logoColor=white) ![技术栈](https://img.shields.io/badge/Vite-5.3-646CFF?logo=vite&logoColor=white)

## 特性

- **调用链可视化**：将扁平化 JSON 自动构建为树形图，按 `associatedId` 建立父子关系，水平方向从左到右布局。
- **三种关联类型**：以颜色与线型区分 `call`（蓝·实线）、`return`（绿·虚线）、`indirect`（橙·点线）。
- **折叠/展开**：节点可逐级展开或收起，支持「全部展开」「收起」以及「仅显示关键代码」。
- **交互流畅**：拖拽平移、滚轮缩放、适配画布、搜索高亮（函数名/摘要/文件路径）。
- **详情面板**：展示函数摘要、调用方、代码片段意图（snippetIntents），并支持一键跳转到关联函数。
- **源码高亮**：通过 dev-server 的 `/api/source` 接口读取被分析项目源码，按行截取并高亮（highlight.js）。
- **前后端分层标识**：根据 `filepath` 自动识别 `frontend` / `backend` 层级。
- **多数据源**：数据由服务端在运行时读取 `data/` 目录（新写入的文件无需重启即可选择），支持 URL 参数 `?data=<文件名>` 自动加载，也可通过「加载 JSON」按钮选择本地文件。
- **一键渲染**：`npm run serve`（即 `scripts/serve.mjs`）自动完成安装依赖、构建静态产物、启动服务并打开浏览器，适合与 AI 分析流水线串联。

## 快速开始

### 环境要求

- **渲染运行**：仅需 Node.js 18+（`scripts/serve.mjs` 零依赖，`dist/` 静态产物已随仓库提供，无需 `npm install`）
- **开发调试**：需要 npm（执行 `npm install` 后可使用 `npm run dev` / `npm run build`）

### 渲染运行（推荐用于 AI 分析结果展示）

```bash
# 启动静态服务（默认端口 4173），随后自动打开浏览器，无需安装任何依赖
npm run serve

# 指定自动加载的数据文件（须位于 data/ 目录）
node scripts/serve.mjs --data homework-detail.json

# 其他选项
node scripts/serve.mjs --port 5174   # 指定端口
node scripts/serve.mjs --rebuild     # 渲染器代码更新后重新构建（需要开发环境）
node scripts/serve.mjs --no-open     # 只启动服务，不自动打开浏览器

# 停止服务（关闭由 serve.mjs 启动的服务）
node scripts/stop.mjs              # 停止默认端口 4173 的服务
node scripts/stop.mjs --port 5174  # 停止指定端口的服务
```

### 开发调试

```bash
# 安装依赖
npm install

# 启动开发服务器（默认端口 5173，支持热更新）
npm run dev
```

浏览器打开 `http://localhost:5173` 即可看到界面。

### 其他命令

```bash
# 构建生产版本（构建后需提交 dist 以便渲染运行零依赖）
npm run build

# 预览构建产物
npm run preview
```

## 配置源码查看

详情面板的「源码」区需要读取被分析项目的本地源码，通过服务端接口 `GET /api/source?id=<nodeId>[&file=<数据文件名>]` 实现（见 `scripts/get-source.mjs`，dev 与 serve 模式均可用）。

被分析项目根路径 `projectRoot` **只从数据 JSON 顶层的 `projectRoot` 元信息读取**，无需任何额外配置：

```json
{
  "projectRoot": "D:/Projects/my-homework-grading",
  "nodes": [ ... ]
}
```

> 数据未携带 `projectRoot` 时树图仍可正常展示，仅源码面板提示「源码不可用」。

## 数据格式

`data/` 目录下存放描述调用链的 JSON。顶层支持两种形式：

**形式一：对象（推荐，可携带 projectRoot 元信息）**

```json
{
  "projectRoot": "D:/Projects/my-homework-grading",
  "nodes": [ ... ]
}
```

**形式二：纯数组（兼容旧格式）**

`nodes` 中每个元素代表一个函数或方法：

```json
[
  {
    "id": "1",
    "name": "submitHomework",
    "filepath": "homework-grading-frontend/js/pages/submit.js",
    "line": "#L239-L295",
    "oneLineSummary": "「单图提交批改」入口：校验图片 → 上传提交 → 成功后缓存预览并跳转详情页",
    "snippetIntents": [
      {
        "content": "组装 FormData 并发起提交请求",
        "line": "#L252-L257",
        "associatedId": "6",
        "associatedType": "call",
        "associatedRequired": true
      }
    ]
  }
]
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `projectRoot` | string | 被分析项目的根目录绝对路径（对象形式顶层字段，`filepath` 相对它解析，用于源码面板） |
| `id` | string | 函数/方法的唯一标识 |
| `name` | string | 函数或方法名 |
| `filepath` | string | 源码文件路径（相对被分析项目根目录） |
| `line` | string | 行号范围，如 `#L239-L295` 或 `#L102` |
| `oneLineSummary` | string | 一句话总结该函数的作用 |
| `snippetIntents` | array | 该函数内部各代码片段的作用说明 |

`snippetIntents` 子字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content` | string | 该代码片段的作用/内容 |
| `line` | string | 所在行号范围 |
| `associatedId` | string \| null | 关联的函数 id，无关联为 `null` |
| `associatedType` | `"call"` \| `"return"` \| `"indirect"` \| null | 关联方式：仅调用 / 调用并使用返回值 / 间接关联 |
| `associatedRequired` | boolean | 是否与该功能核心相关（`false` 的节点可被「仅显示关键代码」过滤） |

> 完整的数据生成规范（提示词）见 [`SKILL.md`](../SKILL.md)。

## 目录结构

```
demo/
├── data/                  # 调用链数据（扁平 JSON 数组，运行时由服务端动态读取）
├── scripts/
│   ├── get-source.mjs     # 根据节点 id 读取并截取被分析项目源码
│   └── serve.mjs          # 渲染控制脚本：按需安装/构建 → 启动静态服务 → 打开浏览器
├── src/
│   ├── App.vue            # 主应用：顶栏、搜索、数据加载（含 URL ?data= 参数）
│   ├── graph.js           # 图数据构建 + 可折叠树形布局
│   ├── main.js            # 入口
│   ├── style.css          # 全局样式与主题变量
│   └── components/
│       ├── TraceTree.vue  # 调用链树形可视化（SVG 边 + 节点卡片）
│       └── DetailPanel.vue  # 详情面板（源码高亮 + 片段意图）
├── index.html
└── vite.config.js         # Vite 配置 + /api/source、/api/datalist、/data 中间件（dev 与 preview 共用）
```

## 技术栈

- [Vue 3](https://vuejs.org/)（`<script setup>` 组合式 API）
- [Vite](https://vitejs.dev/)
- [highlight.js](https://highlightjs.org/)（源码语法高亮）

## License

Private / 未指定许可证。
