const getCachedRaster = vi.hoisted(() => vi.fn());

vi.mock("server/raster/rasterCache", () => ({ getCachedRaster }));

import { openRaster } from "server/raster/rasterReader";
import type { getCachedRaster as GetCachedRaster } from "server/raster/rasterCache";

type RasterImage = Awaited<ReturnType<typeof GetCachedRaster>>["image"];

type ImageOptions = {
  modelTransformation?: ArrayLike<number>;
  origin?: number[];
  resolution?: number[];
  geoKeys?: Record<string, unknown>;
  gdalMetadata?: Record<string, unknown>;
};

const makeImage = (options: ImageOptions = {}): RasterImage =>
  ({
    getFileDirectory: vi.fn(() => ({
      ModelTransformation: options.modelTransformation,
    })),
    getOrigin: vi.fn(() => options.origin ?? [100, 200, 0]),
    getResolution: vi.fn(() => options.resolution ?? [2, -3, 0]),
    getWidth: vi.fn(() => 640),
    getHeight: vi.fn(() => 480),
    getTileWidth: vi.fn(() => 256),
    getTileHeight: vi.fn(() => 128),
    isTiled: true,
    getSamplesPerPixel: vi.fn(() => 2),
    getGDALNoData: vi.fn(() => -9999),
    getGDALMetadata: vi.fn(() => options.gdalMetadata),
    getGeoKeys: vi.fn(() => options.geoKeys),
  }) as unknown as RasterImage;

const cacheImage = (image: RasterImage): void => {
  getCachedRaster.mockResolvedValue({ image });
};

describe("openRaster", () => {
  beforeEach(() => getCachedRaster.mockReset());

  it("opens the raster and returns its image and metadata", async () => {
    const image = makeImage({ geoKeys: { ProjectedCSTypeGeoKey: 3857 } });
    cacheImage(image);

    const result = await openRaster("C:/rasters/dem.tif");

    expect(getCachedRaster).toHaveBeenCalledOnce();
    expect(getCachedRaster).toHaveBeenCalledWith("C:/rasters/dem.tif");
    expect(result).toEqual({
      image,
      metadata: {
        width: 640,
        height: 480,
        origin: [100, 200],
        resolution: [2, -3],
        blockSize: [256, 128],
        isTiled: true,
        samplesPerPixel: 2,
        noData: -9999,
        scale: 1,
        offset: 0,
        geoKeys: { ProjectedCSTypeGeoKey: 3857 },
      },
    });
  });

  it("uses empty GeoTIFF keys when none are present", async () => {
    cacheImage(makeImage());

    await expect(openRaster("dem.tif")).resolves.toMatchObject({
      metadata: { geoKeys: {} },
    });
  });

  it("rejects transformation matrices", async () => {
    cacheImage(makeImage({ modelTransformation: [1, 0, 0, 0] }));

    await expect(openRaster("dem.tif")).rejects.toThrow(
      "Rotated or sheared GeoTIFF transforms are not supported"
    );
  });

  it.each([
    { origin: [Number.NaN, 200], resolution: [2, -3] },
    { origin: [100, Number.POSITIVE_INFINITY], resolution: [2, -3] },
    { origin: [100, 200], resolution: [Number.NEGATIVE_INFINITY, -3] },
    { origin: [100, 200], resolution: [2, Number.NaN] },
  ])("rejects invalid georeferencing %#", async (options) => {
    cacheImage(makeImage(options));

    await expect(openRaster("dem.tif")).rejects.toThrow(
      "Raster georeferencing is missing or invalid"
    );
  });

  it.each([{ resolution: [0, -3] }, { resolution: [2, 0] }])(
    "rejects zero raster resolution $resolution",
    async ({ resolution }) => {
      cacheImage(makeImage({ resolution }));

      await expect(openRaster("dem.tif")).rejects.toThrow("Raster resolution must be non-zero");
    }
  );
});
