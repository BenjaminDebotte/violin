import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';

import {
  validateScoreFile,
  unpackScoreFile,
} from '../../src/modules/score-engine/fileValidator';
import { extractScoreTimeline } from '../../src/modules/score-engine/timelineExtractor';
import {
  listStoredScores,
  getStoredScore,
  saveStoredScore,
  deleteStoredScore,
  resetInMemoryScoreStore,
  BUILT_IN_SCORES,
  type StoredScore,
} from '../../src/modules/score-engine/scoreStore';
import {
  applyNoteGradeToSvg,
  resetSvgNoteColors,
  NOTE_GRADE_COLORS,
} from '../../src/components/ScoreViewport';

describe('Score Engine Module', () => {
  const samplesDir = path.resolve(process.cwd(), 'public/samples');
  const twinkleXml = fs.readFileSync(path.join(samplesDir, 'twinkle.musicxml'), 'utf-8');
  const minuetXml = fs.readFileSync(path.join(samplesDir, 'minuet-tied.musicxml'), 'utf-8');

  // =========================================================================
  // 1. fileValidator.ts
  // =========================================================================
  describe('fileValidator', () => {
    describe('validateScoreFile', () => {
      it('accepts valid .musicxml and .xml files', () => {
        const res1 = validateScoreFile({ name: 'twinkle.musicxml' });
        expect(res1).toEqual({ valid: true, format: 'musicxml' });

        const res2 = validateScoreFile({ name: 'score.xml' });
        expect(res2).toEqual({ valid: true, format: 'musicxml' });

        const resUpper = validateScoreFile({ name: 'CONCERTO.MUSICXML' });
        expect(resUpper).toEqual({ valid: true, format: 'musicxml' });
      });

      it('accepts valid .mxl files', () => {
        const res1 = validateScoreFile({ name: 'bach-minuet.mxl' });
        expect(res1).toEqual({ valid: true, format: 'mxl' });

        const resUpper = validateScoreFile({ name: 'PIECE.MXL' });
        expect(resUpper).toEqual({ valid: true, format: 'mxl' });
      });

      it('rejects .mscz and .mscx with clear MuseScore export instructions', () => {
        const resMscz = validateScoreFile({ name: 'exercise.mscz' });
        expect(resMscz.valid).toBe(false);
        if (!resMscz.valid) {
          expect(resMscz.errorCode).toBe('MSCZ_NOT_SUPPORTED');
          expect(resMscz.userMessage).toContain('File -> Export -> MusicXML');
          expect(resMscz.userMessage.toLowerCase()).toContain('musescore');
        }

        const resMscx = validateScoreFile({ name: 'exercise.mscx' });
        expect(resMscx.valid).toBe(false);
        if (!resMscx.valid) {
          expect(resMscx.errorCode).toBe('MSCZ_NOT_SUPPORTED');
          expect(resMscx.userMessage).toContain('File -> Export -> MusicXML');
        }
      });

      it('rejects .pdf files explaining raw PDFs are not supported with MuseScore instructions', () => {
        const resPdf = validateScoreFile({ name: 'sheet-music.pdf' });
        expect(resPdf.valid).toBe(false);
        if (!resPdf.valid) {
          expect(resPdf.errorCode).toBe('PDF_NOT_SUPPORTED');
          expect(resPdf.userMessage).toContain('File -> Export -> MusicXML');
          expect(resPdf.userMessage).toContain('PDF');
        }
      });

      it('rejects empty files (size === 0)', () => {
        const resEmpty = validateScoreFile({ name: 'empty.musicxml', size: 0 });
        expect(resEmpty.valid).toBe(false);
        if (!resEmpty.valid) {
          expect(resEmpty.errorCode).toBe('EMPTY_FILE');
        }
      });

      it('rejects unknown extensions or files without extensions', () => {
        const resMidi = validateScoreFile({ name: 'song.mid' });
        expect(resMidi.valid).toBe(false);
        if (!resMidi.valid) {
          expect(resMidi.errorCode).toBe('INVALID_EXTENSION');
        }

        const resNoExt = validateScoreFile({ name: 'unknown-file' });
        expect(resNoExt.valid).toBe(false);
        if (!resNoExt.valid) {
          expect(resNoExt.errorCode).toBe('INVALID_EXTENSION');
        }
      });
    });

    describe('unpackScoreFile', () => {
      it('unpacks raw .musicxml string and binary Uint8Array', async () => {
        const unpackedStr = await unpackScoreFile('twinkle.musicxml', twinkleXml);
        expect(unpackedStr).toContain('<score-partwise');

        const encoder = new TextEncoder();
        const binary = encoder.encode(twinkleXml);
        const unpackedBin = await unpackScoreFile('twinkle.musicxml', binary);
        expect(unpackedBin).toContain('<score-partwise');
      });

      it('throws when .musicxml is missing <score-partwise> root', async () => {
        await expect(
          unpackScoreFile('invalid.musicxml', '<score-other></score-other>'),
        ).rejects.toThrow('missing <score-partwise>');
      });

      it('unpacks in-memory .mxl archive with META-INF/container.xml', async () => {
        const zip = new JSZip();
        zip.file(
          'META-INF/container.xml',
          `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="musicXML.xml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`,
        );
        zip.file('musicXML.xml', twinkleXml);

        const mxlData = await zip.generateAsync({ type: 'uint8array' });
        const unpacked = await unpackScoreFile('sample.mxl', mxlData);
        expect(unpacked).toContain('<score-partwise');
        expect(unpacked).toContain('Twinkle, Twinkle, Little Star');
      });

      it('unpacks .mxl archive with fallback when container.xml rootfile is absent', async () => {
        const zip = new JSZip();
        zip.file('score.xml', twinkleXml);

        const mxlData = await zip.generateAsync({ type: 'uint8array' });
        const unpacked = await unpackScoreFile('fallback.mxl', mxlData);
        expect(unpacked).toContain('<score-partwise');
      });

      it('rejects unsupported extensions', async () => {
        await expect(unpackScoreFile('score.pdf', 'data')).rejects.toThrow(
          'Unsupported score file format',
        );
      });
    });
  });

  // =========================================================================
  // 2. timelineExtractor.ts
  // =========================================================================
  describe('timelineExtractor', () => {
    describe('twinkle.musicxml', () => {
      it('extracts title, tempo, and measure definitions', () => {
        const timeline = extractScoreTimeline(twinkleXml, { scoreId: 'twinkle-test' });

        expect(timeline.scoreId).toBe('twinkle-test');
        expect(timeline.title).toBe('Twinkle, Twinkle, Little Star');
        expect(timeline.initialTempoBpm).toBe(100);
        expect(timeline.measures.length).toBe(8);

        // 8 measures of 4/4 = 32 beats
        expect(timeline.totalBeats).toBe(32);

        // At 100 BPM, 1 beat = 600ms; 32 beats = 19200ms
        expect(timeline.totalDurationMs).toBe(19200);

        // Verify each measure is 4 beats in 4/4 at 100 BPM
        for (let i = 0; i < 8; i++) {
          const m = timeline.measures[i];
          expect(m.measureNumber).toBe(i + 1);
          expect(m.startBeat).toBe(i * 4);
          expect(m.durationBeats).toBe(4);
          expect(m.tempoBpm).toBe(100);
          expect(m.timeSignature).toEqual({ beats: 4, beatType: 4 });
        }
      });

      it('separates Part 1 (Solo Violin) from Part 2 (Piano Accompaniment)', () => {
        const timeline = extractScoreTimeline(twinkleXml);

        expect(timeline.soloNotes.length).toBeGreaterThan(0);
        expect(timeline.accompanimentNotes.length).toBeGreaterThan(0);

        // All solo notes must have isSolo: true and partIndex: 0
        for (const note of timeline.soloNotes) {
          expect(note.isSolo).toBe(true);
          expect(note.partIndex).toBe(0);
          expect(note.pitch).not.toBeNull();
        }

        // All accompaniment notes must have isSolo: false and partIndex: 1
        for (const note of timeline.accompanimentNotes) {
          expect(note.isSolo).toBe(false);
          expect(note.partIndex).toBe(1);
          expect(note.pitch).not.toBeNull();
        }

        // Twinkle Melody: D4, D4, A4, A4, B4, B4, A4 ...
        const solo0 = timeline.soloNotes[0];
        expect(solo0.pitch?.label).toBe('D4');
        expect(solo0.pitch?.midiNumber).toBe(62); // D4 is MIDI 62
        expect(solo0.startBeat).toBe(0);
        expect(solo0.durationBeats).toBe(1);
        expect(solo0.startTimeMs).toBe(0);
        expect(solo0.durationMs).toBe(600);
      });

      it('assigns cursorStepIndex ordered by unique startBeat onsets', () => {
        const timeline = extractScoreTimeline(twinkleXml);

        // cursorStepIndex must start at 0 and strictly increase with onsets
        expect(timeline.soloNotes[0].cursorStepIndex).toBe(0);
        expect(timeline.soloNotes[1].cursorStepIndex).toBe(1);
        expect(timeline.soloNotes[2].cursorStepIndex).toBe(2);
        expect(timeline.soloNotes[3].cursorStepIndex).toBe(3);

        // Accompaniment note on beat 0 must share cursorStepIndex 0
        const acc0 = timeline.accompanimentNotes.find((n) => n.startBeat === 0);
        expect(acc0).toBeDefined();
        expect(acc0!.cursorStepIndex).toBe(0);
      });
    });

    describe('minuet-tied.musicxml', () => {
      it('extracts title and 3/4 time signature at 112 BPM', () => {
        const timeline = extractScoreTimeline(minuetXml);

        expect(timeline.title).toBe('Minuet & Tied Note Etude');
        expect(timeline.initialTempoBpm).toBe(112);
        expect(timeline.measures[0].timeSignature).toEqual({ beats: 3, beatType: 4 });
        expect(timeline.measures[0].durationBeats).toBe(3);
      });

      it('coalesces cross-barline tie (Measure 1 beat 3 tied into Measure 2 beat 1)', () => {
        const timeline = extractScoreTimeline(minuetXml);

        // In Measure 1 (3 beats):
        // Note 0: D5 (quarter, startBeat 0, dur 1)
        // Note 1: G4 (eighth, startBeat 1, dur 0.5)
        // Note 2: A4 (eighth, startBeat 1.5, dur 0.5)
        // Note 3: B4 (quarter, startBeat 2, dur 1) -> tied to Measure 2 Note 0 (B4, dur 1)
        const tiedNote = timeline.soloNotes.find(
          (n) => n.measureNumber === 1 && n.pitch?.label === 'B4',
        );

        expect(tiedNote).toBeDefined();
        expect(tiedNote!.startBeat).toBe(2);
        // Coalesced duration: 1.0 (m1) + 1.0 (m2) = 2.0 beats
        expect(tiedNote!.durationBeats).toBe(2);
        // tiedNoteIds must contain both constituent note IDs
        expect(tiedNote!.tiedNoteIds).toEqual(['p0-m1-n3', 'p0-m2-n0']);

        // Measure 2 must NOT contain a separate note for the tied stop on beat 0
        const m2B4 = timeline.soloNotes.find(
          (n) => n.measureNumber === 2 && n.id === 'p0-m2-n0',
        );
        expect(m2B4).toBeUndefined();
      });

      it('coalesces intra-measure tie in Measure 3', () => {
        const timeline = extractScoreTimeline(minuetXml);

        // In Measure 3 (starts at beat 6):
        // Note 0: G4 (quarter, startBeat 6, dur 1)
        // Note 1: E5 (quarter, startBeat 7, dur 1) -> tie start
        // Note 2: E5 (quarter, startBeat 8, dur 1) -> tie stop
        const tiedE5 = timeline.soloNotes.find(
          (n) => n.measureNumber === 3 && n.pitch?.label === 'E5',
        );

        expect(tiedE5).toBeDefined();
        expect(tiedE5!.startBeat).toBe(7);
        // Coalesced duration: 1.0 + 1.0 = 2.0 beats
        expect(tiedE5!.durationBeats).toBe(2);
        expect(tiedE5!.tiedNoteIds).toEqual(['p0-m3-n1', 'p0-m3-n2']);
      });

      it('coalesces 3-note tie chain across barlines in Measures 4-5', () => {
        const timeline = extractScoreTimeline(minuetXml);

        // In Measure 4: Note 4 is A4 (tie start)
        // In Measure 5: Note 0 is A4 (tie stop + tie start)
        // In Measure 5: Note 1 is A4 (tie stop)
        const chainNote = timeline.soloNotes.find(
          (n) => n.measureNumber === 4 && n.pitch?.label === 'A4',
        );

        expect(chainNote).toBeDefined();
        // Coalesced duration: 1 (m4 beat 3) + 1 (m5 beat 1) + 1 (m5 beat 2) = 3.0 beats
        expect(chainNote!.durationBeats).toBe(3);
        // Must contain all 3 constituent note IDs in sequence
        expect(chainNote!.tiedNoteIds).toEqual(['p0-m4-n4', 'p0-m5-n0', 'p0-m5-n1']);

        // Subsequent notes in the chain must NOT appear as separate notes in the timeline
        expect(timeline.soloNotes.find((n) => n.id === 'p0-m5-n0')).toBeUndefined();
        expect(timeline.soloNotes.find((n) => n.id === 'p0-m5-n1')).toBeUndefined();
      });

      it('coalesces cross-barline tie in Measures 6-7', () => {
        const timeline = extractScoreTimeline(minuetXml);

        // Measure 6 beat 3 (G4, id p0-m6-n2) tied into Measure 7 beat 1 (G4, id p0-m7-n0)
        const tiedG4 = timeline.soloNotes.find(
          (n) => n.id === 'p0-m6-n2',
        );

        expect(tiedG4).toBeDefined();
        expect(tiedG4!.durationBeats).toBe(2);
        expect(tiedG4!.tiedNoteIds).toEqual(['p0-m6-n2', 'p0-m7-n0']);
        expect(timeline.soloNotes.find((n) => n.id === 'p0-m7-n0')).toBeUndefined();
      });
    });

    describe('tempoScale verification', () => {
      it('accurately scales startTimeMs and durationMs by tempoScale (0.5 vs 1.0)', () => {
        const timeline10 = extractScoreTimeline(twinkleXml, { tempoScale: 1.0 });
        const timeline05 = extractScoreTimeline(twinkleXml, { tempoScale: 0.5 });

        // Total duration at 0.5x tempo must be exactly double 1.0x tempo
        expect(timeline05.totalDurationMs).toBeCloseTo(timeline10.totalDurationMs * 2, 1);

        // Beat durations and positions must remain invariant
        expect(timeline05.totalBeats).toBe(timeline10.totalBeats);
        expect(timeline05.soloNotes.length).toBe(timeline10.soloNotes.length);

        for (let i = 0; i < timeline10.soloNotes.length; i++) {
          const note10 = timeline10.soloNotes[i];
          const note05 = timeline05.soloNotes[i];

          expect(note05.startBeat).toBe(note10.startBeat);
          expect(note05.durationBeats).toBe(note10.durationBeats);

          // Millisecond timing must be doubled at half speed
          expect(note05.startTimeMs).toBeCloseTo(note10.startTimeMs * 2, 1);
          expect(note05.durationMs).toBeCloseTo(note10.durationMs * 2, 1);
        }
      });
    });

    describe('MusicXML syntax: chords, rests, backup and forward', () => {
      it('handles rests, chords, and backup/forward elements properly', () => {
        const syntheticXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Syntax Test</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Solo</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <!-- Beat 0: quarter note C4 -->
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <!-- Beat 1: quarter rest -->
      <note>
        <rest/>
        <duration>4</duration>
      </note>
      <!-- Beat 2: chord of E4 and G4 -->
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
    <measure number="2">
      <!-- Beat 0: backup 4 divisions then forward 4 divisions -->
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <backup><duration>4</duration></backup>
      <forward><duration>4</duration></forward>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

        const timeline = extractScoreTimeline(syntheticXml);
        expect(timeline.title).toBe('Syntax Test');

        // Measure 1:
        // C4 at beat 0
        const c4 = timeline.soloNotes.find((n) => n.pitch?.label === 'C4');
        expect(c4).toBeDefined();
        expect(c4!.startBeat).toBe(0);

        // Rest at beat 1 (pitch is null)
        const rest = timeline.soloNotes.find((n) => n.pitch === null);
        expect(rest).toBeDefined();
        expect(rest!.startBeat).toBe(1);

        // Chord at beat 2: E4 and G4 share the same startBeat
        const e4 = timeline.soloNotes.find((n) => n.pitch?.label === 'E4');
        const g4 = timeline.soloNotes.find((n) => n.pitch?.label === 'G4');
        expect(e4).toBeDefined();
        expect(g4).toBeDefined();
        expect(e4!.startBeat).toBe(2);
        expect(g4!.startBeat).toBe(2);
        expect(e4!.cursorStepIndex).toBe(g4!.cursorStepIndex);

        // Measure 2:
        // A4 at beat 4 (start of measure 2)
        const a4 = timeline.soloNotes.find((n) => n.pitch?.label === 'A4');
        expect(a4).toBeDefined();
        expect(a4!.startBeat).toBe(4);

        // B4 after backup(4) and forward(4) is at beat 5
        const b4 = timeline.soloNotes.find((n) => n.pitch?.label === 'B4');
        expect(b4).toBeDefined();
        expect(b4!.startBeat).toBe(5);
      });
    });
  });

  // =========================================================================
  // 3. scoreStore.ts
  // =========================================================================
  describe('scoreStore', () => {
    beforeEach(() => {
      resetInMemoryScoreStore();
    });

    it('lists built-in scores by default', async () => {
      const scores = await listStoredScores();
      expect(scores.length).toBeGreaterThanOrEqual(2);

      const twinkle = scores.find((s) => s.id === 'twinkle');
      const minuet = scores.find((s) => s.id === 'minuet-tied');

      expect(twinkle).toBeDefined();
      expect(twinkle!.isBuiltIn).toBe(true);
      expect(twinkle!.title).toBe('Twinkle, Twinkle, Little Star');
      expect(twinkle!.xmlContent).toContain('<score-partwise');

      expect(minuet).toBeDefined();
      expect(minuet!.isBuiltIn).toBe(true);
      expect(minuet!.title).toBe('Minuet & Tied Note Etude');
      expect(minuet!.xmlContent).toContain('<score-partwise');
    });

    it('retrieves built-in scores by ID or filename', async () => {
      const twinkle = await getStoredScore('twinkle');
      expect(twinkle).toBeDefined();
      expect(twinkle!.title).toBe('Twinkle, Twinkle, Little Star');

      const twinkleFile = await getStoredScore('twinkle.musicxml');
      expect(twinkleFile).toBeDefined();
      expect(twinkleFile!.id).toBe('twinkle');

      const minuet = await getStoredScore('minuet-tied');
      expect(minuet).toBeDefined();
      expect(minuet!.title).toBe('Minuet & Tied Note Etude');
    });

    it('performs CRUD operations for user scores', async () => {
      const customScore: StoredScore = {
        id: 'user-score-1',
        title: 'Kreutzer Etude No. 2',
        fileName: 'kreutzer2.musicxml',
        format: 'musicxml',
        isBuiltIn: false,
        xmlContent: twinkleXml,
        uploadedAt: Date.now(),
      };

      // Save
      await saveStoredScore(customScore);

      // Get
      const retrieved = await getStoredScore('user-score-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('user-score-1');
      expect(retrieved!.title).toBe('Kreutzer Etude No. 2');

      // List
      const allScores = await listStoredScores();
      expect(allScores.some((s) => s.id === 'user-score-1')).toBe(true);
      expect(allScores.length).toBe(BUILT_IN_SCORES.length + 1);

      // Delete
      await deleteStoredScore('user-score-1');
      const afterDelete = await getStoredScore('user-score-1');
      expect(afterDelete).toBeUndefined();

      const afterDeleteList = await listStoredScores();
      expect(afterDeleteList.length).toBe(BUILT_IN_SCORES.length);
    });
  });

  // =========================================================================
  // 4. ScoreViewport O(1) SVG Notehead Coloring
  // =========================================================================
  describe('ScoreViewport O(1) SVG DOM Coloring', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <svg id="test-score-svg" width="800" height="400">
          <!-- Untied single note -->
          <g class="vf-stavenote" data-note-id="p0-m1-n0">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <!-- Second note -->
          <g class="vf-stavenote" data-note-id="p0-m1-n1">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <!-- Tied note pair: p0-m2-n0 and p0-m2-n1 -->
          <g class="vf-stavenote" data-note-id="p0-m2-n0">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m2-n1">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
        </svg>
      `;
      document.body.appendChild(container);
    });

    it('colors a single notehead green, yellow, or red in O(1) DOM mutation', () => {
      const notehead = container.querySelector('[data-note-id="p0-m1-n0"] path')!;
      expect(notehead.getAttribute('fill')).toBe('#000000');

      // Apply Green grade
      const successGreen = applyNoteGradeToSvg(container, 'p0-m1-n0', 'green');
      expect(successGreen).toBe(true);
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.green);
      expect(notehead.getAttribute('stroke')).toBe(NOTE_GRADE_COLORS.green);

      // Apply Yellow grade
      applyNoteGradeToSvg(container, 'p0-m1-n0', 'yellow');
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.yellow);

      // Apply Red grade
      applyNoteGradeToSvg(container, 'p0-m1-n0', 'red');
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.red);
    });

    it('colors multiple constituent notes in a tied note chain together', () => {
      const tiedIds = ['p0-m2-n0', 'p0-m2-n1'];
      const notehead1 = container.querySelector('[data-note-id="p0-m2-n0"] path')!;
      const notehead2 = container.querySelector('[data-note-id="p0-m2-n1"] path')!;

      expect(notehead1.getAttribute('fill')).toBe('#000000');
      expect(notehead2.getAttribute('fill')).toBe('#000000');

      // Color tied notes
      const success = applyNoteGradeToSvg(container, tiedIds, 'green');
      expect(success).toBe(true);

      // Both noteheads must be colored green
      expect(notehead1.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.green);
      expect(notehead2.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.green);
    });

    it('colors a direct SVG element when passed without container or noteId', () => {
      const notehead = container.querySelector('[data-note-id="p0-m1-n1"] path')!;

      applyNoteGradeToSvg(notehead, 'yellow');
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.yellow);
    });

    it('resets note colors to original state with resetSvgNoteColors', () => {
      const notehead = container.querySelector('[data-note-id="p0-m1-n0"] path')!;

      // Change color
      applyNoteGradeToSvg(container, 'p0-m1-n0', 'green');
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.green);

      // Reset specific note
      resetSvgNoteColors(container, 'p0-m1-n0');
      expect(notehead.getAttribute('fill')).toBe('#000000');

      // Color multiple notes then reset all
      applyNoteGradeToSvg(container, ['p0-m1-n0', 'p0-m1-n1'], 'red');
      const notehead2 = container.querySelector('[data-note-id="p0-m1-n1"] path')!;
      expect(notehead.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.red);
      expect(notehead2.getAttribute('fill')).toBe(NOTE_GRADE_COLORS.red);

      resetSvgNoteColors(container);
      expect(notehead.getAttribute('fill')).toBe('#000000');
      expect(notehead2.getAttribute('fill')).toBe('#000000');
    });
  });
});
