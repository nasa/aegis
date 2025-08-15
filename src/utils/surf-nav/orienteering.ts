/*
 * The following functions should EXACTLY match the effect of coordinate functions from the surf_nav repo
 * They should ONLY be changed to match functionality in the surf_nav repo.
 * You can access these functions in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these functions are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/orienteering.py?ref_type=heads
 *
 * The following functions are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */

import { degreesToRadians, radiansToDegrees } from "@turf/helpers";

// Converts between range and bearing => range = 90 - bearing, bearing = 90 - range
export function angle_bearing_conversion(alpha: number): number {
  let beta = 90 - alpha;
  if (beta < 0) {
    beta += 360;
  }
  return beta;
}

// Given a landmark and bearings + a range from that landmark, calculate the x,y coordinates of the crew
export function xy_from_range_bearing(
  x_source: number,
  y_source: number,
  range: number,
  bearing: number
): SN_XYPair {
  const angle = degreesToRadians(angle_bearing_conversion(bearing));
  const x_crew = x_source - range * Math.cos(angle);
  const y_crew = y_source - range * Math.sin(angle);

  return { x: x_crew, y: y_crew };
}

// Given a landmark and the x,y coordinates of the crew, calculate the range and bearing from the landmark to the crew
export function range_bearing_from_xy(
  x_source: number,
  y_source: number,
  x_destination: number,
  y_destination: number
): SN_RangeBearingPair {
  const range = Math.sqrt(
    Math.pow(x_source - x_destination, 2) + Math.pow(y_source - y_destination, 2)
  );
  const angle = radiansToDegrees(Math.atan2(y_source - y_destination, x_source - x_destination));
  const bearing = angle_bearing_conversion(angle);

  return { range: range, bearing: bearing };
}

// Given a list of x,y coordinates of landmarks and a list of bearings, calculate the x,y coordinates between them
export function xy_from_bearings(
  x_landmark_list: number[],
  y_landmark_list: number[],
  bearing_list: number[]
): SN_XYPair {
  // Start with the first bearing to initialize the matrices
  const angle_0 = degreesToRadians(angle_bearing_conversion(bearing_list[0]));

  // Initialize A and b matrices with first row
  const A: number[][] = [[-Math.tan(angle_0), 1]];
  const b: number[] = [-Math.tan(angle_0) * x_landmark_list[0] + y_landmark_list[0]];

  // Add additional rows for each subsequent bearing
  for (let i = 1; i < bearing_list.length; i++) {
    const x_landmark = x_landmark_list[i];
    const y_landmark = y_landmark_list[i];
    const angle = degreesToRadians(angle_bearing_conversion(bearing_list[i]));

    const A_i = [-Math.tan(angle), 1];
    A.push(A_i);
    const b_i = -Math.tan(angle) * x_landmark + y_landmark;
    b.push(b_i);
  }

  // Least squares solution (numpy not in typescript it will be done manually)
  const A_T: number[][] = A[0].map((_, colIndex) => A.map((row) => row[colIndex]));
  const A_T_A: number[][] = A_T.map((A_T_row) =>
    A_T.map((A_T_column) =>
      A_T_row.reduce(
        (sum, curr_A_value, A_row_index) => sum + curr_A_value * A_T_column[A_row_index],
        0
      )
    )
  ); // Nested A_T map allows for easier traversal of A - but mathematical basis is still A_T * A

  const A_T_b: number[] = A_T.map((A_T_row) =>
    A_T_row.reduce((sum, curr_A_value, A_row_index) => sum + curr_A_value * b[A_row_index], 0)
  );

  // A_T_A is 2x2, A_T_b is 2x1
  // Since the dims are so low, finding the inverse of A_T_A and
  // multiplying it by A_T_b to find x and y is pretty easy
  const det = A_T_A[0][0] * A_T_A[1][1] - A_T_A[0][1] * A_T_A[1][0];
  const A_T_A_inv: number[][] = [
    [A_T_A[1][1] / det, -A_T_A[0][1] / det],
    [-A_T_A[1][0] / det, A_T_A[0][0] / det],
  ];

  const x_y = [
    A_T_A_inv[0][0] * A_T_b[0] + A_T_A_inv[0][1] * A_T_b[1],
    A_T_A_inv[1][0] * A_T_b[0] + A_T_A_inv[1][1] * A_T_b[1],
  ];
  return { x: x_y[0], y: x_y[1] };
}

// Given a pair of lat/longs and the central body radius, return the range
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  R: number
): number {
  const long1_rad = degreesToRadians(lon1);
  const lat1_rad = degreesToRadians(lat1);
  const lat2_rad = degreesToRadians(lat2);
  const long2_rad = degreesToRadians(lon2);

  const lon_diff = long2_rad - long1_rad;
  const lat_diff = lat2_rad - lat1_rad;

  const a =
    Math.pow(Math.sin(lat_diff / 2), 2) +
    Math.cos(lat1_rad) * Math.cos(lat2_rad) * Math.pow(Math.sin(lon_diff / 2), 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
