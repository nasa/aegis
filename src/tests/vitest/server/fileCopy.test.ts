import { EventEmitter } from "node:events";
import type * as ChildProcess from "node:child_process";
import type * as FileSystem from "fs";

const { spawn, existsSync } = vi.hoisted(() => ({ spawn: vi.fn(), existsSync: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  return { ...actual, spawn, default: { ...actual, spawn } };
});
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, existsSync, default: { ...actual, existsSync } };
});
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { copyDirectoryContents } from "server/file/file";

beforeEach(() => {
  vi.clearAllMocks();
  existsSync.mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

function copyCommandExitsWith(code: number) {
  spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", code));
    return child;
  });
}

test("does not leave unread child output pipes that can stall a large copy", async () => {
  copyCommandExitsWith(0);
  await expect(copyDirectoryContents(50, 51)).resolves.toBeUndefined();
  expect(spawn).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    expect.objectContaining({ stdio: "ignore" })
  );
});

test("propagates a failed system copy so duplication cannot report success", async () => {
  copyCommandExitsWith(8);
  await expect(copyDirectoryContents(50, 51)).rejects.toThrow("exited with code 8");
});

test("propagates failure to start the system copy command", async () => {
  spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("Command unavailable")));
    return child;
  });
  await expect(copyDirectoryContents(50, 51)).rejects.toThrow("Command unavailable");
});

test("missions with no assets do not invoke a copy command", async () => {
  existsSync.mockReturnValue(false);
  await expect(copyDirectoryContents(50, 51)).resolves.toBeUndefined();
  expect(spawn).not.toHaveBeenCalled();
});
