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

  it('rejects a zip bomb .mxl with spoofed Central Directory uncompressedSize (100 bytes) during streaming inflation', async () => {
    const zip = new JSZip();
    // ~22 MB of repeated text inside an XML wrapper
    const bigContent = '<score-partwise>' + 'x'.repeat(22 * 1024 * 1024) + '</score-partwise>';
    zip.file('spoofed-bomb.xml', bigContent, { compression: 'DEFLATE', compressionOptions: { level: 9 } });

    const rawBytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));

    // Locate the Central Directory File Header signature (0x50 0x4b 0x01 0x02)
    // and overwrite uncompressedSize at offset +24 with 100 (little-endian uint32)
    let cdOffset = -1;
    for (let i = rawBytes.length - 22; i >= 0; i--) {
      if (
        rawBytes[i] === 0x50 &&
        rawBytes[i + 1] === 0x4b &&
        rawBytes[i + 2] === 0x01 &&
        rawBytes[i + 3] === 0x02
      ) {
        cdOffset = i;
        break;
      }
    }
    expect(cdOffset).toBeGreaterThanOrEqual(0);
    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    view.setUint32(cdOffset + 24, 100, true);

    await expect(unpackScoreFile('spoofed.mxl', rawBytes)).rejects.toThrow(
      /Archive entry "spoofed-bomb\.xml" is too large \(exceeds 20 MB limit\)/,
    );
  });

  it('rejects a .mxl entry with a negative signed 32-bit uncompressedSize (0x80000000) in Central Directory', async () => {
    const zip = new JSZip();
    zip.file('music.xml', TWINKLE_MUSICXML, { compression: 'DEFLATE' });
    const rawBytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));

    let cdOffset = -1;
    for (let i = rawBytes.length - 22; i >= 0; i--) {
      if (
        rawBytes[i] === 0x50 &&
        rawBytes[i + 1] === 0x4b &&
        rawBytes[i + 2] === 0x01 &&
        rawBytes[i + 3] === 0x02
      ) {
        cdOffset = i;
        break;
      }
    }
    expect(cdOffset).toBeGreaterThanOrEqual(0);
    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    // 0x80000000 becomes -2147483648 when JSZip reads it via signed 32-bit shift
    view.setUint32(cdOffset + 24, 0x80000000, true);

    await expect(unpackScoreFile('negative-size.mxl', rawBytes)).rejects.toThrow(
      /Archive entry "music\.xml" is too large \(corrupt\/negative size exceeds 20 MB limit\)/,
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
