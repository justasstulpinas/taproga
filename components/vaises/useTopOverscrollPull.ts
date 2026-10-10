import { useEffect, type RefObject } from "react";

const MAX_PULL_PX = 56;
// Share of the gesture distance that becomes movement, before the rubber-band curve.
const PULL_RATIO = 0.15;
// Per-frame decay once input pauses; lower = snappier return.
const RETURN_DECAY = 0.86;
// How long without input before the bar starts returning (trackpad events arrive in bursts).
const INPUT_HOLD_MS = 50;
// A pause this long between wheel events starts a new gesture. Momentum events arrive
// continuously, so a scroll that reaches the top from below stays one gesture.
const GESTURE_GAP_MS = 220;
const SETTLED_PX = 0.3;
const TOPBAR_SELECTOR = ".kvieciam-topbar";
// Safari and Chrome on macOS rubber-band the whole document even when it doesn't scroll,
// so the bounce must be disabled on <html>/<body> too, not only on the scroll container.
const NO_BOUNCE_CLASS = "vaises-no-bounce";

/** Diminishing returns: approaches MAX_PULL_PX but never passes it. */
function rubberBand(distance: number): number {
  return MAX_PULL_PX * (1 - Math.exp(-(distance * PULL_RATIO) / MAX_PULL_PX));
}

/**
 * Replaces the browser's overscroll bounce at the top of `rootRef` with a pull on the top bar.
 * Runs on requestAnimationFrame and moves only the bar's transform, so it never triggers
 * layout or re-renders, and trackpad momentum simply tails off instead of restarting a timer.
 */
export function useTopOverscrollPull(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    document.documentElement.classList.add(NO_BOUNCE_CLASS);
    return () => document.documentElement.classList.remove(NO_BOUNCE_CLASS);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const bar = root?.querySelector<HTMLElement>(TOPBAR_SELECTOR);
    if (!root || !bar) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let distance = 0;
    let lastInputAt = 0;
    let lastWheelAt = 0;
    let gestureStartedAtTop = false;
    let touchStartY: number | null = null;
    let frame: number | null = null;

    const render = () => {
      bar.style.transform = distance > 0 ? `translate3d(0, ${rubberBand(distance)}px, 0)` : "";
    };

    const tick = (now: number) => {
      const holding = touchStartY !== null || now - lastInputAt < INPUT_HOLD_MS;
      if (!holding) distance *= RETURN_DECAY;
      if (!holding && rubberBand(distance) < SETTLED_PX) {
        distance = 0;
        render();
        frame = null;
        return;
      }
      render();
      frame = requestAnimationFrame(tick);
    };

    const ensureRunning = () => {
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      if (now - lastWheelAt > GESTURE_GAP_MS) {
        // Only a gesture that begins while already at the top of the first panel may pull;
        // scrolling up from panel 2 must not move the bar when it arrives at the top.
        gestureStartedAtTop = root.scrollTop <= 0;
      }
      lastWheelAt = now;
      if (!gestureStartedAtTop || root.scrollTop > 0 || event.deltaY >= 0) return;
      distance += -event.deltaY;
      lastInputAt = now;
      ensureRunning();
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = root.scrollTop <= 0 ? event.touches[0].clientY : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchStartY === null) return;
      distance = Math.max(0, event.touches[0].clientY - touchStartY);
      ensureRunning();
    };
    const onTouchEnd = () => {
      touchStartY = null;
    };

    root.addEventListener("wheel", onWheel, { passive: true });
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      bar.style.transform = "";
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [rootRef]);
}
