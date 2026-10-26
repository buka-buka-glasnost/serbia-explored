export const MAX_PHOTOS_PER_VISIT = 5;

function scaledSize(w: number, h: number, maxDim: number): { w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded')); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality);
  });
}

/** Downscales so the longest side is at most maxDim and re-encodes as JPEG. */
export async function resizeImage(file: Blob, maxDim = 1600, quality = 0.8): Promise<Blob> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release: (() => void) | undefined;

  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    source = bmp; width = bmp.width; height = bmp.height;
    release = () => bmp.close?.();
  } else {
    const img = await loadImage(file);
    source = img; width = img.naturalWidth; height = img.naturalHeight;
  }

  const { w, h } = scaledSize(width, height, maxDim);
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.drawImage(source, 0, 0, w, h);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(source, 0, 0, w, h);
    return await canvasToBlob(canvas, quality);
  } finally {
    release?.();
  }
}
