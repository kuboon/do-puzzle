/**
 * Zoom off for a play screen — every game page wants it: a quick second tap on a cell is a move,
 * not a request to zoom in.
 *
 * Three layers, because no one of them covers every browser:
 *
 * - {@link NO_ZOOM_VIEWPORT}, for the page's `viewport` export: `maximum-scale=1,
 *   user-scalable=no` turns zoom off where the browser honours it. iOS Safari does not.
 * - `touch-action: pan-x pan-y` on the whole document, from {@link lockZoom}: panning (scrolling)
 *   stays, and since neither value includes `pinch-zoom` or double-tap, both are gone — on iOS too.
 * - Safari's `gesture*` events refused, which is what stops a pinch on iOS.
 */

/** The viewport meta for a play screen. */
export const NO_ZOOM_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

/**
 * Turns zoom off for the whole document until `signal` aborts — an island passes its own
 * `handle.signal`, so navigating away gives the next page its zoom back.
 */
export function lockZoom(signal: AbortSignal): void {
  const root = document.documentElement;
  const before = root.style.touchAction;
  root.style.touchAction = "pan-x pan-y";
  const refuse = (event: Event) => event.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, refuse, { signal, passive: false });
  }
  signal.addEventListener("abort", () => {
    root.style.touchAction = before;
  });
}
