# Spec: Score Organization, Directories, and Renaming

Status: **Draft for Review**  
Author: Assistant & User  
Target version: `0.3.0`

---

## 1. Objective

Enable users to organize their music library by creating nested directories (folders), renaming scores and folders, moving scores between folders via mouse drag-and-drop or a "Move to..." picker, and deleting folders with a confirmation warning that removes all contained contents. Built-in scores can also be organized into folders and renamed.

---

## 2. Commands

- **Build**: `npm run build`
- **Test**: `npm test -- --run`
- **Dev**: `npm run dev`

---

## 3. Project Structure & Impacted Files

- `src/modules/score-engine/scoreStore.ts`:
  - Extend `StoredScore` with `folderId?: string | null`.
  - Introduce `ScoreFolder` interface (`id`, `name`, `parentId?: string | null`, `createdAt: number`).
  - Add persistence methods: `listScoreFolders`, `saveScoreFolder`, `renameScoreFolder`, `deleteScoreFolder` (recursive cascade), `renameStoredScore`, `moveStoredScore`.
  - Support overrides for built-in scores so that moving or renaming a built-in score persists in storage.
- `src/pages/SongsPage.tsx`:
  - Folder state management (`currentFolderId: string | null`).
  - Breadcrumbs & navigation header (`Songs > Folder > Subfolder`, Back button).
  - "New folder" action button & creation input.
  - Folder item cards with item counts, drill-down on click, rename, delete with warning modal, and drag-and-drop target handlers.
  - Score item cards with `draggable={true}`, drag handlers, inline rename action, "Move to..." folder picker dialog (Option B), and delete.
  - Delete folder warning modal displaying counts of affected scores and subfolders.
- `tests/unit/score-engine.test.ts`:
  - Tests for folder CRUD, recursive folder deletion, moving scores, renaming scores, and built-in score overrides.
- `tests/unit/songs-organization.test.tsx`:
  - Integration/UI tests for folder creation, drill-down navigation, breadcrumb navigation, score drag-and-drop, inline renaming, "Move to..." modal, and folder deletion confirmation.

---

## 4. Requirements & UX Design

### 4.1 Folder Navigation & Hierarchy
1. **Root & Drill-Down**:
   - The default view (`currentFolderId = null`) shows Root folders and Root scores.
   - Clicking a folder card drills down into that folder (`currentFolderId = folder.id`).
   - Inside a folder, the view displays only child folders (`parentId === currentFolderId`) and child scores (`folderId === currentFolderId`).
2. **Breadcrumbs & Back Navigation**:
   - A breadcrumb trail shows the current path: e.g. `Songs / Etudes / Kreutzer`.
   - Clicking any ancestor breadcrumb navigates directly to that folder.
   - A "← Back" button navigates to the immediate parent folder (or Root).

### 4.2 Score & Folder Drag-and-Drop
1. **Drag Source**:
   - Each score card is draggable via mouse (`draggable={true}`, `onDragStart`).
2. **Drop Targets**:
   - Any folder card in the current view is an active drop target (`onDragOver`, `onDragLeave`, `onDrop`).
   - When dragged over, the folder card highlights (e.g. `var(--rosin-soft)` background with dashed border).
   - Dropping a score onto a folder card moves the score into that folder (`score.folderId = folder.id`).
3. **Subfolder Moving**:
   - To move a score into a subfolder: the user clicks on the folder to navigate into it, revealing the subfolders inside, and drags the score onto the desired subfolder.

### 4.3 "Move to..." Action (Option B)
1. In addition to drag-and-drop, every score card features a "Move to..." action (accessible via a folder/move icon or action menu).
2. Clicking "Move to..." opens a modal or bottom sheet listing all available destinations:
   - Root (`/`)
   - All folders in the hierarchy with nested indentation.
3. Selecting a destination moves the score immediately. This allows easy movement up to parent folders or to any folder across the tree.

### 4.4 Renaming
1. **Scores**:
   - Every score (both user and built-in) has a Rename action (pencil icon).
   - Clicking Rename switches the score title into an inline editable input (or opens an edit prompt) with Save (Enter / check button) and Cancel (Escape).
   - Saving updates the score title in storage and updates the UI immediately.
2. **Folders**:
   - Every folder has a Rename action (pencil icon).
   - Clicking Rename switches the folder name into an inline editable input with Save and Cancel.
   - Saving updates the folder name in storage.

### 4.5 Folder Removal & Warning Modal
1. Clicking the Delete (trash) icon on a folder triggers a warning confirmation modal.
2. The modal clearly states:
   - *"Delete folder '[Name]'?"*
   - *"This will permanently delete [X] score(s) and [Y] subfolder(s) inside."*
   - Buttons: `Cancel` (neutral) and `Delete Folder and Contents` (destructive red).
3. Upon confirmation:
   - The folder and all its descendant subfolders are removed from storage.
   - All user scores inside the folder hierarchy are deleted from storage.
   - Any built-in scores inside the folder hierarchy are safely reset to Root (`folderId: null`) rather than destroyed from the app code.

### 4.6 Built-in Scores Movability
- Built-in scores can be moved into folders (via drag-and-drop or "Move to...") and renamed.
- Storage stores an override entry (`score:<id>`) storing the updated `title` and `folderId`.
- Built-in scores cannot be deleted individually; if their containing folder is deleted, they revert to Root.

---

## 5. Data Model

```typescript
export interface ScoreFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly createdAt: number;
}

export interface StoredScore {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly format: 'musicxml' | 'mxl';
  readonly isBuiltIn: boolean;
  readonly xmlContent: string;
  readonly uploadedAt?: number;
  readonly folderId?: string | null;
}
```

Storage keys:
- Scores: `score:<scoreId>`
- Folders: `folder:<folderId>`

---

## 6. Acceptance Criteria

1. [ ] Can create a new folder at root and inside an existing folder.
2. [ ] Can rename any folder; new name persists after reload.
3. [ ] Can rename any score (including built-ins); new title persists after reload.
4. [ ] Can drag a score onto a folder card with the mouse to move it into that folder.
5. [ ] Clicking a folder navigates inside, showing breadcrumbs and only items within that folder.
6. [ ] Can move a score to a subfolder by navigating into the folder and dragging into the subfolder.
7. [ ] Can move a score back to root or any folder using the "Move to..." picker (Option B).
8. [ ] Deleting a folder prompts with a warning dialog detailing how many scores/subfolders will be deleted.
9. [ ] Confirming folder deletion deletes all subfolders and user scores inside. Built-in scores in the deleted folder are safely reset to root.
10. [ ] All existing automated tests continue to pass without regressions.
