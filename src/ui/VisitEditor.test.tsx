import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '../state/store';
import { VisitEditor } from './VisitEditor';

const initial = useApp.getState();
const visit = (over = {}) => ({ placeId: 'Q1', date: '2026-10-01', note: '', photoIds: [] as string[], ...over });

beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ settings: { ...initial.settings, lang: 'en' } });
});
afterEach(() => vi.restoreAllMocks());

describe('VisitEditor', () => {
  it('unmarks without confirm when there is no note or photos', async () => {
    const unmarkVisited = vi.fn(async () => undefined);
    useApp.setState({ visits: { Q1: visit() }, unmarkVisited });
    const confirm = vi.spyOn(window, 'confirm');
    render(<VisitEditor placeId="Q1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Unmark as visited' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(unmarkVisited).toHaveBeenCalledWith('Q1');
  });

  it('asks to confirm with a note, and cancelling keeps the visit', async () => {
    const unmarkVisited = vi.fn(async () => undefined);
    useApp.setState({ visits: { Q1: visit({ note: 'Lovely' }) }, unmarkVisited });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<VisitEditor placeId="Q1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Unmark as visited' }));
    expect(confirm).toHaveBeenCalled();
    expect(unmarkVisited).not.toHaveBeenCalled();
    expect(useApp.getState().visits.Q1).toBeDefined();
  });

  it('saves the note on blur', async () => {
    const updateVisit = vi.fn(async () => undefined);
    useApp.setState({ visits: { Q1: visit() }, updateVisit });
    render(<VisitEditor placeId="Q1" />);
    await userEvent.type(screen.getByLabelText('Note'), 'Hi');
    await userEvent.tab();
    expect(updateVisit).toHaveBeenCalledWith('Q1', { note: 'Hi' });
  });

  it('shows a toast and skips addPhoto when beyond 5 photos', async () => {
    const addPhoto = vi.fn(async () => undefined);
    useApp.setState({ visits: { Q1: visit({ photoIds: ['a', 'b', 'c', 'd', 'e'] }) }, addPhoto });
    render(<VisitEditor placeId="Q1" />);
    await userEvent.upload(screen.getByLabelText('Add photo'), new File(['x'], 'p.png', { type: 'image/png' }));
    expect(addPhoto).not.toHaveBeenCalled();
    expect(useApp.getState().toast?.key).toBe('tooManyPhotos');
  });

  it('keeps the visit and shows an error toast if addPhoto rejects', async () => {
    const addPhoto = vi.fn(async () => { throw new Error('quota'); });
    useApp.setState({ visits: { Q1: visit({ note: 'keep' }) }, addPhoto });
    render(<VisitEditor placeId="Q1" />);
    await userEvent.upload(screen.getByLabelText('Add photo'), new File(['x'], 'p.png', { type: 'image/png' }));
    expect(addPhoto).toHaveBeenCalled();
    expect(useApp.getState().visits.Q1.note).toBe('keep');
    expect(useApp.getState().toast).toEqual({ key: 'storageError', kind: 'error' });
  });
});
