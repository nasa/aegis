import type { RasterMetadata } from "./types";
import { getCachedRaster } from "./rasterCache";

type RasterImage = Awaited<ReturnType<typeof getCachedRaster>>["image"];

export type OpenRaster = {
  image: RasterImage;
  metadata: RasterMetadata;
};

export const readRasterMetadata = (image: RasterImage): RasterMetadata => {
  const fileDirectory = image.getFileDirectory() as {
    ModelTransformation?: ArrayLike<number>;
  };
  if (fileDirectory.ModelTransformation) {
    throw new Error("Rotated or sheared GeoTIFF transforms are not supported");
  }

  const origin = image.getOrigin();
  const resolution = image.getResolution();
  if (![origin[0], origin[1], resolution[0], resolution[1]].every(Number.isFinite)) {
    throw new Error("Raster georeferencing is missing or invalid");
  }
  if (resolution[0] === 0 || resolution[1] === 0) {
    throw new Error("Raster resolution must be non-zero");
  }
  const bandMetadata = image.getGDALMetadata(0) as Record<string, string> | null;
  const normalizedBandMetadata = Object.fromEntries(
    Object.entries(bandMetadata ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  const scale = Number(normalizedBandMetadata.scale ?? 1);
  const offset = Number(normalizedBandMetadata.offset ?? 0);
  if (!Number.isFinite(scale) || !Number.isFinite(offset)) {
    throw new Error("Raster scale or offset metadata is invalid");
  }

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    origin: [origin[0], origin[1]],
    resolution: [resolution[0], resolution[1]],
    blockSize: [image.getTileWidth(), image.getTileHeight()],
    isTiled: image.isTiled,
    samplesPerPixel: image.getSamplesPerPixel(),
    noData: image.getGDALNoData(),
    scale,
    offset,
    geoKeys: (image.getGeoKeys() ?? {}) as Record<string, unknown>,
  };
};

export const openRaster = async (absolutePath: string): Promise<OpenRaster> => {
  const { image } = await getCachedRaster(absolutePath);
  return { image, metadata: readRasterMetadata(image) };
};
