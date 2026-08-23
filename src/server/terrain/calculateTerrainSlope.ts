const scaledValue = (sample: RasterSample, metadata: RasterMetadata): number | null =>
  sample.status === "value" ? sample.value * metadata.scale + metadata.offset : null;

/** Calculates an unsigned Horn 3x3 terrain slope in degrees. */
export const calculateTerrainSlopeDegrees = (
  neighborhood: RasterSample[],
  metadata: RasterMetadata
): number | null => {
  if (neighborhood.length !== 9) throw new Error("Horn slope requires a 3 by 3 neighborhood");
  const values = neighborhood.map((sample) => scaledValue(sample, metadata));
  if (values.some((value) => value === null)) return null;

  const [z1, z2, z3, z4, , z6, z7, z8, z9] = values as number[];
  const resolutionX = Math.abs(metadata.resolution[0]);
  const resolutionY = Math.abs(metadata.resolution[1]);
  const dzdx = (z3 + 2 * z6 + z9 - z1 - 2 * z4 - z7) / (8 * resolutionX);
  const dzdy = (z7 + 2 * z8 + z9 - z1 - 2 * z2 - z3) / (8 * resolutionY);
  return (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
};
