import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getToleranceCents,
  DEFAULT_PRACTICE_SETTINGS,
  DEFAULT_MIXER_SETTINGS,
  type PracticeSettings,
} from '../../src/types/music';

describe('Domain Contracts & Helpers', () => {
  describe('getToleranceCents', () => {
    it('returns 25 cents for easy strictness', () => {
      expect(getToleranceCents({ strictness: 'easy' })).toBe(25);
    });

    it('returns 15 cents for medium strictness', () => {
      expect(getToleranceCents({ strictness: 'medium' })).toBe(15);
    });

    it('returns 8 cents for strict strictness', () => {
      expect(getToleranceCents({ strictness: 'strict' })).toBe(8);
    });

    it('returns customToleranceCents when strictness is custom', () => {
      expect(
        getToleranceCents({ strictness: 'custom', customToleranceCents: 12 }),
      ).toBe(12);
    });

    it('falls back to 15 when customToleranceCents is undefined in custom mode', () => {
      expect(getToleranceCents({ strictness: 'custom' })).toBe(15);
    });

    it('works directly with DEFAULT_PRACTICE_SETTINGS and custom PracticeSettings', () => {
      expect(getToleranceCents(DEFAULT_PRACTICE_SETTINGS)).toBe(15);

      const customSettings: PracticeSettings = {
        ...DEFAULT_PRACTICE_SETTINGS,
        strictness: 'custom',
        customToleranceCents: 5,
      };
      expect(getToleranceCents(customSettings)).toBe(5);
    });
  });

  describe('DEFAULT_PRACTICE_SETTINGS', () => {
    it('provides expected practice defaults', () => {
      expect(DEFAULT_PRACTICE_SETTINGS.mode).toBe('wait-for-me');
      expect(DEFAULT_PRACTICE_SETTINGS.tempoScale).toBe(1.0);
      expect(DEFAULT_PRACTICE_SETTINGS.referenceA4Hz).toBe(440);
      expect(DEFAULT_PRACTICE_SETTINGS.strictness).toBe('medium');
      expect(DEFAULT_PRACTICE_SETTINGS.customToleranceCents).toBe(15);
      expect(DEFAULT_PRACTICE_SETTINGS.countInBars).toBe(1);
      expect(DEFAULT_PRACTICE_SETTINGS.loopRange).toBeNull();
      expect(DEFAULT_PRACTICE_SETTINGS.selectedMicDeviceId).toBeNull();
      expect(DEFAULT_PRACTICE_SETTINGS.viewMode).toBe('page');
    });

    it('provides expected mixer defaults', () => {
      expect(DEFAULT_PRACTICE_SETTINGS.mixer).toEqual({
        soloVolume: 1.0,
        soloMuted: false,
        accompanimentVolume: 0.8,
        accompanimentMuted: false,
        metronomeVolume: 0.6,
        metronomeMuted: false,
        droneActive: false,
      });
      expect(DEFAULT_PRACTICE_SETTINGS.mixer).toEqual(DEFAULT_MIXER_SETTINGS);
    });

    it('is immutable (frozen)', () => {
      expect(Object.isFrozen(DEFAULT_PRACTICE_SETTINGS)).toBe(true);
      expect(Object.isFrozen(DEFAULT_PRACTICE_SETTINGS.mixer)).toBe(true);
    });
  });
});

