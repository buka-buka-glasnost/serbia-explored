import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '../state/store';
import { PlaceCard } from './PlaceCard';
import { makePlace } from './testPlaces';

const initial = useApp.getState();
beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ settings: { ...initial.settings, lang: 'en' }, status: 'ready' });
});

describe('PlaceCard', () => {
  it('renders a bare place without crashing', () => {
    render(<PlaceCard place={makePlace('Q1', { nameEn: 'Bare place' })} />);
    expect(screen.getByText('Bare place')).toBeInTheDocument();
    expect(screen.getByText('Information not available yet')).toBeInTheDocument();
  });

  it('shows the access label', () => {
    render(<PlaceCard place={makePlace('Q1', { access: 'hike_boat' })} />);
    expect(screen.getByText('Hike / boat only')).toBeInTheDocument();
  });

  it('turns the primary button into a disabled "✓ Visited" once visited', () => {
    useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-10-26', note: '', photoIds: [] } } });
    render(<PlaceCard place={makePlace('Q1')} />);
    expect(screen.getByRole('button', { name: '✓ Visited' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark as visited' })).not.toBeInTheDocument();
  });

  it('is hidden from assistive tech while closing', () => {
    render(<PlaceCard place={makePlace('Q1', { nameEn: 'Gone' })} closing />);
    expect(screen.queryByRole('article', { name: 'Gone' })).not.toBeInTheDocument();
  });

  it('marks an estimated access label with an asterisk and a note', () => {
    render(<PlaceCard place={makePlace('Q1', { access: 'door', accessEstimated: true })} />);
    expect(screen.getByText('Drive to the door').textContent).toBe('Drive to the door*');
    expect(screen.getByText('* Estimated from road data (OpenStreetMap)')).toBeInTheDocument();
  });

  it('shows no asterisk for a hand-set access label', () => {
    render(<PlaceCard place={makePlace('Q1', { access: 'door' })} />);
    expect(screen.getByText('Drive to the door').textContent).toBe('Drive to the door');
    expect(screen.queryByText(/Estimated from road data/)).not.toBeInTheDocument();
  });

  it('shows the not-translated note in en with only a Serbian description', () => {
    render(<PlaceCard place={makePlace('Q1', { descSr: 'Опис.' })} />);
    expect(screen.getByText('Not translated yet — shown in Serbian.')).toBeInTheDocument();
  });

  it('renders photo credit and designation badges', () => {
    const photo = { url: 'http://x/y.jpg', file: 'y.jpg', author: 'Ann', license: 'CC BY', sourceUrl: 'http://x/src' };
    render(<PlaceCard place={makePlace('Q1', { photo, designations: ['national_park'] })} />);
    expect(screen.getByRole('link', { name: '© Ann, CC BY' })).toHaveAttribute('href', 'http://x/src');
    expect(screen.getByText('National park')).toBeInTheDocument();
  });

  it('Mark as visited calls markVisited(id)', async () => {
    const markVisited = vi.fn(async () => undefined);
    useApp.setState({ markVisited });
    render(<PlaceCard place={makePlace('Q1')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as visited' }));
    expect(markVisited).toHaveBeenCalledWith('Q1');
  });

  it('Add to trip calls addToTrip(id)', async () => {
    const addToTrip = vi.fn();
    useApp.setState({ addToTrip });
    render(<PlaceCard place={makePlace('Q1')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to trip' }));
    expect(addToTrip).toHaveBeenCalledWith('Q1');
  });

  it('shows the imported note after a backup import (data reload)', () => {
    useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-10-26', note: 'old', photoIds: [] } } });
    render(<PlaceCard place={makePlace('Q1')} />);
    expect(screen.getByRole('textbox')).toHaveValue('old');
    act(() => useApp.setState((s) => ({
      visits: { Q1: { placeId: 'Q1', date: '2026-10-26', note: 'imported', photoIds: [] } },
      dataVersion: s.dataVersion + 1,
    })));
    expect(screen.getByRole('textbox')).toHaveValue('imported');
  });

  describe('bottom sheet drag-dismiss', () => {
    const phone = (reduced: boolean) => {
      window.matchMedia = ((q: string) => ({
        matches: q === '(max-width: 767px)' || (reduced && q === '(prefers-reduced-motion: reduce)'),
        media: q, addEventListener: () => undefined, removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    };
    const drag = (handle: Element) => {
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 300 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 450 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 450 });
    };
    const original = window.matchMedia;
    afterEach(() => { window.matchMedia = original; });

    it('slides on from the finger: keeps translateY(100%) and marks the sheet', () => {
      phone(false);
      useApp.setState({ selectedId: 'Q1' });
      const { container } = render(<PlaceCard place={makePlace('Q1')} />);
      drag(container.querySelector('.sheet-handle')!);
      const sheet = container.querySelector('.place-card') as HTMLElement;
      expect(useApp.getState().selectedId).toBeNull();
      expect(sheet.style.transform).toBe('translateY(100%)');
      expect(sheet).toHaveClass('drag-dismissed');
    });

    it('with reduced motion stays where the finger left it (to fade there)', () => {
      phone(true);
      const { container } = render(<PlaceCard place={makePlace('Q1')} />);
      drag(container.querySelector('.sheet-handle')!);
      const sheet = container.querySelector('.place-card') as HTMLElement;
      expect(sheet.style.transform).toBe('translateY(150px)');
      expect(sheet).toHaveClass('drag-dismissed');
    });
  });
});

