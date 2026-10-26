import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '../state/store';
import { Filters } from './Filters';

const initial = useApp.getState();
beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ settings: { ...initial.settings, lang: 'en', tiers: [1, 2, 3], kinds: ['culture', 'nature'] } });
});

describe('Filters', () => {
  it('shows tier and kind chips with their pressed state', () => {
    render(<Filters />);
    expect(screen.getByRole('button', { name: 'UNESCO' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Other' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Nature' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles a tier and a kind', async () => {
    const setSettings = vi.fn();
    useApp.setState({ setSettings });
    render(<Filters />);
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(setSettings).toHaveBeenCalledWith({ tiers: [1, 2, 3, 4] });
    await userEvent.click(screen.getByRole('button', { name: 'Culture' }));
    expect(setSettings).toHaveBeenCalledWith({ kinds: ['nature'] });
  });
});
