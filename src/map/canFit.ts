/** A map can only fit bounds once its container has a non-zero size. */
export function canFit(size: { x: number; y: number }): boolean {
  return size.x > 0 && size.y > 0;
}
