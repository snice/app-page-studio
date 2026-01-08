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

### Backend (`server.js`)
Single Express server handling:
- Static file serving for UI (`/public`) and HTML previews (`/html`)
- WebSocket server for hot-reload on HTML file changes
- REST APIs for configuration, file scanning, HTML analysis, and prompt generation
- File watcher (chokidar) monitors HTML directory for changes

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

**Config** (`.studio-config.json`):
- `currentProject`: Active project path
- `projects[]`: List of recent projects with path, name, lastOpened

**Pages Config** (`pages.json` in project or tool root):
- `pageGroups[]`: Groups of HTML files representing one app page's states
- `htmlFiles[]`: Individual file configs with stateName, description, groupId, interactions

### Path Resolution Priority
HTML and pages.json files are resolved in order:
1. `{currentProject}/html/` and `{currentProject}/pages.json`
2. `{toolDir}/html/` and `{toolDir}/pages.json`

### API Endpoints
- `GET /api/config` - Get studio configuration
- `POST /api/switch-project` - Switch active project
- `GET /api/browse?path=` - Browse filesystem directories
- `GET /api/pages` - Get pages.json configuration
- `POST /api/pages` - Save pages.json
- `GET /api/scan-html` - Scan HTML files in current project
- `GET /api/analyze-html?path=` - Analyze HTML structure (colors, interactive elements)
- `GET /api/extract-images?path=` - Extract image paths from HTML
- `POST /api/copy-images` - Copy images to project assets directory
- `POST /api/generate-prompt` - Generate AI development prompt

### Dependencies
- `express` - HTTP server
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
- **Functions**: target, copy, download, package

To add new icons:
1. Add the SVG path to `ICONS` object in `icons.js`
2. Only include the inner content (no `<svg>` wrapper), e.g.: `newIcon: '<path d="..."/>'`

### Theme Support
- Use CSS variables for all colors (defined in `:root` and `[data-theme="light"]`)
- Test both light and dark themes when adding new UI elements
- Ensure sufficient contrast in both themes
