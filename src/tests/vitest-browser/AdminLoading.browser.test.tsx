import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { page } from "vitest/browser";
import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus, type AsyncTaskStatus } from "components/admin/useAsyncStatus";
import FileManager from "components/admin/fileManager";
import Layers from "components/admin/layers";
import User from "pages/admin/user";
import { generateBlankAppUser } from "store/storeUtils/appUser";
import { isLoggedIn } from "http-client/login";
import { getAppUsers } from "http-client/appUser";
import { listFiles, deleteFile } from "http-client/file";
import { getLayers, upsertLayers } from "http-client/layer";
import { getSublayers } from "http-client/sublayer";
import { getAutomergeDocListing } from "http-client/docListing";
import { useAdminMission } from "components/admin/useAdminMission";
import { generateAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

vi.mock("http-client/login", () => ({
  isLoggedIn: vi.fn(async () => ({ status: "success", data: { isAdmin: true } })),
}));
vi.mock("http-client/file", () => ({
  listFiles: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
}));
vi.mock("http-client/layer", () => ({
  getLayers: vi.fn(),
  deleteLayers: vi.fn(),
  upsertLayers: vi.fn(),
}));
vi.mock("http-client/appUser", () => ({
  getAppUsers: vi.fn(),
  upsertAppUsers: vi.fn(),
  deleteAppUsers: vi.fn(),
}));
vi.mock("http-client/sublayer", () => ({ getSublayers: vi.fn(), deleteSublayers: vi.fn() }));
vi.mock("components/admin/uploadFile", () => ({ default: (): null => null }));
vi.mock("components/admin/downloadFromBox", () => ({ default: (): null => null }));
vi.mock("components/admin/layerSublayerEdit", () => ({ default: (): null => null }));
vi.mock("http-client/docListing", () => ({ getAutomergeDocListing: vi.fn() }));
vi.mock("@automerge/automerge-repo-react-hooks", () => {
  const repo = { find: vi.fn() };
  return { useDocument: vi.fn(() => [undefined]), useRepo: vi.fn(() => repo) };
});

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let harness: ReactHarness;
beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();
});
afterEach(() => {
  harness.unmount();
  vi.restoreAllMocks();
});

describe("admin request feedback", () => {
  it("keeps a status visible until every concurrent task finishes", async () => {
    let status: AsyncTaskStatus;
    function Tasks() {
      status = useAsyncStatus();
      return <AsyncStatus {...status} />;
    }
    harness.render(<Tasks />);
    const first = deferred<void>();
    const second = deferred<void>();
    const firstRun = status.run("Loading mission...", () => first.promise);
    const secondRun = status.run("Loading layers...", () => second.promise);
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading layers...");
    second.resolve();
    await secondRun;
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading mission...");
    first.resolve();
    await firstRun;
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });

  it("clears pending feedback on failure and clears errors when retrying", async () => {
    let status: AsyncTaskStatus;
    function Tasks() {
      status = useAsyncStatus();
      return <AsyncStatus {...status} />;
    }
    harness.render(<Tasks />);
    const failure = deferred<void>();
    const failedRun = status.run("Loading mission...", () => failure.promise);
    await expect.element(page.getByRole("status")).toBeInTheDocument();
    failure.reject(new Error("Connection lost"));
    await failedRun;
    await expect.element(page.getByRole("alert")).toHaveTextContent("Connection lost");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    const retry = deferred<void>();
    const retryRun = status.run("Retrying...", () => retry.promise);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(page.getByRole("status")).toHaveTextContent("Retrying...");
    retry.resolve();
    await retryRun;
  });
});

