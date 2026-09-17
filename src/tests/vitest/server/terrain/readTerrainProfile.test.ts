const { sampleRasterNeighborhoods, sampleRasterPoints } = vi.hoisted(() => ({
  sampleRasterNeighborhoods: vi.fn(),
  sampleRasterPoints: vi.fn(),
}));

vi.mock("server/raster/sampleRasterPoints", () => ({
  sampleRasterNeighborhoods,
  sampleRasterPoints,
}));

import { readTerrainProfile } from "server/terrain/readTerrainProfile";

const metadata: RasterMetadata = {
  width: 10,
  height: 10,
  origin: [0, 0],
  resolution: [1, -1],
  blockSize: [4, 4],
  isTiled: true,
  samplesPerPixel: 1,
  noData: null,
  scale: 2,
  offset: 10,
  geoKeys: { ProjLinearUnitsGeoKey: 9001 },
};
const value = (number: number): RasterSample => ({ status: "value", value: number });

describe("readTerrainProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shares sample positions and preserves segment boundaries and endpoint duplication", async () => {
    const centers = [value(1), value(2), value(3), value(3), value(4)];
    sampleRasterNeighborhoods.mockResolvedValue({
      metadata,
      centerSamples: centers,
      neighborhoods: centers.map((sample) => Array<RasterSample>(9).fill(sample)),
      uniquePixelsRead: 21,
      blocksRead: 2,
    });

    const result = await readTerrainProfile(
      { absolutePath: "fixture.tif" },
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      [3, 2]
    );

    expect(result.elevationsMeters).toEqual([
      [12, 14, 16],
      [16, 18],
    ]);
    expect(result.terrainSlopesDegrees).toEqual([
      [0, 0, 0],
      [0, 0],
    ]);
    expect(result).toMatchObject({ centerSamples: 5, uniqueDemPixels: 21, blocksRead: 2 });
  });

  it("keeps a valid center elevation when a neighbor makes slope unavailable", async () => {
    const neighborhood = Array<RasterSample>(9).fill(value(2));
    neighborhood[0] = { status: "missing", reason: "nodata" };
    sampleRasterNeighborhoods.mockResolvedValue({
      metadata,
      centerSamples: [value(2), value(3)],
      neighborhoods: [neighborhood, Array<RasterSample>(9).fill(value(3))],
      uniquePixelsRead: 12,
      blocksRead: 1,
    });

    const result = await readTerrainProfile(
      { absolutePath: "fixture.tif" },
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      [2]
    );
    expect(result.elevationsMeters).toEqual([[14, 16]]);
    expect(result.terrainSlopesDegrees).toEqual([[null, 0]]);
  });

  it("reads only center samples when only elevation is requested", async () => {
    sampleRasterPoints.mockResolvedValue({
      metadata,
      samples: [value(2), value(3)],
      uniquePixelsRead: 2,
      blocksRead: 1,
    });

    const result = await readTerrainProfile(
      { absolutePath: "fixture.tif" },
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      [2],
      true
    );

    expect(sampleRasterPoints).toHaveBeenCalledOnce();
    expect(sampleRasterNeighborhoods).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      elevationsMeters: [[14, 16]],
      terrainSlopesDegrees: [],
      centerSamples: 2,
      uniqueDemPixels: 2,
    });
  });

  it("rejects non-metre vertical units", async () => {
    sampleRasterNeighborhoods.mockResolvedValue({
      metadata: {
        ...metadata,
        geoKeys: { ProjLinearUnitsGeoKey: 9001, VerticalUnitsGeoKey: 9002 },
      },
      centerSamples: [value(1), value(1)],
      neighborhoods: [Array<RasterSample>(9).fill(value(1)), Array<RasterSample>(9).fill(value(1))],
      uniquePixelsRead: 12,
      blocksRead: 1,
    });
    await expect(
      readTerrainProfile(
        { absolutePath: "fixture.tif" },
        [
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 },
        ],
        [2]
      )
    ).rejects.toThrow("elevation units must be metres");
  });

  it("rejects a configured resolution that differs from the native raster", async () => {
    sampleRasterNeighborhoods.mockResolvedValue({
      metadata,
      centerSamples: [value(1), value(1)],
      neighborhoods: [Array<RasterSample>(9).fill(value(1)), Array<RasterSample>(9).fill(value(1))],
      uniquePixelsRead: 12,
      blocksRead: 1,
    });
    await expect(
      readTerrainProfile(
        { absolutePath: "fixture.tif", expectedResolutionMeters: 2 },
        [
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 },
        ],
        [2]
      )
    ).rejects.toThrow("resolution is invalid");
  });
});
