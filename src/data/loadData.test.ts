import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAreas, loadKosovoOutline, loadPlaces } from './loadData';

afterEach(() => vi.unstubAllGlobals());

describe('loadData', () => {
  it('fetches places.json and unwraps places', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ generatedAt: 'x', places: [{ id: 'Q1' }] })));
    vi.stubGlobal('fetch', f);
    expect(await loadPlaces()).toEqual([{ id: 'Q1' }]);
    expect(f).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}data/places.json`);
  });
  it('fetches areas and kosovo outline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }))));
    expect((await loadAreas()).type).toBe('FeatureCollection');
    expect((await loadKosovoOutline()).type).toBe('FeatureCollection');
  });
  it('throws a clear error on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404, statusText: 'Not Found' })));
    await expect(loadPlaces()).rejects.toThrow(/places\.json.*404/);
  });
});
