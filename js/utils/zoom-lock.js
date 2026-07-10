/**
 * zoom-lock.js
 * Disables all common browser zoom gestures so HUB Chat behaves like a
 * fixed-scale app shell. This does not affect normal scrolling.
 */
export function initZoomLock(){
  // --- Ctrl/Cmd + '+' / '-' / '0' and Ctrl + scroll wheel ---
  window.addEventListener('keydown', (e) => {
    const zoomKeys = ['=', '+', '-', '_', '0'];
    if ((e.ctrlKey || e.metaKey) && zoomKeys.includes(e.key)) {
      e.preventDefault();
    }
  }, { passive:false });

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive:false });

  // --- Pinch-to-zoom (touch gestures, Safari-specific events) ---
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());

  // --- Multi-touch pinch on non-Safari browsers ---
  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive:false });

  // --- Double-tap-to-zoom guard ---
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive:false });
}
