import express from "express";
import supertest from "supertest";

const { em, sourceHandle, copiedHandle, copyAssets, createMission, authorized } = vi.hoisted(
  () => ({
    em: {
      begin: vi.fn(),
      findOne: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
    },
    sourceHandle: { whenReady: vi.fn(), doc: vi.fn() },
    copiedHandle: { whenReady: vi.fn(), doc: vi.fn(), change: vi.fn() },
    copyAssets: vi.fn(),
    createMission: vi.fn(),
    authorized: vi.fn(),
  })
);

vi.mock("server/express/global", () => ({
  globalValues: {
    orm: { em },
    automergeRepo: {
      find: (url: string) => (url === "automerge:source" ? sourceHandle : copiedHandle),
    },
  },
}));
vi.mock("server/express/routes/missionAutomerge", () => ({
  createAutomergeMission: createMission,
}));
vi.mock("server/file/file", () => ({ copyDirectoryContents: copyAssets }));
vi.mock("utils/permissions", () => ({ emssTokenIsValid: authorized }));
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { apiRoute: vi.fn(), info: vi.fn() },
}));

import router from "server/express/routes/missionDup";

const app = express();
app.use(express.json());
app.use("/missionDup", router);

beforeEach(() => {
  vi.clearAllMocks();
  authorized.mockReturnValue(true);
  em.findOne.mockResolvedValue({ automergeUrl: "automerge:source" });
  sourceHandle.doc.mockReturnValue({ id: 50, name: "Source mission" });
  copiedHandle.doc.mockReturnValue({ id: 51 });
  createMission.mockResolvedValue({ automergeUrl: "automerge:copy" });
  copyAssets.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

test("sends progress and heartbeats while GIS copying is still running", async () => {
  let finishCopy: () => void;
  copyAssets.mockImplementationOnce(() => new Promise<void>((resolve) => (finishCopy = resolve)));
  const intervals = vi.spyOn(globalThis, "setInterval");
  const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
  const events: (MissionDuplicationProgress | WrappedResponse<number>)[] = [];
  const request = supertest(app)
    .post("/missionDup")
    .set("Accept", "application/x-ndjson")
    .send({ missionId: 50 })
    .buffer(true)
    .parse((res, callback) => {
      let buffered = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        lines.forEach((line) => events.push(JSON.parse(line)));
      });
      res.on("end", () => callback(null, events));
    })
    .then((res) => res);

  try {
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ message: "Copying GIS files..." }));
    });
    expect(em.commit).not.toHaveBeenCalled();
    expect(events.some((event) => "status" in event)).toBe(false);
    expect(intervals).toHaveBeenCalledWith(expect.any(Function), 10_000);
    const tick = intervals.mock.calls[0][0] as () => void;
    tick();
    await vi.waitFor(() => {
      expect(events.filter((event) => event.message === "Copying GIS files...")).toHaveLength(2);
    });
  } finally {
    finishCopy?.();
    await request;
  }

  expect(events.at(-1)).toMatchObject({ status: "success", data: 51 });
  expect(em.commit).toHaveBeenCalledOnce();
  expect(copyAssets).toHaveBeenCalledWith(50, 51);
  expect(clearIntervalSpy).toHaveBeenCalledWith(intervals.mock.results[0].value);
});

test("streams copy errors and rolls back instead of reporting success", async () => {
  copyAssets.mockRejectedValueOnce(new Error("Disk full"));
  const res = await supertest(app)
    .post("/missionDup")
    .set("Accept", "application/x-ndjson")
    .send({ missionId: 50 });
  const events = res.text
    .trim()
    .split("\n")
    .map((line: string) => JSON.parse(line));

  expect(events.at(-1)).toMatchObject({
    status: "error",
    message: expect.stringContaining("Disk full"),
  });
  expect(em.rollback).toHaveBeenCalledOnce();
  expect(em.commit).not.toHaveBeenCalled();
});

test("continues the copy and commits if the client disconnects", async () => {
  let finishCopy: () => void;
  copyAssets.mockImplementationOnce(() => new Promise<void>((resolve) => (finishCopy = resolve)));
  const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
  const request = supertest(app)
    .post("/missionDup")
    .set("Accept", "application/x-ndjson")
    .send({ missionId: 50 });
  const result = request.then(
    (): void => undefined,
    (): void => undefined
  );

  try {
    await vi.waitFor(() => expect(copyAssets).toHaveBeenCalledOnce());
    request.abort();
    await result;
    await vi.waitFor(() => expect(clearIntervalSpy).toHaveBeenCalled());
    expect(em.commit).not.toHaveBeenCalled();
  } finally {
    finishCopy?.();
  }

  await vi.waitFor(() => expect(em.commit).toHaveBeenCalledOnce());
  expect(em.rollback).not.toHaveBeenCalled();
});

test("preserves JSON responses for clients that do not request a stream", async () => {
  const res = await supertest(app).post("/missionDup").send({ missionId: 50 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: "success", data: 51 });
});

test("preserves HTTP errors for JSON clients", async () => {
  copyAssets.mockRejectedValueOnce(new Error("Disk full"));
  const res = await supertest(app).post("/missionDup").send({ missionId: 50 });
  expect(res.status).toBe(500);
  expect(res.body.status).toBe("error");
});

test("rejects unauthorized requests before starting the stream or copying", async () => {
  authorized.mockReturnValue(false);
  const res = await supertest(app)
    .post("/missionDup")
    .set("Accept", "application/x-ndjson")
    .send({ missionId: 50 });
  expect(res.status).toBe(401);
  expect(em.begin).not.toHaveBeenCalled();
});

test.each([undefined, null, true, [], [50], "50junk", "", 0, -1, 1.5])(
  "rejects invalid mission ID %j before starting duplication",
  async (missionId) => {
    const res = await supertest(app)
      .post("/missionDup")
      .set("Accept", "application/x-ndjson")
      .send({ missionId });
    expect(res.status).toBe(400);
    expect(em.begin).not.toHaveBeenCalled();
  }
);
