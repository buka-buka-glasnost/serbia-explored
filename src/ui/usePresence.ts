import { useEffect, useRef, useState } from 'react';

/**
 * Keeps the last non-empty value rendered for `exitMs` after it goes away, so
 * the element can play its exit transition. `closing` is true during that time.
 */
export function usePresence<T>(value: T | null | undefined, exitMs: number): { shown: T | null; closing: boolean } {
  const [shown, setShown] = useState<T | null>(value ?? null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (value !== null && value !== undefined) {
      setShown(value);
      setClosing(false);
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, exitMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, exitMs]);

  return { shown: value ?? shown, closing: (value === null || value === undefined) && closing && shown !== null };
}
