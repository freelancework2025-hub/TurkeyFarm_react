/**
 * Vaccination alert sound. Uses Web Audio API.
 *
 * - initAlertSound(): First user gesture creates/resumes AudioContext only — no beep (browser autoplay unlock).
 * - unlockAndPlayVaccinationAlertSound(): Bell with pending alerts — unlock if needed, then play tones.
 * - playVaccinationAlertSound(): Plays tones when context exists (5‑min poll when server reports pending alerts).
 */
let audioContext: AudioContext | null = null;
let initDone = false;

function playTones(ctx: AudioContext): void {
  const playTone = (frequency: number, startTime: number, duration: number) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.2, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };
  playTone(880, 0, 0.12);
  playTone(1100, 0.15, 0.15);
}

/** Create or resume Web Audio context on a user gesture — never plays audible tones. */
function ensureAudioContext(): void {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {});
    }
    return;
  }
  try {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    audioContext = ctx;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Silently fail
  }
}

/**
 * Call once when app mounts. Unlocks audio on first user interaction anywhere — silent (no beep).
 * Optional callback runs once when the context is first successfully created (for a subtle UI cue).
 */
export function initAlertSound(onSilentUnlock?: () => void): void {
  if (initDone || typeof document === "undefined") return;
  initDone = true;
  const unlock = () => {
    const hadContext = audioContext !== null;
    ensureAudioContext();
    if (!hadContext && audioContext !== null) {
      onSilentUnlock?.();
    }
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock, { once: true, capture: true });
  document.addEventListener("touchstart", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
}

/** Bell click when there are pending alerts: ensure context, then play tones. */
export function unlockAndPlayVaccinationAlertSound(): void {
  ensureAudioContext();
  playVaccinationAlertSound();
}

/** Play using stored context. Works from 5‑min poll after silent unlock (user gesture). */
export function playVaccinationAlertSound(): void {
  try {
    if (!audioContext || audioContext.state === "closed") return;
    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => playTones(audioContext!)).catch(() => {});
      return;
    }
    playTones(audioContext);
  } catch {
    // Silently fail
  }
}
