import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, AlertTriangle, ChevronRight, CloudUpload } from 'lucide-react';
import {
  listStoredScores,
  saveStoredScore,
  deleteStoredScore,
  BUILT_IN_SCORES,
  type StoredScore,
} from '../modules/score-engine/scoreStore';
import { validateScoreFile } from '../modules/score-engine/fileValidator';
import { importScoreBytes } from '../modules/score-engine/importScore';
import { extractScoreTimeline } from '../modules/score-engine/timelineExtractor';
import { useLibrary } from '../hooks/useLibrary';
import { LibrarySection } from '../components/songs/LibrarySection';
import { downloadLibraryFile, type LibraryEntry } from '../modules/library/libraryClient';

export interface SongsPageProps {
  readonly currentScoreId: string;
  /** Opens the score on the play screen. */
  readonly onPlayScore: (score: StoredScore) => void;
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
 * Songs: the home screen. Built-in pieces and your own MusicXML imports; tap one to play.
 */
export function SongsPage({ currentScoreId, onPlayScore }: SongsPageProps) {
  const [scores, setScores] = useState<readonly StoredScore[]>(BUILT_IN_SCORES);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const library = useLibrary();

  const refreshScores = async () => {
    try {
      setScores(await listStoredScores());
    } catch (err) {
      console.warn('Failed to load stored scores:', err);
    }
  };

  useEffect(() => {
    refreshScores();
  }, []);

  const metas = useMemo(() => new Map(scores.map((s) => [s.id, metaFor(s)])), [scores]);

  const handleProcessFile = async (file: File) => {
    setUploadError(null);
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
      const newScore = await importScoreBytes(file.name, buffer);
      await saveStoredScore(newScore);
      await refreshScores();
      // Keep a copy in the shared library for the other devices. Playing must not wait for it.
      if (library.autoUpload) {
        library.upload(file.name, buffer).catch((err) => console.warn('Could not save to the library:', err));
      }
      onPlayScore(newScore);
    } catch (err) {
      setUploadError(`Upload error: ${err instanceof Error ? err.message : 'Failed to process score file'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (scoreId: string) => {
    try {
      await deleteStoredScore(scoreId);
      await refreshScores();
    } catch (err) {
      console.warn('Failed to delete score:', err);
    }
  };

  /** Brings a library file onto this device. */
  const handleAddFromLibrary = async (entry: LibraryEntry) => {
    const buffer = await downloadLibraryFile(entry.name);
    await saveStoredScore(await importScoreBytes(entry.name, buffer));
    await refreshScores();
  };

  /** Sends a score that is only on this device to the library, as plain MusicXML. */
  const handleSendToLibrary = async (score: StoredScore) => {
    setUploadError(null);
    try {
      await library.upload(`${score.fileName.replace(/\.[^.]+$/, '')}.musicxml`, score.xmlContent);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not save to the library.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleProcessFile(file);
  };

  const builtIn = scores.filter((s) => s.isBuiltIn);
  const mine = scores.filter((s) => !s.isBuiltIn);

  const renderRow = (score: StoredScore) => {
    const meta = metas.get(score.id);
    const isCurrent = score.id === currentScoreId;
    return (
      <li key={score.id} className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => onPlayScore(score)}
          aria-label={`Play ${score.title}`}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 rounded-[20px] text-left cursor-pointer"
          style={{ backgroundColor: 'var(--plate)', border: `1px solid ${isCurrent ? 'var(--ebony)' : 'var(--rule)'}` }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold leading-tight">{score.title}</span>
            <span className="block text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
              {meta ? `${meta.measures} bars at ${meta.bpm} bpm` : score.fileName}
            </span>
          </span>
          <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--muted)' }} />
        </button>
        {!score.isBuiltIn && library.state !== 'loading' && library.state.status === 'available' && !library.has(score.fileName) && (
          <button
            type="button"
            onClick={() => handleSendToLibrary(score)}
            aria-label={`Save ${score.title} to the shared library`}
            className="w-12 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            <CloudUpload className="w-5 h-5" />
          </button>
        )}
        {!score.isBuiltIn && (
          <button
            type="button"
            onClick={() => handleDelete(score.id)}
            aria-label={`Delete ${score.title}`}
            className="w-12 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--sharp)' }}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div
      className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(1rem,var(--safe-top))] pb-8"
      data-testid="songs-page"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <h1 className="text-[30px] font-extrabold tracking-tight">Songs</h1>
      <p className="text-[15px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
        Play any piece from start to finish, at your own pace.
      </p>

      {uploadError && (
        <div
          role="alert"
          aria-label="Upload Validation Message"
          className="mt-4 p-4 rounded-[20px] flex gap-3 text-[15px] leading-snug"
          style={{ backgroundColor: '#fde8ee', color: '#7a1832' }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="whitespace-pre-line">{uploadError}</p>
        </div>
      )}

      <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
        Built into the app
      </h2>
      <ul className="space-y-2">{builtIn.map(renderRow)}</ul>

      <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
        Your scores
      </h2>
      {mine.length > 0 ? (
        <ul className="space-y-2">{mine.map(renderRow)}</ul>
      ) : (
        <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Export a piece from MuseScore as MusicXML (.mxl or .musicxml) and add it here.
        </p>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="mt-4 w-full min-h-14 rounded-[20px] inline-flex items-center justify-center gap-2 text-[17px] font-extrabold cursor-pointer"
        style={{
          border: `2px dashed ${isDragging ? 'var(--ebony)' : 'var(--rule-strong)'}`,
          backgroundColor: isDragging ? 'var(--rosin-soft)' : 'transparent',
          color: 'var(--ink)',
        }}
      >
        <Plus className="w-5 h-5" />
        {isUploading ? 'Reading the score…' : 'Add a score'}
      </button>
      <LibrarySection library={library} localFileNames={mine.map((s) => s.fileName)} onAdd={handleAddFromLibrary} />

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
    </div>
  );
}
