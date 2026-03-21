let hasUserGesture = false;
let gestureBound = false;
let sharedCtx: AudioContext | null = null;

function getAudioContextCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

function markGesture() {
  hasUserGesture = true;
  if (sharedCtx && sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => null);
  }
}

export function bindAudioUnlock() {
  if (typeof window === 'undefined' || gestureBound) return;
  gestureBound = true;
  const handler = () => markGesture();
  window.addEventListener('pointerdown', handler, { passive: true, capture: true });
  window.addEventListener('keydown', handler, { passive: true, capture: true });
  window.addEventListener('touchstart', handler, { passive: true, capture: true });
}

export function canPlayUiSounds() {
  bindAudioUnlock();
  return hasUserGesture;
}

async function getSharedContext() {
  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  if (sharedCtx.state === 'suspended') {
    if (!hasUserGesture) return null;
    await sharedCtx.resume().catch(() => null);
  }
  return sharedCtx;
}

export async function playUiBeep({ frequency = 880, durationMs = 120, gainValue = 0.04 }: { frequency?: number; durationMs?: number; gainValue?: number } = {}) {
  if (!canPlayUiSounds()) return false;
  const ctx = await getSharedContext();
  if (!ctx) return false;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  window.setTimeout(() => {
    try { osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  }, durationMs);
  return true;
}

export async function startLoopingRing({ frequency = 620, pulseMs = 900, gainValue = 0.05 }: { frequency?: number; pulseMs?: number; gainValue?: number } = {}) {
  if (!canPlayUiSounds()) return { stop() {} };
  const ctx = await getSharedContext();
  if (!ctx) return { stop() {} };
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  const pulse = () => {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + 0.06);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
  };
  pulse();
  const timer = window.setInterval(pulse, pulseMs);
  return {
    stop() {
      window.clearInterval(timer);
      try { osc.stop(); } catch {}
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    },
  };
}
