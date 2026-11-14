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

### Branches

**Branch**:
A local branch. Remote branches are not yet shown, and the bare word never means one.
_Avoid_: Ref, head

**Upstream**:
The remote branch a local branch tracks. It can be **gone** when it no longer exists on the remote.
_Avoid_: Tracking branch, remote branch

**Current branch**:
The branch HEAD points at. Absent when HEAD is detached.
_Avoid_: Active branch ("active" belongs to repositories)

**Detached HEAD**:
HEAD points at a commit instead of a branch.
