# Branches

A Mac git client: a GUI for viewing and changing the state of git repositories on the user's machine.

## Language

### Repositories

**Repository**:
A git work tree on disk, identified by the symlink-resolved top level of that work tree (its **root**).
_Avoid_: Project, folder, repo (in UI text)

**Saved repository**:
An entry in the user's list of repositories, with a name and a last-opened time. One per root.
_Avoid_: Bookmark, favorite

**Active repository**:
The repository of the **focused tab**, if it has one. What background fetch follows, and what
the title bar's operations act on.
_Avoid_: Current repository, selected repository

**Missing repository**:
A saved repository whose folder no longer exists or is no longer a repository root. Flagged every time the list is read, never removed automatically.
_Avoid_: Broken, deleted, orphaned

### Window chrome

**Title bar**:
The full-width row at the top of the window: the traffic lights inset on the left, the
**operations area** on the right. The window has no frame of its own, so this row and the tab
strip below it are all the chrome there is, and both are the window's drag region.
_Avoid_: Toolbar, header, top bar

**Operations area**:
The right-hand end of the **title bar**, holding the operations on the **active repository** —
Fetch, Pull, Push and the overflow menu. Empty when no repository is in front.
_Avoid_: Action bar, button bar, toolbar

**Window title**:
What the OS shows for the window — in Mission Control, the Window menu and screen sharing. The
**active repository**'s name, or the application name with no repository in front. Set in the
main process; nothing draws it inside the window.
_Avoid_: Document title, header text

**In-progress bar**:
The thin indeterminate bar spanning the window below the tab strip, shown while anything for the
**active repository** is being read or run — but only once it has taken about 400ms, so a fast
read never flashes it. What is already on screen stays there underneath.
_Avoid_: Spinner, loading bar, throbber

### Tabs

**Tab**:
One of up to four slots in the horizontal strip below the title bar. Either a **repository tab**
or a **Repositories tab**. The set of tabs is remembered across launches; what is selected
inside one is not.
_Avoid_: Window, pane, workspace

**Repository tab**:
A tab showing one repository: its branches, and whichever **view** the sidebar has selected.
At most one tab per repository.
_Avoid_: Repo tab, project tab

**Repositories tab**:
A tab with no repository yet: the saved repositories and the control for opening a new one.
Choosing a repository turns it into a **repository tab** in place, under the repository's name.
_Avoid_: New tab, empty tab, picker

**Backdrop**:
What fills the content area when no tab is open, including on a first launch. The same surface
as a **Repositories tab**, but not a tab: it has no label and cannot be closed.
_Avoid_: Empty state, home, welcome screen

**Focused tab**:
The one tab the user is looking at. Its repository is the **active repository**.
_Avoid_: Current tab, selected tab, open tab

**Tab command**:
What a **Window menu** item asks of the strip — open a tab, close the focused one, step to the
previous or next, or focus the nth. The menu lives in the main process and the strip in the
renderer, so the item sends one of these rather than changing anything itself (ADR 0008).
_Avoid_: Tab action, tab event, shortcut

**Window menu**:
The application menu holding every tab keystroke: New Tab, Close Tab, Show Previous / Next Tab,
and the four items that focus a tab by position. An item is disabled when the strip cannot do
it, and Cmd+W becomes Close Window only once no tab is left.
_Avoid_: Tab menu, View menu

### Views

**View**:
What one **repository tab** shows beside its branches. The sidebar picks exactly one per
repository: **Working**, or the **history** of one branch. Chosen fresh each time a repository
is opened, and never changed by anything but the user. A **tab** is the horizontal strip above;
a view is what the sidebar picks inside one.
_Avoid_: Page, screen, mode

**Working**:
The view of what is uncommitted: the repository's changes and the commit form.
_Avoid_: Working copy, working directory, changes view, uncommitted view

**History**:
The view of the commits reachable from one branch, newest first, drawn with the lanes that connect them.
_Avoid_: Log, timeline, graph (for the view as a whole)

**Selected branch**:
The branch whose history is shown. Selecting a branch does not move HEAD, so the selected branch and the current branch are often different.
_Avoid_: Active branch, current branch, checked-out branch

### Changes

