# Phase 1 — Component & State Contracts

This document is the canonical reference for *who renders what* and *who owns what state* in Feature 006. The actual TypeScript types live in the source files; this document explains the **intent** behind those types and the **interactions** the tasks phase must preserve.

The shape of `Tab`, `TabId`, and the workspace state is defined in [data-model.md](../data-model.md); this document references those types rather than restating them.

---

## 1. `App.tsx` (state owner)

`<App />` owns all top-level state. Children receive props; they call props back to mutate. No Context, no global store.

**State owned**:

- `tabs: Tab[]` — the ordered list of open tabs. Mutated only via `setTabs`. (Replaces the Feature 004 scalars `text`, `savedText`, `openedFile`.)
- `activeTabId: TabId | null` — the active-tab pointer. (New in this feature.)
- `error: string | null` — single workspace-level error (unchanged shape from Feature 003 / 004; messages are now tab-attributed; see data-model.md §3).
- `viewMode: ViewMode` — unchanged from Feature 003.
- `theme: Theme` — unchanged from Feature 003.
- `autoSave: boolean` — unchanged from Feature 004.
- `savingByTab: Record<TabId, boolean>` — per-tab in-flight save flag. (Replaces the scalar `saving`.)
- `pendingClose: TabId | null` — the tab that the user is being asked about in the close-confirm dialog. `null` when the dialog is closed.

**Refs owned**:

- `editorStatesRef: useRef<Map<TabId, EditorState>>` — per-tab CodeMirror snapshots. (New.)
- `editorRef: useRef<EditorHandle>` — imperative handle to the single live `<Editor />` instance for snapshot/restore. (New.)
- `pendingSaveRef: useRef<Map<TabId, boolean>>` — per-tab "schedule another save after this one finishes" flag. (Replaces the scalar `pendingSaveRef` ref from Feature 004.)
- `handleSaveRef`, `handleNewFileRef`, `handleOpenFileRef` — unchanged from Feature 004 (used by the global Ctrl/Cmd+S / N / O shortcut effect to read latest handlers without re-binding listeners).

**Handlers exposed to children**:

| Handler                                | Signature                                  | Replaces |
|----------------------------------------|--------------------------------------------|----------|
| `onActivateTab(id: TabId)`             | activate a tab (snapshot outgoing first)   | — (new)  |
| `onCloseTab(id: TabId)`                | begin close flow; opens confirm if modified | — (new) |
| `onOpenFile()`                         | open dialog → dedup or append new tab      | renamed from `handleOpenFile`; behaviour reshaped |
| `onNewFile()`                          | append an Untitled-N tab and activate it   | renamed from `handleNewFile`; behaviour reshaped |
| `onSave()`                             | save the active tab (uses Save-As if Untitled) | unchanged shape |
| `onToggleAutoSave(next: boolean)`      | unchanged from Feature 004                 | — |
| `onSetViewMode(mode: ViewMode)`        | unchanged from Feature 003                 | — |
| `onToggleTheme()`                      | unchanged from Feature 003                 | — |
| `onTextChange(text: string)`           | update active tab's `text`                 | from Feature 002 |
| `onConfirmSave()` / `onConfirmDiscard()` / `onConfirmCancel()` | close-confirm flow | — (new) |

**Effects**:

