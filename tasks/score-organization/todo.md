# Todo: Score Organization, Directories, and Renaming

## Task 1: Storage Layer & Data Model
- [x] Extend `StoredScore` with `folderId?: string | null` in `src/modules/score-engine/scoreStore.ts`.
- [x] Export `ScoreFolder` interface (`id`, `name`, `parentId?: string | null`, `createdAt: number`).
- [x] Implement `listScoreFolders`, `saveScoreFolder`, `renameScoreFolder`, and recursive `deleteScoreFolder`.
- [x] Implement `renameStoredScore` and `moveStoredScore`.
- [x] Support built-in score overrides for moving and renaming; revert built-ins to root if their containing folder is deleted.
- [x] Add unit tests in `tests/unit/score-engine.test.ts`.

## Task 2: Folder Hierarchy, Navigation & Creation in SongsPage
- [x] Add `currentFolderId: string | null` state in `SongsPage.tsx`.
- [x] Add "+ New folder" button and creation input/form.
- [x] Render breadcrumb header (`Songs / [Folder] / [Subfolder]`) and "← Back" button.
- [x] Render folders for current directory with item count badge and drill-down navigation.
- [x] Filter score listings to display only items in `currentFolderId`.
- [x] Verify navigation and folder creation with tests.

## Task 3: Renaming & Deleting Folders with Warning Modal
- [x] Add inline rename action (pencil icon) for scores (updates title).
- [x] Add inline rename action (pencil icon) for folders (updates folder name).
- [x] Add warning confirmation modal on folder delete displaying counts of contained scores and subfolders.
- [x] On confirm, execute cascade delete and refresh score and folder lists.
- [x] Verify renaming and delete modal with tests.

## Task 4: Drag & Drop Score Moving & "Move to..." Picker (Option B)
- [x] Enable mouse dragging on score items (`draggable={true}`, `onDragStart`, `onDragEnd`).
- [x] Add drop target handlers to folder cards (`onDragOver`, `onDragLeave`, `onDrop`) moving dropped score into folder.
- [x] Add "Move to..." action and destination modal (Option B) to move scores to Root or any folder.
- [x] Add comprehensive test suite in `tests/unit/songs-organization.test.tsx` verifying drag & drop, navigation into subfolders, and moving scores.
- [x] Run full test suite (`npm test -- --run`) and verify all tests pass.
