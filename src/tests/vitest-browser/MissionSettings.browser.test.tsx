import { page } from "vitest/browser";
import { useSyncExternalStore } from "react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import MissionAdmin from "pages/admin/mission";
import { getMissionDems } from "http-client/mission";
import { getElevationSinglePoint } from "http-client/terrainProfile";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStation } from "store/storeUtils/station";
import { configureStore } from "@reduxjs/toolkit";
import { userSlice } from "store/user";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

vi.mock("@automerge/automerge-repo-react-hooks", () => ({ useDocument: vi.fn() }));
vi.mock("http-client/mission", () => ({ getMissionDems: vi.fn() }));
vi.mock("http-client/terrainProfile", () => ({ getElevationSinglePoint: vi.fn() }));
vi.mock("components/admin/fileManager", () => ({ default: () => <div>Mission files</div> }));
vi.mock("components/admin/gridUpload", () => ({ default: () => <div>Server File Grid</div> }));
vi.mock("components/admin/projection", () => ({ default: (): null => null }));

const makeStore = () => configureStore({ reducer: { user: userSlice.reducer } });
let harness: ReactHarness;
let mission: Mission;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const changeMission = vi.fn((update: (doc: Mission) => void) => {
  mission = structuredClone(mission);
  update(mission);
  listeners.forEach((listener) => listener());
});
function useMissionDocument(): ReturnType<typeof useDocument<Mission>> {
  return [useSyncExternalStore(subscribe, () => mission), changeMission];
}
let store: ReturnType<typeof makeStore>;
function render() {
  vi.mocked(useDocument).mockImplementation(useMissionDocument);
  harness.render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/admin/42/automerge:mission"]}>
        <Routes>
          <Route path="/admin/:id/:automergeUrl" element={<MissionAdmin />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getElevationSinglePoint).mockReset();
  vi.mocked(getElevationSinglePoint).mockResolvedValue({
    status: "error",
    message: "The DEM has no elevation at this location",
  });
  store = makeStore();
  mission = generateBlankMission({ id: 42, landerLocation: { lat: -85, lng: 0 } });
  vi.mocked(getMissionDems).mockResolvedValue([
    { filePath: "Data/nested/elevation.tif", resolution: 0.5, error: null },
    { filePath: "Data/broken.tiff", resolution: null, error: "Missing georeferencing" },
  ]);
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

test("selects a planet and derives its coordinate system", async () => {
  render();
  await expect.element(page.getByLabelText("Planet", { exact: true })).toBeVisible();
  expect(harness.container.textContent).toContain("Coordinates: LGRS");
  await page.getByLabelText("Planet", { exact: true }).selectOptions("mars");
  expect(mission.planet).toBe("mars");
  expect(harness.container.textContent).toContain("Coordinates: Latitude / Longitude");
  expect(harness.container.querySelector('input[name="planetRadius"]')).toBeNull();
});

test("lists nested DEMs with detected resolution, disables invalid files, and saves selection", async () => {
  mission = { ...mission, demFilePath: "Data/NAC_DTM_APOLLO14.TIF", demResolution: 2.000000000006 };
  vi.mocked(getMissionDems).mockResolvedValue([
    { filePath: "Data/nested/elevation.tif", resolution: 0.5000000000000001, error: null },
    { filePath: "Data/NAC_DTM_APOLLO14.TIF", resolution: 2.000000000006, error: null },
    { filePath: "Data/broken.tiff", resolution: null, error: "Missing georeferencing" },
  ]);
  render();
  await expect
    .element(page.getByRole("option", { name: "nested/elevation.tif - 0.5 m/pixel" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("option", { name: "NAC_DTM_APOLLO14.TIF - 2 m/pixel" }))
    .toBeInTheDocument();
  expect(harness.container.textContent).toContain("Current resolution: 2 m/pixel.");
  const invalid = harness.container.querySelector<HTMLOptionElement>(
    'option[value="Data/broken.tiff"]'
  );
  expect(invalid.disabled).toBe(true);
  await page.getByLabelText("DEM file", { exact: true }).selectOptions("Data/nested/elevation.tif");
  expect(mission.demFilePath).toBe("Data/nested/elevation.tif");
  expect(mission.demResolution).toBe(0.5000000000000001);
  expect(mission.landerElevationMeters).toBeNull();
  expect(harness.container.querySelector('input[name="demResolution"]')).toBeNull();
});

test("clearing a DEM clears its resolution and derived elevation in the document", async () => {
  mission = {
    ...mission,
    demFilePath: "Data/nested/elevation.tif",
    demResolution: 0.5,
    landerElevationMeters: 123,
  };
  render();
  await expect
    .element(page.getByRole("option", { name: "nested/elevation.tif - 0.5 m/pixel" }))
    .toBeInTheDocument();
  await page.getByLabelText("DEM file", { exact: true }).selectOptions("");
  expect(mission.demFilePath).toBe("");
  expect(mission.demResolution).toBeNull();
  expect(mission.landerElevationMeters).toBeNull();
  expect(getElevationSinglePoint).not.toHaveBeenCalled();
});

test("selecting a DEM samples the existing endpoint and updates lander stations, including zero elevation", async () => {
  const station = generateBlankStation({ isLanderXgress: true, elevation: 99 });
  mission.stations[station.uuid] = station;
  vi.mocked(getElevationSinglePoint).mockResolvedValue({
    status: "success",
    message: "Sampled",
    data: 0,
  });
  render();
  await expect
    .element(page.getByRole("option", { name: "nested/elevation.tif - 0.5 m/pixel" }))
    .toBeInTheDocument();
  await page.getByLabelText("DEM file", { exact: true }).selectOptions("Data/nested/elevation.tif");
  await expect
    .element(page.getByLabelText("Lander Elevation", { exact: true }))
    .toHaveTextContent("0");
  expect(getElevationSinglePoint).toHaveBeenCalledExactlyOnceWith({
    missionId: 42,
    point: { lat: -85, lng: 0 },
    expectedDem: { demFilePath: "Data/nested/elevation.tif", demResolution: 0.5 },
  });
  expect(mission.stations[station.uuid].elevation).toBe(0);
  changeMission((m) => {
    m.name = "Renamed";
  });
  render();
  expect(getElevationSinglePoint).toHaveBeenCalledTimes(1);
});

test("changing admin coordinates discards an older elevation response", async () => {
  mission.demFilePath = "Data/nested/elevation.tif";
  let finishOld: (response: WrappedResponse<number>) => void;
  vi.mocked(getElevationSinglePoint)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValue({ status: "success", message: "Sampled", data: -35 });
  render();
  await vi.waitFor(() => expect(getElevationSinglePoint).toHaveBeenCalledTimes(1));
  await page.getByLabelText("Lander Location Latitude", { exact: true }).fill("-86");
  await expect
    .element(page.getByLabelText("Lander Elevation", { exact: true }))
    .toHaveTextContent("-35");
  expect(mission.landerLocation.lat).toBe(-86);
  expect(getElevationSinglePoint).toHaveBeenLastCalledWith(
    expect.objectContaining({ point: { lat: -86, lng: 0 } })
  );
  finishOld({ status: "success", message: "Old sample", data: 999 });
  await Promise.resolve();
  expect(mission.landerElevationMeters).toBe(-35);
});

test("clearing a DEM while sampling prevents the late result from restoring elevation", async () => {
  mission.demFilePath = "Data/nested/elevation.tif";
  let finish: (response: WrappedResponse<number>) => void;
  vi.mocked(getElevationSinglePoint).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render();
  await expect
    .element(page.getByRole("option", { name: "nested/elevation.tif - 0.5 m/pixel" }))
    .toBeInTheDocument();
  await page.getByLabelText("DEM file", { exact: true }).selectOptions("");
  finish({ status: "success", message: "Old DEM", data: 999 });
  await Promise.resolve();
  expect(mission.landerElevationMeters).toBeNull();
});

test("sampling failures stay unknown and show an error without retrying unrelated edits", async () => {
  mission.demFilePath = "Data/nested/elevation.tif";
  vi.mocked(getElevationSinglePoint).mockRejectedValueOnce(new Error("DEM is unavailable"));
  render();
  await expect.element(page.getByRole("alert")).toHaveTextContent("DEM is unavailable");
  expect(mission.landerElevationMeters).toBeNull();
  changeMission((m) => {
    m.name = "Renamed";
  });
  render();
  expect(getElevationSinglePoint).toHaveBeenCalledTimes(1);
  vi.mocked(getElevationSinglePoint).mockResolvedValueOnce({
    status: "success",
    message: "Sampled",
    data: 123,
  });
  await page.getByRole("button", { name: "Retry elevation" }).click();
  await expect
    .element(page.getByLabelText("Lander Elevation", { exact: true }))
    .toHaveTextContent("123");
});

test("shows list failures and can refresh after files are uploaded", async () => {
  vi.mocked(getMissionDems).mockRejectedValueOnce(new Error("Could not list Data files"));
  render();
  await expect.element(page.getByRole("alert")).toHaveTextContent("Could not list Data files");
  await page.getByRole("button", { name: "Refresh DEM files" }).click();
  await expect
    .element(page.getByRole("option", { name: "nested/elevation.tif - 0.5 m/pixel" }))
    .toBeInTheDocument();
});

test("unknown lander elevation encourages adding a DEM, and elevation cannot be typed", () => {
  render();
  expect(
    harness.container.querySelector('output[aria-label="Lander Elevation"]')?.textContent
  ).toBe("Unknown");
  expect(harness.container.textContent).toContain(
    "Add a DEM below to determine the lander elevation automatically"
  );
  expect(harness.container.querySelector('input[name="landerElevationMeters"]')).toBeNull();
});

test.each([
  [0, "0"],
  [-1063.60498046875, "-1064"],
  [123.456, "123"],
])("displays the detected lander elevation %s", (elevation, expected) => {
  mission = {
    ...mission,
    demFilePath: "Data/nested/elevation.tif",
    landerElevationMeters: elevation,
  };
  render();
  expect(
    harness.container.querySelector('output[aria-label="Lander Elevation"]')?.textContent
  ).toBe(expected);
  expect(getElevationSinglePoint).not.toHaveBeenCalled();
});

test("Moon missions have automatic LGRS and no uploaded-grid controls; Earth keeps them", () => {
  render();
  expect(harness.container.textContent).toContain("The LGRS grid is generated dynamically");
  expect(harness.container.textContent).not.toContain("Server File Grid");
  expect(harness.container.querySelector('input[name="gridRenderMode"]')).toBeNull();
  mission = { ...mission, planet: "earth" };
  render();
  expect(harness.container.textContent).toContain("Server File Grid");
});

test.each([-85, 0, 85])("Moon latitude %s uses dynamic LGRS", (lat) => {
  mission.landerLocation = { lat, lng: 0 };
  render();
  expect(harness.container.textContent).toContain("across the whole Moon");
  expect(harness.container.textContent).not.toContain("Server File Grid");
});

test("Earth without an upload uses dynamic grids; an upload selects the custom grid", () => {
  mission.planet = "earth";
  render();
  expect(harness.container.textContent).toContain("The Earth grid is generated dynamically");
  mission = {
    ...mission,
    serverFileGrid: { name: "Custom", fileName: "grid.json", numRows: 2, numCols: 2 },
  };
  render();
  expect(harness.container.textContent).toContain("Using the uploaded Earth grid");
  expect(harness.container.textContent).toContain("Default Label Scheme");
});
