import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="map" /> }));

import { App } from './App';
import { useApp } from '../state/store';
import { makePlace } from './testPlaces';

const initial = useApp.getState();

function mockMatchMedia(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query === '(max-width: 767px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  const places = [makePlace('Q1', { nameEn: 'Alpha' }), makePlace('Q2', { nameEn: 'Beta' })];
  useApp.setState(initial, true);
  useApp.setState({
    settings: { ...initial.settings, lang: 'en' },
    status: 'ready',
    init: async () => undefined,
    places,
    placesById: new Map(places.map((p) => [p.id, p])),
  });
});

describe('App phone layout', () => {
  it('hides the panel until List is clicked, then closes it on selecting a place and shows a bottom sheet', async () => {
    mockMatchMedia(true);
    render(<App />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Alpha' })).toHaveClass('bottom-sheet');
  });

  it('closes the drawer with its close button', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('closes the drawer when tapping the already-selected place', async () => {
    mockMatchMedia(true);
    useApp.setState({ selectedId: 'Q1' });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('keeps the side panel and the desktop card on wide screens', async () => {
    mockMatchMedia(false);
    render(<App />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.getByRole('article', { name: 'Alpha' })).not.toHaveClass('bottom-sheet');
  });
});
