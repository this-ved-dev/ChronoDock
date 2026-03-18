# Contributing to Cally

Thank you for your interest in contributing! Cally is an open-source project and we welcome contributions of all kinds.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something useful.

## How to Contribute

### Reporting Bugs

- Use the [GitHub issue template](.github/ISSUE_TEMPLATE/bug_report.md)
- Include steps to reproduce, expected vs actual behavior, and your environment (Windows version, Node version)

### Suggesting Features

- Use the [GitHub issue template](.github/ISSUE_TEMPLATE/feature_request.md)
- Describe the use case and why it would benefit Cally users

### Pull Requests

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature-name` or `fix/your-fix-name`
3. **Make your changes** following our guidelines below
4. **Test** your changes: `npm run build && npm start`
5. **Commit** with clear messages: `feat: add X` or `fix: resolve Y`
6. **Push** and open a Pull Request

## Development Guidelines

### TypeScript

- Use **strict mode** — no `any` unless necessary
- Add JSDoc for public APIs
- Follow existing naming conventions

### Styling

- Cally uses a **Neumorphic design system** — see `src/renderer/shared/neumorphic.css`
- Use design tokens (CSS variables) for colors, shadows, radii
- No inline styles except for Electron-specific needs (e.g. `-webkit-app-region`)

### Electron Best Practices

- **Context isolation**: Enabled — never disable it
- **Preload**: Expose only what's needed via `contextBridge`
- **IPC**: Validate all IPC channels; don't expose raw `ipcRenderer`
- **Node integration**: Keep disabled in renderers

### Linting

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix where possible
```

### Testing

- Test on **Windows 10** and **Windows 11**
- Verify the native addon builds: `cd native && npm run build`
- Test both development and production builds

## Project Structure

- `src/main/` — Main process (Node.js, Electron APIs)
- `src/renderer/` — Renderer processes (UI, no Node access)
- `src/shared/` — Shared types, preload, design tokens
- `native/` — C++ addon for desktop pinning

## Questions?

Open a [Discussion](https://github.com/YOUR_USERNAME/Electron-Cally/discussions) or an issue. We're happy to help!
