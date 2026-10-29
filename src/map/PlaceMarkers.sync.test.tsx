import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import L from 'leaflet';

// The cluster group is only added to this fake map, so no marker is ever drawn (jsdom has no canvas).
const fakeMap = vi.hoisted(() => ({ addLayer: () => {}, removeLayer: () => {}, getZoom: () => 8 }));
vi.mock('react-leaflet', () => ({ useMap: () => fakeMap }));

import { PlaceMarkers } from './PlaceMarkers';
import { useApp } from '../state/store';
import { makePlace } from '../ui/testPlaces';
import { MarkerSync, PLACE_ARRIVE, type MarkerState } from './markerSync';

// the fake map also needs Leaflet's event methods (on / off / fire)
Object.setPrototypeOf(fakeMap, L.Evented.prototype);

const initial = useApp.getState();
const places = [makePlace('Q1', { nameEn: 'Alpha' }), makePlace('Q2', { nameEn: 'Beta', tier: 2 })];

beforeEach(() => {
  vi.restoreAllMocks();
  useApp.setState(initial, true);
  useApp.setState({
    places, placesById: new Map(places.map((p) => [p.id, p])),
    settings: { ...initial.settings, lang: 'en', tiers: [1, 2, 3] },
  });
});

describe('PlaceMarkers', () => {
  it('restyles only the changed marker on a visit, without rebuilding', () => {
    const create = vi.spyOn(L, 'circleMarker');
    const setStyle = vi.spyOn(L.CircleMarker.prototype, 'setStyle');
    render(<PlaceMarkers />);
    expect(create).toHaveBeenCalledTimes(2);
    const q1 = create.mock.results[0].value as L.CircleMarker;
    setStyle.mockClear();

    act(() => useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] } } }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(setStyle).toHaveBeenCalledTimes(1);
    expect(setStyle.mock.contexts[0]).toBe(q1);
    expect(q1.options.color).toBe('#1e8449'); // visited ring
  });

  it('highlights the selected marker with a larger radius and an accent ring once the camera arrives', () => {
    const create = vi.spyOn(L, 'circleMarker');
    render(<PlaceMarkers />);
    const q2 = create.mock.results[1].value as L.CircleMarker;
    const radius = q2.getRadius();
    act(() => useApp.setState({ selectedId: 'Q2' }));
    expect(q2.getRadius()).toBe(radius); // not while the map is still flying
    act(() => void (fakeMap as unknown as L.Map).fire(PLACE_ARRIVE, { id: 'Q2' }));
    expect(q2.getRadius()).toBe(radius + 3);
    expect(q2.options.color).toBe('#24508a');
    act(() => useApp.setState({ selectedId: null }));
    expect(q2.getRadius()).toBe(radius);
    // selecting it again waits for the new flight
    act(() => useApp.setState({ selectedId: 'Q2' }));
    expect(q2.getRadius()).toBe(radius);
  });

  it('relabels tooltips on a language change without rebuilding', () => {
    const create = vi.spyOn(L, 'circleMarker');
    render(<PlaceMarkers />);
    const q1 = create.mock.results[0].value as L.CircleMarker;
    act(() => useApp.getState().setSettings({ lang: 'sr-Cyrl' }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(q1.getTooltip()?.getContent()).toBe('Место Q1');
  });

  it('a marker click selects the place, or picks the area under it while picking', () => {
    const create = vi.spyOn(L, 'circleMarker');
    const pickAreaAt = vi.fn();
    useApp.setState({ pickAreaAt });
    render(<PlaceMarkers />);
    const q1 = create.mock.results[0].value as L.CircleMarker;
    q1.fire('click');
    expect(useApp.getState().selectedId).toBe('Q1');
    act(() => useApp.setState({ selectedId: null, picking: true }));
    q1.fire('click');
    expect(useApp.getState().selectedId).toBeNull();
    expect(pickAreaAt).toHaveBeenCalledWith(44, 21, 8);
  });
});

describe('MarkerSync', () => {
  const state: MarkerState = { visited: () => false, inTrip: () => false, selectedId: null, opacity: () => 1 };

  it('diffs the visible set and reuses markers', () => {
    const group = { addLayers: vi.fn(), removeLayers: vi.fn() };
    const sync = new MarkerSync(group, 'en', () => undefined);
    sync.setVisible(places, state);
    const [q1, q2] = group.addLayers.mock.calls[0][0] as L.CircleMarker[];
    sync.setVisible([places[0]], state);
    expect(group.removeLayers).toHaveBeenLastCalledWith([q2]);
    sync.setVisible(places, state);
    expect(group.addLayers).toHaveBeenLastCalledWith([q2]);
    expect(q1).not.toBe(q2);
  });
});
