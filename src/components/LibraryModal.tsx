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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border font-sans"
        style={{
          backgroundColor: 'var(--color-paper)',
          borderColor: 'var(--color-rule)',
          color: 'var(--color-ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <h2 className="font-display text-lg font-bold">Score Library</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Library"
            className="p-1.5 rounded text-xs hover:opacity-75 cursor-pointer"
            style={{ color: 'var(--color-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload / Drag & Drop Area */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 font-display" style={{ color: 'var(--color-ink)' }}>
              Import MusicXML Score
            </h3>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition"
              style={{
                borderColor: isDragging ? 'var(--color-accent)' : 'var(--color-rule)',
                backgroundColor: isDragging ? 'var(--color-paper-3)' : 'var(--color-paper-2)',
              }}
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
              <Upload className="w-8 h-8 mb-2" style={{ color: 'var(--color-accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
                {isUploading
                  ? 'Processing score file...'
                  : 'Click or drop score file to upload'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                Accepts <span className="font-mono font-bold" style={{ color: 'var(--color-accent)' }}>.musicxml</span>,{' '}
                <span className="font-mono font-bold" style={{ color: 'var(--color-accent)' }}>.xml</span>, and{' '}
                <span className="font-mono font-bold" style={{ color: 'var(--color-accent)' }}>.mxl</span>
              </p>
            </div>

            {/* Error / MuseScore Instructions Alert Banner */}
            {uploadError && (
              <div
                role="alert"
                aria-label="Upload Validation Message"
                className="mt-3 p-4 rounded-xl text-sm flex items-start gap-3 border"
                style={{
                  backgroundColor: 'oklch(72.0% 0.150 82 / 0.15)',
                  borderColor: 'var(--color-intonation-close)',
                  color: 'var(--color-ink)',
                }}
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--color-intonation-close)' }} />
                <div className="space-y-1">
                  <p className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--color-ink)' }}>File Notice</p>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                    {uploadError}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Built-in Scores Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3 font-display" style={{ color: 'var(--color-ink)' }}>
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
                    className="flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer text-left"
                    style={{
                      backgroundColor: isActive ? 'var(--color-paper-3)' : 'var(--color-paper-2)',
                      borderColor: isActive ? 'var(--color-accent)' : 'var(--color-rule)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileMusic
                        className="w-5 h-5 shrink-0"
                        style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-muted)' }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-ink)' }}>
                          {score.title}
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
                          {score.fileName} · Part 1 Solo Violin + Accompaniment
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0"
                        style={{
                          backgroundColor: 'oklch(60.0% 0.155 148 / 0.15)',
                          borderColor: 'var(--color-intonation-match)',
                          color: 'var(--color-intonation-match)',
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="text-xs font-medium shrink-0" style={{ color: 'var(--color-accent)' }}>
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
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3 font-display" style={{ color: 'var(--color-ink)' }}>
              Your Uploaded Scores
            </h3>
            {userList.length === 0 ? (
              <div
                className="p-4 rounded-xl border text-center text-xs"
                style={{
                  backgroundColor: 'var(--color-paper-2)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-muted)',
                }}
              >
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
                      className="flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer text-left"
                      style={{
                        backgroundColor: isActive ? 'var(--color-paper-3)' : 'var(--color-paper-2)',
                        borderColor: isActive ? 'var(--color-accent)' : 'var(--color-rule)',
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileMusic
                          className="w-5 h-5 shrink-0"
                          style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-muted)' }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-ink)' }}>
                            {score.title}
                          </p>
                          <p className="text-xs font-mono truncate" style={{ color: 'var(--color-muted)' }}>
                            {score.fileName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: 'oklch(60.0% 0.155 148 / 0.15)',
                              borderColor: 'var(--color-intonation-match)',
                              color: 'var(--color-intonation-match)',
                            }}
                          >
                            <Check className="w-3 h-3" />
                            Active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteScore(e, score.id)}
                          aria-label={`Delete ${score.title}`}
                          className="p-1.5 rounded text-xs hover:opacity-75 transition cursor-pointer"
                          style={{ color: 'var(--color-intonation-miss)' }}
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
