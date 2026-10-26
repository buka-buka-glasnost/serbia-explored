import { describe, it, expect, vi, afterEach } from 'vitest';
import { resizeImage, MAX_PHOTOS_PER_VISIT } from './photos';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('resizeImage', () => {
  it('caps at 5 photos per visit', () => { expect(MAX_PHOTOS_PER_VISIT).toBe(5); });

  it('downsizes a 4000x3000 bitmap to 1600x1200 via createImageBitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const calls: string[] = [];
    const drawImage = vi.fn(() => { calls.push('draw'); });
    const fillRect = vi.fn(() => { calls.push('fill'); });
    const ctx = { drawImage, fillRect, fillStyle: '' };
    const out = new Blob(['x'], { type: 'image/jpeg' });
    const sizes: number[][] = [];
    class FakeOffscreen {
      constructor(public width: number, public height: number) { sizes.push([width, height]); }
      getContext() { return ctx; }
      convertToBlob = vi.fn(async () => out);
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
    const result = await resizeImage(new Blob(['in']));
    expect(sizes).toEqual([[1600, 1200]]);
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1600, 1200]);
    // transparent PNGs must not turn black: white first, then the image
    expect(ctx.fillStyle).toBe('#fff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
    expect(calls).toEqual(['fill', 'draw']);
    expect(result).toBe(out);
    expect(close).toHaveBeenCalled();
  });

  it('does not upscale small images', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600 })));
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) { expect([width, height]).toEqual([800, 600]); }
      getContext() { return { drawImage, fillRect }; }
      async convertToBlob() { return new Blob(['x']); }
    });
    await resizeImage(new Blob(['in']));
    expect(drawImage.mock.calls[0].slice(3)).toEqual([800, 600]);
  });

  it('falls back to <img> + DOM canvas when createImageBitmap is undefined', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('OffscreenCanvas', undefined);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const imgSpy = vi.fn();
    class FakeImage {
      naturalWidth = 3200; naturalHeight = 1600;
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_v: string) { imgSpy(); queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', FakeImage);
    const calls: string[] = [];
    const drawImage = vi.fn(() => { calls.push('draw'); });
    const fillRect = vi.fn(() => { calls.push('fill'); });
    const ctx = { drawImage, fillRect, fillStyle: '' };
    const out = new Blob(['x'], { type: 'image/jpeg' });
    const canvas = {
      width: 0, height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob) => void, type: string, q: number) => { expect([type, q]).toEqual(['image/jpeg', 0.8]); cb(out); },
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
    const result = await resizeImage(new Blob(['in']));
    expect(imgSpy).toHaveBeenCalled();
    expect([canvas.width, canvas.height]).toEqual([1600, 800]);
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1600, 800]);
    expect(ctx.fillStyle).toBe('#fff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 800);
    expect(calls).toEqual(['fill', 'draw']);
    expect(result).toBe(out);
  });
});
