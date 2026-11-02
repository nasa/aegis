import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { page } from "vitest/browser";
import { generateAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import MissionRulesImportExport from "components/admin/missionRulesImportExport";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStmLvl3, generateBlankStmRule } from "store/storeUtils/stm";
import { exportStmRules } from "utils/stmRulesImportExport";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

vi.mock("@automerge/automerge-repo-react-hooks", () => ({ useDocument: vi.fn() }));

const url = generateAutomergeUrl();
let harness: ReactHarness;
let mission: Mission;
let changeMission: Mock<(update: (doc: Mission) => void) => void>;
let paint: FrameRequestCallback;

beforeEach(() => {
  mission = generateBlankMission({ id: 42 });
  const level = generateBlankStmLvl3();
  const rule = generateBlankStmRule({ stmUuid: level.uuid });
  mission.stmLevel3s = { [level.uuid]: level };
  mission.stmRules = { [rule.uuid]: rule };
  changeMission = vi.fn((update: (doc: Mission) => void) => update(mission));
  vi.mocked(useDocument).mockReturnValue([mission, changeMission]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    paint = callback;
    return 1;
  });
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
  vi.restoreAllMocks();
});

function render() {
  harness.render(<MissionRulesImportExport automergeUrl={url} />);
}

function selectFile(file: File) {
  const input = harness.container.querySelector<HTMLInputElement>('input[type="file"]');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function expectDisabled(disabled: boolean) {
  const controls = harness.container.querySelectorAll<
    HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
  >("button, input, textarea");
  await vi.waitFor(() => {
    for (const control of controls) expect(control.disabled).toBe(disabled);
  });
}

describe("mission rules admin feedback", () => {
  it("shows document loading without displaying a false zero count", async () => {
    vi.mocked(useDocument).mockReturnValue([undefined, changeMission]);
    render();
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading mission rules...");
    await expectDisabled(true);
    expect(harness.container.textContent).not.toContain("0 rules");
    vi.mocked(useDocument).mockReturnValue([mission, changeMission]);
    render();
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expect.element(page.getByText("1 rules", { exact: true })).toBeInTheDocument();
  });

  it("locks the form while reading a file and recovers from a failed read", async () => {
    render();
    await page.getByRole("textbox", { name: "Mission rules JSON" }).fill("old input");
    let rejectRead: (cause: Error) => void;
    const file = new File([""], "rules.json");
    vi.spyOn(file, "text").mockReturnValueOnce(
      new Promise<string>((_, reject) => {
        rejectRead = reject;
      })
    );
    selectFile(file);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Reading mission rules file...");
    await expectDisabled(true);
    rejectRead(new Error("Read failed"));
    await expect.element(page.getByRole("alert")).toHaveTextContent("Read failed");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    await expect
      .element(page.getByRole("button", { name: "Import Mission Rules", exact: true }))
      .toBeDisabled();

    let resolveRead: (value: string) => void;
    vi.spyOn(file, "text").mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      })
    );
    selectFile(file);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(page.getByRole("status")).toBeInTheDocument();
    const json = exportStmRules(mission);
    resolveRead(json);
    await expect.element(page.getByRole("textbox")).toHaveValue(json);
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expectDisabled(false);
    expect(changeMission).not.toHaveBeenCalled();
  });

  it("shows import progress before replacing rules and clears it on success", async () => {
    render();
    await page.getByRole("textbox").fill('{"version":1,"stmRules":[]}');
    await page.getByRole("button", { name: "Import Mission Rules", exact: true }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Importing mission rules...");
    await expectDisabled(true);
    expect(changeMission).not.toHaveBeenCalled();
    paint(0);
    await expect.element(page.getByRole("status")).toHaveTextContent("Imported 0 mission rules.");
    expect(changeMission).toHaveBeenCalledOnce();
    expect(mission.stmRules).toEqual({});
    expect(useDocument).toHaveBeenCalledWith(url);
    await expect.element(page.getByRole("textbox")).toHaveValue("");
    await expect.element(page.getByRole("textbox")).toBeEnabled();
  });

  it("preserves input on validation failure and cancellation so importing can be retried", async () => {
    render();
    await page.getByRole("textbox").fill('{"version":2,"stmRules":[]}');
    await page.getByRole("button", { name: "Import Mission Rules", exact: true }).click();
    paint(0);
    await expect.element(page.getByRole("alert")).toHaveTextContent("Expected a version 1 export");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expectDisabled(false);
    expect(changeMission).not.toHaveBeenCalled();

    const json = exportStmRules(mission);
    await page.getByRole("textbox").fill(json);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await page.getByRole("button", { name: "Import Mission Rules", exact: true }).click();
    paint(0);
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expectDisabled(false);
    await expect.element(page.getByRole("textbox")).toHaveValue(json);
    expect(changeMission).not.toHaveBeenCalled();
  });

  it("clears progress after a document change fails and permits retrying", async () => {
    changeMission.mockImplementationOnce(() => {
      throw new Error("Document unavailable");
    });
    render();
    const json = exportStmRules(mission);
    await page.getByRole("textbox").fill(json);
    await page.getByRole("button", { name: "Import Mission Rules", exact: true }).click();
    paint(0);
    await expect.element(page.getByRole("alert")).toHaveTextContent("Document unavailable");
    await expect.element(page.getByRole("textbox")).toHaveValue(json);
    await expectDisabled(false);
    await page.getByRole("button", { name: "Import Mission Rules", exact: true }).click();
    paint(0);
    await expect.element(page.getByRole("status")).toHaveTextContent("Imported 1 mission rules.");
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "cleans up the download and clears export progress (failure: %s)",
    async (fail) => {
      const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
        if (fail) throw new Error("Download failed");
      });
      const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rules-export");
      const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      render();
      await page.getByRole("button", { name: "Export Mission Rules to JSON" }).click();
      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Exporting mission rules...");
      await expectDisabled(true);
      expect(download).not.toHaveBeenCalled();
      paint(0);
      await expect.element(page.getByRole("status")).not.toBeInTheDocument();
      if (fail) await expect.element(page.getByRole("alert")).toHaveTextContent("Download failed");
      else await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
      expect(download).toHaveBeenCalledOnce();
      expect(revokeUrl).toHaveBeenCalledWith("blob:rules-export");
      expect(document.querySelector('a[href="blob:rules-export"]')).toBeNull();
      const blob = createUrl.mock.calls[0][0] as Blob;
      expect(JSON.parse(await blob.text())).toMatchObject({ missionId: 42, version: 1 });
      await expect
        .element(page.getByRole("button", { name: "Export Mission Rules to JSON" }))
        .toBeEnabled();
      expect(changeMission).not.toHaveBeenCalled();
    }
  );
});
