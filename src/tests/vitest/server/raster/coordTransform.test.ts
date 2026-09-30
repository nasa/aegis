import { geographicToPixel } from "server/raster/coordTransform";

const LUNAR_SOUTH_POLE =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";
const LUNAR_GEOGRAPHIC = "+proj=longlat +a=1737400 +b=1737400 +no_defs";

describe("geographicToPixel", () => {
  it("uses longitude/latitude axis order and selects the containing pixel", () => {
    expect(
      geographicToPixel(
        { lat: -90, lng: 0 },
        LUNAR_SOUTH_POLE,
        [-10.9, 10.9],
        [1, -1],
        LUNAR_GEOGRAPHIC
      )
    ).toEqual({ x: 10, y: 10 });
  });

  it("rejects non-finite transformed coordinates", () => {
    expect(() =>
      geographicToPixel(
        { lat: Number.NaN, lng: 0 },
        LUNAR_SOUTH_POLE,
        [0, 0],
        [1, -1],
        LUNAR_GEOGRAPHIC
      )
    ).toThrow("finite numbers");
  });

  it("keeps fractional coordinates outside the top-left boundary out of bounds", () => {
    expect(
      geographicToPixel(
        { lat: -0.2, lng: -0.2 },
        "+proj=longlat +datum=WGS84 +no_defs",
        [0, 0],
        [1, 1]
      )
    ).toEqual({ x: -1, y: -1 });
  });
});
