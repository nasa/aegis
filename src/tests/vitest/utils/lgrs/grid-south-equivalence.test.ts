import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDynamicLgrsRenderPlan, mapCapToLps, lpsToMapCap } from "utils/lgrs/dynamicGrid";
import { LGRS_CRS_LPS_SOUTH } from "utils/lgrs/crs";
import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getLgrsMapAdapter } from "utils/lgrs/mapAdapter";

// Compares the whole-Moon plan with the south-only plan it replaces. Delete with `dynamicGrid.ts`;
// `grid-golden.test.ts` keeps the guarantee through golden data.

type Viewport = {
  name: string;
  extent: LgrsExtent;
  gridSpacingMode: LgrsGridSpacing;
  gridLabelInterval: LgrsGridSpacing;
  mapResolution: number;
  labelsVisible: boolean;
};

const SOUTH_CAP =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";
const adapter = getLgrsMapAdapter({ projCode: "IAU:30135", proj4Def: SOUTH_CAP });

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.3.0/south-lps-viewports.json"),
    "utf8"
  )
) as { viewports: Viewport[] };

/** A 1920×1080 view centred on `centre` (LPS metres) at `resolution` map metres per pixel. */
function screenViewport(
  name: string,
  centre: [number, number],
  resolution: number,
  gridSpacingMode: LgrsGridSpacing = "auto",
  gridLabelInterval: LgrsGridSpacing = "auto"
): Viewport {
  const [x, y] = lpsToMapCap(centre);
  const [minE, minN] = mapCapToLps([x - 960 * resolution, y - 540 * resolution]);
  const [maxE, maxN] = mapCapToLps([x + 960 * resolution, y + 540 * resolution]);
  return {
    name,
    extent: [minE, minN, maxE, maxN],
    gridSpacingMode,
    gridLabelInterval,
    mapResolution: resolution,
    labelsVisible: true,
  };
}

const viewports: Viewport[] = [
  ...fixture.viewports,
  screenViewport("screen-pole-1m", [500000, 500000], 1),
  screenViewport("screen-pole-5m", [500000, 500000], 5),
  screenViewport("screen-shackleton-2m", [492500, 512300], 2),
  screenViewport("screen-cap-edge-20m", [790000, 520000], 20),
  screenViewport("screen-fixed-100-auto", [505000, 495000], 3, 100, "auto"),
  screenViewport("screen-fixed-10-auto-hidden", [505000, 495000], 1, 10, "auto"),
  screenViewport("screen-fixed-1000-1000", [400000, 600000], 10, 1000, 1000),
];

/** The old plan as `Grid.tsx` drew it: map extent → LPS extent → lines/labels in map CRS. */
function oldPlanInMapCrs(viewport: Viewport, mapExtent: LgrsMapExtent) {
  const min = mapCapToLps([mapExtent[0], mapExtent[1]]);
  const max = mapCapToLps([mapExtent[2], mapExtent[3]]);
  const plan = createDynamicLgrsRenderPlan({
    extent: [min[0], min[1], max[0], max[1]],
    gridSpacingMode: viewport.gridSpacingMode,
    gridLabelInterval: viewport.gridLabelInterval,
    mapResolution: viewport.mapResolution,
    labelsVisible: viewport.labelsVisible,
  });
  return {
    lineSpacing: plan.lineSpacing,
    labelSpacing: plan.labelSpacing,
    lines: plan.lines.map((line) => ({
      axis: line.axis,
      value: line.value,
      coordinates: [...lpsToMapCap(line.start), ...lpsToMapCap(line.end)],
    })),
    labels: plan.labels.map(({ coordinate, label }) => ({
      coordinate: lpsToMapCap(coordinate),
      text: label.text,
      acc: label.acc,
      lgrs: label.lgrs,
    })),
  };
}

describe("createLgrsRenderPlan on the canonical south LPS mission", () => {
  test.each(viewports)("matches createDynamicLgrsRenderPlan for $name", (viewport) => {
    const min = lpsToMapCap([viewport.extent[0], viewport.extent[1]]);
    const max = lpsToMapCap([viewport.extent[2], viewport.extent[3]]);
    const mapExtent: LgrsMapExtent = [min[0], min[1], max[0], max[1]];
    const expected = oldPlanInMapCrs(viewport, mapExtent);

    const plan = createLgrsRenderPlan({
      adapter,
      extent: mapExtent,
      resolution: viewport.mapResolution,
      gridSpacingMode: viewport.gridSpacingMode,
      gridLabelInterval: viewport.gridLabelInterval,
      labelsVisible: viewport.labelsVisible,
    });

    expect(plan.tier).toBe("box");
    expect(plan.capped).toBe(false);
    expect(plan.lineSpacing).toBe(expected.lineSpacing);
    expect(plan.labelSpacing).toBe(expected.labelSpacing);
    const southLines = plan.lines.filter(
      (line) => line.kind === "grid" && line.crs === LGRS_CRS_LPS_SOUTH
    );
    expect(
      southLines.map(({ axis, value, coordinates }) => ({ axis, value, coordinates }))
    ).toEqual(expected.lines);
    expect(
      plan.labels
        .filter((label) => label.crs === LGRS_CRS_LPS_SOUTH)
        .map(({ coordinate, text, label }) => ({
          coordinate,
          text,
          acc: label.acc,
          lgrs: label.lgrs,
        }))
    ).toEqual(expected.labels);
  });
});
