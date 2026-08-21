import { fromFile } from "geotiff";

import { geographicToPixel } from "./coordTransform";
import type {
  GeographicPoint,
  PixelPoint,
  RasterDescriptor,
  RasterMetadata,
  RasterSample,
  RasterSamplingResult,
} from "./types";

type Block = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  points: { index: number; pixel: PixelPoint }[];
};

const isNoData = (value: number, noData: number | null): boolean => {
  if (noData === null) return false;

  const rangeFactor = Math.abs(noData) > 1_000_000_000 ? 10 : 1;
  return (
    Math.abs(value) >= Math.abs(noData / rangeFactor) &&
    Math.abs(value) <= Math.abs(noData * rangeFactor)
  );
};

const getMetadata = (
  image: Awaited<ReturnType<Awaited<ReturnType<typeof fromFile>>["getImage"]>>
): RasterMetadata => {
  const origin = image.getOrigin();
  const resolution = image.getResolution();

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    origin: [origin[0], origin[1]],
    resolution: [resolution[0], resolution[1]],
    blockSize: [image.getTileWidth(), image.getTileHeight()],
    isTiled: image.isTiled,
    samplesPerPixel: image.getSamplesPerPixel(),
    noData: image.getGDALNoData(),
    geoKeys: image.getGeoKeys() as Record<string, unknown>,
  };
};

const groupPixelsByBlock = (pixels: PixelPoint[], metadata: RasterMetadata): Map<string, Block> => {
  const blocks = new Map<string, Block>();
  const [blockWidth, blockHeight] = metadata.blockSize;

  pixels.forEach((pixel, index) => {
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= metadata.width || pixel.y >= metadata.height) {
      return;
    }

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

export const sampleRasterPoints = async (
  descriptor: RasterDescriptor,
  points: GeographicPoint[]
): Promise<RasterSamplingResult> => {
  const tiff = await fromFile(descriptor.absolutePath);

  try {
    const image = await tiff.getImage();
    const metadata = getMetadata(image);
    const sampleIndex = descriptor.sampleIndex ?? 0;
    if (sampleIndex < 0 || sampleIndex >= metadata.samplesPerPixel) {
      throw new Error(`Raster sample ${sampleIndex} does not exist`);
    }

    const pixels = points.map((point) =>
      geographicToPixel(point, descriptor.projection, metadata.origin, metadata.resolution)
    );
    const samples: RasterSample[] = pixels.map((pixel) =>
      pixel.x < 0 || pixel.y < 0 || pixel.x >= metadata.width || pixel.y >= metadata.height
        ? { status: "missing", reason: "out-of-bounds" }
        : { status: "missing", reason: "nodata" }
    );
    const blocks = groupPixelsByBlock(pixels, metadata);

    await Promise.all(
      [...blocks.values()].map(async (block) => {
        const raster = await image.readRasters({
          window: [block.left, block.top, block.right, block.bottom],
          samples: [sampleIndex],
          interleave: true,
        });
        if (Array.isArray(raster)) throw new Error("Expected an interleaved raster result");

        const width = block.right - block.left;
        block.points.forEach(({ index, pixel }) => {
          const offset = (pixel.y - block.top) * width + pixel.x - block.left;
          const value = raster[offset];
          samples[index] = isNoData(value, metadata.noData)
            ? { status: "missing", reason: "nodata" }
            : { status: "value", value };
        });
      })
    );

    return { metadata, samples, blocksRead: blocks.size };
  } finally {
    tiff.close();
  }
};
