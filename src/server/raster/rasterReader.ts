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
    // The pixel conversion assumes an axis-aligned origin and scale. A transformation matrix
    // could also encode rotation or shear, which would require affine inversion.
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

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    origin: [origin[0], origin[1]],
    resolution: [resolution[0], resolution[1]],
    // GeoTIFF decoders read compressed tiles/strips as units. Retaining that block shape lets
    // point sampling coalesce nearby lookups into one decoder operation.
    blockSize: [image.getTileWidth(), image.getTileHeight()],
    isTiled: image.isTiled,
    samplesPerPixel: image.getSamplesPerPixel(),
    // NoData is a sentinel stored by GDAL for cells where the elevation product has no coverage.
    noData: image.getGDALNoData(),
    geoKeys: (image.getGeoKeys() ?? {}) as Record<string, unknown>,
  };
};

export const openRaster = async (absolutePath: string): Promise<OpenRaster> => {
  const { image } = await getCachedRaster(absolutePath);
  return { image, metadata: readRasterMetadata(image) };
};
