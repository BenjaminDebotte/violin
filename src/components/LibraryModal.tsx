import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Music,
  Check,
  Trash2,
  AlertCircle,
  FileMusic,
} from 'lucide-react';
import {
  listStoredScores,
  saveStoredScore,
  deleteStoredScore,
  BUILT_IN_SCORES,
  type StoredScore,
} from '../modules/score-engine/scoreStore';
import {
  validateScoreFile,
  unpackScoreFile,
} from '../modules/score-engine/fileValidator';
import { extractScoreTimeline } from '../modules/score-engine/timelineExtractor';

export interface LibraryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly currentScoreId: string;
  readonly onSelectScore: (score: StoredScore) => void;
}

/**
 * Score Library & MusicXML / MXL File Upload Modal.
 * Displays built-in demo pieces and user scores saved in IndexedDB.
 * Validates uploads and gives explicit MuseScore export instructions for .mscz and .pdf.
 */
export function LibraryModal({
  isOpen,
  onClose,
  currentScoreId,
  onSelectScore,
}: LibraryModalProps) {
  const [scores, setScores] = useState<readonly StoredScore[]>(BUILT_IN_SCORES);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load scores whenever modal opens
  const refreshScores = async () => {
    try {
      const loaded = await listStoredScores();
      setScores(loaded);
    } catch (err) {
      console.warn('Failed to list stored scores:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setUploadError(null);
      refreshScores();
    }
  }, [isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setUploadError(null);

    const validation = validateScoreFile({ name: file.name, size: file.size });
    if (!validation.valid) {
      setUploadError(validation.userMessage);
      return;
    }

    setIsUploading(true);
    try {
      let buffer: ArrayBuffer;
      if (typeof file.arrayBuffer === 'function') {
        buffer = await file.arrayBuffer();
      } else {
        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(file);
        });
      }
      const xmlContent = await unpackScoreFile(file.name, buffer);
      const timeline = extractScoreTimeline(xmlContent);

      const scoreId = `user-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const newScore: StoredScore = {
        id: scoreId,
        title: timeline.title || file.name,
        fileName: file.name,
        format: validation.format,
        isBuiltIn: false,
        xmlContent,
        uploadedAt: Date.now(),
      };

      await saveStoredScore(newScore);
      await refreshScores();
      onSelectScore(newScore);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process score file';
      setUploadError(`Upload error: ${message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDeleteScore = async (e: React.MouseEvent, scoreId: string) => {
    e.stopPropagation();
    try {
      await deleteStoredScore(scoreId);
      await refreshScores();
    } catch (err) {
      console.warn('Failed to delete score:', err);
    }
  };

  const builtInList = scores.filter((s) => s.isBuiltIn);
  const userList = scores.filter((s) => !s.isBuiltIn);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Score Library"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">Score Library</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Library"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload / Drag & Drop Area */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Import MusicXML Score
            </h3>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-950/20'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/50 hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                data-testid="score-file-input"
                accept=".musicxml,.xml,.mxl,.mscz,.mscx,.pdf"
                onChange={handleFileInputChange}
                className="hidden"
                disabled={isUploading}
              />
              <Upload className="w-8 h-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-slate-200">
                {isUploading
                  ? 'Processing score file...'
                  : 'Click or drop score file to upload'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Accepts <span className="font-mono text-emerald-400">.musicxml</span>,{' '}
                <span className="font-mono text-emerald-400">.xml</span>, and{' '}
                <span className="font-mono text-emerald-400">.mxl</span>
              </p>
            </div>

            {/* Error / MuseScore Instructions Alert Banner */}
            {uploadError && (
              <div
                role="alert"
                aria-label="Upload Validation Message"
                className="mt-3 p-4 rounded-xl bg-amber-950/50 border border-amber-800/80 text-amber-200 text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">File Notice</p>
                  <p className="text-xs sm:text-sm text-amber-200 leading-relaxed">
                    {uploadError}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Built-in Scores Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Built-in Demo Scores
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              {builtInList.map((score) => {
                const isActive = score.id === currentScoreId;
                return (
                  <div
                    key={score.id}
                    onClick={() => {
                      onSelectScore(score);
                      onClose();
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${score.title}`}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer text-left ${
                      isActive
                        ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileMusic
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {score.title}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {score.fileName} · Part 1 Solo Violin + Accompaniment
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 hover:text-emerald-400 font-medium shrink-0">
                        Load Score →
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* User Uploaded Scores Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Your Uploaded Scores
            </h3>
            {userList.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center text-xs text-slate-500">
                No custom scores uploaded yet. Export your piece from MuseScore as .musicxml or .mxl and upload it above.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {userList.map((score) => {
                  const isActive = score.id === currentScoreId;
                  return (
                    <div
                      key={score.id}
                      onClick={() => {
                        onSelectScore(score);
                        onClose();
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${score.title}`}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer text-left ${
                        isActive
                          ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md'
                          : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileMusic
                          className={`w-5 h-5 shrink-0 ${
                            isActive ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">
                            {score.title}
                          </p>
                          <p className="text-xs text-slate-400 font-mono truncate">
                            {score.fileName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            <Check className="w-3 h-3" />
                            Active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteScore(e, score.id)}
                          aria-label={`Delete ${score.title}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
