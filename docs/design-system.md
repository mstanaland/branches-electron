# Branches design system

> Tokens live in `src/renderer/src/styles/tokens.css`, generated from the Branches design system artifact. Edit the design system, then regenerate the file.

A color system for a Mac Git and GitHub client: one muted berry for identity, warm grays for everything else, and a red and a green that do double duty as destructive/success and as deleted/added lines in diffs.

All values are OKLCH. The anchor is `brand-500`, `oklch(0.463 0.095 9.644)`.

## Principles

- **Neutral first.** A Git client is mostly lists and code. Warm grays carry the UI; the berry appears where something is yours to act on: the primary button, the focused selection, the current branch, links.
- **Two layers.** Raw scales (`gray-*`, `brand-*`, `red-*`, `green-*`, `amber-*`, `blue-*`) are the paint. Views use only the semantic tokens (`bg-content`, `text-muted`, `diff-add-bg`, …), which switch between Light and Dark. If you reach for a raw step in a view, add a semantic token instead.
- **Brand is not danger.** The berry sits at hue 10 with low chroma; destructive red sits at hue 29, warmer and about 1.6× the chroma. Never use `accent` for a destructive action or `danger` for a primary one.
- **Color never works alone.** Diffs always show the `+` / `−` sign in the gutter, and statuses always carry a letter or icon (A, M, D), so red/green color blindness loses nothing.

## The scales

