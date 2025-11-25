// Testing file: file.tsx - using jest
import { describe } from "@jest/globals";
import { deleteFile, listFiles, renameFile, unzip, moveFile } from "server/file/file";
import * as fs from "fs";
import * as path from "path";

const staticTestDir = `${process.env.STATIC_DIR}/jestTest`;

jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});

beforeAll(async () => {
  //create test directory
  await fs.promises.mkdir(staticTestDir, { recursive: true }).catch(console.error);
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(async () => {
  jest.restoreAllMocks();
  // clean up anything inside the test directory
  fs.rmSync(staticTestDir, { recursive: true, force: true });
  //last test uploaded a zip file to the root of the static directory, delete this if it still exists
  if (fs.existsSync(path.join(staticTestDir, "../testZip.zip"))) {
    fs.rmSync(path.join(staticTestDir, "../testZip.zip"));
  }
});

describe("File Functions", () => {
  describe("Rename File", () => {
    test("File Rename: Success", async () => {
      fs.writeFileSync(path.join(staticTestDir, "test.txt"), "test content");
      const fileRenamed = await renameFile("jestTest", "test.txt", "testRenamed.txt");
      expect(fileRenamed).toBe(true);
    });

    test("File Rename: Failure", async () => {
      const fileRenamed = await renameFile("doesNotExist", "test.txt", "test2.txt");
      expect(fileRenamed).toBe(false);
    });
  });

  describe("List Files", () => {
    test("List Files: Success", async () => {
      const files = await listFiles("jestTest");
      expect(files).toEqual([
        {
          fileCount: 1,
          isDir: false,
          name: "testRenamed.txt",
          size: 12,
        },
      ]);
    });

    test("List Files with a Directory", async () => {
      // Make a second directory
      const staticTestDir2 = `${process.env.STATIC_DIR}/jestTest/testDir`;
      await fs.promises.mkdir(staticTestDir2, { recursive: true }).catch(console.error);

      const files = await listFiles("jestTest");
      expect(files).toEqual([
        {
          fileCount: 0,
          isDir: true,
          name: "testDir",
          size: 0,
        },
        {
          fileCount: 1,
          isDir: false,
          name: "testRenamed.txt",
          size: 12,
        },
      ]);
    });

    test("List Files: Failure", async () => {
      const files = await listFiles("badPathDoesNotExist");
      expect(files).toEqual(null);
    });
  });

  describe("Delete File", () => {
    test("Delete File: Success", async () => {
      const testFile = path.join(staticTestDir, "testDeleteMe.txt");
      fs.writeFileSync(testFile, "test");
      const fileDeleted = await deleteFile("jestTest/testDeleteMe.txt");
      expect(fileDeleted).toBe(true);
    });

    test("Delete File: Failure", async () => {
      const fileDeleted = await deleteFile(path.join(staticTestDir, "doesNotExist.txt"));
      expect(fileDeleted).toBe(false);
    });
  });

  describe("Unzip File", () => {
    test("Unzip File: Success", async () => {
      const testZipFile = path.join(__dirname, `./factories/testZip.zip`);
      fs.copyFileSync(testZipFile, path.join(staticTestDir, "../testUnzip.zip"));

      await unzip("testUnzip.zip", "jestTest", "testUnzipContents");
      expect(fs.existsSync(path.join(staticTestDir, "../testUnzip.zip"))).toBe(false);
      expect(fs.existsSync(path.join(staticTestDir, "/testUnzipContents/testFile.txt"))).toBe(true);
    });

    test("Unzip File: Failure zip file doesn't exist", async () => {
      await expect(
        unzip("testZipDoesNotExist.zip", "jestTest", "testZipContentsDoesNotExist")
      ).rejects.toThrow();
      expect(fs.existsSync(path.join(staticTestDir, "/testZipContentsDoesNotExist/"))).toBe(false);
    });
  });

  describe("Move File", () => {
    test("Move File: Success", async () => {
      const testZipFile = path.join(__dirname, `./factories/testZip.zip`);

      const src = path.join(staticTestDir, "../testUnzip.zip");
      const dst = path.join(staticTestDir, "testUnzipContents", "testUnzip.zip");

      fs.copyFileSync(testZipFile, src);

      expect(fs.existsSync(dst)).toBe(false);
      await moveFile("testUnzip.zip", "jestTest", "testUnzipContents");
      expect(fs.existsSync(dst)).toBe(true);
      expect(fs.existsSync(src)).toBe(false);

      const deletedFile = await deleteFile("jestTest/testUnzipContents/testUnzip.zip");
      expect(deletedFile).toBe(true);
    });

    test("Unzip File: Failure zip file doesn't exist", async () => {
      await expect(
        moveFile("testZipDoesNotExist.zip", "jestTest", "testZipContentsDoesNotExist")
      ).rejects.toThrow();

      const dst = path.join(
        staticTestDir,
        "testZipContentsDoesNotExist",
        "testZipDoesNotExist.zip"
      );

      expect(fs.existsSync(dst)).toBe(false);
    });
  });
});
