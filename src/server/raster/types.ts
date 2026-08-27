export type GeographicPoint = {
  // Coordinates use the geographic CRS associated with the raster, usually longitude/latitude.
  lat: number;
  lng: number;
};

export type PixelPoint = {
  // Zero-based image column and row, not projected map coordinates.
  x: number;
  y: number;
};

export type RasterSample =
  | { status: "value"; value: number }
  | { status: "missing"; reason: "out-of-bounds" | "nodata" };

export type RasterDescriptor = {
  absolutePath: string;
  // Projection overrides support products whose GeoTIFF keys are absent or incomplete.
  projection?: string;
  geographicProjection?: string;
  // Zero-based band index; elevation is normally stored in the first band.
  sampleIndex?: number;
};

export type RasterMetadata = {
  width: number;
  height: number;
  // Projected coordinate at the upper-left pixel origin.
  origin: [number, number];
  // Projected units per pixel; Y is commonly negative for north-up rasters.
  resolution: [number, number];
  // Decoder tile dimensions, or strip dimensions for a non-tiled image.
  blockSize: [number, number];
  isTiled: boolean;
  samplesPerPixel: number;
  noData: number | null;
  geoKeys: Record<string, unknown>;
};

export type RasterSamplingResult = {
  metadata: RasterMetadata;
  samples: RasterSample[];
  blocksRead: number;
};
