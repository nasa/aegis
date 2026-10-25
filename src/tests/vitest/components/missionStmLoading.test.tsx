import { act } from "react";
import { createRoot } from "react-dom/client";
import MissionSTM from "components/admin/missionSTM";
import { generateBlankMission } from "store/storeUtils/mission";

const hooks = vi.hoisted(() => ({
  useDocHandle: vi.fn(),
  useDocSelector: vi.fn(),
}));

vi.mock("@automerge/automerge-repo-react-hooks", () => ({
  useDocHandle: hooks.useDocHandle,
}));
vi.mock("@automerge/automerge-repo", () => ({
  isValidAutomergeUrl: () => true,
}));
vi.mock("utils/useDocSelector", () => ({ useDocSelector: hooks.useDocSelector }));
vi.mock("http-client/docListing", () => ({
  getAutomergeDocListing: async () => ({ data: [{ automergeUrl: "automerge:loading-stm" }] }),
}));
vi.mock("components/admin/stmEdit", () => ({
  default: ({ changeMission }: { changeMission: (update: (m: Mission) => void) => void }) => (
    <button onClick={() => changeMission((m) => (m.stmLevel1Name = "Imported"))}>Import STM</button>
  ),
}));

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

it("offers STM mutations only after the mission handle and tree have loaded", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const mission = generateBlankMission();
  const change = vi.fn((update: (m: Mission) => void) => update(mission));
  hooks.useDocHandle.mockReturnValue(undefined);
  hooks.useDocSelector.mockReturnValue(undefined);
  try {
    await act(async () => root.render(<MissionSTM missionId={1} />));
    expect(container.querySelector("button")).toBeNull();

    hooks.useDocHandle.mockReturnValue({ change });
    await act(async () => root.render(<MissionSTM missionId={1} />));
    expect(container.querySelector("button")).toBeNull();

    hooks.useDocSelector.mockReturnValue({ level1s: [], level2s: [], level3s: [] });
    await act(async () => root.render(<MissionSTM missionId={1} />));
    const importButton = container.querySelector("button");
    expect(importButton?.textContent).toBe("Import STM");
    await act(async () => importButton!.click());
    expect(change).toHaveBeenCalledTimes(1);
    expect(mission.stmLevel1Name).toBe("Imported");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
