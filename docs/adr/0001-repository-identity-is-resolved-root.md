# A repository's identity is the symlink-resolved root of its work tree

Saved repositories are keyed by the realpath of the work tree's top level, so opening the same repository through a symlink or a subfolder updates one saved repository instead of creating a second. The Swift app did the same (`resolvingSymlinksInPath` plus dedupe), but git's `--show-toplevel` alone doesn't resolve symlinks, so main must. This decision is hard to change once saved lists exist on disk, and it is the key for the IPC allowlist, the watcher and every query key.
