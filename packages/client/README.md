# App Page Studio Client

This package contains the active Vite + React frontend for App Page Studio.

## Development

Run from the repository root:

```bash
pnpm run dev
```

The Vite dev server runs on `5173` and proxies `/api`, `/html`, and `/ws` to the Express server.

## Main Areas

- `src/pages/`: login, project home, and dashboard routes.
- `src/components/layout/`: workspace shell, preview panel, config panel, and the HTML IR agent panel.
- `src/components/picker/`: element picker, image-region selector, and style inspection.
- `src/hooks/workspace/`: iframe reload, picker, PSD events, and workspace actions.
- `src/lib/api/`: frontend API wrappers.
- `src/lib/slices/`: Zustand state slices.
- `src/styles/modules/`: layout and component CSS modules.

## HTML IR UI

Design-image and PSD-preview pages can switch the preview mode to `HTML IR`. In that mode, `DesignHtmlAgentPanel` appears on the right side of the preview workspace.

The panel supports:

- generating or regenerating HTML IR;
- streaming AI progress stages;
- refining generated HTML through chat;
- selecting multiple iframe elements and sending their selectors to the AI refinement endpoint.

The generated iframe page is served from the backend under `/html/:projectId/...` and saved in the project cache as `__design__/xxx/index.html` or `__psd__/xxx/index.html`.
