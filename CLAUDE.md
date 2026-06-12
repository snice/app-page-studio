# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Page Studio is a web tool for turning design inputs into structured AI implementation prompts for Flutter, React Native, and UniApp. It supports HTML exports, raster design images, PSD previews/layers/slices, page grouping, design-system metadata, and multi-user project collaboration.

The active frontend is Vite + React under `packages/client/`. The backend is under `packages/server/`. The old root-level `public/` HTML/CSS/JS implementation is obsolete and should not be updated.

## Commands

```bash
pnpm run dev    # Install dependencies, then start Express and Vite concurrently
pnpm run build  # Install dependencies, build client, and create release ZIP
```

Useful maintenance command:

```bash
pnpm --filter server reset-password -- -u <username>
```

## Architecture

### Backend Structure

```text
packages/server/
├── server.js           # Express entry, sessions, static frontend, WebSocket, file watcher
├── db.js               # SQLite schema and data-access modules
├── paths.js            # Workspace/data/build output paths
└── api/
    ├── auth.js         # Login/logout/current user/admin user management
    ├── projects.js     # Project CRUD and project members
    ├── pages.js        # Pages config save/load/history APIs
    ├── html.js         # HTML/design file upload, scan, delete, ZIP download
    ├── image.js        # Design image and asset upload/list APIs
    ├── psd.js          # PSD upload/list/preview APIs
    ├── prompt.js       # Prompt generation route
    ├── prompt/         # Prompt builders by target platform
    └── utils.js        # Shared upload, auth guard, path, ZIP, broadcast helpers
```

### Server (`server.js`)

- Uses Express with JSON payloads up to 50 MB.
- Uses `express-session` with `better-sqlite3-session-store`; cookie name is `aps.sid`.
- Bootstraps an admin account on first run. `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` can override defaults.
- Serves Vite build output from `frontend_dist` first, then `packages/client/dist`.
- Serves project files from `/html/:projectId` after auth and project-access checks.
- Mounts `/api/auth/*` first; all business API routers are protected by `requireAuth`.
- Provides SPA fallback to `index.html` for non-API and non-HTML routes.
- Runs authenticated WebSocket upgrades at `/ws`.
- Watches `html_caches/` with chokidar and broadcasts `html:changed` for HTML/PSD changes.

### WebSocket Model

WebSocket connections are authenticated through the same Express session as HTTP.

Current event types:

- `session` - server returns session, connection, and user identity.
- `presence:update` - client reports current project/page/group scope.
- `presence:list` - server broadcasts current collaborators in a project.
- `files:changed` - upload/delete changed file list; other clients rescan.
- `pages:file-saved` - one page config was saved; other clients merge when clean.
- `pages:groups-saved` - group metadata and file assignments were saved.
- `pages:full-saved` - whole project config was saved.
- `html:changed` - watched HTML/PSD file changed on disk.

Presence is advisory: it helps users see possible page/group conflicts before saving. Actual conflict control is enforced by revision/hash checks in `api/pages.js`.

### Database (`db.js`)

SQLite is accessed through `better-sqlite3`.

Core tables:

- `users`: username, password hash, role (`admin` or `user`).
- `projects`: name, description, design system JSON, owner user.
- `project_members`: project/user membership with role (`owner`, `editor`, `viewer`).
- `project_pages`: current pages config JSON, revision, updated actor/session.
- `project_page_revisions`: historical snapshots for restore.

The session store also persists Express session data in SQLite.

Key data modules:

- `Users`: login/admin user management helpers.
- `Projects`: project CRUD, access checks, members, page config save/merge/history helpers.

### API Modules

All business APIs require login unless noted.

