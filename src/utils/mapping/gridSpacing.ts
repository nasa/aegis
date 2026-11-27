/** Standard LGRS box intervals, in metres, from the finest to the coarsest. */
export const GRID_INTERVALS_METERS = [10, 100, 1000, 25_000] as const;

export const GRID_LABEL_MIN_PX = 60;
export const MINIMAP_MIN_LINE_PX = 3;
const FILE_GRID_TOLERANCE = 0.01;

/** File distances are measured from their coordinates. Identify the nominal interval when close. */
export function nominalGridInterval(meters: number): number {
  return (
    GRID_INTERVALS_METERS.find(
      (interval) => Math.abs(meters - interval) <= interval * FILE_GRID_TOLERANCE
    ) ?? meters
  );
}

export function standardGridInterval(minimum: number, multipleOf = 1): number {
  return (
    GRID_INTERVALS_METERS.find((interval) => interval >= minimum && interval % multipleOf === 0) ??
    Infinity
  );
}

/** Coarsen a file grid using whole index strides so its surveyed points stay aligned. */
export function fileGridStride(base: number, minimum: number, multipleOf = 1): number {
  const strides = GRID_INTERVALS_METERS.flatMap((interval) => {
    const stride = Math.round(interval / base);
    return stride > 0 && nominalGridInterval(stride * base) === interval ? [stride] : [];
  });
  const required = Math.max(multipleOf, Math.ceil(minimum / (base * (1 + FILE_GRID_TOLERANCE))));
  if (required <= multipleOf) return multipleOf;
  const standard = strides.find((stride) => stride >= required && stride % multipleOf === 0);
  if (standard) return standard;

  // A file can use a custom base interval. In that case keep a nested lattice of its own.
  const anchor = strides.filter((stride) => stride % multipleOf === 0).at(-1) ?? multipleOf;
  return anchor * 10 ** Math.max(0, Math.ceil(Math.log10(required / anchor)));
}

/** The shorter perpendicular span of a projected grid cell. */
export function gridCellWidth(origin: number[], row: number[], col: number[]): number {
  const dx = row[0] - origin[0];
  const dy = row[1] - origin[1];
  const nx = col[0] - origin[0];
  const ny = col[1] - origin[1];
  return Math.abs(dx * ny - dy * nx) / Math.max(Math.hypot(dx, dy), Math.hypot(nx, ny));
}
