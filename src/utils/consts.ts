export const EARTH_RADIUS = 6378137;

export const COLOR_PALATTE = [
  "#4D4D4D",
  "#999999",
  "#FFFFFF",
  "#F44E3B",
  "#FE9200",
  "#FCDC00",
  "#DBDF00",
  "#A4DD00",
  "#68CCCA",
  "#73D8FF",
  "#AEA1FF",
  "#FDA1FF",
  "#333333",
  "#808080",
  "#CCCCCC",
  "#D33115",
  "#E27300",
  "#FCC400",
  "#B0BC00",
  "#68BC00",
  "#16A5A5",
  "#009CE0",
  "#7B64FF",
  "#FA28FF",
  "#000000",
  "#666666",
  "#B3B3B3",
  "#9F0500",
  "#C45100",
  "#FB9E00",
  "#808900",
  "#194D33",
  "#0C797D",
  "#0062B1",
  "#4A2C91",
  "#AB149E",
  "#FFB000", // Added by Mapbook team
  "#FE6100", // Added by Mapbook team
  "#DC267F", // Added by Mapbook team
  "#785EF0", // Added by Mapbook team
];

/*
 * The following consts should EXACTLY match the consts from the surf_nav repo
 * They should ONLY be changed to match values in the surf_nav repo.
 * You can access these consts in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these consts are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/constants.py?ref_type=heads
 *
 * The following consts are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */
export const SURF_NAV_EARTH_EQUATORIAL_RADIUS = 6378.137e3; // m
export const SURF_NAV_EARTH_POLAR_RADIUS = 6356.752e3; // m
export const SURF_NAV_EARTH_MEAN_RADIUS = 6371.0e3; // m

export const SURF_NAV_MOON_EQUATORIAL_RADIUS = 1738.1e3; // m
export const SURF_NAV_MOON_POLAR_RADIUS = 1736.0e3; // m
export const SURF_NAV_MOON_MEAN_RADIUS = 1737.4e3; // m
export const SURF_NAV_MOON_K0 = 0.994; // default central scale factor for south pole distortion in LPS coordinate frame

export const SURF_NAV_LPS_FALSE_EAST = 500000; // m - LPS easting coordinate of south pole
export const SURF_NAV_LPS_FALSE_NORTH = 500000; // m - LPS northing coordinate of south pole
export const SURF_NAV_LPS_E25K = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
export const SURF_NAV_LPS_N25K = [
  "-",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "+",
];

export const SURF_NAV_LGRS_ACC = [
  "-",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
