// Testing file: file.tsx - using jest
import { describe } from "@jest/globals";
import { deleteFile, listFiles, renameFile } from "server/file/file";

const fs = require("fs");
const path = require("path");

describe("File API Endpoint", () => {
  const OLD_ENV = process.env;
  const staticDir = path.join(__dirname, "../../../public/static/test");

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  // Rename a file in the public/static directory
  test("File Rename: Success", async () => {
    const clg = jest.spyOn(console, "log").mockImplementation(() => {});

    await fs.promises.mkdir(staticDir, { recursive: true }).catch(console.error);
    const testFile = path.join(staticDir, "test.txt");
    await fs.writeFileSync(testFile, "test");
    const fileRenamed = await renameFile("test", "test.txt", "test2.txt");
    expect(fileRenamed).toBe(true);
    expect(clg).toBeCalledTimes(1);

    clg.mockReset();
  });

  test("File Rename: Failure", async () => {
    // No path means no file to rename
    const clg = jest.spyOn(console, "error").mockImplementation(() => {});

    const fileRenamed = await renameFile("", "test.txt", "test2.txt");
    expect(fileRenamed).toBe(false);
    expect(clg).toBeCalledTimes(1);

    clg.mockReset();
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
    const staticDir2 = path.join(__dirname, "../../../public/static/test/test2");
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
    const clg = jest.spyOn(console, "error").mockImplementation(() => {});

    const files = await listFiles("http://google.com");
    expect(files).toEqual(null);
    expect(clg).toBeCalledTimes(1);

    clg.mockReset();
  });

  test("Delete File: Success", async () => {
    const clg = jest.spyOn(console, "log").mockImplementation(() => {});

    const testFile = path.join(staticDir, "test.txt");
    await fs.writeFileSync(testFile, "test");
    const fileDeleted = await deleteFile("test/test.txt");
    expect(fileDeleted).toBe(true);
    expect(clg).toBeCalledTimes(1);

    clg.mockReset();
  });

  test("Delete File: Failure", async () => {
    const clg = jest.spyOn(console, "error").mockImplementation(() => {});

    const fileDeleted = await deleteFile(path.join(staticDir, "obiwan.txt"));
    expect(fileDeleted).toBe(false);
    expect(clg).toBeCalledTimes(1);

    clg.mockReset();
  });

  afterAll(async () => {
    process.env = OLD_ENV;
    await fs.unlinkSync(path.join(staticDir, "test2.txt"));
    await fs.rmdirSync(path.join(__dirname, "../../../public/static/test/test2"));
    await fs.rmdirSync(path.join(__dirname, "../../../public/static/test"));

    jest.resetAllMocks();
  });
});
