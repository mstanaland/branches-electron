# Feature code uses `ui/`, never Base UI directly

Shared components in `src/renderer/src/ui/` wrap Base UI primitives (and add a few of our own, such as `EmptyState`), each styled once with a CSS module against the tokens in `global.css`. Feature components import from `ui/` and never from `@base-ui/react`; an oxlint `no-restricted-imports` rule, with an exception for `ui/**`, enforces it. We chose this over using Base UI directly so buttons, tooltips, checkboxes and badges look and behave the same everywhere, and so a library change touches one folder.

Consequence: a Base UI part needs a wrapper before feature code can use it. Wrappers are added when a ticket first needs one, not up front.
