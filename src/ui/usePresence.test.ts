import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePresence } from './usePresence';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePresence', () => {
  it('shows a value at once, without a closing phase', () => {
    const { result } = renderHook(({ v }) => usePresence(v, 200), { initialProps: { v: 'a' as string | null } });
    expect(result.current).toEqual({ shown: 'a', closing: false });
  });

  it('keeps the last value while closing, then drops it after exitMs', () => {
    const { result, rerender } = renderHook(({ v }) => usePresence(v, 200), { initialProps: { v: 'a' as string | null } });
    rerender({ v: null });
    expect(result.current).toEqual({ shown: 'a', closing: true });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current.shown).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ shown: null, closing: false });
  });

  it('a new value during the exit cancels it', () => {
    const { result, rerender } = renderHook(({ v }) => usePresence(v, 200), { initialProps: { v: 'a' as string | null } });
    rerender({ v: null });
    rerender({ v: 'b' });
    expect(result.current).toEqual({ shown: 'b', closing: false });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toEqual({ shown: 'b', closing: false });
  });

  it('starting empty is neither shown nor closing', () => {
    const { result } = renderHook(() => usePresence<string>(null, 200));
    expect(result.current).toEqual({ shown: null, closing: false });
  });
});
