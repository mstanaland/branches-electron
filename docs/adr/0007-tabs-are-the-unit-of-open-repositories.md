# Tabs are the unit of open repositories, and zero tabs is a real state

Repositories are opened into **tabs** in a horizontal strip, replacing the foldable repository
picker that used to sit at the top of the sidebar. A tab holds one repository, its **view** and
its selected change, so switching between repositories stops losing where you were. The set of
tabs persists across launches; the view inside each one still does not (ADR 0006). This inverts
the app's oldest assumption — that exactly one repository is open at a time — so `activeRoot`
becomes a list of tabs with one **focused tab**, and the **active repository** is whatever that
tab holds.

## One repository, one tab

Choosing a repository that is already open focuses its existing tab rather than opening a
second. The alternative — the same repository in two tabs, as a browser allows — would make
`root` useless as a key for the things that are genuinely per-repository: the commit **draft**
(defined as one per repository), the write queue, the query cache. Nothing about reading a git
repository benefits from two simultaneous views of it, so the ambiguity buys nothing.

## Four tabs, and the `+` disappears at the limit

Rather than shrinking tabs, scrolling the strip, or adding an overflow menu, the strip holds at
most four tabs of any kind and the `+` button is absent once it is full. This is a deliberate
constraint, not a stopgap: it removes overflow as a design problem entirely, and four open
repositories is past what this app is for. Making the limit visible — the control disappears —
beats discovering it through a click that does nothing. A Repositories tab occupies a slot,
because it is about to become a repository tab.

## Zero tabs is a real state, and the backdrop is not a tab

Closing the last tab leaves no tabs, and the Repositories surface fills the content area as a
**backdrop**: the same component a Repositories tab renders, but with no label and no close
button. The obvious alternative is to guarantee at least one tab, auto-creating a Repositories
tab whenever the last one closes. We rejected it because auto-creating a tab the user just
closed is the app arguing with them, and because a first launch with a tab already in the strip
implies a thing was opened when nothing was. The cost is the one a future reader will trip
over: two ways to be looking at the same surface, so the component must work both as a tab's
content and as the floor, and "convert this tab to a repository tab" has to be a no-op in the
backdrop case, where choosing a repository creates the first tab instead.

## Consequences

Tab state (the open roots, the focused tab, and the column widths) lives in the renderer's
`localStorage` beside what `activeRoot` used it for, not in the main process beside
`repositories.json`: no other process reads it, and moving it would mean a new IPC pair and a
second file on disk. The fetch scheduler is untouched — it still tracks exactly one repository,
and the focused tab now decides which one. Because the sidebar's picker is gone, opening a
repository (`Cmd+O` included) now always targets a tab, and is refused when the strip is full.
