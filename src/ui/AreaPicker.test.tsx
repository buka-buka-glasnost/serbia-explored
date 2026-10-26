import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '../state/store';
import type { AreaFC, AreaProps } from '../shared/types';
import { AreaPicker } from './AreaPicker';

const initial = useApp.getState();
const sq = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const f = (p: AreaProps) => ({ type: 'Feature' as const, properties: p, geometry: sq });
const areas: AreaFC = {
  type: 'FeatureCollection',
  features: [
    f({ id: 'd-raska', level: 'district', nameSr: 'Рашки округ', inKosovo: false }),
    f({ id: 'm-kraljevo', level: 'municipality', nameSr: 'Краљево', districtId: 'd-raska', inKosovo: false }),
    f({ id: 'm-pec', level: 'municipality', nameSr: 'Пећ', nameSq: 'Peja', districtId: 'd-pec', inKosovo: true }),
  ],
};

beforeEach(() => {
  useApp.setState(initial, true);
  useApp.setState({ areas, settings: { ...initial.settings, lang: 'en', kosovoShown: true } });
});

describe('AreaPicker', () => {
  it('suggests Kraljevo for "kraljevo"', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'kraljevo');
    expect(screen.getByRole('option', { name: /Kraljevo/ })).toBeInTheDocument();
  });
  it('suggests "Peć / Peja" for "peja" in en', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'peja');
    expect(screen.getByRole('option', { name: /Peć \/ Peja/ })).toBeInTheDocument();
  });
  it('hides Kosovo areas when Kosovo is hidden', async () => {
    useApp.setState({ settings: { ...useApp.getState().settings, kosovoShown: false } });
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'peć');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
  it('choosing a suggestion calls setArea(id)', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'kraljevo');
    await userEvent.click(screen.getByRole('option', { name: /Kraljevo/ }));
    expect(useApp.getState().areaId).toBe('m-kraljevo');
  });
  it('clear button resets the area', async () => {
    useApp.setState({ areaId: 'm-kraljevo' });
    render(<AreaPicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear area' }));
    expect(useApp.getState().areaId).toBeNull();
  });
  it('Pick on map button enters picking mode', async () => {
    render(<AreaPicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    expect(useApp.getState().picking).toBe(true);
    expect(screen.getByText(/Esc to cancel/)).toBeInTheDocument();
  });
  it('ArrowDown + Enter picks the active suggestion', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'kraljevo');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Kraljevo/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(useApp.getState().areaId).toBe('m-kraljevo');
  });
  it('Enter without arrows picks the first suggestion', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'kraljevo{Enter}');
    expect(useApp.getState().areaId).toBe('m-kraljevo');
  });
  it('Escape closes the suggestion list', async () => {
    render(<AreaPicker />);
    await userEvent.type(screen.getByRole('combobox'), 'kraljevo{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
