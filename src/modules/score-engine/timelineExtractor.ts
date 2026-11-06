import type {
  NotePitch,
  NoteStep,
  PlayableNote,
  ScoreMeasure,
  ScoreMeasureTimeSignature,
  ScoreTimeline,
} from '../../types/music';

interface MutablePlayableNote {
  id: string;
  measureNumber: number;
  partIndex: number;
  isSolo: boolean;
  pitch: NotePitch | null;
  startBeat: number;
  durationBeats: number;
  startTimeMs: number;
  durationMs: number;
  cursorStepIndex: number;
  tiedNoteIds: string[];
}

const STEP_SEMITONES: Record<NoteStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Extracts a structured ScoreTimeline from a MusicXML document string.
 * Coalesces tied note chains into single sustained PlayableNotes,
 * separates Part 1 (solo) from Parts 2+ (accompaniment),
 * and computes beat/millisecond onsets and durations scaled by tempoScale.
 */
export function extractScoreTimeline(
  xmlString: string,
  options?: {
    readonly scoreId?: string;
    readonly tempoScale?: number;
  },
): ScoreTimeline {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML parsing error: ${parseError.textContent}`);
  }

  // 1. Extract score title
  const workTitle = doc.querySelector('work > work-title')?.textContent?.trim();
  const movementTitle = doc.querySelector('movement-title')?.textContent?.trim();
  const fallbackTitle = doc.querySelector('work-title')?.textContent?.trim();
  const title = workTitle || movementTitle || fallbackTitle || 'Untitled Score';

  const tempoScale = options?.tempoScale && options.tempoScale > 0 ? options.tempoScale : 1.0;

  // 2. Locate part elements and detect the solo Violin part in multi-part scores
  const partElements = Array.from(doc.querySelectorAll('score-partwise > part, part'));
  if (partElements.length === 0) {
    throw new Error('No <part> elements found in MusicXML score.');
  }

  const scoreParts = Array.from(doc.querySelectorAll('part-list > score-part, score-part'));
  const VIOLIN_PART_REGEX = /violin|violon|vln|fiddle/i;
  const detectedViolinPartIndex = partElements.findIndex((partElem, idx) => {
    const partId = partElem.getAttribute('id');
    const scorePart =
      (partId ? scoreParts.find((sp) => sp.getAttribute('id') === partId) : undefined) ??
      scoreParts[idx];
    if (!scorePart) return false;
    const metadataNodes = Array.from(
      scorePart.querySelectorAll(
        'part-name, part-abbreviation, instrument-name, instrument-sound',
      ),
    );
    return metadataNodes.some((node) => VIOLIN_PART_REGEX.test(node.textContent ?? ''));
  });
  const soloPartIndex = detectedViolinPartIndex >= 0 ? detectedViolinPartIndex : 0;

  // 3. Extract measures & tempo timeline using Part 1 (or all measures)
  // We inspect Part 1 to determine the sequence of measures, time signatures, and tempos.
  const part1 = partElements[0];
  const part1Measures = Array.from(part1.querySelectorAll('measure'));

  let currentTempoBpm = 120;
  let currentTimeSig: ScoreMeasureTimeSignature = { beats: 4, beatType: 4 };

  // Check if first measure has initial tempo / time signature
  const measures: ScoreMeasure[] = [];
  let accumulatedStartBeat = 0;

  for (let mIdx = 0; mIdx < part1Measures.length; mIdx++) {
    const mElem = part1Measures[mIdx];
    const numAttr = mElem.getAttribute('number');
    const measureNumber = numAttr ? parseInt(numAttr, 10) : mIdx + 1;

    // Check for tempo marking in <sound tempo="..."> or <metronome>
    const soundElem = mElem.querySelector('sound[tempo]');
    if (soundElem) {
      const t = parseFloat(soundElem.getAttribute('tempo') || '');
      if (!isNaN(t) && t > 0) currentTempoBpm = t;
    } else {
      const perMinuteElem = mElem.querySelector('direction-type metronome per-minute');
      if (perMinuteElem?.textContent) {
        const t = parseFloat(perMinuteElem.textContent.trim());
        if (!isNaN(t) && t > 0) currentTempoBpm = t;
      }
    }

    // Check for time signature
    const beatsElem = mElem.querySelector('attributes time beats');
    const beatTypeElem = mElem.querySelector('attributes time beat-type');
    if (beatsElem?.textContent && beatTypeElem?.textContent) {
      const b = parseInt(beatsElem.textContent.trim(), 10);
      const bt = parseInt(beatTypeElem.textContent.trim(), 10);
      if (!isNaN(b) && !isNaN(bt) && b > 0 && bt > 0) {
        currentTimeSig = { beats: b, beatType: bt };
      }
    }

    const durationBeats = round(currentTimeSig.beats * (4 / currentTimeSig.beatType));
    const startBeat = round(accumulatedStartBeat);

    measures.push({
      measureNumber,
      startBeat,
      durationBeats,
      tempoBpm: currentTempoBpm,
      timeSignature: { ...currentTimeSig },
    });

    accumulatedStartBeat += durationBeats;
  }

  // Pre-calculate measure start times in milliseconds based on each measure's tempo and tempoScale
  const measureStartTimeMsMap = new Map<number, number>();
  let accumulatedMs = 0;
  for (const m of measures) {
    measureStartTimeMsMap.set(m.measureNumber, accumulatedMs);
    const measureMs = m.durationBeats * (60000 / (m.tempoBpm * tempoScale));
    accumulatedMs += measureMs;
  }

  const measureLookup = new Map<number, ScoreMeasure>();
  for (const m of measures) {
    measureLookup.set(m.measureNumber, m);
  }

  // 4. Parse notes per part
  const rawPartNotes: MutablePlayableNote[][] = [];
  const allOnsetBeats = new Set<number>();

  for (let pIdx = 0; pIdx < partElements.length; pIdx++) {
    const partElem = partElements[pIdx];
    const isSoloPart = pIdx === soloPartIndex;
    const notesInPart: MutablePlayableNote[] = [];
    const activeTies = new Map<string, MutablePlayableNote>();

    let currentDivisions = 1;
    const measuresInPart = Array.from(partElem.querySelectorAll('measure'));

    for (let mIdx = 0; mIdx < measuresInPart.length; mIdx++) {
      const mElem = measuresInPart[mIdx];
      const numAttr = mElem.getAttribute('number');
      const measureNumber = numAttr ? parseInt(numAttr, 10) : mIdx + 1;

      const measureInfo = measureLookup.get(measureNumber) || measures[mIdx] || {
        measureNumber,
        startBeat: mIdx * 4,
        durationBeats: 4,
        tempoBpm: 120,
        timeSignature: { beats: 4, beatType: 4 },
      };

      const measureStartMs = measureStartTimeMsMap.get(measureNumber) ?? 0;
      const beatMs = 60000 / (measureInfo.tempoBpm * tempoScale);

      let measureDivisionOffset = 0;
      let previousNonChordOnsetDivision = 0;
      let noteIndexInMeasure = 0;
      let seenBackupInMeasure = false;

      for (const child of Array.from(mElem.children)) {
        const tagName = child.tagName.toLowerCase();

        if (tagName === 'attributes') {
          const divElem = child.querySelector('divisions');
          if (divElem?.textContent) {
            const d = parseFloat(divElem.textContent.trim());
            if (!isNaN(d) && d > 0) currentDivisions = d;
          }
          continue;
        }

        if (tagName === 'backup') {
          seenBackupInMeasure = true;
          const dur = parseFloat(child.querySelector('duration')?.textContent?.trim() || '0');
          if (!isNaN(dur)) {
            measureDivisionOffset = Math.max(0, measureDivisionOffset - dur);
          }
          continue;
        }

        if (tagName === 'forward') {
          const dur = parseFloat(child.querySelector('duration')?.textContent?.trim() || '0');
          if (!isNaN(dur)) {
            measureDivisionOffset += dur;
          }
          continue;
        }

        if (tagName === 'note') {
          const isChord = child.querySelector('chord') !== null;
          const durDiv = parseFloat(child.querySelector('duration')?.textContent?.trim() || '0') || 0;

          let onsetDivision = 0;
          if (isChord) {
            onsetDivision = previousNonChordOnsetDivision;
          } else {
            onsetDivision = measureDivisionOffset;
            previousNonChordOnsetDivision = onsetDivision;
            measureDivisionOffset += durDiv;
          }

          const isRest = child.querySelector('rest') !== null;
          let pitch: NotePitch | null = null;

          if (!isRest) {
            const stepStr = child.querySelector('pitch step')?.textContent?.trim().toUpperCase();
            const alterStr = child.querySelector('pitch alter')?.textContent?.trim();
            const octaveStr = child.querySelector('pitch octave')?.textContent?.trim();

            if (stepStr && octaveStr && stepStr in STEP_SEMITONES) {
              const step = stepStr as NoteStep;
              const alter = alterStr ? parseFloat(alterStr) : 0;
              const octave = parseInt(octaveStr, 10);
              const midiNumber = (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
              const frequencyHz440 = 440 * Math.pow(2, (midiNumber - 69) / 12);

              let label = `${step}`;
              if (alter === 1) label += '#';
              else if (alter === -1) label += 'b';
              else if (alter === 2) label += '##';
              else if (alter === -2) label += 'bb';
              else if (alter !== 0) label += alter > 0 ? `+${alter}` : `${alter}`;
              label += `${octave}`;

              pitch = {
                step,
                alter,
                octave,
                midiNumber,
                label,
                frequencyHz440: round(frequencyHz440, 2),
              };
            }
          }

          const noteDivisions = durDiv > 0 ? durDiv : currentDivisions;
          const startBeat = round(measureInfo.startBeat + onsetDivision / currentDivisions);
          const durationBeats = round(noteDivisions / currentDivisions);
          const startTimeMs = round(measureStartMs + (onsetDivision / currentDivisions) * beatMs, 2);
          const durationMs = round(durationBeats * beatMs, 2);

          allOnsetBeats.add(startBeat);

          const noteId = `p${pIdx}-m${measureNumber}-n${noteIndexInMeasure}`;
          noteIndexInMeasure++;

          const staffNum =
            parseInt(child.querySelector('staff')?.textContent?.trim() || '1', 10) || 1;
          const voiceNum =
            parseInt(child.querySelector('voice')?.textContent?.trim() || '1', 10) || 1;
          const isSecondaryStaffOrVoice =
            staffNum > 1 || (seenBackupInMeasure && voiceNum > 1);
          const isSolo = isSoloPart && !isSecondaryStaffOrVoice;

          const tieStart =
            child.querySelector('tie[type="start"]') !== null ||
            child.querySelector('notations tied[type="start"]') !== null;
          const tieStop =
            child.querySelector('tie[type="stop"]') !== null ||
            child.querySelector('notations tied[type="stop"]') !== null;

          const playableNote: MutablePlayableNote = {
            id: noteId,
            measureNumber,
            partIndex: pIdx,
            isSolo,
            pitch,
            startBeat,
            durationBeats,
            startTimeMs,
            durationMs,
            cursorStepIndex: 0,
            tiedNoteIds: [],
          };

          const tieKey =
            pitch !== null
              ? `${isSolo ? 'solo' : 'acc'}-${staffNum}-${voiceNum}-${pitch.midiNumber}`
              : '';

          // Coalesce tied notes in the same part, staff/voice & MIDI pitch
          if (pitch !== null && tieStop && activeTies.has(tieKey)) {
            const parentNote = activeTies.get(tieKey)!;
            parentNote.durationBeats = round(parentNote.durationBeats + durationBeats);
            parentNote.durationMs = round(parentNote.durationMs + durationMs, 2);
            parentNote.tiedNoteIds.push(noteId);

            if (tieStart) {
              // Tie continues (middle of chain)
              activeTies.set(tieKey, parentNote);
            } else {
              // Tie chain ended
              activeTies.delete(tieKey);
            }
          } else {
            // New note onset
            if (pitch !== null && tieStart) {
              playableNote.tiedNoteIds = [noteId];
              activeTies.set(tieKey, playableNote);
            }
            notesInPart.push(playableNote);
          }
        }
      }
    }

    rawPartNotes.push(notesInPart);
  }

  const allExtractedNotes = rawPartNotes.flat();
  const soloNotesMutable = allExtractedNotes.filter((n) => n.isSolo);
  const accompanimentNotesMutable = allExtractedNotes.filter((n) => !n.isSolo);

  // Sort notes chronologically by startBeat
  soloNotesMutable.sort((a, b) => a.startBeat - b.startBeat);
  accompanimentNotesMutable.sort((a, b) => a.startBeat - b.startBeat);

  // 5. Assign cursorStepIndex (0, 1, 2, ...) based on unique startBeat onsets across the score
  for (const n of allExtractedNotes) {
    allOnsetBeats.add(n.startBeat);
  }
  const uniqueStartBeats = Array.from(allOnsetBeats).sort((a, b) => a - b);

  const beatToCursorStepMap = new Map<number, number>();
  uniqueStartBeats.forEach((beat, index) => {
    beatToCursorStepMap.set(beat, index);
  });

  const soloNotes: PlayableNote[] = soloNotesMutable.map((note) => ({
    ...note,
    cursorStepIndex: beatToCursorStepMap.get(note.startBeat) ?? 0,
    tiedNoteIds: Object.freeze([...note.tiedNoteIds]),
  }));

  const accompanimentNotes: PlayableNote[] = accompanimentNotesMutable.map((note) => ({
    ...note,
    cursorStepIndex: beatToCursorStepMap.get(note.startBeat) ?? 0,
    tiedNoteIds: Object.freeze([...note.tiedNoteIds]),
  }));

  const lastMeasure = measures[measures.length - 1];
  const totalBeats = lastMeasure ? round(lastMeasure.startBeat + lastMeasure.durationBeats) : 0;
  const totalDurationMs = round(accumulatedMs, 2);

  return {
    scoreId: options?.scoreId ?? `score-${Date.now()}`,
    title,
    initialTempoBpm: measures[0]?.tempoBpm ?? 120,
    measures: Object.freeze(measures),
    soloNotes: Object.freeze(soloNotes),
    accompanimentNotes: Object.freeze(accompanimentNotes),
    totalDurationMs,
    totalBeats,
  };
}