**Change**:
One path in a repository whose state differs from HEAD. Each path is exactly one change, shown as one row, and later actions apply per change.
_Avoid_: Modified file, dirty file

**Staging state**:
Whether a change is **staged** (fully in the index), **unstaged** (not in the index), or **partially staged** (some of it in the index, the rest still only in the work tree).
_Avoid_: Staged and unstaged as separate rows or groups

**Staged side** / **Unstaged side**:
The two halves of a change: what the index differs by from HEAD, and what the work tree differs by from the index. A partially staged change has both.
_Avoid_: Index status, worktree status (in UI text)

**Untracked**:
A change git doesn't track yet. It has no staged side, and its staging state is unstaged.
_Avoid_: New file, unversioned

**Conflict**:
A change where a merge left the path unmerged. Flagged in the list and sorted first.
_Avoid_: Unmerged file

**Stage all**:
The one control that stages every change at once, conflicts excluded. It reads **Stage All**, or **Unstage All** once all of that set is staged, and always acts — it is never disabled, and it is absent when there is nothing it could act on.
_Avoid_: Select all, check all, a separate Unstage All control

### Committing

**Commit form**:
Where the user writes and sends a commit.
_Avoid_: Commit box, commit area, commit panel

**Commit subject**:
The first line of a commit message.
_Avoid_: Summary, title, headline

**Commit description**:
The rest of a commit message, below the subject. Optional.
_Avoid_: Body, long description, extended description

**Draft**:
A commit subject and description the user has typed but not committed. One per repository — and
so one per **repository tab** — lost when the app quits.
_Avoid_: Pending message, unsent commit

### Branches

**Branch**:
A local branch. Remote branches are not yet shown, and the bare word never means one.
_Avoid_: Ref, head

**Upstream**:
The remote branch a local branch tracks. It can be **gone** when it no longer exists on the remote.
_Avoid_: Tracking branch, remote branch

**Background fetch**:
The periodic `git fetch --prune` main runs for the **active repository** while the window is focused, so **upstream** positions stay current. Quiet: it never reports a failure to the user.
_Avoid_: Auto fetch, polling, sync

**Manual fetch**:
The same `git fetch --prune` run for the **active repository** when the user presses Fetch in
the **operations area**. Loud, unlike **background fetch**: a failure is shown, and a
repository with no remote is told about rather than reported as a fetch that did nothing.
_Avoid_: Refresh (that one touches no network), sync, update

**Refresh**:
Re-reading the **active repository** from disk on demand, with the control at the foot of the
sidebar — the same re-read regaining window focus does. Touches no network: reaching the
remote is **manual fetch**'s job. A refresh keeps what is on screen until the new read lands.
_Avoid_: Reload, sync, fetch (that one reaches the remote)

**First load**:
A repository's first read in a tab, when there is nothing yet to keep on screen. Each column
shows a pending state until its read lands, so a column still loading never looks like an empty
repository.
_Avoid_: Initial fetch, skeleton

**Pull**:
Bringing the **current branch** up to date with its **upstream**, with `git pull --ff-only`,
when the user presses Pull in the **operations area**. Fast-forward only: a branch that has
diverged is refused rather than merged or rebased. The control says how far **behind** the
branch is, and is disabled when there is nothing to fast-forward onto — no **upstream**, a
**detached HEAD**, or a branch already level with its upstream.
_Avoid_: Sync, update, merge (a pull never makes a merge commit here)

**Current branch**:
The branch HEAD points at. Absent when HEAD is detached.
_Avoid_: Active branch ("active" belongs to repositories)

**Detached HEAD**:
HEAD points at a commit instead of a branch.
_Avoid_: No branch, headless

### Commits

**Commit**:
One commit reachable from a branch. It has a **commit subject**, an author, a date and a **short oid**, and one parent — or several, which makes it a **merge**.
_Avoid_: Revision, changeset, SHA (for the commit itself)

**Short oid**:
The first eight characters of a commit's object id, always eight. Git's own abbreviation varies in length by repository; this one doesn't, so the same commit reads the same everywhere in the app.
_Avoid_: SHA, hash, short hash, abbreviated id

**Lane**:
One vertical track in the **history**. A commit sits in exactly one lane, and lanes join where a **merge** brings two lines of work together.
_Avoid_: Column, track, swimlane, branch line
