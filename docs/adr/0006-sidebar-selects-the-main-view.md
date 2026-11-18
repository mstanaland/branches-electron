# The sidebar selects the main view, and selecting is not checking out

The main pane used to be unconditional: a repository was active, so you saw its changes and the commit form. The sidebar below the repository picker is now a view switcher, and the main pane shows whatever it has selected — **Working**, or the **history** of one branch. The selection is one value with three kinds (`working`, `branch` with a name, `detached` with an oid) rather than a handful of independent flags, so it can't be in two views at once or in none. It lives per session and resets to Working whenever a repository is opened or switched to; a branch selected last launch may not exist this launch, and Working always does.

**Selecting a branch does not move HEAD.** Checking out keeps the gesture it already had — double-click, or the context menu — and selection is a single click. The two are deliberately separate: reading a branch's history is the common act and checking it out is the consequential one, and a client where looking at a branch silently rewrote the work tree would be dangerous. The converse holds too: HEAD moving on its own — an external `git checkout`, a script, a refresh — never changes what you are looking at. The one exception is our own checkout, which also selects the branch it checked out, because landing somewhere and still being shown somewhere else reads as a bug. When a selected branch or the detached row leaves the list, the view falls back to Working silently, the same way a **missing repository** is flagged on every read rather than guessed at.

It behaves like vertical tabs, and we considered ARIA `tab` roles. We rejected them: tabs must live in a `tablist`, each needs a `tabpanel` wired with `aria-controls`, and arrow keys must cycle within the tablist — but the branch list is already a `role="tree"` with folders and roving focus, and a tree cannot be a tablist. Selection is expressed with `aria-selected` on the rows instead, which gives screen-reader users the same meaning without a contract we'd be breaking. Working sits outside the tree as its own control, which is also why the detached-HEAD row sits _inside_ it: as a top-level `treeitem` it stays reachable by the arrow keys that already move through branches, where a second outside control would let Up escape the tree.

Consequence: the Working row's change count has to be live in every view, so the sidebar now subscribes to `getStatus` for the active repository permanently — previously that query was fetched only because the changed-files list was mounted. `RepositoryStatus.headOid` also became the full oid, with the renderer abbreviating to eight characters everywhere, because the detached row and the history rows name the same commit and git's own abbreviation varies in length.

## Amendment: the repository picker above the sidebar is gone

Repositories are now opened into **tabs** (ADR 0007), so the foldable repository picker this ADR
describes as sitting above the view switcher no longer exists; the sidebar is Working and the
branch tree, nothing else. Everything above still holds — selecting a branch does not move HEAD,
HEAD moving does not change the selection, the view resets to Working whenever a repository is
opened, and the branch list stays a `role="tree"` rather than an ARIA tablist. One wording note:
this ADR argued against calling the sidebar "tabs" at a time when nothing in the app was one.
The word now means the horizontal strip above the columns, and `GLOSSARY.md` keeps the two
apart: a **tab** holds a repository, a **view** is what the sidebar picks inside one.

## Amendment: Refresh sits at the foot of the sidebar

The sidebar now also holds the **Refresh** control (#34), pinned below the branch tree. It is
not a view and selects nothing, so none of the above changes: the view switcher is still Working
and the branch tree. It lives here rather than in the **operations area** because Refresh only
re-reads the repository from disk, and the operations area holds what acts on the repository or
its remote — keeping it apart keeps "touches the network" a property of where a control sits.
