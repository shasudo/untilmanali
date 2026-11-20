// Haptics: tiny vibrations so taps feel physical. Android buzzes;
// iPhones and desktops silently skip (no vibrate API there).
// Only ever fires on real taps — never on its own.
export function buzz(kind: 'tap' | 'select' | 'go' | 'nope' = 'tap'): void {
  try {
    const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    if (typeof nav.vibrate !== 'function') return
    nav.vibrate(
      kind === 'tap' ? 10 : kind === 'select' ? 15 : kind === 'go' ? [12, 35, 12] : [45, 40, 45]
    )
  } catch {
    /* unsupported — stay silent */
  }
}
