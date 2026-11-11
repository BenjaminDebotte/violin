import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  AlertTriangle,
  ChevronRight,
  CloudUpload,
  Folder,
  FolderPlus,
  Pencil,
  ArrowLeft,
  Check,
  X,
  FolderInput,
} from 'lucide-react';
import {
  listStoredScores,
  saveStoredScore,
  deleteStoredScore,
  listScoreFolders,
  saveScoreFolder,
  renameScoreFolder,
  deleteScoreFolder,
  renameStoredScore,
  moveStoredScore,
  BUILT_IN_SCORES,
  type StoredScore,
  type ScoreFolder,
} from '../modules/score-engine/scoreStore';
import { validateScoreFile } from '../modules/score-engine/fileValidator';
import { importScoreBytes } from '../modules/score-engine/importScore';
import { extractScoreTimeline } from '../modules/score-engine/timelineExtractor';
import { useLibrary } from '../hooks/useLibrary';
import { LibrarySection } from '../components/songs/LibrarySection';
import { libraryKey, LibraryError, type LibraryEntry } from '../modules/library/libraryClient';

export interface SongsPageProps {
  readonly currentScoreId: string;
  /** Opens the score on the play screen. */
  readonly onPlayScore: (score: StoredScore) => void;
  /** Optional shared notice from a background library auto-upload that completed after navigation. */
  readonly libraryNotice?: string | null;
  /** Reports a background library auto-upload notice so it survives navigation to Play. */
  readonly onLibraryNotice?: (msg: string | null) => void;
}

interface ScoreMeta {
  readonly measures: number;
  readonly bpm: number;
}

function metaFor(score: StoredScore): ScoreMeta | null {
  try {
    const t = extractScoreTimeline(score.xmlContent);
    return { measures: t.measures.length, bpm: Math.round(t.initialTempoBpm) };
  } catch {
    return null;
  }
}

/**
 * Songs: the home screen. Built-in pieces, folders, and MusicXML imports.
 */
