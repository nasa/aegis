import paper from "paper";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initPaperRefs } from "components/interface/timeline/timeline-init";
import { drawGraphAxis } from "components/interface/timeline/timeline-drawing";

describe("timeline axis layout", () => {
  beforeEach(() => paper.setup(document.createElement("canvas")));
  afterEach(() => paper.project.remove());

  it.each([
    [800, 0],
    [0, 300],
    [150, 64],
  ])("skips collapsed %s by %s graphs and draws after reopening", (width, height) => {
    const data = { current: null as PaperData };
    const groups = { current: null as PaperGroups };
    const values: { current: EvaCalculated_PaperJS } = {
      current: {
        sequenceItems: [],
        selectedEvaSequenceItemUuid: null,
        maxDistFromLanderMeters: 400,
        evaLengthMins: 60,
        evaLengthCalculatedMins: 60,
        maxElevationMeters: 200,
        minElevationMeters: -1000,
        landerElevationMeters: 108,
        elevationResolutionMeters: 10,
      },
    };
    paper.view.viewSize = new paper.Size(width, height);
    initPaperRefs(data, groups, values);
    const before = paper.project.activeLayer.children.length;
    drawGraphAxis(data, values);
    expect(paper.project.activeLayer.children).toHaveLength(before);

    paper.project.clear();
    paper.view.viewSize = new paper.Size(800, 300);
    initPaperRefs(data, groups, values);
    drawGraphAxis(data, values);
    expect(paper.project.activeLayer.getItems({ class: paper.PointText }).length).toBeGreaterThan(
      2
    );
    expect(paper.project.activeLayer.getItems({ class: paper.PointText }).length).toBeLessThan(100);
  });
});
