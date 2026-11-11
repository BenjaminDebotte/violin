# Plan: Score Organization, Directories, and Renaming

**Spec:** `docs/specs/score-organization-and-folders.md`

## Architecture & Vertical Slices

We decompose this initiative into 4 vertical, independently testable tasks:

1. **Task 1: Storage Layer & Data Model**
   - Extend `StoredScore` with `folderId?: string | null`.
   - Add `ScoreFolder` interface (`id`, `name`, `parentId?: string | null`, `createdAt`).
   - Implement IndexedDB (and in-memory test fallback) operations in `src/modules/score-engine/scoreStore.ts`:
     - `listScoreFolders()`, `saveScoreFolder()`, `renameScoreFolder()`, `deleteScoreFolder()` (cascade delete).
     - `renameStoredScore()`, `moveStoredScore()`.
     - Built-in score overrides (moving/renaming built-in scores persists in storage, folder deletion reverts built-in scores to root).
   - Verify with comprehensive unit tests in `tests/unit/score-engine.test.ts`.

2. **Task 2: Folder Hierarchy, Navigation & Creation in SongsPage**
   - Add `currentFolderId: string | null` state in `SongsPage.tsx`.
   - Add "New folder" button and creation input/action.
   - Render breadcrumb navigation (`Songs > Folder > Subfolder`) and "← Back" button.
   - Render folder cards for `parentId === currentFolderId` with item counts and click-to-drill-down.
   - Filter score list to show items matching `currentFolderId`.
   - Verify that users can create folders and navigate into and out of them.

3. **Task 3: Renaming & Deleting Folders with Warning Modal**
   - Inline rename for folders and scores with keyboard support (Enter to save, Escape to cancel).
   - Folder deletion trigger showing accessible warning modal detailing count of nested scores and subfolders.
   - On confirmation, cascade-delete folder contents and update UI.
   - Verify with tests that renaming persists and folder deletion cleans up all children.

4. **Task 4: Drag & Drop Score Moving & "Move to..." Picker (Option B)**
   - Score cards become draggable (`draggable={true}`, `onDragStart`, `onDragEnd`).
   - Folder cards become drop targets (`onDragOver`, `onDragLeave`, `onDrop`), moving the dropped score into the target folder.
   - Add "Move to..." dialog (Option B) listing "Root" and all folders with hierarchy indentation, allowing movement without dragging.
   - Comprehensive test suite in `tests/unit/songs-organization.test.tsx` verifying end-to-end user workflows.
