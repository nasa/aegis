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
  mission = generateBlankMission({ id: 42, planetRadius: 6378137 });
  changeMission.mockClear();
  harness = createReactHarness();
});

afterEach(() => harness.unmount());

describe("mission admin grid settings", () => {
  it("switches Earth labels without changing the grid source or restoring a setup button", async () => {
    renderEditor();
    await expect.element(page.getByRole("radio", { name: "Server File" })).toBeChecked();
    await expect
      .element(page.getByRole("radio", { name: "MGRS", exact: true }))
      .not.toBeInTheDocument();
    await page.getByRole("radio", { name: "Dynamic Grid" }).click();
    await page.getByRole("radio", { name: "MGRS", exact: true }).click();
    await expect.element(page.getByRole("radio", { name: "MGRS", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "ACC (lunar-style letters)" }).click();
    await expect.element(page.getByRole("radio", { name: "Dynamic Grid" })).toBeChecked();
    expect(mission.gridSystem).toBe("earth-wgs84");
    expect(mission.earthGridLabelScheme).toBe("lunar-acc");
    expect(mission.usingLGRSCoordinates).toBe(true);
    expect(harness.container.querySelector('input[name="gridSystem"]')).toBeNull();
    await expect.element(page.getByRole("button", { name: /Enable MGRS/ })).not.toBeInTheDocument();

    await page.getByRole("radio", { name: "Server File" }).click();
    expect(mission.usingLGRSCoordinates).toBe(false);
    await expect
      .element(page.getByRole("radio", { name: "MGRS", exact: true }))
      .not.toBeInTheDocument();
    await page.getByRole("radio", { name: "Dynamic Grid" }).click();
    await expect
      .element(page.getByRole("radio", { name: "ACC (lunar-style letters)" }))
      .toBeChecked();
  });

  it("follows radius changes and preserves the Earth label preference across a lunar mission", async () => {
    mission.gridRenderMode = "dynamic-lgrs";
    mission.usingLGRSCoordinates = true;
    mission.earthGridLabelScheme = "mgrs";
    renderEditor();
    await page.getByLabelText("Planet Radius", { exact: true }).fill("1737400");
    await vi.waitFor(() => expect(mission.gridSystem).toBe("moon-m2025"));
    await expect
      .element(page.getByRole("radio", { name: "MGRS", exact: true }))
      .not.toBeInTheDocument();
    expect(harness.container.textContent).toContain("Labels use lunar ACC coordinates.");
    await page.getByLabelText("Planet Radius", { exact: true }).fill("6371000");
    await vi.waitFor(() => expect(mission.gridSystem).toBe("earth-wgs84"));
    await expect.element(page.getByRole("radio", { name: "MGRS", exact: true })).toBeChecked();
  });

  it("aligns stale grid settings with the radius and server-file source once on load", async () => {
    mission.gridSystem = "moon-m2025";
    mission.usingLGRSCoordinates = true;
    renderEditor();
    await vi.waitFor(() => {
      expect(mission.gridSystem).toBe("earth-wgs84");
      expect(mission.usingLGRSCoordinates).toBe(false);
    });
    expect(changeMission).toHaveBeenCalledTimes(1);
    expect(harness.container.querySelector('input[name="gridSystem"]')).toBeNull();
  });

  it("blocks dynamic rendering when the map projection is invalid", async () => {
    mission.projIsCustom = true;
    mission.projEpsg = "INVALID";
    mission.projProj4String = "+proj=invalid";
    renderEditor();
    await expect.element(page.getByRole("radio", { name: "Dynamic Grid" })).toBeDisabled();
    await expect.element(page.getByRole("radio", { name: "Server File" })).toBeChecked();
    expect(changeMission).not.toHaveBeenCalled();
  });
});
