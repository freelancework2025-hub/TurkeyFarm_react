/**
 * Vaccination alert sound. Uses Web Audio API.
 *
 * - initAlertSound(): Call on app mount. Listens for first user interaction (click/touch/key)
 *   anywhere on the page to unlock audio. After that, 10-min timer works without bell click.
 * - unlockAndPlayVaccinationAlertSound(): Call from bell click for immediate feedback.
 * - playVaccinationAlertSound(): Uses stored context. Works from 10-min timer after unlock.
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

function unlockContext(): void {
  if (audioContext) return;
  try {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    playTones(ctx);
    audioContext = ctx;
  } catch {
    // Silently fail
  }
}

/** Call once when app mounts. Unlocks audio on first user interaction anywhere. */
export function initAlertSound(): void {
  if (initDone || typeof document === "undefined") return;
  initDone = true;
  const unlock = () => {
    unlockContext();
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock, { once: true, capture: true });
  document.addEventListener("touchstart", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
}

/** Call from bell click for immediate feedback. Also unlocks if not yet done. */
export function unlockAndPlayVaccinationAlertSound(): void {
  unlockContext();
}

/** Play using stored context. Works from 10-min timer after any first user interaction. */
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