| Scale                    | Hue                           | Use                                                                                                                                                             |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gray-0` … `gray-1000`   | 60 (warm), chroma 0.002–0.010 | Surfaces, borders, text. 14 steps so dark mode has room at the bottom.                                                                                          |
| `brand-50` … `brand-950` | 9.644                         | Identity and selection. `brand-500` is the anchor; `brand-450` is the dark theme's accent fill.                                                                 |
| `red-50` … `red-950`     | 29                            | Destructive actions, errors, deleted lines. Soft tints (chroma ≤ 0.085) for backgrounds and diffs, matching the sage; full strength (≈ 0.15) only in the fills. |
| `green-50` … `green-950` | 152                           | Success, passing checks, added lines. A soft sage, chroma ≤ 0.105, to sit beside the berry.                                                                     |
| `amber-50` … `amber-950` | 75                            | Warnings, modified state.                                                                                                                                       |
| `blue-50` … `blue-950`   | 260                           | Informational badges and banners. A soft, low-chroma blue built around `blue-300` (#a3bfec) so it sits beside the berry instead of competing with it.           |

The grays are tinted toward yellow-orange just enough to feel warm next to the berry, never enough to read as beige.

## Surfaces

| Token                | Light        | Dark         | Where                                                                       |
| -------------------- | ------------ | ------------ | --------------------------------------------------------------------------- |
| `bg-content`         | gray-0       | gray-950     | Commit list, file list, diff view                                           |
| `bg-window`          | gray-100     | gray-900     | Title bar, tab strip, status bar                                            |
| `bg-window-hover`    | gray-200     | gray-850     | Hovered tab on the strip                                                    |
| `bg-sidebar`         | gray-100     | gray-1000    | Repositories, branches, remotes                                             |
| `bg-raised`          | gray-0       | gray-850     | Popovers, menus, sheets, inputs                                             |
| `bg-hover`           | ink at 6%    | white at 8%  | Row, quiet-button and badge hover; translucent so it works on any surface   |
| `bg-pressed`         | ink at 16%   | white at 16% | Pressed state of quiet buttons, like a tab's close button                   |
| `bg-hover-on-accent` | white at 20% | white at 20% | Hover on a `bg-selected-strong` row; the commit node ring on a selected row |
| `bg-selected`        | brand-100    | brand-900    | Selected row, list not focused                                              |
| `bg-selected-strong` | brand-500    | brand-600    | Selected row, list focused (text turns `on-accent`)                         |
| `border`             | gray-200     | gray-800     | Pane dividers, row rules                                                    |
| `border-strong`      | gray-300     | gray-700     | Popovers, menus, dialogs                                                    |
| `border-control`     | gray-500     | gray-500     | Input and checkbox outlines                                                 |
| `backdrop`           | ink at 35%   | black at 50% | Scrim behind a modal dialog                                                 |

Popovers, menus, tooltips and dialogs sit on `bg-raised` with `border-strong` and a shadow (see Shadows).

## Text

`text` for content, `text-muted` for metadata (SHAs, authors, relative dates), `accent-text` for links and the current branch name. `text-disabled` is for disabled controls only. On a `bg-selected-strong` row, text becomes `on-accent` and metadata becomes `on-accent-muted` (white at 80%, ≥ 5.3:1). Every text token clears 4.5:1 on `bg-content`, `bg-window`, `bg-sidebar` and `bg-selected` in both themes.

## Actions

| Token                       | Pair with   | Example                                    |
| --------------------------- | ----------- | ------------------------------------------ |
| `accent` / `accent-hover`   | `on-accent` | Commit, Push, Create pull request          |
| `danger` / `danger-hover`   | `on-accent` | Discard changes, Delete branch, Force push |
| `success` / `success-hover` | `on-accent` | Merge pull request                         |

Status text, badges and banners pair a `-text` token with its `-bg`: `danger`, `success`, `warning` (amber) and `info` (blue). Keyboard focus is a 2px `focus-ring` outline.

## Diffs

| Part                    | Added             | Deleted           |
| ----------------------- | ----------------- | ----------------- |
| Line background         | `diff-add-bg`     | `diff-del-bg`     |
| Gutter (line numbers)   | `diff-add-gutter` | `diff-del-gutter` |
| Changed words           | `diff-add-word`   | `diff-del-word`   |
| Sign and gutter numbers | `diff-add-fg`     | `diff-del-fg`     |

Unchanged lines use `diff-gutter-bg` in the gutter; hunk headers (`@@ … @@`) sit on `diff-hunk-bg`.

Code on a diff line stays `text`; it clears 4.5:1 on the line background and on the word highlight in both themes. The gutter is one step stronger than the line so a hunk's shape reads at a glance in a scrolled file.

## Contrast

Checked in both themes: text pairs ≥ 4.5:1, focus ring, control borders and accent fills ≥ 3:1 against `bg-content`. Line backgrounds are deliberately quiet (about 1.15:1 against `bg-content`); the gutter and the sign carry the signal.

## Typography

Inter for UI (`--font-sans`, falling back to SF Pro), the system monospace (SF Mono) for code (`--font-mono`). Sizes come in pairs; always set the size and its line height together.

| Style    | Size / line    | Use                                                   |
| -------- | -------------- | ----------------------------------------------------- |
| `xl`     | 23 / 30        | Empty-state and onboarding titles                     |
| `lg`     | 19 / 26        | Sheet and dialog titles                               |
| `md`     | 16 / 24        | Section headings, commit subject in detail            |
| **`sm`** | **13 / 20**    | **Default body.** List rows, buttons, inputs, sidebar |
| `xs`     | 11 / 16        | Badges, counts, dates, column headers                 |
| `2xs`    | 10 / 15        | Shortcut hints; never content that must be read       |
| `diff`   | 12 / 20 (mono) | Diff lines, blame, file contents                      |

Weights: `--font-weight-regular` (400) for body, `--font-weight-medium` (500) for buttons, tabs and metadata on selected rows, `--font-weight-semibold` (600) for headings, badges and the selected row.

Note the naming: `sm` is the default, not a "small" variant, which matches macOS's 13pt body text. `diff` shares `sm`'s 20px row so list rows and diff rows line up.

## Radius

| Token       | Value | Use                                                      |
| ----------- | ----- | -------------------------------------------------------- |
| `radius-xs` | 3px   | Badges, status letters, checkboxes, diff word highlights |
| `radius-sm` | 6px   | Buttons, inputs, selected rows                           |
| `radius-md` | 9px   | Popovers, menus, cards                                   |
| `radius-lg` | 18px  | Sheets, dialogs                                          |
| `radius-xl` | 27px  | Onboarding and empty-state containers                    |

The steps go up by threes (3, 6, 9, then 18 and 27). A shape nested inside another uses a smaller step than its container so the corners stay concentric.

## Spacing

A 4px scale with one half-step at 6px. The name is the multiple of 4: `space-3` is 12px, `space-1-5` is 6px.

| Token       | Value | Typical use                                            |
| ----------- | ----- | ------------------------------------------------------ |
| `space-0-5` | 2px   | Tight nudges: tab padding, margins under group headers |
| `space-1`   | 4px   | Small padding; gaps inside compact controls            |
| `space-1-5` | 6px   | Icon-to-label gap in buttons, rows and badges          |
| `space-2`   | 8px   | Default padding inside controls and rows               |
| `space-3`   | 12px  | Control side padding; list, column and panel edges     |
| `space-4`   | 16px  | Section padding; gaps between groups                   |
| `space-6`   | 24px  | Indent per tree level; roomy panels                    |
| `space-12`  | 48px  | Empty-state padding                                    |
| `space-16`  | 64px  | Empty-state padding                                    |

Use a token for every padding, margin and gap. The exceptions are hairline fixes (a `-1px` overlap, a 1px gap) and hit areas sized to a border, like the resize handle. Window-specific clearances live in `global.css`, not the scale: `--titlebar-inset` and `--tabstrip-inset` clear the traffic lights.

## Commit graph

Eight lane colors, `graph-lane-1` … `graph-lane-8`, assigned in order and cycling past eight.

| Lane      | Hue | Light  | Dark   |
| --------- | --- | ------ | ------ |
| 1 berry   | 10  | L 0.56 | L 0.72 |
| 2 teal    | 190 | L 0.60 | L 0.80 |
| 3 ochre   | 95  | L 0.56 | L 0.72 |
| 4 violet  | 280 | L 0.60 | L 0.80 |
| 5 orange  | 55  | L 0.56 | L 0.72 |
| 6 blue    | 235 | L 0.60 | L 0.80 |
| 7 green   | 140 | L 0.56 | L 0.72 |
| 8 magenta | 325 | L 0.60 | L 0.80 |

- Hues are spread 45° apart around the wheel, and neighbouring lanes sit roughly opposite each other, so lanes drawn side by side never look alike.
- Lightness alternates between two levels, so neighbouring lanes still separate for color-blind users.
- Chroma is held near 0.14 so no lane shouts over the berry, and lane 1 is the berry itself, so `main` carries the brand.
- None of the lanes reuses the exact `danger` red or the diff green, so a lane never reads as a status.
- Every lane is ≥ 3:1 on `bg-content` and `bg-selected` in both themes. On a `bg-selected-strong` row, give lines and dots a 2px `bg-content` outline, or draw them in `on-accent`.

## Shadows

Tailwind's scale, for now. One set for both themes.

| Token                     | Use                                          |
| ------------------------- | -------------------------------------------- |
| `shadow-2xs`, `shadow-xs` | Hairline lift: pressed or inset controls     |
| `shadow-sm`               | The focused tab on the tab strip             |
| `shadow-md`               | Tooltips                                     |
| `shadow-lg`               | Menus, select popups, popovers               |
| `shadow-xl`               | Dialogs and sheets                           |
| `shadow-2xl`              | Rare: a floating panel over the whole window |
