# 思维导图可视化模式

## Context

当前页面管理（状态名、描述、分组）全部通过表单编辑。需要添加一种思维导图可视化模式，让用户以直观的方式查看和编辑页面结构：
- 一级节点：项目名
- 二级节点：分组（含未分组）
- 三级节点：页面文件（stateName）
- 支持：内联编辑名称、查看/编辑描述、拖拽改变分组

## 技术方案

- **渲染方式**：HTML/CSS 节点 + SVG 贝塞尔曲线连线（无需额外依赖）
- **布局方式**：全屏 Overlay 覆盖 `.app` 容器（与现有 Drawer 模式一致）
- **树方向**：水平树（从左到右：项目 → 分组 → 文件）
- **数据同步**：直接读写 Zustand store，不维护独立数据副本

## Task 1: 添加 mindmap 图标和 store action

**修改文件：**
- `frontend/src/components/common/Icon.jsx` - 在 ICONS 对象中添加 `mindmap` 图标
- `frontend/src/lib/state.js` - 添加 `moveFileToGroup(filePaths, targetGroupId)` action

## Task 2: 创建布局 Hook `useMindMapLayout.js`

**新建文件：** `frontend/src/components/mindmap/useMindMapLayout.js`

- 从 `pagesConfig` 构建树结构数据
- 水平树布局算法：ROOT_X=60, GROUP_X=300, FILE_X=560
- 管理 collapsedGroups（本地 UI 状态）
- 返回 `{ nodes, connections, collapsedGroups, toggleGroup }`

## Task 3: 创建 MindMapNode 组件

**新建文件：** `frontend/src/components/mindmap/MindMapNode.jsx`

三种节点类型通过 `type` prop 区分：
- `project`：大号渐变节点，显示项目名
- `group`：中号节点，左侧颜色条，显示分组名 + 文件计数，可折叠/展开
- `file`：小号节点，显示 stateName，带 devStatus 指示点

交互：
- 双击进入编辑模式（替换为 `<input>`，回车/失焦提交到 store）
- 文件节点支持 `draggable` 拖拽
- 分组节点作为 drop target
- Hover 显示 description tooltip
- 单击文件节点调用 `setCurrentFile(path)`

## Task 4: 创建 MindMapConnections 组件

**新建文件：** `frontend/src/components/mindmap/MindMapConnections.jsx`

- 接收 connections 数组 `[{from:{x,y}, to:{x,y}, color}]`
- 渲染 SVG `<path>` 贝塞尔曲线
- 颜色使用分组颜色

## Task 5: 创建 MindMapCanvas 组件

**新建文件：** `frontend/src/components/mindmap/MindMapCanvas.jsx`

- 使用 `ref` 收集所有子节点 DOM 坐标
- 通过 `requestAnimationFrame` 计算连线端点坐标
- 应用 `transform: translate(...) scale(...)` 实现平移缩放

## Task 6: 创建 MindMapOverlay 容器

**新建文件：** `frontend/src/components/mindmap/MindMapOverlay.jsx`

- 全屏定位容器 + 顶部工具栏
- 工具栏：关闭按钮、缩放控制（+/-/滑块）、全部展开/折叠、适应屏幕
- 鼠标滚轮缩放 + 空格键拖拽平移
- 缩放范围 25%~200%

## Task 7: 添加脑图 CSS 样式

**修改文件：** `frontend/src/styles/app.css`

在末尾添加脑图样式（~150行），包括：
- `.mindmap-overlay` 全屏容器
- `.mindmap-toolbar` 工具栏
- `.mindmap-canvas` 画布
- `.mindmap-node` 三种节点类型样式
- `.mindmap-node-edit` 编辑态 input
- `.mindmap-connections` SVG 连线层
- `.mindmap-tooltip` 描述提示
- 拖拽 drop target 高亮

## Task 8: 集成到 App 和 Sidebar

**修改文件：**
- `frontend/src/App.jsx` - 添加 `mindMapOpen` 状态和 `MindMapOverlay` 渲染
- `frontend/src/components/layout/Sidebar.jsx` - 在 header 添加脑图切换按钮

## 验证方式

1. `cd frontend && npm run dev` 启动开发服务器
2. 在 Sidebar 点击脑图按钮，确认全屏 Overlay 打开
3. 验证节点显示：项目名（根）→ 分组（二级）→ 文件（三级）
4. 双击文件节点编辑 stateName，关闭编辑后确认 Sidebar 同步更新
5. 拖拽文件节点到不同分组，确认 Sidebar 分组关系同步
6. 测试折叠/展开分组
7. 测试缩放/平移操作
8. 关闭脑图 Overlay，确认回到正常视图
