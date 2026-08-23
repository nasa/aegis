const sampleRasterPoints = vi.hoisted(() => vi.fn());

vi.mock("server/raster/sampleRasterPoints", () => ({ sampleRasterPoints }));

import { NODATA_SENTINEL } from "server/elevation/constants";
import { readElevationProfile } from "server/elevation/readElevationProfile";
import type { RasterMetadata } from "server/raster/types";

const descriptor = { absolutePath: "fixture.tif", projection: "+proj=longlat" };
const metadata: RasterMetadata = {
  width: 2,
  height: 2,
  origin: [0, 0] as [number, number],
  resolution: [1, -1] as [number, number],
  blockSize: [2, 2] as [number, number],
  isTiled: false,
  samplesPerPixel: 1,
  noData: null,
  scale: 1,
  offset: 0,
  geoKeys: {},
};

describe("readElevationProfile", () => {
  beforeEach(() => sampleRasterPoints.mockReset());

  it("preserves segment boundaries and maps missing samples to the legacy sentinel", async () => {
    sampleRasterPoints.mockResolvedValue({
      metadata,
      samples: [
        { status: "value", value: 1 },
        { status: "missing", reason: "nodata" },
        { status: "value", value: 2 },
        { status: "missing", reason: "out-of-bounds" },
      ],
      blocksRead: 1,
    });

    const result = await readElevationProfile(
      descriptor,
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      [1, 1]
    );

    expect(result.elevations).toEqual([
      [1, NODATA_SENTINEL],
      [2, NODATA_SENTINEL],
    ]);
  });
});
