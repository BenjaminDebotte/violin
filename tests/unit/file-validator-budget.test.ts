import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  unpackScoreFile,
  MAX_UNCOMPRESSED_SCORE_BYTES,
} from '../../src/modules/score-engine/fileValidator';
import { TWINKLE_MUSICXML } from '../../src/modules/score-engine/demoScores';

describe('unpackScoreFile budget checks (A7)', () => {
  it('enforces MAX_UNCOMPRESSED_SCORE_BYTES is 20 MB', () => {
    expect(MAX_UNCOMPRESSED_SCORE_BYTES).toBe(20 * 1024 * 1024);
  });

  it('rejects a zip bomb .mxl (64 KB deflating to 64 MB) before inflating it (A7)', async () => {
    const zip = new JSZip();
    // 64 MB of repeated text inside an XML wrapper: deflates to ~65 KB
    const bigContent = '<score-partwise>' + 'x'.repeat(64 * 1024 * 1024 - 32) + '</score-partwise>';
    zip.file('bomb.xml', bigContent, { compression: 'DEFLATE', compressionOptions: { level: 9 } });

    const bombBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    // Verify the generated archive is small (~65 KB)
    expect(bombBuffer.byteLength).toBeLessThan(100 * 1024);

    await expect(unpackScoreFile('score.mxl', bombBuffer)).rejects.toThrow(
      /is too large \(64 MB exceeds 20 MB limit\)/,
    );
  });

  it('rejects raw XML strings larger than 20 MB', async () => {
    // 21 MB string
    const bigXml = '<score-partwise>' + 'x'.repeat(21 * 1024 * 1024) + '</score-partwise>';
    await expect(unpackScoreFile('big.musicxml', bigXml)).rejects.toThrow(
      /Score file is too large/,
    );
  });

  it('rejects raw XML byte buffers larger than 20 MB', async () => {
    const buffer = new Uint8Array(21 * 1024 * 1024);
    await expect(unpackScoreFile('big.xml', buffer)).rejects.toThrow(
      /Score file is too large/,
    );
  });

  it('unpacks normal .mxl and raw MusicXML without issue', async () => {
    // 1. Raw MusicXML
    const unpackedRaw = await unpackScoreFile('twinkle.musicxml', TWINKLE_MUSICXML);
    expect(unpackedRaw).toBe(TWINKLE_MUSICXML);

    // 2. Normal .mxl container
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="music.xml"/></rootfiles></container>`,
    );
    zip.file('music.xml', TWINKLE_MUSICXML);
    const mxlBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const unpackedMxl = await unpackScoreFile('twinkle.mxl', mxlBuffer);
    expect(unpackedMxl).toBe(TWINKLE_MUSICXML);
  });
});
