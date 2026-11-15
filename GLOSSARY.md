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
The one saved repository the user is currently viewing, if any. Remembered across launches.
_Avoid_: Current repository, selected repository

**Missing repository**:
A saved repository whose folder no longer exists or is no longer a repository root. Flagged every time the list is read, never removed automatically.
_Avoid_: Broken, deleted, orphaned

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
A commit subject and description the user has typed but not committed. One per repository, lost when the app quits.
_Avoid_: Pending message, unsent commit

### Branches

**Branch**:
A local branch. Remote branches are not yet shown, and the bare word never means one.
_Avoid_: Ref, head

**Upstream**:
The remote branch a local branch tracks. It can be **gone** when it no longer exists on the remote.
_Avoid_: Tracking branch, remote branch

**Background fetch**:
The periodic `git fetch --prune` main runs for the active repository while the window is focused, so **upstream** positions stay current. Quiet: it never reports a failure to the user.
_Avoid_: Auto fetch, polling, sync

**Current branch**:
The branch HEAD points at. Absent when HEAD is detached.
_Avoid_: Active branch ("active" belongs to repositories)

**Detached HEAD**:
HEAD points at a commit instead of a branch.
