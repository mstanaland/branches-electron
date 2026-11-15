# Native OS surfaces, Base UI for in-window ones

Branches is a Mac git client, so the application menu, context menus and simple confirm dialogs are native Electron surfaces (`Menu`, `dialog`) driven from the main process. Base UI (`@base-ui/react`) provides the in-window surfaces: tooltips, popovers and dialogs with real content, such as the list of files blocking a checkout. We considered rebuilding the menus with Base UI's `ContextMenu` and `AlertDialog` for one look everywhere, and kept native because macOS supplies keyboard handling, accessibility and system behavior for free, and the native menus were already built and tested.

Consequence: each native surface needs a `BranchesApi` method and a main-process handler (for example `showRepositoryMenu`), which is more plumbing than a DOM menu.
