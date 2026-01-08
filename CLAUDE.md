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
    └── prompt.js       # Prompt generation API
```

### Server (`server.js`)
Lightweight entry point:
- Express middleware setup
- Static file serving (`/public`, `/html`)
- WebSocket server for hot-reload
- File watcher (chokidar) for HTML changes
- Mounts API routers from `api/` directory

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

**prompt.js** - Prompt generation:
- `POST /api/generate-prompt` - Generate AI development prompt

### HTML Storage
Project HTML files are stored in `html_caches/{project_id}/` directory, uploaded as ZIP files.

### Frontend Structure
```
public/
├── index.html          # HTML structure only
├── css/
│   └── styles.css      # All styles (including theme variables)
└── js/
    ├── icons.js        # SVG icon Web Component (loaded first in <head>)
    ├── theme.js        # Theme switching (loaded in <head> to prevent flash)
    ├── state.js        # Global state management
    ├── api.js          # API request wrappers
    ├── picker.js       # Element picker for iframe
    ├── ui.js           # UI rendering and interactions
    └── app.js          # Main entry point and event bindings
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
**IMPORTANT: Always use SVG icons via `<icon-component>`, never use emoji.**

All icons are defined in `icons.js` as a Web Component. Use:

```html
<!-- In HTML -->
<icon-component name="check"></icon-component>
<icon-component name="folder" size="lg"></icon-component>
```

```javascript
// In JS (dynamic rendering)
UI.icon('check')           // Returns: <icon-component name="check"></icon-component>
UI.icon('folder', 'lg')    // Returns: <icon-component name="folder" size="lg"></icon-component>
```

Size options:
- (default) - 16x16
- `sm` - 14x14
- `md` - 18x18
- `lg` - 20x20
- `xl` - 24x24

Available icons (defined in `ICONS` object in `icons.js`):
- **App**: smartphone
- **Actions**: refresh, save, sparkles, plus
- **Theme**: sun, moon
- **Files**: file, fileEmpty, folder, folderOpen
- **Navigation**: chevronDown, chevronUp, arrowUp
- **Editing**: edit, trash, x, check
- **Functions**: target, copy, download, upload, package

To add new icons:
1. Add the SVG path to `ICONS` object in `icons.js`
2. Only include the inner content (no `<svg>` wrapper), e.g.: `newIcon: '<path d="..."/>'`

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
