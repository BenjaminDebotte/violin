import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  BookOpen,
  Trash2,
  AlertTriangle,
  Play,
  FileCheck,
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

export interface LibraryPageProps {
  readonly currentScoreId: string;
  readonly onSelectScore: (score: StoredScore) => void;
  readonly onNavigateToStudio?: () => void;
}

interface ScoreItemMeta {
  readonly score: StoredScore;
  readonly measureCount: number;
  readonly tempoBpm: number;
}

/**
 * Urtext Conservatory Repertoire Ledger & MusicXML/MXL Upload Plate.
 * Styled in Direction 1: Urtext Archive aesthetic (cotton-rag paper, hairline rules,
 * Cardo titles, tabular JetBrains Mono numerals).
 */
export function LibraryPage({
  currentScoreId,
  onSelectScore,
  onNavigateToStudio,
}: LibraryPageProps) {
  const [scores, setScores] = useState<readonly StoredScore[]>(BUILT_IN_SCORES);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshScores = async () => {
    try {
      const loaded = await listStoredScores();
      setScores(loaded);
    } catch (err) {
      console.warn('Failed to load stored scores:', err);
    }
  };

  useEffect(() => {
    refreshScores();
  }, []);

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
      if (onNavigateToStudio) {
        if (typeof window !== 'undefined') {
          window.location.hash = '#/practice';
        }
        onNavigateToStudio();
      }
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

  const handleOpenScore = (score: StoredScore) => {
    onSelectScore(score);
    if (onNavigateToStudio) {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/practice';
      }
      onNavigateToStudio();
    }
  };

  const computeMeta = (score: StoredScore): ScoreItemMeta => {
    try {
      const tl = extractScoreTimeline(score.xmlContent);
      return {
        score,
        measureCount: tl.measures.length,
        tempoBpm: Math.round(tl.initialTempoBpm),
      };
    } catch {
      return {
        score,
        measureCount: 8,
        tempoBpm: 100,
      };
    }
  };

  const builtInMetas = scores.filter((s) => s.isBuiltIn).map(computeMeta);
  const userMetas = scores.filter((s) => !s.isBuiltIn).map(computeMeta);

  return (
    <div
      className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6"
      data-testid="library-page"
    >
      {/* Page Title & Archive Subheading */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--color-rule)' }}>
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--color-ink)' }}>
            Repertoire Catalogue
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            G. Henle Verlag Format · Archival proof editions and custom MusicXML plates
          </p>
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          {scores.length} {scores.length === 1 ? 'score' : 'scores'} in archive
        </div>
      </div>

      {/* Upload Error Banner with MuseScore instructions (role="alert") */}
      {uploadError && (
        <div
          role="alert"
          className="p-4 rounded-md border flex items-start gap-3 text-sm animate-in fade-in"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-intonation-miss)',
            color: 'var(--color-ink)',
          }}
        >
          <AlertTriangle
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--color-intonation-miss)' }}
          />
          <div className="space-y-1">
            <div className="font-semibold">Unable to load score</div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
              {uploadError}
            </div>
            <div className="text-xs pt-1 font-mono" style={{ color: 'var(--color-muted)' }}>
              MuseScore: File &gt; Export &gt; Uncompressed MusicXML (.musicxml) or Compressed MusicXML (.mxl)
            </div>
          </div>
        </div>
      )}

      {/* MusicXML / MXL Dropzone Plate */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="p-6 rounded-md border-2 border-dashed text-center transition cursor-pointer flex flex-col items-center justify-center gap-2"
        style={{
          backgroundColor: isDragging ? 'var(--color-paper-3)' : 'var(--color-paper-2)',
          borderColor: isDragging ? 'var(--color-accent)' : 'var(--color-rule)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".musicxml,.mxl,.xml"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isUploading}
        />
        <Upload
          className="w-8 h-8 transition-transform"
          style={{
            color: 'var(--color-accent)',
            transform: isDragging ? 'scale(1.1)' : 'none',
          }}
        />
        <div>
          <div className="font-semibold text-sm sm:text-base" style={{ color: 'var(--color-ink)' }}>
            {isUploading ? 'Unpacking and validating plate...' : 'Import MusicXML (.musicxml, .mxl)'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            Drag and drop your score plate here, or click to browse files
          </div>
        </div>
      </div>

      {/* Built-in Conservatory Scores Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
          <h3 className="font-display text-lg font-bold" style={{ color: 'var(--color-ink)' }}>
            Built-in Conservatory Repertoire
          </h3>
        </div>

        <div className="border rounded-md divide-y overflow-hidden shadow-sm" style={{ borderColor: 'var(--color-rule)', backgroundColor: 'var(--color-paper)' }}>
          {builtInMetas.map(({ score, measureCount, tempoBpm }) => {
            const isSelected = score.id === currentScoreId;
            return (
              <div
                key={score.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:opacity-95"
                style={{
                  backgroundColor: isSelected ? 'var(--color-paper-2)' : 'transparent',
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-base sm:text-lg truncate" style={{ color: 'var(--color-ink)' }}>
                      {score.title}
                    </span>
                    {isSelected && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold"
                        style={{
                          backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-accent-ink)',
                        }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono mt-0.5 flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--color-muted)' }}>
                    <span>{measureCount} measures</span>
                    <span>·</span>
                    <span>♩ = {tempoBpm} BPM</span>
                    <span>·</span>
                    <span>Solo Violin + Accompaniment</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenScore(score)}
                    className="px-3.5 py-1.5 rounded text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-1.5"
                    style={{
                      backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                      color: isSelected ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                      border: '1px solid var(--color-rule)',
                    }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Open in Studio</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* User Uploaded Scores Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            <h3 className="font-display text-lg font-bold" style={{ color: 'var(--color-ink)' }}>
              User Archival Plates
            </h3>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
            Stored locally in browser (IndexedDB)
          </span>
        </div>

        {userMetas.length === 0 ? (
          <div
            className="p-6 rounded-md border text-center text-xs font-mono"
            style={{
              borderColor: 'var(--color-rule)',
              backgroundColor: 'var(--color-paper-2)',
              color: 'var(--color-muted)',
            }}
          >
            No custom plates imported yet. Import MusicXML (.musicxml or .mxl) files above.
          </div>
        ) : (
          <div className="border rounded-md divide-y overflow-hidden shadow-sm" style={{ borderColor: 'var(--color-rule)', backgroundColor: 'var(--color-paper)' }}>
            {userMetas.map(({ score, measureCount, tempoBpm }) => {
              const isSelected = score.id === currentScoreId;
              return (
                <div
                  key={score.id}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:opacity-95"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-paper-2)' : 'transparent',
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-base sm:text-lg truncate" style={{ color: 'var(--color-ink)' }}>
                        {score.title}
                      </span>
                      {isSelected && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold"
                          style={{
                            backgroundColor: 'var(--color-accent)',
                            color: 'var(--color-accent-ink)',
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono mt-0.5 flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--color-muted)' }}>
                      <span>{score.fileName}</span>
                      <span>·</span>
                      <span>{measureCount} measures</span>
                      <span>·</span>
                      <span>♩ = {tempoBpm} BPM</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenScore(score)}
                      className="px-3.5 py-1.5 rounded text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-1.5"
                      style={{
                        backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                        color: isSelected ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                        border: '1px solid var(--color-rule)',
                      }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Open in Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteScore(e, score.id)}
                      aria-label={`Delete ${score.title}`}
                      className="p-2 rounded text-xs transition cursor-pointer hover:opacity-80"
                      style={{
                        color: 'var(--color-intonation-miss)',
                        border: '1px solid var(--color-rule)',
                        backgroundColor: 'var(--color-paper-2)',
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
