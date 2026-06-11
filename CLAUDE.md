# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Page Studio is a web-based tool that converts design HTML exports (from tools like 蓝湖/Lanhu) into structured AI prompts for generating Flutter or React Native code.

## Commands

```bash
npm install      # Install dependencies
npm start        # Start server on port 3000
npm run dev      # Start with auto-open browser
```

## Architecture

### Backend Structure
```
├── server.js           # Main entry, Express server, WebSocket
├── db.js               # SQLite database module
└── api/
    ├── utils.js        # Shared utilities (upload, extractZip, etc.)
    ├── projects.js     # Project management APIs
    ├── pages.js        # Pages config APIs
    ├── html.js         # HTML scan/analyze APIs
    ├── image.js        # Image upload/replace APIs
    ├── psd.js          # PSD scan/preview/slice APIs
    ├── sessions.js     # Session (conversation) APIs
    ├── prompt.js       # Prompt generation route (thin)
    └── prompt/         # Prompt builders
        ├── index.js                  # Builder factory (by target framework)
        ├── BasePromptBuilder.js      # Shared prompt assembly logic
        ├── FlutterPromptBuilder.js
        ├── ReactNativePromptBuilder.js
        └── UniAppPromptBuilder.js
```

### Server (`server.js`)
Lightweight entry point:
- Express middleware setup
- Static file serving: Vite build output (`frontend_dist` / `frontend/dist`) + `/html/:projectId`
- SPA fallback to `index.html` for non-API/non-html routes
- WebSocket server for hot-reload
- File watcher (chokidar) for HTML/PSD changes
- Mounts API routers from `api/` directory

> 旧的 `public/` 纯 HTML 前端已删除；前端只走 Vite 构建产物。若未构建，server 启动时会打印告警。

### Database (`db.js`)
SQLite database module using `better-sqlite3`:
- **Tables**:
  - `projects`: id, name, description, created_at, updated_at, is_current
  - `project_pages`: id, project_id, pages_json, updated_at
- **Projects API**: getAll, getCurrent, getById, create, update, delete, setCurrent, getPagesJson, savePagesJson

### API Modules (`api/`)

**utils.js** - Shared utilities:
- `HTML_CACHES_DIR` - Path to html_caches directory
- `upload` - Multer middleware for ZIP upload
- `getCurrentProject()` - Get current project from DB
- `getHtmlDir()` - Get HTML directory path
- `extractZipToDir()` - Extract ZIP with hidden file filtering

