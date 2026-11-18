# Tab shortcuts are application-menu items, and Cmd+W closes a tab before the window

Every tab keystroke — `Cmd+T`, `Cmd+W`, `Cmd+Shift+[` / `Cmd+Shift+]` and `Cmd+1` … `Cmd+4` —
is a real item in a **Window** menu built in the main process, not a key handler in the
renderer. The menu is the Mac's own list of what the app can do: the shortcuts are discoverable
there, greyed out when the strip cannot do them, and they keep working while focus is in a text
field, where a renderer-level `Cmd+W` would be competing with the commit message box. This
follows ADR 0003 — OS-level surfaces stay native and are driven from main.

The strip itself still lives in the renderer (ADR 0007), so an item does not act: it sends a
**tab command** (`new`, `close`, `previous`, `next`, `focus` with an index) over IPC, and the
renderer carries it out. The renderer reports its tab count back the same way, because the menu
is built around it. That makes the count a round trip — the renderer changes the strip, tells
main, main rebuilds the menu — so the menu is briefly a step behind the strip. The alternative,
moving tab state into main, would mean an IPC pair and a second file on disk for state no other
process reads, which ADR 0007 already rejected. The one direction where being behind would bite
is handled instead: until the renderer has reported at all — the first menu is built before last
launch's tabs are restored — the count is unknown rather than zero, and Cmd+W is a disabled
**Close Tab** rather than a **Close Window** that would take the window with it.

## Cmd+W closes a tab until there is no tab left

The same keystroke is **Close Tab** while a tab is open and **Close Window** once the strip is
empty, so closing the last tab lands on the backdrop and only a second `Cmd+W` closes the
window. Zero tabs is a real state (ADR 0007), which is what makes this possible: there is
somewhere for the last close to leave you. A browser would close the window on that keystroke;
with four tabs at most and a window that is the whole app, losing the window to a habitual
`Cmd+W` is a worse surprise than pressing it twice.

Because two items cannot share one accelerator, window closing moved out of **File** and into
the Window menu, and `role: 'windowMenu'` is spelled out by hand — the role brings its own
`Cmd+W`.

## Open Repository … is disabled at the limit

ADR 0007 refuses an open when the strip is full. Rather than letting the folder picker open and
discarding the answer, both **New Tab** and **File > Open Repository …** are disabled at four
tabs: the menu says no before the picker appears.
