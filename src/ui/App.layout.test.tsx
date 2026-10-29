import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// stands in for the Leaflet container (focusable, like the real one)
vi.mock('../map/MapView', () => ({ MapView: () => <div data-testid="map" className="leaflet-container" tabIndex={0} /> }));

import { App } from './App';
import { useApp } from '../state/store';
import { makePlace } from './testPlaces';
import { setWelcomeDismissed } from './welcomePrefs';

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
  setWelcomeDismissed(true); // the welcome message is covered by its own tests
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

    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Alpha' })).toHaveClass('bottom-sheet');
  });

  it('closes the sheet with its back button', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to map' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('closes the drawer when tapping the already-selected place', async () => {
    mockMatchMedia(true);
    useApp.setState({ selectedId: 'Q1' });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('keeps the side panel and the desktop card on wide screens', async () => {
    mockMatchMedia(false);
    render(<App />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search places…' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(screen.getByRole('article', { name: 'Alpha' })).not.toHaveClass('bottom-sheet');
  });
});

describe('App top bar on a phone', () => {
  it('opens the sheet on the Trip tab from the Trip button, focusing Back, and shows the stop count', async () => {
    mockMatchMedia(true);
    useApp.setState({ trip: { ...initial.trip, stopIds: ['Q1', 'Q2'] } });
    render(<App />);
    const trip = screen.getByRole('button', { name: 'Trip: 2' });
    await userEvent.click(trip);
    expect(screen.getByRole('button', { name: /^Trip/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to map' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(trip).toHaveFocus();
  });

  it('typing a search on the Trip tab switches to the places list', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Trip' }));
    await userEvent.type(screen.getByRole('searchbox'), 'Al');
    expect(screen.getByRole('button', { name: 'Places', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('shows the current search in the top bar', () => {
    mockMatchMedia(true);
    useApp.setState({ query: 'Studenica' });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Search places…' })).toHaveTextContent('Studenica');
  });
});

describe('App picking on a phone', () => {
  it('closes the drawer when picking starts and shows the hint with Cancel in the top bar', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tap the map to choose an area.');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(useApp.getState().picking).toBe(false);
    expect(screen.getByRole('button', { name: 'Search places…' })).toBeInTheDocument();
  });

  it('Escape cancels picking', async () => {
    mockMatchMedia(true);
    useApp.setState({ picking: true });
    render(<App />);
    await userEvent.keyboard('{Escape}');
    expect(useApp.getState().picking).toBe(false);
  });
});

describe('App keyboard and focus', () => {
  it('sets the html lang from the language', () => {
    mockMatchMedia(false);
    render(<App />);
    expect(document.documentElement.lang).toBe('en');
    act(() => useApp.getState().setSettings({ lang: 'sr-Cyrl' }));
    expect(document.documentElement.lang).toBe('sr-Cyrl');
  });

  it('sheet from the search field: focuses the search box, makes the map inert, Escape closes it and focus returns', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    expect(screen.getByRole('searchbox', { name: 'Search places…' })).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Search places…' })).toHaveFocus();
  });

  it('card from the list: heading takes focus; Escape closes it and focus returns to the row', async () => {
    mockMatchMedia(false);
    render(<App />);
    const row = screen.getByRole('button', { name: /Alpha/ });
    await userEvent.click(row);
    expect(screen.getByRole('heading', { name: 'Alpha', level: 2 })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(useApp.getState().selectedId).toBeNull();
    expect(row).toHaveFocus();
  });

  it('card from the map: focus is not moved into the card; closing it focuses the map', async () => {
    mockMatchMedia(false);
    render(<App />);
    act(() => useApp.getState().select('Q2'));
    expect(screen.getByRole('heading', { name: 'Beta', level: 2 })).not.toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('map')).toHaveFocus();
  });

  it('Escape leaves the card open while the welcome dialog is open', async () => {
    mockMatchMedia(false);
    useApp.setState({ selectedId: 'Q1', welcomeOpen: true });
    render(<App />);
    await userEvent.keyboard('{Escape}');
    expect(useApp.getState().selectedId).toBe('Q1');
  });
});

describe('App drawer focus bookkeeping', () => {
  it('a close request while already closing does not later pull focus to List', async () => {
    mockMatchMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    const back = screen.getByRole('button', { name: 'Back to map' });
    await userEvent.click(back);
    act(() => back.click()); // still on screen while the sheet closes
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.click(screen.getByRole('button', { name: 'Search places…' }));
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => useApp.getState().select('Q2')); // chosen on the map: closes the drawer
    expect(screen.getByRole('button', { name: 'Search places…' })).not.toHaveFocus();
  });
});

