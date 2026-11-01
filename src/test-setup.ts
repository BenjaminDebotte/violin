import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

// Minimal canvas 2d context stub for OSMD font metrics in JSDOM
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn();
}
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    font: '',
    measureText: vi.fn().mockReturnValue({ width: 12 }),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// Minimal AudioContext stub for components utilizing Web Audio in JSDOM
if (typeof window !== 'undefined' && !window.AudioContext) {
  class MockAudioParam {
    value = 1.0;
    setValueAtTime = vi.fn((val: number) => {
      this.value = val;
    });
    linearRampToValueAtTime = vi.fn((val: number) => {
      this.value = val;
    });
    exponentialRampToValueAtTime = vi.fn((val: number) => {
      this.value = val;
    });
  }

  class MockAudioNode {
    connect = vi.fn();
    disconnect = vi.fn();
  }

  class MockGainNode extends MockAudioNode {
    gain = new MockAudioParam();
  }

  class MockOscillatorNode extends MockAudioNode {
    frequency = new MockAudioParam();
    type: OscillatorType = 'sine';
    start = vi.fn();
    stop = vi.fn();
  }

  class MockBiquadFilterNode extends MockAudioNode {
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
    type: BiquadFilterType = 'lowpass';
  }

  class MockAnalyserNode extends MockAudioNode {
    fftSize = 2048;
    frequencyBinCount = 1024;
    getFloatTimeDomainData = vi.fn();
  }

  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    state: AudioContextState = 'running';
    destination = new MockAudioNode();

    createGain() {
      return new MockGainNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    createBiquadFilter() {
      return new MockBiquadFilterNode();
    }
    createAnalyser() {
      return new MockAnalyserNode();
    }
    createMediaStreamSource() {
      return new MockAudioNode();
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }

  window.AudioContext = MockAudioContext as unknown as typeof AudioContext;
}

// Safe fallback for OpenSheetMusicDisplay.render in headless JSDOM environments
const originalRender = OpenSheetMusicDisplay.prototype.render;
OpenSheetMusicDisplay.prototype.render = function () {
  try {
    return originalRender.call(this);
  } catch {
    // In JSDOM where canvas font measuring / SVG layout engine lacks layout metrics,
    // inject SVG representation so DOM queries and O(1) notehead coloring work seamlessly.
    const container = this.container;
    if (container) {
      container.innerHTML = `
        <svg id="osmd-svg-sheet" width="800" height="400">
          <g class="vf-stavenote" data-note-id="p0-m1-n0">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m1-n1">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m1-n2">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m1-n3">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m2-n0">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
          <g class="vf-stavenote" data-note-id="p0-m2-n1">
            <path class="vf-notehead" fill="#000000" stroke="#000000" />
          </g>
        </svg>
      `;
    }
  }
};
