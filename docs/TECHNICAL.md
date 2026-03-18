# Cally — Technical Documentation

Deep dive for developers who want to understand or extend Cally.

## Architecture Overview

### Process Model

Cally uses Electron's multi-process architecture:

| Process | Role | Access |
|---------|------|--------|
| **Main** | App lifecycle, window management, IPC, native addons | Full Node.js + Electron |
| **Widget Renderer** | Calendar widget UI (iframe embed) | Preload API only |
| **Settings Renderer** | Settings window UI | Preload API only |

### IPC Communication

All renderer ↔ main communication goes through IPC with a whitelisted API:

```
Renderer                    Preload (contextBridge)              Main
   │                              │                                 │
   │  window.electronAPI.auth.*   │   ipcRenderer.invoke()          │
   │ ──────────────────────────► │ ──────────────────────────────► │ ipcMain.handle()
   │                              │                                 │
   │  Response                    │   Response                       │
   │ ◄──────────────────────────  │ ◄──────────────────────────────── │
```

**Exposed channels** (see `src/shared/preload.ts`):

- `auth:login`, `auth:logout`, `auth:getStatus`
- `calendar:getCalendars`
- `settings:get`, `settings:set`, `settings:getAll`, `settings:reset`, `settings:export`
- `window:show`, `window:hide`, `window:openSettings`, `window:pinToDesktop`, `window:unpinFromDesktop`
- `app:openExternal`, `app:quit`, `app:openDevTools`
- `notifications:test`, `notifications:clearCache`

Event listeners: `auth:statusChanged`, `calendar:eventsUpdated`, `settings:changed`, etc.

### Security

- **contextIsolation: true** — Renderer cannot access `require`, `process`, or Electron internals
- **nodeIntegration: false** — No Node.js in renderer
- **Preload whitelist** — Only specific methods exposed via `contextBridge`
- **IPC validation** — `on()` only accepts whitelisted channels

### Native Addon (Pin to Desktop)

The `native/` folder contains a Node.js native addon (C++ via node-gyp) that:

1. Finds the Windows `Progman` window
2. Sends `0x052C` to spawn `WorkerW`
3. Locates the correct `WorkerW` (without `SHELLDLL_DefView`)
4. Reparents the Electron window to `WorkerW` (desktop layer)

This allows the widget to appear *behind* desktop icons while remaining visible.

### Build Pipeline

```
TypeScript (main)     →  tsc -p tsconfig.main.json  →  dist/main/
TypeScript (renderer) →  webpack                    →  dist/renderer/
Native addon          →  node-gyp                   →  native/build/
electron-builder      →  npm run dist                →  release/
```

### Design System

Neumorphic (Soft UI) tokens in `src/renderer/shared/neumorphic.css`:

- **Colors**: `--neu-bg`, `--neu-fg`, `--neu-muted`, `--neu-accent`
- **Shadows**: `--neu-extruded`, `--neu-inset`, `--neu-inset-deep`
- **Typography**: `--neu-font-display` (Outfit/Plus Jakarta Sans), `--neu-font-body` (DM Sans)

### File Paths in Production

- Main process: `dist/main/main/main.js`
- Preload: `dist/main/shared/preload.js`
- Renderer HTML: `dist/renderer/widget.html`, `dist/renderer/settings.html`
- Assets: `assets/` (relative to app root)

### Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Widget URL | `http://localhost:8080/widget.html` | `file://.../dist/renderer/widget.html` |
| Settings URL | `http://localhost:8080/settings.html` | `file://.../dist/renderer/settings.html` |
| DevTools | Auto-opened | Via Settings → Advanced |

---

## Extending Cally

### Adding a New IPC Handler

1. **Main** (`src/main/main.ts`): Add `ipcMain.handle('channel:action', async () => { ... })`
2. **Preload** (`src/shared/preload.ts`): Expose method in `electronAPI`
3. **Renderer**: Call `window.electronAPI.module.action()`

### Adding a New Setting

1. Extend `AppSettings` in `src/shared/types.ts`
2. Add UI in `src/renderer/settings/index.html`
3. Wire up in `SettingsWindow` class (`src/renderer/settings/index.ts`)
4. Settings persist via `electron-store`

### Adding a New Font or Style

- Add to `neumorphic.css` or widget/settings inline styles
- Use CSS variables for consistency