describe("admin directory loading", () => {
  function renderFiles() {
    harness.render(
      <MemoryRouter>
        <FileManager missionId={1} path="missionFiles/1/Data" zipOnly={false} />
      </MemoryRouter>
    );
  }

  it("distinguishes initial loading, an empty directory, and refresh failure", async () => {
    const listing = deferred<GISfile[]>();
    vi.mocked(listFiles).mockReturnValueOnce(listing.promise);
    renderFiles();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Loading directory listing...");
    expect(harness.container.textContent).not.toContain("No files");
    await expect.element(page.getByRole("button", { name: "Refresh", exact: true })).toBeDisabled();
    listing.resolve([]);
    await expect.element(page.getByText("No files", { exact: true })).toBeInTheDocument();

    const refresh = deferred<GISfile[]>();
    vi.mocked(listFiles).mockReturnValueOnce(refresh.promise);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Loading directory listing...");
    expect(harness.container.textContent).not.toContain("No files");
    refresh.reject(new Error("Directory unavailable"));
    await expect.element(page.getByRole("alert")).toHaveTextContent("Directory unavailable");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  });

  it("shows deletion feedback and prevents resubmission through the listing refresh", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce([
      { name: "terrain.tif", isDir: false, fileCount: 1, size: 100 } as GISfile,
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const deletion = deferred<Response>();
    vi.mocked(deleteFile).mockReturnValueOnce(deletion.promise);
    renderFiles();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Deleting file...");
    await expect.element(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    const refresh = deferred<GISfile[]>();
    vi.mocked(listFiles).mockReturnValueOnce(refresh.promise);
    deletion.resolve(new Response(JSON.stringify("Deleted"), { status: 200 }));
    await vi.waitFor(() => expect(listFiles).toHaveBeenCalledTimes(2));
    await expect.element(page.getByRole("button", { name: "Refresh", exact: true })).toBeDisabled();
    refresh.resolve([]);
    await expect.element(page.getByText("No files", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });
});

describe("admin layer loading", () => {
  it("clears a failed save when cancelling and opening another layer editor", async () => {
    vi.mocked(listFiles).mockResolvedValue([]);
    vi.mocked(getLayers).mockResolvedValue({ status: "success", data: [], message: "" });
    vi.mocked(getSublayers).mockResolvedValue({ status: "success", data: [], message: "" });
    vi.mocked(upsertLayers).mockResolvedValue({ status: "error", message: "Layer save failed" });
    harness.render(
      <MemoryRouter>
        <Layers missionId={1} />
      </MemoryRouter>
    );
    await page.getByRole("button", { name: "Add New Header Layer" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Layer save failed");
    await expect.element(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Add New Header Layer" }).click();
    await expect
      .element(page.getByRole("heading", { name: "Add Header Layer" }))
      .toBeInTheDocument();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    expect(upsertLayers).toHaveBeenCalledTimes(1);
  });

  it("waits for layers and sublayers before reporting an empty list", async () => {
    vi.mocked(listFiles).mockResolvedValue([]);
    const layers = deferred<WrappedResponse<Layer[]>>();
    const sublayers = deferred<WrappedResponse<Sublayer[]>>();
    vi.mocked(getLayers).mockReturnValueOnce(layers.promise);
    vi.mocked(getSublayers).mockReturnValueOnce(sublayers.promise);
    harness.render(
      <MemoryRouter>
        <Layers missionId={1} />
      </MemoryRouter>
    );
    await expect.element(page.getByText("Loading layers and sublayers...")).toBeInTheDocument();
    expect(harness.container.textContent).not.toContain("No Layers Found");
    layers.resolve({ status: "success", data: [], message: "" });
    await expect.element(page.getByText("Loading layers and sublayers...")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Add New Header Layer" })).toBeDisabled();
    sublayers.resolve({ status: "success", data: [], message: "" });
    await expect.element(page.getByText("No Layers Found")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Add New Header Layer" })).toBeEnabled();
  });

  it("shows a failed layer request without displaying a false empty state", async () => {
    vi.mocked(listFiles).mockResolvedValue([]);
    vi.mocked(getLayers).mockResolvedValueOnce({
      status: "error",
      message: "Layers unavailable",
      data: null,
    });
    vi.mocked(getSublayers).mockResolvedValueOnce({ status: "success", data: [], message: "" });
    harness.render(
      <MemoryRouter>
        <Layers missionId={1} />
      </MemoryRouter>
    );
    await expect.element(page.getByRole("alert")).toHaveTextContent("Layers unavailable");
    expect(harness.container.textContent).not.toContain("No Layers Found");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });
});

describe("admin user dialogs", () => {
  it("clears validation errors when cancelling creation and editing an existing user", async () => {
    const user = generateBlankAppUser({ id: 3, username: "Existing User", password: "password" });
    vi.mocked(isLoggedIn).mockResolvedValueOnce({
      status: "success",
      data: generateBlankAppUser({ isSuperAdmin: true }),
      message: "",
    });
    vi.mocked(getAppUsers).mockResolvedValue({ status: "success", data: [user], message: "" });
    vi.mocked(getAutomergeDocListing).mockResolvedValueOnce({
      status: "success",
      data: [],
      message: "",
    });
    harness.render(
      <MemoryRouter>
        <User />
      </MemoryRouter>
    );
    await page.getByRole("button", { name: "+ Add User", exact: true }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await vi.waitFor(() =>
      expect(harness.container.textContent).toContain(
        "Username and password must be at least 3 characters long"
      )
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect
      .element(page.getByLabelText("Username", { exact: true }))
      .toHaveValue(user.username);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });
});

describe("admin mission document loading", () => {
  function MissionName() {
    const mission = useAdminMission(1);
    return (
      <>
        <AsyncStatus {...mission} />
        <span>{mission.mission?.name}</span>
      </>
    );
  }

  it("keeps loading visible between resolving the mission record and synchronizing its document", async () => {
    const record = deferred<WrappedResponse<AutomergeDocListing[]>>();
    vi.mocked(getAutomergeDocListing).mockReturnValueOnce(record.promise);
    vi.mocked(useDocument).mockReturnValue([undefined, vi.fn()]);
    harness.render(<MissionName />);
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading mission");
    const url = generateAutomergeUrl();
    record.resolve({
      status: "success",
      message: "",
      data: [{ missionId: 1, automergeUrl: url } as AutomergeDocListing],
    });
    await vi.waitFor(() => expect(useDocument).toHaveBeenCalledWith(url));
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading mission");
    vi.mocked(useDocument).mockReturnValue([{ id: 1, name: "Lunar Mission" } as Mission, vi.fn()]);
    harness.render(<MissionName />);
    await expect.element(page.getByText("Lunar Mission")).toBeInTheDocument();
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });

  it("replaces loading feedback with an error when the mission record is missing", async () => {
    vi.mocked(useDocument).mockReturnValue([undefined, vi.fn()]);
    vi.mocked(getAutomergeDocListing).mockResolvedValueOnce({
      status: "success",
      message: "",
      data: [],
    });
    harness.render(<MissionName />);
    await expect.element(page.getByRole("alert")).toHaveTextContent("Mission record not found");
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  });
});
