// Lightweight audio utility for keno draw sounds
// Uses Web Audio API to synthesize tones — no asset files required

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.18) {
  const ac = getCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start();
    osc.stop(ac.currentTime + duration);
  } catch {
    // silently ignore audio errors
  }
}

export const sounds = {
  playBallGlide() {
    playTone(440, 0.12, 'sine', 0.12);
  },
  playBallDock(index: number) {
    // slight pitch variation based on slot index for variety
    const freq = 520 + (index % 10) * 18;
    playTone(freq, 0.18, 'triangle', 0.15);
  },
};
