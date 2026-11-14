# Branches

A Mac git client built with Electron, React and TypeScript.

## Setup

Requires Node 22.12+ and pnpm.

```sh
pnpm install   # also downloads the Electron binary for your Mac
pnpm dev       # run the app with hot reload
```

## Scripts

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Run the app in development with HMR              |
| `pnpm test`      | Vitest in watch mode (`pnpm test:run` runs once) |
| `pnpm lint`      | oxlint (`pnpm lint:fix` to auto-fix)             |
| `pnpm format`    | oxfmt (`pnpm format:check` to check only)        |
| `pnpm typecheck` | TypeScript for main/preload and renderer         |
| `pnpm check`     | Typecheck, lint, format check and tests          |
| `pnpm build:mac` | Build an unsigned `.dmg` into `dist/`            |

## Layout

- `src/main/` — Electron main process (Node). All git commands run here.
- `src/preload/` — Exposes a narrow, typed `window.api` to the renderer.
- `src/shared/` — Types shared across processes, including the `BranchesApi` contract.
- `src/renderer/` — The React app. Styles are CSS modules (`*.module.css`) plus `styles/global.css`.

The renderer never touches Node or git directly; it calls `window.api`, which
goes over IPC to the main process.
