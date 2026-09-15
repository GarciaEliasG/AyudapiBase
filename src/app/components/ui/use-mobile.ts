import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeToMediaChange(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function isMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeToMediaChange, isMobileSnapshot, () => false);
}