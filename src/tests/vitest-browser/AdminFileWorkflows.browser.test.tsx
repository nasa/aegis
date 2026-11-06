import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { MemoryRouter } from "react-router";
import FileManager from "components/admin/fileManager";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

let harness: ReactHarness;
let respond: BrowserRequestHandler;
let unexpected: string[];
const directory = "missionFiles/1/Data";

beforeEach(() => {
  harness = createReactHarness();
  unexpected = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    if (url.pathname === "/api/v1/auth/isLoggedIn") {
      return Response.json({ status: "success", data: { isAdmin: true } });
    }
    return respond(url, init ?? {});
  });
});

afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(unexpected, "Every file workflow request has an explicit fixture").toEqual([]);
});

function unexpectedRequest(url: URL): Response {
  unexpected.push(url.pathname);
  throw new Error(`Unexpected file workflow request: ${url}`);
}

function renderFiles() {
  harness.render(
    <MemoryRouter>
      <FileManager missionId={1} path={directory} zipOnly={false} />
    </MemoryRouter>
  );
}

test("Box browsing decodes streamed byte progress, clears provider failures on retry and refreshes the completed file listing", async () => {
  const zip = { id: "fixture-file-42", type: "file", name: "Survey bundle.zip", size: 4 };
  let attempts = 0;
  let directoryReads = 0;
  let completed = false;
  let finishDownload: (() => void) | undefined;
  respond = (url) => {
    expect(url.searchParams.get("missionId")).toBe("1");
    if (url.pathname === "/api/v1/file/boxGetFolderItems") {
      const entries =
        url.searchParams.get("itemId") === "0"
          ? [
              {
                id: "fixture-folder-9",
                type: "folder",
                name: "Fixtures",
                sequence_id: "1",
                etag: "1",
              },
            ]
          : [zip];
      return Response.json({ data: { entries, total_count: entries.length } });
    }
    if (url.pathname === "/api/v1/file/list") {
      expect(url.searchParams.get("path")).toBe(directory);
      directoryReads++;
      return Response.json({
        data: completed ? [{ name: zip.name, isDir: false, fileCount: 1, size: zip.size }] : [],
      });
    }
    if (url.pathname === "/api/v1/file/boxDownloadFile") {
      expect(url.searchParams.get("itemId")).toBe(zip.id);
      expect(url.searchParams.get("path")).toBe(directory);
      attempts++;
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: object) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            send({ type: "progress", stage: "starting" });
            send({
              type: "progress",
              stage: "downloading",
              fileName: zip.name,
              bytesDownloaded: 2,
              totalBytes: 4,
            });
            if (attempts === 1) {
              send({ status: "error", message: "Fixture permission denied" });
              controller.close();
            } else {
              finishDownload = () => {
                completed = true;
                send({ type: "progress", stage: "complete", fileName: zip.name });
                send({
                  status: "success",
                  message: "File downloaded and processed",
                  data: { success: true },
                });
                controller.close();
              };
            }
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson" } }
      );
    }
    return unexpectedRequest(url);
  };
  renderFiles();
  await expect
    .element(page.getByRole("heading", { name: "Download from Box", exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("Fixtures", { exact: true })).toBeVisible();
  await page.getByText("Fixtures", { exact: true }).click();
  await expect.element(page.getByText("Survey bundle.zip (4 B) -", { exact: false })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: zip.name });
  await row.getByText("Download", { exact: true }).click();
  await expect.element(row.getByRole("alert")).toHaveTextContent("Fixture permission denied");
  expect(directoryReads).toBe(1);
  await row.getByText("Download", { exact: true }).click();
  const progress = row.getByRole("progressbar", { name: "Box download progress" });
  await expect.element(progress).toHaveAttribute("value", "50");
  await expect.element(row.getByText("Downloading 50%", { exact: true })).toBeVisible();
  await expect.poll(() => row.getByRole("alert").length).toBe(0);
  await expect.poll(() => row.getByText("Download", { exact: true }).length).toBe(0);
  expect(attempts).toBe(2);
  finishDownload!();
  await expect.poll(() => progress.length).toBe(0);
  await expect.poll(() => row.getByRole("alert").length).toBe(0);
  await expect.poll(() => page.getByRole("row").filter({ hasText: zip.name }).length).toBe(1);
  expect(directoryReads).toBe(2);
});

test("file listing sorts by name, size and count while canceled rename and deletion drafts make no write requests", async () => {
  const files: GISfile[] = [
    { name: "delta.geojson", size: 4, fileCount: 0, isDir: false },
    { name: "bravo.geojson", size: 1, fileCount: 1, isDir: false },
    { name: "charlie.geojson", size: 4, fileCount: 2, isDir: false },
    { name: "alpha.geojson", size: 10, fileCount: 2, isDir: false },
  ];
  const reads = vi.fn();
  respond = (url, init) => {
    expect(init.method ?? "GET").toBe("GET");
    if (url.pathname === "/api/v1/file/list") {
      expect(url.searchParams.get("path")).toBe(directory);
      reads();
      return Response.json({ data: files });
    }
    if (url.pathname === "/api/v1/file/boxGetFolderItems") {
      return Response.json({ data: { entries: [], total_count: 0 } });
    }
    return unexpectedRequest(url);
  };
  renderFiles();
  const names = () =>
    Array.from(document.querySelectorAll("tbody tr td:nth-child(4)"), (node) => node.textContent);
  await expect
    .poll(names)
    .toEqual(["alpha.geojson", "bravo.geojson", "charlie.geojson", "delta.geojson"]);
  const sort = page.getByLabelText("Sort files by", { exact: false });
  await sort.selectOptions("size");
  await expect
    .poll(names)
    .toEqual(["bravo.geojson", "charlie.geojson", "delta.geojson", "alpha.geojson"]);
  await sort.selectOptions("count");
  await expect
    .poll(names)
    .toEqual(["delta.geojson", "bravo.geojson", "alpha.geojson", "charlie.geojson"]);
  await sort.selectOptions("name");
  const row = page.getByRole("row").filter({ hasText: "alpha.geojson" });
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  await row.getByTitle("New Name").fill("Discarded name.geojson");
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(() => row.getByTitle("New Name").length).toBe(0);
  await expect
    .poll(names)
    .toEqual(["alpha.geojson", "bravo.geojson", "charlie.geojson", "delta.geojson"]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith("Are you sure you want to delete alpha.geojson");
  await expect.element(row.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  expect(reads).toHaveBeenCalledOnce();
  await expect
    .poll(names)
    .toEqual(["alpha.geojson", "bravo.geojson", "charlie.geojson", "delta.geojson"]);
});
