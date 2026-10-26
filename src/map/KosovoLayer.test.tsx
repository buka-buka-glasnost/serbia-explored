import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// Leaflet layers stand-ins: each GeoJSON reports what it would draw.
vi.mock('react-leaflet', () => ({
  Pane: ({ children, name }: { children: React.ReactNode; name: string }) => <div data-pane={name}>{children}</div>,
  GeoJSON: ({ data }: { data: GeoJSON.Feature<GeoJSON.Polygon> }) => (
    <div data-testid="geojson" data-rings={data.geometry.coordinates.length} data-first={JSON.stringify(data.geometry.coordinates.at(-1)?.[0])} />
  ),
}));
vi.mock('../data/loadData', () => ({ loadOutlines: vi.fn(), loadKosovoOutline: vi.fn() }));

import * as loadData from '../data/loadData';
import { KosovoLayer } from './KosovoLayer';
import { useApp } from '../state/store';

const initial = useApp.getState();
const ring = (x: number): GeoJSON.Position[] => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 0]];
const outline = (id: string, x: number) => ({
  type: 'Feature' as const, properties: { id }, geometry: { type: 'Polygon' as const, coordinates: [ring(x)] },
});
const outlines = { type: 'FeatureCollection' as const, features: [outline('serbia', 1), outline('serbia-with-kosovo', 2)] };
const kosovo = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring(9)] } };

const mask = () => document.querySelector('[data-pane="outside-serbia"] [data-testid="geojson"]');
const border = () => screen.queryAllByTestId('geojson').find((el) => !el.closest('[data-pane]'));

beforeEach(() => {
  useApp.setState(initial, true);
  vi.mocked(loadData.loadOutlines).mockResolvedValue(outlines);
  vi.mocked(loadData.loadKosovoOutline).mockResolvedValue(kosovo);
});

describe('KosovoLayer', () => {
  it('with Kosovo shown: masks around Serbia with Kosovo and draws the Kosovo border', async () => {
    render(<KosovoLayer />);
    await waitFor(() => expect(mask()).not.toBeNull());
    expect(mask()).toHaveAttribute('data-first', JSON.stringify([2, 0])); // the serbia-with-kosovo hole
    expect(border()).toHaveAttribute('data-first', JSON.stringify([9, 0]));
  });

  it('with Kosovo hidden: masks around Serbia without Kosovo and draws no border', async () => {
    useApp.setState({ settings: { ...initial.settings, kosovoShown: false } });
    render(<KosovoLayer />);
    await waitFor(() => expect(mask()).not.toBeNull());
    expect(mask()).toHaveAttribute('data-first', JSON.stringify([1, 0]));
    expect(border()).toBeUndefined();
  });

  it('switches the mask when the toggle changes', async () => {
    render(<KosovoLayer />);
    await waitFor(() => expect(mask()).not.toBeNull());
    act(() => useApp.getState().setSettings({ kosovoShown: false }));
    expect(mask()).toHaveAttribute('data-first', JSON.stringify([1, 0]));
  });

  it('does not paint the border before the mask is loaded', async () => {
    let finish!: (v: typeof outlines) => void;
    vi.mocked(loadData.loadOutlines).mockReturnValue(new Promise((res) => { finish = res; }));
    render(<KosovoLayer />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryAllByTestId('geojson')).toHaveLength(0);
    await act(async () => finish(outlines));
    expect(mask()).not.toBeNull();
    expect(border()).toBeDefined();
  });

  it('a failed outline load still leaves the map working (no layers, no error)', async () => {
    vi.mocked(loadData.loadOutlines).mockRejectedValue(new Error('404'));
    vi.mocked(loadData.loadKosovoOutline).mockRejectedValue(new Error('404'));
    render(<KosovoLayer />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryAllByTestId('geojson')).toHaveLength(0);
  });
});
