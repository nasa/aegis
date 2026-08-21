export type GeographicPoint = {
  lat: number;
  lng: number;
};

export type PixelPoint = {
  x: number;
  y: number;
};

export type RasterSample =
  | { status: "value"; value: number }
  | { status: "missing"; reason: "out-of-bounds" | "nodata" };

export type RasterDescriptor = {
  absolutePath: string;
  projection?: string;
  geographicProjection?: string;
  sampleIndex?: number;
};

export type RasterMetadata = {
  width: number;
  height: number;
  origin: [number, number];
  resolution: [number, number];
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
