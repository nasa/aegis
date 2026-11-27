/**
 * Each crew's box in the dashboard timeline is colored from that crew's own
 * Maestro progress, so EV1 can read complete (grey) while EV2 is still in
 * progress (green). Maestro reports the two percentages independently and
 * keeps the activity "in-progress" until both are finished.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Activities from "components/dashboard/timeline/activities";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

let harness: ReactHarness;

const STATION_UUID = "station-1";

const sequenceItems = [
  {
    uuid: STATION_UUID,
    type: "station",
    name: "LEAF Deploy",
    icon: null,
    secondsStart: 0,
    totalDurationMins: 30,
  },
] as unknown as EVASequenceItemForTimeline[];

const makeRex = (entry: ActivityEntry): Rex =>
  ({
    uuid: "rex-1",
    stationEntries: { [STATION_UUID]: entry },
    traverseEntries: {},
  }) as unknown as Rex;

beforeEach(() => {
  fixture.mission = {
    rexes: { "rex-1": { uuid: "rex-1", maestroActivityProperties: {} } },
  } as unknown as Mission;
  harness = createReactHarness();
});

afterEach(() => harness.unmount());

/** Resolve a CSS custom property to the rgb() string getComputedStyle reports. */
const resolvedColor = (variable: string): string => {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
};

const UNCOLORED = "rgba(0, 0, 0, 0)";
let COMPLETE: string;
let IN_PROGRESS: string;

beforeAll(() => {
  COMPLETE = resolvedColor("--grey4");
  IN_PROGRESS = resolvedColor("--rex");
});

const boxColors = () => {
  const read = (crew: "ev1" | "ev2") =>
    getComputedStyle(
      harness.container.querySelector(`[data-testid="activity-${crew}-${STATION_UUID}"]`)!
    ).backgroundColor;
  return { ev1: read("ev1"), ev2: read("ev2") };
};

const renderWith = (entry: ActivityEntry) =>
  harness.render(
    <Activities sequenceItems={sequenceItems} pixelsPerSecondY={0.1} rex={makeRex(entry)} />
  );

describe("dashboard activity crew boxes", () => {
  it("greys out EV1 while EV2 stays in progress", () => {
    // Maestro shows EV1 complete but keeps the activity in progress for EV2.
    renderWith({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 45,
    });

    const { ev1, ev2 } = boxColors();
    expect(ev1).toBe(COMPLETE);
    expect(ev2).toBe(IN_PROGRESS);
  });

  it("greys out both boxes once both crews finish", () => {
    renderWith({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 100,
    });

    expect(boxColors()).toEqual({ ev1: COMPLETE, ev2: COMPLETE });
  });

  it("greys out both boxes when the activity itself is complete", () => {
    // No per-crew percentages: the activity status drives both boxes.
    renderWith({ rexStatus: "complete" });

    expect(boxColors()).toEqual({ ev1: COMPLETE, ev2: COMPLETE });
  });

  it("leaves both boxes uncolored while the activity is in progress at 0%", () => {
    // Maestro marks the activity in progress as soon as either crew's first
    // step becomes current, without saying which crew started.
    renderWith({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 0,
      maestroPercentCompleteEv2: 0,
    });

    expect(boxColors()).toEqual({ ev1: UNCOLORED, ev2: UNCOLORED });
  });

  it("colors only the crew that has made progress", () => {
    renderWith({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 40,
      maestroPercentCompleteEv2: 0,
    });

    expect(boxColors()).toEqual({ ev1: IN_PROGRESS, ev2: UNCOLORED });
  });

  it("leaves a pending activity uncolored even with crew progress", () => {
    renderWith({
      rexStatus: "pending",
      maestroPercentCompleteEv1: 30,
      maestroPercentCompleteEv2: 0,
    });

    expect(boxColors()).toEqual({ ev1: UNCOLORED, ev2: UNCOLORED });
  });

  it("greys out both boxes when the activity is skipped", () => {
    renderWith({
      rexStatus: "skipped",
      maestroPercentCompleteEv1: 20,
      maestroPercentCompleteEv2: 0,
    });

    expect(boxColors()).toEqual({ ev1: COMPLETE, ev2: COMPLETE });
  });

  it("leaves a pending activity uncolored", () => {
    renderWith({ rexStatus: "pending" });

    expect(boxColors()).toEqual({ ev1: UNCOLORED, ev2: UNCOLORED });
  });
});