export function SongsPage({
  currentScoreId,
  onPlayScore,
  libraryNotice,
  onLibraryNotice,
}: SongsPageProps) {
  const [scores, setScores] = useState<readonly StoredScore[]>(BUILT_IN_SCORES);
  const [folders, setFolders] = useState<readonly ScoreFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Editing names
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editingScoreTitle, setEditingScoreTitle] = useState('');

  // Modals & drag-drop
  const [deletingFolder, setDeletingFolder] = useState<ScoreFolder | null>(null);
  const [movingScore, setMovingScore] = useState<StoredScore | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const library = useLibrary();

  const refreshData = async () => {
    try {
      const [allScores, allFolders] = await Promise.all([
        listStoredScores(),
        listScoreFolders(),
      ]);
      setScores(allScores);
      setFolders(allFolders);
    } catch (err) {
      console.warn('Failed to load stored scores or folders:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const metas = useMemo(() => new Map(scores.map((s) => [s.id, metaFor(s)])), [scores]);

  // Current folder and breadcrumb path
  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [currentFolderId, folders],
  );

  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const trail: ScoreFolder[] = [];
    let cur: string | null = currentFolderId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const f = folders.find((item) => item.id === cur);
      if (!f) break;
      trail.unshift(f);
      cur = f.parentId ?? null;
    }
    return trail;
  }, [currentFolderId, folders]);

  const parentFolder = useMemo(() => {
    if (!currentFolder?.parentId) return null;
    return folders.find((f) => f.id === currentFolder.parentId) ?? null;
  }, [currentFolder, folders]);

  const handleProcessFile = async (file: File) => {
    setUploadError(null);
    onLibraryNotice?.(null);
    const validation = validateScoreFile({ name: file.name, size: file.size });
    if (!validation.valid) {
      setUploadError(validation.userMessage);
      return;
    }
    setIsUploading(true);
    try {
      const buffer: ArrayBuffer =
        typeof file.arrayBuffer === 'function'
          ? await file.arrayBuffer()
          : await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = () => reject(reader.error);
              reader.readAsArrayBuffer(file);
            });
      const imported = await importScoreBytes(file.name, buffer);
      const newScore: StoredScore = {
        ...imported,
        folderId: currentFolderId,
      };
      await saveStoredScore(newScore);
      await refreshData();
      // Keep a copy in the shared library for the other devices. Playing must not wait for it.
      if (library.autoUpload && typeof library.state === 'object' && library.state.status === 'available') {
        void library
          .upload(file.name, buffer)
          .then((outcome) => {
            if (outcome === 'exists') {
              setUploadError('Already in the library.');
              onLibraryNotice?.('Already in the library.');
            }
          })
          .catch((err) => {
            const msg =
              err instanceof LibraryError && err.kind === 'rejected'
                ? 'Writing to the library is for administrators.'
                : err instanceof Error
                  ? err.message
                  : 'Could not save to the library.';
            console.warn('Could not save to the library:', err);
            setUploadError(msg);
            onLibraryNotice?.(msg);
          });
      }
      onPlayScore(newScore);
    } catch (err) {
      setUploadError(`Upload error: ${err instanceof Error ? err.message : 'Failed to process score file'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteScore = async (scoreId: string) => {
    try {
      await deleteStoredScore(scoreId);
      await refreshData();
    } catch (err) {
      console.warn('Failed to delete score:', err);
    }
  };

  /** Brings a library file onto this device (idempotent per libraryKey). */
  const handleAddFromLibrary = async (entry: LibraryEntry) => {
    const key = libraryKey(entry.name);
    if ((await listStoredScores()).some((s) => libraryKey(s.fileName) === key)) {
      await refreshData();
      return;
    }
    const buffer = await library.download(entry.name);
    const imported = await importScoreBytes(entry.name, buffer);
    if ((await listStoredScores()).some((s) => libraryKey(s.fileName) === key)) {
      await refreshData();
      return;
    }
    const scoreWithFolder: StoredScore = {
      ...imported,
      folderId: currentFolderId,
    };
    await saveStoredScore(scoreWithFolder);
    await refreshData();
  };

  /** Sends a score that is only on this device to the library, as plain MusicXML. */
  const handleSendToLibrary = async (score: StoredScore) => {
    if (savingId) return;
    setSavingId(score.id);
    setUploadError(null);
    onLibraryNotice?.(null);
    setRowErrors((prev) => ({ ...prev, [score.id]: '' }));
    try {
      const outcome = await library.upload(
        `${score.fileName.replace(/\.[^.]+$/, '')}.musicxml`,
        score.xmlContent,
      );
      if (outcome === 'exists') {
        setRowErrors((prev) => ({ ...prev, [score.id]: 'Already in the library.' }));
      }
    } catch (err) {
      const msg =
        err instanceof LibraryError && err.kind === 'rejected'
          ? 'Writing to the library is for administrators.'
          : err instanceof Error
            ? err.message
            : 'Could not save to the library.';
      setRowErrors((prev) => ({ ...prev, [score.id]: msg }));
      setUploadError(msg);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateFolder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await saveScoreFolder({
        id,
        name: trimmed,
        parentId: currentFolderId,
        createdAt: Date.now(),
      });
      setNewFolderName('');
      setIsCreatingFolder(false);
      await refreshData();
    } catch (err) {
      console.warn('Failed to create folder:', err);
    }
  };

  const getFolderContentsCount = (rootId: string) => {
    const descendantFolderIds = new Set<string>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of folders) {
        if (f.parentId && descendantFolderIds.has(f.parentId) && !descendantFolderIds.has(f.id)) {
          descendantFolderIds.add(f.id);
          added = true;
        }
      }
    }
    const scoreCount = scores.filter((s) => s.folderId && descendantFolderIds.has(s.folderId)).length;
    const subfolderCount = descendantFolderIds.size - 1;
    return { scoreCount, subfolderCount };
  };

  // Drag & drop file on page background
  const handlePageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleProcessFile(file);
  };

  // Filter items in current view
  const currentFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId);
  const currentScores = scores.filter((s) => (s.folderId ?? null) === currentFolderId);

  const builtInAtRoot = currentFolderId === null ? currentScores.filter((s) => s.isBuiltIn) : [];
  const userScoresAtRoot = currentFolderId === null ? currentScores.filter((s) => !s.isBuiltIn) : [];

  const renderScoreRow = (score: StoredScore) => {
    const meta = metas.get(score.id);
    const isCurrent = score.id === currentScoreId;
    const onlyOnDevice =
      !score.isBuiltIn &&
      typeof library.state === 'object' &&
      library.state.status === 'available' &&
      !library.has(score.fileName);
    const isSaving = savingId === score.id;
    const rowError = rowErrors[score.id];
    const isEditing = editingScoreId === score.id;

    return (
      <li
        key={score.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-score-id', score.id);
          e.dataTransfer.setData('text/plain', score.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-stretch gap-1">
          {isEditing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const trimmed = editingScoreTitle.trim();
                if (!trimmed) return;
                await renameStoredScore(score.id, trimmed);
                setEditingScoreId(null);
                await refreshData();
              }}
              className="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-[20px]"
              style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--ebony)' }}
            >
              <input
                type="text"
                value={editingScoreTitle}
                onChange={(e) => setEditingScoreTitle(e.target.value)}
                autoFocus
                className="flex-1 min-w-0 px-3 py-1.5 rounded-[14px] text-[16px] font-bold outline-none"
                style={{ backgroundColor: 'var(--bone)', border: '1px solid var(--rule-strong)' }}
              />
              <button
                type="submit"
                aria-label="Save score title"
                className="min-h-10 min-w-10 rounded-full flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
              >
                <Check className="w-4 h-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Cancel score rename"
                onClick={() => setEditingScoreId(null)}
                className="min-h-10 min-w-10 rounded-full flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => onPlayScore(score)}
              aria-label={`Play ${score.title}`}
              className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 rounded-[20px] text-left cursor-pointer"
              style={{
                backgroundColor: 'var(--plate)',
                border: `1px solid ${isCurrent ? 'var(--ebony)' : 'var(--rule)'}`,
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-extrabold leading-tight break-words">{score.title}</span>
                <span className="block text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  {meta ? `${meta.measures} bars at ${meta.bpm} bpm` : score.fileName}
                </span>
                {onlyOnDevice && (
                  <span
                    className="inline-block mt-1 text-[12px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--rule)', color: 'var(--ink-2)' }}
                  >
                    Only on this device
                  </span>
                )}
              </span>
              <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden />
            </button>
          )}

          {/* Move to... Action (Option B) */}
          <button
            type="button"
            onClick={() => setMovingScore(score)}
            aria-label={`Move ${score.title}`}
            title="Move to folder"
            className="min-h-11 min-w-11 w-11 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            <FolderInput className="w-4 h-4" aria-hidden />
          </button>

          {/* Rename Action */}
          <button
            type="button"
            onClick={() => {
              setEditingScoreId(score.id);
              setEditingScoreTitle(score.title);
            }}
            aria-label={`Rename ${score.title}`}
            title="Rename score"
            className="min-h-11 min-w-11 w-11 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            <Pencil className="w-4 h-4" aria-hidden />
          </button>

          {onlyOnDevice && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSendToLibrary(score)}
              aria-label={`Save ${score.title} to the shared library`}
              className="min-h-11 min-w-11 w-11 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer disabled:opacity-50"
              style={{ color: 'var(--ink-2)' }}
            >
              <CloudUpload className="w-5 h-5" aria-hidden />
            </button>
          )}

          {!score.isBuiltIn && (
            <button
              type="button"
              onClick={() => handleDeleteScore(score.id)}
              aria-label={`Delete ${score.title}`}
              className="min-h-11 min-w-11 w-11 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer"
              style={{ color: 'var(--sharp)' }}
            >
              <Trash2 className="w-5 h-5" aria-hidden />
            </button>
          )}
        </div>
        {rowError && (
          <p className="px-4 text-[13px] font-medium" style={{ color: 'var(--sharp)' }}>
            {rowError}
          </p>
        )}
      </li>
    );
  };

  const renderFolderRow = (folder: ScoreFolder) => {
    const isEditing = editingFolderId === folder.id;
    const isDragTarget = dragOverFolderId === folder.id;

    // Count items
    const scoreCount = scores.filter((s) => s.folderId === folder.id).length;
    const subfolderCount = folders.filter((f) => f.parentId === folder.id).length;
    const totalItems = scoreCount + subfolderCount;

    return (
      <li
        key={folder.id}
        data-testid={`folder-card-${folder.id}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverFolderId(folder.id);
        }}
        onDragLeave={() => {
          if (dragOverFolderId === folder.id) setDragOverFolderId(null);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOverFolderId(null);
          const scoreId = e.dataTransfer.getData('application/x-score-id') || e.dataTransfer.getData('text/plain');
          if (scoreId) {
            await moveStoredScore(scoreId, folder.id);
            await refreshData();
          }
        }}
        className="flex flex-col gap-1"
      >
        <div
          className="flex items-stretch gap-1 rounded-[20px] transition-colors"
          style={{
            backgroundColor: isDragTarget ? 'var(--rosin-soft)' : 'var(--plate)',
            border: `2px ${isDragTarget ? 'dashed' : 'solid'} ${isDragTarget ? 'var(--ebony)' : 'var(--rule)'}`,
          }}
        >
          {isEditing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const trimmed = editingFolderName.trim();
                if (!trimmed) return;
                await renameScoreFolder(folder.id, trimmed);
                setEditingFolderId(null);
                await refreshData();
              }}
              className="flex-1 min-w-0 flex items-center gap-2 p-2"
            >
              <input
                type="text"
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                autoFocus
                className="flex-1 min-w-0 px-3 py-1.5 rounded-[14px] text-[16px] font-bold outline-none"
                style={{ backgroundColor: 'var(--bone)', border: '1px solid var(--rule-strong)' }}
              />
              <button
                type="submit"
                aria-label="Save folder name"
                className="min-h-10 min-w-10 rounded-full flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
              >
                <Check className="w-4 h-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Cancel folder rename"
                onClick={() => setEditingFolderId(null)}
                className="min-h-10 min-w-10 rounded-full flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCurrentFolderId(folder.id)}
                aria-label={`Open folder ${folder.name}`}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer"
              >
                <Folder className="w-5 h-5 shrink-0 text-amber-500 fill-amber-500/20" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-extrabold leading-tight break-words">{folder.name}</span>
                  <span className="block text-[13px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                    {totalItems} {totalItems === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingFolderId(folder.id);
                  setEditingFolderName(folder.name);
                }}
                aria-label={`Rename folder ${folder.name}`}
                title="Rename folder"
                className="min-h-11 min-w-11 w-11 shrink-0 flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--ink-2)' }}
              >
                <Pencil className="w-4 h-4" aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => setDeletingFolder(folder)}
                aria-label={`Delete folder ${folder.name}`}
                title="Delete folder"
                className="min-h-11 min-w-11 w-11 shrink-0 flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--sharp)' }}
              >
                <Trash2 className="w-5 h-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div
      className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(1rem,var(--safe-top))] pb-8"
      data-testid="songs-page"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handlePageDrop}
    >
      {/* Breadcrumb / Back button when inside a folder */}
      {currentFolderId !== null && (
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCurrentFolderId(parentFolder?.id ?? null)}
            aria-label={parentFolder ? `Back to ${parentFolder.name}` : 'Back to Songs'}
            className="inline-flex items-center gap-1.5 text-[15px] font-bold cursor-pointer hover:underline"
            style={{ color: 'var(--ink-2)' }}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            <span>Back to {parentFolder?.name ?? 'Songs'}</span>
          </button>
          <div className="flex items-center gap-1.5 text-[14px] flex-wrap" style={{ color: 'var(--muted)' }}>
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className="hover:underline cursor-pointer font-medium"
              style={{ color: 'var(--ink-2)' }}
            >
              Songs
            </button>
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={b.id}>
                <span>/</span>
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-extrabold text-[var(--ink)]">{b.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(b.id)}
                    className="hover:underline cursor-pointer font-medium"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {b.name}
                  </button>
                )}
              </React.Fragment>
            ))}
          </div>
        </nav>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight">
            {currentFolder ? currentFolder.name : 'Songs'}
          </h1>
          <p className="text-[15px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
            {currentFolder
              ? 'Organized scores in this directory.'
              : 'Play any piece from start to finish, at your own pace.'}
          </p>
        </div>
      </div>

      {(uploadError ?? libraryNotice) && (
        <div
          role="alert"
          aria-label="Upload Validation Message"
          className="mt-4 p-4 rounded-[20px] flex gap-3 text-[15px] leading-snug"
          style={{ backgroundColor: '#fde8ee', color: '#7a1832' }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
          <p className="whitespace-pre-line">{uploadError ?? libraryNotice}</p>
        </div>
      )}

      {/* Action Toolbar: Add Score and New Folder */}
      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex-1 min-h-12 rounded-[18px] inline-flex items-center justify-center gap-2 text-[15px] font-extrabold cursor-pointer"
          style={{
            border: `2px dashed ${isDraggingFile ? 'var(--ebony)' : 'var(--rule-strong)'}`,
            backgroundColor: isDraggingFile ? 'var(--rosin-soft)' : 'transparent',
            color: 'var(--ink)',
          }}
        >
          <Plus className="w-4 h-4" aria-hidden />
          {isUploading ? 'Reading score…' : 'Add a score'}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCreatingFolder(true);
            setNewFolderName('');
          }}
          aria-label="New folder"
          className="min-h-12 px-4 rounded-[18px] inline-flex items-center justify-center gap-2 text-[15px] font-extrabold cursor-pointer"
          style={{
            backgroundColor: 'var(--plate)',
            border: '1px solid var(--rule-strong)',
            color: 'var(--ink)',
          }}
        >
          <FolderPlus className="w-4 h-4 text-amber-500" aria-hidden />
          <span>New folder</span>
        </button>
      </div>

      {/* New folder creation inline card */}
      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="mt-3 p-3 rounded-[20px] flex items-center gap-2"
          style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--ebony)' }}
        >
          <Folder className="w-5 h-5 text-amber-500 shrink-0 ml-1" aria-hidden />
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            className="flex-1 min-w-0 px-3 py-1.5 rounded-[14px] text-[15px] font-bold outline-none"
            style={{ backgroundColor: 'var(--bone)', border: '1px solid var(--rule-strong)' }}
          />
          <button
            type="submit"
            className="min-h-10 px-3.5 rounded-full font-bold text-[14px] cursor-pointer"
            style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="min-h-10 px-3 rounded-full font-bold text-[14px] cursor-pointer"
            style={{ backgroundColor: 'transparent', color: 'var(--ink-2)' }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Folders Section */}
      {currentFolders.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
            Folders
          </h2>
          <ul className="space-y-2">{currentFolders.map(renderFolderRow)}</ul>
        </>
      )}

      {/* Root View: Preserves "Built into the app" and "Your scores" headers */}
      {currentFolderId === null ? (
        <>
          <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
            Built into the app
          </h2>
          {builtInAtRoot.length > 0 ? (
            <ul className="space-y-2">{builtInAtRoot.map(renderScoreRow)}</ul>
          ) : (
            <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
              Built-in scores moved to folders.
            </p>
          )}

          <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
            Your scores
          </h2>
          {userScoresAtRoot.length > 0 ? (
            <ul className="space-y-2">{userScoresAtRoot.map(renderScoreRow)}</ul>
          ) : (
            <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
              Export a piece from MuseScore as MusicXML (.mxl or .musicxml) and add it here.
            </p>
          )}
        </>
      ) : (
        /* Folder View */
        <>
          <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
            Scores
          </h2>
          {currentScores.length > 0 ? (
            <ul className="space-y-2">{currentScores.map(renderScoreRow)}</ul>
          ) : (
            <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
              This folder is empty. Drag a score here or add one using the button above.
            </p>
          )}
        </>
      )}

      {/* Shared Library section (available at root) */}
      {currentFolderId === null && (
        <LibrarySection
          library={library}
          localFileNames={scores.map((s) => s.fileName)}
          onAdd={handleAddFromLibrary}
        />
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".musicxml,.mxl,.xml"
        className="hidden"
        data-testid="score-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessFile(file);
        }}
      />

      {/* Delete Folder Warning Modal */}
      {deletingFolder && (() => {
        const { scoreCount, subfolderCount } = getFolderContentsCount(deletingFolder.id);
        return (
          <div
            role="dialog"
            aria-label="Delete Folder"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          >
            <div
              className="w-full max-w-md p-6 rounded-[24px] shadow-xl space-y-4"
              style={{ backgroundColor: 'var(--bone)', border: '1px solid var(--rule)' }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-full bg-red-100 text-red-600 shrink-0">
                  <AlertTriangle className="w-6 h-6" aria-hidden />
                </div>
                <div>
                  <h3 className="text-[20px] font-extrabold leading-tight">Delete Folder?</h3>
                  <p className="text-[15px] mt-1" style={{ color: 'var(--ink-2)' }}>
                    Are you sure you want to delete <strong>{deletingFolder.name}</strong>?
                    {' '}This will permanently delete {scoreCount} score{scoreCount === 1 ? '' : 's'}
                    {subfolderCount > 0 ? ` and ${subfolderCount} subfolder${subfolderCount === 1 ? '' : 's'}` : ''} inside.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingFolder(null)}
                  className="min-h-11 px-4 rounded-full font-bold text-[15px] cursor-pointer"
                  style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const toDeleteId = deletingFolder.id;
                    const parentId = deletingFolder.parentId ?? null;
                    setDeletingFolder(null);
                    await deleteScoreFolder(toDeleteId);
                    if (currentFolderId === toDeleteId) {
                      setCurrentFolderId(parentId);
                    }
                    await refreshData();
                  }}
                  className="min-h-11 px-4 rounded-full font-bold text-[15px] text-white bg-red-600 cursor-pointer hover:bg-red-700"
                >
                  Delete folder and contents
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Move to... Modal (Option B) */}
      {movingScore && (
        <div
          role="dialog"
          aria-label="Move to folder"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        >
          <div
            className="w-full max-w-md max-h-[80vh] flex flex-col p-6 rounded-[24px] shadow-xl space-y-4"
            style={{ backgroundColor: 'var(--bone)', border: '1px solid var(--rule)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-extrabold">Move to...</h3>
              <button
                type="button"
                onClick={() => setMovingScore(null)}
                aria-label="Close move dialog"
                className="p-1 rounded-full cursor-pointer hover:bg-black/5"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
              Choose a destination folder for <strong>{movingScore.title}</strong>:
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 py-1">
              {/* Root Destination */}
              <button
                type="button"
                disabled={!movingScore.folderId}
                onClick={async () => {
                  const scoreToMove = movingScore;
                  setMovingScore(null);
                  await moveStoredScore(scoreToMove.id, null);
                  await refreshData();
                }}
                aria-label="Move to root"
                className="w-full min-h-11 flex items-center justify-between px-3 py-2 rounded-[16px] text-left cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
              >
                <span className="flex items-center gap-2 font-bold text-[15px]">
                  <Folder className="w-4 h-4 text-amber-500" aria-hidden />
                  Root (Top level)
                </span>
                {!movingScore.folderId && (
                  <span className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                    Current
                  </span>
                )}
              </button>

              {/* Folder Destinations */}
              {folders.map((f) => {
                const isCurrent = movingScore.folderId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={async () => {
                      const scoreToMove = movingScore;
                      setMovingScore(null);
                      await moveStoredScore(scoreToMove.id, f.id);
                      await refreshData();
                    }}
                    aria-label={`Move to ${f.name}`}
                    className="w-full min-h-11 flex items-center justify-between px-3 py-2 rounded-[16px] text-left cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
                  >
                    <span className="flex items-center gap-2 font-bold text-[15px]">
                      <Folder className="w-4 h-4 text-amber-500" aria-hidden />
                      {f.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setMovingScore(null)}
                className="min-h-11 px-4 rounded-full font-bold text-[15px] cursor-pointer"
                style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