**projects.js** - Project management:
- `GET /api/config` - Get configuration with project list
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get single project
- `POST /api/projects` - Create project (multipart: name, description, htmlZip)
- `PUT /api/projects/:id` - Update project info
- `POST /api/projects/:id/html` - Replace project HTML (multipart: htmlZip)
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/activate` - Set as current project
- `GET /api/browse` - Browse filesystem directories

**pages.js** - Pages configuration:
- `GET /api/pages` - Get pages.json for current project
- `POST /api/pages` - Save pages.json for current project

**html.js** - HTML scanning and analysis:
- `GET /api/scan-html` - Scan HTML files in current project
- `GET /api/html-content` - Read HTML content
- `GET /api/analyze-html` - Analyze HTML structure (colors, interactive elements)
- `GET /api/extract-images` - Extract image paths from HTML
- `POST /api/copy-images` - Copy images to project assets directory

**image.js** - Image handling:
- Upload / replace image assets within a project

**psd.js** - PSD handling:
- Scan PSD files, generate previews, and produce slices for the design workflow

**sessions.js** - Sessions:
- Conversation/session records associated with prompt generation

**prompt.js + prompt/** - Prompt generation:
- `POST /api/generate-prompt` - Generate AI development prompt
- The route is thin; actual assembly lives in `api/prompt/`. `index.js` picks a builder by target framework (Flutter / React Native / UniApp), all extending `BasePromptBuilder`.

### HTML Storage
Project HTML files are stored in `html_caches/{project_id}/` directory, uploaded as ZIP files.

### Frontend Structure

前端为 Vite + React 实现，源码全部位于 `frontend/src`。

```
frontend/
├── index.html                  # Vite 入口 HTML
├── src/
│   ├── main.jsx                # React 入口（路由挂载）
│   ├── App.jsx                 # 应用外壳（主题、全局 Modal、路由）
│   ├── pages/
│   │   ├── HomePage.jsx        # 项目列表首页
│   │   ├── HomePageModals.jsx  # 首页相关弹窗
│   │   ├── DashboardPage.jsx   # 工作台（三栏：Sidebar/Preview/Config）
│   │   └── DashboardModals.jsx # 工作台相关弹窗
│   ├── components/
│   │   ├── common/
│   │   │   ├── Icon.jsx        # SVG 图标组件（ICONS 数据 + <Icon> 组件，自带）
│   │   │   └── Toast.jsx       # Toast 提示组件
│   │   ├── layout/
│   │   │   ├── Header.jsx      # 顶部工具栏
│   │   │   ├── Sidebar.jsx     # 左侧文件列表（含搜索、分组、筛选）
│   │   │   ├── PreviewPanel.jsx# 中间预览面板（iframe + 缩放控制）
│   │   │   └── ConfigPanel.jsx # 右侧配置面板（页面配置、交互/切图/功能描述、TabBar）
│   │   ├── modals/             # 弹窗集合（项目、分组、提示词、图片上传、设计系统抽屉、确认框等）
│   │   ├── picker/             # ElementStylesPanel（元素样式）、ImageRegionSelector（区域选择）
│   │   ├── psd/                # PSD 切图：PSDCanvas、LayerPanel、SlicesPanel
│   │   └── mindmap/            # 页面思维导图：MindMapCanvas/Overlay/Node/Connections + useMindMapLayout
│   ├── hooks/
│   │   ├── useTheme.js         # 主题切换 Hook
│   │   ├── useWebSocket.js     # WebSocket 热更新 Hook
│   │   └── useWorkspaceController.js # 工作台全部交互逻辑（iframe/picker/PSD/保存下载，集中式）
│   ├── lib/
│   │   ├── api.js              # API 请求封装
│   │   ├── picker.js           # Picker/ColorPicker（直接操作 iframe.contentDocument）
│   │   ├── psdUtils.js         # PSD 图层扁平化、切图导出等工具
│   │   ├── clipboard.js        # 剪贴板封装
│   │   └── state.js            # Zustand 全局状态管理
│   └── styles/
│       └── app.css             # 全局样式（含主题变量）
```

### Key Data Structures

**Projects** (SQLite `projects` table):
- `id`: Project ID (auto-increment)
- `name`: Project name
- `description`: Optional description
- `is_current`: 1 if this is the active project

**Pages Config** (SQLite `project_pages` table, stored as JSON):
- `pageGroups[]`: Groups of HTML files representing one app page's states
- `htmlFiles[]`: Individual file configs with stateName, description, groupId, interactions

### Dependencies
- `express` - HTTP server
- `better-sqlite3` - SQLite database
- `multer` - File upload handling
- `adm-zip` - ZIP file extraction
- `cheerio` - HTML parsing for analysis
- `chokidar` - File watching
- `ws` - WebSocket for hot reload
- `open` - Browser opening (ES module, use dynamic import)

## Code Style Guidelines

### Icons
**IMPORTANT: Always use SVG icons via the `<Icon>` component, never use emoji.**

Icons are defined and rendered by `frontend/src/components/common/Icon.jsx` (the `ICONS` object holds the SVG inner content; the `<Icon>` component wraps it). Usage:

```jsx
import { Icon } from '../common/Icon';

<Icon name="check" />
<Icon name="folder" size="lg" />
```

Size options:
- (default) - 16x16
- `sm` - 14x14
- `md` - 18x18
- `lg` - 20x20
- `xl` - 24x24

The available icon names are the keys of the `ICONS` object in `Icon.jsx` (e.g. appstudio, smartphone, refresh, save, sparkles, plus, sun, moon, file, folder, chevronDown, arrowLeft, edit, trash, x, check, target, copy, download, upload, package, image, palette, settings…). Check the file for the current full list.

To add a new icon:
1. Add an entry to the `ICONS` object in `Icon.jsx`.
2. Only include the inner SVG content (no `<svg>` wrapper), e.g.: `newIcon: '<path d="..."/>'`

### Theme Support
- Use CSS variables for all colors (defined in `:root` and `[data-theme="light"]`)
- Test both light and dark themes when adding new UI elements
- Ensure sufficient contrast in both themes

### API Development
When adding new API endpoints:
1. Create or update appropriate file in `api/` directory
2. Use `express.Router()` for route definitions
3. Import shared utilities from `api/utils.js`
4. Export router and mount in `server.js`
