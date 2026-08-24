import { geographicToPixel } from "./coordTransform";
import { getRasterProjections } from "./projection";
import { openRaster, type OpenRaster } from "./rasterReader";

type Block = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  points: { index: number; pixel: PixelPoint }[];
};

export const MAX_RASTER_SAMPLES = 100_000;
export const MAX_RASTER_NEIGHBOR_PIXELS = MAX_RASTER_SAMPLES * 9;
export const MAX_RASTER_BLOCKS = 4_096;
const BLOCK_READ_CONCURRENCY = 4;

const isNoData = (value: number, noData: number | null): boolean => {
  if (Number.isNaN(value)) return true;
  if (noData === null) return false;
  if (Number.isNaN(noData)) return Number.isNaN(value);

  // Some floating-point rasters decode extreme GDAL sentinel values with small rounding changes.
  // Treat the same order-of-magnitude sentinel as missing without hiding ordinary elevations.
  const rangeFactor = Math.abs(noData) > 1_000_000_000 ? 10 : 1;
  return (
    Math.abs(value) >= Math.abs(noData / rangeFactor) &&
    Math.abs(value) <= Math.abs(noData * rangeFactor)
  );
};

const groupPixelsByBlock = (pixels: PixelPoint[], metadata: RasterMetadata): Map<string, Block> => {
  const blocks = new Map<string, Block>();
  const [blockWidth, blockHeight] = metadata.blockSize;

  pixels.forEach((pixel, index) => {
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= metadata.width || pixel.y >= metadata.height) {
      return;
    }

    // Reading one cell still requires decoding its containing compressed tile/strip. Grouping
    // requested cells by that storage block prevents repeated decompression of nearby samples.
    const blockX = Math.floor(pixel.x / blockWidth);
    const blockY = Math.floor(pixel.y / blockHeight);
    const key = `${blockX}:${blockY}`;
    let block = blocks.get(key);
    if (!block) {
      const left = blockX * blockWidth;
      const top = blockY * blockHeight;
      block = {
        left,
        top,
        right: Math.min(left + blockWidth, metadata.width),
        bottom: Math.min(top + blockHeight, metadata.height),
        points: [],
      };
      blocks.set(key, block);
    }
    block.points.push({ index, pixel });
  });

  return blocks;
};

const pixelKey = (pixel: PixelPoint): string => `${pixel.x}:${pixel.y}`;

const validateSampleIndex = (sampleIndex: number, metadata: RasterMetadata): void => {
  if (
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= metadata.samplesPerPixel
  ) {
    throw new Error(`Raster sample ${sampleIndex} does not exist`);
  }
};

const transformPoints = (
  descriptor: RasterDescriptor,
  points: GeographicPoint[],
  metadata: RasterMetadata
): PixelPoint[] => {
  const projections =
    descriptor.projection && descriptor.geographicProjection
      ? {
          projection: descriptor.projection,
          geographicProjection: descriptor.geographicProjection,
        }
      : getRasterProjections(metadata);

  return points.map((point) =>
    geographicToPixel(
      point,
      projections.projection,
      metadata.origin,
      metadata.resolution,
      projections.geographicProjection
    )
  );
};

