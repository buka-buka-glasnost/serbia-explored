import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useApp } from '../state/store';

vi.mock('../map/MapView', () => ({ MapView: () => null }));

import { App } from './App';

const initial = useApp.getState();
afterEach(cleanup);
beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ status: 'error', init: vi.fn(async () => undefined) });
});

describe('App error screen and title', () => {
  it('is translated and sets the document title per language', () => {
    useApp.setState({ settings: { ...initial.settings, lang: 'sr-Cyrl' } });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('Подаци за мапу нису могли да се учитају.');
    expect(screen.getByRole('button', { name: 'Покушај поново' })).toBeInTheDocument();
    expect(document.title).toBe('Истражи Србију');
    cleanup();
    useApp.setState({ settings: { ...initial.settings, lang: 'en' } });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(document.title).toBe('Serbia Explored');
  });
});
