import { deleteFile, listFiles, renameFile, uploadFile } from "http-client/file";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({ default: { post } }));

const fetchMock = vi.fn();

beforeEach(() => {
  window.sessionStorage.setItem("missionId", "999");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock
    .mockReset()
    .mockResolvedValue({ status: 200, json: async () => ({ data: [] as GISfile[] }) });
  post.mockReset().mockResolvedValue({ status: 201 });
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

test("file listing and mutations use the path's mission instead of stale session storage", async () => {
  await listFiles("missionFiles/777/Layers");
  await renameFile("missionFiles/777/Layers", "before.txt", "after.txt");
  await deleteFile("missionFiles/777/Layers/after.txt");

  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [url] of fetchMock.mock.calls) {
    expect(new URL(url, "http://localhost").searchParams.get("missionId")).toBe("777");
  }
});

test("uploads use the form destination's mission when visiting admin directly", async () => {
  window.sessionStorage.removeItem("missionId");
  const form = new FormData();
  form.append("path", "missionFiles/777/Layers");
  form.append("uploadFile", new File(["asset"], "asset.txt"));

  await uploadFile(form, new AbortController());

  expect(post).toHaveBeenCalledWith("/api/v1/file/upload?missionId=777", form, expect.any(Object));
});
