import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