const sampleRasterPixels = async (
  raster: OpenRaster,
  pixels: PixelPoint[],
  sampleIndex: number
): Promise<{ samples: RasterSample[]; blocksRead: number }> => {
  const { image, metadata } = raster;
  validateSampleIndex(sampleIndex, metadata);
  // Initialize every result before reading. Out-of-coverage cells stay out-of-bounds; in-bounds
  // cells remain NoData unless a decoded source value replaces them below.
  const samples: RasterSample[] = pixels.map((pixel) =>
    pixel.x < 0 || pixel.y < 0 || pixel.x >= metadata.width || pixel.y >= metadata.height
      ? { status: "missing", reason: "out-of-bounds" }
      : { status: "missing", reason: "nodata" }
  );
  const blocks = [...groupPixelsByBlock(pixels, metadata).values()];
  if (blocks.length > MAX_RASTER_BLOCKS) {
    throw new Error(`Raster request exceeds the ${MAX_RASTER_BLOCKS} block limit`);
  }

  let nextBlock = 0;
  const readBlock = async (): Promise<void> => {
    while (nextBlock < blocks.length) {
      const block = blocks[nextBlock++];
      const decoded = await image.readRasters({
        // GeoTIFF windows use [left, top, right, bottom], with right/bottom exclusive.
        window: [block.left, block.top, block.right, block.bottom],
        samples: [sampleIndex],
        interleave: true,
      });
      if (Array.isArray(decoded)) throw new Error("Expected an interleaved raster result");

      const width = block.right - block.left;
      block.points.forEach(({ index, pixel }) => {
        // readRasters returns the window as a row-major one-dimensional array.
        const offset = (pixel.y - block.top) * width + pixel.x - block.left;
        const value = decoded[offset];
        if (!Number.isFinite(value) && !Number.isNaN(value)) {
          throw new Error("Raster decoder returned a non-finite sample");
        }
        samples[index] = isNoData(value, metadata.noData)
          ? { status: "missing", reason: "nodata" }
          : { status: "value", value };
      });
    }
  };

  // A small amount of parallel block I/O improves throughput without flooding the decoder or disk.
  await Promise.all(
    Array.from({ length: Math.min(BLOCK_READ_CONCURRENCY, blocks.length) }, () => readBlock())
  );
  return { samples, blocksRead: blocks.length };
};

export const sampleRasterPoints = async (
  descriptor: RasterDescriptor,
  points: GeographicPoint[]
): Promise<RasterSamplingResult> => {
  if (points.length > MAX_RASTER_SAMPLES) {
    throw new Error(`Raster request exceeds the ${MAX_RASTER_SAMPLES} sample limit`);
  }

  const raster = await openRaster(descriptor.absolutePath);
  const { metadata } = raster;
  const sampleIndex = descriptor.sampleIndex ?? 0;
  const pixels = transformPoints(descriptor, points, metadata);
  const result = await sampleRasterPixels(raster, pixels, sampleIndex);
  const uniquePixelsRead = new Set(
    pixels
      .filter(
        (pixel) =>
          pixel.x >= 0 && pixel.y >= 0 && pixel.x < metadata.width && pixel.y < metadata.height
      )
      .map(pixelKey)
  ).size;
  return { metadata, uniquePixelsRead, ...result };
};

export const sampleRasterNeighborhoods = async (
  descriptor: RasterDescriptor,
  points: GeographicPoint[]
): Promise<RasterNeighborhoodSamplingResult> => {
  if (points.length > MAX_RASTER_SAMPLES) {
    throw new Error(`Raster request exceeds the ${MAX_RASTER_SAMPLES} center sample limit`);
  }

  const raster = await openRaster(descriptor.absolutePath);
  const { metadata } = raster;
  const centers = transformPoints(descriptor, points, metadata);
  const expanded = centers.map((center) =>
    [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: center.x + dx, y: center.y + dy })))
  );
  const uniquePixelsByKey = new Map<string, PixelPoint>();
  expanded.flat().forEach((pixel) => uniquePixelsByKey.set(pixelKey(pixel), pixel));
  const uniquePixels = [...uniquePixelsByKey.values()];
  if (uniquePixels.length > MAX_RASTER_NEIGHBOR_PIXELS) {
    throw new Error(
      `Raster request exceeds the ${MAX_RASTER_NEIGHBOR_PIXELS} unique neighbor pixel limit`
    );
  }

  const result = await sampleRasterPixels(raster, uniquePixels, descriptor.sampleIndex ?? 0);
  const sampleByPixel = new Map(
    uniquePixels.map((pixel, index) => [pixelKey(pixel), result.samples[index]])
  );
  const neighborhoods = expanded.map((pixels) =>
    pixels.map((pixel) => sampleByPixel.get(pixelKey(pixel))!)
  );

  return {
    metadata,
    centerSamples: neighborhoods.map((neighborhood) => neighborhood[4]),
    neighborhoods,
    uniquePixelsRead: uniquePixels.filter(
      (pixel) =>
        pixel.x >= 0 && pixel.y >= 0 && pixel.x < metadata.width && pixel.y < metadata.height
    ).length,
    blocksRead: result.blocksRead,
  };
};
