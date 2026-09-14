# Trace Flow · Skill 使用文档

Trace Flow 是一个「代码逻辑与调用链分析 + 可视化」的 AI Skill。给定一个功能描述（功能名、入口函数或代码片段），它会分析出该功能**完整的代码逻辑与上下游调用链路**，生成结构化 JSON 数据，并自动启动渲染器，在浏览器中呈现一张**可交互的调用链树图**。

---

## 目录

- [它能做什么](#它能做什么)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [输入方式](#输入方式)
- [输出与数据格式](#输出与数据格式)
- [渲染与交互](#渲染与交互)
- [常见问题](#常见问题)

---

## 它能做什么

- **调用链梳理**：从入口函数出发，逐层展开其内部调用、间接依赖、返回值使用等下游函数，覆盖前后端完整链路。
- **请求路径追踪**：当遇到请求方法且前后端代码均可见时，沿请求路径继续分析后端上游/下游。
- **结构化输出**：生成一份扁平化的 JSON 数据，描述每个函数/方法的摘要、位置与代码片段意图。
- **可视化渲染**：将 JSON 渲染为从左到右的可折叠调用链树，支持节点详情、源码高亮、搜索与关键代码过滤。

---

## 目录结构

```
trace-flow/
├── SKILL.md                # Skill 定义文件（分析提示词与数据规范）
├── README.md               # 本文档
├── examples/               # 模拟真实项目（前端 + 后端），用于演示分析过程
│   ├── frontend/           # 模拟前端代码
│   ├── backend/            # 模拟后端代码
│   └── output/             # 分析结果示例 data.json
├── validate/               # JSON 校验脚本（零依赖）
│   └── validate.mjs        # 校验调用链数据是否符合 SKILL.md 的结构与约束
└── render/                 # 渲染器项目（Vue 3 + Vite）
    ├── data/               # 调用链数据（运行时由服务端动态读取）
    ├── dist/               # 静态构建产物（随仓库提供，渲染零依赖）
    ├── scripts/
    │   ├── serve.mjs       # 渲染控制脚本：安装/构建 → 启动服务 → 打开浏览器
    │   └── get-source.mjs  # 读取被分析项目源码片段
    └── src/                # 渲染器前端源码
```

---

## 环境要求

| 场景 | 依赖 |
| --- | --- |
| 渲染运行（推荐） | 仅需 **Node.js 18+**（`dist/` 静态产物已随仓库提供，零依赖） |
| 开发调试 | 需要 npm（`npm install` 后可用 `npm run dev` / `npm run build`） |

---

## 快速开始

### 0. 安装位置（以 CodeBuddy 为例）

在 CodeBuddy 中，Skill 需放置在特定的 `skills` 目录下才能被识别与加载。本 Skill 的整个目录（含 `SKILL.md`、`render/` 渲染器、`examples/` 示例）应整体放入以下位置之一：

- **项目级（仅当前工程可用）**：工作区根目录下的 `.codebuddy/skills/`

  ```
  <项目根>/
  └── .codebuddy/
      └── skills/
          └── trace-flow/        # 本 Skill 的根目录
              ├── SKILL.md
              ├── README.md
              ├── examples/
              └── render/
  ```

- **用户级（所有工程通用）**：用户主目录下的 `.codebuddy/skills/`（Windows 通常为 `C:\Users\<用户名>\.codebuddy\skills\`）

  ```
  C:\Users\<用户名>\.codebuddy\skills\trace-flow\
  ├── SKILL.md
  ├── README.md
  ├── examples/
  └── render/
  ```

> 放置完成后，CodeBuddy 会自动识别项目级与用户级 Skill，可在设置中的「Skills」管理页查看，无需额外启用。

### 1. 触发 Skill

在对话中直接描述你的分析需求，Skill 会被自动触发。无需手动指定入口文件，给出功能名或代码片段即可。

### 2. 分析流程

Skill 会按以下方式自动推进，无需你逐步干预：

1. **确定入口**：找到最上游的入口函数/方法（如初始化方法、点击事件处理函数等）。
2. **逐层展开**：识别内部调用、间接依赖、返回值使用等下游函数，逐个入队分析。
3. **请求链路**：遇到请求方法时，沿请求路径继续分析后端上下游。
4. **完整覆盖**：遍历整条调用链，不遗漏任何下游函数。
5. **生成数据**：产出结构化 JSON，写入 `render/data/<功能名>.json`。
6. **校验数据**：运行 `node validate/validate.mjs render/data/<功能名>.json` 校验结构与约束，不通过则中断流程并输出原因。
7. **启动渲染**：自动启动服务并打开浏览器展示树图。

### 3. 查看结果

分析完成后浏览器会自动打开调用链树图。你可以：

- 点击节点查看函数详情与源码
- 使用搜索、折叠/展开、「仅显示关键代码」等交互能力
- 若未自动打开，访问 `http://localhost:4173/?data=<功能名>.json`

---

## 输入方式

支持以下几种输入形式，任选其一：

### 方式一：自然语言描述

```
梳理 "展示作业详情" 功能的代码逻辑
```

### 方式二：给定入口函数名

```
分析 submitHomework 函数的调用链路
```

### 方式三：给出代码片段

```
分析
{
  "file_path": "./examples/frontend/detail.js",
  "line": "#L6-L17",
  "content": "async function loadDetail() { ... }"
}
的调用链路
```

### 方式四：请求路径链路

```
梳理 GET /api/homework/detail 的前后端完整调用链
```

---

## 输出与数据格式

分析结果会写入 `render/data/<功能名>.json`，顶层为对象，包含被分析项目的元信息与函数数组：

```json
{
  "projectRoot": "D:/Projects/my-project",
  "nodes": [
    {
      "id": "1",
      "name": "submitHomework",
      "filepath": "js/pages/submit.js",
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
}
```

### 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `projectRoot` | string | 被分析项目的根目录**绝对路径**（`filepath` 相对它解析，用于源码面板） |
| `id` | string | 函数/方法的唯一标识（从 `'1'` 递增，字符串类型） |
| `name` | string | 函数或方法名 |
| `filepath` | string | 源码文件路径（相对被分析项目根目录） |
| `line` | string | 行号范围，如 `#L239-L295` 或 `#L102` |
| `oneLineSummary` | string | 一句话总结该函数的作用 |
| `snippetIntents` | array | 该函数内部各代码片段的作用说明 |

### `snippetIntents` 子字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content` | string | 该代码片段的作用/内容 |
| `line` | string | 所在行号范围 |
| `associatedId` | string \| null | 关联的函数 id，无关联为 `null` |
| `associatedType` | `call` \| `return` \| `indirect` \| null | 关联方式 |
| `associatedRequired` | boolean | 是否与功能核心相关（`false` 的节点可被「仅显示关键代码」过滤） |

`associatedType` 取值含义：

- `call`：仅调用该关联函数（蓝·实线）
- `return`：调用后使用其返回值（绿·虚线）
- `indirect`：间接关联（如通过请求路径/中间件间接触发，橙·点线）
- `null`：无关联函数

---

## 渲染与交互

渲染器位于 `render/` 目录，默认由 Skill 自动启动。如需手动启动：

```bash
cd render

# 启动静态服务并自动打开浏览器（默认端口 4173）
node scripts/serve.mjs --data homework-detail.json

# 指定端口
node scripts/serve.mjs --port 5174 --data homework-detail.json

# 渲染器代码更新后重新构建（需要开发环境）
node scripts/serve.mjs --rebuild --data homework-detail.json

# 只启动服务，不自动打开浏览器
node scripts/serve.mjs --no-open --data homework-detail.json
```

> `serve.mjs` 会以前台方式持有服务进程。在 AI 环境中应将脚本放到后台运行，不要等待其退出。

### 渲染器主要能力

- **调用链可视化**：按 `associatedId` 建立父子关系，水平从左到右布局。
- **三种关联类型**：以颜色与线型区分 `call` / `return` / `indirect`。
- **折叠/展开**：逐级展开或收起，支持「全部展开」「收起」「仅显示关键代码」。
- **交互流畅**：拖拽平移、滚轮缩放、适配画布、搜索高亮（函数名/摘要/文件路径）。
- **详情面板**：函数摘要、调用方、代码片段意图，支持一键跳转到关联函数。
- **源码高亮**：通过 `/api/source` 接口读取被分析项目源码，按行截取并高亮。
- **前后端分层**：根据 `filepath` 自动识别 `frontend` / `backend` 层级。
- **多数据源**：运行时读取 `data/` 目录，新写入的文件无需重启即可选择。

---

## 常见问题

**Q1：浏览器没有自动打开怎么办？**
手动访问 `http://localhost:4173/?data=<功能名>.json` 即可。

**Q2：端口被占用？**
加 `--port <其他端口>` 重试。

**Q3：修改了渲染器代码，但界面没更新？**
加 `--rebuild` 重新构建（需已执行过 `npm install`）。

**Q4：详情面板显示「源码不可用」？**
检查数据 JSON 顶层的 `projectRoot` 是否为被分析项目的**绝对路径**，且 `filepath` 相对该路径正确。

**Q5：渲染运行需要安装依赖吗？**
不需要。`dist/` 静态产物已随仓库提供，`serve.mjs` 基于 Node 内置模块实现，仅需 Node.js 18+。

**Q6：数据文件能即时生效吗？**
可以。服务端在运行时动态读取 `render/data/` 目录，新写入的文件无需重启即可在「加载 JSON」列表中选择。

---

## 注意事项

- 数据文件内容必须是合法的 JSON，不要包含 JSON 之外的说明文字。
- 每个 `id` 必须唯一，且为字符串类型；`associatedId` 必须为已存在的 `id` 或 `null`。
- `associatedId` 为 `null` 时，`associatedType` 必须为 `null`，`associatedRequired` 必须为 `false`。
- 同一行代码调用多个函数时，应为每个被调函数新增一个独立的 `snippetIntents` 条目（行号相同）。
- 行号需确保精确，否则详情面板源码定位会偏移。
- 渲染前必须先通过 `node validate/validate.mjs render/data/<功能名>.json` 校验，不通过则中断并修正后重试。
