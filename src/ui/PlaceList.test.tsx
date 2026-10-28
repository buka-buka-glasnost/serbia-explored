import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { areaState } from '../state/store';
import type { AreaFC } from '../shared/types';
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
  it('orders by tier, then by the displayed name', () => {
    const ps = [
      makePlace('a', { nameEn: 'Zeta', tier: 1 }), makePlace('b', { nameEn: 'Beta', tier: 2 }),
      makePlace('c', { nameEn: 'Alpha', tier: 2 }), makePlace('d', { nameEn: 'Omega', tier: 1 }),
    ];
    useApp.setState({ places: ps, placesById: new Map(ps.map((p) => [p.id, p])) });
    render(<PlaceList />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Omega', 'Zeta', 'Alpha', 'Beta']);
  });

  it('lists places inside the area first, then nearby ones under a heading', () => {
    const square = { type: 'Polygon' as const, coordinates: [[[20, 44], [21, 44], [21, 45], [20, 45], [20, 44]]] };
    const areas: AreaFC = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: square, properties: { id: 'm1', level: 'municipality', nameSr: 'Општина', inKosovo: false } },
    ] };
    const ps = [
      makePlace('near', { nameEn: 'Aaa near', lat: 44.5, lon: 21.05 }),
      makePlace('in', { nameEn: 'Zzz inside', lat: 44.5, lon: 20.5 }),
      makePlace('far', { nameEn: 'Far away', lat: 44.5, lon: 23 }),
    ];
    useApp.setState({ places: ps, placesById: new Map(ps.map((p) => [p.id, p])), ...areaState(areas), areaId: 'm1' });
    render(<PlaceList />);
    const list = screen.getByLabelText('List of places');
    const items = Array.from(list.children).map((el) => el.textContent);
    expect(items).toEqual(['Zzz inside', 'Nearby', 'Aaa near']);
    expect(screen.getByRole('heading', { name: 'Nearby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aaa near' })).toHaveClass('dim');
  });

  it('gives the visited mark a text alternative', () => {
    useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] } } });
    render(<PlaceList />);
    expect(screen.getByRole('button', { name: /Studenica Monastery.*Visited/ })).toBeInTheDocument();
  });

  it('scrolls a long list to a place selected on the map', () => {
    const ps = Array.from({ length: 600 }, (_, i) => makePlace(`p${i}`, { nameEn: `Place ${String(i).padStart(3, '0')}` }));
    useApp.setState({ places: ps, placesById: new Map(ps.map((p) => [p.id, p])) });
    render(<PlaceList />);
    expect(screen.queryByRole('button', { name: 'Place 400' })).not.toBeInTheDocument();
    act(() => useApp.setState({ selectedId: 'p400' }));
    expect(screen.getByRole('button', { name: 'Place 400' })).toHaveAttribute('aria-current', 'true');
  });
});
