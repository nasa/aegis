/**
 * Browser-mode tests for Newton path options: `TraversePathsProvider`,
 * the `TraversePathCandidates` map behavior and the traverse pane list.
 *
 * Verifies:
 *  - succeeded rows that apply render on the candidate layer and in the pane
 *  - rows planned for other endpoints are hidden and counted as stale
 *  - polling stops once every applying row has finished
 *  - a failed row shows its error without the ArgumentError prefix
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { MapContext } from "components/interface/map/MapProvider";
import { TraversePathCandidates } from "components/interface/map/behaviors/TraversePathCandidates";
import { TraversePathsProvider } from "components/interface/traversePaths/TraversePathsProvider";
import PathOptions from "components/panes/traverse/traverse-right-path-options";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const EVA_UUID = "eva-1";
const TRAVERSE_UUID = "trav-1";
const REF_UUID = "trav-ref-1";
const A = { lat: -84.223397, lng: 33.5021945 };
const C = { lat: -84.2215886, lng: 33.5295438 };
const ELSEWHERE = { lat: -84.2, lng: 33.6 };

function seedDoc() {
  mockMissionDoc.planetRadius = 1737400;
  mockMissionDoc.stations = {
    "st-a": { uuid: "st-a", name: "A", location: A },
    "st-c": { uuid: "st-c", name: "C", location: C },
  } as unknown as Mission["stations"];
  mockMissionDoc.traverses = {
    [TRAVERSE_UUID]: { uuid: TRAVERSE_UUID, refUuid: REF_UUID, path: [A, C] },
  } as unknown as Mission["traverses"];
  mockMissionDoc.evas = {
    [EVA_UUID]: {
      uuid: EVA_UUID,
      sequence: [
        { type: "station", uuid: "st-a" },
        { type: "traverse", uuid: TRAVERSE_UUID },
        { type: "station", uuid: "st-c" },
      ],
    },
  } as unknown as Mission["evas"];
}

function makeRow(overrides: Partial<TraversePathRow>): TraversePathRow {
  return {
    uuid: "row",
    missionId: 1,
    traverseRefUuid: REF_UUID,
    createdFromTraverseUuid: TRAVERSE_UUID,
    startPoint: A,
    endPoint: C,
    method: "astar",
    paramsKey: "k",
    requestHash: null,
    status: "succeeded",
    path: {
      type: "LineString",
      coordinates: [
        [A.lng, A.lat],
        [A.lng + 0.01, A.lat + 0.0005],
        [C.lng, C.lat],
      ],
    },
    mapInfo: [{ planet: "moon", type: "slope", name: "ms3_slope" }],
    runtimeMs: 90_000,
    error: null,
    label: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

function makeStore(selectedTraverse: string | null = TRAVERSE_UUID) {
  return configureStore({
    reducer: { eva: evaSlice.reducer, interface: interfaceSlice.reducer },
    preloadedState: {
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
        selectedEvaSequenceItemUuid: selectedTraverse,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    } as Parameters<typeof configureStore>[0]["preloadedState"],
  });
}

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;

function render(fetcher: Parameters<typeof TraversePathsProvider>[0]["fetcher"], pollMs = 20) {
  harness.render(
    <Provider store={makeStore()}>
      <TraversePathsProvider missionId={1} source="api" fetcher={fetcher} pollMs={pollMs}>
        <MapContext.Provider value={{ map, mode: "editor" }}>
          <TraversePathCandidates />
        </MapContext.Provider>
        <PathOptions traverseUuid={TRAVERSE_UUID} />
      </TraversePathsProvider>
    </Provider>
  );
}

function candidateFeatureIds(): string[] {
  const layer = map
    .getLayers()
    .getArray()
    .find((l) => l.getZIndex() === Z_INDEX.TRAVERSE_PATH_CANDIDATES) as
    VectorLayer<VectorSource> | undefined;
  return (
    layer
      ?.getSource()
      ?.getFeatures()
      .map((f) => f.getId() as string)
      .sort() ?? []
  );
}

function optionStatuses(): string[] {
  return [
    ...harness.container.querySelectorAll<HTMLElement>("[data-testid='traverse-path-option']"),
  ].map((el) => el.dataset.status ?? "");
}

beforeEach(() => {
  Object.keys(mockMissionDoc).forEach((k) => delete (mockMissionDoc as Record<string, unknown>)[k]);
  seedDoc();
  harness = createReactHarness();
  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);
  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

describe("TraversePathCandidates", () => {
  it("renders applying succeeded rows on the map and in the pane, hiding stale rows", async () => {
    const fetcher = vi.fn(async () => ({
      status: "success" as const,
      message: "",
      data: [
        makeRow({ uuid: "ok", requestHash: "v1:one" }),
        makeRow({ uuid: "ok-dupe", requestHash: "v1:one" }),
        makeRow({ uuid: "stale", endPoint: ELSEWHERE }),
      ],
    }));
    render(fetcher);

    await vi.waitFor(() => expect(candidateFeatureIds()).toEqual(["ok"]));
    expect(optionStatuses()).toEqual(["succeeded"]);
    expect(harness.container.textContent).toContain("ms3_slope");
    expect(harness.container.textContent).toContain("1 option hidden");
  });

  it("polls until every applying row has finished, then stops", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls++;
      const status: TraversePathStatus = calls < 3 ? "in_progress" : "succeeded";
      return {
        status: "success" as const,
        message: "",
        data: [
          status === "succeeded"
            ? makeRow({ uuid: "job" })
            : makeRow({ uuid: "job", status, path: null }),
        ],
      };
    });
    render(fetcher);

    await vi.waitFor(() => expect(candidateFeatureIds()).toEqual(["job"]));
    const callsAtFinish = fetcher.mock.calls.length;
    expect(callsAtFinish).toBe(3);
    await new Promise((r) => setTimeout(r, 120));
    expect(fetcher.mock.calls.length).toBe(callsAtFinish);
  });

  it("shows a failed row's error without the ArgumentError prefix", async () => {
    const fetcher = vi.fn(async () => ({
      status: "success" as const,
      message: "",
      data: [
        makeRow({
          uuid: "bad",
          status: "failed",
          path: null,
          error: {
            message: "ArgumentError: no traversable path between waypoint 1 and waypoint 2",
          },
        }),
      ],
    }));
    render(fetcher);

    await vi.waitFor(() => expect(optionStatuses()).toEqual(["failed"]));
    const error = harness.container.querySelector("[data-testid='traverse-path-error']");
    expect(error?.textContent).toBe("no traversable path between waypoint 1 and waypoint 2");
    expect(candidateFeatureIds()).toEqual([]);
  });
});
