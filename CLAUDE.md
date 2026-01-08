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

### Frontend (`public/index.html`)
Single-page application with:
- Three-column layout: file list sidebar, phone preview, configuration panel
- iframe-based HTML preview with element picker overlay
- WebSocket client for live reload

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
