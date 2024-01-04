// Testing file: file.tsx - using jest
import { describe } from "@jest/globals";
import { deleteFile, listFiles, renameFile } from "server/file/file";
import * as fs from "fs";
import * as path from "path";

const OLD_ENV = process.env;
const staticDir = path.join(__dirname, "../../public/static/test");

const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

beforeEach(async () => {
  process.env = { ...OLD_ENV };
  jest.resetModules();
  jest.clearAllMocks(); // clear call count
});

afterAll(async () => {
  process.env = OLD_ENV;
  fs.unlinkSync(path.join(staticDir, "test2.txt"));
  fs.rmdirSync(path.join(__dirname, "../../public/static/test/test2"));
  fs.rmdirSync(path.join(__dirname, "../../public/static/test"));

  jest.restoreAllMocks();
});

describe("File API Endpoint", () => {
  // Rename a file in the public/static directory
  test("File Rename: Success", async () => {
    await fs.promises.mkdir(staticDir, { recursive: true }).catch(console.error);
    const testFile = path.join(staticDir, "test.txt");
    fs.writeFileSync(testFile, "test");
    const fileRenamed = await renameFile("test", "test.txt", "test2.txt");
    expect(fileRenamed).toBe(true);
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });

  test("File Rename: Failure", async () => {
    // No path means no file to rename
    const fileRenamed = await renameFile("", "test.txt", "test2.txt");
    expect(fileRenamed).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  test("List Files: Success", async () => {
    const files = await listFiles("test");
    expect(files).toEqual([
      {
        fileCount: 1,
        isDir: false,
        name: "test2.txt",
      },
    ]);
  });

  test("List Files: Directory", async () => {
    // Make a second directory
    const staticDir2 = path.join(__dirname, "../../public/static/test/test2");
    await fs.promises.mkdir(staticDir2, { recursive: true }).catch(console.error);

    const files = await listFiles("test");
    expect(files).toEqual([
      {
        fileCount: 0,
        isDir: true,
        name: "test2",
      },
      {
        fileCount: 1,
        isDir: false,
        name: "test2.txt",
      },
    ]);
  });

  test("List Files: Failure", async () => {
    const files = await listFiles("http://google.com");
    expect(files).toEqual(null);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  test("Delete File: Success", async () => {
    const testFile = path.join(staticDir, "test.txt");
    fs.writeFileSync(testFile, "test");
    const fileDeleted = await deleteFile("test/test.txt");
    expect(fileDeleted).toBe(true);
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });

  test("Delete File: Failure", async () => {
    const fileDeleted = await deleteFile(path.join(staticDir, "obiwan.txt"));
    expect(fileDeleted).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
