import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

// matchMedia is missing in some environments (e.g. jsdom): treat as wide.
const mql = () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

function subscribe(cb: () => void): () => void {
  const m = mql();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
}

/** True below 768 px (phone layout). */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => mql()?.matches ?? false, () => false);
}
