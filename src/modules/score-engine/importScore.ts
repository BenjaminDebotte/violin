import { validateScoreFile, unpackScoreFile } from './fileValidator';
import { extractScoreTimeline } from './timelineExtractor';
import type { StoredScore } from './scoreStore';

/**
 * Turns the bytes of a MusicXML / MXL file into a StoredScore (not saved yet). Used for files
 * picked on this device and for files fetched from the shared library.
 * Throws an Error with a message fit for the player.
 */
export async function importScoreBytes(fileName: string, buffer: ArrayBuffer): Promise<StoredScore> {
  const validation = validateScoreFile({ name: fileName, size: buffer.byteLength });
  if (!validation.valid) throw new Error(validation.userMessage);
  const xmlContent = await unpackScoreFile(fileName, buffer);
  const timeline = extractScoreTimeline(xmlContent);
  return {
    id: `user-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
    title: timeline.title || fileName,
    fileName,
    format: validation.format,
    isBuiltIn: false,
    xmlContent,
    uploadedAt: Date.now(),
  };
}
