import { page } from "vitest/browser";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import MissionAdmin from "pages/admin/mission";
import { getMissionDems, updateMissionFields } from "http-client/mission";
import { generateBlankMission } from "store/storeUtils/mission";
import { configureStore } from "@reduxjs/toolkit";
import { userSlice } from "store/user";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

vi.mock("@automerge/automerge-repo-react-hooks", () => ({ useDocument: vi.fn() }));
vi.mock("http-client/mission", () => ({ getMissionDems: vi.fn(), updateMissionFields: vi.fn() }));
vi.mock("components/admin/fileManager", () => ({ default: () => <div>Mission files</div> }));
vi.mock("components/admin/gridUpload", () => ({ default: () => <div>Server File Grid</div> }));
vi.mock("components/admin/projection", () => ({ default: (): null => null }));

const makeStore = () => configureStore({ reducer: { user: userSlice.reducer } });
let harness: ReactHarness;
let mission: Mission;
let store: ReturnType<typeof makeStore>;
function render() {
  vi.mocked(useDocument).mockReturnValue([mission, vi.fn()]);
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
  store = makeStore();
  mission = generateBlankMission({ id: 42, landerLocation: { lat: -85, lng: 0 } });
  vi.mocked(getMissionDems).mockResolvedValue([
    { filePath: "Data/nested/elevation.tif", resolution: 0.5, error: null },
    { filePath: "Data/broken.tiff", resolution: null, error: "Missing georeferencing" },
  ]);
  vi.mocked(updateMissionFields).mockResolvedValue(mission);
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

test("selects a planet and derives LGRS from the mission location", async () => {
  render();
  await expect.element(page.getByLabelText("Planet", { exact: true })).toBeVisible();
  await page.getByLabelText("Planet", { exact: true }).selectOptions("mars");
  expect(updateMissionFields).toHaveBeenCalledWith(42, { planet: "mars" });
  expect(harness.container.textContent).toContain("Coordinates: LGRS");
  mission = { ...mission, planet: "mars" };
  render();
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
  expect(updateMissionFields).toHaveBeenCalledWith(42, {
    demFilePath: "Data/nested/elevation.tif",
  });
  expect(harness.container.querySelector('input[name="demResolution"]')).toBeNull();
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
});

test("south-pole Moon missions have automatic LGRS and no uploaded-grid controls; Earth keeps them", () => {
  render();
  expect(harness.container.textContent).toContain("The LGRS grid is generated dynamically");
  expect(harness.container.textContent).not.toContain("Server File Grid");
  expect(harness.container.querySelector('input[name="gridRenderMode"]')).toBeNull();
  mission = { ...mission, planet: "earth" };
  render();
  expect(harness.container.textContent).toContain("Server File Grid");
});