**auth.js**

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/users` - admin only
- `POST /api/auth/users` - admin only
- `PUT /api/auth/users/:id` - admin only
- `DELETE /api/auth/users/:id` - admin only

**projects.js**

- `GET /api/projects` and `GET /api/config` - list accessible projects.
- `GET /api/projects/:id` - get one project.
- `GET /api/projects/:id/members` - list members and, for managers, users.
- `POST /api/projects/:id/members` - add/update member.
- `PUT /api/projects/:id/members/:userId` - update member role.
- `DELETE /api/projects/:id/members/:userId` - remove member.
- `POST /api/projects` - create project, optionally with ZIP upload.
- `PUT /api/projects/:id` - update name, description, design system.
- `POST /api/projects/:id/html` - replace the project's `__html__` directory.
- `DELETE /api/projects/:id` - delete project.

**pages.js**

- `GET /api/pages?projectId=` - returns `pagesConfig`, `revision`, `entityHashes`, actor metadata.
- `POST /api/pages?projectId=` - full config save; requires `expectedRevision`.
- `PATCH /api/pages/file?projectId=` - save one file config by `path` and `baseHash`.
- `PATCH /api/pages/groups?projectId=` - save `pageGroups` and group assignments by `baseHash`.
- `GET /api/pages/history?projectId=&limit=` - list revision snapshots.
- `POST /api/pages/restore?projectId=` - restore a historical revision.

**html.js**

- `POST /api/upload-html?projectId=` - merge uploaded HTML ZIP into `__html__`.
- `POST /api/delete-files` - delete selected HTML/image/PSD files.
- `GET /api/scan-html?projectId=` - scan `__html__` and `__psd__`.
- `GET /api/html-content?projectId=&path=` - read HTML file content.
- `POST /api/download-design-zip` - package selected design files and PSD slices.

**image.js**

- `POST /api/upload-image?projectId=` - upload design images into `__design__`.
- `GET /api/list-images?projectId=` - list design images.
- `POST /api/upload-asset?projectId=` - upload slice assets into `__assets__`.

**psd.js**

- `POST /api/upload-psd?projectId=` - upload PSD files or ZIPs into `__psd__`, generating previews.
- `GET /api/list-psd?projectId=` - list PSD files.
- `GET /api/psd-preview?projectId=&path=` - ensure/return PSD preview path.

**prompt.js + prompt/**

- `POST /api/generate-prompt` - prompt generation entry.
- Builders live in `api/prompt/` and currently cover Flutter, React Native, and UniApp.

### Storage Layout

Project files live under `html_caches/{projectId}/`.

```text
html_caches/{projectId}/
├── __html__/    # Extracted HTML exports and their local assets
├── __design__/  # Uploaded PNG/JPG/WebP design images
├── __assets__/  # User-uploaded slice/replacement assets
└── __psd__/     # Uploaded PSD files and generated PNG previews
```

Always resolve user-provided file paths with `resolveSafe()` or an equivalent guarded path check before reading/deleting files.

## Pages Config And Save Model

`project_pages.pages_json` stores the whole pages config blob, but the API supports narrow writes to reduce collaboration conflicts.

Top-level config shape:

- `projectName`
- `targetPlatform`
- `designSystem`
- `sharedComponents`
- `htmlFiles[]`
- `pageGroups[]`

Important save behavior:

- "保存当前页" saves dirty group data first if needed, then saves only the current file through `PATCH /api/pages/file`.
- "保存全部" saves the entire config through `POST /api/pages` with `expectedRevision`.
- Group create/edit/assignment changes are saved through `PATCH /api/pages/groups`.
- `GET /api/pages` returns `entityHashes.files[path]` and `entityHashes.groups`; these are the bases for per-file and per-group conflict checks.
- Full saves conflict on revision; file/group saves conflict only when that target hash changed.
- Every successful write increments the pages revision and snapshots previous config for history/restore.

## Frontend Structure

The current frontend is Vite + React.

```text
packages/client/
├── index.html
├── package.json
└── src/
    ├── main.jsx                     # React entry with BrowserRouter
    ├── App.jsx                      # Auth gate, routes, global user bar/modals
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── HomePage.jsx             # Project dashboard
    │   ├── HomePageModals.jsx
    │   ├── DashboardPage.jsx        # Workspace shell
    │   └── DashboardModals.jsx
    ├── components/
    │   ├── common/                  # Icon, AppSelect, Toast
    │   ├── layout/                  # Header, Sidebar, PreviewPanel, ConfigPanel
    │   ├── layout/ConfigPanel/      # Lists and form sections for page config
    │   ├── modals/                  # Project/member/user/history/prompt/design modals
    │   ├── picker/                  # HTML element styles and image region selection
    │   ├── psd/                     # PSDCanvas, LayerPanel, SlicesPanel
    │   └── mindmap/                 # Page group mind map
    ├── hooks/
    │   ├── useTheme.js
    │   ├── useWebSocket.js
    │   ├── useWorkspaceController.js
    │   └── workspace/               # Iframe reload, picker, PSD events, actions
    ├── lib/
    │   ├── api/                     # Auth/projects/pages/html/prompt/users API modules
    │   ├── slices/                  # Zustand state slices
    │   ├── state.js                 # Store assembly
    │   ├── picker.js
    │   ├── psdUtils.js
    │   └── clipboard.js
    └── styles/
        ├── app.css
        └── modules/                 # Layout, header, sidebar, psd, modals, etc.
```

Routing:

- `/` - project home.
- `/dashboard?pid=<projectId>` - workspace.

## Frontend State And Collaboration

- Global state is Zustand, split into `packages/client/src/lib/slices/*`.
- `useWorkspaceController()` composes workspace behavior from focused hooks:
  - `useIframeHotReload()` handles WebSocket events, presence, remote merges, iframe reloads.
  - `useWorkspaceActions()` owns file selection, saves, downloads, and deletion.
  - `useIframePicker()` owns HTML/image selection flow.
  - `usePsdSliceEvents()` owns PSD slice state syncing.
- API wrappers live in `packages/client/src/lib/api/*`; prefer adding endpoint wrappers there instead of calling `fetch` directly in components.
- Components should read/write store state through `useAppStore`.

## Code Style Guidelines

### Icons

Always use SVG icons via the React `<Icon>` component, never emoji for UI icons.

Icons are defined in `packages/client/src/components/common/Icon.jsx` in the `ICONS` object.

```jsx
import { Icon } from '../common/Icon';

<Icon name="check" />
<Icon name="folder" size="lg" />
```

Size options:

- default: 16 x 16
- `sm`: 14 x 14
- `md`: 18 x 18
- `lg`: 20 x 20
- `xl`: 24 x 24

To add a new icon, add an entry to `ICONS` with only the SVG inner content, no `<svg>` wrapper.

### Theme Support

- Use CSS variables from `packages/client/src/styles/modules/theme.css` and `app.css`.
- Check both dark and light themes when adding UI.
- Keep controls compact and avoid layout shifts on hover.

### API Development

- Put new routes in the appropriate `packages/server/api/*.js` router and mount new routers in `packages/server/server.js`.
- Use `requireAuth` at router mount level unless the endpoint must be public.
- Use `ensureProjectReadable()` and `ensureProjectWritable()` for project-scoped access.
- Use `broadcastProjectEvent()` for file/config changes that other clients should observe.
- Return structured conflict responses with `conflict: true` when save guards fail.

### Frontend Development

- Keep page/workspace logic in hooks or store slices; avoid growing layout components with business logic.
- Preserve the per-page/per-group save model unless a change explicitly needs full-config save.
- For file list changes after upload/delete, rely on `files:changed` plus `scanHtmlFiles()`.
- PSD slice changes must keep `psdMarkedSlices` and the current file's `psdSlices` in sync.
