import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
