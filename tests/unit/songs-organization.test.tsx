import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SongsPage } from '../../src/pages/SongsPage';
import {
  resetInMemoryScoreStore,
  saveStoredScore,
  saveScoreFolder,
  listStoredScores,
  listScoreFolders,
  BUILT_IN_SCORES,
  type StoredScore,
  type ScoreFolder,
} from '../../src/modules/score-engine/scoreStore';

describe('Songs Organization & Folders', () => {
  beforeEach(() => {
    resetInMemoryScoreStore();
  });

  it('renders root view with folders and root scores', async () => {
    const folder: ScoreFolder = {
      id: 'folder-1',
      name: 'Etudes',
      parentId: null,
      createdAt: Date.now(),
    };
    await saveScoreFolder(folder);

    render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Etudes')).toBeDefined();
    });

    expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeDefined();
    expect(screen.getByText('Minuet & Tied Note Etude')).toBeDefined();
  });

  it('creates a new folder at the current level', async () => {
    render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

    const newFolderBtn = screen.getByRole('button', { name: /new folder/i });
    fireEvent.click(newFolderBtn);

    const folderInput = screen.getByPlaceholderText(/folder name/i);
    fireEvent.change(folderInput, { target: { value: 'Kreutzer Studies' } });

    const createBtn = screen.getByRole('button', { name: /^create$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Kreutzer Studies')).toBeDefined();
    });

    const savedFolders = await listScoreFolders();
    expect(savedFolders.some((f) => f.name === 'Kreutzer Studies')).toBe(true);
  });

  it('navigates into a folder and back using breadcrumbs', async () => {
    const parentFolder: ScoreFolder = {
      id: 'folder-parent',
      name: 'Violin Methods',
      parentId: null,
      createdAt: 1000,
    };
    const childFolder: ScoreFolder = {
      id: 'folder-child',
      name: 'Wohlfahrt',
      parentId: 'folder-parent',
      createdAt: 2000,
    };
    await saveScoreFolder(parentFolder);
    await saveScoreFolder(childFolder);

    const scoreInParent: StoredScore = {
      id: 'score-parent',
      title: 'Method Intro',
      fileName: 'method.musicxml',
      format: 'musicxml',
      isBuiltIn: false,
      xmlContent: BUILT_IN_SCORES[0].xmlContent,
      folderId: 'folder-parent',
    };
    await saveStoredScore(scoreInParent);

    render(<SongsPage currentScoreId="" onPlayScore={vi.fn()} />);

    // At root: parent folder is visible, child folder is not
    await waitFor(() => {
      expect(screen.getByText('Violin Methods')).toBeDefined();
    });
    expect(screen.queryByText('Wohlfahrt')).toBeNull();

    // Click into parent folder
    fireEvent.click(screen.getByRole('button', { name: /open folder violin methods/i }));

    // Inside parent folder: child folder and scoreInParent are visible
    await waitFor(() => {
      expect(screen.getByText('Wohlfahrt')).toBeDefined();
      expect(screen.getByText('Method Intro')).toBeDefined();
    });

    // Back to root via breadcrumb or back button
    const backBtn = screen.getByRole('button', { name: /back to songs/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Violin Methods')).toBeDefined();
    });
  });

  it('renames a folder and renames a score', async () => {
    const folder: ScoreFolder = {
      id: 'folder-1',
      name: 'Original Folder',
      parentId: null,
      createdAt: 1000,
    };
    await saveScoreFolder(folder);

    render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Original Folder')).toBeDefined();
    });

    // 1. Rename folder
    const renameFolderBtn = screen.getByRole('button', { name: /rename folder original folder/i });
    fireEvent.click(renameFolderBtn);

    const folderInput = screen.getByDisplayValue('Original Folder');
    fireEvent.change(folderInput, { target: { value: 'Renamed Folder' } });

    const saveFolderBtn = screen.getByRole('button', { name: /save folder name/i });
    fireEvent.click(saveFolderBtn);

    await waitFor(() => {
      expect(screen.getByText('Renamed Folder')).toBeDefined();
    });

    // 2. Rename score
    const renameScoreBtn = screen.getByRole('button', { name: /rename twinkle, twinkle, little star/i });
    fireEvent.click(renameScoreBtn);

    const scoreInput = screen.getByDisplayValue('Twinkle, Twinkle, Little Star');
    fireEvent.change(scoreInput, { target: { value: 'Twinkle Variations' } });

    const saveScoreBtn = screen.getByRole('button', { name: /save score title/i });
    fireEvent.click(saveScoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Twinkle Variations')).toBeDefined();
    });

    const updatedScores = await listStoredScores();
    const twinkle = updatedScores.find((s) => s.id === 'twinkle');
    expect(twinkle?.title).toBe('Twinkle Variations');
  });

  it('shows warning modal on folder delete and cascade-deletes on confirmation', async () => {
    const folder: ScoreFolder = {
      id: 'folder-del',
      name: 'Folder To Delete',
      parentId: null,
      createdAt: 1000,
    };
    await saveScoreFolder(folder);

    const scoreInFolder: StoredScore = {
      id: 'score-del',
      title: 'Score Inside Folder',
      fileName: 'inside.musicxml',
      format: 'musicxml',
      isBuiltIn: false,
      xmlContent: BUILT_IN_SCORES[0].xmlContent,
      folderId: 'folder-del',
    };
    await saveStoredScore(scoreInFolder);

    render(<SongsPage currentScoreId="" onPlayScore={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Folder To Delete')).toBeDefined();
    });

    const deleteFolderBtn = screen.getByRole('button', { name: /delete folder folder to delete/i });
    fireEvent.click(deleteFolderBtn);

    // Warning modal should appear with details
    expect(screen.getByRole('dialog', { name: /delete folder/i })).toBeDefined();
    expect(screen.getByText(/permanently delete 1 score/i)).toBeDefined();

    // Cancel first
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog', { name: /delete folder/i })).toBeNull();
    expect(screen.getByText('Folder To Delete')).toBeDefined();

    // Open again and confirm
    fireEvent.click(deleteFolderBtn);
    const confirmDeleteBtn = screen.getByRole('button', { name: /delete folder and contents/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Folder To Delete')).toBeNull();
    });

    // Check storage
    const remainingFolders = await listScoreFolders();
    expect(remainingFolders.some((f) => f.id === 'folder-del')).toBe(false);

    const remainingScores = await listStoredScores();
    expect(remainingScores.some((s) => s.id === 'score-del')).toBe(false);
  });

  it('moves a score using the Move to... dialog (Option B)', async () => {
    const targetFolder: ScoreFolder = {
      id: 'folder-dest',
      name: 'Destination Folder',
      parentId: null,
      createdAt: 1000,
    };
    await saveScoreFolder(targetFolder);

    render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Destination Folder')).toBeDefined();
    });

    // Click "Move to..." on Twinkle
    const moveBtn = screen.getByRole('button', { name: /move twinkle, twinkle, little star/i });
    fireEvent.click(moveBtn);

    // Dialog opens with available destinations
    expect(screen.getByRole('dialog', { name: /move to/i })).toBeDefined();

    // Click on destination folder in the picker
    const destOption = screen.getByRole('button', { name: /move to destination folder/i });
    fireEvent.click(destOption);

    // Score moved out of Root view
    await waitFor(() => {
      expect(screen.queryByText('Twinkle, Twinkle, Little Star')).toBeNull();
    });

    // Open destination folder
    fireEvent.click(screen.getByRole('button', { name: /open folder destination folder/i }));

    // Twinkle is now inside destination folder!
    await waitFor(() => {
      expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeDefined();
    });
  });

  it('moves a score by dragging and dropping onto a folder', async () => {
    const targetFolder: ScoreFolder = {
      id: 'folder-drop',
      name: 'Drop Target Folder',
      parentId: null,
      createdAt: 1000,
    };
    await saveScoreFolder(targetFolder);

    render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Drop Target Folder')).toBeDefined();
    });

    const scoreCard = screen.getByText('Twinkle, Twinkle, Little Star').closest('[draggable="true"]');
    expect(scoreCard).not.toBeNull();

    const folderCard = screen.getByTestId('folder-card-folder-drop');

    // Simulate drag start
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type] || '';
      },
      effectAllowed: 'move',
      dropEffect: 'none',
      types: ['text/plain', 'application/x-score-id'],
    };

    fireEvent.dragStart(scoreCard!, { dataTransfer });
    fireEvent.dragOver(folderCard, { dataTransfer });
    fireEvent.drop(folderCard, { dataTransfer });

    // Score moved out of root
    await waitFor(() => {
      expect(screen.queryByText('Twinkle, Twinkle, Little Star')).toBeNull();
    });

    // Navigate into folder to verify it's there
    fireEvent.click(screen.getByRole('button', { name: /open folder drop target folder/i }));

    await waitFor(() => {
      expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeDefined();
    });
  });
});
