import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '../state/store';
import { BackupControls } from './BackupControls';

const initial = useApp.getState();
beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ settings: { ...initial.settings, lang: 'en' } });
});

describe('BackupControls', () => {
  it('shows the storage banner when storage is unavailable', () => {
    useApp.setState({ storageOk: false });
    render(<BackupControls />);
    expect(screen.getByRole('alert')).toHaveTextContent("Your progress can't be saved in this browser (private mode?).");
  });
  it('hides the banner when storage works', () => {
    render(<BackupControls />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('has a real, keyboard-focusable Import button that opens the file picker', async () => {
    const { container } = render(<BackupControls />);
    const btn = screen.getByRole('button', { name: 'Import data' });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await userEvent.tab();
    await userEvent.tab();
    expect(btn).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(click).toHaveBeenCalled();
  });
  it('asks with the add-and-replace wording and the counts', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = render(<BackupControls />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([JSON.stringify({
      format: 'serbia-explored-backup', version: 1, exportedAt: 'x', trip: null, settings: null,
      visits: [{ placeId: 'Q1', date: 'd', note: '', photoIds: [] }], photos: [],
    })], 'b.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0]).toBe(
      'Importing will add the visits from this file (1 visits, 0 photos), replacing any you already have for the same places. Continue?',
    );
    confirm.mockRestore();
  });
});
