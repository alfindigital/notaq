import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70;
const MAX = 110;

export function usePullToRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);
  // Mirror state into refs so the mount-only touch handlers below always read
  // fresh values without re-subscribing (avoids stale closures).
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  useEffect(() => { pullRef.current = pull; }, [pull]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scroller = window;

    function getScrollTop() {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function onTouchStart(e: TouchEvent) {
      if (getScrollTop() > 0) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      active.current = false;
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); active.current = false; return; }
      if (getScrollTop() > 0) { setPull(0); active.current = false; return; }
      active.current = true;
      const damped = Math.min(MAX, dy * 0.5);
      setPull(damped);
    }
    async function onTouchEnd() {
      const wasActive = active.current;
      const dist = pullRef.current;
      startY.current = null;
      active.current = false;
      if (wasActive && dist >= THRESHOLD && !refreshingRef.current) {
        setRefreshing(true);
        refreshingRef.current = true;
        setPull(40);
        try { await onRefresh(); } finally {
          setRefreshing(false);
          refreshingRef.current = false;
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.min(1, pull / THRESHOLD);
  return { pull, refreshing, progress };
}
