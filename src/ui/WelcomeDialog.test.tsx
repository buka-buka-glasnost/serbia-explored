import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../map/MapView', async () => {
  const { InfoButtonView } = await import('../map/InfoButton');
  return { MapView: () => <InfoButtonView /> };
});

import { App } from './App';
import { useApp } from '../state/store';
import { isWelcomeDismissed, setWelcomeDismissed } from './welcomePrefs';

const initial = useApp.getState();

beforeEach(() => {
  localStorage.clear();
  useApp.setState(initial, true);
  useApp.setState({ settings: { ...initial.settings, lang: 'en' }, status: 'ready', init: async () => undefined });
});

describe('Welcome message', () => {
  it('opens on a first visit with focus on "Get started"', async () => {
    render(<App />);
    const dialog = await screen.findByRole('dialog', { name: 'Welcome!' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toHaveFocus();
  });

  it('explains every part of the app, including the list of places, and how to reopen it', async () => {
    render(<App />);
    const dialog = await screen.findByRole('dialog', { name: 'Welcome!' });
    for (const heading of ['The map', 'The list of places', 'Visits', 'Planning a trip', 'Your data']) {
      expect(within(dialog).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(within(dialog).getByText(/tap the search field at the top/)).toBeInTheDocument();
    expect(within(dialog).getByText(/reopen this message any time/)).toBeInTheDocument();
  });

  it('does not open when "do not show again" was ticked before', () => {
    setWelcomeDismissed(true);
    render(<App />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('remembers "do not show again" when closed', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Do not show this message again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(isWelcomeDismissed()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closing without the checkbox keeps showing it next time', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Get started' }));
    expect(isWelcomeDismissed()).toBe(false);
  });

  it('closes with Escape', async () => {
    render(<App />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reopens from the always-visible "i" button, showing the saved choice', async () => {
    setWelcomeDismissed(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'About this app' }));
    expect(await screen.findByRole('dialog', { name: 'Welcome!' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Do not show this message again' })).toBeChecked();
  });
});
