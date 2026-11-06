import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { page } from "vitest/browser";
import MissionEditor from "pages/admin/mission";
import { generateBlankMission } from "store/storeUtils/mission";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

let mission: Mission;
const listeners = new Set<() => void>();
const changeMission = vi.fn((update: (doc: Mission) => void) => {
  mission = structuredClone(mission);
  update(mission);
  listeners.forEach((listener) => listener());
});

vi.mock("@automerge/automerge-repo-react-hooks", () => ({
  useDocument: () => [
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => mission
    ),
    changeMission,
  ],
}));
vi.mock("utils/useAppSelector", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAppSelector: (): null => null,
}));
vi.mock("components/admin/fileManager", () => ({ default: (): null => null }));
vi.mock("components/admin/projection", () => ({ default: (): null => null }));
vi.mock("components/admin/gridUpload", () => ({ default: (): null => null }));
vi.mock("http-client/mission", () => ({
  getMissionDems: async (): Promise<MissionDem[]> => [],
  updateMissionFields: vi.fn(),
}));
vi.mock("packages/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

let harness: ReactHarness;

function renderEditor() {
  harness.render(
    <MemoryRouter initialEntries={["/admin/mission/42/test-doc"]}>
      <Routes>
        <Route path="/admin/mission/:id/:automergeUrl" element={<MissionEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mission = generateBlankMission({ id: 42, planet: "earth" });
  changeMission.mockClear();
  harness = createReactHarness();
});

afterEach(() => harness.unmount());

describe("mission admin grid settings", () => {
  it("switches Earth labels and derives the reference system without persisting it", async () => {
    renderEditor();
    await page.getByRole("radio", { name: "MGRS", exact: true }).click();
    await expect.element(page.getByRole("radio", { name: "MGRS", exact: true })).toBeChecked();
    expect(mission.earthGridLabelScheme).toBe("mgrs");
    expect(mission).not.toHaveProperty("gridSystem");
    expect(mission).not.toHaveProperty("usingLGRSCoordinates");
    await page.getByRole("radio", { name: "ACC (lunar-style letters)" }).click();
    expect(mission.earthGridLabelScheme).toBe("lunar-acc");
    expect(harness.container.querySelector('input[name="gridRenderMode"]')).toBeNull();
  });

  it("preserves the Earth preference through lunar and Mars selections", async () => {
    mission.earthGridLabelScheme = "mgrs";
    mission.planet = "moon";
    renderEditor();
    expect(harness.container.textContent).toContain("across the whole Moon");
    await expect
      .element(page.getByRole("radio", { name: "MGRS", exact: true }))
      .not.toBeInTheDocument();
    changeMission((doc) => {
      doc.planet = "mars";
    });
    await vi.waitFor(() =>
      expect(harness.container.textContent).toContain("No dynamic grid is available for Mars")
    );
    changeMission((doc) => {
      doc.planet = "earth";
    });
    await expect.element(page.getByRole("radio", { name: "MGRS", exact: true })).toBeChecked();
  });

  it("explains invalid projections without writing mission fields on load", () => {
    mission.projIsCustom = true;
    mission.projEpsg = "INVALID";
    mission.projProj4String = "+proj=invalid";
    renderEditor();
    expect(harness.container.textContent).toContain("proj4 can parse");
    expect(changeMission).not.toHaveBeenCalled();
  });
});
