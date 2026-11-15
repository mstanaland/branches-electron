# Branches

A Mac git client. Electron + React + TypeScript, built with electron-vite and pnpm.

## Layout

- `src/main/` — Electron main process (Node). The only place that runs git or touches the file system.
- `src/main/git/` — All git execution and output parsing.
- `src/preload/` — Exposes `window.api` to the renderer via `contextBridge`. Nothing else.
- `src/shared/` — Types and pure functions used by more than one process. `api.ts` defines the `BranchesApi` contract.
- `src/renderer/` — The React app.

## Architecture rules

- All git execution lives in `src/main/git/`. Nothing else spawns processes.
- The renderer talks to the main process only through `window.api`. Never expose `ipcRenderer`, Node APIs or Electron internals to the renderer.
- Adding a capability means updating `BranchesApi` in `src/shared/api.ts` first, then the preload, then an `ipcMain.handle` in main.
- Keep `contextIsolation: true` and `sandbox: true`.
- The main process only runs git against repositories the user opened. Validate paths received over IPC.

## Running git

- Use `execFile` (or `spawn`) with an argument array. Never `exec`, `shell: true`, or command strings built by concatenation.
- Always pass `-C <root>`, `--no-optional-locks` and `--literal-pathspecs` as global options, before the subcommand.
- Git writes run one at a time per repository (a queue in `src/main/git/`); reads run in parallel.
- File paths received over IPC must be relative and contain no `..`. Reject anything else before it reaches git.
- Prefer machine-readable output: `--porcelain=v2`, `-z`, `for-each-ref --format` with `%00` separators. Do not parse human-formatted output.
- Git calls are async. Never use the `*Sync` child-process functions.
- Failures throw a typed `GitError` that includes the args, exit code and stderr.

## Renderer

- Server state (anything from git) goes through TanStack Query (`useQuery`, `useMutation`). Mutations invalidate the queries they affect.
- Styling is CSS modules (`*.module.css`) plus `src/renderer/src/styles/global.css`. Use the CSS variables in `global.css` for colors; support light and dark mode.
- Build screens from the components in `src/renderer/src/ui/`, which wrap Base UI (`@base-ui/react`). Import Base UI only inside `ui/`. Add a wrapper when a ticket first needs one. See `docs/adr/0004-ui-layer-wraps-base-ui.md`.
- Icons come from `lucide-react`, imported by name. One `LucideProvider` sets the default size and stroke. Icons are decorative: put meaning in text or `aria-label`.
- Keep OS-level surfaces (application menu, context menus, simple confirms) native and driven from main. Use Base UI for in-window dialogs, popovers and tooltips. See `docs/adr/0003-native-os-surfaces-base-ui-in-window.md`.
- Ask before adding a UI library other than Base UI and `lucide-react`. No CSS-in-JS.

## Testing

- Vitest. Tests live next to the code as `*.test.ts`.
- Git-layer tests run against real temporary repositories created in the test, not mocked output.
- Cover edge cases: renames, paths with spaces, untracked files, merge conflicts, detached HEAD, a repo with no commits.

## Commands

- `pnpm dev` — run the app with hot reload
- `pnpm test` — Vitest in watch mode; `pnpm test:run` runs once
- `pnpm check` — typecheck, lint, format check and tests

Work isn't done until `pnpm check` passes.

## Conventions

- Before adding a dependency, explain why Node, Electron or an existing dependency can't reasonably do the job.
- Code style is set by oxfmt and oxlint; run `pnpm format` rather than hand-formatting.
- Don't use `any`. Prefer types derived from `src/shared/`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for mstanaland/branches-electron (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
