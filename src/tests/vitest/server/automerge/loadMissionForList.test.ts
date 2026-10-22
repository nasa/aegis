import { setImmediate } from "node:timers/promises";
import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo/slim";
import { loadMissionForList } from "server/automerge/loadMissionForList";

describe("mission list load queue", () => {
  it("yields before loading and serializes callers through document readiness", async () => {
    let releaseFirst: () => void;
    const ready = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = { id: 1 } as Mission;
    const second = { id: 2 } as Mission;
    const find = vi
      .fn()
      .mockResolvedValueOnce({ whenReady: () => ready, doc: () => first })
      .mockResolvedValueOnce({
        whenReady: async (): Promise<void> => undefined,
        doc: () => second,
      });
    const repo = { find } as unknown as Repo;
    const firstLoad = loadMissionForList(repo, "automerge:first" as AutomergeUrl);
    const secondLoad = loadMissionForList(repo, "automerge:second" as AutomergeUrl);
    expect(find).not.toHaveBeenCalled();
    await setImmediate();
    await setImmediate();
    expect(find).toHaveBeenCalledTimes(1);
    releaseFirst();
    expect(await firstLoad).toBe(first);
    expect(await secondLoad).toBe(second);
    expect(find.mock.calls.map(([url]) => url)).toEqual(["automerge:first", "automerge:second"]);
  });

  it.each(["find", "readiness"])("recovers after a %s failure", async (phase) => {
    const error = new Error("Document unavailable");
    const mission = { id: 2 } as Mission;
    const find = vi.fn();
    if (phase === "find") find.mockRejectedValueOnce(error);
    else
      find.mockResolvedValueOnce({
        whenReady: async () => {
          throw error;
        },
      });
    find.mockResolvedValueOnce({
      whenReady: async (): Promise<void> => undefined,
      doc: () => mission,
    } as unknown as DocHandle<Mission>);
    const repo = { find } as unknown as Repo;
    const failure = expect(
      loadMissionForList(repo, "automerge:bad" as AutomergeUrl)
    ).rejects.toThrow("Document unavailable");
    const next = loadMissionForList(repo, "automerge:good" as AutomergeUrl);
    await failure;
    expect(await next).toBe(mission);
  });
});
