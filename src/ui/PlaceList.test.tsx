import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useApp } from '../state/store';
import { PlaceList } from './PlaceList';
import { makePlace } from './testPlaces';

const initial = useApp.getState();
const places = [
  makePlace('Q1', { nameSr: 'Манастир Студеница', nameEn: 'Studenica Monastery' }),
  makePlace('Q2', { nameSr: 'Ђавоља варош', nameEn: 'Devil Town' }),
  makePlace('Q3', { nameSr: 'Сопоћани', nameEn: 'Sopocani' }),
];

beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({
    places, placesById: new Map(places.map((p) => [p.id, p])),
    settings: { ...initial.settings, lang: 'en' },
  });
});

describe('PlaceList', () => {
  it('lists all filtered places', () => {
    render(<PlaceList />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
  it('with query "studen" only Studenica shows', () => {
    useApp.setState({ query: 'studen' });
    render(<PlaceList />);
    expect(screen.getByText('Studenica Monastery')).toBeInTheDocument();
    expect(screen.queryByText('Devil Town')).not.toBeInTheDocument();
    expect(screen.queryByText('Sopocani')).not.toBeInTheDocument();
  });
  it('marks visited places', () => {
    useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] } } });
    render(<PlaceList />);
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });
});