- `useEffect([activeTabId, activeTab?.openedFile?.name])` — calls `setWindowTitle(activeTab?.openedFile?.name ?? null)`. (Updates the OS window title to the active tab's name; FR-024.)
- `useEffect([theme])` — sets `document.documentElement.dataset.theme = theme`. Unchanged from Feature 003.
- `useEffect([activeTabId, tabs, autoSave, savingByTab])` — the auto-save debounce effect (see research.md §5).
- `useLayoutEffect([activeTabId])` — restores the incoming tab's `EditorState` snapshot if one exists. (New; see research.md §3.)
- `useEffect([])` — global keyboard shortcut listener for Ctrl/Cmd+S, Ctrl/Cmd+N, Ctrl/Cmd+O. Unchanged shape from Feature 004 (uses `handleSaveRef.current()` / `handleNewFileRef.current()` / `handleOpenFileRef.current()` so the listener never re-binds).

---

## 2. `<TabStrip />` (new)

A presentational component that renders the tab strip across the top of the workspace. No state of its own; everything flows from props.

**Props**:

```ts
type TabStripProps = {
  tabs: Tab[];                    // all open tabs in display order
  activeTabId: TabId | null;
  onActivate(id: TabId): void;
  onClose(id: TabId): void;
};
```

**Rendering contract**:

- When `tabs.length === 0`, render an empty-state band — a styled container with a faded label like "No files open". The band height matches the populated state so vertical layout does not jump as tabs come and go.
- When `tabs.length > 0`, render one pill per tab in array order. Each pill includes:
  - The asterisk modified indicator (`*`) when `tab.text !== tab.savedText`, prefixing the file name. (FR-007)
  - The file name text (truncated to fit within a `max-w-[180px]` pill). (FR-006, FR-008)
  - The close affordance (× icon button). Visible always — keyboard users cannot hover. (FR-013)
- The active pill is visually distinguished (different background, no opacity reduction, optional accent ring). (FR-005)
- The pill's `title` attribute is the full path (`tab.openedFile?.path`) for file-backed tabs, or the Untitled label for Untitled tabs, so hover discloses the full disambiguating string. (FR-008)
- The outer container has `overflow-x-auto flex-nowrap` so the strip scrolls horizontally when tabs exceed the visible width. (FR-010)
- On `activeTabId` change, the component runs a `useEffect` that calls `scrollIntoView({ behavior: 'instant', inline: 'nearest' })` on the active pill's DOM node so the active tab is never off-screen after a switch.

**Accessibility**:

- Outer container: `role="tablist"` with `aria-label="Open files"`.
- Each pill: `role="tab"` with `aria-selected={tab.id === activeTabId}` and a stable `id` for downstream `aria-controls`.
- Each close button: `aria-label="Close <displayName>"` (so screen readers announce which tab is being closed).
- Tabs are reachable via Tab key (`tabIndex={0}` on the active pill, `tabIndex={-1}` on inactive — standard tab-list roving-tabindex pattern). Pressing Enter / Space on a focused pill calls `onActivate(tab.id)`. Pressing Delete on a focused pill calls `onClose(tab.id)` (a nice-to-have; the close × button is the required affordance).

**Styling**:

- Reuses the Tailwind island-card pattern from Feature 004's `<FileHeader />` for the outer band: `rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur px-2 py-1.5`.
- Pills use a smaller `rounded-md` with the same surface variables. The active pill has `bg-[color:var(--islands-ring)]` plus a small accent ring; inactive pills have `hover:bg-[color:var(--islands-ring)]/50`.
- The close × button uses the same icon-button class as the theme toggle.

---

## 3. `<ConfirmDialog />` (new)

A presentational wrapper around the native `<dialog>` element. Used by the close-tab-with-unsaved-changes prompt (FR-015).

**Props**:

```ts
type ConfirmDialogProps = {
  open: boolean;
  title: string;     // e.g. "Save changes to notes.md?"
  message: string;   // e.g. "You have unsaved changes. Save them now?"
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
};
```

**Rendering contract**:

- Renders a `<dialog>` element. A `useEffect` keyed on `open` calls `dialogRef.current.showModal()` when true and `dialogRef.current.close()` when false.
- Body has a title (h2), a short message (p), and three buttons in this DOM order: Save, Discard, Cancel.
- Save is autofocused (`autoFocus` on the Save button) so Enter triggers the safer choice.
- Cancel button has `formMethod="dialog"` so pressing Escape closes the dialog natively, firing `onCancel`.
- The dialog's `cancel` event (fired on ESC) is wired to call `onCancel` so the parent state stays in sync.
- Backdrop clicks do NOT dismiss — the user must make an explicit choice.

**Accessibility**:

- Native `<dialog>` provides modality, focus trap, and ARIA-correct role automatically.
- The title is referenced via `aria-labelledby`; the message via `aria-describedby` for screen reader announcement.

**Styling**:

- The dialog's `::backdrop` is styled with `bg-black/30 backdrop-blur-sm`.
- The dialog body uses the island-card class chain — `rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-lg p-6 max-w-md`.
- Buttons use the same `buttonBase` class chain as the Toolbar buttons.

---

## 4. `<Editor />` (UPDATED — gains an imperative API)

The existing component grows a ref API for snapshot/restore. The `value` / `onChange` props remain.

**New shape**:

```ts
export type EditorHandle = {
  getState(): EditorState;
  setState(state: EditorState): void;
};

type EditorProps = {
  value: string;
  onChange(next: string): void;
};

const Editor = forwardRef<EditorHandle, EditorProps>(({ value, onChange }, ref) => {
  // … existing internals, plus:
  useImperativeHandle(ref, () => ({
    getState: () => viewRef.current!.state,
    setState: (state) => viewRef.current!.setState(state),
  }), []);
  // … existing render.
});

export default Editor;
```

**Contract changes vs Feature 002 / 003 / 004**:

- The existing "mount once, sync `value` into doc on prop change" effect (see [Editor.tsx:85-94](../../../src/components/Editor.tsx)) stays. Its dispatch is guarded by `current !== value` so it does NOT clobber a freshly-restored `EditorState` (the restored state's doc IS `value` by the time the layout-effect runs; the guard catches the no-op).
- `App` is the sole caller of `getState` / `setState`. No other component should import `EditorState` or call into the ref API.

**Why a ref API rather than a controlled `EditorState` prop**: see research.md §3 and the Complexity Tracking row in plan.md.

---

## 5. `<Workspace />` (UNCHANGED in shape)

Still takes `(text, viewMode, onTextChange)`. Now `text` is `activeTab?.text ?? ""` (computed in App). Internally, `<Workspace />` continues to render `<Editor />` and `<Preview />` with the view-mode rules from Feature 003.

**Editor mounting rule (carried over from Feature 003 §3)**:

- The Editor stays mounted across view-mode switches (hidden via `display: none` in preview-only mode).
- The Editor ALSO stays mounted across tab switches — the same single instance. This is what makes the snapshot/restore approach (research.md §3) work.

**Editor ref forwarding**: `<Workspace />` does NOT need to forward the Editor ref; `<App />` passes `editorRef` straight to `<Editor />` by rendering `<Editor ref={editorRef} value={…} onChange={…} />` inside `<Workspace />`. The cleanest plumbing is to add an optional `editorRef?: Ref<EditorHandle>` prop to `<Workspace />` and forward it to `<Editor />`. (Implementation detail — `<Workspace />` does not need to know about CodeMirror; it just passes the ref through.)

---

## 6. `<Toolbar />` (UNCHANGED in shape; semantics adjusted for active tab)

Props are unchanged from Feature 004. Their meaning is reinterpreted in App:

- `saveEnabled` ← `activeTab !== null && !savingByTab[activeTab.id]` (and the active tab's `openedFile` MAY be `null` — `performSave` handles the Save-As fallback for Untitled tabs).
- `saving` ← `savingByTab[activeTabId ?? ""] ?? false`.
- `autoSave` ← unchanged (still a workspace preference).
- `onNewFile` / `onOpenFile` / `onSave` / `onToggleAutoSave` / `onSetViewMode` / `onToggleTheme` ← unchanged shape; the App-side handlers now operate on the active tab.

**No new props.** The Toolbar component file is not edited; only the values App passes change.

---

## 7. `<FileHeader />` (DELETED)

The component file `src/components/FileHeader.tsx` is removed. Its import in `App.tsx` is removed; its render site is replaced by `<TabStrip />`. The `tabTitle` / `hoverTitle` / `isModified` concerns it owned are subsumed by per-pill rendering in `<TabStrip />`. (FR-023)

---

## 8. `<ErrorBanner />` (UNCHANGED)

The component is unchanged. App-side, the `error` string is now constructed with a tab attribution prefix (e.g. `Could not save Untitled-2: permission denied.`) so the user can identify which document's save failed (FR-021).

---

## 9. `<Preview />` (UNCHANGED)

Unchanged. Still receives `markdown={activeTab?.text ?? ""}` and renders the active tab's preview. Sanitisation rules from Feature 002 / 003 still apply.

---

## 10. Files touched at a glance

| File                                          | Action  | Why |
|-----------------------------------------------|---------|-----|
| `src/App.tsx`                                 | UPDATE  | Top-level state reshape (tabs[]/activeTabId), new handlers, snapshot/restore plumbing, render `<TabStrip />` instead of `<FileHeader />`, render `<ConfirmDialog />`. |
| `src/components/Editor.tsx`                   | UPDATE  | `forwardRef` + `useImperativeHandle` for `getState()` / `setState()`. |
| `src/components/TabStrip.tsx`                 | NEW     | The tab strip. |
| `src/components/ConfirmDialog.tsx`            | NEW     | Close-with-unsaved-changes prompt. |
| `src/components/FileHeader.tsx`               | DELETE  | Replaced by `<TabStrip />`. |
| `src/components/Workspace.tsx`                | UPDATE (small) | Forward an optional `editorRef` prop to `<Editor />`. |
| `src/components/Toolbar.tsx`                  | UNCHANGED | Props the same; values passed in change. |
| `src/components/Preview.tsx`                  | UNCHANGED | |
| `src/components/ErrorBanner.tsx`              | UNCHANGED | |
| `src/lib/fileOpen.ts`                         | UNCHANGED | All existing exports cover this feature. |
| `src/lib/preferences.ts`                      | UNCHANGED | No new preference. |
| `src/lib/starterContent.ts`                   | UNCHANGED | (No longer used as initial `text` — empty state replaces it. See note below.) |
| `src/lib/markdown.ts`                         | UNCHANGED | |
| `src-tauri/capabilities/default.json`         | UNCHANGED | Existing capabilities cover read + write. |
| `src-tauri/src/lib.rs`                        | UNCHANGED | |

**A note on `starterContent.ts`**: Feature 002 used it as the initial document content. Feature 004 carried it forward as the initial `text` AND initial `savedText`. In Feature 006, the empty state replaces "starter content" entirely — a fresh launch has no tabs, so there is no document to populate with the starter sample. The `starterContent.ts` file remains because (a) deleting it is unrelated cleanup, (b) future features (e.g., a "Welcome" empty-state CTA) may want to reuse the sample. If the maintainer prefers to delete it as part of this feature, that is a small one-line follow-up the tasks phase can include.

---

## 11. Test surface

No automated test suite is wired up (the pre-existing gap from Feature 002 / 003 / 004). Manual verification is in [quickstart.md](../quickstart.md), which maps every acceptance scenario and success criterion to a numbered manual step.

Each component's contract is intentionally narrow enough that a future testing setup could mount it in isolation with predictable mocks (`<TabStrip />` is purely presentational; `<ConfirmDialog />` is purely presentational; `<Editor />` needs a CodeMirror runtime). Once a runner is added, the priority order is:

1. `<TabStrip />` — most user-facing surface area, most edge cases (active highlight, modified indicator, overflow, close button visibility).
2. App-level state transitions — opening into a new vs existing tab, closing the active vs background tab, close-with-modified flow through ConfirmDialog.
3. CodeMirror snapshot/restore — selection and scroll are preserved on a round trip.