describe('Demo MusicXML Samples', () => {
  const samplesDir = path.resolve(process.cwd(), 'public/samples');

  function parseXml(xmlString: string): Document {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parse error: ${parserError.textContent}`);
    }
    return doc;
  }

  describe('twinkle.musicxml', () => {
    const filePath = path.join(samplesDir, 'twinkle.musicxml');

    it('exists in public/samples/', () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('is a valid score-partwise XML document with parts P1 and P2', () => {
      const xml = fs.readFileSync(filePath, 'utf-8');
      const doc = parseXml(xml);

      expect(doc.documentElement.tagName.toLowerCase()).toBe('score-partwise');

      // Verify parts list
      const scoreParts = Array.from(doc.querySelectorAll('part-list score-part'));
      const partIds = scoreParts.map((sp) => sp.getAttribute('id'));
      expect(partIds).toContain('P1');
      expect(partIds).toContain('P2');

      // Verify Part 1 (Solo Violin)
      const part1 = doc.querySelector('part#P1, part[id="P1"]');
      expect(part1).not.toBeNull();
      const part1Measures = part1!.querySelectorAll('measure');
      expect(part1Measures.length).toBeGreaterThanOrEqual(8);

      // Verify Part 2 (Accompaniment)
      const part2 = doc.querySelector('part#P2, part[id="P2"]');
      expect(part2).not.toBeNull();
      const part2Measures = part2!.querySelectorAll('measure');
      expect(part2Measures.length).toBeGreaterThanOrEqual(8);

      // Verify tempo is 100 BPM
      const soundTag = doc.querySelector('sound[tempo]');
      expect(soundTag?.getAttribute('tempo')).toBe('100');

      // Verify 4/4 time signature
      const beats = doc.querySelector('time beats')?.textContent;
      const beatType = doc.querySelector('time beat-type')?.textContent;
      expect(beats).toBe('4');
      expect(beatType).toBe('4');

      // Verify D major key (2 fifths)
      const fifths = doc.querySelector('key fifths')?.textContent;
      expect(fifths).toBe('2');

      // Verify tied notes exist
      const ties = part1!.querySelectorAll('tie');
      const notationTies = part1!.querySelectorAll('notations tied');
      expect(ties.length).toBeGreaterThan(0);
      expect(notationTies.length).toBeGreaterThan(0);
    });
  });

  describe('minuet-tied.musicxml', () => {
    const filePath = path.join(samplesDir, 'minuet-tied.musicxml');

    it('exists in public/samples/', () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('is a valid score-partwise XML document with parts P1 and P2 in 3/4', () => {
      const xml = fs.readFileSync(filePath, 'utf-8');
      const doc = parseXml(xml);

      expect(doc.documentElement.tagName.toLowerCase()).toBe('score-partwise');

      // Verify parts list
      const scoreParts = Array.from(doc.querySelectorAll('part-list score-part'));
      const partIds = scoreParts.map((sp) => sp.getAttribute('id'));
      expect(partIds).toContain('P1');
      expect(partIds).toContain('P2');

      // Verify Part 1 (Solo Violin)
      const part1 = doc.querySelector('part#P1, part[id="P1"]');
      expect(part1).not.toBeNull();
      const part1Measures = part1!.querySelectorAll('measure');
      expect(part1Measures.length).toBeGreaterThanOrEqual(8);

      // Verify Part 2 (Accompaniment)
      const part2 = doc.querySelector('part#P2, part[id="P2"]');
      expect(part2).not.toBeNull();
      const part2Measures = part2!.querySelectorAll('measure');
      expect(part2Measures.length).toBeGreaterThanOrEqual(8);

      // Verify tempo is 112 BPM
      const soundTag = doc.querySelector('sound[tempo]');
      expect(soundTag?.getAttribute('tempo')).toBe('112');

      // Verify 3/4 time signature
      const beats = doc.querySelector('time beats')?.textContent;
      const beatType = doc.querySelector('time beat-type')?.textContent;
      expect(beats).toBe('3');
      expect(beatType).toBe('4');

      // Verify G major key (1 fifth)
      const fifths = doc.querySelector('key fifths')?.textContent;
      expect(fifths).toBe('1');
    });

    it('contains tied notes across beats and barlines with both tie and notations/tied tags', () => {
      const xml = fs.readFileSync(filePath, 'utf-8');
      const doc = parseXml(xml);
      const part1 = doc.querySelector('part#P1, part[id="P1"]')!;

      const startTies = part1.querySelectorAll('tie[type="start"]');
      const stopTies = part1.querySelectorAll('tie[type="stop"]');
      const startNotations = part1.querySelectorAll('notations tied[type="start"]');
      const stopNotations = part1.querySelectorAll('notations tied[type="stop"]');

      expect(startTies.length).toBeGreaterThanOrEqual(2);
      expect(stopTies.length).toBeGreaterThanOrEqual(2);
      expect(startNotations.length).toBeGreaterThanOrEqual(2);
      expect(stopNotations.length).toBeGreaterThanOrEqual(2);

      // Verify both tie and notation tied tags exist on the same note
      const notesWithBoth = Array.from(part1.querySelectorAll('note')).filter((note) => {
        const hasTie = note.querySelector('tie') !== null;
        const hasNotationsTied = note.querySelector('notations tied') !== null;
        return hasTie && hasNotationsTied;
      });
      expect(notesWithBoth.length).toBeGreaterThanOrEqual(4);
    });
  });
});
